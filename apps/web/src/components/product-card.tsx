'use client';

import Link from 'next/link';
import { Heart, Star } from 'lucide-react';
import { formatSold, type ProductCardDto } from '@shopsense/shared';
import { cn } from '@/lib/utils';
import { useWishlist } from '@/hooks/use-wishlist';
import { ProductImage } from './product-image';
import { DiscountBadge, Price } from './price';
import { Skeleton } from './ui/misc';

export function ProductCard({ product, priority }: { product: ProductCardDto; priority?: boolean }) {
  const wishlist = useWishlist();
  const saved = wishlist.has(product.id);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-shadow hover:shadow-lg hover:shadow-black/5">
      <Link
        href={`/p/${product.slug}`}
        className="relative block border-b border-line"
        tabIndex={-1}
        aria-hidden
      >
        <ProductImage
          src={product.imageUrl}
          alt=""
          priority={priority}
          imgClassName="transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
        />
        <DiscountBadge
          price={product.price}
          compareAtPrice={product.compareAtPrice}
          className="absolute left-2.5 top-2.5"
        />
        {product.stock === 0 ? (
          <span className="absolute inset-x-0 bottom-0 bg-ink/80 py-1 text-center text-xs font-medium text-paper">
            Sold out
          </span>
        ) : null}
      </Link>
      <button
        type="button"
        onClick={() => wishlist.toggle(product.id)}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${product.title} from wishlist` : `Save ${product.title} to wishlist`}
        className="absolute right-2.5 top-2.5 z-10 grid size-8 place-items-center rounded-full bg-white/90 text-zinc-800 shadow-sm hover:bg-white"
      >
        <Heart className={cn('size-4', saved && 'fill-chilli text-chilli')} />
      </button>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate text-xs text-muted-fg">{product.brand ?? product.seller?.storeName}</p>
        <Link
          href={`/p/${product.slug}`}
          className="line-clamp-2 min-h-10 text-sm leading-snug after:absolute after:inset-0 after:content-[''] hover:underline"
        >
          {product.title}
        </Link>
        <Price price={product.price} compareAtPrice={product.compareAtPrice} className="mt-1" />
        <div className="mt-auto flex items-center gap-1.5 pt-1 text-xs text-muted-fg">
          {product.ratingCount > 0 ? (
            <span
              className="inline-flex items-center gap-0.5"
              aria-label={`Rated ${product.ratingAvg} out of 5`}
            >
              <Star className="size-3.5 fill-marigold text-marigold" aria-hidden />
              <span className="text-ink">{product.ratingAvg.toFixed(1)}</span>
            </span>
          ) : null}
          {product.ratingCount > 0 && product.salesCount > 0 ? (
            <span aria-hidden className="h-3 w-px bg-line" />
          ) : null}
          {product.salesCount > 0 ? <span>{formatSold(product.salesCount)} sold</span> : null}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, className }: { products: ProductCardDto[]; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5',
        className,
      )}
    >
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < 5} />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5"
      aria-busy="true"
      aria-label="Loading products"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-line bg-surface">
          <Skeleton className="aspect-square rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
