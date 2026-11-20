import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';

export const metadata = { title: 'Checkout cancelled', robots: { index: false } };

export default function CheckoutCancel() {
  return (
    <EmptyState
      title="Payment cancelled"
      body="You haven’t been charged. Your items stay reserved for a short while — you can pay for the order from your orders page, or cancel it there to release the items."
      action={
        <div className="flex gap-3">
          <Button asChild>
            <Link href="/orders">Go to orders</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Keep shopping</Link>
          </Button>
        </div>
      }
    />
  );
}
