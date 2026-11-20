'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import type { ProductCardDto } from '@shopsense/shared';
import { api } from '@/lib/api';
import { ProductGrid, ProductGridSkeleton } from '@/components/product-card';
import { Button } from '@/components/ui/button';
import { EmptyState, PageTitle } from '@/components/ui/misc';
import { RoleGate } from '@/components/role-gate';

export default function WishlistPage() {
  const q = useQuery({ queryKey: ['wishlist', 'list'], queryFn: () => api<ProductCardDto[]>('/wishlist') });
  return (
    <RoleGate roles={['BUYER', 'SELLER']}>
      <PageTitle title="Wishlist" description="Products you saved for later." />
      {q.isLoading ? (
        <ProductGridSkeleton count={4} />
      ) : !q.data?.length ? (
        <EmptyState
          icon={<Heart />}
          title="Nothing saved yet"
          body="Tap the heart on any product to keep it here."
          action={
            <Button asChild variant="accent">
              <Link href="/">Browse products</Link>
            </Button>
          }
        />
      ) : (
        <ProductGrid products={q.data} />
      )}
    </RoleGate>
  );
}
