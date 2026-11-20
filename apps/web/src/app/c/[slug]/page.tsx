import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { CategoryDto, Paginated, ProductCardDto } from '@shopsense/shared';
import { serverGet } from '@/lib/server-api';
import { ProductGrid } from '@/components/product-card';
import { Pagination } from '@/components/pagination';
import { EmptyState } from '@/components/ui/misc';
import { Filters } from '@/components/filters';
import { ProductImage } from '@/components/product-image';

type Params = Promise<{ slug: string }>;
type Search = Promise<Record<string, string | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const c = await serverGet<CategoryDto>(`/categories/${slug}`, 600);
  if (!c) return { title: 'Category not found' };
  return {
    title: c.name,
    description: c.description ?? `Shop ${c.name} on ShopShare`,
    alternates: { canonical: `/c/${slug}` },
  };
}

const ALLOWED = ['page', 'sort', 'minPrice', 'maxPrice', 'minRating', 'inStock', 'colour', 'onSale'];

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const category = await serverGet<CategoryDto>(`/categories/${slug}`, 600);
  if (!category) notFound();

  const query = new URLSearchParams({ category: slug });
  for (const k of ALLOWED) if (sp[k]) query.set(k, sp[k]!);
  const data = await serverGet<Paginated<ProductCardDto>>(`/products?${query}`, 60);

  return (
    <div>
      <div className="flex items-center gap-5 rounded-3xl border border-line bg-surface p-5 sm:p-6">
        {category.imageUrl ? (
          <ProductImage
            src={category.imageUrl}
            alt=""
            className="size-20 shrink-0 rounded-2xl border border-line sm:size-24"
            imgClassName="p-2"
          />
        ) : null}
        <div>
          <h1 className="text-3xl sm:text-4xl">{category.name}</h1>
          {category.description ? <p className="mt-1 text-muted-fg">{category.description}</p> : null}
        </div>
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[240px_1fr]">
        <Filters basePath={`/c/${slug}`} />
        <section aria-label="Products">
          <p className="mb-6 text-sm text-muted-fg">{data ? `${data.total} products` : ''}</p>
          {!data ? (
            <EmptyState title="Products couldn’t load" body="The API may be offline. Refresh in a moment." />
          ) : data.items.length === 0 ? (
            <EmptyState
              title="No products match these filters"
              body="Try a wider price range or turn off “In stock only”."
            />
          ) : (
            <>
              <ProductGrid products={data.items} className="lg:grid-cols-3 xl:grid-cols-4" />
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                hrefFor={(p) => {
                  const next = new URLSearchParams();
                  for (const k of ALLOWED) if (sp[k]) next.set(k, sp[k]!);
                  next.set('page', String(p));
                  return `/c/${slug}?${next}`;
                }}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
