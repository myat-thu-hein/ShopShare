'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import type { SellerStatsDto } from '@shopsense/shared';
import { api } from '@/lib/api';
import { formatTHB } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import { RevenueChart, Stat } from '@/components/revenue-chart';
import { Button } from '@/components/ui/button';
import { PageTitle, Panel, Skeleton } from '@/components/ui/misc';

export default function SellerOverview() {
  const user = useAuth((s) => s.user);
  const q = useQuery({
    queryKey: ['seller', 'stats'],
    queryFn: () => api<SellerStatsDto>('/seller/stats?days=30'),
  });
  const s = q.data;

  return (
    <div>
      <PageTitle
        title="Overview"
        description="Your last 30 days."
        action={
          <Button asChild variant="accent">
            <Link href="/seller/products/new">Add product</Link>
          </Button>
        }
      />
      {user?.sellerStatus === 'PENDING' ? (
        <p className="mb-6 rounded-2xl bg-marigold-soft p-4 text-sm">
          Your store is waiting for admin approval. You can add products as drafts now; publishing unlocks
          after approval.
        </p>
      ) : null}
      {!s ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
          <Skeleton className="h-72 sm:col-span-2 xl:col-span-4" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Revenue" value={formatTHB(s.revenue)} hint="Paid, shipped and delivered orders" />
            <Stat label="Orders" value={String(s.orders)} />
            <Stat label="Published products" value={String(s.productsPublished)} />
            <Stat label="Average rating" value={s.avgRating ? `${s.avgRating}★` : '–'} />
          </div>
          <Panel className="mt-6 p-5">
            <h2 className="mb-4 text-lg">Revenue</h2>
            <RevenueChart data={s.revenueByDay} />
          </Panel>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Panel className="p-5">
              <h2 className="text-lg">Top products</h2>
              {s.topProducts.length ? (
                <ol className="mt-3 divide-y divide-line">
                  {s.topProducts.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className="w-5 text-muted-fg">{i + 1}</span>
                      <Link href={`/p/${p.slug}`} className="flex-1 truncate hover:underline">
                        {p.title}
                      </Link>
                      <span className="text-muted-fg">{p.unitsSold} sold</span>
                      <span className="price w-24 text-right">{formatTHB(p.revenue)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-sm text-muted-fg">No sales in this period yet.</p>
              )}
            </Panel>
            <Panel className="p-5">
              <h2 className="flex items-center gap-2 text-lg">
                <AlertTriangle className="size-4 text-chilli" aria-hidden /> Low stock
              </h2>
              {s.lowStock.length ? (
                <ul className="mt-3 divide-y divide-line">
                  {s.lowStock.map((p, i) => (
                    <li key={`${p.id}-${i}`} className="flex items-center gap-3 py-2.5 text-sm">
                      <Link href={`/seller/products/${p.id}`} className="flex-1 truncate hover:underline">
                        {p.title}
                        {p.variant ? <span className="capitalize text-muted-fg"> ({p.variant})</span> : null}
                      </Link>
                      <span className={p.stock === 0 ? 'font-medium text-chilli' : 'text-muted-fg'}>
                        {p.stock === 0 ? 'Sold out' : `${p.stock} left`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-fg">Everything is well stocked.</p>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
