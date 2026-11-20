'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AuthUser } from '@shopsense/shared';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { RoleGate } from '@/components/role-gate';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge, PageTitle, Panel } from '@/components/ui/misc';

type Profile = AuthUser & {
  createdAt: string;
  counts: { orders: number; reviews: number; wishlist: number };
};

export default function ProfilePage() {
  const { setUser, logout } = useSession();
  const q = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/users/me') });
  const [name, setName] = useState('');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [store, setStore] = useState({ storeName: '', description: '' });
  useEffect(() => setName(q.data?.name ?? ''), [q.data]);

  const save = useMutation({
    mutationFn: () => api<AuthUser>('/users/me', { method: 'PATCH', body: { name } }),
    onSuccess: (u) => {
      setUser(u);
      toast.success('Profile saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const changePw = useMutation({
    mutationFn: () => api('/auth/password', { method: 'POST', body: pw }),
    onSuccess: () => {
      toast.success('Password changed. Please log in again.');
      logout();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const apply = useMutation({
    mutationFn: () => api<{ message: string }>('/seller/apply', { method: 'POST', body: store }),
    onSuccess: (r) => {
      toast.success(r.message);
      q.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const p = q.data;
  return (
    <RoleGate roles={['BUYER', 'SELLER']}>
      <PageTitle
        title="Profile"
        description={
          p ? `Member since ${formatDate(p.createdAt, { month: 'long', year: 'numeric' })}` : undefined
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <h2 className="text-lg">Account</h2>
            {p ? <Badge tone="accent">{p.role.toLowerCase()}</Badge> : null}
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Name" htmlFor="pname">
              <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} minLength={2} />
            </Field>
            <Field label="Email" htmlFor="pemail">
              <Input id="pemail" value={p?.email ?? ''} disabled />
            </Field>
            <Button type="submit" disabled={save.isPending}>
              Save changes
            </Button>
          </form>
          {p ? (
            <p className="text-sm text-muted-fg">
              <Link href="/orders" className="text-teal hover:underline">
                {p.counts.orders} orders
              </Link>
              ,{' '}
              <Link href="/wishlist" className="text-teal hover:underline">
                {p.counts.wishlist} saved
              </Link>
              , {p.counts.reviews} reviews written.
            </p>
          ) : null}
        </Panel>

        <Panel className="p-6">
          <h2 className="text-lg">Change password</h2>
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              changePw.mutate();
            }}
          >
            <Field label="Current password" htmlFor="cur">
              <Input
                id="cur"
                type="password"
                autoComplete="current-password"
                value={pw.currentPassword}
                onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
              />
            </Field>
            <Field label="New password" htmlFor="new" hint="At least 8 characters">
              <Input
                id="new"
                type="password"
                autoComplete="new-password"
                value={pw.newPassword}
                onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
                minLength={8}
              />
            </Field>
            <Button
              type="submit"
              variant="outline"
              disabled={changePw.isPending || pw.newPassword.length < 8}
            >
              Change password
            </Button>
          </form>
        </Panel>

        {p?.role === 'BUYER' ? (
          <Panel className="p-6 lg:col-span-2">
            <h2 className="text-lg">Sell on ShopShare</h2>
            <p className="mt-1 text-sm text-muted-fg">
              Open a store. An admin reviews new stores before they go live.
            </p>
            <form
              className="mt-4 grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                apply.mutate();
              }}
            >
              <Field label="Store name" htmlFor="sname">
                <Input
                  id="sname"
                  value={store.storeName}
                  onChange={(e) => setStore({ ...store, storeName: e.target.value })}
                  required
                  minLength={2}
                />
              </Field>
              <Field label="What will you sell?" htmlFor="sdesc">
                <Textarea
                  id="sdesc"
                  className="min-h-10"
                  value={store.description}
                  onChange={(e) => setStore({ ...store, description: e.target.value })}
                />
              </Field>
              <div>
                <Button type="submit" variant="accent" disabled={apply.isPending}>
                  Open my store
                </Button>
              </div>
            </form>
          </Panel>
        ) : null}
        {p?.sellerStatus === 'PENDING' ? (
          <Panel className="p-6 lg:col-span-2">
            <p>
              Your store is waiting for admin approval. Log out and back in once it’s approved to start
              publishing.
            </p>
          </Panel>
        ) : null}
      </div>
    </RoleGate>
  );
}
