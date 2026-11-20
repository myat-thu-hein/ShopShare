import { EMBEDDING_DIM, cosine, localEmbed, tokenize } from './local-embedder';

describe('local embedder', () => {
  it('produces normalised 768-dim vectors deterministically', () => {
    const v = localEmbed('red running shoes');
    expect(v).toHaveLength(EMBEDDING_DIM);
    expect(Math.sqrt(v.reduce((s, x) => s + x * x, 0))).toBeCloseTo(1, 3);
    expect(localEmbed('red running shoes')).toEqual(v);
  });

  it('maps shopper synonyms onto catalogue words', () => {
    expect(tokenize('Sneakers for jogging')).toEqual(['shoe', 'running']);
    expect(tokenize('wide feet')).toEqual(expect.arrayContaining(['wide', 'fit']));
  });

  it('ranks related text above unrelated text', () => {
    const q = localEmbed('trainers for wide feet');
    const shoe = localEmbed('StrideMax Wide Running Shoe. Built on a wide last for runners with wide feet.');
    const serum = localEmbed('Tamarind Brightening Serum with vitamin C for sensitive skin.');
    expect(cosine(q, shoe)).toBeGreaterThan(cosine(q, serum) + 0.2);
  });
});
