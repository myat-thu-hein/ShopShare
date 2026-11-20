import Link from 'next/link';
import { Zap } from 'lucide-react';
import { discountPercent, formatSold, type ProductCardDto } from '@shopsense/shared';
import { formatTHB } from '@/lib/utils';
import { ProductImage } from '../product-image';
import { Countdown } from './countdown';

/** Horizontal strip of today's biggest discounts, with a "sold" bar like Thai marketplaces. */
export function FlashDeals({ products }: { products: ProductCardDto[] }) {
  if (!products.length) return null;
  const sorted = [...products].sort(
    (a, b) =>
      (discountPercent(b.price, b.compareAtPrice) ?? 0) - (discountPercent(a.price, a.compareAtPrice) ?? 0),
  );
  const maxSold = Math.max(...sorted.map((p) => p.salesCount), 1);
  return (
    <section
      aria-labelledby="flash-deals"
      className="mt-10 rounded-3xl border border-line bg-surface p-5 sm:p-6"
    >
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="flash-deals" className="flex items-center gap-2 text-2xl text-chilli">
          <Zap className="size-6 fill-chilli" aria-hidden /> Flash deals
        </h2>
        <span className="text-sm text-muted-fg">Ends in</span>
        <Countdown />
        <Link href="/deals" className="ml-auto text-sm font-medium text-teal hover:underline">
          See all deals
        </Link>
      </div>
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 scrollbar-none">
        {sorted.map((p) => {
          const off = discountPercent(p.price, p.compareAtPrice);
          const pct = Math.max(12, Math.round((p.salesCount / maxSold) * 100));
          return (
            <li key={p.id} className="w-40 shrink-0 snap-start sm:w-44">
              <Link href={`/p/${p.slug}`} className="group block">
                <div className="relative overflow-hidden rounded-2xl border border-line">
                  <ProductImage
                    src={p.imageUrl}
                    alt={p.title}
                    imgClassName="transition-transform group-hover:scale-105 motion-reduce:transition-none"
                  />
                  {off ? (
                    <span className="absolute left-2 top-2 rounded-md bg-chilli px-1.5 py-0.5 text-xs font-bold text-white">
                      -{off}%
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 line-clamp-1 text-sm">{p.title}</p>
                <p className="price text-lg text-chilli">{formatTHB(p.price)}</p>
                <div
                  className="relative mt-1 h-4 overflow-hidden rounded-full bg-chilli/15"
                  aria-label={`${formatSold(p.salesCount)} sold`}
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-chilli to-marigold"
                    style={{ width: `${pct}%` }}
                  />
                  <span className="relative block text-center text-[10px] font-semibold leading-4 text-white mix-blend-normal [text-shadow:0_0_2px_rgba(0,0,0,.5)]">
                    {formatSold(p.salesCount)} sold
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
