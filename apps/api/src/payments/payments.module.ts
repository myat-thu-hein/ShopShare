import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Injectable,
  InternalServerErrorException,
  Logger,
  Module,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';
import { StripeService } from './stripe.service';
import { CurrentUser, Public, type JwtUser } from '../common/decorators';
import { SkipThrottle } from '@nestjs/throttler';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly stripe: StripeService,
  ) {}

  /** Creates PENDING orders from the cart, then a Stripe Checkout session (or a mock checkout). */
  async checkout(user: JwtUser): Promise<{ url: string; group: string; mode: 'stripe' | 'mock' }> {
    const { group, orders, expiresAt } = await this.orders.createPendingOrders(user.sub);

    if (!this.stripe.enabled) {
      return { url: `/checkout/success?group=${group}&mock=1`, group, mode: 'mock' };
    }
    try {
      const session = await this.stripe.createCheckoutSession({
        group,
        orderIds: orders.map((o) => o.id),
        email: user.email,
        expiresAt,
        lines: orders.flatMap((o) =>
          o.items.map((i) => ({
            title: i.variantLabel ? `${i.title} (${i.variantLabel})` : i.title,
            unitPrice: i.unitPrice,
            quantity: i.quantity,
            imageUrl: i.imageUrl,
          })),
        ),
      });
      await this.orders.attachStripeSession(group, session.id);
      return { url: session.url!, group, mode: 'stripe' };
    } catch (e) {
      // Never leave stock reserved for a checkout that could not start.
      await this.orders.cancelGroupPending(group);
      this.logger.error(`Stripe session failed: ${(e as Error).message}`);
      throw new InternalServerErrorException('Could not start payment. Please try again.');
    }
  }

  /** Mock mode only: the success page confirms the payment. */
  async confirmMock(user: JwtUser, group: string) {
    if (this.stripe.enabled)
      throw new BadRequestException('Mock payments are disabled because Stripe is configured');
    const owned = await this.prisma.order.count({ where: { checkoutGroup: group, buyerId: user.sub } });
    if (!owned) throw new NotFoundException('Checkout not found');
    await this.orders.markGroupPaid(group, { provider: 'mock', reference: `mock_${group}` });
    return this.orders.byGroup(user.sub, group);
  }

  /**
   * Stripe webhook. Two safety nets:
   *  1. Signature verification — rejects anything not signed with STRIPE_WEBHOOK_SECRET.
   *  2. Idempotency — the event id is inserted into webhook_events first; a duplicate
   *     delivery hits the primary key and is acknowledged without doing the work twice.
   */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!rawBody || !signature) throw new BadRequestException('Missing Stripe signature');
    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(rawBody, signature);
    } catch (e) {
      throw new BadRequestException(`Webhook signature verification failed: ${(e as Error).message}`);
    }

    try {
      await this.prisma.webhookEvent.create({ data: { id: event.id, type: event.type } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { received: true, duplicate: true };
      }
      throw e;
    }

    try {
      await this.process(event);
      return { received: true };
    } catch (e) {
      // Remove the marker so Stripe's retry gets processed.
      await this.prisma.webhookEvent.delete({ where: { id: event.id } }).catch(() => undefined);
      this.logger.error(`Webhook ${event.type} failed: ${(e as Error).message}`);
      throw new InternalServerErrorException('Webhook processing failed');
    }
  }

  async process(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== 'paid') return; // async methods (e.g. PromptPay) finish later
        const group = session.metadata?.checkoutGroup ?? session.client_reference_id;
        if (!group) return;
        const paymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : (session.payment_intent?.id ?? null);
        const s = session as any;
        const shippingDetails = s.collected_information?.shipping_details ?? s.shipping_details ?? null;
        const shipping = shippingDetails
          ? {
              name: shippingDetails.name,
              ...shippingDetails.address,
              email: session.customer_details?.email ?? null,
            }
          : null;
        const { updated } = await this.orders.markGroupPaid(group, {
          provider: 'stripe',
          reference: session.id,
          paymentIntentId,
          shipping,
        });
        if (updated === 0 && paymentIntentId) {
          const cancelled = await this.prisma.order.findMany({
            where: { checkoutGroup: group, status: 'CANCELLED' },
          });
          if (cancelled.length) {
            // Paid after the reservation was released: refund instead of overselling.
            const amount = cancelled.reduce((sum, o) => sum + o.total, 0);
            this.logger.warn(`Checkout ${group} paid after cancellation — refunding ${amount} satang`);
            await this.stripe.refund(paymentIntentId, amount);
          }
        }
        return;
      }
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const group = session.metadata?.checkoutGroup ?? session.client_reference_id;
        if (group) await this.orders.cancelGroupPending(group);
        return;
      }
      default:
        return; // ignore other events
    }
  }
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('checkout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create orders from the cart and return the Stripe Checkout URL' })
  checkout(@CurrentUser() user: JwtUser) {
    return this.payments.checkout(user);
  }

  @Post('mock/:group/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mock payment confirmation (only when Stripe is not configured)' })
  confirmMock(@CurrentUser() user: JwtUser, @Param('group') group: string) {
    return this.payments.confirmMock(user, group);
  }

  @Public()
  @SkipThrottle()
  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    return this.payments.handleWebhook(req.rawBody, signature);
  }
}

@Module({ imports: [OrdersModule], controllers: [PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
