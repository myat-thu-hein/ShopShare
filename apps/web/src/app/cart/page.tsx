'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatTHB, imageUrl } from '@/lib/utils';
import { useCart } from '@/hooks/use-cart';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { EmptyState, Panel, PageTitle, Skeleton } from '@/components/ui/misc';

export default function CartPage() {
  const cart = useCart();
  const { user, status } = useAuth();
  const router = useRouter();

  const checkout = useMutation({
    mutationFn: () => api<{ url: string; mode: 'stripe' | 'mock' }>('/payments/checkout', { method: 'POST' }),
    onSuccess: ({ url }) => {
      if (url.startsWith('/')) router.push(url);
      else window.location.href = url; // Stripe-hosted checkout
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const problems = cart.items.filter((i) => i.quantity > i.available);

  if (cart.isLoading || status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  }

  if (!cart.items.length) {
    return (
      <EmptyState
        icon={<ShoppingBag />}
        title="Your cart is empty"
        body="Describe what you need in the search bar, or browse a category."
        action={
          <Button asChild variant="accent">
            <Link href="/">Start shopping</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <PageTitle title="Cart" description={`${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'}`} />
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {cart.items.map((item) => (
            <li key={item.id} className="flex gap-4 p-4">
              <Link href={`/p/${item.slug}`} className="shrink-0">
                <img
                  src={imageUrl(item.imageUrl, 400)}
                  alt=""
                  className="size-24 rounded-xl border border-line bg-white object-contain p-1"
                />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <Link href={`/p/${item.slug}`} className="font-medium hover:underline">
                  {item.title}
                </Link>
                {item.variantLabel ? (
                  <span className="text-sm capitalize text-muted-fg">{item.variantLabel}</span>
                ) : null}
                {item.available === 0 ? (
                  <span className="text-sm text-chilli">No longer available — please remove it</span>
                ) : item.quantity > item.available ? (
                  <span className="text-sm text-chilli">
                    Only {item.available} left — reduce the quantity
                  </span>
                ) : null}
                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <div
                    className="flex items-center rounded-xl border border-line"
                    role="group"
                    aria-label={`Quantity of ${item.title}`}
                  >
                    <button
                      className="grid size-9 place-items-center"
                      onClick={() => cart.setQuantity(item, item.quantity - 1)}
                      aria-label="Decrease"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-7 text-center text-sm tabular-nums">{item.quantity}</span>
                    <button
                      className="grid size-9 place-items-center disabled:opacity-30"
                      disabled={item.quantity >= item.available}
                      onClick={() => cart.setQuantity(item, item.quantity + 1)}
                      aria-label="Increase"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <span className="price">{formatTHB(item.unitPrice * item.quantity)}</span>
                  <button
                    onClick={() => cart.remove(item)}
                    className="rounded-lg p-2 text-muted-fg hover:bg-muted hover:text-chilli"
                    aria-label={`Remove ${item.title}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <Panel className="h-fit p-6 lg:sticky lg:top-32">
          <h2 className="text-lg">Order summary</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-fg">Subtotal</dt>
              <dd className="price">{formatTHB(cart.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-fg">Shipping</dt>
              <dd>Free</dd>
            </div>
          </dl>
          <div className="mt-4 flex justify-between border-t border-line pt-4">
            <span className="font-medium">Total</span>
            <span className="price text-2xl">{formatTHB(cart.subtotal)}</span>
          </div>
          {!user ? (
            <Button asChild variant="accent" size="lg" className="mt-6 w-full">
              <Link href="/login?next=/cart">Log in to check out</Link>
            </Button>
          ) : (
            <Button
              variant="accent"
              size="lg"
              className="mt-6 w-full"
              disabled={checkout.isPending || problems.length > 0}
              onClick={() => checkout.mutate()}
            >
              {checkout.isPending ? 'Reserving your items…' : 'Check out'}
            </Button>
          )}
          <p className="mt-3 text-xs text-muted-fg">
            Items are reserved for 35 minutes while you pay. Test card: 4242 4242 4242 4242, any future date
            and CVC.
          </p>
        </Panel>
      </div>
    </div>
  );
}
