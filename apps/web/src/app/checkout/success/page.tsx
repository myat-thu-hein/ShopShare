import { Suspense } from 'react';
import { CheckoutSuccess } from './success';
import { Skeleton } from '@/components/ui/misc';

export const metadata = { title: 'Order confirmed', robots: { index: false } };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <CheckoutSuccess />
    </Suspense>
  );
}
