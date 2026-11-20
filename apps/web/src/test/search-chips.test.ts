import { applyIgnoredChips, buildSearchChips, parsedSearchSchema } from '@shopsense/shared';

describe('search chips', () => {
  it('builds the "We understood" chips and removes them by id', () => {
    const parsed = parsedSearchSchema.parse({
      category: 'shoes',
      colours: ['red'],
      maxPrice: 2000,
      keywords: ['running'],
    });
    const chips = buildSearchChips(parsed);
    expect(chips.map((c) => c.label)).toEqual(['Shoes', 'Running', 'Red', 'Under ฿2,000']);
    const next = applyIgnoredChips(parsed, [chips[2].id]);
    expect(next.colours).toEqual([]);
  });
});
