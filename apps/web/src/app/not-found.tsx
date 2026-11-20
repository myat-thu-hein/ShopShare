import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';

export default function NotFound() {
  return (
    <EmptyState
      title="We couldn’t find that page"
      body="It may have been removed, or the link is wrong. Try describing what you were looking for instead."
      action={
        <Button asChild variant="accent">
          <Link href="/">Go to the homepage</Link>
        </Button>
      }
    />
  );
}
