import { describe, expect, it } from 'vitest';
import { buildKmOptions, buildPriceOptions, buildYearOptions, priceBoundsFromKey, priceKey } from './inventory-facets';

const L = 10_000_000; // 1 lakh in paise

describe('price options follow the real stock range', () => {
  it('builds round-lakh buckets that cover the stock, with open ends', () => {
    const o = buildPriceOptions({ min: 4 * L, max: 22 * L });
    expect(o[0]!.label).toMatch(/^Under ₹/);
    expect(o[o.length - 1]!.label).toMatch(/^Above ₹/);
    expect(o.length).toBeGreaterThanOrEqual(3);
    expect(o.length).toBeLessThanOrEqual(6);
    // buckets are contiguous: each upper bound is the next lower bound
    for (let i = 0; i < o.length - 1; i++) expect(o[i]!.maxPricePaise).toBe(o[i + 1]!.minPricePaise);
  });

  it('scales down for a small catalogue and returns nothing without stock', () => {
    expect(buildPriceOptions(null)).toEqual([]);
    expect(buildPriceOptions({ min: 5 * L, max: 5 * L })).toHaveLength(1);
  });

  it('round-trips the filter key', () => {
    expect(priceBoundsFromKey(priceKey(30 * L, 60 * L))).toEqual({ minPricePaise: 30 * L, maxPricePaise: 60 * L });
    expect(priceBoundsFromKey(priceKey(undefined, 30 * L))).toEqual({ maxPricePaise: 30 * L });
    expect(priceBoundsFromKey('')).toEqual({});
  });
});

describe('year and km options', () => {
  it('years run from the newest car downward within the stock range', () => {
    const y = buildYearOptions({ min: 2016, max: 2023 });
    expect(y[0]!.value).toBe(2023);
    expect(y.every(o => o.value >= 2016)).toBe(true);
    expect(y.length).toBeLessThanOrEqual(5);
    expect(buildYearOptions(null)).toEqual([]);
  });

  it('km caps reach the highest odometer in stock', () => {
    const km = buildKmOptions({ min: 12_000, max: 90_000 });
    expect(km[km.length - 1]!.value).toBe(100_000);
    expect(km[0]!.value).toBeGreaterThanOrEqual(12_000);
    expect(buildKmOptions(null)).toEqual([]);
  });
});
