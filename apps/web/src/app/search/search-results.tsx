'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { SearchX, X } from 'lucide-react';
import type { SearchResultDto } from '@shopsense/shared';
import { api, errorMessage } from '@/lib/api';
import { ProductGrid, ProductGridSkeleton } from '@/components/product-card';
import { Pagination } from '@/components/pagination';
import { EmptyState } from '@/components/ui/misc';
import { Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const SORTS = [
  ['relevance', 'Most relevant'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating', 'Top rated'],
  ['popular', 'Best selling'],
  ['newest', 'Newest'],
] as const;

export function SearchResults() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get('q')?.trim() ?? '';
  const ignore = params.get('ignore') ?? '';
  const page = Number(params.get('page') ?? 1);
  const sort = params.get('sort') ?? '';
  const inStock = params.get('inStock') === 'true';

  const query = useQuery({
    queryKey: ['search', q, ignore, page, sort, inStock],
    queryFn: () => {
      const sp = new URLSearchParams({ q, page: String(page) });
      if (ignore) sp.set('ignore', ignore);
      if (sort) sp.set('sort', sort);
      if (inStock) sp.set('inStock', 'true');
      return api<SearchResultDto>(`/search?${sp}`);
    },
    enabled: q.length > 0,
    placeholderData: (prev) => prev,
  });

  const go = (changes: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    if (!('page' in changes)) sp.delete('page');
    router.push(`/search?${sp}`);
  };
  const removeChip = (id: string) => go({ ignore: [...ignore.split(',').filter(Boolean), id].join(',') });

  if (!q) {
    return (
      <EmptyState
        icon={<SearchX />}
        title="What are you looking for?"
        body="Describe it in your own words, like “a waterproof jacket under 2000 baht”."
      />
    );
  }

  const data = query.data;
  return (
    <div>
      <h1 className="text-2xl sm:text-3xl">Results for “{q}”</h1>

      <div className="mt-4 flex flex-wrap items-center gap-2" aria-live="polite">
        {data ? (
          <>
            <span className="text-sm font-medium">We understood:</span>
            {data.chips.length ? (
              data.chips.map((c) => (
                <button
                  key={c.id}
                  onClick={() => removeChip(c.id)}
                  className="inline-flex items-center gap-1 rounded-full bg-marigold-soft px-3 py-1 text-sm hover:bg-marigold/40"
                  aria-label={`Remove filter: ${c.label}`}
                >
                  {c.label}
                  <X className="size-3" aria-hidden />
                </button>
              ))
            ) : (
              <span className="text-sm text-muted-fg">your words as keywords</span>
            )}
            {ignore ? (
              <Button variant="link" size="sm" onClick={() => go({ ignore: null })}>
                Reset filters
              </Button>
            ) : null}
            <span className="ml-auto text-xs text-muted-fg" title="Which engine understood your sentence">
              {data.parser === 'llm'
                ? 'Understood by AI'
                : 'Understood by keyword rules (no AI key configured)'}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted-fg">Reading your search…</span>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <p className="text-sm text-muted-fg">
          {data ? `${data.total} product${data.total === 1 ? '' : 's'}` : ' '}
        </p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={inStock}
              onChange={(e) => go({ inStock: e.target.checked ? 'true' : null })}
              className="size-4 accent-[var(--teal)]"
            />
            In stock only
          </label>
          <label htmlFor="sort" className="sr-only">
            Sort by
          </label>
          <Select
            id="sort"
            value={sort || data?.understood.sort || 'relevance'}
            onChange={(e) => go({ sort: e.target.value === 'relevance' ? null : e.target.value })}
          >
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-8">
        {query.isError ? (
          <EmptyState
            title="Search is unavailable"
            body={errorMessage(query.error)}
            action={<Button onClick={() => query.refetch()}>Try again</Button>}
          />
        ) : !data ? (
          <ProductGridSkeleton />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title="Nothing matches all of that"
            body={
              data.chips.length
                ? 'Remove a filter above (tap it) to widen the search.'
                : 'Try describing the product differently.'
            }
          />
        ) : (
          <div className={query.isFetching ? 'opacity-60 transition-opacity' : ''}>
            <ProductGrid products={data.items} />
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              hrefFor={(p) => {
                const sp = new URLSearchParams(params.toString());
                sp.set('page', String(p));
                return `/search?${sp}`;
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
