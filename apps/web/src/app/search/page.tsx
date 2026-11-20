import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchResults } from './search-results';
import { ProductGridSkeleton } from '@/components/product-card';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `“${q}”` : 'Search', robots: { index: false } };
}

export default function SearchPage() {
  return (
    <Suspense fallback={<ProductGridSkeleton />}>
      <SearchResults />
    </Suspense>
  );
}
