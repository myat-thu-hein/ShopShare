import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  addToCartSchema,
  mergeCartSchema,
  updateCartItemSchema,
  type AddToCartInput,
  type CartDto,
  type MergeCartInput,
} from '@shopsense/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type JwtUser } from '../common/decorators';
import { ApiZodBody, zodPipe } from '../common/zod';
import { VISIBLE_PRODUCT, variantLabel } from '../products/product.mapper';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  private async cartId(userId: string): Promise<string> {
    const cart = await this.prisma.cart.upsert({ where: { userId }, update: {}, create: { userId } });
    return cart.id;
  }

  async get(userId: string): Promise<CartDto> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
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
    const items = (cart?.items ?? []).map((i) => {
      const visible =
        i.product.status === 'PUBLISHED' &&
        !i.product.seller.isBanned &&
        i.product.seller.sellerProfile?.status === 'APPROVED';
      return {
        id: i.id,
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
        unitPrice: i.variant?.price ?? i.product.price,
        title: i.product.title,
        slug: i.product.slug,
        imageUrl: i.product.images[0]?.url ?? null,
        variantLabel: variantLabel(i.variant),
        available: visible ? (i.variant ? i.variant.stock : i.product.stock) : 0,
      };
    });
    return {
      items,
      subtotal: items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
      itemCount: items.reduce((s, i) => s + i.quantity, 0),
    };
  }

  /** Checks the product/variant combination is real and returns how many can be bought. */
  private async availability(
    productId: string,
    variantId?: string | null,
  ): Promise<{ available: number; title: string }> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, ...VISIBLE_PRODUCT },
      include: { variants: true },
    });
    if (!product) throw new NotFoundException('Product is not available');
    if (product.variants.length > 0) {
      if (!variantId) throw new BadRequestException('Please choose a size/colour');
      const v = product.variants.find((x) => x.id === variantId);
      if (!v) throw new BadRequestException('That option does not exist for this product');
      return { available: v.stock, title: product.title };
    }
    if (variantId) throw new BadRequestException('This product has no options');
    return { available: product.stock, title: product.title };
  }

  async add(userId: string, input: AddToCartInput): Promise<CartDto> {
    const { available, title } = await this.availability(input.productId, input.variantId);
    const cartId = await this.cartId(userId);
    const existing = await this.prisma.cartItem.findFirst({
      where: { cartId, productId: input.productId, variantId: input.variantId ?? null },
    });
    const wanted = (existing?.quantity ?? 0) + input.quantity;
    if (available <= 0) throw new ConflictException(`"${title}" is out of stock`);
    if (wanted > available) throw new ConflictException(`Only ${available} of "${title}" left in stock`);
    if (existing)
      await this.prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: wanted } });
    else
      await this.prisma.cartItem.create({
        data: {
          cartId,
          productId: input.productId,
          variantId: input.variantId ?? null,
          quantity: input.quantity,
        },
      });
    return this.get(userId);
  }

  async update(userId: string, itemId: string, quantity: number): Promise<CartDto> {
    const item = await this.prisma.cartItem.findFirst({ where: { id: itemId, cart: { userId } } });
    if (!item) throw new NotFoundException('Cart item not found');
    if (quantity === 0) {
      await this.prisma.cartItem.delete({ where: { id: itemId } });
    } else {
      const { available, title } = await this.availability(item.productId, item.variantId);
      if (quantity > available) throw new ConflictException(`Only ${available} of "${title}" left in stock`);
      await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
    }
    return this.get(userId);
  }

  async remove(userId: string, itemId: string): Promise<CartDto> {
    await this.prisma.cartItem.deleteMany({ where: { id: itemId, cart: { userId } } });
    return this.get(userId);
  }

  async clear(userId: string) {
    await this.prisma.cartItem.deleteMany({ where: { cart: { userId } } });
  }

  /** Merges a guest cart (kept in the browser) into the account after login. Quantities are capped at stock. */
  async merge(userId: string, input: MergeCartInput): Promise<CartDto> {
    for (const item of input.items) {
      try {
        const { available } = await this.availability(item.productId, item.variantId);
        const cartId = await this.cartId(userId);
        const existing = await this.prisma.cartItem.findFirst({
          where: { cartId, productId: item.productId, variantId: item.variantId ?? null },
        });
        const quantity = Math.min(available, Math.max(existing?.quantity ?? 0, item.quantity));
        if (quantity <= 0) continue;
        if (existing) await this.prisma.cartItem.update({ where: { id: existing.id }, data: { quantity } });
        else
          await this.prisma.cartItem.create({
            data: { cartId, productId: item.productId, variantId: item.variantId ?? null, quantity },
          });
      } catch {
        /* skip items that are no longer available */
      }
    }
    return this.get(userId);
  }
}

@ApiTags('cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() user: JwtUser) {
    return this.cart.get(user.sub);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add to cart (checks stock)' })
  @ApiZodBody(addToCartSchema)
  add(@CurrentUser() user: JwtUser, @Body(zodPipe(addToCartSchema)) body: AddToCartInput) {
    return this.cart.add(user.sub, body);
  }

  @Patch('items/:id')
  @ApiZodBody(updateCartItemSchema)
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(zodPipe(updateCartItemSchema)) body: { quantity: number },
  ) {
    return this.cart.update(user.sub, id, body.quantity);
  }

  @Delete('items/:id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.cart.remove(user.sub, id);
  }

  @Delete()
  async clear(@CurrentUser() user: JwtUser) {
    await this.cart.clear(user.sub);
    return this.cart.get(user.sub);
  }

  @Post('merge')
  @ApiOperation({ summary: 'Merge a guest cart into the logged-in cart' })
  @ApiZodBody(mergeCartSchema)
  merge(@CurrentUser() user: JwtUser, @Body(zodPipe(mergeCartSchema)) body: MergeCartInput) {
    return this.cart.merge(user.sub, body);
  }
}

@Module({ controllers: [CartController], providers: [CartService], exports: [CartService] })
export class CartModule {}
