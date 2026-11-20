'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import type { OrderDto, Paginated } from '@shopsense/shared';
import { api } from '@/lib/api';
import { formatDate, formatTHB, imageUrl } from '@/lib/utils';
import { OrderStatusBadge } from '@/components/order-status';
import { Button } from '@/components/ui/button';
import { EmptyState, PageTitle, Skeleton } from '@/components/ui/misc';
import { RoleGate } from '@/components/role-gate';

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['orders', page],
    queryFn: () => api<Paginated<OrderDto>>(`/orders?page=${page}`),
    placeholderData: (p) => p,
  });
  return (
    <RoleGate roles={['BUYER', 'SELLER']}>
      <PageTitle title="Your orders" />
      {q.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : !q.data?.items.length ? (
        <EmptyState
          icon={<Package />}
          title="No orders yet"
          body="When you buy something, it will show up here with its delivery status."
          action={
            <Button asChild variant="accent">
              <Link href="/">Start shopping</Link>
            </Button>
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {q.data.items.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/orders/${o.id}`}
                  className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface p-4 hover:border-ink/40"
                >
                  <div className="flex -space-x-3">
                    {o.items.slice(0, 3).map((i) => (
                      <img
                        key={i.id}
                        src={imageUrl(i.imageUrl, 400)}
                        alt=""
                        className="size-14 rounded-xl border-2 border-surface border border-line bg-white object-contain p-1"
                      />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">Order {o.number}</p>
                    <p className="text-sm text-muted-fg">
                      {formatDate(o.createdAt)}, {o.items.length} item{o.items.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <OrderStatusBadge status={o.status} />
                  <span className="price w-28 text-right">{formatTHB(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {q.data.totalPages > 1 ? (
            <div className="mt-6 flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Newer
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= q.data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Older
              </Button>
            </div>
          ) : null}
        </>
      )}
    </RoleGate>
  );
}
