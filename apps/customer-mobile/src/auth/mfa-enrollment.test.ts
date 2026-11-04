import { describe, expect, it } from 'vitest';
import { inspectorNeedsMfaEnrollment, mfaEnrollmentErrorMessage, normalizeIndianMobile } from './mfa-enrollment';

describe('normalizeIndianMobile', () => {
  it('accepts common formats and returns E.164', () => {
    expect(normalizeIndianMobile('98765 43210')).toBe('+919876543210');
    expect(normalizeIndianMobile('+91 98765-43210')).toBe('+919876543210');
    expect(normalizeIndianMobile('09876543210')).toBe('+919876543210');
  });
  it('rejects numbers that cannot receive an Indian SMS', () => {
    expect(normalizeIndianMobile('12345')).toBeNull();
    expect(normalizeIndianMobile('5876543210')).toBeNull();
    expect(normalizeIndianMobile('')).toBeNull();
  });
});

describe('inspectorNeedsMfaEnrollment', () => {
  it('blocks only signed-in inspectors with zero enrolled factors', () => {
    expect(inspectorNeedsMfaEnrollment({ signedIn: true, isInspector: true, enrolledFactorCount: 0 })).toBe(true);
    expect(inspectorNeedsMfaEnrollment({ signedIn: true, isInspector: true, enrolledFactorCount: 1 })).toBe(false);
    expect(inspectorNeedsMfaEnrollment({ signedIn: true, isInspector: false, enrolledFactorCount: 0 })).toBe(false);
    expect(inspectorNeedsMfaEnrollment({ signedIn: false, isInspector: true, enrolledFactorCount: 0 })).toBe(false);
  });
  it('never locks anyone out when the factor count is unknown', () => {
    expect(inspectorNeedsMfaEnrollment({ signedIn: true, isInspector: true, enrolledFactorCount: null })).toBe(false);
  });
});

describe('mfaEnrollmentErrorMessage', () => {
  it('maps known Firebase codes and hides unknown details', () => {
    expect(mfaEnrollmentErrorMessage({ code: 'auth/invalid-verification-code' })).toMatch(/not correct/);
    expect(mfaEnrollmentErrorMessage(new Error('boom internal'))).toMatch(/could not complete/);
  });
});
