'use client';

import Link from 'next/link';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ProductDetailDto } from '@shopsense/shared';
import { api } from '@/lib/api';
import { ProductForm } from '@/components/product-form';
import { EmptyState, PageTitle, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useQuery({
    queryKey: ['seller', 'product', id],
    queryFn: () => api<ProductDetailDto>(`/seller/products/${id}`),
  });
  if (q.isLoading) return <Skeleton className="h-[600px]" />;
  if (!q.data)
    return (
      <EmptyState
        title="Product not found"
        action={
          <Button asChild>
            <Link href="/seller/products">Back to products</Link>
          </Button>
        }
      />
    );
  return (
    <div>
      <PageTitle
        title="Edit product"
        action={
          q.data.status === 'PUBLISHED' ? (
            <Button asChild variant="outline">
              <Link href={`/p/${q.data.slug}`}>View in shop</Link>
            </Button>
          ) : undefined
        }
      />
      <ProductForm product={q.data} />
    </div>
  );
}
