'use client';

import { useQuery } from '@tanstack/react-query';
import type { ProductCardDto } from '@shopsense/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { ProductGrid, ProductGridSkeleton } from './product-card';

/** "Recommended for you": built from this buyer's views and purchases. Hidden for guests. */
export function RecommendedForYou() {
  const { status, user } = useAuth();
  const q = useQuery({
    queryKey: ['recommendations', 'for-you'],
    queryFn: () =>
      api<{ items: ProductCardDto[]; personalised: boolean }>('/recommendations/for-you?limit=10'),
    enabled: status === 'authenticated',
  });
  if (status !== 'authenticated') return null;
  if (q.isLoading) {
    return (
      <section className="mt-16">
        <h2 className="mb-6 text-2xl">Recommended for you</h2>
        <ProductGridSkeleton count={5} />
      </section>
    );
  }
  if (!q.data?.items.length) return null;
  return (
    <section className="mt-16" aria-labelledby="recommended">
      <h2 id="recommended" className="text-2xl">
        Recommended for you
      </h2>
      <p className="mb-6 mt-1 text-sm text-muted-fg">
        {q.data.personalised
          ? `Based on what you've looked at and bought, ${user?.name.split(' ')[0]}.`
          : 'Popular right now — browse a few products and this will learn your taste.'}
      </p>
      <ProductGrid products={q.data.items} />
    </section>
  );
}
