import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import Stripe from 'stripe';
import { ENV, type Env } from '../config/env';

export interface CheckoutLine {
  title: string;
  unitPrice: number; // satang
  quantity: number;
  imageUrl: string | null;
}

/** Wraps the Stripe SDK. When STRIPE_SECRET_KEY is missing the app runs in "mock payments" mode. */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  readonly client: Stripe | null;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.client = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
    if (!this.client)
      this.logger.warn(
        'STRIPE_SECRET_KEY not set — using mock payments (orders are confirmed on the success page).',
      );
  }

  get enabled() {
    return !!this.client;
  }

  async createCheckoutSession(opts: {
    group: string;
    orderIds: string[];
    email: string;
    lines: CheckoutLine[];
    expiresAt: Date;
  }): Promise<Stripe.Checkout.Session> {
    if (!this.client) throw new Error('Stripe is not configured');
    const absolute = (url: string | null) => {
      if (!url) return undefined;
      const full = url.startsWith('http') ? url : `${this.env.WEB_URL}${url}`;
      // Stripe can only show public HTTPS images that it can download (not SVG, not localhost).
      return full.startsWith('https://') && !full.endsWith('.svg') ? [full] : undefined;
    };
    return this.client.checkout.sessions.create({
      mode: 'payment',
      currency: 'thb',
      customer_email: opts.email,
      client_reference_id: opts.group,
      metadata: { checkoutGroup: opts.group, orderIds: opts.orderIds.join(',').slice(0, 490) },
      payment_intent_data: { metadata: { checkoutGroup: opts.group } },
      line_items: opts.lines.map((l) => ({
        quantity: l.quantity,
        price_data: {
          currency: 'thb',
          unit_amount: l.unitPrice, // satang — Stripe uses the smallest currency unit
          product_data: { name: l.title.slice(0, 250), images: absolute(l.imageUrl) },
        },
      })),
      shipping_address_collection: { allowed_countries: ['TH'] },
      // Stripe requires expires_at to be at least 30 minutes away.
      expires_at: Math.max(
        Math.floor(opts.expiresAt.getTime() / 1000),
        Math.floor(Date.now() / 1000) + 31 * 60,
      ),
      success_url: `${this.env.WEB_URL}/checkout/success?group=${opts.group}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.env.WEB_URL}/checkout/cancel?group=${opts.group}`,
    });
  }

  async expireSession(sessionId: string) {
    try {
      await this.client?.checkout.sessions.expire(sessionId);
    } catch {
      /* already completed or expired */
    }
  }

  async refund(paymentIntentId: string, amount: number): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.refunds.create({ payment_intent: paymentIntentId, amount });
      return true;
    } catch (e) {
      this.logger.error(`Refund failed for ${paymentIntentId}: ${(e as Error).message}`);
      return false;
    }
  }

  /** Verifies the Stripe-Signature header. Throws if the payload was not sent by Stripe. */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (!this.client || !this.env.STRIPE_WEBHOOK_SECRET)
      throw new Error('Stripe webhooks are not configured');
    return this.client.webhooks.constructEvent(rawBody, signature, this.env.STRIPE_WEBHOOK_SECRET);
  }
}

@Global()
@Module({ providers: [StripeService], exports: [StripeService] })
export class StripeModule {}
