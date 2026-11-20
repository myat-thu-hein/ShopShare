import { KNOWN_COLOURS, parsedSearchSchema, type ParsedSearch } from '@shopsense/shared';

/**
 * Rule-based fallback for natural-language search. Used when no LLM is configured
 * or the LLM call fails, and as a safety net to normalise what the LLM returns.
 */

const CATEGORY_WORDS: Record<string, string[]> = {
  shoes: [
    'shoe',
    'shoes',
    'sneaker',
    'sneakers',
    'trainer',
    'trainers',
    'boot',
    'boots',
    'heels',
    'heel shoes',
    'slipper',
    'slippers',
    'cleats',
    'footwear',
    'loafers',
  ],
  fashion: [
    'shirt',
    'shirts',
    'tee',
    'tees',
    't-shirt',
    'tshirt',
    'dress',
    'dresses',
    'frock',
    'gown',
    'suit',
    'skirt',
    'corset',
    'clothes',
    'clothing',
    'outfit',
    'fashion',
  ],
  'bags-accessories': [
    'bag',
    'bags',
    'handbag',
    'handbags',
    'backpack',
    'purse',
    'sunglasses',
    'glasses',
    'earring',
    'earrings',
    'jewellery',
    'jewelry',
    'accessories',
  ],
  electronics: [
    'laptop',
    'laptops',
    'notebook',
    'macbook',
    'headphones',
    'headphone',
    'earbuds',
    'earphones',
    'airpods',
    'phone',
    'phones',
    'smartphone',
    'iphone',
    'android',
    'tablet',
    'ipad',
    'smartwatch',
    'speaker',
    'charger',
    'power bank',
    'phone case',
    'selfie stick',
    'gadget',
    'gadgets',
    'electronics',
  ],
  watches: ['watch', 'watches', 'wristwatch', 'timepiece', 'rolex', 'automatic watch'],
  beauty: [
    'perfume',
    'perfumes',
    'fragrance',
    'cologne',
    'mascara',
    'lipstick',
    'eyeshadow',
    'make-up',
    'makeup',
    'nail polish',
    'powder',
    'lotion',
    'body wash',
    'hand soap',
    'skincare',
    'beauty',
    'cosmetics',
  ],
  'home-kitchen': [
    'sofa',
    'bed',
    'chair',
    'table',
    'lamp',
    'furniture',
    'decor',
    'plant pot',
    'photo frame',
    'kitchen',
    'cookware',
    'wok',
    'pan',
    'pot',
    'blender',
    'microwave',
    'stove',
    'knife',
    'lunch box',
    'chopping board',
    'condo',
  ],
  'sports-outdoors': [
    'tennis',
    'racket',
    'basketball',
    'football',
    'soccer',
    'volleyball',
    'badminton',
    'shuttlecock',
    'golf',
    'baseball',
    'cricket',
    'protein',
    'gym',
    'sports',
    'sport',
    'outdoor',
    'outdoors',
  ],
};

/** Phrases worth keeping together as one keyword chip. */
const PHRASES: [RegExp, string][] = [
  [/\bwide\s+(feet|foot|fit|toe box)\b|\bwide\b/, 'wide fit'],
  [/\b(running|jogging|marathon|runner'?s?)\b/, 'running'],
  [/\btrail\b/, 'trail'],
  [/\b(waterproof|water-proof|rain ?proof)\b/, 'waterproof'],
  [/\bnoise[- ]cancel+ing\b|\banc\b/, 'noise cancelling'],
  [/\b(lightweight|light weight|ultralight)\b/, 'lightweight'],
  [/\bquick[- ]dry\b/, 'quick dry'],
  [/\brain\s+jacket\b/, 'rain jacket'],
  [/\bcast iron\b/, 'cast iron'],
  [/\bgaming\b/, 'gaming'],
  [/\bwireless|bluetooth\b/, 'wireless'],
  [/\bhiking\b/, 'hiking'],
  [/\bgym|workout|training\b/, 'training'],
  [/\bsensitive skin\b/, 'sensitive skin'],
  [/\bstudents?\b/, 'students'],
  [/\bgifts?\b/, 'gift'],
  [/\btravel\b/, 'travel'],
];

const COLOUR_ALIASES: Record<string, string> = {
  gray: 'grey',
  crimson: 'red',
  scarlet: 'red',
  maroon: 'red',
  cream: 'beige',
  tan: 'beige',
  violet: 'purple',
};

function parseAmount(raw: string, k?: string): number {
  const n = parseFloat(raw.replace(/,/g, ''));
  return k ? n * 1000 : n;
}

export function parseQueryWithRules(query: string, categorySlugs: string[]): ParsedSearch {
  let q = ` ${query.toLowerCase()} `;
  const result: ParsedSearch = parsedSearchSchema.parse({});

  // --- price: "between 1000 and 2000", "1000-2000 baht"
  const between = q.match(
    /between\s*(?:฿|thb)?\s*([\d,.]+)\s*(k)?\s*(?:baht|thb|฿)?\s*(?:and|to|-)\s*(?:฿|thb)?\s*([\d,.]+)\s*(k)?/,
  );
  const range = q.match(
    /(?:฿|thb)?\s*([\d,.]+)\s*(k)?\s*(?:-|to)\s*(?:฿|thb)?\s*([\d,.]+)\s*(k)?\s*(?:baht|thb|฿)/,
  );
  const r = between ?? range;
  if (r) {
    result.minPrice = parseAmount(r[1], r[2]);
    result.maxPrice = parseAmount(r[3], r[4]);
    q = q.replace(r[0], ' ');
  } else {
    const max = q.match(
      /(?:under|below|less than|cheaper than|max(?:imum)?|up to|at most|within|<)\s*(?:฿|thb)?\s*([\d,.]+)\s*(k)?\s*(?:baht|thb|฿|bht)?/,
    );
    if (max) {
      result.maxPrice = parseAmount(max[1], max[2]);
      q = q.replace(max[0], ' ');
    }
    const min = q.match(
      /(?:over|above|more than|at least|from|>)\s*(?:฿|thb)?\s*([\d,.]+)\s*(k)?\s*(?:baht|thb|฿|bht)?/,
    );
    if (min) {
      result.minPrice = parseAmount(min[1], min[2]);
      q = q.replace(min[0], ' ');
    }
  }

  // --- sizes: "size 42", "size m"
  for (const m of q.matchAll(/\bsize\s*([0-9]{2}|xs|s|m|l|xl|xxl)\b/g)) {
    result.sizes.push(m[1].toUpperCase());
    q = q.replace(m[0], ' ');
  }

  // --- colours
  for (const word of q.split(/[^a-z]+/)) {
    const colour = COLOUR_ALIASES[word] ?? word;
    if ((KNOWN_COLOURS as readonly string[]).includes(colour) && !result.colours.includes(colour)) {
      result.colours.push(colour);
    }
  }

  // --- sort intent
  if (/\b(cheapest|lowest price|budget)\b/.test(q)) result.sort = 'price_asc';
  else if (/\b(best rated|top rated|highest rated|best reviewed)\b/.test(q)) result.sort = 'rating';
  else if (/\b(newest|latest|new arrivals?)\b/.test(q)) result.sort = 'newest';
  else if (/\b(popular|best ?sell(ing|ers?)|trending)\b/.test(q)) result.sort = 'popular';

  // --- category
  let bestCategory: string | null = null;
  for (const slug of categorySlugs) {
    const words = CATEGORY_WORDS[slug] ?? [slug.replace(/-/g, ' ')];
    if (words.some((w) => new RegExp(`\\b${w.replace(/[-]/g, '[- ]?')}\\b`).test(q))) {
      bestCategory = slug;
      break;
    }
  }
  result.category = bestCategory;

  // --- keyword phrases
  for (const [re, label] of PHRASES) {
    if (re.test(q) && !result.keywords.includes(label)) result.keywords.push(label);
  }
  // Keep a product noun as a keyword when it is more specific than the category (e.g. "jacket", "laptop").
  if (bestCategory) {
    const noun = (CATEGORY_WORDS[bestCategory] ?? []).find((w) => new RegExp(`\\b${w}\\b`).test(q));
    const generic = [
      'shoe',
      'shoes',
      'clothes',
      'clothing',
      'beauty',
      'kitchen',
      'outdoor',
      'outdoors',
      'gadget',
      'gadgets',
      'footwear',
    ];
    if (noun && !generic.includes(noun) && !result.keywords.includes(noun))
      result.keywords.push(noun.replace(/s$/, ''));
  }
  result.keywords = result.keywords.slice(0, 5);
  return result;
}

/** Cleans up whatever the LLM returned so it can only reference real categories and colours. */
export function normaliseParsed(parsed: ParsedSearch, categorySlugs: string[]): ParsedSearch {
  const colours = [
    ...new Set(
      parsed.colours
        .map((c) => c.toLowerCase().trim())
        .map((c) => COLOUR_ALIASES[c] ?? c)
        .filter((c) => (KNOWN_COLOURS as readonly string[]).includes(c)),
    ),
  ];
  const category = parsed.category && categorySlugs.includes(parsed.category) ? parsed.category : null;
  const positive = (n: number | null) => (n != null && Number.isFinite(n) && n > 0 ? n : null);
  let minPrice = positive(parsed.minPrice);
  let maxPrice = positive(parsed.maxPrice);
  if (minPrice != null && maxPrice != null && minPrice > maxPrice)
    [minPrice, maxPrice] = [maxPrice, minPrice];
  const keywords = [
    ...new Set(parsed.keywords.map((k) => k.toLowerCase().trim()).filter((k) => k.length > 1)),
  ]
    .filter((k) => !colours.includes(k) && k !== category)
    .slice(0, 5);
  return {
    category,
    colours,
    minPrice,
    maxPrice,
    sizes: [...new Set(parsed.sizes.map((s) => s.toUpperCase().trim()).filter(Boolean))].slice(0, 4),
    keywords,
    sort: parsed.sort,
  };
}
