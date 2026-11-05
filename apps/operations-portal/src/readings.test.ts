import { describe, expect, it } from 'vitest';
import { isBelowRecorded, parseReading, readingText, tripKmPreview } from './readings';

describe('reading helpers', () => {
  it('parses a field into a number only when something valid was typed', () => {
    expect(parseReading('')).toBeNull();
    expect(parseReading('  ')).toBeNull();
    expect(parseReading('abc')).toBeNull();
    expect(parseReading('-5')).toBeNull();
    expect(parseReading('0')).toBe(0); // 0 % fuel is a real reading, not "missing"
    expect(parseReading('41200')).toBe(41200);
    expect(parseReading(null)).toBeNull();
  });

  it('shows a recorded number in the form, and an empty field when nothing is recorded', () => {
    expect(readingText(0)).toBe('0');
    expect(readingText(62)).toBe('62');
    expect(readingText(undefined)).toBe('');
    expect(readingText(null)).toBe('');
  });

  it('flags only a reading below the one on record', () => {
    expect(isBelowRecorded('41000', 41200)).toBe(true);
    expect(isBelowRecorded('41200', 41200)).toBe(false);
    expect(isBelowRecorded('', 41200)).toBe(false);
    expect(isBelowRecorded('100', 0)).toBe(false); // a brand-new car with nothing recorded
    expect(isBelowRecorded('100', undefined)).toBe(false);
  });
});

describe('trip kilometre preview', () => {
  it('splits distance driven into the included allowance and the excess', () => {
    const preview = tripKmPreview({ pickupKm: 10_000, returnKm: 10_650, includedKm: 500, extraKmRatePaise: '1200' });
    expect(preview).toEqual({ drivenKm: 650, includedKm: 500, excessKm: 150, excessChargePaise: 180_000n });
  });

  it('has no excess within the allowance', () => {
    expect(tripKmPreview({ pickupKm: 10_000, returnKm: 10_300, includedKm: 500, extraKmRatePaise: 1200 })?.excessKm).toBe(0);
  });

  it('gives no preview before a return reading is entered or when it is below the start reading', () => {
    expect(tripKmPreview({ pickupKm: 10_000, returnKm: null, includedKm: 500, extraKmRatePaise: 1200 })).toBeNull();
    expect(tripKmPreview({ pickupKm: 10_000, returnKm: 9_000, includedKm: 500, extraKmRatePaise: 1200 })).toBeNull();
    expect(tripKmPreview({ pickupKm: undefined, returnKm: 9_000, includedKm: 500, extraKmRatePaise: 1200 })).toBeNull();
  });

  it('leaves the charge unknown when the rate is not available', () => {
    expect(tripKmPreview({ pickupKm: 0, returnKm: 700, includedKm: 500, extraKmRatePaise: undefined })?.excessChargePaise).toBeNull();
  });
});
