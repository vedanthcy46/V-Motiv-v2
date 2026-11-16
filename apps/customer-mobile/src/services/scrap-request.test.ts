import { describe, expect, it } from 'vitest';
import { digitsOnly, emptyForm, newSubmissionKey, serverFieldErrors, submitErrorMessage, tenDigitMobile, toPayload, validateForm, type ScrapFormValues } from './scrap-request';

const good: ScrapFormValues = { registrationNumber: 'ka 01 ab 1234', make: 'Hyundai', model: 'i10', year: '2008', fuelType: 'Petrol', odometerKm: '140000', condition: ' Engine knocks ', city: ' Bengaluru ', pickupAddress: '', phone: '98765 43210' };

describe('mobile numbers', () => {
  it('reads the ways a number is stored or typed', () => {
    for (const input of ['9876543210', '+919876543210', '+91 98765 43210', '919876543210', '09876543210']) expect(tenDigitMobile(input)).toBe('9876543210');
    for (const input of ['', null, undefined, '12345', '5876543210', '+1 415 555 0100']) expect(tenDigitMobile(input)).toBe('');
  });
  it('digitsOnly keeps digits and applies the length limit after removing everything else', () => {
    expect(digitsOnly('2,0a08')).toBe('2008');
    expect(digitsOnly('20081234', 4)).toBe('2008');
  });
});

describe('the form', () => {
  it('accepts a complete form', () => {
    expect(validateForm(good, 2026)).toEqual({});
  });
  it('names each missing or wrong field in plain words', () => {
    const errors = validateForm(emptyForm(), 2026);
    expect(Object.keys(errors).sort()).toEqual(['city', 'make', 'model', 'phone', 'registrationNumber', 'year']);
    expect(validateForm({ ...good, year: '1899' }, 2026).year).toMatch(/four-digit/);
    expect(validateForm({ ...good, year: '2028' }, 2026).year).toBeDefined();
    expect(validateForm({ ...good, year: '2027' }, 2026).year).toBeUndefined(); // next year's models exist
    expect(validateForm({ ...good, phone: '123' }, 2026).phone).toMatch(/10-digit/);
    expect(validateForm({ ...good, registrationNumber: 'ab' }, 2026).registrationNumber).toBeDefined();
  });
  it('optional fields may stay empty', () => {
    expect(validateForm({ ...good, fuelType: '', odometerKm: '', condition: '', pickupAddress: '' }, 2026)).toEqual({});
  });
});

describe('what is sent', () => {
  it('trims, formats the phone with +91, and leaves out what was not filled in', () => {
    const payload = toPayload({ ...good, fuelType: '', odometerKm: '', pickupAddress: '' }, 'scrap-key-1');
    expect(payload).toEqual({ registrationNumber: 'ka 01 ab 1234', make: 'Hyundai', model: 'i10', manufacturingYear: 2008, condition: 'Engine knocks', city: 'Bengaluru', contactPhone: '+919876543210', submissionKey: 'scrap-key-1' });
  });
  it('includes the optional fields when given, with numbers as numbers', () => {
    const payload = toPayload({ ...good, pickupAddress: '12 MG Road' }, 'k');
    expect(payload).toMatchObject({ fuelType: 'Petrol', odometerKm: 140000, pickupAddress: '12 MG Road' });
  });
  it('makes a different key each time the form is opened', () => {
    const a = newSubmissionKey(() => 0.1, 1000);
    const b = newSubmissionKey(() => 0.2, 1000);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(8);
  });
});

describe('errors from the server', () => {
  it('points at the fields the server refused', () => {
    expect(serverFieldErrors({ details: { issues: [{ path: ['manufacturingYear'], message: 'x' }, { path: ['contactPhone'], message: 'y' }, { path: ['nope'], message: 'z' }] } })).toEqual({ year: 'Please check this.', phone: 'Please check this.' });
    expect(serverFieldErrors(new Error('x'))).toEqual({});
  });
  it('uses the server sentence where it words it, and plain wording otherwise', () => {
    expect(submitErrorMessage({ status: 409, code: 'SCRAP_REQUEST_ALREADY_OPEN', message: 'You already asked us to scrap this vehicle (SCR-2026-000001).' })).toMatch(/SCR-2026-000001/);
    expect(submitErrorMessage({ status: 0, code: 'NETWORK_UNREACHABLE' })).toMatch(/Nothing was sent/);
    expect(submitErrorMessage({ status: 500, code: 'X' })).toMatch(/had a problem/);
    expect(submitErrorMessage({ status: 400, code: 'INVALID_REQUEST' })).toMatch(/check the details/);
    expect(submitErrorMessage(new Error('boom'))).not.toMatch(/boom/);
  });
});
