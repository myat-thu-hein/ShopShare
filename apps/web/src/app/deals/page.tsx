import type { Metadata } from 'next';
import { Zap } from 'lucide-react';
import type { Paginated, ProductCardDto } from '@shopsense/shared';
import { serverGet } from '@/lib/server-api';
import { ProductGrid } from '@/components/product-card';
import { Pagination } from '@/components/pagination';
import { EmptyState } from '@/components/ui/misc';
import { Countdown } from '@/components/home/countdown';

export const metadata: Metadata = {
  title: 'Today’s deals',
  description: 'Discounted products from every ShopShare store.',
};
export const dynamic = 'force-dynamic';

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Number((await searchParams).page ?? 1) || 1;
  const data = await serverGet<Paginated<ProductCardDto>>(
    `/products?onSale=true&sort=popular&limit=30&page=${page}`,
    120,
  );
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center gap-4 rounded-3xl bg-chilli p-6 text-white sm:p-8">
        <Zap className="size-10 fill-white" aria-hidden />
        <div className="flex-1">
          <h1 className="text-3xl sm:text-4xl">Today’s deals</h1>
          <p className="mt-1 text-white/85">
            {data ? `${data.total} products on sale` : 'Discounts from every store'}. New deals at midnight.
          </p>
        </div>
        <Countdown />
      </div>
      {!data?.items.length ? (
        <EmptyState title="No deals right now" body="Check back after midnight for new discounts." />
      ) : (
        <>
          <ProductGrid products={data.items} />
          <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(p) => `/deals?page=${p}`} />
        </>
      )}
    </div>
  );
}
