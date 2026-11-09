import { describe, expect, it } from 'vitest';
import { describePhase, isFinalPhase, paymentCard } from './payment-status';

describe('payment status card', () => {
  it('says something plain for every phase, with the right tone', () => {
    expect(describePhase('opening').tone).toBe('busy');
    expect(describePhase('waiting', '₹2,500').message).toContain('₹2,500');
    expect(describePhase('confirming').title).toBe('Confirming your payment');
    expect(describePhase('confirmed', '₹2,500')).toMatchObject({ title: 'Payment confirmed', tone: 'success' });
    expect(describePhase('failed')).toMatchObject({ title: 'Payment failed', tone: 'error' });
    expect(describePhase('failed').message).toContain('no money was taken');
    expect(describePhase('pending')).toMatchObject({ title: 'Still confirming', tone: 'warning' });
    expect(describePhase('pending').message).toContain('do not need to pay again');
  });

  it('treats only the three results as final', () => {
    for (const phase of ['confirmed', 'failed', 'pending'] as const) expect(isFinalPhase(phase)).toBe(true);
    for (const phase of ['opening', 'waiting', 'confirming'] as const) expect(isFinalPhase(phase)).toBe(false);
  });

  it('shows a result until the customer closes it, and lets a pending result be checked again', async () => {
    paymentCard.show({ phase: 'confirming', amount: '₹100' });
    expect(paymentCard.get()).toMatchObject({ visible: true, phase: 'confirming' });

    const pending = paymentCard.finish('pending');
    expect(paymentCard.get()).toMatchObject({ visible: true, phase: 'pending' });
    paymentCard.choose('recheck');
    expect(await pending).toBe('recheck');
    expect(paymentCard.get().visible).toBe(true); // checking again keeps the card up

    const confirmed = paymentCard.finish('confirmed');
    paymentCard.choose('close');
    expect(await confirmed).toBe('close');
    expect(paymentCard.get().visible).toBe(false);
  });
});
