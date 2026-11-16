import { describe, expect, it } from 'vitest';
import { webErrorMessage } from './messages';

describe('web error wording', () => {
  it('words connection problems for a browser and never says "phone"', () => {
    const offline = webErrorMessage({ status: 0, code: 'NETWORK_UNAVAILABLE' });
    expect(offline).toMatch(/internet connection/);
    expect(offline).toMatch(/this browser/);
    expect(offline).not.toMatch(/phone/i);
    expect(webErrorMessage({ status: 0, code: 'REQUEST_TIMED_OUT' })).toMatch(/did not respond/);
  });

  it('uses the shared wording for scrapping errors', () => {
    expect(webErrorMessage({ status: 409, code: 'OFFER_EXPIRED' })).toMatch(/expired/);
    expect(webErrorMessage({ status: 409, code: 'SCRAP_REQUEST_ALREADY_ACTIVE' })).toMatch(/already in progress/);
    expect(webErrorMessage({ status: 503, code: 'SCRAP_SCHEMA_NOT_READY' })).toMatch(/not available yet/);
  });

  it('turns server faults and unknown codes into plain sentences', () => {
    expect(webErrorMessage({ status: 500, code: 'INTERNAL' })).toMatch(/had a problem/);
    expect(webErrorMessage({ status: 401, code: 'AUTHENTICATION_REQUIRED' })).toMatch(/sign in again/);
    const unknown = webErrorMessage(Object.assign(new Error('SOME_NEW_CODE'), { status: 400, code: 'SOME_NEW_CODE' }), 'Please check your answers.');
    expect(unknown).toBe('Please check your answers.');
  });
});
