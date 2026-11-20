import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  slugify,
  type Paginated,
  type ProductCardDto,
  type ProductDetailDto,
  type ProductInput,
  type ProductQuery,
  type ProductUpdateInput,
} from '@shopsense/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmbeddingIndexer } from '../ai/ai.module';
import { CacheKeys, invalidateProductCaches } from '../common/cache-keys';
import type { JwtUser } from '../common/decorators';
import { CARD_INCLUDE, DETAIL_INCLUDE, VISIBLE_PRODUCT, toCard, toDetail } from './product.mapper';

export function productOrderBy(sort: ProductQuery['sort']): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'price_asc':
      return [{ price: 'asc' }, { id: 'asc' }];
    case 'price_desc':
      return [{ price: 'desc' }, { id: 'asc' }];
    case 'rating':
      return [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }];
    case 'popular':
      return [{ salesCount: 'desc' }, { viewCount: 'desc' }, { id: 'asc' }];
    default:
      return [{ createdAt: 'desc' }, { id: 'asc' }];
  }
}

export function buildProductWhere(
  q: ProductQuery,
  base: Prisma.ProductWhereInput = VISIBLE_PRODUCT,
): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [base];
  if (q.category) and.push({ category: { slug: q.category } });
  if (q.seller) and.push({ seller: { sellerProfile: { slug: q.seller } } });
  if (q.minPrice != null) and.push({ price: { gte: Math.round(q.minPrice) } });
  if (q.maxPrice != null) and.push({ price: { lte: Math.round(q.maxPrice) } });
  if (q.minRating != null) and.push({ ratingAvg: { gte: q.minRating } });
  if (q.inStock) and.push({ stock: { gt: 0 } });
  if (q.onSale) and.push({ compareAtPrice: { not: null } });
  if (q.colour) and.push({ variants: { some: { colour: { equals: q.colour, mode: 'insensitive' } } } });
  if (q.q) {
    and.push({
      OR: [
        { title: { contains: q.q, mode: 'insensitive' } },
        { tags: { has: q.q.toLowerCase() } },
        { description: { contains: q.q, mode: 'insensitive' } },
      ],
    });
  }
  return { AND: and };
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly indexer: EmbeddingIndexer,
  ) {}

  /* ------------------------------------------------------------ public */

  list(q: ProductQuery): Promise<Paginated<ProductCardDto>> {
    return this.redis.remember(CacheKeys.productList(q), 60, () => this.query(q, VISIBLE_PRODUCT));
  }

  async query(q: ProductQuery, base: Prisma.ProductWhereInput): Promise<Paginated<ProductCardDto>> {
    const where = buildProductWhere(q, base);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: CARD_INCLUDE,
        orderBy: productOrderBy(q.sort),
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return {
      items: rows.map(toCard),
      total,
      page: q.page,
      limit: q.limit,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
    };
  }

  async bySlug(slug: string): Promise<ProductDetailDto> {
    const product = await this.redis.remember(CacheKeys.product(slug), 300, async () => {
      const p = await this.prisma.product.findFirst({
        where: { slug, ...VISIBLE_PRODUCT },
        include: DETAIL_INCLUDE,
      });
      return p ? toDetail(p) : null;
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async recordView(productId: string, userId?: string) {
    const exists = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Product not found');
    // Count at most one view per user per product per 30 minutes.
    if (userId && this.redis.ready) {
      const key = `viewed:${userId}:${productId}`;
      const fresh = await this.redis.client.set(key, '1', 'EX', 1800, 'NX');
      if (!fresh) return { ok: true };
    }
    await this.prisma.$transaction([
      this.prisma.productView.create({ data: { productId, userId: userId ?? null } }),
      this.prisma.product.update({ where: { id: productId }, data: { viewCount: { increment: 1 } } }),
    ]);
    return { ok: true };
  }

  /* ----------------------------------------------------------- sellers */

  async listForSeller(sellerId: string, q: ProductQuery) {
    return this.query(q, { sellerId });
  }

  async getForSeller(user: JwtUser, id: string): Promise<ProductDetailDto> {
    const p = await this.prisma.product.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!p) throw new NotFoundException('Product not found');
    this.assertOwner(user, p.sellerId);
    return toDetail(p);
  }

  async create(user: JwtUser, input: ProductInput): Promise<ProductDetailDto> {
    if (input.status === 'PUBLISHED') await this.assertApprovedSeller(user);
    await this.assertCategory(input.categoryId);
    const slug = await this.uniqueSlug(input.title);
    const variants = this.cleanVariants(input.variants);
    const p = await this.prisma.product.create({
      data: {
        sellerId: user.sub,
        title: input.title,
        slug,
        description: input.description,
        price: input.price,
        compareAtPrice: this.compareAt(input.price, input.compareAtPrice),
        brand: input.brand?.trim() || null,
        stock: variants.length ? variants.reduce((s, v) => s + v.stock, 0) : input.stock,
        status: input.status,
        tags: [...new Set(input.tags)],
        categoryId: input.categoryId,
        images: {
          create: input.images.map((img, position) => ({
            url: img.url,
            alt: img.alt ?? input.title,
            position,
          })),
        },
        variants: { create: variants.map(({ id: _id, ...v }, position) => ({ ...v, position })) },
      },
      include: DETAIL_INCLUDE,
    });
    await invalidateProductCaches(this.redis);
    this.indexer.schedule([p.id]);
    return toDetail(p);
  }

  async update(user: JwtUser, id: string, input: ProductUpdateInput): Promise<ProductDetailDto> {
    const existing = await this.prisma.product.findUnique({ where: { id }, include: { variants: true } });
    if (!existing) throw new NotFoundException('Product not found');
    this.assertOwner(user, existing.sellerId);
    if (input.status === 'PUBLISHED') await this.assertApprovedSeller(user);
    if (input.categoryId) await this.assertCategory(input.categoryId);

    const p = await this.prisma.$transaction(async (tx) => {
      if (input.images) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        await tx.productImage.createMany({
          data: input.images.map((img, position) => ({
            productId: id,
            url: img.url,
            alt: img.alt ?? existing.title,
            position,
          })),
        });
      }
      let stock = input.stock;
      if (input.variants) {
        const variants = this.cleanVariants(input.variants);
        const keepIds = variants.map((v) => v.id).filter((v): v is string => !!v);
        await tx.productVariant.deleteMany({ where: { productId: id, id: { notIn: keepIds } } });
        for (const [position, v] of variants.entries()) {
          const { id: variantId, ...data } = v;
          if (variantId && existing.variants.some((ev) => ev.id === variantId)) {
            await tx.productVariant.update({ where: { id: variantId }, data: { ...data, position } });
          } else {
            await tx.productVariant.create({ data: { ...data, position, productId: id } });
          }
        }
        if (variants.length) stock = variants.reduce((s, v) => s + v.stock, 0);
      }
      return tx.product.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          price: input.price,
          compareAtPrice:
            input.compareAtPrice !== undefined || input.price !== undefined
              ? this.compareAt(
                  input.price ?? existing.price,
                  input.compareAtPrice !== undefined ? input.compareAtPrice : existing.compareAtPrice,
                )
              : undefined,
          brand: input.brand !== undefined ? input.brand?.trim() || null : undefined,
          stock,
          status: input.status,
          tags: input.tags ? [...new Set(input.tags)] : undefined,
          categoryId: input.categoryId,
        },
        include: DETAIL_INCLUDE,
      });
    });
    await invalidateProductCaches(this.redis, [existing.slug]);
    this.indexer.schedule([id]);
    return toDetail(p);
  }

  async remove(user: JwtUser, id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: { _count: { select: { orderItems: true } } },
    });
    if (!p) throw new NotFoundException('Product not found');
    this.assertOwner(user, p.sellerId);
    if (p._count.orderItems > 0) {
      throw new ConflictException(
        'This product has orders, so it cannot be deleted. Set it to Draft to hide it instead.',
      );
    }
    await this.prisma.product.delete({ where: { id } });
    await invalidateProductCaches(this.redis, [p.slug]);
    return { ok: true };
  }

  /* ----------------------------------------------------------- helpers */

  /** A sale price only makes sense when the original price is higher. */
  private compareAt(price: number, compareAtPrice: number | null | undefined): number | null {
    if (compareAtPrice == null) return null;
    if (compareAtPrice <= price)
      throw new BadRequestException('The original price must be higher than the selling price');
    return compareAtPrice;
  }

  private cleanVariants(variants: ProductInput['variants']) {
    return variants
      .map((v) => ({
        id: v.id,
        size: v.size?.trim() || null,
        colour: v.colour?.trim().toLowerCase() || null,
        sku: v.sku?.trim() || null,
        stock: v.stock,
        price: v.price ?? null,
      }))
      .filter((v) => v.size || v.colour || v.sku);
  }

  private assertOwner(user: JwtUser, sellerId: string) {
    if (user.role !== 'ADMIN' && user.sub !== sellerId) throw new ForbiddenException('Not your product');
  }

  private async assertApprovedSeller(user: JwtUser) {
    if (user.role === 'ADMIN') return;
    const profile = await this.prisma.sellerProfile.findUnique({ where: { userId: user.sub } });
    if (profile?.status !== 'APPROVED') {
      throw new ForbiddenException(
        'Your store is awaiting admin approval. You can save drafts but not publish yet.',
      );
    }
  }

  private async assertCategory(id: string) {
    if (!(await this.prisma.category.findUnique({ where: { id } })))
      throw new BadRequestException('Unknown category');
  }

  private async uniqueSlug(title: string) {
    const base = slugify(title) || 'product';
    let slug = base;
    for (let i = 2; await this.prisma.product.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    return slug;
  }
}
