import { Skeleton } from '@/components/ui/misc';

export default function Loading() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
      <Skeleton className="aspect-square rounded-3xl" />
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-4/5" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-24" />
        <Skeleton className="h-12" />
      </div>
    </div>
  );
}
