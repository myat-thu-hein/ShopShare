'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Paginated, ProductCardDto } from '@shopsense/shared';
import { api, errorMessage } from '@/lib/api';
import { formatTHB, imageUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, PageTitle, Skeleton } from '@/components/ui/misc';

export default function SellerProducts() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['seller', 'products', page, q],
    queryFn: () =>
      api<Paginated<ProductCardDto>>(
        `/seller/products?page=${page}&limit=20${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
    placeholderData: (p) => p,
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Product deleted');
      qc.invalidateQueries({ queryKey: ['seller'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageTitle
        title="Products"
        action={
          <Button asChild variant="accent">
            <Link href="/seller/products/new">Add product</Link>
          </Button>
        }
      />
      <Input
        placeholder="Filter by title…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
        className="mb-4 max-w-xs"
        aria-label="Filter products"
      />
      {list.isLoading ? (
        <Skeleton className="h-96" />
      ) : !list.data?.items.length ? (
        <EmptyState
          icon={<Package />}
          title={q ? 'No products match' : 'No products yet'}
          body="Add your first product — the AI can write the description for you."
          action={
            <Button asChild variant="accent">
              <Link href="/seller/products/new">Add product</Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-muted-fg">
              <tr>
                <th className="p-3 font-medium">Product</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 text-right font-medium">Price</th>
                <th className="p-3 text-right font-medium">Stock</th>
                <th className="p-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.data.items.map((p) => (
                <tr key={p.id}>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={imageUrl(p.imageUrl, 400)}
                        alt=""
                        className="size-10 rounded-lg border border-line bg-white object-contain p-1"
                      />
                      <Link href={`/seller/products/${p.id}`} className="font-medium hover:underline">
                        {p.title}
                      </Link>
                    </div>
                  </td>
                  <td className="p-3">
                    {p.status === 'PUBLISHED' ? <Badge tone="teal">Published</Badge> : <Badge>Draft</Badge>}
                  </td>
                  <td className="price p-3 text-right">{formatTHB(p.price)}</td>
                  <td
                    className={`p-3 text-right tabular-nums ${p.stock <= 5 ? 'font-medium text-chilli' : ''}`}
                  >
                    {p.stock}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="icon" aria-label={`Edit ${p.title}`}>
                        <Link href={`/seller/products/${p.id}`}>
                          <Pencil />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${p.title}`}
                        onClick={() =>
                          confirm(`Delete “${p.title}”? This can’t be undone.`) && del.mutate(p.id)
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.data && list.data.totalPages > 1 ? (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-muted-fg">
            Page {page} of {list.data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= list.data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
