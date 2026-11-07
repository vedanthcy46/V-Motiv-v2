// Cashfree Payments (PG v2023-08-01). Server-to-server only: the secret key never reaches an app or browser.
//   CASHFREE_APP_ID, CASHFREE_SECRET_KEY   from the Cashfree dashboard (the same account you use in your other project)
//   CASHFREE_ENV                           "sandbox" (default, test mode) or "production"
//   CASHFREE_API_VERSION                   optional, default 2023-08-01
import crypto from 'node:crypto';
import { HttpError } from './errors.js';

export interface CashfreeConfig { appId: string; secret: string; mode: 'sandbox' | 'production'; version: string; baseUrl: string }

export function cashfreeConfig(env: NodeJS.ProcessEnv = process.env): CashfreeConfig | null {
  const appId = env.CASHFREE_APP_ID?.trim();
  const secret = env.CASHFREE_SECRET_KEY?.trim();
  if (!appId || !secret) return null;
  const mode = env.CASHFREE_ENV?.trim().toLowerCase() === 'production' ? 'production' : 'sandbox';
  return { appId, secret, mode, version: env.CASHFREE_API_VERSION?.trim() || '2023-08-01', baseUrl: mode === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg' };
}

type FetchLike = (url: string, init: { method?: string; headers: Record<string, string>; body?: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;
export interface CashfreeOptions { env?: NodeJS.ProcessEnv; fetchImpl?: FetchLike; timeoutMs?: number }

async function cashfreeRequest(path: string, init: { method?: string; body?: unknown }, opts: CashfreeOptions): Promise<any> {
  const config = cashfreeConfig(opts.env);
  if (!config) throw new HttpError(503, 'PAYMENT_GATEWAY_NOT_CONFIGURED');
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((url, i) => fetch(url, i) as any);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetchImpl(`${config.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: { 'x-client-id': config.appId, 'x-client-secret': config.secret, 'x-api-version': config.version, 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    if (res.status === 404) throw new HttpError(402, 'PAYMENT_NOT_FOUND_AT_GATEWAY');
    if (!res.ok) {
      // Cashfree explains why it refused (wrong key for this mode, bad phone, return URL not https...). Keep that reason: it is
      // written to the server log and sent back as the error message so a failure can be understood. It never contains our keys.
      const detail = await res.json().catch(() => null) as { code?: string; type?: string; message?: string } | null;
      const reason = [detail?.code, detail?.message].filter(Boolean).join(': ').slice(0, 300);
      console.error(`[CASHFREE] ${init.method ?? 'GET'} ${path.replace(/\/orders\/[^/]+/, '/orders/:id')} -> ${res.status}${reason ? ` ${reason}` : ''} (mode ${config.mode})`);
      const rejected = res.status === 400 || res.status === 422;
      throw new HttpError(rejected ? 400 : 502, rejected ? 'PAYMENT_GATEWAY_REJECTED_ORDER' : 'PAYMENT_GATEWAY_UNAVAILABLE', reason || undefined);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, 'PAYMENT_GATEWAY_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }
}

const rupees = (paise: bigint) => `${paise / 100n}.${String(paise % 100n).padStart(2, '0')}`;
const toPaise = (amount: unknown): bigint => {
  const text = String(amount);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new HttpError(502, 'PAYMENT_GATEWAY_BAD_RESPONSE');
  const [whole, frac = ''] = text.split('.');
  return BigInt(whole!) * 100n + BigInt(frac.padEnd(2, '0'));
};

export interface CashfreeOrder { orderId: string; paymentSessionId: string; status: string }

export async function createCashfreeOrder(
  input: { orderId: string; amountPaise: bigint; customerId: string; customerPhone?: string | null; customerEmail?: string | null; customerName?: string | null; returnUrl: string; notifyUrl?: string; note?: string },
  opts: CashfreeOptions = {},
): Promise<CashfreeOrder> {
  if (!/^[A-Za-z0-9_-]{3,45}$/.test(input.orderId)) throw new HttpError(400, 'INVALID_ORDER_ID');
  if (input.amountPaise < 100n) throw new HttpError(400, 'INVALID_PAYMENT_AMOUNT');
  const phone = (input.customerPhone ?? '').replace(/\D/g, '').slice(-10);
  const body = await cashfreeRequest('/orders', {
    method: 'POST',
    body: {
      order_id: input.orderId,
      order_amount: Number(rupees(input.amountPaise)),
      order_currency: 'INR',
      customer_details: {
        customer_id: input.customerId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50),
        customer_phone: phone.length === 10 ? phone : '9999999999',
        ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
        ...(input.customerName ? { customer_name: input.customerName.slice(0, 100) } : {}),
      },
      order_meta: { return_url: input.returnUrl, ...(input.notifyUrl ? { notify_url: input.notifyUrl } : {}) },
      ...(input.note ? { order_note: input.note.slice(0, 200) } : {}),
    },
  }, opts);
  if (!body?.payment_session_id || String(body.order_id) !== input.orderId) throw new HttpError(502, 'PAYMENT_GATEWAY_BAD_RESPONSE');
  return { orderId: String(body.order_id), paymentSessionId: String(body.payment_session_id), status: String(body.order_status ?? 'ACTIVE') };
}

export type CashfreePaymentState = 'PAID' | 'FAILED' | 'PENDING';

export interface CashfreePaidOrder { orderId: string; status: string; orderAmountPaise: bigint; currency: string; paymentId: string | null; paidAmountPaise: bigint | null; state: CashfreePaymentState }

/**
 * The customer-facing result of an order. Cashfree keeps an order ACTIVE after a declined attempt (the customer may retry),
 * so a failure shows up in the payment attempts, not in the order status.
 * PAID: money received. FAILED: the order expired, or every attempt was declined / abandoned. PENDING: anything else
 * (bank still confirming, or the customer has not paid yet).
 */
export function classifyPaymentState(orderStatus: string, payments: unknown): CashfreePaymentState {
  const attempts = Array.isArray(payments) ? payments.map((p: any) => String(p?.payment_status ?? '').toUpperCase()) : [];
  if (orderStatus === 'PAID' || attempts.includes('SUCCESS')) return 'PAID';
  if (attempts.includes('PENDING') || attempts.includes('INITIATED')) return 'PENDING';
  if (['EXPIRED', 'TERMINATED', 'CANCELLED'].includes(orderStatus)) return 'FAILED';
  if (attempts.length > 0 && attempts.every(status => ['FAILED', 'USER_DROPPED', 'CANCELLED', 'VOID', 'NOT_ATTEMPTED'].includes(status))) return 'FAILED';
  return 'PENDING';
}

/** What Cashfree says about an order and its successful payment (if any). Never trusts what the app claims. */
export async function fetchCashfreeOrder(orderId: string, opts: CashfreeOptions = {}): Promise<CashfreePaidOrder> {
  if (!/^[A-Za-z0-9_-]{3,45}$/.test(orderId)) throw new HttpError(400, 'INVALID_ORDER_ID');
  const order = await cashfreeRequest(`/orders/${orderId}`, {}, opts);
  const payments = await cashfreeRequest(`/orders/${orderId}/payments`, {}, opts);
  const success = Array.isArray(payments) ? payments.find((p: any) => p?.payment_status === 'SUCCESS') : undefined;
  return {
    orderId: String(order?.order_id ?? orderId),
    status: String(order?.order_status ?? 'UNKNOWN'),
    orderAmountPaise: toPaise(order?.order_amount),
    currency: String(order?.order_currency ?? 'INR'),
    paymentId: success?.cf_payment_id !== undefined ? String(success.cf_payment_id) : null,
    paidAmountPaise: success ? toPaise(success.payment_amount) : null,
    state: classifyPaymentState(String(order?.order_status ?? ''), payments),
  };
}

/** Webhook signature: base64(HMAC-SHA256(timestamp + rawBody, secretKey)). */
export function assertCashfreeWebhookSignature(rawBody: string, timestamp: string | undefined, signature: string | undefined, env: NodeJS.ProcessEnv = process.env): void {
  const config = cashfreeConfig(env);
  if (!config) throw new HttpError(503, 'PAYMENT_GATEWAY_NOT_CONFIGURED');
  if (!timestamp || !signature) throw new HttpError(401, 'INVALID_WEBHOOK_SIGNATURE');
  const expected = crypto.createHmac('sha256', config.secret).update(timestamp + rawBody).digest('base64');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, 'INVALID_WEBHOOK_SIGNATURE');
}

export function isCashfreeProof(proof: { paymentGateway?: string | null }): boolean {
  return (proof.paymentGateway ?? '').toUpperCase() === 'CASHFREE';
}

/**
 * Confirms a Cashfree payment with Cashfree itself: the order is PAID, the payment id is a successful payment on it,
 * the currency is INR and the amount covers (or, with `exact`, equals) what is expected. Returns the amount paid.
 * Without Cashfree credentials it refuses in production and passes through in local development, like the other gateways.
 */
export async function assertCashfreePaid(
  proof: { gatewayOrderId?: string | null; gatewayPaymentId?: string | null },
  expectedPaise: bigint | null,
  opts: CashfreeOptions & { exact?: boolean } = {},
): Promise<bigint | null> {
  const env = opts.env ?? process.env;
  if (!cashfreeConfig(env)) {
    if (env.NODE_ENV === 'production') throw new HttpError(503, 'PAYMENT_GATEWAY_NOT_CONFIGURED');
    return null;
  }
  if (!proof.gatewayOrderId || !proof.gatewayPaymentId) throw new HttpError(400, 'INVALID_PAYMENT_SIGNATURE');
  const order = await fetchCashfreeOrder(proof.gatewayOrderId, opts);
  if (order.status !== 'PAID' || !order.paymentId) throw new HttpError(402, 'PAYMENT_NOT_CAPTURED');
  if (order.paymentId !== proof.gatewayPaymentId) throw new HttpError(402, 'PAYMENT_ORDER_MISMATCH');
  if (order.currency !== 'INR') throw new HttpError(402, 'PAYMENT_CURRENCY_MISMATCH');
  const paid = order.paidAmountPaise ?? order.orderAmountPaise;
  if (expectedPaise !== null && (opts.exact ? paid !== expectedPaise : paid < expectedPaise)) throw new HttpError(402, 'PAYMENT_AMOUNT_MISMATCH');
  return paid;
}

/**
 * What kind of Cashfree keys the server holds, judged only from the public format markers (never the keys themselves):
 * test app ids start with "TEST" and test secrets with "cfsk_ma_test_"; live secrets start with "cfsk_ma_prod_".
 * Used to explain a 401 "authentication failed" - almost always keys that do not match the mode, or stray characters.
 */
export function describeCashfreeKeys(env: NodeJS.ProcessEnv = process.env) {
  const rawId = env.CASHFREE_APP_ID ?? '';
  const rawSecret = env.CASHFREE_SECRET_KEY ?? '';
  const id = rawId.trim();
  const secret = rawSecret.trim();
  const kind = (value: string, test: RegExp, live: RegExp): 'test' | 'live' | 'unknown' => (test.test(value) ? 'test' : live.test(value) ? 'live' : 'unknown');
  const appIdKind = kind(id, /^TEST/i, /^(?!TEST)[A-Za-z0-9]{8,}$/);
  const secretKind = kind(secret, /^cfsk_ma_test_/i, /^cfsk_ma_prod_/i);
  const mode = env.CASHFREE_ENV?.trim().toLowerCase() === 'production' ? 'production' : 'sandbox';
  const problems: string[] = [];
  if (/[\s"']/.test(id) || /[\s"']/.test(secret)) problems.push('A key contains a space, line break or quote character - paste the bare value only.');
  if (secret.startsWith('cfsk_ma_') === false && secret) problems.push('The secret does not look like a Cashfree Payment Gateway secret (expected to start with cfsk_ma_test_ or cfsk_ma_prod_). Make sure the App ID and Secret are not swapped and are the Payment Gateway keys, not Payouts / Verification keys.');
  if (mode === 'sandbox' && (secretKind === 'live' || appIdKind === 'live')) problems.push('CASHFREE_ENV is sandbox but the keys are LIVE keys. Use the test keys, or set CASHFREE_ENV=production.');
  if (mode === 'production' && (secretKind === 'test' || appIdKind === 'test')) problems.push('CASHFREE_ENV is production but the keys are TEST keys. Use the live keys, or set CASHFREE_ENV=sandbox.');
  if (appIdKind !== 'unknown' && secretKind !== 'unknown' && appIdKind !== secretKind) problems.push('The App ID and the Secret are from different environments (one test, one live).');
  return { mode, appIdKind, secretKind, problems };
}
