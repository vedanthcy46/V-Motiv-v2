import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { roleCatalog } from '../src/admin-catalog.js';
import { HttpError } from '../src/errors.js';
import { createScrapRouter } from '../src/scrap/scrap-router.js';
import { PrismaScrapStore } from '../src/scrap/scrap-store.js';
import { makeFakeScrapDb } from './helpers/fake-scrap-db.js';

type Any = any;

const verify = vi.fn(async (token: string) => ({ uid: token, email: `${token}@example.test`, email_verified: true, firebase: { sign_in_provider: 'google.com' } }) as Any);

const customers = [
  { id: '11111111-1111-4111-8111-111111111111', firebaseUid: 'cust-1', status: 'ACTIVE', displayName: 'Asha', email: 'a@x.test', phone: '1' },
  { id: '22222222-2222-4222-8222-222222222222', firebaseUid: 'cust-2', status: 'ACTIVE', displayName: 'Ravi', email: 'r@x.test', phone: '2' },
];
const salesEmployee = { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', role: 'SALES_EXECUTIVE', active: true, status: 'ACTIVE', permissions: [], user: { email: 's@x.test', firebaseUid: 'sales-1', status: 'ACTIVE' }, roleAssignments: [] };
const salesRole = { key: 'SALES_EXECUTIVE', permissions: roleCatalog.SALES_EXECUTIVE.permissions.map(key => ({ permission: { key } })) };

const draft = {
  vehicle: { registrationNumber: 'KA01AB1234', make: 'Hyundai', model: 'i10', manufacturingYear: 2010, fuelType: 'PETROL', vehicleCategory: 'PASSENGER_CAR', odometerKm: 180000 },
  answers: {
    overall_condition: 'POOR', running_condition: 'DRIVABLE', access_restricted: false, accident_history: false, flood_fire_damage: 'NONE', major_body_damage: false,
    engine_present: true, gearbox_present: true, battery_present: true, wheels_tyres_present: true, completeness: 'COMPLETE',
  },
  ownership: { isRegisteredOwner: true, hasLoan: false, hasPendingDues: false, hasLegalDispute: false, declarationAccepted: true },
  pickupAddress: { line1: '12 MG Road', city: 'Bengaluru', pincode: '560001' },
};

function build(limiter?: express.RequestHandler) {
  const db = makeFakeScrapDb({ user: customers, employee: [salesEmployee], role: [salesRole] });
  const store = new PrismaScrapStore(db);
  const app = express();
  app.use(express.json());
  app.use('/api/v2', createScrapRouter({ verify: verify as Any, store, limiter }));
  app.get('/api/v2/unrelated', (_req, res) => res.json({ ok: true }));
  app.use((error: Any, _req: Any, res: Any, _next: Any) => {
    res.status(error instanceof HttpError ? error.status : 500).json({ code: error.code ?? 'INTERNAL_ERROR', message: error.message });
  });
  const as = (token: string) => ({
    get: (path: string) => request(app).get(`/api/v2${path}`).set('Authorization', `Bearer ${token}`),
    post: (path: string, body: unknown = {}) => request(app).post(`/api/v2${path}`).set('Authorization', `Bearer ${token}`).send(body as Any),
    patch: (path: string, body: unknown = {}) => request(app).patch(`/api/v2${path}`).set('Authorization', `Bearer ${token}`).send(body as Any),
    delete: (path: string) => request(app).delete(`/api/v2${path}`).set('Authorization', `Bearer ${token}`),
  });
  return { app, db, store, as };
}

describe('scrapping API: access', () => {
  it('requires a signed-in user on every route', async () => {
    const { app } = build();
    for (const [method, path] of [['get', '/customer/scrap/requests'], ['post', '/customer/scrap/requests'], ['get', '/customer/scrap/questionnaire'], ['get', '/scrap/requests'], ['post', '/scrap/requests/x/transition']] as const) {
      const res = await (request(app) as Any)[method](`/api/v2${path}`);
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it('a customer cannot use the staff routes, and staff without scrapping permissions are refused too', async () => {
    const { as } = build();
    const res = await as('cust-1').get('/scrap/requests');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SCRAP_ACCESS_DENIED');
    expect((await as('someone-else').get('/scrap/requests')).status).toBe(403);
  });

  it('serves the questionnaire without touching the scrapping tables, so the app can draw the form even before the update is applied', async () => {
    const { as, db } = build();
    db.$queryRaw = vi.fn().mockResolvedValue([{ ready: false }]);
    const res = await as('cust-1').get('/customer/scrap/questionnaire');
    expect(res.status).toBe(200);
    expect(res.body.questions.length).toBeGreaterThan(10);
    expect(res.body.version).toBe(1);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('answers 503 with a plain explanation until the database update is applied', async () => {
    const { as, db } = build();
    db.$queryRaw = vi.fn().mockResolvedValue([{ ready: false }]);
    const res = await as('cust-1').get('/customer/scrap/requests');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'SCRAP_SCHEMA_NOT_READY', message: expect.stringMatching(/not available yet/i) });
    expect((await as('sales-1').get('/scrap/requests')).status).toBe(503);
  });

  it('an unknown path under the scrapping prefixes is "not found"', async () => {
    const { as } = build();
    expect((await as('cust-1').get('/customer/scrap/nothing-here')).status).toBe(404);
    expect((await as('sales-1').get('/scrap/nothing-here')).status).toBe(404);
  });

  it('applies the rate limiter to scrapping routes only, never to other traffic through the same router', async () => {
    const limiter = vi.fn((_req: Any, _res: Any, next: () => void) => next());
    const { as, app } = build(limiter as Any);
    await as('cust-1').get('/customer/scrap/requests');
    await as('sales-1').get('/scrap/requests');
    expect(limiter).toHaveBeenCalledTimes(2);
    limiter.mockClear();
    expect((await request(app).get('/api/v2/unrelated')).body).toEqual({ ok: true });
    expect(limiter).not.toHaveBeenCalled();
  });
});

describe('scrapping API: the customer journey over HTTP', () => {
  it('creates, edits, submits, lists and shows a request', async () => {
    const { as } = build();
    const customer = as('cust-1');
    const created = await customer.post('/customer/scrap/requests', { submissionKey: 'device-a-12345', draft: { vehicle: draft.vehicle } });
    expect(created.status).toBe(201);
    const id = created.body.request.id as string;
    expect(created.body.request).toMatchObject({ status: 'DRAFT', version: 1 });

    const edited = await customer.patch(`/customer/scrap/requests/${id}`, { expectedVersion: 1, answers: draft.answers, ownership: draft.ownership, pickupAddress: draft.pickupAddress });
    expect(edited.status).toBe(200);
    expect(edited.body.version).toBe(2);
    expect(edited.body.missing).toEqual([]);

    const submitted = await customer.post(`/customer/scrap/requests/${id}/submit`);
    expect(submitted.status).toBe(200);
    expect(submitted.body).toMatchObject({ alreadySubmitted: false, request: { status: 'SALES_REVIEW', statusLabel: 'Being reviewed' } });
    expect(submitted.body.request.estimate).toMatchObject({ status: 'QUOTATION_REQUIRED', minPaise: null, maxPaise: null });
    expect((await customer.post(`/customer/scrap/requests/${id}/submit`)).body.alreadySubmitted).toBe(true);

    const list = await customer.get('/customer/scrap/requests');
    expect(list.body.items).toHaveLength(1);
    const detail = await customer.get(`/customer/scrap/requests/${id}`);
    expect(detail.body).toMatchObject({ status: 'SALES_REVIEW', vehicle: { registrationNumber: 'KA01AB1234' } });
  });

  it('answers a validation problem with the fields to mark, and refuses fields it does not know', async () => {
    const { as } = build();
    const bad = await as('cust-1').post('/customer/scrap/requests', { draft: { vehicle: { odometerKm: -1, make: 'x'.repeat(200) } } });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_INPUT');
    expect(bad.body.fields.length).toBeGreaterThan(0);
    const unknown = await as('cust-1').post('/customer/scrap/requests', { somethingElse: true });
    expect(unknown.status).toBe(400);
    expect(unknown.body.fields[0]).toHaveProperty('field');
    const noVersion = await as('cust-1').patch('/customer/scrap/requests/11111111-1111-4111-8111-111111111111', { answers: {} });
    expect(noVersion.status).toBe(400);
  });

  it('keeps customers apart: another customer gets "not found" for everything', async () => {
    const { as } = build();
    const created = await as('cust-1').post('/customer/scrap/requests', { draft: draft });
    const id = created.body.request.id as string;
    for (const response of [
      await as('cust-2').get(`/customer/scrap/requests/${id}`),
      await as('cust-2').patch(`/customer/scrap/requests/${id}`, { expectedVersion: 1 }),
      await as('cust-2').post(`/customer/scrap/requests/${id}/submit`),
      await as('cust-2').post(`/customer/scrap/requests/${id}/cancel`, { reason: 'not mine' }),
      await as('cust-2').delete(`/customer/scrap/requests/${id}`),
    ]) {
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('SCRAP_REQUEST_NOT_FOUND');
    }
    expect((await as('cust-2').get('/customer/scrap/requests')).body.items).toEqual([]);
  });

  it('cancels with a reason, and raises a concern', async () => {
    const { as } = build();
    const customer = as('cust-1');
    const id = (await customer.post('/customer/scrap/requests', { draft })).body.request.id as string;
    await customer.post(`/customer/scrap/requests/${id}/submit`);
    expect((await customer.post(`/customer/scrap/requests/${id}/cancel`, {})).status).toBe(400); // reason is required
    const dispute = await customer.post(`/customer/scrap/requests/${id}/disputes`, { category: 'OTHER', description: 'I was told something different on the phone.' });
    expect(dispute.status).toBe(201);
    expect((await customer.get(`/customer/scrap/requests/${id}`)).body.status).toBe('ON_HOLD');
  });
});

describe('scrapping API: staff over HTTP', () => {
  it('lets sales work a lead and refuses what is not theirs to do', async () => {
    const { as } = build();
    const id = (await (async () => {
      const created = await as('cust-1').post('/customer/scrap/requests', { draft });
      await as('cust-1').post(`/customer/scrap/requests/${created.body.request.id}/submit`);
      return created.body.request;
    })()).id as string;

    const sales = as('sales-1');
    const queue = await sales.get('/scrap/requests?status=SALES_REVIEW');
    expect(queue.status).toBe(200);
    expect(queue.body.items[0]).toMatchObject({ id, status: 'SALES_REVIEW', customer: { name: 'Asha' } });

    const detail = await sales.get(`/scrap/requests/${id}`);
    expect(detail.body.nextSteps.find((step: Any) => step.to === 'ASSESSMENT_PENDING')).toMatchObject({ allowed: false, blockedBy: { code: 'LEAD_NOT_QUALIFIED' } });

    expect((await sales.post(`/scrap/requests/${id}/qualify`, { qualified: true })).status).toBe(400); // a note is required
    const qualified = await sales.post(`/scrap/requests/${id}/qualify`, { qualified: true, note: 'Spoke with the owner; details match.' });
    expect(qualified.status).toBe(200);
    const moved = await sales.post(`/scrap/requests/${id}/transition`, { to: 'ASSESSMENT_PENDING', expectedVersion: qualified.body.version });
    expect(moved.body.status).toBe('ASSESSMENT_PENDING');

    // sales cannot take a case to the stages that belong to others, and the reason is explained
    const wrong = await sales.post(`/scrap/requests/${id}/transition`, { to: 'COMPLETED', expectedVersion: moved.body.version });
    expect(wrong.status).toBe(409);
    expect(wrong.body.code).toBe('TRANSITION_NOT_ALLOWED');
    expect((await sales.post(`/scrap/requests/${id}/transition`, { to: 'NOT_A_STATUS', expectedVersion: 1 })).status).toBe(400);
    expect((await sales.post(`/scrap/requests/${id}/transition`, { to: 'ON_HOLD' })).status).toBe(400); // version is required
  });

  it('rejects a stale version with a clear conflict', async () => {
    const { as } = build();
    const created = await as('cust-1').post('/customer/scrap/requests', { draft });
    const id = created.body.request.id as string;
    await as('cust-1').post(`/customer/scrap/requests/${id}/submit`);
    const stale = await as('sales-1').post(`/scrap/requests/${id}/transition`, { to: 'CANCELLED', expectedVersion: 1, reason: 'stale' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('SCRAP_VERSION_CONFLICT');
  });
});
