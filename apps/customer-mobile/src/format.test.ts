import { describe, expect, it } from 'vitest';
import { formatPaise, friendlyError } from './format';

describe('customer display helpers', () => {
  it('formats paise as Indian rupees without inventing decimals', () => {
    expect(formatPaise('95000000')).toContain('9,50,000');
  });

  it('maps safe customer-facing errors and hides unknown backend details', () => {
    expect(friendlyError(new Error('LISTING_NOT_AVAILABLE'))).toMatch(/no longer available/i);
    expect(friendlyError({ code: 'auth/multi-factor-auth-required' })).toMatch(/Two-factor authentication/i);
    expect(friendlyError({ code: 'auth/invalid-verification-code' })).toMatch(/Invalid verification code/i);
    expect(friendlyError(new Error('internal database text'))).toBe('We could not complete that request. Check your connection and try again.');
  });
});
