/**
 * Full HTTP tests against a real database. They cover the riskiest flows:
 * auth + roles, AI search, cart -> checkout -> payment, overselling under concurrency,
 * and the signed, idempotent Stripe webhook.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import Stripe from 'stripe';

const envFile = join(__dirname, '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
process.env.JWT_ACCESS_SECRET ??= 'e2e-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET ??= 'e2e-refresh-secret-0123456789';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_e2e_test_secret';
delete process.env.STRIPE_SECRET_KEY; // start in mock-payment mode
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

import { createApp } from '../src/main';
import { PrismaService } from '../src/prisma/prisma.service';
import { StripeService } from '../src/payments/stripe.service';
import { OrdersService } from '../src/orders/orders.service';

let app: INestApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;

async function loginAs(role: 'BUYER' | 'SELLER' | 'ADMIN') {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/api/auth/demo').send({ role }).expect(200);
  return agent;
}

async function newBuyer() {
  const agent = request.agent(app.getHttpServer());
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@test.dev`;
  await agent
    .post('/api/auth/register')
    .send({ name: 'E2E Buyer', email, password: 'password123' })
    .expect(201);
  return agent;
}

async function product(slug: string) {
  const res = await http.get(`/api/products/${slug}`).expect(200);
  return res.body as { id: string; variants: { id: string; stock: number }[]; price: number };
}

beforeAll(async () => {
  ({ app } = await createApp());
  await app.init();
  http = request(app.getHttpServer());
  prisma = app.get(PrismaService);
  const count = await prisma.product.count();
  if (count < 50) throw new Error('Database is not seeded. Run: pnpm db:deploy && pnpm db:seed');
});

afterAll(async () => {
  await app?.close();
});

describe('health & docs', () => {
  it('reports healthy dependencies', async () => {
    const res = await http.get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
  });

  it('serves the OpenAPI document', async () => {
    const res = await http.get('/api/docs-json').expect(200);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/api/search', '/api/payments/checkout', '/api/assistant/chat']),
    );
  });
});

describe('auth & roles', () => {
  it('rejects anonymous access to protected routes', async () => {
    await http.get('/api/cart').expect(401);
    await http.get('/api/admin/stats').expect(401);
  });

  it('enforces roles', async () => {
    const buyer = await loginAs('BUYER');
    await buyer.get('/api/admin/stats').expect(403);
    await buyer.post('/api/products').send({}).expect(403);
    const admin = await loginAs('ADMIN');
    await admin.get('/api/admin/stats').expect(200);
  });

  it('validates registration with the shared Zod schema', async () => {
    const res = await http
      .post('/api/auth/register')
      .send({ name: 'A', email: 'nope', password: '1' })
      .expect(400);
    expect(res.body.errors.map((e: { path: string }) => e.path)).toEqual(
      expect.arrayContaining(['name', 'email', 'password']),
    );
  });

  it('rotates refresh tokens and revokes on logout', async () => {
    const agent = await newBuyer();
    await agent.post('/api/auth/refresh').expect(200);
    await agent.get('/api/auth/me').expect(200);
    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/auth/me').expect(401);
  });

  it('session endpoint never 401s', async () => {
    const res = await http.get('/api/auth/session').expect(200);
    expect(res.body).toEqual({ user: null, canRefresh: false });
  });
});

describe('AI search', () => {
  it('turns a sentence into filters and respects them', async () => {
    const res = await http
      .get('/api/search')
      .query({ q: 'red running shoes under 2000 baht for wide feet' })
      .expect(200);
    expect(res.body.chips.map((c: { label: string }) => c.label)).toEqual(
      expect.arrayContaining(['Shoes', 'Red', 'Under ฿2,000']),
    );
    expect(res.body.items[0].title).toBe('Sports Sneakers Off White & Red');
    for (const item of res.body.items) expect(item.price).toBeLessThanOrEqual(200000);
  });

  it('lets the user remove a chip', async () => {
    const res = await http
      .get('/api/search')
      .query({ q: 'red running shoes under 2000 baht', ignore: 'maxPrice' })
      .expect(200);
    expect(res.body.understood.maxPrice).toBeNull();
    expect(res.body.items.some((i: { price: number }) => i.price > 200000)).toBe(true);
  });
});

describe('cart, checkout and overselling', () => {
  it('checks out with mock payments and reserves stock', async () => {
    const buyer = await newBuyer();
    const p = await product('man-short-sleeve-shirt');
    const v = p.variants[0];
    await buyer.post('/api/cart/items').send({ productId: p.id, variantId: v.id, quantity: 1 }).expect(201);
    const co = await buyer.post('/api/payments/checkout').expect(200);
    expect(co.body.mode).toBe('mock');
    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.stock).toBe(v.stock - 1);
    const paid = await buyer.post(`/api/payments/mock/${co.body.group}/confirm`).expect(200);
    expect(paid.body[0].status).toBe('PAID');
    // Idempotent: confirming twice creates no extra payment.
    await buyer.post(`/api/payments/mock/${co.body.group}/confirm`).expect(200);
    const payments = await prisma.payment.count({ where: { order: { checkoutGroup: co.body.group } } });
    expect(payments).toBe(1);
  });

  it('never sells more than the stock when buyers race', async () => {
    const p = await product('blue-black-check-shirt');
    const variantId = p.variants[0].id;
    await prisma.productVariant.update({ where: { id: variantId }, data: { stock: 2 } });
    const buyers = await Promise.all(Array.from({ length: 6 }, () => newBuyer()));
    // Fill all carts first (each sees stock 2), then everyone checks out at once.
    for (const b of buyers)
      await b.post('/api/cart/items').send({ productId: p.id, variantId, quantity: 1 }).expect(201);
    const results = await Promise.all(buyers.map((b) => b.post('/api/payments/checkout')));
    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect(v.stock).toBe(0);
  });

  it('releases stock when a pending order is cancelled', async () => {
    const buyer = await newBuyer();
    const p = await product('man-plaid-shirt');
    const v = p.variants[0];
    await buyer.post('/api/cart/items').send({ productId: p.id, variantId: v.id, quantity: 2 }).expect(201);
    const co = await buyer.post('/api/payments/checkout').expect(200);
    const orders = await buyer.get(`/api/orders/checkout/${co.body.group}`).expect(200);
    await buyer.post(`/api/orders/${orders.body[0].id}/cancel`).expect(201);
    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.stock).toBe(v.stock);
  });
});

describe('Stripe webhook', () => {
  it('verifies signatures and processes each event exactly once', async () => {
    const stripeService = app.get(StripeService);
    (stripeService as any).client = new Stripe('sk_test_e2e_dummy'); // enough for signature checks, no network
    const ordersService = app.get(OrdersService);

    const buyer = await newBuyer();
    const me = await buyer.get('/api/auth/me').expect(200);
    const p = await product('gray-dress');
    await buyer
      .post('/api/cart/items')
      .send({ productId: p.id, variantId: p.variants[0].id, quantity: 1 })
      .expect(201);
    const { group } = await ordersService.createPendingOrders(me.body.id);

    const payload = JSON.stringify({
      id: `evt_e2e_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_e2e_${Date.now()}`,
          object: 'checkout.session',
          payment_status: 'paid',
          payment_intent: 'pi_e2e',
          metadata: { checkoutGroup: group },
          client_reference_id: group,
        },
      },
    });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_e2e_test_secret' });

    await http
      .post('/api/payments/webhook')
      .set('stripe-signature', 'bad')
      .set('content-type', 'application/json')
      .send(payload)
      .expect(400);
    const first = await http
      .post('/api/payments/webhook')
      .set('stripe-signature', header)
      .set('content-type', 'application/json')
      .send(payload)
      .expect(200);
    expect(first.body).toEqual({ received: true });
    const second = await http
      .post('/api/payments/webhook')
      .set('stripe-signature', header)
      .set('content-type', 'application/json')
      .send(payload)
      .expect(200);
    expect(second.body).toEqual({ received: true, duplicate: true });

    const orders = await prisma.order.findMany({
      where: { checkoutGroup: group },
      include: { payments: true },
    });
    expect(orders.every((o) => o.status === 'PAID' && o.payments.length === 1)).toBe(true);
    (stripeService as any).client = null;
  });
});

describe('reviews, seller and assistant', () => {
  it('only lets purchasers review', async () => {
    const stranger = await newBuyer();
    const p = await product('apple-macbook-pro-14-inch-space-grey');
    await stranger
      .post(`/api/products/${p.id}/reviews`)
      .send({ rating: 5, comment: 'Never bought it' })
      .expect(403);
  });

  it('seller can create, update and see stats; AI description works without a key', async () => {
    const seller = await loginAs('SELLER');
    const cats = await http.get('/api/categories').expect(200);
    const created = await seller
      .post('/api/products')
      .send({
        title: `E2E Cap ${Date.now()}`,
        description: 'A cap made during an end-to-end test.',
        price: 29900,
        categoryId: cats.body[0].id,
        status: 'DRAFT',
        stock: 3,
      })
      .expect(201);
    await seller.patch(`/api/products/${created.body.id}`).send({ status: 'PUBLISHED' }).expect(200);
    await seller.delete(`/api/products/${created.body.id}`).expect(200);
    const stats = await seller.get('/api/seller/stats').expect(200);
    expect(stats.body.revenueByDay).toHaveLength(30);
    const ai = await seller
      .post('/api/seller/ai/description')
      .send({ title: 'Trail Cap', keywords: ['breathable'] })
      .expect(201);
    expect(ai.body.description).toContain('Trail Cap');
  });

  it('assistant answers only with real products', async () => {
    const res = await http
      .post('/api/assistant/chat')
      .send({ messages: [{ role: 'user', content: 'waterproof watch' }] })
      .expect(200);
    expect(res.body.products.length).toBeGreaterThan(0);
    for (const ref of res.body.products) {
      const dbProduct = await prisma.product.findUnique({ where: { id: ref.id } });
      expect(dbProduct?.price).toBe(ref.price);
    }
  });
});
