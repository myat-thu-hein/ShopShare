import { ttlToMs } from './cookies';

describe('ttlToMs', () => {
  it('parses durations', () => {
    expect(ttlToMs('15m')).toBe(900_000);
    expect(ttlToMs('1h')).toBe(3_600_000);
    expect(ttlToMs('30')).toBe(30_000);
    expect(ttlToMs('nonsense')).toBe(900_000);
  });
});
