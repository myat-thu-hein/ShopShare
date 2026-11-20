import type { ReviewSummary } from '@shopsense/shared';

/**
 * Rule-based review summary used when no LLM is configured.
 * Finds which aspects (quality, fit, shipping…) are mentioned in good vs bad reviews.
 */
const ASPECTS: { label: string; words: RegExp; pro: string; con: string }[] = [
  {
    label: 'quality',
    words: /\b(quality|well made|build|solid|durable|material|cheap(er)?)\b/i,
    pro: 'Good build quality',
    con: 'Material quality could be better',
  },
  {
    label: 'comfort',
    words: /\b(comfortable|comfort|soft|cushion)/i,
    pro: 'Comfortable to use',
    con: 'Not very comfortable for some buyers',
  },
  {
    label: 'fit',
    words: /\b(fit|fits|sizing|size|small|large|tight)\b/i,
    pro: 'Fits as expected',
    con: 'Sizing can run small',
  },
  {
    label: 'value',
    words: /\b(price|value|worth|money)\b/i,
    pro: 'Good value for the price',
    con: 'Feels pricey for what you get',
  },
  {
    label: 'shipping',
    words: /\b(shipping|arrived|delivery|days|fast)\b/i,
    pro: 'Fast delivery',
    con: 'Shipping can be slow',
  },
  {
    label: 'looks',
    words: /\b(looks|colour|color|photos|design|beautiful)\b/i,
    pro: 'Looks great in person',
    con: 'Colour differs slightly from photos',
  },
  {
    label: 'service',
    words: /\b(seller|service|answered|return|support)\b/i,
    pro: 'Helpful seller',
    con: 'Returns process is slow',
  },
  {
    label: 'instructions',
    words: /\b(instructions|manual|setup)\b/i,
    pro: 'Easy to set up',
    con: 'Instructions could be clearer',
  },
];

export function summariseReviewsWithRules(
  reviews: { rating: number; comment: string; title?: string | null }[],
): ReviewSummary {
  if (reviews.length === 0) return { summary: 'No reviews yet.', pros: [], cons: [] };
  const pros = new Map<string, number>();
  const cons = new Map<string, number>();
  for (const r of reviews) {
    const text = `${r.title ?? ''} ${r.comment}`;
    // Split on "but"/"." so "Great quality but shipping was slow" counts both ways.
    const clauses = text.split(/\bbut\b|\bhowever\b|[.!?;]/i);
    for (const clause of clauses) {
      const negative =
        r.rating <= 2 ||
        /\b(not|slow|cheaper|could be|darker|small|longer than|isn'?t|wasn'?t)\b/i.test(clause);
      for (const a of ASPECTS) {
        if (!a.words.test(clause)) continue;
        const target = negative || r.rating <= 3 ? cons : pros;
        target.set(a.label, (target.get(a.label) ?? 0) + 1);
      }
    }
  }
  const top = (m: Map<string, number>, key: 'pro' | 'con') =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([label]) => ASPECTS.find((a) => a.label === label)![key]);
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  const mood =
    avg >= 4.3
      ? 'love'
      : avg >= 3.5
        ? 'mostly like'
        : avg >= 2.5
          ? 'have mixed feelings about'
          : 'are disappointed with';
  const proList = top(pros, 'pro');
  const conList = top(cons, 'con').filter(
    (c) => !proList.some((p) => ASPECTS.find((a) => a.pro === p)?.con === c),
  );
  return {
    summary: `Based on ${reviews.length} review${reviews.length === 1 ? '' : 's'} (average ${avg.toFixed(1)}★), buyers ${mood} this product${
      proList[0] ? `, especially: ${proList[0].toLowerCase()}` : ''
    }.`,
    pros: proList,
    cons: conList.slice(0, 3),
  };
}
