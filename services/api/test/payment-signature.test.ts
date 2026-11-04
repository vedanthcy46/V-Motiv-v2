import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assertGatewayPaymentSignature, assertWebhookSignature } from '../src/payment-signature.js';

const prod = (extra: Record<string, string> = {}) => ({ NODE_ENV: 'production', ...extra }) as NodeJS.ProcessEnv;
const sign = (secret: string, data: string) => crypto.createHmac('sha256', secret).update(data).digest('hex');

describe('assertGatewayPaymentSignature', () => {
  it('rejects demo gateway/signature shortcuts in production', () => {
    for (const proof of [
      { paymentGateway: 'DEMO', gatewayOrderId: 'o', gatewayPaymentId: 'pay_demo_1', gatewaySignature: 'demo_sig_verified_vmotiv' },
      { paymentGateway: 'CASH', gatewayOrderId: 'o', gatewayPaymentId: 'p', gatewaySignature: 'demo_x' },
      { paymentGateway: 'RAZORPAY', gatewayOrderId: 'order_srv_1', gatewayPaymentId: 'pay_srv_1', gatewaySignature: 'bad' },
    ]) {
      expect(() => assertGatewayPaymentSignature(proof, prod({ RAZORPAY_KEY_SECRET: 's3cret' }))).toThrow(/INVALID_PAYMENT_SIGNATURE/);
    }
  });

  it('fails closed when the key secret is not configured in production', () => {
    expect(() => assertGatewayPaymentSignature({ gatewayOrderId: 'o', gatewayPaymentId: 'p', gatewaySignature: 'x' }, prod())).toThrow(/PAYMENT_GATEWAY_NOT_CONFIGURED/);
  });

  it('accepts a correct HMAC and rejects missing fields', () => {
    const env = prod({ RAZORPAY_KEY_SECRET: 's3cret' });
    const good = { gatewayOrderId: 'order_1', gatewayPaymentId: 'pay_1', gatewaySignature: sign('s3cret', 'order_1|pay_1') };
    expect(() => assertGatewayPaymentSignature(good, env)).not.toThrow();
    expect(() => assertGatewayPaymentSignature({ ...good, gatewaySignature: undefined }, env)).toThrow(/INVALID_PAYMENT_SIGNATURE/);
  });

  it('keeps dev/test behaviour outside production', () => {
    expect(() => assertGatewayPaymentSignature({ paymentGateway: 'DEMO' }, { NODE_ENV: 'test' } as NodeJS.ProcessEnv)).not.toThrow();
  });
});

describe('assertWebhookSignature', () => {
  const body = '{"event":"payment.captured"}';
  it('requires secret and signature in production, and verifies raw bytes', () => {
    expect(() => assertWebhookSignature(body, 'x', undefined, 'hex', prod())).toThrow(/WEBHOOK_SECRET_NOT_CONFIGURED/);
    expect(() => assertWebhookSignature(body, undefined, 'k', 'hex', prod())).toThrow(/MISSING_WEBHOOK_SIGNATURE/);
    expect(() => assertWebhookSignature(body, 'bad', 'k', 'hex', prod())).toThrow(/INVALID_WEBHOOK_SIGNATURE/);
    expect(() => assertWebhookSignature(body, sign('k', body), 'k', 'hex', prod())).not.toThrow();
    // reformatted body must not verify
    expect(() => assertWebhookSignature('{"event": "payment.captured"}', sign('k', body), 'k', 'hex', prod())).toThrow(/INVALID_WEBHOOK_SIGNATURE/);
  });
});

import { isDemoProof, isSandboxPaymentsEnabled } from '../src/payment-signature.js';
import { assertCapturedAmount } from '../src/razorpay-gateway.js';

describe('sandbox gateway switch', () => {
  const demo = { paymentGateway: 'DEMO', gatewayOrderId: 'order_srv_1', gatewayPaymentId: 'pay_demo_1', gatewaySignature: 'demo_sig_verified_vmotiv' };

  it('is off in production unless explicitly enabled, and never with a live key', () => {
    expect(isSandboxPaymentsEnabled({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isSandboxPaymentsEnabled({ NODE_ENV: 'production', PAYMENT_SANDBOX_MODE: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isSandboxPaymentsEnabled({ NODE_ENV: 'production', PAYMENT_SANDBOX_MODE: 'true', RAZORPAY_KEY_ID: 'rzp_live_abc' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isSandboxPaymentsEnabled({ NODE_ENV: 'production', PAYMENT_SANDBOX_MODE: 'true', RAZORPAY_KEY_ID: 'rzp_test_abc' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isSandboxPaymentsEnabled({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('accepts demo proofs on a sandbox deployment but still verifies real-looking proofs', async () => {
    const env = prod({ PAYMENT_SANDBOX_MODE: 'true', RAZORPAY_KEY_SECRET: 's3cret' });
    expect(isDemoProof(demo)).toBe(true);
    expect(() => assertGatewayPaymentSignature(demo, env)).not.toThrow();
    expect(await assertCapturedAmount(demo, 50000n, { env })).toBeNull();
    const real = { paymentGateway: 'RAZORPAY', gatewayOrderId: 'order_1', gatewayPaymentId: 'pay_1', gatewaySignature: 'forged' };
    expect(isDemoProof(real)).toBe(false);
    expect(() => assertGatewayPaymentSignature(real, env)).toThrow(/INVALID_PAYMENT_SIGNATURE/);
  });

  it('keeps rejecting demo proofs when the sandbox is not enabled', () => {
    expect(() => assertGatewayPaymentSignature(demo, prod({ RAZORPAY_KEY_SECRET: 's3cret' }))).toThrow(/INVALID_PAYMENT_SIGNATURE/);
    expect(() => assertGatewayPaymentSignature(demo, prod({ PAYMENT_SANDBOX_MODE: 'true', RAZORPAY_KEY_ID: 'rzp_live_x', RAZORPAY_KEY_SECRET: 's' }))).toThrow(/INVALID_PAYMENT_SIGNATURE/);
  });
});
