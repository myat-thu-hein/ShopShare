import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTHB, bahtToSatang, lineTotal } from './money';
import { discountPercent, formatSold } from './pricing';
import { canTransition, canSellerTransition } from './order-status';
import { buildSearchChips, applyIgnoredChips } from './search-chips';
import { parsedSearchSchema, registerSchema } from './schemas';

test('money helpers keep integer satang', () => {
  assert.equal(bahtToSatang(19.99), 1999);
  assert.equal(formatTHB(199900), '฿1,999');
  assert.equal(formatTHB(199950), '฿1,999.50');
  assert.equal(lineTotal(1999, 3), 5997);
  assert.throws(() => lineTotal(19.99, 1));
});

test('order status machine', () => {
  assert.ok(canTransition('PENDING', 'PAID'));
  assert.ok(!canTransition('DELIVERED', 'CANCELLED'));
  assert.ok(canSellerTransition('PAID', 'SHIPPED'));
  assert.ok(!canSellerTransition('PENDING', 'PAID'));
});

test('search chips round trip', () => {
  const parsed = parsedSearchSchema.parse({
    category: 'shoes',
    colours: ['red'],
    maxPrice: 2000,
    keywords: ['running shoes'],
  });
  const chips = buildSearchChips(parsed);
  assert.deepEqual(
    chips.map((c) => c.label),
    ['Shoes', 'Running Shoes', 'Red', 'Under ฿2,000'],
  );
  const without = applyIgnoredChips(parsed, ['colours:red', 'maxPrice']);
  assert.deepEqual(without.colours, []);
  assert.equal(without.maxPrice, null);
  assert.equal(without.category, 'shoes');
});

test('register schema requires store name for sellers', () => {
  const r = registerSchema.safeParse({ name: 'Ann', email: 'A@B.com', password: '12345678', role: 'SELLER' });
  assert.equal(r.success, false);
  const ok = registerSchema.parse({ name: 'Ann', email: 'A@B.com', password: '12345678' });
  assert.equal(ok.email, 'a@b.com');
  assert.equal(ok.role, 'BUYER');
});

test('deal helpers', () => {
  assert.equal(discountPercent(189000, 269000), 30);
  assert.equal(discountPercent(100, null), null);
  assert.equal(discountPercent(500, 400), null);
  assert.equal(formatSold(950), '950');
  assert.equal(formatSold(1234), '1.2k');
  assert.equal(formatSold(25600), '25k');
});
