import { describe, expect, it } from 'vitest';
import { deliveryView, emailErrorText } from './invitation-delivery.js';

const mail = (state: string, errorCode: string | null = null) => ({ state, errorCode, attempts: 2, updatedAt: '2026-11-27T10:00:00Z' });

describe('invitation email status', () => {
  it('says why it was not delivered', () => {
    expect(deliveryView(mail('FAILED', 'RECIPIENT_REJECTED'))).toMatchObject({ label: 'Not delivered', problem: true });
    expect(deliveryView(mail('FAILED', 'RECIPIENT_REJECTED')).detail).toMatch(/spelled correctly/);
    expect(deliveryView(mail('PENDING', 'SENDER_NOT_VERIFIED'))).toMatchObject({ label: 'Retrying', problem: true });
    expect(deliveryView(null)).toMatchObject({ problem: true });
  });
  it('does not claim an email reached the inbox just because the provider took it', () => {
    const view = deliveryView(mail('ACCEPTED'));
    expect(view.label).toBe('Sent');
    expect(view.detail).toMatch(/spam/);
  });
  it('shows a queued email as waiting, and keeps an unknown code readable', () => {
    expect(deliveryView(mail('PENDING'))).toMatchObject({ label: 'Waiting to send', problem: false });
    expect(emailErrorText('NEW_CODE')).toContain('NEW_CODE');
  });
});
