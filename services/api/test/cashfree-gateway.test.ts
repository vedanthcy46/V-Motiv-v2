import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assertCashfreePaid, assertCashfreeWebhookSignature, cashfreeConfig, createCashfreeOrder } from '../src/cashfree-gateway.js';
import { assertCapturedAmount } from '../src/razorpay-gateway.js';

const env = { CASHFREE_APP_ID: 'TEST_APP', CASHFREE_SECRET_KEY: 'cfsk_test_secret', NODE_ENV: 'test' } as unknown as NodeJS.ProcessEnv;

function fakeFetch(routes: Record<string, { status?: number; body: unknown }>, calls: Array<{ url: string; init: any }> = []) {
  return async (url: string, init: any) => {
    calls.push({ url, init });
    const hit = Object.entries(routes).find(([suffix]) => url.endsWith(suffix));
    const route = hit?.[1] ?? { status: 404, body: {} };
    const status = route.status ?? 200;
    return { ok: status < 400, status, json: async () => route.body };
  };
}

describe('Cashfree gateway', () => {
  it('is off without credentials, in test mode by default, and live only when asked', () => {
    expect(cashfreeConfig({} as any)).toBeNull();
    expect(cashfreeConfig(env)?.baseUrl).toBe('https://sandbox.cashfree.com/pg');
    expect(cashfreeConfig({ ...env, CASHFREE_ENV: 'production' } as any)?.baseUrl).toBe('https://api.cashfree.com/pg');
  });

  it('creates an order with the server-side amount and keys in headers only', async () => {
    const calls: any[] = [];
    const order = await createCashfreeOrder(
      { orderId: 'rent_BK1_abc', amountPaise: 125_050n, customerId: 'user-1', customerPhone: '+91 98765 43210', returnUrl: 'https://api.test/return' },
      { env, fetchImpl: fakeFetch({ '/orders': { body: { order_id: 'rent_BK1_abc', payment_session_id: 'session_abc', order_status: 'ACTIVE' } } }, calls) },
    );
    expect(order.paymentSessionId).toBe('session_abc');
    const sent = JSON.parse(calls[0].init.body);
    expect(sent.order_amount).toBe(1250.5);
    expect(sent.customer_details.customer_phone).toBe('9876543210');
    expect(calls[0].init.headers['x-client-secret']).toBe('cfsk_test_secret');
    expect(calls[0].init.body).not.toContain('cfsk_test_secret');
  });

  const paidRoutes = (amount: number, status = 'PAID') => ({
    '/orders/ord_1': { body: { order_id: 'ord_1', order_status: status, order_amount: amount, order_currency: 'INR' } },
    '/orders/ord_1/payments': { body: [{ cf_payment_id: 555, payment_status: 'SUCCESS', payment_amount: amount }] },
  });

  it('accepts a paid order whose payment id and amount match', async () => {
    const paid = await assertCashfreePaid({ gatewayOrderId: 'ord_1', gatewayPaymentId: '555' }, 50_000n, { env, fetchImpl: fakeFetch(paidRoutes(500)) });
    expect(paid).toBe(50_000n);
  });

  it('refuses unpaid orders, another payment id, and a short payment', async () => {
    const opts = (routes: any) => ({ env, fetchImpl: fakeFetch(routes) });
    await expect(assertCashfreePaid({ gatewayOrderId: 'ord_1', gatewayPaymentId: '555' }, 50_000n, opts(paidRoutes(500, 'ACTIVE')))).rejects.toMatchObject({ code: 'PAYMENT_NOT_CAPTURED' });
    await expect(assertCashfreePaid({ gatewayOrderId: 'ord_1', gatewayPaymentId: '999' }, 50_000n, opts(paidRoutes(500)))).rejects.toMatchObject({ code: 'PAYMENT_ORDER_MISMATCH' });
    await expect(assertCashfreePaid({ gatewayOrderId: 'ord_1', gatewayPaymentId: '555' }, 60_000n, opts(paidRoutes(500)))).rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_MISMATCH' });
  });

  it('is used by the shared payment check for CASHFREE proofs, in every environment', async () => {
    const paid = await assertCapturedAmount({ paymentGateway: 'CASHFREE', gatewayOrderId: 'ord_1', gatewayPaymentId: '555' }, 50_000n, { env, fetchImpl: fakeFetch(paidRoutes(500)) as any });
    expect(paid).toBe(50_000n);
  });

  it('refuses CASHFREE proofs in production when Cashfree is not configured', async () => {
    await expect(assertCapturedAmount({ paymentGateway: 'CASHFREE', gatewayOrderId: 'ord_1', gatewayPaymentId: '555' }, 1n, { env: { NODE_ENV: 'production' } as any })).rejects.toMatchObject({ code: 'PAYMENT_GATEWAY_NOT_CONFIGURED' });
  });

  it('verifies webhook signatures over timestamp + raw body', () => {
    const raw = '{"type":"PAYMENT_SUCCESS_WEBHOOK"}';
    const ts = '1730000000000';
    const good = crypto.createHmac('sha256', 'cfsk_test_secret').update(ts + raw).digest('base64');
    expect(() => assertCashfreeWebhookSignature(raw, ts, good, env)).not.toThrow();
    expect(() => assertCashfreeWebhookSignature(raw + ' ', ts, good, env)).toThrow();
    expect(() => assertCashfreeWebhookSignature(raw, undefined, good, env)).toThrow();
  });
});
