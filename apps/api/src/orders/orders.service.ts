import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { OrderStatus, Prisma } from '@prisma/client';
import {
  ORDER_TRANSITIONS,
  canSellerTransition,
  canTransition,
  type OrderDto,
  type Paginated,
  type UpdateOrderStatusInput,
} from '@shopsense/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmailService } from '../email/email.service';
import { StripeService } from '../payments/stripe.service';
import { ENV, type Env } from '../config/env';
import { invalidateProductCaches } from '../common/cache-keys';
import type { JwtUser } from '../common/decorators';
import { variantLabel } from '../products/product.mapper';

const ORDER_INCLUDE = {
  items: { include: { product: { select: { slug: true } } } },
  buyer: { select: { id: true, name: true, email: true } },
} satisfies Prisma.OrderInclude;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

export function toOrderDto(o: OrderRow, opts: { sellerId?: string; includeBuyer?: boolean } = {}): OrderDto {
  const items = opts.sellerId ? o.items.filter((i) => i.sellerId === opts.sellerId) : o.items;
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    total: opts.sellerId ? items.reduce((s, i) => s + i.unitPrice * i.quantity, 0) : o.total,
    createdAt: o.createdAt.toISOString(),
    paidAt: o.paidAt?.toISOString() ?? null,
    trackingNumber: o.trackingNumber,
    shippingAddress: (o.shippingAddress as Record<string, unknown> | null) ?? null,
    items: items.map((i) => ({
      id: i.id,
      productId: i.productId ?? '',
      productSlug: i.product?.slug ?? null,
      title: i.title,
      variantLabel: i.variantLabel,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      imageUrl: i.imageUrl,
      sellerId: i.sellerId,
    })),
    buyer: opts.includeBuyer ? o.buyer : undefined,
  };
}

let seq = 0;
function orderNumber() {
  const d = new Date();
  const date = d.toISOString().slice(2, 10).replace(/-/g, '');
  const rand = (Date.now() % 1_000_000).toString(36) + (seq++ % 1296).toString(36);
  return `SS-${date}-${rand.toUpperCase()}`;
}

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersService.name);
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly email: EmailService,
    private readonly stripe: StripeService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit() {
    // Releases stock held by abandoned checkouts (Stripe also sends checkout.session.expired).
    if (this.env.NODE_ENV !== 'test') {
      this.sweeper = setInterval(() => this.cancelExpired().catch(() => undefined), 5 * 60_000);
    }
  }

  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  /* --------------------------------------------------------- checkout */

  /**
   * Turns the cart into PENDING orders (one per seller) and reserves stock.
   *
   * Overselling protection: each stock decrement is a conditional UPDATE
   * ("... SET stock = stock - 2 WHERE id = ? AND stock >= 2") inside one transaction.
   * Postgres locks the row while updating, so two buyers racing for the last item cannot
   * both succeed — the second UPDATE matches 0 rows and the whole transaction rolls back.
   */
  async createPendingOrders(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            variant: true,
            product: {
              include: {
                images: { orderBy: { position: 'asc' }, take: 1 },
                seller: { select: { isBanned: true, sellerProfile: { select: { status: true } } } },
              },
            },
          },
        },
      },
    });
    if (!cart || cart.items.length === 0) throw new BadRequestException('Your cart is empty');

    for (const item of cart.items) {
      const p = item.product;
      if (p.status !== 'PUBLISHED' || p.seller.isBanned || p.seller.sellerProfile?.status !== 'APPROVED') {
        throw new ConflictException(`"${p.title}" is no longer available. Please remove it from your cart.`);
      }
    }

    const group = randomUUID();
    const expiresAt = new Date(Date.now() + this.env.ORDER_EXPIRY_MINUTES * 60_000);
    const bySeller = new Map<string, typeof cart.items>();
    for (const item of cart.items)
      bySeller.set(item.product.sellerId, [...(bySeller.get(item.product.sellerId) ?? []), item]);

    const orders = await this.prisma.$transaction(
      async (tx) => {
        for (const item of cart.items) {
          const updated = item.variantId
            ? await tx.productVariant.updateMany({
                where: { id: item.variantId, stock: { gte: item.quantity } },
                data: { stock: { decrement: item.quantity } },
              })
            : await tx.product.updateMany({
                where: { id: item.productId, stock: { gte: item.quantity } },
                data: { stock: { decrement: item.quantity } },
              });
          if (updated.count === 0) {
            const current = item.variantId
              ? await tx.productVariant.findUnique({ where: { id: item.variantId }, select: { stock: true } })
              : await tx.product.findUnique({ where: { id: item.productId }, select: { stock: true } });
            const left = current?.stock ?? 0;
            throw new ConflictException(
              left > 0
                ? `Only ${left} of "${item.product.title}" left. Please update your cart.`
                : `"${item.product.title}" just sold out.`,
            );
          }
          if (item.variantId) {
            // Keep the product total in sync with its variants.
            await tx.$executeRaw`UPDATE products SET stock = GREATEST(stock - ${item.quantity}, 0) WHERE id = ${item.productId}`;
          }
        }

        const created = [];
        for (const items of bySeller.values()) {
          const total = items.reduce((s, i) => s + (i.variant?.price ?? i.product.price) * i.quantity, 0);
          created.push(
            await tx.order.create({
              data: {
                number: orderNumber(),
                checkoutGroup: group,
                buyerId: userId,
                status: 'PENDING',
                subtotal: total,
                total,
                expiresAt,
                items: {
                  create: items.map((i) => ({
                    productId: i.productId,
                    variantId: i.variantId,
                    sellerId: i.product.sellerId,
                    title: i.product.title,
                    variantLabel: variantLabel(i.variant),
                    imageUrl: i.product.images[0]?.url ?? null,
                    unitPrice: i.variant?.price ?? i.product.price,
                    quantity: i.quantity,
                  })),
                },
              },
              include: ORDER_INCLUDE,
            }),
          );
        }
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        return created;
      },
      { timeout: 15_000 },
    );

    await invalidateProductCaches(
      this.redis,
      cart.items.map((i) => i.product.slug),
    );
    return { group, orders, expiresAt };
  }

  async attachStripeSession(group: string, sessionId: string) {
    await this.prisma.order.updateMany({
      where: { checkoutGroup: group },
      data: { stripeSessionId: sessionId },
    });
  }

  /**
   * Marks every order in a checkout as PAID. Safe to call many times (webhook retries,
   * success page refresh): only orders still PENDING change, and the payment row has a
   * unique provider reference.
   */
  async markGroupPaid(
    group: string,
    payment: {
      provider: 'stripe' | 'mock';
      reference: string;
      paymentIntentId?: string | null;
      shipping?: Record<string, unknown> | null;
    },
  ): Promise<{ updated: number }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const pending = await tx.order.findMany({
        where: { checkoutGroup: group, status: 'PENDING' },
        include: { items: true },
      });
      if (pending.length === 0) return { updated: 0, orders: [] as typeof pending };
      const now = new Date();
      const changed = await tx.order.updateMany({
        where: { id: { in: pending.map((o) => o.id) }, status: 'PENDING' },
        data: {
          status: 'PAID',
          paidAt: now,
          expiresAt: null,
          stripePaymentIntentId: payment.paymentIntentId ?? undefined,
          shippingAddress: (payment.shipping as Prisma.InputJsonValue | undefined) ?? undefined,
        },
      });
      if (changed.count !== pending.length) throw new ConflictException('Order changed during payment');
      for (const order of pending) {
        await tx.payment.upsert({
          where: { providerRef: `${payment.reference}:${order.id}` },
          update: {},
          create: {
            orderId: order.id,
            provider: payment.provider,
            providerRef: `${payment.reference}:${order.id}`,
            amount: order.total,
            status: 'succeeded',
          },
        });
        for (const item of order.items) {
          if (item.productId)
            await tx.product.update({
              where: { id: item.productId },
              data: { salesCount: { increment: item.quantity } },
            });
        }
      }
      return { updated: pending.length, orders: pending };
    });

    if (result.updated > 0) {
      const buyer = await this.prisma.user.findUnique({ where: { id: result.orders[0].buyerId } });
      if (buyer) {
        await this.email.orderConfirmation({
          to: buyer.email,
          name: buyer.name,
          orders: result.orders.map((o) => ({ number: o.number, total: o.total, items: o.items })),
        });
      }
      await this.redis.delPattern('trending:*');
      this.logger.log(`Checkout ${group} paid (${result.updated} orders)`);
    }
    return { updated: result.updated };
  }

  /** Cancels PENDING orders in a checkout and puts their stock back. Idempotent. */
  async cancelGroupPending(group: string): Promise<number> {
    const orders = await this.prisma.order.findMany({
      where: { checkoutGroup: group, status: 'PENDING' },
      select: { id: true },
    });
    let cancelled = 0;
    for (const o of orders) if (await this.cancelAndRestock(o.id, ['PENDING'])) cancelled++;
    return cancelled;
  }

  async cancelExpired(): Promise<number> {
    const expired = await this.prisma.order.findMany({
      // 5 minute grace so a buyer finishing payment at the last second is never cancelled under them.
      where: { status: 'PENDING', expiresAt: { lt: new Date(Date.now() - 5 * 60_000) } },
      select: { checkoutGroup: true },
      distinct: ['checkoutGroup'],
      take: 100,
    });
    let n = 0;
    for (const e of expired) n += await this.cancelGroupPending(e.checkoutGroup);
    if (n) this.logger.log(`Released stock from ${n} expired orders`);
    return n;
  }

  /** Atomically flips status to CANCELLED (only from `from`) and restocks. Returns false if it was not in `from`. */
  private async cancelAndRestock(orderId: string, from: OrderStatus[]): Promise<boolean> {
    const slugs: string[] = [];
    const ok = await this.prisma.$transaction(async (tx) => {
      const flipped = await tx.order.updateMany({
        where: { id: orderId, status: { in: from } },
        data: { status: 'CANCELLED', cancelledAt: new Date(), expiresAt: null },
      });
      if (flipped.count === 0) return false;
      const items = await tx.orderItem.findMany({
        where: { orderId },
        include: { product: { select: { slug: true } } },
      });
      for (const item of items) {
        if (!item.productId) continue;
        if (item.product) slugs.push(item.product.slug);
        if (item.variantId) {
          await tx.productVariant.updateMany({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        }
        await tx.product.updateMany({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
      return true;
    });
    if (ok) await invalidateProductCaches(this.redis, slugs);
    return ok;
  }

  /* ------------------------------------------------------------ buyers */

  async listForBuyer(userId: string, page = 1, limit = 10): Promise<Paginated<OrderDto>> {
    const where = { buyerId: userId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((o) => toOrderDto(o)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getForUser(user: JwtUser, id: string): Promise<OrderDto> {
    const o = await this.prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!o) throw new NotFoundException('Order not found');
    if (user.role === 'ADMIN') return toOrderDto(o, { includeBuyer: true });
    if (o.buyerId === user.sub) return toOrderDto(o);
    if (user.role === 'SELLER' && o.items.some((i) => i.sellerId === user.sub)) {
      return toOrderDto(o, { sellerId: user.sub, includeBuyer: true });
    }
    throw new NotFoundException('Order not found');
  }

  async byGroup(userId: string, group: string): Promise<OrderDto[]> {
    const rows = await this.prisma.order.findMany({
      where: { checkoutGroup: group, buyerId: userId },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    if (!rows.length) throw new NotFoundException('Checkout not found');
    return rows.map((o) => toOrderDto(o));
  }

  async cancelByBuyer(userId: string, id: string) {
    const o = await this.prisma.order.findUnique({ where: { id } });
    if (!o || o.buyerId !== userId) throw new NotFoundException('Order not found');
    if (o.status !== 'PENDING')
      throw new ConflictException('Only unpaid orders can be cancelled. Contact the seller for paid orders.');
    if (o.stripeSessionId) await this.stripe.expireSession(o.stripeSessionId);
    await this.cancelGroupPending(o.checkoutGroup);
    return { ok: true };
  }

  /* ----------------------------------------------------------- sellers */

  async listForSeller(
    sellerId: string,
    status: OrderStatus | undefined,
    page = 1,
    limit = 20,
  ): Promise<Paginated<OrderDto>> {
    const where: Prisma.OrderWhereInput = {
      items: { some: { sellerId } },
      status: status ?? { not: 'PENDING' },
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((o) => toOrderDto(o, { sellerId, includeBuyer: true })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async updateStatus(user: JwtUser, id: string, input: UpdateOrderStatusInput): Promise<OrderDto> {
    const o = await this.prisma.order.findUnique({ where: { id }, include: { items: true, buyer: true } });
    if (!o) throw new NotFoundException('Order not found');
    const isAdmin = user.role === 'ADMIN';
    if (!isAdmin && !o.items.every((i) => i.sellerId === user.sub))
      throw new ForbiddenException('Not your order');

    const allowed = isAdmin
      ? canTransition(o.status, input.status)
      : canSellerTransition(o.status, input.status);
    if (!allowed) {
      const next = (ORDER_TRANSITIONS[o.status] ?? []).join(', ') || 'none';
      throw new BadRequestException(
        `Cannot change a ${o.status} order to ${input.status}. Allowed: ${next}.`,
      );
    }

    if (input.status === 'CANCELLED') {
      await this.cancelAndRestock(o.id, [o.status]);
      if (o.status === 'PAID' && o.stripePaymentIntentId) {
        const refunded = await this.stripe.refund(o.stripePaymentIntentId, o.total);
        if (refunded)
          await this.prisma.payment.updateMany({ where: { orderId: o.id }, data: { status: 'refunded' } });
      }
    } else {
      const now = new Date();
      const changed = await this.prisma.order.updateMany({
        where: { id, status: o.status },
        data: {
          status: input.status,
          trackingNumber: input.trackingNumber ?? undefined,
          shippedAt: input.status === 'SHIPPED' ? now : undefined,
          deliveredAt: input.status === 'DELIVERED' ? now : undefined,
        },
      });
      if (changed.count === 0)
        throw new ConflictException('Order was updated by someone else. Refresh and try again.');
      if (input.status === 'SHIPPED')
        await this.email.orderShipped(o.buyer.email, o.buyer.name, o.number, input.trackingNumber ?? null);
    }
    const fresh = await this.prisma.order.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE });
    return toOrderDto(fresh, { sellerId: isAdmin ? undefined : user.sub, includeBuyer: true });
  }
}
