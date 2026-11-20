'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { KNOWN_COLOURS } from '@shopsense/shared';
import { Button } from './ui/button';
import { Input, Select } from './ui/input';
import { cn } from '@/lib/utils';

const SORTS = [
  ['newest', 'Newest'],
  ['popular', 'Best selling'],
  ['rating', 'Top rated'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
] as const;

/** Classic filters. State lives in the URL so results are shareable and server-rendered. */
export function Filters({ basePath }: { basePath: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toBaht = (v: string | null) => (v ? String(Number(v) / 100) : '');
  const [min, setMin] = useState(toBaht(params.get('minPrice')));
  const [max, setMax] = useState(toBaht(params.get('maxPrice')));
  useEffect(() => {
    setMin(toBaht(params.get('minPrice')));
    setMax(toBaht(params.get('maxPrice')));
  }, [params]);

  const set = (changes: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    sp.delete('page');
    router.push(`${pathname ?? basePath}?${sp}`, { scroll: false });
  };
  const colour = params.get('colour');
  const rating = params.get('minRating');

  return (
    <aside className="space-y-6 text-sm" aria-label="Filters">
      <div className="space-y-2">
        <label htmlFor="cat-sort" className="font-medium">
          Sort by
        </label>
        <Select
          id="cat-sort"
          className="w-full"
          value={params.get('sort') ?? 'newest'}
          onChange={(e) => set({ sort: e.target.value })}
        >
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          set({
            minPrice: min ? String(Math.round(Number(min) * 100)) : null,
            maxPrice: max ? String(Math.round(Number(max) * 100)) : null,
          });
        }}
      >
        <fieldset className="space-y-2">
          <legend className="font-medium">Price (฿)</legend>
          <div className="flex items-center gap-2">
            <Input
              aria-label="Minimum price in baht"
              inputMode="numeric"
              placeholder="Min"
              value={min}
              onChange={(e) => setMin(e.target.value.replace(/[^\d]/g, ''))}
            />
            <span className="text-muted-fg">–</span>
            <Input
              aria-label="Maximum price in baht"
              inputMode="numeric"
              placeholder="Max"
              value={max}
              onChange={(e) => setMax(e.target.value.replace(/[^\d]/g, ''))}
            />
          </div>
          <Button type="submit" variant="outline" size="sm" className="w-full">
            Apply price
          </Button>
        </fieldset>
      </form>

      <fieldset className="space-y-2">
        <legend className="font-medium">Rating</legend>
        {['4', '3'].map((r) => (
          <label key={r} className="flex items-center gap-2">
            <input
              type="radio"
              name="rating"
              checked={rating === r}
              onChange={() => set({ minRating: r })}
              className="accent-[var(--teal)]"
            />
            {r}★ & up
          </label>
        ))}
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="rating"
            checked={!rating}
            onChange={() => set({ minRating: null })}
            className="accent-[var(--teal)]"
          />
          Any rating
        </label>
      </fieldset>

      <label className="flex items-center gap-2 font-medium">
        <input
          type="checkbox"
          checked={params.get('inStock') === 'true'}
          onChange={(e) => set({ inStock: e.target.checked ? 'true' : null })}
          className="size-4 accent-[var(--teal)]"
        />
        In stock only
      </label>

      <label className="flex items-center gap-2 font-medium">
        <input
          type="checkbox"
          checked={params.get('onSale') === 'true'}
          onChange={(e) => set({ onSale: e.target.checked ? 'true' : null })}
          className="size-4 accent-[var(--teal)]"
        />
        On sale
      </label>

      <fieldset className="space-y-2">
        <legend className="font-medium">Colour</legend>
        <div className="flex flex-wrap gap-1.5">
          {KNOWN_COLOURS.slice(0, 12).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={colour === c}
              onClick={() => set({ colour: colour === c ? null : c })}
              className={cn(
                'rounded-full border border-line px-2.5 py-1 text-xs capitalize hover:bg-muted',
                colour === c && 'border-ink bg-ink text-paper hover:bg-ink',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </fieldset>

      {params.toString() ? (
        <Button variant="link" onClick={() => router.push(basePath)}>
          Clear all filters
        </Button>
      ) : null}
    </aside>
  );
}
