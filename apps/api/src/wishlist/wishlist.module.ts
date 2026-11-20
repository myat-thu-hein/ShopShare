import { Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type JwtUser } from '../common/decorators';
import { CARD_INCLUDE, toCard } from '../products/product.mapper';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.wishlist.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { product: { include: CARD_INCLUDE } },
    });
    return rows.map((r) => ({ ...toCard(r.product), addedAt: r.createdAt.toISOString() }));
  }

  async ids(userId: string): Promise<string[]> {
    const rows = await this.prisma.wishlist.findMany({ where: { userId }, select: { productId: true } });
    return rows.map((r) => r.productId);
  }

  async add(userId: string, productId: string) {
    if (!(await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } }))) {
      throw new NotFoundException('Product not found');
    }
    await this.prisma.wishlist.upsert({
      where: { userId_productId: { userId, productId } },
      update: {},
      create: { userId, productId },
    });
    return { ok: true };
  }

  async remove(userId: string, productId: string) {
    await this.prisma.wishlist.deleteMany({ where: { userId, productId } });
    return { ok: true };
  }
}

@ApiTags('wishlist')
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.wishlist.list(user.sub);
  }

  @Get('ids')
  ids(@CurrentUser() user: JwtUser) {
    return this.wishlist.ids(user.sub);
  }

  @Post(':productId')
  add(@CurrentUser() user: JwtUser, @Param('productId') productId: string) {
    return this.wishlist.add(user.sub, productId);
  }

  @Delete(':productId')
  remove(@CurrentUser() user: JwtUser, @Param('productId') productId: string) {
    return this.wishlist.remove(user.sub, productId);
  }
}

@Module({ controllers: [WishlistController], providers: [WishlistService] })
export class WishlistModule {}
