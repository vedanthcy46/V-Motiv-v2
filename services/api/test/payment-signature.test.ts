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
