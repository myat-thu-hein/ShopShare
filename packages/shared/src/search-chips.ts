import { formatTHB, bahtToSatang } from './money';
import type { ParsedSearch } from './schemas';
import type { SearchChip } from './types';

const SORT_LABELS: Record<string, string> = {
  relevance: 'Most relevant',
  newest: 'Newest',
  price_asc: 'Cheapest first',
  price_desc: 'Most expensive first',
  rating: 'Top rated',
  popular: 'Most popular',
};

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Builds the "We understood: Running shoes · Red · Under ฿2,000" chips. */
export function buildSearchChips(p: ParsedSearch): SearchChip[] {
  const chips: SearchChip[] = [];
  if (p.category) chips.push({ id: 'category', label: titleCase(p.category.replace(/-/g, ' ')) });
  for (const k of p.keywords) chips.push({ id: `keywords:${k}`, label: titleCase(k) });
  for (const c of p.colours) chips.push({ id: `colours:${c}`, label: titleCase(c) });
  for (const s of p.sizes) chips.push({ id: `sizes:${s}`, label: `Size ${s.toUpperCase()}` });
  if (p.minPrice != null && p.maxPrice != null) {
    chips.push({ id: 'minPrice', label: `Over ${formatTHB(bahtToSatang(p.minPrice))}` });
    chips.push({ id: 'maxPrice', label: `Under ${formatTHB(bahtToSatang(p.maxPrice))}` });
  } else if (p.maxPrice != null) {
    chips.push({ id: 'maxPrice', label: `Under ${formatTHB(bahtToSatang(p.maxPrice))}` });
  } else if (p.minPrice != null) {
    chips.push({ id: 'minPrice', label: `Over ${formatTHB(bahtToSatang(p.minPrice))}` });
  }
  if (p.sort && p.sort !== 'relevance') chips.push({ id: 'sort', label: SORT_LABELS[p.sort] ?? p.sort });
  return chips;
}

/** Removes the chips the user dismissed. `ignore` holds chip ids. */
export function applyIgnoredChips(p: ParsedSearch, ignore: string[]): ParsedSearch {
  const out: ParsedSearch = {
    ...p,
    colours: [...p.colours],
    sizes: [...p.sizes],
    keywords: [...p.keywords],
  };
  for (const id of ignore) {
    const [key, value] = id.split(':');
    switch (key) {
      case 'category':
        out.category = null;
        break;
      case 'maxPrice':
        out.maxPrice = null;
        break;
      case 'minPrice':
        out.minPrice = null;
        break;
      case 'sort':
        out.sort = null;
        break;
      case 'colours':
        out.colours = out.colours.filter((c) => c !== value);
        break;
      case 'sizes':
        out.sizes = out.sizes.filter((s) => s !== value);
        break;
      case 'keywords':
        out.keywords = out.keywords.filter((k) => k !== value);
        break;
    }
  }
  return out;
}
