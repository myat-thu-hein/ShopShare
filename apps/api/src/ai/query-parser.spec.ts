import { normaliseParsed, parseQueryWithRules } from './query-parser';

const SLUGS = [
  'bags-accessories',
  'beauty',
  'electronics',
  'fashion',
  'home-kitchen',
  'shoes',
  'sports-outdoors',
  'watches',
];

describe('parseQueryWithRules', () => {
  it('understands the flagship demo sentence', () => {
    const p = parseQueryWithRules('red running shoes under 2000 baht for wide feet', SLUGS);
    expect(p.category).toBe('shoes');
    expect(p.colours).toEqual(['red']);
    expect(p.maxPrice).toBe(2000);
    expect(p.keywords).toEqual(expect.arrayContaining(['running', 'wide fit']));
  });

  it('parses price ranges, "k" shorthand and minimums', () => {
    expect(parseQueryWithRules('laptop between 20k and 30k', SLUGS)).toMatchObject({
      minPrice: 20000,
      maxPrice: 30000,
      category: 'electronics',
    });
    expect(parseQueryWithRules('headphones over 3,000 baht', SLUGS).minPrice).toBe(3000);
    expect(parseQueryWithRules('tent 1000-3500 baht', SLUGS)).toMatchObject({
      minPrice: 1000,
      maxPrice: 3500,
    });
  });

  it('detects sizes, colour aliases and sort intent', () => {
    const p = parseQueryWithRules('cheapest gray tshirt size m', SLUGS);
    expect(p.sizes).toEqual(['M']);
    expect(p.colours).toEqual(['grey']);
    expect(p.sort).toBe('price_asc');
    expect(p.category).toBe('fashion');
  });

  it('keeps a specific product noun as keyword', () => {
    expect(parseQueryWithRules('leather handbag for work', SLUGS)).toMatchObject({
      category: 'bags-accessories',
    });
    expect(parseQueryWithRules('leather handbag for work', SLUGS).keywords).toContain('handbag');
  });

  it('tells watches and smartwatches apart', () => {
    expect(parseQueryWithRules('waterproof watch', SLUGS).category).toBe('watches');
    expect(parseQueryWithRules('smartwatch for running', SLUGS).category).toBe('electronics');
  });

  it('returns empty filters for vague queries', () => {
    const p = parseQueryWithRules('something nice', SLUGS);
    expect(p).toMatchObject({ category: null, colours: [], maxPrice: null, minPrice: null });
  });
});

describe('normaliseParsed', () => {
  it('drops unknown categories/colours and fixes swapped prices', () => {
    const out = normaliseParsed(
      {
        category: 'spaceships',
        colours: ['Crimson', 'rainbow'],
        minPrice: 5000,
        maxPrice: 1000,
        sizes: ['m'],
        keywords: ['Red', 'Fast'],
        sort: null,
      },
      SLUGS,
    );
    expect(out.category).toBeNull();
    expect(out.colours).toEqual(['red']);
    expect(out).toMatchObject({ minPrice: 1000, maxPrice: 5000, sizes: ['M'] });
    expect(out.keywords).toEqual(['fast']); // colour words are not keywords
  });

  it('ignores negative or zero prices', () => {
    expect(
      normaliseParsed(
        { category: null, colours: [], minPrice: -1, maxPrice: 0, sizes: [], keywords: [], sort: null },
        SLUGS,
      ),
    ).toMatchObject({ minPrice: null, maxPrice: null });
  });
});
