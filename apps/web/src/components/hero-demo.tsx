'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const SENTENCE = 'red running shoes under 2000 baht for wide feet';
const CHIPS = ['Shoes', 'Running', 'Wide fit', 'Red', 'Under ฿2,000'];

/**
 * The page's one orchestrated moment: the sentence is "read" and turns into the filter
 * chips ShopShare actually produces. With reduced motion, everything shows at once.
 */
export function HeroDemo() {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(CHIPS.length);
      return;
    }
    const timers = CHIPS.map((_, i) => setTimeout(() => setShown(i + 1), 600 + i * 260));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <Link
      href={`/search?q=${encodeURIComponent(SENTENCE)}`}
      className="group mt-6 block max-w-2xl rounded-2xl border border-dashed border-line p-4 hover:border-ink/40"
    >
      <p className="text-sm text-muted-fg">
        “{SENTENCE}” <span className="text-teal group-hover:underline">— run this search</span>
      </p>
      <div
        className="mt-3 flex flex-wrap items-center gap-2"
        aria-label={`We understood: ${CHIPS.join(', ')}`}
      >
        <span className="text-sm font-medium">We understood:</span>
        {CHIPS.slice(0, shown).map((c) => (
          <span
            key={c}
            className="chip-in inline-flex items-center gap-1 rounded-full bg-marigold-soft px-3 py-1 text-sm"
          >
            {c}
            <X className="size-3 opacity-50" aria-hidden />
          </span>
        ))}
      </div>
    </Link>
  );
}
