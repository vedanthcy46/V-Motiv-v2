import { describe, expect, it } from 'vitest';
import { distinctUpper, nextFilterValue } from './filter-cycle';

describe('filter cycling', () => {
  it('only offers values that exist, so CNG and Hybrid cars can be filtered too', () => {
    const fuels = distinctUpper(['Petrol', 'cng', 'PETROL', null, ' hybrid ']);
    expect(fuels).toEqual(['CNG', 'HYBRID', 'PETROL']);
    expect(nextFilterValue('ALL', fuels)).toBe('CNG');
    expect(nextFilterValue('CNG', fuels)).toBe('HYBRID');
    expect(nextFilterValue('PETROL', fuels)).toBe('ALL');
  });
  it('resets safely when the current option disappears or there are no options', () => {
    expect(nextFilterValue('DIESEL', ['PETROL'])).toBe('ALL');
    expect(nextFilterValue('ALL', [])).toBe('ALL');
  });
});
