/**
 * Seeds a complete demo marketplace:
 *  - demo buyer, seller and admin (one-click login on the web app)
 *  - 4 approved sellers + 1 pending seller (for the admin approval flow)
 *  - 6 categories, 60 products with variants and images
 *  - past orders, verified-purchase reviews and product views (so dashboards and
 *    recommendations have data from the first click)
 *  - product embeddings for AI search
 *
 * WARNING: wipes existing data. Run: pnpm db:seed
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient, type OrderStatus } from '@prisma/client';
import Redis from 'ioredis';
import { PrismaPg } from '@prisma/adapter-pg';
import { slugify } from '@shopsense/shared';
import { envSchema } from '../src/config/env';
import { Embedder } from '../src/ai/embedding.service';
import { indexProductEmbeddings } from '../src/ai/embedding-indexer';
import {
  REVIEW_TEMPLATES,
  SEED_CATEGORIES,
  SEED_PRODUCTS,
  SEED_SELLERS,
  photoUrls,
  thumbnailUrl,
} from './seed-data';

const envFile = join(__dirname, '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = envSchema
  .pick({
    DATABASE_URL: true,
    EMBEDDING_PROVIDER: true,
    EMBEDDING_MODEL: true,
    EMBEDDING_API_KEY: true,
    EMBEDDING_BASE_URL: true,
    OPENAI_API_KEY: true,
    OPENAI_BASE_URL: true,
    LLM_TIMEOUT_MS: true,
    REDIS_URL: true,
  })
  .parse(process.env);

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

export const DEMO_PASSWORD = 'Demo1234!';

/** Small deterministic random generator so every seed run produces the same data. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(42);
const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000 - between(0, 86_000_000));
let orderSeq = 1000;
const orderNumber = (date: Date) =>
  `SS-${date.toISOString().slice(2, 10).replace(/-/g, '')}-${(orderSeq++).toString(36).toUpperCase()}`;

async function main() {
  if (process.argv.includes('--if-empty') && (await prisma.product.count()) > 0) {
    console.log('Database already has data — skipping seed (--if-empty).');
    return;
  }
  console.log('🌱 Seeding ShopShare…');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE webhook_events, payments, order_items, orders, cart_items, carts, reviews, wishlists,
      product_views, product_embeddings, product_images, product_variants, products, categories,
      seller_profiles, users RESTART IDENTITY CASCADE`);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ------------------------------------------------------------------ users
  const admin = await prisma.user.create({
    data: { email: 'admin@shopsense.dev', name: 'Ada Admin', role: 'ADMIN', passwordHash, isDemo: true },
  });
  const buyer = await prisma.user.create({
    data: {
      email: 'buyer@shopsense.dev',
      name: 'Ploy Demo Buyer',
      role: 'BUYER',
      passwordHash,
      isDemo: true,
    },
  });

  const sellers: { id: string }[] = [];
  for (const [i, s] of SEED_SELLERS.entries()) {
    const user = await prisma.user.create({
      data: {
        email: s.email,
        name: s.name,
        role: 'SELLER',
        passwordHash,
        isDemo: i === 0,
        sellerProfile: {
          create: {
            storeName: s.storeName,
            slug: slugify(s.storeName),
            description: s.description,
            status: 'APPROVED',
          },
        },
      },
    });
    sellers.push(user);
  }
  await prisma.user.create({
    data: {
      email: 'pim@shopsense.dev',
      name: 'Pim Rattana',
      role: 'SELLER',
      passwordHash,
      sellerProfile: {
        create: {
          storeName: 'Krabi Crafts',
          slug: 'krabi-crafts',
          description: 'Handmade beach bags and sarongs.',
          status: 'PENDING',
        },
      },
    },
  });

  const reviewerNames = [
    'Kittisak P.',
    'Nattaya S.',
    'Thanawat K.',
    'Siriporn M.',
    'Chaiwat L.',
    'Wipada T.',
    'Anan J.',
    'Benjamas R.',
  ];
  const reviewers: { id: string }[] = [];
  for (const [i, name] of reviewerNames.entries()) {
    reviewers.push(
      await prisma.user.create({
        data: {
          email: `customer${i + 1}@shopsense.dev`,
          name,
          role: 'BUYER',
          passwordHash,
          createdAt: daysAgo(between(20, 90)),
        },
      }),
    );
  }

  // ------------------------------------------------------------- categories
  const categories = new Map<string, string>();
  for (const { photo, ...c } of SEED_CATEGORIES) {
    const row = await prisma.category.create({ data: { ...c, imageUrl: thumbnailUrl(photo) } });
    categories.set(c.slug, row.id);
  }

  // --------------------------------------------------------------- products
  const products: {
    id: string;
    price: number;
    sellerId: string;
    title: string;
    image: string;
    variantIds: string[];
  }[] = [];
  for (const [index, p] of SEED_PRODUCTS.entries()) {
    const colours: (string | null)[] = p.colours?.length ? p.colours : [null];
    const sizes: (string | null)[] = p.sizes?.length ? p.sizes : [null];
    const variants = colours.flatMap((colour, ci) =>
      sizes.map((size, si) => ({
        colour,
        size,
        sku: `${slugify(p.title).slice(0, 12).toUpperCase()}-${ci}${si}`,
        // A couple of variants are deliberately low on stock to show low-stock alerts.
        stock: index % 9 === 0 && ci === 0 && si === 0 ? 2 : between(3, 25),
        position: ci * 10 + si,
      })),
    );
    const hasVariants = !!(p.colours?.length || p.sizes?.length);
    const totalStock = hasVariants
      ? variants.reduce((s, v) => s + v.stock, 0)
      : index % 9 === 0
        ? 3
        : between(8, 60);
    const images = photoUrls(p);
    const created = await prisma.product.create({
      data: {
        title: p.title,
        slug: slugify(p.title),
        description: p.description,
        price: p.price * 100,
        compareAtPrice: p.was ? p.was * 100 : null,
        brand: p.brand ?? null,
        stock: totalStock,
        status: 'PUBLISHED',
        tags: p.tags,
        categoryId: categories.get(p.category)!,
        sellerId: sellers[p.seller].id,
        createdAt: daysAgo(between(5, 120)),
        images: {
          create: images.map((url, position) => ({
            url,
            alt: position === 0 ? p.title : `${p.title}, photo ${position + 1}`,
            position,
          })),
        },
        variants: hasVariants ? { create: variants } : undefined,
      },
      include: { variants: true },
    });
    products.push({
      id: created.id,
      price: created.price,
      sellerId: created.sellerId,
      title: created.title,
      image: images[0],
      variantIds: created.variants.map((v) => v.id),
    });
  }

  // A draft product so the seller dashboard shows the draft/publish flow.
  await prisma.product.create({
    data: {
      title: 'Trail Runner Pro (coming soon)',
      slug: 'trail-runner-pro-coming-soon',
      description: 'Our next trail running shoe. Still in testing, so it is not visible to buyers yet.',
      price: 349000,
      stock: 10,
      status: 'DRAFT',
      tags: ['running', 'racing'],
      categoryId: categories.get('shoes')!,
      sellerId: sellers[0].id,
      images: {
        create: [
          {
            url: photoUrls({ photo: 'mens-shoes/puma-future-rider-trainers', photos: 1 })[0],
            alt: 'Trail Runner Pro',
            position: 0,
          },
        ],
      },
    },
  });

  // ----------------------------------------------------- orders and reviews
  const reviewed = new Set<string>();
  const sales = new Map<string, number>();

  /** Mirrors real checkout: one order per seller, sharing a checkout group. */
  async function createOrder(buyerId: string, items: typeof products, status: OrderStatus, createdAt: Date) {
    const group = randomUUID();
    const bySeller = new Map<string, typeof products>();
    for (const p of items) bySeller.set(p.sellerId, [...(bySeller.get(p.sellerId) ?? []), p]);
    for (const sellerItems of bySeller.values()) {
      const lines = sellerItems.map((p) => ({ p, quantity: between(1, 2) }));
      const total = lines.reduce((s, l) => s + l.p.price * l.quantity, 0);
      const paid = status !== 'PENDING' && status !== 'CANCELLED';
      await prisma.order.create({
        data: {
          number: orderNumber(createdAt),
          checkoutGroup: group,
          buyerId,
          status,
          subtotal: total,
          total,
          createdAt,
          paidAt: paid ? createdAt : null,
          shippedAt:
            status === 'SHIPPED' || status === 'DELIVERED'
              ? new Date(createdAt.getTime() + 86_400_000)
              : null,
          deliveredAt: status === 'DELIVERED' ? new Date(createdAt.getTime() + 3 * 86_400_000) : null,
          trackingNumber:
            status === 'SHIPPED' || status === 'DELIVERED' ? `TH${between(100000000, 999999999)}` : null,
          shippingAddress: {
            name: 'Demo Customer',
            line1: '123 Sukhumvit Rd',
            city: 'Bangkok',
            postal_code: '10110',
            country: 'TH',
          },
          items: {
            create: lines.map((l) => ({
              productId: l.p.id,
              variantId: l.p.variantIds[0] ?? null,
              sellerId: l.p.sellerId,
              title: l.p.title,
              imageUrl: l.p.image,
              unitPrice: l.p.price,
              quantity: l.quantity,
            })),
          },
          payments: paid
            ? {
                create: {
                  provider: 'seed',
                  providerRef: `seed_${randomUUID()}`,
                  amount: total,
                  status: 'succeeded',
                  createdAt,
                },
              }
            : undefined,
        },
      });
      if (paid) for (const l of lines) sales.set(l.p.id, (sales.get(l.p.id) ?? 0) + l.quantity);
    }
  }

  for (const reviewer of reviewers) {
    const orderCount = between(3, 6);
    for (let o = 0; o < orderCount; o++) {
      const items = Array.from({ length: between(1, 3) }, () => pick(products));
      const unique = [...new Map(items.map((i) => [i.id, i])).values()];
      const created = daysAgo(between(1, 30));
      const status: OrderStatus = pick(['DELIVERED', 'DELIVERED', 'DELIVERED', 'SHIPPED', 'PAID']);
      await createOrder(reviewer.id, unique, status, created);
      if (status === 'DELIVERED') {
        for (const item of unique) {
          const key = `${reviewer.id}:${item.id}`;
          if (reviewed.has(key) || rand() < 0.25) continue;
          reviewed.add(key);
          const [rating, title, comment] = pick(REVIEW_TEMPLATES);
          await prisma.review.create({
            data: {
              productId: item.id,
              userId: reviewer.id,
              rating,
              title,
              comment,
              createdAt: new Date(created.getTime() + 4 * 86_400_000),
            },
          });
        }
      }
    }
  }

  // Make sure the hero products have plenty of reviews for the AI summary demo.
  const heroTitles = [
    'Sports Sneakers Off White & Red',
    'Apple MacBook Pro 14 Inch Space Grey',
    'Calvin Klein CK One',
  ];
  for (const title of heroTitles) {
    const product = products.find((p) => p.title === title)!;
    for (const [i, reviewer] of reviewers.entries()) {
      const key = `${reviewer.id}:${product.id}`;
      if (reviewed.has(key)) continue;
      const created = daysAgo(between(5, 25));
      await createOrder(reviewer.id, [product], 'DELIVERED', created);
      reviewed.add(key);
      const [rating, rtitle, comment] = REVIEW_TEMPLATES[i % REVIEW_TEMPLATES.length];
      await prisma.review.create({
        data: { productId: product.id, userId: reviewer.id, rating, title: rtitle, comment },
      });
    }
  }

  // Demo buyer: a delivered order (can review), a shipped one, and a paid one.
  const byTitle = (t: string) => products.find((p) => p.title === t)!;
  await createOrder(
    buyer.id,
    [byTitle('Man Short Sleeve Shirt'), byTitle('Black Sun Glasses')],
    'DELIVERED',
    daysAgo(12),
  );
  await createOrder(buyer.id, [byTitle('Apple Watch Series 4 Gold')], 'SHIPPED', daysAgo(3));
  await createOrder(buyer.id, [byTitle('Tennis Racket')], 'PAID', daysAgo(1));

  // Recent orders for the demo seller so the revenue chart has a shape.
  const demoSellerProducts = products.filter((p) => p.sellerId === sellers[0].id);
  for (let d = 0; d < 30; d++) {
    if (rand() < 0.45) continue;
    await createOrder(
      pick(reviewers).id,
      [pick(demoSellerProducts)],
      d < 3 ? 'PAID' : 'DELIVERED',
      daysAgo(d),
    );
  }

  // -------------------------------------------------- views (recommendations)
  const viewed = [
    'Sports Sneakers Off White & Red',
    'Puma Future Rider Trainers',
    'Beats Flex Wireless Earphones',
    'Apple Watch Series 4 Gold',
    'Tennis Racket',
  ];
  for (const [i, title] of viewed.entries()) {
    await prisma.productView.create({
      data: { userId: buyer.id, productId: byTitle(title).id, createdAt: daysAgo(i) },
    });
  }
  for (let i = 0; i < 400; i++) {
    const p = pick(products);
    await prisma.productView.create({
      data: {
        productId: p.id,
        userId: rand() < 0.5 ? pick(reviewers).id : null,
        createdAt: daysAgo(between(0, 14)),
      },
    });
  }
  await prisma.wishlist.create({
    data: { userId: buyer.id, productId: byTitle('Nike Air Jordan 1 Red And Black').id },
  });
  await prisma.wishlist.create({
    data: { userId: buyer.id, productId: byTitle('Apple AirPods Max Silver').id },
  });

  // ----------------------------------------------- denormalised product stats
  await prisma.$executeRawUnsafe(`
    UPDATE products p SET
      rating_avg = COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 2) FROM reviews r WHERE r.product_id = p.id), 0),
      rating_count = (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id),
      view_count = (SELECT COUNT(*) FROM product_views v WHERE v.product_id = p.id)`);
  // "x sold" counters: real seeded sales plus a historical baseline so the shop looks lived-in.
  for (const p of products) {
    const baseline = Math.floor(Math.pow(rand(), 2.2) * 3000) + between(5, 60);
    await prisma.product.update({
      where: { id: p.id },
      data: { salesCount: (sales.get(p.id) ?? 0) + baseline },
    });
  }

  // ------------------------------------------------------------ embeddings
  const embedder = new Embedder(env);
  console.log(`🧠 Computing product embeddings with ${embedder.model}…`);
  const { indexed } = await indexProductEmbeddings(prisma, embedder);

  await clearCaches();

  const counts = {
    users: await prisma.user.count(),
    products: await prisma.product.count(),
    orders: await prisma.order.count(),
    reviews: await prisma.review.count(),
    embeddings: indexed,
  };
  console.log('✅ Seed complete', counts);
  console.log(
    `\nDemo logins (password ${DEMO_PASSWORD}):\n  buyer@shopsense.dev\n  seller@shopsense.dev\n  admin@shopsense.dev`,
  );
  void admin;
}

/** Cached products/search results point at the old rows, so drop them (sessions are kept). */
async function clearCaches() {
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await redis.connect();
    const patterns = [
      'product:*',
      'products:*',
      'search:*',
      'parse:*',
      'similar:*',
      'trending*',
      'categories*',
      'store:*',
      'review-summary:*',
      'viewed:*',
    ];
    let removed = 0;
    for (const pattern of patterns) {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
        cursor = next;
        if (keys.length) removed += await redis.del(...keys);
      } while (cursor !== '0');
    }
    console.log(`🧹 Cleared ${removed} cached entries from Redis`);
  } catch {
    console.warn(
      '⚠️  Redis not reachable — skipped cache clear. Restart Redis or wait for caches to expire.',
    );
  } finally {
    redis.disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
