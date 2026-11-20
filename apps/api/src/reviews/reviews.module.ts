import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createReviewSchema,
  reviewSummarySchema,
  type CreateReviewInput,
  type ReviewListDto,
  type ReviewSummaryDto,
} from '@shopsense/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LlmService } from '../ai/llm.service';
import { CacheKeys } from '../common/cache-keys';
import { CurrentUser, Public, Roles, type JwtUser } from '../common/decorators';
import { ApiZodBody, zodPipe } from '../common/zod';
import { AiThrottle } from '../common/throttle';
import { summariseReviewsWithRules } from './review-summary.util';

const PURCHASED: Prisma.OrderWhereInput['status'] = { in: ['PAID', 'SHIPPED', 'DELIVERED'] };

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly llm: LlmService,
  ) {}

  async list(productId: string, userId: string | undefined, page = 1, limit = 10): Promise<ReviewListDto> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { ratingAvg: true, ratingCount: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    const [rows, total, dist] = await Promise.all([
      this.prisma.review.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      }),
      this.prisma.review.count({ where: { productId } }),
      this.prisma.review.groupBy({ by: ['rating'], where: { productId }, _count: true }),
    ]);
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as ReviewListDto['distribution'];
    for (const d of dist) distribution[d.rating as 1 | 2 | 3 | 4 | 5] = d._count;
    return {
      items: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        user: { id: r.user.id, name: r.user.name, avatarUrl: r.user.avatarUrl },
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      ratingAvg: Math.round(product.ratingAvg * 10) / 10,
      ratingCount: product.ratingCount,
      distribution,
      canReview: userId ? await this.canReview(userId, productId) : false,
    };
  }

  /** Only buyers with a paid order for this product, who have not reviewed it yet. */
  async canReview(userId: string, productId: string): Promise<boolean> {
    const [purchase, existing] = await Promise.all([
      this.prisma.orderItem.findFirst({
        where: { productId, order: { buyerId: userId, status: PURCHASED } },
        select: { id: true },
      }),
      this.prisma.review.findUnique({
        where: { productId_userId: { productId, userId } },
        select: { id: true },
      }),
    ]);
    return !!purchase && !existing;
  }

  async create(userId: string, productId: string, input: CreateReviewInput) {
    const purchase = await this.prisma.orderItem.findFirst({
      where: { productId, order: { buyerId: userId, status: PURCHASED } },
    });
    if (!purchase) throw new ForbiddenException('Only buyers who purchased this product can review it');
    const exists = await this.prisma.review.findUnique({
      where: { productId_userId: { productId, userId } },
    });
    if (exists) throw new ConflictException('You have already reviewed this product');

    const review = await this.prisma.$transaction(async (tx) => {
      const r = await tx.review.create({ data: { productId, userId, ...input } });
      await this.recalculate(tx, productId);
      return r;
    });
    await this.invalidate(productId);
    return review;
  }

  async remove(user: JwtUser, id: string) {
    const r = await this.prisma.review.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Review not found');
    if (r.userId !== user.sub && user.role !== 'ADMIN') throw new ForbiddenException();
    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id } });
      await this.recalculate(tx, r.productId);
    });
    await this.invalidate(r.productId);
    return { ok: true };
  }

  private async recalculate(tx: Prisma.TransactionClient, productId: string) {
    const agg = await tx.review.aggregate({ where: { productId }, _avg: { rating: true }, _count: true });
    await tx.product.update({
      where: { id: productId },
      data: { ratingAvg: Math.round((agg._avg.rating ?? 0) * 100) / 100, ratingCount: agg._count },
    });
  }

  private async invalidate(productId: string) {
    const p = await this.prisma.product.findUnique({ where: { id: productId }, select: { slug: true } });
    if (p) await this.redis.del(CacheKeys.product(p.slug));
    await this.redis.delPattern(`review-summary:${productId}:*`);
    await this.redis.delPattern('products:list:*');
  }

  /** AI pros/cons summary. Cached until the review count changes. */
  async summary(productId: string): Promise<ReviewSummaryDto> {
    const reviews = await this.prisma.review.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: { rating: true, title: true, comment: true },
    });
    const key = CacheKeys.reviewSummary(productId, reviews.length);
    return this.redis.remember(key, 86_400 * 7, async () => {
      if (reviews.length === 0)
        return {
          summary: 'No reviews yet.',
          pros: [],
          cons: [],
          reviewCount: 0,
          generatedBy: 'rules' as const,
        };
      if (this.llm.enabled && reviews.length >= 2) {
        const out = await this.llm.json({
          name: 'review_summary',
          schema: reviewSummarySchema,
          maxTokens: 500,
          system:
            'You summarise customer reviews for an online shop. Be balanced and factual. Only use what the reviews say. ' +
            'Return a 1-2 sentence summary, up to 4 short pros and up to 3 short cons (each under 8 words). Empty lists are fine.',
          user: reviews
            .map((r, i) => `Review ${i + 1} (${r.rating}/5): ${r.title ? `${r.title}. ` : ''}${r.comment}`)
            .join('\n'),
        });
        if (out) return { ...out, reviewCount: reviews.length, generatedBy: 'llm' as const };
      }
      return {
        ...summariseReviewsWithRules(reviews),
        reviewCount: reviews.length,
        generatedBy: 'rules' as const,
      };
    });
  }
}

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('products/:id/reviews')
  list(@Param('id') id: string, @CurrentUser() user?: JwtUser, @Query('page') page?: string) {
    return this.reviews.list(id, user?.sub, Math.max(1, Number(page) || 1));
  }

  @Public()
  @AiThrottle()
  @Get('products/:id/reviews/summary')
  @ApiOperation({ summary: 'AI summary of all reviews: pros and cons' })
  summary(@Param('id') id: string) {
    return this.reviews.summary(id);
  }

  @Roles('BUYER')
  @Post('products/:id/reviews')
  @ApiOperation({ summary: 'Review a product you purchased' })
  @ApiZodBody(createReviewSchema)
  create(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(zodPipe(createReviewSchema)) body: CreateReviewInput,
  ) {
    return this.reviews.create(user.sub, id, body);
  }

  @Delete('reviews/:id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.reviews.remove(user, id);
  }
}

@Module({ controllers: [ReviewsController], providers: [ReviewsService] })
export class ReviewsModule {}
