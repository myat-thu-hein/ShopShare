'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock } from 'lucide-react';
import type { OrderDto } from '@shopsense/shared';
import { api } from '@/lib/api';
import { formatTHB } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, Panel, Skeleton } from '@/components/ui/misc';

/**
 * Stripe redirects here after payment. The webhook marks the order paid (usually within a
 * second), so we poll until it does. In mock mode we confirm the payment ourselves.
 */
export function CheckoutSuccess() {
  const params = useSearchParams();
  const group = params.get('group');
  const mock = params.get('mock') === '1';
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['checkout', group],
    queryFn: () =>
      mock
        ? api<OrderDto[]>(`/payments/mock/${group}/confirm`, { method: 'POST' })
        : api<OrderDto[]>(`/orders/checkout/${group}`),
    enabled: !!group,
    refetchInterval: (query) => (query.state.data?.some((o) => o.status === 'PENDING') ? 1500 : false),
  });

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['cart'] });
  }, [qc]);

  if (!group)
    return (
      <EmptyState
        title="No checkout found"
        action={
          <Button asChild>
            <Link href="/orders">See your orders</Link>
          </Button>
        }
      />
    );
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.isError || !q.data)
    return (
      <EmptyState
        title="We couldn’t load this checkout"
        body="If you paid, your order will appear in your orders shortly."
        action={
          <Button asChild>
            <Link href="/orders">See your orders</Link>
          </Button>
        }
      />
    );

  const orders = q.data;
  const pending = orders.some((o) => o.status === 'PENDING');
  const total = orders.reduce((s, o) => s + o.total, 0);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-start gap-4">
        {pending ? (
          <Clock className="size-10 shrink-0 text-marigold" aria-hidden />
        ) : (
          <CheckCircle2 className="size-10 shrink-0 text-teal" aria-hidden />
        )}
        <div>
          <h1 className="text-3xl">
            {pending ? 'Confirming your payment…' : 'Thank you — your order is confirmed'}
          </h1>
          <p className="mt-2 text-muted-fg" aria-live="polite">
            {pending
              ? 'This usually takes a few seconds.'
              : 'We’ve emailed your receipt. Sellers will ship your items soon.'}
            {mock ? ' (Demo mode: Stripe keys are not configured, so this payment was simulated.)' : ''}
          </p>
        </div>
      </div>
      <Panel className="mt-8 divide-y divide-line">
        {orders.map((o) => (
          <div key={o.id} className="p-5">
            <div className="flex items-center justify-between">
              <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                Order {o.number}
              </Link>
              <span className="text-sm text-muted-fg">{o.status}</span>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {o.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-4">
                  <span>
                    {i.title}{' '}
                    {i.variantLabel ? (
                      <span className="capitalize text-muted-fg">({i.variantLabel})</span>
                    ) : null}{' '}
                    × {i.quantity}
                  </span>
                  <span className="price">{formatTHB(i.unitPrice * i.quantity)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="flex justify-between p-5">
          <span className="font-medium">Total paid</span>
          <span className="price text-xl">{formatTHB(total)}</span>
        </div>
      </Panel>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link href="/orders">View orders</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Keep shopping</Link>
        </Button>
      </div>
    </div>
  );
}
