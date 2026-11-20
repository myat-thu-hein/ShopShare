/**
 * All prices are stored as integers in satang (1 baht = 100 satang).
 * Integers avoid floating-point rounding errors (0.1 + 0.2 !== 0.3).
 */

export const SATANG_PER_BAHT = 100;

export function bahtToSatang(baht: number): number {
  return Math.round(baht * SATANG_PER_BAHT);
}

export function satangToBaht(satang: number): number {
  return satang / SATANG_PER_BAHT;
}

/** Formats satang as Thai baht, e.g. 199900 -> "฿1,999" and 199950 -> "฿1,999.50". */
export function formatTHB(satang: number): string {
  const baht = satang / SATANG_PER_BAHT;
  const hasFraction = satang % SATANG_PER_BAHT !== 0;
  return (
    '฿' +
    baht.toLocaleString('en-US', {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}

/** Sums line items without ever leaving integer arithmetic. */
export function lineTotal(unitPriceSatang: number, quantity: number): number {
  if (!Number.isInteger(unitPriceSatang) || !Number.isInteger(quantity)) {
    throw new Error('Money values must be integers (satang)');
  }
  return unitPriceSatang * quantity;
}
