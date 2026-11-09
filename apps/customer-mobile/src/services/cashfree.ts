import { AppState, Linking } from 'react-native';
import { api, ApiError } from '../api';
import { formatPrice } from '../format';
import { paymentCard } from './payment-status';

export type CashfreeOutcome =
  | { outcome: 'PAID'; orderId: string }
  | { outcome: 'PENDING' | 'FAILED'; orderId: string }
  /** Cashfree is not set up on this server (local development): the caller may use the demo payment instead. */
  | { outcome: 'UNAVAILABLE' };

interface CreatedOrder { orderId: string; checkoutUrl: string; amountPaise?: string }
/** `state` is the server's verdict: PAID (recorded), FAILED (declined / expired) or PENDING (still being confirmed). */
interface OrderStatus { status: string; state?: 'PAID' | 'FAILED' | 'PENDING'; amountPaise?: string }

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type ReturnHint = 'SUCCESS' | 'FAILED' | 'PENDING' | null;

/** Resolves when the customer comes back to the app: via the vmotiv://payment-result link (with its status), or by switching back. */
function waitForReturn(): Promise<ReturnHint> {
  return new Promise(resolve => {
    let left = false;
    const done = (hint: ReturnHint) => { link.remove(); state.remove(); resolve(hint); };
    const link = Linking.addEventListener('url', ({ url }) => {
      if (!url.includes('payment-result')) return;
      const status = /[?&]status=([A-Z]+)/.exec(url)?.[1];
      done(status === 'SUCCESS' || status === 'FAILED' || status === 'PENDING' ? status : null);
    });
    const state = AppState.addEventListener('change', next => {
      if (next !== 'active') left = true;
      else if (left) done(null);
    });
  });
}

/**
 * Asks our server what happened to the order until it is settled (or clearly failed). The server checks with Cashfree and
 * records the payment, so this is also what completes the booking.
 */
async function confirm(orderId: string, rounds = 20): Promise<{ result: 'PAID' | 'FAILED' | 'PENDING'; amountPaise?: string }> {
  let amountPaise: string | undefined;
  for (let attempt = 0; attempt < rounds; attempt += 1) {
    const status = await api<OrderStatus>(`/api/v2/payments/cashfree/orders/${orderId}`).catch(() => null);
    if (status?.amountPaise) amountPaise = status.amountPaise;
    if (status?.status === 'SETTLED' || status?.state === 'PAID') return { result: 'PAID', amountPaise };
    if (status?.state === 'FAILED') return { result: 'FAILED', amountPaise };
    await wait(2000);
  }
  return { result: 'PENDING', amountPaise };
}

/**
 * Pay through Cashfree. A status card stays on screen the whole time: opening -> "complete your payment" while the customer
 * is in the browser -> "confirming" when they return -> confirmed / failed / still confirming. The returned promise settles
 * when the customer closes the card, so the screen behind it only continues after they have seen the result.
 */
export async function payWithCashfree(kind: 'RENTAL' | 'SERVICE', referenceId: string, amountPaise?: string): Promise<CashfreeOutcome> {
  paymentCard.show({ phase: 'opening', amount: amountPaise ? formatPrice(amountPaise) : undefined, orderId: undefined, detail: undefined });

  let order: CreatedOrder;
  try {
    order = await api<CreatedOrder>('/api/v2/payments/cashfree/orders', {
      method: 'POST',
      body: JSON.stringify({ kind, referenceId, ...(amountPaise ? { amountPaise } : {}) }),
    });
  } catch (error) {
    // Only the server's explicit "not configured" answer means Cashfree is not set up. Any other 503 (overload, outage) is a
    // temporary failure and must not be mistaken for a configuration problem or trigger the demo payment.
    if (error instanceof ApiError && error.code === 'PAYMENT_GATEWAY_NOT_CONFIGURED') {
      paymentCard.hide();
      return { outcome: 'UNAVAILABLE' };
    }
    const reason = error instanceof Error ? error.message : undefined;
    await paymentCard.finish('failed', { detail: reason && reason !== 'INTERNAL_ERROR' ? reason : undefined });
    return { outcome: 'FAILED', orderId: '' };
  }

  const amountText = order.amountPaise ? formatPrice(order.amountPaise) : amountPaise ? formatPrice(amountPaise) : undefined;
  paymentCard.update({ phase: 'waiting', orderId: order.orderId, amount: amountText });

  const returned = waitForReturn();
  try {
    await Linking.openURL(order.checkoutUrl);
  } catch {
    await paymentCard.finish('failed', { detail: 'The payment page could not be opened.' });
    return { outcome: 'FAILED', orderId: order.orderId };
  }
  const hint = await returned;

  // Back in the app: confirm with the server, and keep confirming for as long as the customer asks.
  for (;;) {
    paymentCard.update({ phase: 'confirming' });
    const { result, amountPaise: confirmedAmount } = await confirm(order.orderId, hint === 'FAILED' ? 3 : 20);
    const amount = confirmedAmount ? formatPrice(confirmedAmount) : amountText;
    if (result === 'PAID') {
      await paymentCard.finish('confirmed', { amount });
      return { outcome: 'PAID', orderId: order.orderId };
    }
    if (result === 'FAILED') {
      await paymentCard.finish('failed', { amount });
      return { outcome: 'FAILED', orderId: order.orderId };
    }
    const choice = await paymentCard.finish('pending', { amount });
    if (choice === 'close') return { outcome: 'PENDING', orderId: order.orderId };
  }
}
