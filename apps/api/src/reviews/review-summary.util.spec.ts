import { summariseReviewsWithRules } from './review-summary.util';

describe('summariseReviewsWithRules', () => {
  it('finds pros and cons from review text', () => {
    const s = summariseReviewsWithRules([
      { rating: 5, comment: 'Great quality for the price and it arrived fast.' },
      { rating: 5, comment: 'Very comfortable, well made.' },
      { rating: 2, comment: 'Sizing runs small for me and the return process was slow.' },
    ]);
    expect(s.pros).toEqual(expect.arrayContaining(['Good build quality']));
    expect(s.cons).toEqual(expect.arrayContaining(['Sizing can run small']));
    expect(s.summary).toMatch(/3 reviews/);
  });

  it('handles no reviews', () => {
    expect(summariseReviewsWithRules([])).toEqual({ summary: 'No reviews yet.', pros: [], cons: [] });
  });
});
