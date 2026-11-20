import { formatTHB } from '@shopsense/shared';

export interface ContextProduct {
  id: string;
  slug: string;
  title: string;
  price: number;
}

/**
 * Post-processes the model's reply so it can only point at real products and prices:
 *  - [[slug]] markers become links, but only for products we actually gave the model.
 *  - Any ฿ amount that is not a real price (or the difference between two real prices)
 *    is replaced, so a hallucinated price can never reach the shopper.
 */
export function enforceGrounding(
  reply: string,
  products: ContextProduct[],
): { text: string; referenced: string[] } {
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const referenced: string[] = [];

  let text = reply.replace(/\[\[([a-z0-9฀-๿-]+)\]\]/gi, (_m, slug: string) => {
    const p = bySlug.get(slug.toLowerCase());
    if (!p) return '';
    if (!referenced.includes(p.slug)) referenced.push(p.slug);
    return `[${p.title}](/p/${p.slug})`;
  });

  // Links the model wrote itself must point at known products.
  text = text.replace(/\[([^\]]+)\]\(\/p\/([^)\s]+)\)/g, (m, label: string, slug: string) => {
    const p = bySlug.get(slug);
    if (!p) return label;
    if (!referenced.includes(p.slug)) referenced.push(p.slug);
    return m;
  });

  const allowed = new Set<number>();
  for (const a of products) {
    allowed.add(a.price);
    for (const b of products) if (a !== b) allowed.add(Math.abs(a.price - b.price));
  }
  text = text.replace(
    /(฿|THB\s?)\s?([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s?(baht|THB)\b/gi,
    (m, _c1, n1, n2) => {
      const satang = Math.round(parseFloat(String(n1 ?? n2).replace(/,/g, '')) * 100);
      return allowed.has(satang) ? formatTHB(satang) : '(see the product page for the current price)';
    },
  );

  return { text: text.replace(/[ \t]{2,}/g, ' ').trim(), referenced };
}
