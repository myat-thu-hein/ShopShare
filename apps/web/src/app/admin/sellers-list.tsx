'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Skeleton } from '@/components/ui/misc';

interface SellerRow {
  userId: string;
  storeName: string;
  slug: string;
  description: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  user: { email: string; name: string; isBanned: boolean };
}

export function SellersList({ status }: { status?: 'PENDING' }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'sellers', status ?? 'all'],
    queryFn: () => api<SellerRow[]>(`/admin/sellers${status ? `?status=${status}` : ''}`),
  });
  const set = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: SellerRow['status'] }) =>
      api(`/admin/sellers/${userId}`, { method: 'PATCH', body: { status } }),
    onSuccess: (_d, v) => {
      toast.success(
        v.status === 'APPROVED' ? 'Seller approved' : v.status === 'REJECTED' ? 'Seller rejected' : 'Updated',
      );
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading) return <Skeleton className="h-40" />;
  if (!q.data?.length)
    return (
      <EmptyState
        title={status ? 'No stores waiting for approval' : 'No sellers yet'}
        body={status ? 'New store applications will appear here.' : undefined}
      />
    );
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {q.data.map((s) => (
        <li key={s.userId} className="flex flex-wrap items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{s.storeName}</span>
              <Badge tone={s.status === 'APPROVED' ? 'teal' : s.status === 'PENDING' ? 'accent' : 'danger'}>
                {s.status.toLowerCase()}
              </Badge>
            </div>
            <p className="text-sm text-muted-fg">
              {s.user.name} ({s.user.email}), applied {formatDate(s.createdAt)}
            </p>
            {s.description ? <p className="mt-1 text-sm">{s.description}</p> : null}
          </div>
          <div className="flex gap-2">
            {s.status !== 'APPROVED' ? (
              <Button size="sm" onClick={() => set.mutate({ userId: s.userId, status: 'APPROVED' })}>
                Approve
              </Button>
            ) : null}
            {s.status !== 'REJECTED' ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => set.mutate({ userId: s.userId, status: 'REJECTED' })}
              >
                {s.status === 'APPROVED' ? 'Suspend store' : 'Reject'}
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
