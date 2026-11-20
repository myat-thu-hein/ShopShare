/** Whole-number discount percentage, or null when not on sale. 189000 vs 269000 -> 30 */
export function discountPercent(price: number, compareAtPrice: number | null | undefined): number | null {
  if (!compareAtPrice || compareAtPrice <= price) return null;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

/** Marketplace-style sold counter: 950 -> "950", 1234 -> "1.2k", 25000 -> "25k". */
export function formatSold(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(Math.floor(n / 100) / 10).toString()}k`;
  return `${Math.floor(n / 1000)}k`;
}
