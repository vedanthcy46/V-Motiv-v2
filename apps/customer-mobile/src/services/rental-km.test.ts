import { describe, expect, it } from 'vitest';
import { kmPackageSummary } from './rental-km';

describe('kmPackageSummary', () => {
  it('uses the hub policy set by the administrator', () => {
    expect(kmPackageSummary({ includedKmPerDay: 300, extraKmRatePaise: '1500' }, 3)).toBe('Includes 900 km (300 km/day) · Extra km ₹15/km');
  });
  it('does not invent a package when the hub has no policy', () => {
    expect(kmPackageSummary(null, 3)).toMatch(/varies by car/);
    expect(kmPackageSummary({ includedKmPerDay: null, extraKmRatePaise: '1200' }, 3)).toMatch(/varies by car/);
  });
  it('omits the extra rate when only free km is configured', () => {
    expect(kmPackageSummary({ includedKmPerDay: 200, extraKmRatePaise: null }, 1)).toBe('Includes 200 km (200 km/day)');
  });
});
