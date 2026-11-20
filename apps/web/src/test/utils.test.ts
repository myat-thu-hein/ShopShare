import { formatTHB, imageUrl } from '@/lib/utils';
import { axisBaht } from '@/components/revenue-chart';

describe('formatting', () => {
  it('formats satang as baht', () => {
    expect(formatTHB(189000)).toBe('฿1,890');
    expect(formatTHB(5)).toBe('฿0.05');
  });

  it('formats chart axes from satang', () => {
    expect(axisBaht(1_500_000)).toBe('฿15k');
    expect(axisBaht(10_000_000)).toBe('฿100k');
    expect(axisBaht(250_000_000)).toBe('฿2.5M');
    expect(axisBaht(4_000)).toBe('฿40');
  });
});

describe('imageUrl', () => {
  it('adds Cloudinary transforms', () => {
    expect(imageUrl('https://res.cloudinary.com/demo/image/upload/v1/a.jpg', 400)).toBe(
      'https://res.cloudinary.com/demo/image/upload/w_400,c_limit,q_auto,f_auto/v1/a.jpg',
    );
  });
  it('uses local thumbnails and a placeholder', () => {
    expect(imageUrl('/api/uploads/products/x.webp', 400)).toBe('/api/uploads/products/x-sm.webp');
    expect(imageUrl(null)).toBe('/placeholder.svg');
  });
});
