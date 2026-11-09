import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createCashfreeRouter, serviceAmountDue } from '../src/cashfree-router.js';
import { HttpError } from '../src/errors.js';
import { PrismaServiceStore } from '../src/service-store.js';

type Any = any;

const diagnosticPlan = (extra: Record<string, unknown> = {}) => JSON.stringify({ planId: 'DIAGNOSTIC_FEE', payNowPaise: '50000', balancePaise: '0', categoryTitle: 'General check', paidAt: null, ...extra });

describe('serviceAmountDue (what the customer can pay for a service request)', () => {
  it('a diagnostic-fee booking has no outstanding balance but still owes the unpaid fee', () => {
    expect(serviceAmountDue({ outstandingBalancePaise: 0n, verifiedPaidPaise: 0n, paymentPlanSnapshot: diagnosticPlan() })).toBe(50000n);
  });
  it('is zero once the plan has been paid', () => {
    expect(serviceAmountDue({ outstandingBalancePaise: 0n, verifiedPaidPaise: 50000n, paymentPlanSnapshot: diagnosticPlan() })).toBe(0n);
    expect(serviceAmountDue({ outstandingBalancePaise: 0n, verifiedPaidPaise: 0n, paymentPlanSnapshot: diagnosticPlan({ paidAt: '2026-11-09T00:00:00Z' }) })).toBe(0n);
  });
  it('uses the outstanding balance when that is larger, and copes with a missing or unreadable plan', () => {
    expect(serviceAmountDue({ outstandingBalancePaise: 120000n, verifiedPaidPaise: 0n, paymentPlanSnapshot: diagnosticPlan() })).toBe(120000n);
    expect(serviceAmountDue({ outstandingBalancePaise: 0n, paymentPlanSnapshot: 'not json' })).toBe(0n);
    expect(serviceAmountDue({ outstandingBalancePaise: 0n, paymentPlanSnapshot: null })).toBe(0n);
  });
});

describe('Cashfree order for a diagnostic-fee service request', () => {
  const verify = async () => ({ uid: 'firebase-1', email: 'buyer@example.com', email_verified: true, name: 'Buyer', firebase: { sign_in_provider: 'google.com' } }) as Any;
  function build(serviceRow: Any) {
    process.env.CASHFREE_APP_ID = 'TEST_APP';
    process.env.CASHFREE_SECRET_KEY = 'cfsk_test_secret';
    const orders = new Map<string, Any>();
    const db: Any = {
      user: { findFirst: vi.fn(async () => ({ id: '11111111-1111-4111-8111-111111111111', email: 'buyer@example.com', displayName: 'Buyer', phone: '9876543210' })) },
      serviceRequest: { findFirst: vi.fn(async () => serviceRow) },
      gatewayOrder: {
        create: vi.fn(async ({ data }: Any) => { orders.set(data.orderId, data); return data; }),
        findUnique: vi.fn(async ({ where }: Any) => orders.get(where.orderId) ?? null),
        update: vi.fn(),
      },
    };
    const fetchImpl = async (_url: string, init: Any) => ({ ok: true, status: 200, json: async () => ({ order_id: JSON.parse(init.body).order_id, payment_session_id: 'session_test_123456', order_status: 'ACTIVE' }) });
    const app = express();
    app.use(express.json());
    app.use('/api/v2', createCashfreeRouter({ verify: verify as Any, db, gateway: { fetchImpl: fetchImpl as Any } }));
    app.use((err: Any, _req: Any, res: Any, _next: Any) => { res.status(err instanceof HttpError ? err.status : 400).json({ code: err.code ?? 'BAD_REQUEST' }); });
    return { app, db };
  }
  const REQUEST_ID = '33333333-3333-4333-8333-333333333333';

  it('opens a ₹500 order instead of refusing with NOTHING_TO_PAY', async () => {
    const { app } = build({ id: REQUEST_ID, requestNumber: 'SRV-1', outstandingBalancePaise: 0n, verifiedPaidPaise: 0n, paymentPlanSnapshot: diagnosticPlan() });
    const res = await request(app).post('/api/v2/payments/cashfree/orders').set('Authorization', 'Bearer t').send({ kind: 'SERVICE', referenceId: REQUEST_ID, amountPaise: '50000' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ provider: 'CASHFREE', amountPaise: '50000' });
  });

  it('refuses an amount above what is owed, and refuses once the fee is already paid', async () => {
    const owed = build({ id: REQUEST_ID, requestNumber: 'SRV-1', outstandingBalancePaise: 0n, verifiedPaidPaise: 0n, paymentPlanSnapshot: diagnosticPlan() });
    const tooMuch = await request(owed.app).post('/api/v2/payments/cashfree/orders').set('Authorization', 'Bearer t').send({ kind: 'SERVICE', referenceId: REQUEST_ID, amountPaise: '99999' });
    expect(tooMuch.status).toBe(400);
    const paid = build({ id: REQUEST_ID, requestNumber: 'SRV-1', outstandingBalancePaise: 0n, verifiedPaidPaise: 50000n, paymentPlanSnapshot: diagnosticPlan({ paidAt: '2026-11-09T00:00:00Z' }) });
    const again = await request(paid.app).post('/api/v2/payments/cashfree/orders').set('Authorization', 'Bearer t').send({ kind: 'SERVICE', referenceId: REQUEST_ID });
    expect(again.status).toBe(409);
  });
});

describe('settling the diagnostic-fee payment', () => {
  const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
  function makeStore(sr: Record<string, unknown>) {
    const request = { id: REQUEST_ID, customerId: 'cust-1', status: 'APPOINTMENT_SCHEDULED', payments: [], invoices: [], estimates: [], outstandingBalancePaise: 0n, verifiedPaidPaise: 0n, ...sr };
    const created: Any[] = [];
    const tx: Any = {
      servicePaymentRecord: {
        create: vi.fn(async ({ data }: Any) => { const row = { id: 'pay-1', ...data }; created.push(row); return row; }),
        findMany: vi.fn(async () => created),
      },
      serviceRequest: { update: vi.fn() },
      serviceInvoice: { update: vi.fn() },
      serviceHistoryEvent: { create: vi.fn() },
    };
    const db: Any = {
      serviceRequest: { findFirst: vi.fn(async () => request) },
      servicePaymentRecord: { findFirst: vi.fn(async () => null) },
      $transaction: vi.fn(async (fn: Any) => fn(tx)),
    };
    return { store: new PrismaServiceStore(db), tx };
  }
  const proof = { paymentGateway: 'RAZORPAY', gatewayOrderId: 'order_1', gatewayPaymentId: 'pay_1', gatewaySignature: 'sig', amountPaise: 50000n };

  it('records a DIAGNOSTIC_FEE payment, marks the plan paid, and does NOT mark the job PAID', async () => {
    const { store, tx } = makeStore({ paymentPlanSnapshot: diagnosticPlan() });
    const result: Any = await store.verifyCustomerGatewayPayment('cust-1', REQUEST_ID, proof);
    expect(result.requestStatus).toBe('APPOINTMENT_SCHEDULED');
    expect(tx.servicePaymentRecord.create.mock.calls[0][0].data).toMatchObject({ type: 'DIAGNOSTIC_FEE', amountPaise: 50000n });
    const update = tx.serviceRequest.update.mock.calls[0][0].data;
    expect(update.status).toBe('APPOINTMENT_SCHEDULED');
    expect(update.verifiedPaidPaise).toBe(50000n);
    expect(update.outstandingBalancePaise).toBe(0n);
    expect(update.depositStatus).toBe('DIAGNOSTIC_PAID');
    expect(JSON.parse(update.paymentPlanSnapshot).paidAt).toBeTruthy();
  });

  it('still marks the job PAID once an invoice exists and is settled in full', async () => {
    const { store, tx } = makeStore({ status: 'INVOICED', outstandingBalancePaise: 50000n, invoices: [{ id: 'inv-1', totalAmountPaise: 50000n }], paymentPlanSnapshot: null });
    const result: Any = await store.verifyCustomerGatewayPayment('cust-1', REQUEST_ID, proof);
    expect(result.requestStatus).toBe('PAID');
    expect(tx.serviceRequest.update.mock.calls[0][0].data.status).toBe('PAID');
  });
});

describe('counter and finance payments before there is a bill', () => {
  const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
  function makeCounterStore(sr: Record<string, unknown>) {
    const request = { id: REQUEST_ID, customerId: 'cust-1', status: 'APPOINTMENT_SCHEDULED', invoices: [], estimates: [], outstandingBalancePaise: 399900n, verifiedPaidPaise: 0n, ...sr };
    const created: Any[] = [];
    const tx: Any = {
      servicePaymentRecord: {
        create: vi.fn(async ({ data }: Any) => { const row = { id: 'pay-1', ...data }; created.push(row); return row; }),
        findMany: vi.fn(async () => created.filter(p => p.status === 'PAID_VERIFIED')),
      },
      serviceCustodyRecord: { findFirst: vi.fn(async () => null) },
      serviceRequest: { update: vi.fn() },
      serviceInvoice: { update: vi.fn() },
      serviceHistoryEvent: { create: vi.fn() },
    };
    const db: Any = { serviceRequest: { findUnique: vi.fn(async () => request) }, $transaction: vi.fn(async (fn: Any) => fn(tx)) };
    return { store: new PrismaServiceStore(db), tx };
  }

  it('a counter payment for the whole package does not move the job to PAID, so extra labour can still be estimated', async () => {
    const { store, tx } = makeCounterStore({});
    await store.recordPayment('advisor-1', REQUEST_ID, { type: 'ADVANCE', amountPaise: 399900n });
    const data = tx.serviceRequest.update.mock.calls[0][0].data;
    expect(data.status).toBe('APPOINTMENT_SCHEDULED');
    expect(data.outstandingBalancePaise).toBe(0n);
    expect(data.servicePaymentStatus).toBe('PAID_IN_FULL');
  });

  it('a partial counter payment does not move the job to PAYMENT_PENDING either, and the balance reduces by what was paid', async () => {
    const { store, tx } = makeCounterStore({});
    await store.recordPayment('advisor-1', REQUEST_ID, { type: 'ADVANCE', amountPaise: 100000n });
    const data = tx.serviceRequest.update.mock.calls[0][0].data;
    expect(data.status).toBe('APPOINTMENT_SCHEDULED');
    expect(data.outstandingBalancePaise).toBe(299900n);
    expect(data.servicePaymentStatus).toBe('PARTIALLY_PAID');
  });

  it('once the job is invoiced, settling it still marks it PAID', async () => {
    const { store, tx } = makeCounterStore({ status: 'PAYMENT_PENDING', outstandingBalancePaise: 50000n, invoices: [{ id: 'inv-1', totalAmountPaise: 450000n }], verifiedPaidPaise: 399900n });
    // the earlier 399,900 is already a verified payment record
    tx.servicePaymentRecord.findMany.mockResolvedValueOnce([{ amountPaise: 399900n }, { amountPaise: 50100n }]);
    await store.recordPayment('advisor-1', REQUEST_ID, { type: 'FINAL_SETTLEMENT', amountPaise: 50100n });
    expect(tx.serviceRequest.update.mock.calls[0][0].data.status).toBe('PAID');
  });
});
