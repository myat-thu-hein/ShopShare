'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge, PageTitle, Panel, Skeleton } from '@/components/ui/misc';

interface Profile {
  storeName: string;
  slug: string;
  description: string | null;
  status: string;
}

export default function StoreSettings() {
  const q = useQuery({ queryKey: ['seller', 'profile'], queryFn: () => api<Profile>('/seller/profile') });
  const [form, setForm] = useState({ storeName: '', description: '' });
  useEffect(() => {
    if (q.data) setForm({ storeName: q.data.storeName, description: q.data.description ?? '' });
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api('/seller/profile', { method: 'PUT', body: form }),
    onSuccess: () => toast.success('Store saved'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading) return <Skeleton className="h-64" />;
  return (
    <div className="max-w-xl">
      <PageTitle
        title="Store settings"
        action={
          q.data ? (
            <Badge tone={q.data.status === 'APPROVED' ? 'teal' : 'accent'}>
              {q.data.status.toLowerCase()}
            </Badge>
          ) : undefined
        }
      />
      <Panel className="p-5">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Store name" htmlFor="sn">
            <Input
              id="sn"
              value={form.storeName}
              onChange={(e) => setForm({ ...form, storeName: e.target.value })}
              minLength={2}
              required
            />
          </Field>
          <Field label="About your store" htmlFor="sd">
            <Textarea
              id="sd"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              maxLength={1000}
            />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
            {q.data?.status === 'APPROVED' ? (
              <Link href={`/store/${q.data.slug}`} className="text-sm text-teal hover:underline">
                View store page
              </Link>
            ) : null}
          </div>
        </form>
      </Panel>
    </div>
  );
}
