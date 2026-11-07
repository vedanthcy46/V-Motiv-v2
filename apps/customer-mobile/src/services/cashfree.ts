import { AppState, Linking } from 'react-native';
import { api, ApiError } from '../api';

export type CashfreeOutcome =
  | { outcome: 'PAID'; orderId: string }
  | { outcome: 'PENDING' | 'FAILED'; orderId: string }
  /** Cashfree is not set up on this server (local development): the caller may use the demo payment instead. */
  | { outcome: 'UNAVAILABLE' };

interface CreatedOrder { orderId: string; checkoutUrl: string }
interface OrderStatus { status: string }

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Resolves when the customer comes back to the app: via the vmotiv://payment-result link, or by switching back. */
function waitForReturn(): Promise<void> {
  return new Promise(resolve => {
    let left = false;
    const done = () => { link.remove(); state.remove(); resolve(); };
    const link = Linking.addEventListener('url', ({ url }) => { if (url.includes('payment-result')) done(); });
    const state = AppState.addEventListener('change', next => {
      if (next !== 'active') left = true;
      else if (left) done();
    });
  });
}

/**
 * Pay through Cashfree. Opens Cashfree's checkout in the browser, waits for the customer to come back, then confirms
 * with our server (which asks Cashfree whether the money arrived and records the payment).
 */
export async function payWithCashfree(kind: 'RENTAL' | 'SERVICE', referenceId: string, amountPaise?: string): Promise<CashfreeOutcome> {
  let order: CreatedOrder;
  try {
    order = await api<CreatedOrder>('/api/v2/payments/cashfree/orders', {
      method: 'POST',
      body: JSON.stringify({ kind, referenceId, ...(amountPaise ? { amountPaise } : {}) }),
    });
  } catch (error) {
    // Only the server's explicit "not configured" answer means Cashfree is not set up. Any other 503 (overload, outage) is a
    // temporary failure and must not be mistaken for a configuration problem or trigger the demo payment.
    if (error instanceof ApiError && error.code === 'PAYMENT_GATEWAY_NOT_CONFIGURED') return { outcome: 'UNAVAILABLE' };
    throw error;
  }

  const returned = waitForReturn();
  await Linking.openURL(order.checkoutUrl);
  await returned;

  // Our server settles on the redirect or the webhook; allow a few seconds for either.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await api<OrderStatus>(`/api/v2/payments/cashfree/orders/${order.orderId}`).catch(() => null);
    if (result?.status === 'SETTLED') return { outcome: 'PAID', orderId: order.orderId };
    await wait(1500);
  }
  return { outcome: 'PENDING', orderId: order.orderId };
}
