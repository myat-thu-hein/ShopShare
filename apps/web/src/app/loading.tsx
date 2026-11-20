import { ProductGridSkeleton } from '@/components/product-card';
import { Skeleton } from '@/components/ui/misc';

export default function Loading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-72" />
      <ProductGridSkeleton />
    </div>
  );
}
