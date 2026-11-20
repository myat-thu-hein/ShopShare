'use client';

import Link from 'next/link';
import { use } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import type { OrderDto } from '@shopsense/shared';
import { api, errorMessage } from '@/lib/api';
import { cn, formatDateTime, formatTHB, imageUrl } from '@/lib/utils';
import { OrderStatusBadge, STEPS } from '@/components/order-status';
import { Button } from '@/components/ui/button';
import { EmptyState, Panel, Skeleton } from '@/components/ui/misc';

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api<OrderDto>(`/orders/${id}`) });
  const cancel = useMutation({
    mutationFn: () => api(`/orders/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Order cancelled and items released');
      qc.invalidateQueries({ queryKey: ['order', id] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (!q.data)
    return (
      <EmptyState
        title="Order not found"
        action={
          <Button asChild>
            <Link href="/orders">All orders</Link>
          </Button>
        }
      />
    );
  const o = q.data;
  const stepIndex = STEPS.indexOf(o.status);
  const addr = o.shippingAddress as Record<string, string> | null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/orders" className="text-sm text-teal hover:underline">
        All orders
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl">Order {o.number}</h1>
        <OrderStatusBadge status={o.status} />
      </div>
      <p className="mt-1 text-muted-fg">Placed {formatDateTime(o.createdAt)}</p>

      {o.status !== 'CANCELLED' ? (
        <ol className="mt-8 grid grid-cols-4 gap-2" aria-label="Order progress">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-col gap-2">
              <span className={cn('h-1.5 rounded-full', i <= stepIndex ? 'bg-teal' : 'bg-muted')} />
              <span
                className={cn(
                  'flex items-center gap-1 text-xs',
                  i <= stepIndex ? 'text-ink' : 'text-muted-fg',
                )}
              >
                {i <= stepIndex ? <Check className="size-3" aria-hidden /> : null}
                {['Ordered', 'Paid', 'Shipped', 'Delivered'][i]}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {o.trackingNumber ? (
        <p className="mt-6 text-sm">
          Tracking number: <strong>{o.trackingNumber}</strong>
        </p>
      ) : null}

      <Panel className="mt-6 divide-y divide-line">
        {o.items.map((i) => (
          <div key={i.id} className="flex items-center gap-4 p-4">
            <img
              src={imageUrl(i.imageUrl, 400)}
              alt=""
              className="size-16 rounded-xl border border-line bg-white object-contain p-1"
            />
            <div className="min-w-0 flex-1">
              {i.productSlug ? (
                <Link href={`/p/${i.productSlug}`} className="font-medium hover:underline">
                  {i.title}
                </Link>
              ) : (
                <span className="font-medium">{i.title}</span>
              )}
              <p className="text-sm text-muted-fg">
                {i.variantLabel ? <span className="capitalize">{i.variantLabel}, </span> : null}
                {formatTHB(i.unitPrice)} × {i.quantity}
              </p>
              {['PAID', 'SHIPPED', 'DELIVERED'].includes(o.status) && i.productSlug && !o.buyer ? (
                <Link href={`/p/${i.productSlug}#reviews`} className="text-xs text-teal hover:underline">
                  Write a review
                </Link>
              ) : null}
            </div>
            <span className="price">{formatTHB(i.unitPrice * i.quantity)}</span>
          </div>
        ))}
        <div className="flex justify-between p-4">
          <span className="font-medium">Total</span>
          <span className="price text-xl">{formatTHB(o.total)}</span>
        </div>
      </Panel>

      {addr ? (
        <div className="mt-6 text-sm">
          <h2 className="mb-1 text-base">Shipping to</h2>
          <p className="text-muted-fg">
            {[addr.name, addr.line1, addr.line2, addr.city, addr.postal_code, addr.country]
              .filter(Boolean)
              .join(', ')}
          </p>
        </div>
      ) : null}

      {o.status === 'PENDING' && !o.buyer ? (
        <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-line p-4">
          <p className="flex-1 text-sm text-muted-fg">
            This order hasn’t been paid. Cancel it to release the items for other shoppers.
          </p>
          <Button variant="destructive" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            Cancel order
          </Button>
        </div>
      ) : null}
    </div>
  );
}
