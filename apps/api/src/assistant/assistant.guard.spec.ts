import { enforceGrounding } from './assistant.guard';

const products = [
  { id: '1', slug: 'novabook-14-laptop', title: 'NovaBook 14 Laptop', price: 2499000 },
  { id: '2', slug: 'titanpro-16-creator-laptop', title: 'TitanPro 16 Creator Laptop', price: 4599000 },
];

describe('enforceGrounding', () => {
  it('turns known markers into links and removes invented products', () => {
    const { text, referenced } = enforceGrounding(
      'Try [[novabook-14-laptop]] or [[made-up-laptop]].',
      products,
    );
    expect(text).toBe('Try [NovaBook 14 Laptop](/p/novabook-14-laptop) or .');
    expect(referenced).toEqual(['novabook-14-laptop']);
  });

  it('keeps real prices and differences, replaces hallucinated ones', () => {
    const { text } = enforceGrounding(
      'It costs ฿24,990, the other is 21,000 baht more, and a fake one is ฿9,999.',
      products,
    );
    expect(text).toContain('฿24,990');
    expect(text).toContain('฿21,000');
    expect(text).not.toContain('9,999');
    expect(text).toContain('see the product page');
  });

  it('strips links to products that were not in the context', () => {
    const { text } = enforceGrounding(
      'See [Mystery](/p/mystery-item) and [TitanPro](/p/titanpro-16-creator-laptop)',
      products,
    );
    expect(text).toBe('See Mystery and [TitanPro](/p/titanpro-16-creator-laptop)');
  });
});
