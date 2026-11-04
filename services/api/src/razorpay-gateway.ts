import { HttpError } from './errors.js';
import { isDemoProof, isSandboxPaymentsEnabled } from './payment-signature.js';

export interface CapturedGatewayPayment {
  paymentId: string;
  orderId: string | null;
  amountPaise: bigint;
  currency: string;
  status: string;
}

type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<any>;
}>;

export interface GatewayAmountOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/** Ask Razorpay what was really charged for a payment id (server-to-server, never trusts the client). */
export async function fetchRazorpayPayment(
  paymentId: string,
  opts: GatewayAmountOptions = {},
): Promise<CapturedGatewayPayment> {
  const env = opts.env ?? process.env;
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new HttpError(503, 'PAYMENT_GATEWAY_NOT_CONFIGURED');
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new HttpError(400, 'INVALID_PAYMENT_ID');

  const fetchImpl: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init) as any);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    const res = await fetchImpl(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}` },
      signal: controller.signal,
    });
    if (res.status === 404 || res.status === 400) throw new HttpError(402, 'PAYMENT_NOT_FOUND_AT_GATEWAY');
    if (!res.ok) throw new HttpError(502, 'PAYMENT_GATEWAY_UNAVAILABLE');
    const body = await res.json();
    if (!Number.isInteger(body?.amount) || body.amount <= 0) throw new HttpError(502, 'PAYMENT_GATEWAY_BAD_RESPONSE');
    return {
      paymentId: String(body.id),
      orderId: body.order_id ? String(body.order_id) : null,
      amountPaise: BigInt(body.amount),
      currency: String(body.currency),
      status: String(body.status),
    };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, 'PAYMENT_GATEWAY_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Production-only: confirms with Razorpay that the payment is captured, in INR, belongs to the
 * claimed order, and covers `expectedPaise` (or exactly equals it when `exact`).
 * Returns the amount actually captured. Outside production returns null (dev/test fixtures).
 */
export async function assertCapturedAmount(
  proof: { paymentGateway?: string | null; gatewayOrderId?: string | null; gatewayPaymentId?: string | null; gatewaySignature?: string | null },
  expectedPaise: bigint | null,
  opts: GatewayAmountOptions & { exact?: boolean } = {},
): Promise<bigint | null> {
  const env = opts.env ?? process.env;
  if (env.NODE_ENV !== 'production') return null;
  // Sandbox deployment: demo payments have no real gateway record to look up.
  if (isSandboxPaymentsEnabled(env) && isDemoProof(proof)) return null;
  if (!proof.gatewayPaymentId) throw new HttpError(400, 'INVALID_PAYMENT_SIGNATURE');

  const payment = await fetchRazorpayPayment(proof.gatewayPaymentId, opts);
  if (payment.status !== 'captured') throw new HttpError(402, 'PAYMENT_NOT_CAPTURED');
  if (payment.currency !== 'INR') throw new HttpError(402, 'PAYMENT_CURRENCY_MISMATCH');
  if (!payment.orderId || payment.orderId !== proof.gatewayOrderId) throw new HttpError(402, 'PAYMENT_ORDER_MISMATCH');
  if (expectedPaise !== null) {
    const bad = opts.exact ? payment.amountPaise !== expectedPaise : payment.amountPaise < expectedPaise;
    if (bad) throw new HttpError(402, 'PAYMENT_AMOUNT_MISMATCH');
  }
  return payment.amountPaise;
}
