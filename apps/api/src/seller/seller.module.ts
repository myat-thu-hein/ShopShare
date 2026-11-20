import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { OrderStatus } from '@prisma/client';
import {
  ORDER_STATUSES,
  generateDescriptionSchema,
  generatedDescriptionSchema,
  productQuerySchema,
  sellerProfileSchema,
  slugify,
  type GenerateDescriptionInput,
  type GeneratedDescription,
  type ProductQuery,
  type SellerProfileInput,
  type SellerStatsDto,
} from '@shopsense/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LlmService } from '../ai/llm.service';
import { ProductsModule } from '../products/products.module';
import { ProductsService } from '../products/products.service';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';
import { CacheKeys } from '../common/cache-keys';
import { CurrentUser, Public, Roles, type JwtUser } from '../common/decorators';
import { ApiZodBody, ApiZodQuery, zodPipe } from '../common/zod';
import { AiThrottle } from '../common/throttle';
import { tokenize } from '../ai/local-embedder';

const PAID_STATUSES = `('PAID','SHIPPED','DELIVERED')`;

@Injectable()
export class SellerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly llm: LlmService,
  ) {}

  async profile(userId: string) {
    const p = await this.prisma.sellerProfile.findUnique({ where: { userId } });
    if (!p) throw new NotFoundException('No seller profile');
    return p;
  }

  async updateProfile(userId: string, input: SellerProfileInput) {
    const p = await this.prisma.sellerProfile.update({ where: { userId }, data: input });
    await this.redis.del(CacheKeys.store(p.slug));
    await this.redis.delPattern('store:*');
    return p;
  }

  /** A buyer opens a store. It stays PENDING until an admin approves it. */
  async apply(userId: string, input: SellerProfileInput) {
    const existing = await this.prisma.sellerProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('You already have a store');
    let slug = slugify(input.storeName) || 'store';
    for (let i = 2; await this.prisma.sellerProfile.findUnique({ where: { slug } }); i++)
      slug = `${slugify(input.storeName)}-${i}`;
    await this.prisma.user.update({
      where: { id: userId },
      data: { role: 'SELLER', sellerProfile: { create: { ...input, slug, status: 'PENDING' } } },
    });
    return {
      ok: true,
      slug,
      message: 'Store created. Log in again after an admin approves it to start selling.',
    };
  }

  async stats(sellerId: string, days = 30): Promise<SellerStatsDto> {
    const since = new Date(Date.now() - days * 86_400_000);
    const [totals] = await this.prisma.$queryRawUnsafe<{ revenue: bigint | null; orders: bigint }[]>(
      `SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS revenue, COUNT(DISTINCT o.id) AS orders
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE oi.seller_id = $1 AND o.status IN ${PAID_STATUSES} AND o.created_at >= $2`,
      sellerId,
      since,
    );
    const byDay = await this.prisma.$queryRawUnsafe<{ day: Date; revenue: bigint; orders: bigint }[]>(
      `SELECT date_trunc('day', o.created_at) AS day, SUM(oi.unit_price * oi.quantity) AS revenue, COUNT(DISTINCT o.id) AS orders
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE oi.seller_id = $1 AND o.status IN ${PAID_STATUSES} AND o.created_at >= $2
       GROUP BY 1 ORDER BY 1`,
      sellerId,
      since,
    );
    const top = await this.prisma.$queryRawUnsafe<
      { id: string; title: string; slug: string; units: bigint; revenue: bigint }[]
    >(
      `SELECT p.id, p.title, p.slug, SUM(oi.quantity) AS units, SUM(oi.unit_price * oi.quantity) AS revenue
       FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id
       WHERE oi.seller_id = $1 AND o.status IN ${PAID_STATUSES} AND o.created_at >= $2
       GROUP BY p.id ORDER BY units DESC LIMIT 5`,
      sellerId,
      since,
    );
    const lowVariants = await this.prisma.productVariant.findMany({
      where: { stock: { lte: 5 }, product: { sellerId } },
      include: { product: { select: { id: true, title: true, slug: true } } },
      orderBy: { stock: 'asc' },
      take: 10,
    });
    const lowProducts = await this.prisma.product.findMany({
      where: { sellerId, stock: { lte: 5 }, variants: { none: {} } },
      select: { id: true, title: true, slug: true, stock: true },
      take: 10,
    });
    const [published, rating] = await Promise.all([
      this.prisma.product.count({ where: { sellerId, status: 'PUBLISHED' } }),
      this.prisma.product.aggregate({
        where: { sellerId, ratingCount: { gt: 0 } },
        _avg: { ratingAvg: true },
      }),
    ]);

    const map = new Map(byDay.map((d) => [d.day.toISOString().slice(0, 10), d]));
    const revenueByDay = Array.from({ length: days }, (_, i) => {
      const date = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
      const row = map.get(date);
      return { date, revenue: Number(row?.revenue ?? 0), orders: Number(row?.orders ?? 0) };
    });

    return {
      revenue: Number(totals?.revenue ?? 0),
      orders: Number(totals?.orders ?? 0),
      productsPublished: published,
      avgRating: Math.round((rating._avg.ratingAvg ?? 0) * 10) / 10,
      revenueByDay,
      topProducts: top.map((t) => ({
        id: t.id,
        title: t.title,
        slug: t.slug,
        unitsSold: Number(t.units),
        revenue: Number(t.revenue),
      })),
      lowStock: [
        ...lowVariants.map((v) => ({
          id: v.product.id,
          title: v.product.title,
          slug: v.product.slug,
          stock: v.stock,
          variant: [v.colour, v.size].filter(Boolean).join(' / ') || null,
        })),
        ...lowProducts.map((p) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          stock: p.stock,
          variant: null,
        })),
      ]
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 10),
    };
  }

  /** "Generate description" for sellers: title + keywords (+ photo for vision models). */
  async generateDescription(
    input: GenerateDescriptionInput,
  ): Promise<GeneratedDescription & { generatedBy: 'llm' | 'rules' }> {
    if (this.llm.enabled) {
      const out = await this.llm.json({
        name: 'product_copy',
        schema: generatedDescriptionSchema,
        imageUrl: input.imageUrl,
        maxTokens: 700,
        system:
          'You write product descriptions for a Thai online marketplace. Write in clear, friendly English. ' +
          '2 short paragraphs (80-140 words total) followed by 3-5 bullet points starting with "• ". ' +
          'Only state facts given in the title, keywords or visible in the photo — never invent specifications, ' +
          'certifications, materials or measurements. Also suggest 5-8 short lowercase search tags.',
        user: [
          `Title: ${input.title}`,
          input.categoryName ? `Category: ${input.categoryName}` : '',
          input.keywords.length ? `Keywords: ${input.keywords.join(', ')}` : '',
          input.imageUrl ? 'A product photo is attached.' : '',
        ]
          .filter(Boolean)
          .join('\n'),
      });
      if (out)
        return {
          description: out.description,
          tags: [...new Set(out.tags.map((t) => t.toLowerCase().trim()))].slice(0, 8),
          generatedBy: 'llm',
        };
    }
    return { ...this.descriptionTemplate(input), generatedBy: 'rules' };
  }

  private descriptionTemplate(input: GenerateDescriptionInput): GeneratedDescription {
    const kw = input.keywords.map((k) => k.trim()).filter(Boolean);
    const category = input.categoryName ? ` from our ${input.categoryName.toLowerCase()} range` : '';
    const traits =
      kw.length > 1
        ? `${kw.slice(0, -1).join(', ')} and ${kw[kw.length - 1]}`
        : (kw[0] ?? 'thoughtfully made');
    const intro = `Meet the ${input.title}${category}: ${traits}, and designed for everyday life in Thailand.`;
    const middle = kw.length
      ? `It is easy to care for and ready to use straight out of the box. Add your own details (materials, sizing, care) before publishing.`
      : 'It balances quality and value, and is easy to care for.';
    const bullets = (kw.length ? kw : ['Great everyday value', 'Easy to care for', 'Ships from Thailand'])
      .slice(0, 5)
      .map((k) => `• ${k.charAt(0).toUpperCase()}${k.slice(1)}`)
      .join('\n');
    const tags = [
      ...new Set([...kw.map((k) => k.toLowerCase()), ...tokenize(input.title).filter((t) => t.length > 3)]),
    ].slice(0, 8);
    return { description: `${intro}\n\n${middle}\n\n${bullets}`, tags };
  }

  /** Approved stores for the home page, with a few product photos each. */
  async stores() {
    return this.redis.remember('store:list', 600, async () => {
      const rows = await this.prisma.sellerProfile.findMany({
        where: { status: 'APPROVED', user: { isBanned: false } },
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: {
              products: {
                where: { status: 'PUBLISHED' },
                orderBy: { salesCount: 'desc' },
                take: 3,
                select: { images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } } },
              },
              _count: { select: { products: { where: { status: 'PUBLISHED' } } } },
            },
          },
        },
      });
      return rows.map((s) => ({
        storeName: s.storeName,
        slug: s.slug,
        description: s.description,
        productCount: s.user._count.products,
        images: s.user.products.map((p) => p.images[0]?.url).filter(Boolean) as string[],
      }));
    });
  }

  /** Public store page data. */
  async store(slug: string) {
    return this.redis.remember(CacheKeys.store(slug), 300, async () => {
      const p = await this.prisma.sellerProfile.findFirst({
        where: { slug, status: 'APPROVED', user: { isBanned: false } },
        include: { user: { select: { createdAt: true } } },
      });
      if (!p) return null;
      const agg = await this.prisma.product.aggregate({
        where: { sellerId: p.userId, status: 'PUBLISHED' },
        _count: true,
        _avg: { ratingAvg: true },
        _sum: { salesCount: true },
      });
      return {
        storeName: p.storeName,
        slug: p.slug,
        description: p.description,
        logoUrl: p.logoUrl,
        bannerUrl: p.bannerUrl,
        memberSince: p.user.createdAt.toISOString(),
        productCount: agg._count,
        avgRating: Math.round((agg._avg.ratingAvg ?? 0) * 10) / 10,
        totalSales: agg._sum.salesCount ?? 0,
      };
    });
  }
}

@ApiTags('seller')
@Roles('SELLER')
@Controller('seller')
export class SellerController {
  constructor(
    private readonly seller: SellerService,
    private readonly products: ProductsService,
    private readonly orders: OrdersService,
  ) {}

  @Get('profile')
  profile(@CurrentUser() user: JwtUser) {
    return this.seller.profile(user.sub);
  }

  @Put('profile')
  @ApiZodBody(sellerProfileSchema)
  updateProfile(@CurrentUser() user: JwtUser, @Body(zodPipe(sellerProfileSchema)) body: SellerProfileInput) {
    return this.seller.updateProfile(user.sub, body);
  }

  @Get('products')
  @ApiOperation({ summary: 'My products, including drafts' })
  @ApiZodQuery(productQuerySchema)
  myProducts(@CurrentUser() user: JwtUser, @Query(zodPipe(productQuerySchema)) query: ProductQuery) {
    return this.products.listForSeller(user.sub, query);
  }

  @Get('products/:id')
  myProduct(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.products.getForSeller(user, id);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Orders containing my products' })
  myOrders(@CurrentUser() user: JwtUser, @Query('status') status?: string, @Query('page') page?: string) {
    const s = ORDER_STATUSES.includes(status as OrderStatus) ? (status as OrderStatus) : undefined;
    return this.orders.listForSeller(user.sub, s, Math.max(1, Number(page) || 1));
  }

  @Get('stats')
  @ApiOperation({ summary: 'Revenue chart, top products, low-stock alerts' })
  stats(@CurrentUser() user: JwtUser, @Query('days') days?: string) {
    return this.seller.stats(user.sub, Math.min(Math.max(Number(days) || 30, 7), 90));
  }

  @AiThrottle()
  @Post('ai/description')
  @ApiOperation({ summary: 'AI: write a product description and suggest tags' })
  @ApiZodBody(generateDescriptionSchema)
  generate(@Body(zodPipe(generateDescriptionSchema)) body: GenerateDescriptionInput) {
    return this.seller.generateDescription(body);
  }
}

@ApiTags('seller')
@Controller()
export class StoresController {
  constructor(private readonly seller: SellerService) {}

  @Public()
  @Get('stores')
  @ApiOperation({ summary: 'All approved stores (home page showcase)' })
  list() {
    return this.seller.stores();
  }

  @Public()
  @Get('stores/:slug')
  @ApiOperation({ summary: 'Public store page' })
  async store(@Param('slug') slug: string) {
    const s = await this.seller.store(slug);
    if (!s) throw new NotFoundException('Store not found');
    return s;
  }

  @Roles('BUYER')
  @Post('seller/apply')
  @ApiOperation({ summary: 'Buyer: open a store (needs admin approval)' })
  @ApiZodBody(sellerProfileSchema)
  apply(@CurrentUser() user: JwtUser, @Body(zodPipe(sellerProfileSchema)) body: SellerProfileInput) {
    return this.seller.apply(user.sub, body);
  }
}

@Module({
  imports: [ProductsModule, OrdersModule],
  controllers: [SellerController, StoresController],
  providers: [SellerService],
})
export class SellerModule {}
