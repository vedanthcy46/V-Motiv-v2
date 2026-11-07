import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCashfreeRouter } from '../src/cashfree-router.js';
import { HttpError } from '../src/errors.js';

const verify = async () => ({ uid: 'firebase-1', email: 'buyer@example.com', email_verified: true, name: 'Buyer', firebase: { sign_in_provider: 'google.com' } }) as any;

function makeDb(overrides: Record<string, unknown> = {}) {
  const orders = new Map<string, any>();
  return {
    orders,
    user: { findFirst: vi.fn(async () => ({ id: '11111111-1111-4111-8111-111111111111', email: 'buyer@example.com', displayName: 'Buyer', phone: '9876543210' })) },
    rentalBooking: { findUnique: vi.fn(async () => ({ id: '22222222-2222-4222-8222-222222222222', customerId: '11111111-1111-4111-8111-111111111111', bookingNumber: 'RB-1001' })) },
    rentalPaymentRecord: { findFirst: vi.fn(async () => ({ amountPaise: 250_000n })) },
    serviceRequest: { findFirst: vi.fn(async () => null) },
    gatewayOrder: {
      create: vi.fn(async ({ data }: any) => { orders.set(data.orderId, { ...data, status: 'CREATED' }); return data; }),
      findUnique: vi.fn(async ({ where }: any) => orders.get(where.orderId) ?? null),
      update: vi.fn(async ({ where, data }: any) => { const next = { ...orders.get(where.orderId), ...data }; orders.set(where.orderId, next); return next; }),
    },
    ...overrides,
  } as any;
}

const gatewayFetch = (state: { paid: boolean }) => async (url: string, init: any) => {
  const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
  if (init.method === 'POST' && url.endsWith('/orders')) {
    const sent = JSON.parse(init.body);
    return json({ order_id: sent.order_id, payment_session_id: 'session_test_123456', order_status: 'ACTIVE' });
  }
  const orderId = url.split('/orders/')[1]!.split('/')[0]!;
  if (url.endsWith('/payments')) return json(state.paid ? [{ cf_payment_id: 777, payment_status: 'SUCCESS', payment_amount: 2500 }] : []);
  return json({ order_id: orderId, order_status: state.paid ? 'PAID' : 'ACTIVE', order_amount: 2500, order_currency: 'INR' });
};

describe('Cashfree router', () => {
  const saved = { id: process.env.CASHFREE_APP_ID, secret: process.env.CASHFREE_SECRET_KEY };
  beforeEach(() => { process.env.CASHFREE_APP_ID = 'TEST_APP'; process.env.CASHFREE_SECRET_KEY = 'cfsk_test_secret'; });
  afterEach(() => { process.env.CASHFREE_APP_ID = saved.id; process.env.CASHFREE_SECRET_KEY = saved.secret; if (!saved.id) delete process.env.CASHFREE_APP_ID; if (!saved.secret) delete process.env.CASHFREE_SECRET_KEY; });

  function build(db: any, state = { paid: false }, settle = vi.fn(async () => ({}))) {
    const app = express();
    app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf.toString('utf8'); } }));
    app.use('/api/v2', createCashfreeRouter({ verify: verify as any, db, settle: { rental: settle as any }, gateway: { fetchImpl: gatewayFetch(state) as any } }));
    app.use((err: any, _req: any, res: any, _next: any) => { res.status(err instanceof HttpError ? err.status : 400).json({ code: err.code ?? 'BAD_REQUEST' }); });
    return { app, settle, state };
  }

  it('looks the customer up by Firebase uid without comparing it to the UUID id column (that made Postgres reject the query)', async () => {
    const db = makeDb();
    const { app } = build(db);
    await request(app).post('/api/v2/payments/cashfree/orders').set('Authorization', 'Bearer t').send({ kind: 'RENTAL', referenceId: '22222222-2222-4222-8222-222222222222' });
    const where = (db.user.findFirst as any).mock.calls[0][0].where;
    expect(where.OR).toEqual([{ firebaseUid: 'firebase-1' }]); // 'firebase-1' is not a UUID, so no { id } clause
  });

  it('creates an order for the amount in our own records and returns a checkout link', async () => {
    const db = makeDb();
    const { app } = build(db);
    const res = await request(app).post('/api/v2/payments/cashfree/orders').set('Authorization', 'Bearer t').send({ kind: 'RENTAL', referenceId: '22222222-2222-4222-8222-222222222222', amountPaise: '1' });
    expect(res.status).toBe(400); // the app may not choose the amount for a rental
    const ok = await request(app).post('/api/v2/payments/cashfree/orders').set('Authorization', 'Bearer t').send({ kind: 'RENTAL', referenceId: '22222222-2222-4222-8222-222222222222' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ provider: 'CASHFREE', mode: 'sandbox', amountPaise: '250000', paymentSessionId: 'session_test_123456' });
    expect(ok.body.checkoutUrl).toContain('/api/v2/payments/cashfree/checkout?session=session_test_123456');
    expect(db.orders.size).toBe(1);
  });

  it("refuses someone else's booking", async () => {
    const db = makeDb({ rentalBooking: { findUnique: vi.fn(async () => ({ id: 'x', customerId: '99999999-9999-4999-8999-999999999999', bookingNumber: 'RB-1' })) } });
    const res = await request(build(db).app).post('/api/v2/payments/cashfree/orders').set('Authorization', 'Bearer t').send({ kind: 'RENTAL', referenceId: '22222222-2222-4222-8222-222222222222' });
    expect(res.status).toBe(403);
  });

  it('sends the customer back to the app, and records the payment only once Cashfree says it is paid', async () => {
    const db = makeDb();
    const { app, state, settle } = build(db);
    await request(app).post('/api/v2/payments/cashfree/orders').set('Authorization', 'Bearer t').send({ kind: 'RENTAL', referenceId: '22222222-2222-4222-8222-222222222222' });
    const orderId = [...db.orders.keys()][0]!;

    const pending = await request(app).get(`/api/v2/payments/cashfree/return?order_id=${orderId}`);
    expect(pending.text).toContain('vmotiv://payment-result?status=PENDING');
    expect(settle).not.toHaveBeenCalled();

    state.paid = true;
    const done = await request(app).get(`/api/v2/payments/cashfree/return?order_id=${orderId}`);
    expect(done.text).toContain('status=SUCCESS');
    expect(settle).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', expect.objectContaining({ paymentGateway: 'CASHFREE', gatewayPaymentId: '777' }));
    expect(db.orders.get(orderId).status).toBe('SETTLED');
  });

  it('rejects a webhook with a bad signature', async () => {
    const res = await request(build(makeDb()).app).post('/api/v2/payments/cashfree/webhook').set('x-webhook-timestamp', '1').set('x-webhook-signature', 'nope').send({ type: 'PAYMENT_SUCCESS_WEBHOOK' });
    expect(res.status).toBe(401);
  });

  it('serves a checkout page only for a plausible session id', async () => {
    const { app } = build(makeDb());
    expect((await request(app).get('/api/v2/payments/cashfree/checkout?session=<script>')).status).toBe(400);
    const page = await request(app).get('/api/v2/payments/cashfree/checkout?session=session_test_123456');
    expect(page.text).toContain('sdk.cashfree.com');
    expect(page.text).toContain('mode: "sandbox"');
  });
});
