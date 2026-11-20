'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { CategoryDto } from '@shopsense/shared';
import { api, errorMessage } from '@/lib/api';
import { CategoryIcon } from '@/components/category-icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageTitle, Panel, Skeleton } from '@/components/ui/misc';

export default function AdminCategories() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['categories'], queryFn: () => api<CategoryDto[]>('/categories') });
  const [form, setForm] = useState({ name: '', description: '' });
  const refresh = () => qc.invalidateQueries({ queryKey: ['categories'] });
  const create = useMutation({
    mutationFn: () =>
      api('/categories', {
        method: 'POST',
        body: { name: form.name, description: form.description || undefined },
      }),
    onSuccess: () => {
      toast.success('Category added');
      setForm({ name: '', description: '' });
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api(`/categories/${id}`, { method: 'PATCH', body: { name } }),
    onSuccess: () => {
      toast.success('Category renamed');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Category deleted');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="max-w-2xl">
      <PageTitle title="Categories" />
      <Panel className="mb-6 p-5">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Input
            aria-label="Category name"
            placeholder="New category name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="min-w-40 flex-1"
            required
            minLength={2}
          />
          <Input
            aria-label="Description"
            placeholder="Short description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="min-w-40 flex-1"
          />
          <Button type="submit" disabled={create.isPending}>
            Add category
          </Button>
        </form>
      </Panel>
      {q.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {q.data?.map((c) => (
            <li key={c.id} className="flex items-center gap-3 p-3">
              <CategoryIcon name={c.icon} className="size-5 text-teal" />
              <input
                defaultValue={c.name}
                aria-label={`Name of ${c.name}`}
                className="flex-1 rounded-lg bg-transparent px-2 py-1 hover:bg-muted focus:bg-muted"
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value !== c.name &&
                  rename.mutate({ id: c.id, name: e.target.value.trim() })
                }
              />
              <span className="text-sm text-muted-fg">{c.productCount} products</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${c.name}`}
                disabled={!!c.productCount}
                title={c.productCount ? 'Move its products first' : undefined}
                onClick={() => remove.mutate(c.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
