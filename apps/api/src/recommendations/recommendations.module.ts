import { Controller, Get, Injectable, Module, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ProductCardDto } from '@shopsense/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmbeddingService, toVectorLiteral } from '../ai/embedding.service';
import { CacheKeys } from '../common/cache-keys';
import { CurrentUser, Public, type JwtUser } from '../common/decorators';
import { CARD_INCLUDE, VISIBLE_PRODUCT, toCard } from '../products/product.mapper';

const VISIBLE_SQL = `p.status = 'PUBLISHED' AND EXISTS (SELECT 1 FROM users u JOIN seller_profiles sp ON sp.user_id = u.id
  WHERE u.id = p.seller_id AND u.is_banned = false AND sp.status = 'APPROVED')`;

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly embeddings: EmbeddingService,
  ) {}

  /** "Similar products": nearest neighbours of this product's embedding. */
  similar(productId: string, limit = 8): Promise<ProductCardDto[]> {
    return this.redis.remember(`${CacheKeys.similar(productId)}:${limit}`, 600, async () => {
      const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT p.id FROM product_embeddings src
         JOIN product_embeddings e ON e.model = src.model AND e.product_id <> src.product_id
         JOIN products p ON p.id = e.product_id
         WHERE src.product_id = $1 AND ${VISIBLE_SQL}
         ORDER BY e.embedding <=> src.embedding
         LIMIT $2`,
        productId,
        limit,
      );
      if (rows.length) return this.cardsInOrder(rows.map((r) => r.id));
      // No embedding yet: fall back to popular products in the same category.
      const p = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { categoryId: true },
      });
      if (!p) return [];
      const fallback = await this.prisma.product.findMany({
        where: { ...VISIBLE_PRODUCT, categoryId: p.categoryId, id: { not: productId } },
        include: CARD_INCLUDE,
        orderBy: { salesCount: 'desc' },
        take: limit,
      });
      return fallback.map(toCard);
    });
  }

  /**
   * "Recommended for you": builds a taste vector from what the buyer viewed (weight 1,
   * fading with age) and bought (weight 3), then finds the closest products they have not bought.
   */
  async forYou(
    userId: string | undefined,
    limit = 12,
  ): Promise<{ items: ProductCardDto[]; personalised: boolean }> {
    if (!userId) return { items: await this.trending(limit), personalised: false };

    const [views, purchases] = await Promise.all([
      this.prisma.productView.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { productId: true, createdAt: true },
      }),
      this.prisma.orderItem.findMany({
        where: {
          order: { buyerId: userId, status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] } },
          productId: { not: null },
        },
        select: { productId: true },
        take: 30,
        orderBy: { order: { createdAt: 'desc' } },
      }),
    ]);
    const weights = new Map<string, number>();
    const now = Date.now();
    for (const v of views) {
      const ageDays = (now - v.createdAt.getTime()) / 86_400_000;
      weights.set(v.productId, (weights.get(v.productId) ?? 0) + Math.exp(-ageDays / 14));
    }
    const purchased = new Set(purchases.map((p) => p.productId!));
    for (const id of purchased) weights.set(id, (weights.get(id) ?? 0) + 3);
    if (weights.size === 0) return { items: await this.trending(limit), personalised: false };

    const embeddings = await this.prisma.$queryRawUnsafe<{ product_id: string; embedding: string }[]>(
      `SELECT product_id, embedding::text AS embedding FROM product_embeddings WHERE product_id = ANY($1) AND model = $2`,
      [...weights.keys()],
      this.embeddings.model,
    );
    if (!embeddings.length) return { items: await this.trending(limit), personalised: false };

    let taste: number[] | null = null;
    let total = 0;
    for (const row of embeddings) {
      const vec = JSON.parse(row.embedding) as number[];
      const w = weights.get(row.product_id) ?? 0;
      taste = taste ? taste.map((x, i) => x + vec[i] * w) : vec.map((x) => x * w);
      total += w;
    }
    taste = taste!.map((x) => x / (total || 1));

    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT p.id FROM product_embeddings e JOIN products p ON p.id = e.product_id
       WHERE e.model = $1 AND NOT (p.id = ANY($2)) AND ${VISIBLE_SQL}
       ORDER BY e.embedding <=> $3::vector
       LIMIT $4`,
      this.embeddings.model,
      [...purchased],
      toVectorLiteral(taste),
      limit,
    );
    return { items: await this.cardsInOrder(rows.map((r) => r.id)), personalised: true };
  }

  /** Trending: most viewed + bought in the last 7 days. */
  trending(limit = 12): Promise<ProductCardDto[]> {
    return this.redis.remember(`${CacheKeys.trending}:${limit}`, 600, async () => {
      const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT p.id FROM products p
         LEFT JOIN (SELECT product_id, COUNT(*) AS c FROM product_views WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY product_id) v ON v.product_id = p.id
         LEFT JOIN (SELECT oi.product_id, SUM(oi.quantity) AS c FROM order_items oi JOIN orders o ON o.id = oi.order_id
                    WHERE o.created_at > NOW() - INTERVAL '7 days' AND o.status IN ('PAID','SHIPPED','DELIVERED') GROUP BY oi.product_id) s ON s.product_id = p.id
         WHERE ${VISIBLE_SQL}
         ORDER BY COALESCE(v.c, 0) + COALESCE(s.c, 0) * 5 DESC, p.rating_avg DESC
         LIMIT $1`,
        limit,
      );
      return this.cardsInOrder(rows.map((r) => r.id));
    });
  }

  private async cardsInOrder(ids: string[]): Promise<ProductCardDto[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.product.findMany({ where: { id: { in: ids } }, include: CARD_INCLUDE });
    const byId = new Map(rows.map((r) => [r.id, toCard(r)]));
    return ids.map((id) => byId.get(id)).filter((x): x is ProductCardDto => !!x);
  }
}

@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recs: RecommendationsService) {}

  @Public()
  @Get('similar/:productId')
  @ApiOperation({ summary: 'Products similar to this one (vector similarity)' })
  similar(@Param('productId') id: string, @Query('limit') limit?: string) {
    return this.recs.similar(id, Math.min(Number(limit) || 8, 24));
  }

  @Public()
  @Get('for-you')
  @ApiOperation({ summary: 'Personalised picks from views and purchases (trending when logged out)' })
  forYou(@CurrentUser() user?: JwtUser, @Query('limit') limit?: string) {
    return this.recs.forYou(user?.sub, Math.min(Number(limit) || 12, 24));
  }

  @Public()
  @Get('trending')
  trending(@Query('limit') limit?: string) {
    return this.recs.trending(Math.min(Number(limit) || 12, 24));
  }
}

@Module({
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
