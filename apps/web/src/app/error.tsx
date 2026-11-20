'use client';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // In development show the real error, so a code bug is never mistaken for a sleeping server.
  const body =
    process.env.NODE_ENV === 'development'
      ? `${error.name}: ${error.message}`
      : 'Something went wrong while loading this page. If the site was idle, the server may be waking up — try again in a few seconds.';
  return (
    <EmptyState
      title="This page failed to load"
      body={body}
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
