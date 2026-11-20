import type { Prisma } from '@prisma/client';
import type { ProductCardDto, ProductDetailDto } from '@shopsense/shared';

/** Only show products from approved, non-banned sellers. */
export const VISIBLE_PRODUCT: Prisma.ProductWhereInput = {
  status: 'PUBLISHED',
  seller: { isBanned: false, sellerProfile: { status: 'APPROVED' } },
};

export const CARD_INCLUDE = {
  images: { orderBy: { position: 'asc' }, take: 1 },
  category: { select: { name: true, slug: true } },
  seller: { select: { sellerProfile: { select: { storeName: true, slug: true } } } },
} satisfies Prisma.ProductInclude;

export const DETAIL_INCLUDE = {
  images: { orderBy: { position: 'asc' } },
  variants: { orderBy: { position: 'asc' } },
  category: { select: { name: true, slug: true } },
  seller: { select: { sellerProfile: { select: { storeName: true, slug: true } } } },
} satisfies Prisma.ProductInclude;

type CardRow = Prisma.ProductGetPayload<{ include: typeof CARD_INCLUDE }>;
type DetailRow = Prisma.ProductGetPayload<{ include: typeof DETAIL_INCLUDE }>;

export function toCard(p: CardRow | DetailRow): ProductCardDto {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    price: p.price,
    compareAtPrice: p.compareAtPrice && p.compareAtPrice > p.price ? p.compareAtPrice : null,
    brand: p.brand,
    stock: p.stock,
    salesCount: p.salesCount,
    ratingAvg: Math.round(p.ratingAvg * 10) / 10,
    ratingCount: p.ratingCount,
    imageUrl: p.images[0]?.url ?? null,
    category: p.category,
    seller: p.seller.sellerProfile
      ? { storeName: p.seller.sellerProfile.storeName, slug: p.seller.sellerProfile.slug }
      : null,
    status: p.status,
  };
}

export function toDetail(p: DetailRow): ProductDetailDto {
  return {
    ...toCard(p),
    description: p.description,
    tags: p.tags,
    sellerId: p.sellerId,
    createdAt: p.createdAt.toISOString(),
    images: p.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, position: i.position })),
    variants: p.variants.map((v) => ({
      id: v.id,
      size: v.size,
      colour: v.colour,
      sku: v.sku,
      stock: v.stock,
      price: v.price,
    })),
  };
}

export function variantLabel(
  v: { size: string | null; colour: string | null } | null | undefined,
): string | null {
  if (!v) return null;
  const parts = [v.colour, v.size ? `Size ${v.size}` : null].filter(Boolean);
  return parts.length ? parts.join(' / ') : null;
}
