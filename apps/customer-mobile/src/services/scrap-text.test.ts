import { describe, expect, it } from 'vitest';
import {
  DISPUTE_STATUS_TEXT, DOCUMENT_STATUS_TEXT, OBLIGATION_STATUS_TEXT, PAYMENT_STATE_TEXT, PICKUP_STATUS_TEXT, REGISTRATION_TEXT,
  documentName, formatDate, isClosedStatus, payerText, timeLeftText,
} from './scrap-text';
import { DISPUTE_CATEGORY_LABELS } from './scrap-form';

describe('plain wording', () => {
  it('has wording for every state the server can send, so no screen ever shows a raw code', () => {
    const covered = (map: Record<string, string>, states: string[]) => states.forEach(state => expect(map[state], state).toBeTruthy());
    covered(PICKUP_STATUS_TEXT, ['SCHEDULED', 'CUSTOMER_CONFIRMED', 'AGENT_ASSIGNED', 'COLLECTED', 'FAILED', 'RESCHEDULED', 'CANCELLED']);
    covered(OBLIGATION_STATUS_TEXT, ['RECORDED', 'PARTIALLY_SETTLED', 'SETTLED', 'FAILED', 'DISPUTED', 'CANCELLED']);
    covered(PAYMENT_STATE_TEXT, ['NOT_APPLICABLE', 'NOT_STARTED', 'OBLIGATION_RECORDED', 'PARTIALLY_PAID', 'PAID_VERIFIED', 'FAILED', 'DISPUTED']);
    covered(REGISTRATION_TEXT, ['NOT_STARTED', 'PENDING', 'EVIDENCE_RECEIVED', 'VERIFIED', 'FAILED']);
    covered(DOCUMENT_STATUS_TEXT, ['REQUESTED', 'UPLOADED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'EXPIRED']);
    covered(DISPUTE_STATUS_TEXT, ['OPEN', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'REJECTED']);
    covered(Object.fromEntries(DISPUTE_CATEGORY_LABELS.map(item => [item.value, item.label])), ['OFFER_DISCREPANCY', 'VIN_MISMATCH', 'VEHICLE_CONDITION_MISMATCH', 'WRONG_BENEFICIARY', 'CERTIFICATE_MISMATCH', 'PICKUP_DAMAGE', 'OTHER']);
  });

  it('never states a payment or a registration is confirmed unless that is exactly the state', () => {
    for (const [state, text] of Object.entries(PAYMENT_STATE_TEXT)) if (state !== 'PAID_VERIFIED') expect(text).not.toMatch(/confirmed/i);
    for (const [state, text] of Object.entries(REGISTRATION_TEXT)) if (state !== 'VERIFIED') expect(text).not.toMatch(/^Confirmed/i);
  });

  it('names documents, falling back to a tidy version of an unknown type', () => {
    expect(documentName('RC')).toMatch(/registration certificate/i);
    expect(documentName('SOME_NEW_DOC')).toBe('Some new doc');
  });

  it('says who pays the customer, and never implies V MOTIV holds the money unless it is the payer', () => {
    expect(payerText('RVSF', 'Green Scrap Ltd')).toBe('Paid to you directly by Green Scrap Ltd');
    expect(payerText('RVSF', null)).toMatch(/directly by the authorised scrapping facility/);
    expect(payerText('VMOTIV')).toBe('Paid to you by V MOTIV');
  });

  it('describes how long an offer stays open, never negative', () => {
    const now = Date.parse('2026-11-16T10:00:00Z');
    expect(timeLeftText('2026-11-16T09:00:00Z', now)).toBe('Expired');
    expect(timeLeftText('2026-11-16T10:20:00Z', now)).toBe('Expires in 20 minutes');
    expect(timeLeftText('2026-11-16T13:00:00Z', now)).toBe('Expires in 3 hours');
    expect(timeLeftText('2026-11-16T11:00:00Z', now)).toBe('Expires in 1 hour');
    expect(timeLeftText('2026-11-20T10:00:00Z', now)).toBe('Expires in 4 days');
    expect(timeLeftText('garbage', now)).toBe('');
  });

  it('groups requests into in progress and history, and tolerates bad dates', () => {
    expect(['COMPLETED', 'REJECTED', 'CANCELLED'].every(isClosedStatus)).toBe(true);
    expect(['DRAFT', 'ON_HOLD', 'COLLECTED'].some(isClosedStatus)).toBe(false);
    expect(formatDate(null)).toBe('');
    expect(formatDate('not a date')).toBe('');
  });
});
