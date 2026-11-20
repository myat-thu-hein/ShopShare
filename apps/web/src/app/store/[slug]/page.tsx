import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Paginated, ProductCardDto } from '@shopsense/shared';
import { serverGet } from '@/lib/server-api';
import { formatDate } from '@/lib/utils';
import { ProductGrid } from '@/components/product-card';
import { Pagination } from '@/components/pagination';
import { Stars } from '@/components/stars';
import { EmptyState } from '@/components/ui/misc';

interface Store {
  storeName: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  memberSince: string;
  productCount: number;
  avgRating: number;
  totalSales: number;
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const s = await serverGet<Store>(`/stores/${slug}`, 300);
  return s
    ? { title: s.storeName, description: s.description ?? `Shop ${s.storeName} on ShopShare` }
    : { title: 'Store not found' };
}

export default async function StorePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ page?: string; sort?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const store = await serverGet<Store>(`/stores/${slug}`, 300);
  if (!store) notFound();
  const page = Number(sp.page ?? 1) || 1;
  const products = await serverGet<Paginated<ProductCardDto>>(
    `/products?seller=${slug}&page=${page}&sort=${sp.sort ?? 'popular'}`,
    120,
  );

  return (
    <div>
      <section className="rounded-3xl bg-ink p-8 text-paper sm:p-12">
        <div className="flex flex-wrap items-center gap-5">
          <div
            className="grid size-16 place-items-center rounded-2xl bg-marigold font-display text-3xl font-bold text-marigold-fg"
            aria-hidden
          >
            {store.storeName.charAt(0)}
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl">{store.storeName}</h1>
            <p className="mt-1 text-paper/70">
              On ShopShare since {formatDate(store.memberSince, { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
        {store.description ? <p className="mt-6 max-w-2xl text-paper/85">{store.description}</p> : null}
        <dl className="mt-8 flex flex-wrap gap-10">
          <div>
            <dt className="text-sm text-paper/60">Products</dt>
            <dd className="price text-2xl">{store.productCount}</dd>
          </div>
          <div>
            <dt className="text-sm text-paper/60">Items sold</dt>
            <dd className="price text-2xl">{store.totalSales.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-sm text-paper/60">Average rating</dt>
            <dd className="flex items-center gap-2">
              <span className="price text-2xl">{store.avgRating || '–'}</span>
              {store.avgRating ? <Stars value={store.avgRating} /> : null}
            </dd>
          </div>
        </dl>
      </section>
      <section className="mt-10" aria-label="Products">
        {!products?.items.length ? (
          <EmptyState title="No products yet" body="This store hasn’t published anything yet." />
        ) : (
          <>
            <ProductGrid products={products.items} />
            <Pagination
              page={products.page}
              totalPages={products.totalPages}
              hrefFor={(p) => `/store/${slug}?page=${p}`}
            />
          </>
        )}
      </section>
    </div>
  );
}
