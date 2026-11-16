import { describe, expect, it } from 'vitest';
import { accountErrorMessage, isSilentSignInError, normalizeIndianMobile, profileIsComplete, shouldFallBackToRedirect, validateProfileForm } from './account';

describe('profile completeness', () => {
  it('needs both a phone number and accepted terms, like the app', () => {
    expect(profileIsComplete(null)).toBe(false);
    expect(profileIsComplete({ id: '1', email: 'a@b.c', displayName: null, phone: '+919876543210', termsAcceptedAt: null })).toBe(false);
    expect(profileIsComplete({ id: '1', email: 'a@b.c', displayName: null, phone: null, termsAcceptedAt: '2026-01-01T00:00:00Z' })).toBe(false);
    expect(profileIsComplete({ id: '1', email: 'a@b.c', displayName: null, phone: '+919876543210', termsAcceptedAt: '2026-01-01T00:00:00Z' })).toBe(true);
  });
});

describe('mobile numbers', () => {
  it('accepts the ways people type an Indian mobile', () => {
    for (const typed of ['9876543210', '98765 43210', '+91 98765-43210', '919876543210', '09876543210', ' 98765 43210 ']) expect(normalizeIndianMobile(typed)).toBe('+919876543210');
  });
  it('rejects anything else', () => {
    for (const typed of ['', '12345', '5876543210', '98765432', '98765432101', '+1 415 555 0100', 'abcdefghij']) expect(normalizeIndianMobile(typed)).toBeNull();
  });
});

describe('profile form', () => {
  it('returns the normalised number when valid', () => {
    expect(validateProfileForm({ phone: '98765 43210', accepted: true })).toEqual({ value: { phone: '+919876543210' } });
  });
  it('explains each problem separately', () => {
    expect(validateProfileForm({ phone: '', accepted: true }).phone).toMatch(/Enter your mobile/);
    expect(validateProfileForm({ phone: '123', accepted: true }).phone).toMatch(/valid 10-digit/);
    expect(validateProfileForm({ phone: '9876543210', accepted: false }).terms).toMatch(/Terms/);
    const both = validateProfileForm({ phone: '', accepted: false });
    expect(both.phone && both.terms).toBeTruthy();
    expect(both.value).toBeUndefined();
  });
});

describe('sign-in errors', () => {
  it('uses plain wording and never leaks codes', () => {
    for (const code of ['auth/network-request-failed', 'auth/unauthorized-domain', 'auth/web-storage-unsupported', 'ACCOUNT_INACTIVE', 'SOMETHING_NEW']) {
      const text = accountErrorMessage({ code });
      expect(text).not.toMatch(/auth\/|_/);
      expect(text.length).toBeGreaterThan(10);
    }
    expect(accountErrorMessage({ status: 503, code: 'X' })).toMatch(/temporarily unavailable/);
    expect(accountErrorMessage({ status: 0, code: 'NETWORK_UNAVAILABLE' })).toMatch(/internet connection/);
    expect(accountErrorMessage(new Error('boom'))).toBe('Sign-in could not be completed. Please try again.');
  });
  it('treats closing the Google window as a choice', () => {
    expect(isSilentSignInError({ code: 'auth/popup-closed-by-user' })).toBe(true);
    expect(isSilentSignInError({ code: 'auth/network-request-failed' })).toBe(false);
  });
  it('falls back to redirect only when a popup cannot work, not when storage is blocked', () => {
    expect(shouldFallBackToRedirect({ code: 'auth/popup-blocked' })).toBe(true);
    expect(shouldFallBackToRedirect({ code: 'auth/operation-not-supported-in-this-environment' })).toBe(true);
    expect(shouldFallBackToRedirect({ code: 'auth/web-storage-unsupported' })).toBe(false);
    expect(shouldFallBackToRedirect({ code: 'auth/popup-closed-by-user' })).toBe(false);
  });
});
