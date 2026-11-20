'use client';

import Link from 'next/link';
import type { Role } from '@shopsense/shared';
import { useAuth } from '@/stores/auth';
import { Skeleton, EmptyState } from './ui/misc';
import { Button } from './ui/button';

/**
 * Client-side role check (the middleware already redirected anonymous visitors, and the
 * API enforces roles on every request — this just shows the right screen).
 */
export function RoleGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, status } = useAuth();
  if (status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!user) {
    return (
      <EmptyState
        title="Please log in"
        body="You need an account to see this page."
        action={
          <Button asChild>
            <Link href="/login">Log in</Link>
          </Button>
        }
      />
    );
  }
  if (user.role !== 'ADMIN' && !roles.includes(user.role)) {
    return (
      <EmptyState
        title="This area isn't available for your account"
        body={`It is for ${roles.join(' or ').toLowerCase()} accounts.`}
        action={
          <Button asChild variant="outline">
            <Link href="/">Back to shopping</Link>
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}
