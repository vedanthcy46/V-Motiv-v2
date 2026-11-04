import crypto from 'node:crypto';
import { HttpError } from './errors.js';

export interface GatewayPaymentProof {
  paymentGateway?: string | null;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  gatewaySignature?: string | null;
}

const DEMO_GATEWAYS = ['DEMO', 'TEST'];

/** True when a payment proof is shaped like the in-app sandbox gateway (never a real Razorpay proof). */
export function isDemoProof(proof: GatewayPaymentProof): boolean {
  const gateway = (proof.paymentGateway || '').toUpperCase();
  return (
    DEMO_GATEWAYS.includes(gateway) ||
    Boolean(proof.gatewayPaymentId && /^pay_(demo_|srv_|bal_)/.test(proof.gatewayPaymentId)) ||
    Boolean(proof.gatewayOrderId?.startsWith('order_srv_')) ||
    Boolean(proof.gatewaySignature?.startsWith('demo_'))
  );
}

/**
 * Whether the sandbox/demo payment gateway is enabled.
 *  - Local development and tests (NODE_ENV !== 'production'): always on.
 *  - A deployed worker: only when PAYMENT_SANDBOX_MODE=true is set explicitly AND no live Razorpay
 *    key (rzp_live_...) is configured. Never enable this on a deployment that uses the real database.
 */
export function isSandboxPaymentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== 'production') return true;
  if (env.PAYMENT_SANDBOX_MODE !== 'true') return false;
  return !env.RAZORPAY_KEY_ID?.startsWith('rzp_live_');
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Verifies a Razorpay checkout proof (HMAC-SHA256 of "orderId|paymentId").
 *
 * Production: always enforced. Demo proofs are accepted only in an explicit sandbox deployment
 * (PAYMENT_SANDBOX_MODE=true with no live key); otherwise there are no shortcuts and no default secret.
 * Non-production (local dev and automated tests): the legacy demo shortcuts remain so
 * existing fixtures keep working. They can never be reached when NODE_ENV === 'production'.
 */
export function assertGatewayPaymentSignature(
  proof: GatewayPaymentProof,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== 'production') return;
  // Sandbox deployment: demo-shaped proofs are accepted; real-shaped proofs are still verified below.
  if (isSandboxPaymentsEnabled(env) && isDemoProof(proof)) return;

  const secret = env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new HttpError(503, 'PAYMENT_GATEWAY_NOT_CONFIGURED');
  if (!proof.gatewayOrderId || !proof.gatewayPaymentId || !proof.gatewaySignature) {
    throw new HttpError(400, 'INVALID_PAYMENT_SIGNATURE');
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${proof.gatewayOrderId}|${proof.gatewayPaymentId}`)
    .digest('hex');
  if (!safeEqualHex(proof.gatewaySignature, expected)) {
    throw new HttpError(400, 'INVALID_PAYMENT_SIGNATURE');
  }
}

/**
 * Verifies a webhook body signature against the RAW request bytes.
 * Production: secret mandatory, signature mandatory. Non-production: signature checked
 * only when both secret and signature are present.
 */
export function assertWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string | undefined,
  encoding: 'hex' | 'base64url' = 'hex',
  env: NodeJS.ProcessEnv = process.env,
): void {
  const production = env.NODE_ENV === 'production';
  if (!secret) {
    if (production) throw new HttpError(503, 'WEBHOOK_SECRET_NOT_CONFIGURED');
    return;
  }
  if (!signature) {
    if (production) throw new HttpError(400, 'MISSING_WEBHOOK_SIGNATURE');
    return;
  }
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest(encoding);
  if (!safeEqualHex(signature, expected)) throw new HttpError(400, 'INVALID_WEBHOOK_SIGNATURE');
}
