import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Prisma, Role, SellerStatus } from '@prisma/client';
import {
  ROLES,
  SELLER_STATUSES,
  adminUpdateUserSchema,
  sellerApprovalSchema,
  type AdminStatsDto,
} from '@shopsense/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthService } from '../auth/auth.service';
import { EmbeddingIndexer } from '../ai/ai.module';
import { LlmService } from '../ai/llm.service';
import { EmbeddingService } from '../ai/embedding.service';
import { StripeService } from '../payments/stripe.service';
import { EmailService } from '../email/email.service';
import { invalidateProductCaches } from '../common/cache-keys';
import { CurrentUser, Roles, type JwtUser } from '../common/decorators';
import { ApiZodBody, zodPipe } from '../common/zod';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly auth: AuthService,
  ) {}

  async stats(days = 30): Promise<AdminStatsDto> {
    const since = new Date(Date.now() - days * 86_400_000);
    const paid = { in: ['PAID', 'SHIPPED', 'DELIVERED'] as const } as Prisma.EnumOrderStatusFilter;
    const [users, buyers, sellers, orders, revenue, pendingSellers, products, byDay] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'BUYER' } }),
      this.prisma.user.count({ where: { role: 'SELLER' } }),
      this.prisma.order.count({ where: { status: paid } }),
      this.prisma.order.aggregate({ where: { status: paid }, _sum: { total: true } }),
      this.prisma.sellerProfile.count({ where: { status: 'PENDING' } }),
      this.prisma.product.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.$queryRawUnsafe<{ day: Date; revenue: bigint; orders: bigint }[]>(
        `SELECT date_trunc('day', created_at) AS day, SUM(total) AS revenue, COUNT(*) AS orders
         FROM orders WHERE status IN ('PAID','SHIPPED','DELIVERED') AND created_at >= $1 GROUP BY 1 ORDER BY 1`,
        since,
      ),
    ]);
    const map = new Map(byDay.map((d) => [d.day.toISOString().slice(0, 10), d]));
    return {
      users,
      buyers,
      sellers,
      orders,
      revenue: revenue._sum.total ?? 0,
      pendingSellers,
      products,
      revenueByDay: Array.from({ length: days }, (_, i) => {
        const date = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
        const row = map.get(date);
        return { date, revenue: Number(row?.revenue ?? 0), orders: Number(row?.orders ?? 0) };
      }),
    };
  }

  async users(q: { role?: string; search?: string; page: number }) {
    const where: Prisma.UserWhereInput = {
      role: ROLES.includes(q.role as Role) ? (q.role as Role) : undefined,
      OR: q.search
        ? [
            { email: { contains: q.search, mode: 'insensitive' } },
            { name: { contains: q.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const limit = 20;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isBanned: true,
          isDemo: true,
          createdAt: true,
          sellerProfile: { select: { storeName: true, status: true, slug: true } },
          _count: { select: { orders: true } },
        },
      }),
    ]);
    return { items: rows, total, page: q.page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async updateUser(admin: JwtUser, id: string, input: { role?: Role; isBanned?: boolean }) {
    if (id === admin.sub) throw new BadRequestException('You cannot change your own account here');
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (target.isDemo) throw new BadRequestException('Demo accounts cannot be modified');
    const user = await this.prisma.user.update({
      where: { id },
      data: input,
      select: { id: true, role: true, isBanned: true, sellerProfile: { select: { slug: true } } },
    });
    if (input.isBanned) await this.auth.revokeAll(id); // banned users are logged out everywhere
    if (input.isBanned !== undefined) await invalidateProductCaches(this.redis);
    return user;
  }

  async sellers(status?: string) {
    return this.prisma.sellerProfile.findMany({
      where: {
        status: SELLER_STATUSES.includes(status as SellerStatus) ? (status as SellerStatus) : undefined,
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        user: { select: { id: true, email: true, name: true, isBanned: true, createdAt: true } },
      },
    });
  }

  async setSellerStatus(userId: string, status: SellerStatus) {
    const profile = await this.prisma.sellerProfile.update({ where: { userId }, data: { status } });
    if (status === 'APPROVED')
      await this.prisma.user.update({ where: { id: userId }, data: { role: 'SELLER' } });
    await invalidateProductCaches(this.redis);
    return profile;
  }
}

@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly indexer: EmbeddingIndexer,
    private readonly llm: LlmService,
    private readonly embeddings: EmbeddingService,
    private readonly stripe: StripeService,
    private readonly email: EmailService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Platform totals and revenue chart' })
  stats(@Query('days') days?: string) {
    return this.admin.stats(Math.min(Math.max(Number(days) || 30, 7), 90));
  }

  @Get('users')
  users(@Query('role') role?: string, @Query('search') search?: string, @Query('page') page?: string) {
    return this.admin.users({ role, search, page: Math.max(1, Number(page) || 1) });
  }

  @Patch('users/:id')
  @ApiZodBody(adminUpdateUserSchema)
  updateUser(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(zodPipe(adminUpdateUserSchema)) body: { role?: Role; isBanned?: boolean },
  ) {
    return this.admin.updateUser(user, id, body);
  }

  @Get('sellers')
  sellers(@Query('status') status?: string) {
    return this.admin.sellers(status);
  }

  @Patch('sellers/:userId')
  @ApiOperation({ summary: 'Approve or reject a seller' })
  @ApiZodBody(sellerApprovalSchema)
  setSeller(
    @Param('userId') userId: string,
    @Body(zodPipe(sellerApprovalSchema)) body: { status: SellerStatus },
  ) {
    return this.admin.setSellerStatus(userId, body.status);
  }

  @Post('reindex-embeddings')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recompute product embeddings (after changing EMBEDDING_PROVIDER)' })
  reindex() {
    return this.indexer.index();
  }

  @Get('integrations')
  @ApiOperation({ summary: 'Which integrations are live vs. running on local fallbacks' })
  integrations() {
    return {
      llm: { provider: this.llm.provider, model: this.llm.model },
      embeddings: { model: this.embeddings.model },
      payments: this.stripe.enabled ? 'stripe' : 'mock',
      email: this.email.transport,
    };
  }
}

@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
