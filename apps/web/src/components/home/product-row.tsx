import Link from 'next/link';
import type { ProductCardDto } from '@shopsense/shared';
import { ProductGrid } from '../product-card';

export function ProductRow({
  title,
  subtitle,
  href,
  products,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  products: ProductCardDto[] | null;
}) {
  if (!products?.length) return null;
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <section className="mt-14" aria-labelledby={id}>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 id={id} className="text-2xl">
            {title}
          </h2>
          {subtitle ? <p className="mt-1 text-sm text-muted-fg">{subtitle}</p> : null}
        </div>
        {href ? (
          <Link href={href} className="shrink-0 text-sm font-medium text-teal hover:underline">
            See all
          </Link>
        ) : null}
      </div>
      <ProductGrid products={products} />
    </section>
  );
}
