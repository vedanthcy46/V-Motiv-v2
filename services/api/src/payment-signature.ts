import crypto from 'node:crypto';
import { HttpError } from './errors.js';

export interface GatewayPaymentProof {
  paymentGateway?: string | null;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  gatewaySignature?: string | null;
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Verifies a Razorpay checkout proof (HMAC-SHA256 of "orderId|paymentId").
 *
 * Production: always enforced. No demo/test/cash/offline shortcuts, no default secret.
 * Non-production (local dev and automated tests): the legacy demo shortcuts remain so
 * existing fixtures keep working. They can never be reached when NODE_ENV === 'production'.
 */
export function assertGatewayPaymentSignature(
  proof: GatewayPaymentProof,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== 'production') return;

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
