import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { HttpError } from '../src/errors.js';
import { createScrapRequestRouter, normalizeRegistration, ScrapRequestStore } from '../src/scrap-requests.js';

type Any = any;

const USER = { id: '11111111-1111-4111-8111-111111111111', firebaseUid: 'cust-1', status: 'ACTIVE', displayName: 'Asha Rao', email: 'asha@example.test', phone: '+919999900001' };
const OTHER = { id: '22222222-2222-4222-8222-222222222222', firebaseUid: 'cust-2', status: 'ACTIVE', displayName: 'Ravi', email: 'ravi@example.test', phone: null };

const good = { registrationNumber: 'ka 01 ab 1234', make: 'Hyundai', model: 'i10', manufacturingYear: 2008, city: 'Bengaluru' };

/** A tiny in-memory stand-in for the three database calls the store makes. */
function fakeDb(users = [USER, OTHER]) {
  const rows: Any[] = [];
  const matches = (row: Any, where: Any = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'in' in (value as Any)) return (value as Any).in.includes(row[key]);
    return row[key] === value;
  });
  const db: Any = {
    user: { findFirst: async ({ where }: Any) => users.find(user => user.firebaseUid === where.firebaseUid && user.status === where.status) ?? null },
    scrapRequest: {
      findFirst: async ({ where }: Any) => rows.find(row => matches(row, where)) ?? null,
      findMany: async ({ where, take }: Any) => rows.filter(row => matches(row, where)).sort((a, b) => b.createdAt - a.createdAt).slice(0, take),
      create: async ({ data }: Any) => {
        if (rows.some(row => row.requestNumber === data.requestNumber)) throw Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['requestNumber'] } });
        if (data.submissionKey && rows.some(row => row.submissionKey === data.submissionKey)) throw Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['submissionKey'] } });
        const row = { id: crypto.randomUUID(), status: 'NEW', createdAt: new Date(), ...data };
        rows.push(row);
        return row;
      },
    },
  };
  return { db, rows };
}

function build(options: { notify?: Any } = {}) {
  const { db, rows } = fakeDb();
  const notifications = { dispatchDomainEvent: options.notify ?? vi.fn(async () => ({})) };
  const store = new ScrapRequestStore(db, notifications as Any);
  const app = express();
  app.use(express.json());
  app.use('/api/v2', createScrapRequestRouter({ verify: (async (token: string) => ({ uid: token, email: 'x@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } })) as Any, store }));
  app.use((error: Any, _req: Any, res: Any, _next: Any) => {
    if (error instanceof ZodError) return res.status(400).json({ code: 'INVALID_INPUT' });
    res.status(error instanceof HttpError ? error.status : 500).json({ code: error.code ?? 'INTERNAL_ERROR', message: error.message });
  });
  const as = (token: string) => ({
    post: (body: unknown) => request(app).post('/api/v2/customer/scrap/requests').set('Authorization', `Bearer ${token}`).send(body as Any),
    get: () => request(app).get('/api/v2/customer/scrap/requests').set('Authorization', `Bearer ${token}`),
  });
  return { rows, notifications, as, store };
}

describe('normalising a registration number', () => {
  it('ignores case, spaces and dashes', () => {
    expect(normalizeRegistration('ka 01-ab 1234')).toBe('KA01AB1234');
  });
});

describe('asking us to scrap a vehicle', () => {
  it('saves the request, tells the customer plainly what happens next, and notifies sales by role', async () => {
    const { as, rows, notifications } = build();
    const res = await as('cust-1').post(good);
    expect(res.status).toBe(201);
    expect(res.body.request.requestNumber).toMatch(/^SCR-\d{4}-\d{6}$/);
    expect(res.body.request.status).toBe('NEW');
    expect(res.body.request.statusText).toMatch(/call you/i);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ registrationNumber: 'KA01AB1234', contactPhone: '+919999900001', customerId: USER.id });
    expect(notifications.dispatchDomainEvent).toHaveBeenCalledTimes(1);
    const event = (notifications.dispatchDomainEvent as Any).mock.calls[0][0];
    expect(event).toMatchObject({ type: 'SCRAP_REQUEST_SUBMITTED', priority: 'HIGH', recipientRoles: ['SALES_EXECUTIVE', 'SALES_MANAGER'], entityType: 'ScrapRequest' });
    expect(event.body).toContain('+919999900001'); // the person phoning needs the number in the alert itself
    expect(event.body).toContain('KA01AB1234');
  });

  it('uses the phone number given on the form instead of the account number', async () => {
    const { as, rows } = build();
    await as('cust-1').post({ ...good, contactPhone: '+919888800002' });
    expect(rows[0].contactPhone).toBe('+919888800002');
  });

  it('refuses when there is no number to call, rather than saving a request nobody can act on', async () => {
    const { as, rows, notifications } = build();
    const res = await as('cust-2').post(good); // this account has no phone
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PHONE_REQUIRED');
    expect(rows).toHaveLength(0);
    expect(notifications.dispatchDomainEvent).not.toHaveBeenCalled();
  });

  it('a retried submission returns the same request and notifies only once', async () => {
    const { as, rows, notifications } = build();
    const first = await as('cust-1').post({ ...good, submissionKey: 'key-12345678' });
    const again = await as('cust-1').post({ ...good, submissionKey: 'key-12345678' });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.created).toBe(false);
    expect(again.body.request.id).toBe(first.body.request.id);
    expect(rows).toHaveLength(1);
    expect(notifications.dispatchDomainEvent).toHaveBeenCalledTimes(1);
  });

  it('does not create a second open request for the same vehicle, but allows one once the first is closed', async () => {
    const { as, rows } = build();
    await as('cust-1').post(good);
    const second = await as('cust-1').post({ ...good, registrationNumber: 'KA01AB1234' });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('SCRAP_REQUEST_ALREADY_OPEN');
    expect(second.body.message).toMatch(/SCR-/);
    rows[0].status = 'CLOSED';
    expect((await as('cust-1').post(good)).status).toBe(201);
  });

  it('a failed notification never loses the request', async () => {
    const { as, rows } = build({ notify: vi.fn(async () => { throw new Error('push down'); }) });
    const res = await as('cust-1').post(good);
    expect(res.status).toBe(201);
    expect(rows).toHaveLength(1);
  });

  it('retries with a new number if the generated one is already taken', async () => {
    const { db, rows } = fakeDb();
    const numbers = ["SCR-2026-000001", "SCR-2026-000001", "SCR-2026-000002"];
    const store = new ScrapRequestStore(db, undefined, () => numbers.shift() ?? "SCR-2026-999999");
    await store.create("cust-1", { ...good, manufacturingYear: 2008 } as Any);
    const second = await store.create("cust-1", { ...good, registrationNumber: "MH12XY9999", manufacturingYear: 2008 } as Any);
    expect(second.created).toBe(true);
    expect(rows.map(row => row.requestNumber)).toEqual(["SCR-2026-000001", "SCR-2026-000002"]);
  });

  it('rejects bad input with a 400 and saves nothing', async () => {
    const { as, rows } = build();
    for (const bad of [{ ...good, registrationNumber: 'a' }, { ...good, manufacturingYear: 1900 }, { ...good, city: '' }, { ...good, contactPhone: '12345' }, { ...good, extra: 1 }, { make: 'Tata' }]) {
      expect((await as('cust-1').post(bad)).status).toBe(400);
    }
    expect(rows).toHaveLength(0);
  });

  it('requires sign-in, and shows each customer only their own requests', async () => {
    const { as } = build();
    expect((await request(express().use(express.json()).use('/api/v2', createScrapRequestRouter({ verify: (async () => { throw new Error('no'); }) as Any, store: build().store }))).post('/api/v2/customer/scrap/requests').send(good)).status).toBe(401);
    await as('cust-1').post(good);
    const mine = await as('cust-1').get();
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0].vehicle.registrationNumber).toBe('KA01AB1234');
    expect(JSON.stringify(mine.body)).not.toContain('contactPhone'); // internal fields are not sent back
    expect((await as('cust-2').get()).body.items).toHaveLength(0);
  });
});
