import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { PulseCache, computeToken, createPulseRouter, customerProbes, STAFF_DOMAINS } from '../src/pulse.js';

type Any = any;
const tokenFor = (uid: string) => ({ uid, email: `${uid}@x.in`, email_verified: true, firebase: { sign_in_provider: 'google.com' } }) as Any;

function makeDb(opts: { user?: Any; max?: Date | null; count?: number } = {}) {
  const aggregate = vi.fn().mockImplementation(async () => ({ _count: { _all: opts.count ?? 3 }, _max: { updatedAt: opts.max ?? new Date(1000), createdAt: opts.max ?? new Date(1000) } }));
  const delegates = new Proxy({} as Any, { get: (_t, prop) => (prop === 'user' ? { findUnique: vi.fn().mockResolvedValue(opts.user ?? null) } : { aggregate }) });
  return { db: delegates as Any, aggregate };
}

function appWith(db: Any) {
  const app = express();
  app.use('/pulse', createPulseRouter({ verify: async t => tokenFor(t), db, ttlMs: 60_000 }));
  app.use((err: Any, _req: Any, res: Any, _next: Any) => res.status(err.status ?? 500).json({ code: err.code ?? 'ERR' }));
  return app;
}
const staff = { id: 'u1', status: 'ACTIVE', employee: { active: true, status: 'ACTIVE' } };
const customer = { id: 'c1', status: 'ACTIVE', employee: null };

describe('STAFF_DOMAINS', () => {
  it('only watches models and fields that exist, so a typo cannot break every portal refresh', async () => {
    const { Prisma } = await import('@prisma/client');
    const models = new Map(Prisma.dmmf.datamodel.models.map(model => [model.name.charAt(0).toLowerCase() + model.name.slice(1), new Set(model.fields.map(field => field.name))]));
    const problems: string[] = [];
    for (const [domain, probes] of Object.entries(STAFF_DOMAINS)) {
      for (const probe of probes) {
        const fields = models.get(probe.model);
        if (!fields) problems.push(`${domain}: unknown model ${probe.model}`);
        else if (!fields.has(probe.field)) problems.push(`${domain}: ${probe.model} has no ${probe.field}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('lets each hand-off reach the next screen', () => {
    const watched = (domain: string) => STAFF_DOMAINS[domain]!.map(probe => probe.model);
    expect(watched('finance')).toEqual(expect.arrayContaining(['financePayoutInstruction', 'acquisitionCase', 'acquisitionDocumentReview']));
    expect(watched('dispatch')).toEqual(expect.arrayContaining(['refurbishmentCostApproval', 'qualityControlReport', 'vehicleListing', 'acquisitionSettlement']));
  });
});

describe('computeToken', () => {
  it('changes when a row is inserted, updated or removed, and stays stable otherwise', async () => {
    const probes = STAFF_DOMAINS.rentals!;
    const base = await computeToken(makeDb({ count: 3, max: new Date(1000) }).db, probes);
    expect(await computeToken(makeDb({ count: 3, max: new Date(1000) }).db, probes)).toBe(base);
    expect(await computeToken(makeDb({ count: 4, max: new Date(1000) }).db, probes)).not.toBe(base); // insert/delete
    expect(await computeToken(makeDb({ count: 3, max: new Date(2000) }).db, probes)).not.toBe(base); // update
  });

  it('scopes a customer token to their own rows', async () => {
    const { db, aggregate } = makeDb();
    await computeToken(db, customerProbes('c1'));
    expect(aggregate.mock.calls.every(([args]: Any) => JSON.stringify(args.where).includes('c1'))).toBe(true);
  });
});

describe('PulseCache', () => {
  it('shares one database round between concurrent polls and honours the TTL', async () => {
    let now = 0;
    const cache = new PulseCache(1000, () => now);
    const load = vi.fn().mockResolvedValue('tok');
    await Promise.all([cache.get('k', load), cache.get('k', load), cache.get('k', load)]);
    expect(load).toHaveBeenCalledTimes(1);
    await cache.get('k', load);
    expect(load).toHaveBeenCalledTimes(1);
    now = 1500;
    await cache.get('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('GET /pulse', () => {
  it('requires authentication and valid domains', async () => {
    const { db } = makeDb({ user: staff });
    const app = appWith(db);
    await request(app).get('/pulse?domains=rentals').expect(401);
    await request(app).get('/pulse?domains=nope').set('Authorization', 'Bearer s1').expect(400);
    await request(app).get('/pulse').set('Authorization', 'Bearer s1').expect(400);
  });

  it('gives staff the staff domains and customers only their own "me" token', async () => {
    const staffApp = appWith(makeDb({ user: staff }).db);
    const res = await request(staffApp).get('/pulse?domains=rentals,service,me').set('Authorization', 'Bearer s1').expect(200);
    expect(Object.keys(res.body.tokens).sort()).toEqual(['me', 'rentals', 'service']);
    const customerApp = appWith(makeDb({ user: customer }).db);
    await request(customerApp).get('/pulse?domains=me').set('Authorization', 'Bearer c1').expect(200);
    await request(customerApp).get('/pulse?domains=rentals').set('Authorization', 'Bearer c1').expect(403);
  });

  it('refuses suspended staff and inactive accounts straight away (authorization is never cached)', async () => {
    await request(appWith(makeDb({ user: { ...staff, employee: { active: true, status: 'SUSPENDED' } } }).db)).get('/pulse?domains=finance').set('Authorization', 'Bearer s1').expect(403);
    await request(appWith(makeDb({ user: { ...staff, status: 'SUSPENDED' } }).db)).get('/pulse?domains=me').set('Authorization', 'Bearer s1').expect(403);
  });
});

describe('PulseCache fresh reads', () => {
  it('serves a tight max-age right after a realtime signal while still sharing one load between simultaneous clients', async () => {
    let now = 0;
    const cache = new PulseCache(8000, () => now);
    const load = vi.fn(async () => `v${now}`);
    expect(await cache.get('k', load)).toBe('v0');
    now = 3000;
    expect(await cache.get('k', load)).toBe('v0'); // normal read: still inside the 8 s window
    const [a, b] = await Promise.all([cache.get('k', load, 1500), cache.get('k', load, 1500)]);
    expect([a, b]).toEqual(['v3000', 'v3000']); // fresh read reloads once, shared
    expect(load).toHaveBeenCalledTimes(2);
  });
});
