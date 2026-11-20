'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ROLES, type Role } from '@shopsense/shared';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge, PageTitle, Skeleton } from '@/components/ui/misc';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  isBanned: boolean;
  isDemo: boolean;
  createdAt: string;
  _count: { orders: number };
}

export default function AdminUsers() {
  const me = useAuth((s) => s.user);
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'users', role, search, page],
    queryFn: () =>
      api<{ items: UserRow[]; totalPages: number; total: number }>(
        `/admin/users?page=${page}${role ? `&role=${role}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
    placeholderData: (p) => p,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { role?: Role; isBanned?: boolean } }) =>
      api(`/admin/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      toast.success('User updated');
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageTitle title="Users" description={q.data ? `${q.data.total} accounts` : undefined} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Search name or email"
          aria-label="Search users"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          aria-label="Filter by role"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r.toLowerCase()}
            </option>
          ))}
        </Select>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-muted-fg">
              <tr>
                <th className="p-3 font-medium">User</th>
                <th className="p-3 font-medium">Role</th>
                <th className="p-3 font-medium">Joined</th>
                <th className="p-3 text-right font-medium">Orders</th>
                <th className="p-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.data?.items.map((u) => {
                const locked = u.isDemo || u.id === me?.id;
                return (
                  <tr key={u.id} className={u.isBanned ? 'opacity-60' : ''}>
                    <td className="p-3">
                      <span className="font-medium">{u.name}</span>
                      {u.isDemo ? <Badge className="ml-2">demo</Badge> : null}
                      {u.isBanned ? (
                        <Badge tone="danger" className="ml-2">
                          banned
                        </Badge>
                      ) : null}
                      <span className="block text-muted-fg">{u.email}</span>
                    </td>
                    <td className="p-3">
                      <Select
                        aria-label={`Role for ${u.name}`}
                        value={u.role}
                        disabled={locked}
                        onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value as Role } })}
                        className="h-8"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r.toLowerCase()}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="p-3 text-muted-fg">{formatDate(u.createdAt)}</td>
                    <td className="p-3 text-right tabular-nums">{u._count.orders}</td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        variant={u.isBanned ? 'outline' : 'ghost'}
                        disabled={locked}
                        onClick={() => update.mutate({ id: u.id, body: { isBanned: !u.isBanned } })}
                      >
                        {u.isBanned ? 'Unban' : 'Ban'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {q.data && q.data.totalPages > 1 ? (
        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= q.data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
