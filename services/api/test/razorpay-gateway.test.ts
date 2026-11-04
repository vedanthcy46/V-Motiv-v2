import { describe, expect, it } from 'vitest';
import { assertCapturedAmount } from '../src/razorpay-gateway.js';

const env = { NODE_ENV: 'production', RAZORPAY_KEY_ID: 'rzp_live_x', RAZORPAY_KEY_SECRET: 'sec' } as NodeJS.ProcessEnv;
const gateway = (body: Record<string, unknown>, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });
const captured = { id: 'pay_1', order_id: 'order_1', amount: 50000, currency: 'INR', status: 'captured' };
const proof = { gatewayOrderId: 'order_1', gatewayPaymentId: 'pay_1' };

describe('assertCapturedAmount', () => {
  it('returns the real captured amount when it covers the expected amount', async () => {
    expect(await assertCapturedAmount(proof, 50000n, { env, fetchImpl: gateway(captured) })).toBe(50000n);
    expect(await assertCapturedAmount(proof, 20000n, { env, fetchImpl: gateway(captured) })).toBe(50000n);
  });

  it('rejects underpayment (customer paid less than the server-derived amount)', async () => {
    await expect(assertCapturedAmount(proof, 100000n, { env, fetchImpl: gateway(captured) })).rejects.toThrow(/PAYMENT_AMOUNT_MISMATCH/);
    await expect(assertCapturedAmount(proof, 40000n, { env, exact: true, fetchImpl: gateway(captured) })).rejects.toThrow(/PAYMENT_AMOUNT_MISMATCH/);
  });

  it('rejects uncaptured, wrong-currency and wrong-order payments', async () => {
    await expect(assertCapturedAmount(proof, 1n, { env, fetchImpl: gateway({ ...captured, status: 'authorized' }) })).rejects.toThrow(/PAYMENT_NOT_CAPTURED/);
    await expect(assertCapturedAmount(proof, 1n, { env, fetchImpl: gateway({ ...captured, currency: 'USD' }) })).rejects.toThrow(/PAYMENT_CURRENCY_MISMATCH/);
    await expect(assertCapturedAmount(proof, 1n, { env, fetchImpl: gateway({ ...captured, order_id: 'order_other' }) })).rejects.toThrow(/PAYMENT_ORDER_MISMATCH/);
  });

  it('fails closed on gateway errors, missing keys and malformed ids', async () => {
    await expect(assertCapturedAmount(proof, 1n, { env, fetchImpl: gateway({}, 500) })).rejects.toThrow(/PAYMENT_GATEWAY_UNAVAILABLE/);
    await expect(assertCapturedAmount(proof, 1n, { env, fetchImpl: gateway({}, 404) })).rejects.toThrow(/PAYMENT_NOT_FOUND_AT_GATEWAY/);
    await expect(assertCapturedAmount(proof, 1n, { env: { NODE_ENV: 'production' } as NodeJS.ProcessEnv })).rejects.toThrow(/PAYMENT_GATEWAY_NOT_CONFIGURED/);
    await expect(assertCapturedAmount({ ...proof, gatewayPaymentId: '../x' }, 1n, { env, fetchImpl: gateway(captured) })).rejects.toThrow(/INVALID_PAYMENT_ID/);
    const thrower = async () => { throw new Error('network'); };
    await expect(assertCapturedAmount(proof, 1n, { env, fetchImpl: thrower as any })).rejects.toThrow(/PAYMENT_GATEWAY_UNAVAILABLE/);
  });

  it('is skipped outside production', async () => {
    expect(await assertCapturedAmount(proof, 1n, { env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv })).toBeNull();
  });
});
