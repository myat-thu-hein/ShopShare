'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function SearchBox({
  size = 'md',
  autoFocus,
  className,
}: {
  size?: 'md' | 'lg';
  autoFocus?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  useEffect(() => setQ(params.get('q') ?? ''), [params]);

  return (
    <form
      role="search"
      className={cn('relative w-full', className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <label htmlFor={`search-${size}`} className="sr-only">
        Describe what you are looking for
      </label>
      <Search
        className={cn(
          'pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-fg',
          size === 'lg' ? 'size-5' : 'size-4',
        )}
      />
      <input
        id={`search-${size}`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        maxLength={300}
        placeholder={
          size === 'lg' ? 'Try “red running shoes under ฿2,000, wide fit”' : 'Describe what you want…'
        }
        className={cn(
          'w-full rounded-2xl border border-line bg-surface pr-28 placeholder:text-muted-fg',
          size === 'lg' ? 'h-16 pl-12 text-base sm:text-lg' : 'h-11 pl-10 text-sm',
        )}
      />
      <button
        type="submit"
        className={cn(
          'absolute right-1.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-xl bg-marigold font-semibold text-marigold-fg hover:brightness-95',
          size === 'lg' ? 'h-12 px-5' : 'h-8 px-3 text-sm',
        )}
      >
        <Sparkles className="size-4" aria-hidden />
        Search
      </button>
    </form>
  );
}
