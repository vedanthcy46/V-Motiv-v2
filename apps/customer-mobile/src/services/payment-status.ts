// The payment status card: one small store that the payment code drives and PaymentStatusHost draws.
// Phases: opening (creating the order) -> waiting (customer is paying in the browser) -> confirming (back in the app,
// asking the server) -> confirmed | failed | pending (the final answer, shown until the customer closes it).
import { useSyncExternalStore } from 'react';

export type PaymentPhase = 'opening' | 'waiting' | 'confirming' | 'confirmed' | 'failed' | 'pending';
export type CardTone = 'busy' | 'success' | 'error' | 'warning';

export interface PaymentCardState {
  visible: boolean;
  phase: PaymentPhase;
  /** Formatted amount, e.g. "₹2,500". */
  amount?: string;
  orderId?: string;
  /** Shown on the failed card when the server gave a reason. */
  detail?: string;
}

export function isFinalPhase(phase: PaymentPhase): boolean {
  return phase === 'confirmed' || phase === 'failed' || phase === 'pending';
}

/** What the card says for a phase. Plain words; no technical codes. */
export function describePhase(phase: PaymentPhase, amount?: string): { title: string; message: string; tone: CardTone } {
  const sum = amount ? ` of ${amount}` : '';
  switch (phase) {
    case 'opening':
      return { title: 'Opening secure payment', message: 'Please wait a moment…', tone: 'busy' };
    case 'waiting':
      return { title: 'Complete your payment', message: `Finish the payment${sum} in the browser. Come back to the app afterwards - we will confirm it here.`, tone: 'busy' };
    case 'confirming':
      return { title: 'Confirming your payment', message: 'Please do not close the app. This usually takes a few seconds.', tone: 'busy' };
    case 'confirmed':
      return { title: 'Payment confirmed', message: `Your payment${sum} was received and recorded.`, tone: 'success' };
    case 'failed':
      return { title: 'Payment failed', message: 'The payment did not go through and no money was taken. You can try again.', tone: 'error' };
    case 'pending':
      return { title: 'Still confirming', message: 'We have not received confirmation from your bank yet. If money was deducted it will show up here automatically - you do not need to pay again.', tone: 'warning' };
  }
}

export type CardChoice = 'close' | 'recheck';

let state: PaymentCardState = { visible: false, phase: 'opening' };
let choose: ((choice: CardChoice) => void) | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

export const paymentCard = {
  show(next: Partial<PaymentCardState> & { phase: PaymentPhase }) {
    state = { ...state, ...next, visible: true, detail: next.detail };
    emit();
  },
  update(patch: Partial<PaymentCardState>) {
    state = { ...state, ...patch };
    emit();
  },
  hide() {
    state = { ...state, visible: false };
    choose = null;
    emit();
  },
  /** Shows a final result and waits until the customer closes the card (or asks to check again). */
  finish(phase: 'confirmed' | 'failed' | 'pending', patch: Partial<PaymentCardState> = {}): Promise<CardChoice> {
    state = { ...state, ...patch, phase, visible: true };
    emit();
    return new Promise<CardChoice>(resolve => { choose = resolve; });
  },
  /** Called by the card's buttons. */
  choose(choice: CardChoice) {
    const resolve = choose;
    choose = null;
    if (choice === 'close') state = { ...state, visible: false };
    emit();
    resolve?.(choice);
  },
  get(): PaymentCardState { return state; },
};

export function usePaymentCard(): PaymentCardState {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => state,
    () => state,
  );
}
