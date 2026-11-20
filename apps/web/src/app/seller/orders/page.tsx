'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { toast } from 'sonner';
import type { OrderDto, OrderStatus, Paginated } from '@shopsense/shared';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatTHB } from '@/lib/utils';
import { OrderStatusBadge } from '@/components/order-status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { EmptyState, PageTitle, Skeleton } from '@/components/ui/misc';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const FILTERS: { value: string; label: string }[] = [
  { value: 'PAID', label: 'To ship' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'ALL', label: 'All' },
];

export default function SellerOrders() {
  const [filter, setFilter] = useState('PAID');
  const [page, setPage] = useState(1);
  const [shipping, setShipping] = useState<OrderDto | null>(null);
  const [tracking, setTracking] = useState('');
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['seller', 'orders', filter, page],
    queryFn: () =>
      api<Paginated<OrderDto>>(`/seller/orders?page=${page}${filter !== 'ALL' ? `&status=${filter}` : ''}`),
    placeholderData: (p) => p,
  });
  const update = useMutation({
    mutationFn: ({
      id,
      status,
      trackingNumber,
    }: {
      id: string;
      status: OrderStatus;
      trackingNumber?: string;
    }) => api<OrderDto>(`/orders/${id}/status`, { method: 'PATCH', body: { status, trackingNumber } }),
    onSuccess: (o) => {
      toast.success(`Order ${o.number} marked ${o.status.toLowerCase()}`);
      setShipping(null);
      setTracking('');
      qc.invalidateQueries({ queryKey: ['seller'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageTitle title="Orders" description="Only the items you sell are shown." />
      <Tabs
        value={filter}
        onValueChange={(v) => {
          setFilter(v);
          setPage(1);
        }}
      >
        <TabsList className="mb-6 flex-wrap">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {list.isLoading ? (
        <Skeleton className="h-64" />
      ) : !list.data?.items.length ? (
        <EmptyState
          icon={<Inbox />}
          title="No orders here"
          body={filter === 'PAID' ? 'New paid orders will appear here, ready to ship.' : 'Try another tab.'}
        />
      ) : (
        <ul className="space-y-3">
          {list.data.items.map((o) => (
            <li key={o.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{o.number}</span>
                <OrderStatusBadge status={o.status} />
                <span className="text-sm text-muted-fg">
                  {formatDate(o.createdAt)}, {o.buyer?.name}
                </span>
                <span className="price ml-auto">{formatTHB(o.total)}</span>
              </div>
              <ul className="mt-2 text-sm text-muted-fg">
                {o.items.map((i) => (
                  <li key={i.id}>
                    {i.quantity} × {i.title}
                    {i.variantLabel ? <span className="capitalize"> ({i.variantLabel})</span> : null}
                  </li>
                ))}
              </ul>
              {o.trackingNumber ? <p className="mt-1 text-xs">Tracking: {o.trackingNumber}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {o.status === 'PAID' ? (
                  <>
                    <Button size="sm" onClick={() => setShipping(o)}>
                      Mark as shipped
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-chilli"
                      onClick={() =>
                        confirm('Cancel this order? Stock goes back on sale and the buyer is refunded.') &&
                        update.mutate({ id: o.id, status: 'CANCELLED' })
                      }
                    >
                      Cancel and refund
                    </Button>
                  </>
                ) : null}
                {o.status === 'SHIPPED' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => update.mutate({ id: o.id, status: 'DELIVERED' })}
                  >
                    Mark as delivered
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {list.data && list.data.totalPages > 1 ? (
        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= list.data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}

      <Dialog open={!!shipping} onOpenChange={(o) => !o && setShipping(null)}>
        <DialogContent
          title={`Ship order ${shipping?.number ?? ''}`}
          description="The buyer gets an email with the tracking number."
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (shipping)
                update.mutate({ id: shipping.id, status: 'SHIPPED', trackingNumber: tracking || undefined });
            }}
          >
            <Input
              aria-label="Tracking number"
              placeholder="Tracking number (optional)"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              autoFocus
            />
            <Button type="submit" disabled={update.isPending} className="w-full">
              Confirm shipment
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
