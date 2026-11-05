import { beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { MAX_ATTEMPTS, challengeStatus, codeMatches, generateCode, hashCode, isWalkInSeller, maskPhone } from '../src/in-person-acceptance.js';
import { PrismaSalesStore, type SalesActor } from '../src/sales-store.js';
import { otpSecretFromEnv, smsSenderFromEnv } from '../src/sms.js';

type Any = any;
const LEAD = '22222222-2222-4222-8222-222222222222';
const OFFER = '33333333-3333-4333-8333-333333333333';
const staff = (id: string): SalesActor => ({ userId: id, email: `${id}@example.test`, displayName: id, employeeCode: id, roles: ['SALES_EXECUTIVE'], branches: [], globalScope: true });
const alice = staff('44444444-4444-4444-8444-444444444441');
const bob = staff('44444444-4444-4444-8444-444444444442');

describe('verification rules', () => {
  it('recognises walk-in placeholder users only', () => {
    expect(isWalkInSeller({ email: 'manual-ab12@vmotiv.internal', firebaseUid: 'manual-1' })).toBe(true);
    expect(isWalkInSeller({ email: 'seller@gmail.com', firebaseUid: 'abc' })).toBe(false);
  });
  it('generates 6 digit codes and verifies them by hash', () => {
    const code = generateCode();
    expect(code).toMatch(/^\d{6}$/);
    const hash = hashCode(code, 'id-1', 'secret-secret-secret');
    expect(codeMatches(code, 'id-1', 'secret-secret-secret', hash)).toBe(true);
    expect(codeMatches('000000' === code ? '000001' : '000000', 'id-1', 'secret-secret-secret', hash)).toBe(false);
    expect(codeMatches(code, 'id-2', 'secret-secret-secret', hash)).toBe(false); // bound to the challenge
  });
  it('masks the phone number', () => {
    expect(maskPhone('+919876543210')).toBe('+91••••••3210');
  });
  it('reports used, expired and locked challenges', () => {
    const now = new Date('2026-11-05T10:00:00Z');
    const base = { expiresAt: new Date('2026-11-05T10:05:00Z'), attempts: 0, consumedAt: null };
    expect(challengeStatus(base, now)).toBe('OK');
    expect(challengeStatus({ ...base, consumedAt: now }, now)).toBe('USED');
    expect(challengeStatus({ ...base, expiresAt: new Date('2026-11-05T09:59:00Z') }, now)).toBe('EXPIRED');
    expect(challengeStatus({ ...base, attempts: MAX_ATTEMPTS }, now)).toBe('LOCKED');
  });
  it('sms config fails closed and sandbox is explicit', () => {
    expect(smsSenderFromEnv({})).toBeNull();
    expect(smsSenderFromEnv({ SMS_SANDBOX_MODE: 'true' })).not.toBeNull();
    expect(smsSenderFromEnv({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM: '+1555' })).not.toBeNull();
    expect(otpSecretFromEnv({ NODE_ENV: 'production' })).toBeNull();
    expect(otpSecretFromEnv({ NODE_ENV: 'production', ACCEPTANCE_OTP_SECRET: 'x'.repeat(20) })).toBe('x'.repeat(20));
  });
});

function matches(row: Any, where: Any): boolean {
  return Object.entries(where ?? {}).every(([key, expected]) => {
    const actual = row[key];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if ('gt' in expected) return actual > (expected as Any).gt;
      if ('lt' in expected) return actual < (expected as Any).lt;
    }
    if (expected === null) return actual === null || actual === undefined;
    return actual === expected;
  });
}

function makeDb(options: { walkIn?: boolean } = {}) {
  const state = {
    lead: { id: LEAD, referenceCode: 'VM-1', userId: 'seller-user', status: 'OFFERED', sellerPhone: '+919876543210', make: 'Honda', model: 'City', user: options.walkIn === false ? { email: 'real@gmail.com', firebaseUid: 'fb-1' } : { email: 'manual-ab@vmotiv.internal', firebaseUid: 'manual-1' } } as Any,
    offer: { id: OFFER, leadId: LEAD, status: 'OFFERED', version: 3, offerAmountPaise: 45000000n, validUntil: new Date(Date.now() + 86_400_000) } as Any,
    challenges: [] as Any[],
    audits: [] as Any[],
    cases: [] as Any[],
  };
  const challenge = {
    findMany: async ({ where }: Any) => state.challenges.filter(row => matches(row, where)).sort((a, b) => b.createdAt - a.createdAt),
    findFirst: async ({ where }: Any) => state.challenges.find(row => matches(row, where)) ?? null,
    create: async ({ data }: Any) => { const row = { attempts: 0, consumedAt: null, createdAt: new Date(), ...data }; state.challenges.push(row); return row; },
    updateMany: async ({ where, data }: Any) => {
      const rows = state.challenges.filter(row => matches(row, where));
      for (const row of rows) {
        for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === 'object' && 'increment' in (value as Any) ? row[key] + (value as Any).increment : value;
      }
      return { count: rows.length };
    },
    deleteMany: async ({ where }: Any) => { const before = state.challenges.length; state.challenges = state.challenges.filter(row => !matches(row, where)); return { count: before - state.challenges.length }; },
  };
  const db: Any = {
    acquisitionLead: { findFirst: async () => state.lead, update: async ({ data }: Any) => Object.assign(state.lead, data) },
    acquisitionOffer: {
      findFirst: async () => state.offer,
      updateMany: async ({ where, data }: Any) => {
        if (!matches(state.offer, where)) return { count: 0 };
        state.offer = { ...state.offer, ...data, version: state.offer.version + (data.version?.increment ?? 0) };
        return { count: 1 };
      },
    },
    acquisitionCase: { create: async ({ data }: Any) => { const row = { id: 'case-1', ...data }; state.cases.push(row); return row; } },
    sellerOfferAcceptanceChallenge: challenge,
    auditEvent: { create: async ({ data }: Any) => { state.audits.push(data); return data; } },
    $transaction: async (fn: (tx: Any) => Promise<unknown>) => fn(db),
  };
  return { db: db as PrismaClient, state };
}

describe('in-person acceptance for walk-in sellers', () => {
  let sent: Array<{ to: string; text: string }>;
  const sender = async (to: string, text: string) => { sent.push({ to, text }); };
  const lastCode = () => /(\d{6}) is your code/.exec(sent[sent.length - 1]!.text)![1]!;

  beforeEach(() => {
    sent = [];
    process.env.ACCEPTANCE_OTP_SECRET = 'a-long-enough-test-secret';
  });

  it('refuses sellers who have an app account (they must accept in the app)', async () => {
    const { db } = makeDb({ walkIn: false });
    await expect(new PrismaSalesStore(db, sender).startInPersonAcceptance(alice, LEAD, OFFER)).rejects.toMatchObject({ status: 409, code: 'SELLER_MUST_ACCEPT_IN_APP' });
    expect(sent).toHaveLength(0);
  });

  it('fails closed when no SMS provider is configured', async () => {
    const { db } = makeDb();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.SMS_SANDBOX_MODE;
    await expect(new PrismaSalesStore(db).startInPersonAcceptance(alice, LEAD, OFFER)).rejects.toMatchObject({ status: 503, code: 'SMS_NOT_CONFIGURED' });
  });

  it('texts the code to the seller, never returns it to staff, and enforces a resend cooldown', async () => {
    const { db } = makeDb();
    const store = new PrismaSalesStore(db, sender);
    const started = await store.startInPersonAcceptance(alice, LEAD, OFFER) as Any;
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('+919876543210');
    expect(JSON.stringify(started)).not.toContain(lastCode());
    expect(started.phoneMasked).toBe('+91••••••3210');
    await expect(store.startInPersonAcceptance(alice, LEAD, OFFER)).rejects.toMatchObject({ status: 429, code: 'OTP_RESEND_TOO_SOON' });
  });

  it('removes the code and reports an error when the SMS cannot be delivered', async () => {
    const { db, state } = makeDb();
    const store = new PrismaSalesStore(db, async () => { throw new Error('provider down'); });
    await expect(store.startInPersonAcceptance(alice, LEAD, OFFER)).rejects.toMatchObject({ status: 502, code: 'SMS_DELIVERY_FAILED' });
    expect(state.challenges).toHaveLength(0);
  });

  it('accepts with the right code: offer accepted, case created, audit names the witness, code is single use', async () => {
    const { db, state } = makeDb();
    const store = new PrismaSalesStore(db, sender);
    const started = await store.startInPersonAcceptance(alice, LEAD, OFFER) as Any;
    const result = await store.confirmInPersonAcceptance(alice, LEAD, OFFER, { challengeId: started.challengeId, code: lastCode() }) as Any;
    expect(result).toMatchObject({ status: 'ACCEPTED', acceptedVia: 'IN_PERSON_OTP' });
    expect(state.offer.status).toBe('ACCEPTED');
    expect(state.lead.status).toBe('ACCEPTED');
    expect(state.cases[0].sellerAcceptedByUserId).toBe('seller-user');
    const audit = state.audits.find(entry => entry.action === 'ACQUISITION_OFFER_ACCEPTED');
    expect(audit.details).toMatchObject({ source: 'IN_PERSON_OTP', witnessEmployeeId: alice.userId, verifiedPhone: '+91••••••3210' });
    expect(JSON.stringify(state.audits)).not.toContain('9876543210');
    // replay: the offer is no longer actionable and the code is spent
    await expect(store.confirmInPersonAcceptance(alice, LEAD, OFFER, { challengeId: started.challengeId, code: lastCode() })).rejects.toMatchObject({ status: 409 });
  });

  it('rejects a wrong code, counts attempts and locks after the limit even if the right code follows', async () => {
    const { db, state } = makeDb();
    const store = new PrismaSalesStore(db, sender);
    const started = await store.startInPersonAcceptance(alice, LEAD, OFFER) as Any;
    const right = lastCode();
    const wrong = right === '000000' ? '000001' : '000000';
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await expect(store.confirmInPersonAcceptance(alice, LEAD, OFFER, { challengeId: started.challengeId, code: wrong })).rejects.toMatchObject({ status: 400, code: 'ACCEPTANCE_CODE_INVALID' });
    }
    await expect(store.confirmInPersonAcceptance(alice, LEAD, OFFER, { challengeId: started.challengeId, code: right })).rejects.toMatchObject({ status: 429, code: 'ACCEPTANCE_CODE_LOCKED' });
    expect(state.offer.status).toBe('OFFERED');
  });

  it('only the staff member who sent the code can complete it', async () => {
    const { db, state } = makeDb();
    const store = new PrismaSalesStore(db, sender);
    const started = await store.startInPersonAcceptance(alice, LEAD, OFFER) as Any;
    await expect(store.confirmInPersonAcceptance(bob, LEAD, OFFER, { challengeId: started.challengeId, code: lastCode() })).rejects.toMatchObject({ status: 404, code: 'ACCEPTANCE_CODE_NOT_FOUND' });
    expect(state.offer.status).toBe('OFFERED');
  });

  it('rejects an expired code and a code issued for an older version of the offer', async () => {
    const { db, state } = makeDb();
    const store = new PrismaSalesStore(db, sender);
    const started = await store.startInPersonAcceptance(alice, LEAD, OFFER) as Any;
    state.challenges[0].expiresAt = new Date(Date.now() - 1000);
    await expect(store.confirmInPersonAcceptance(alice, LEAD, OFFER, { challengeId: started.challengeId, code: lastCode() })).rejects.toMatchObject({ status: 410, code: 'ACCEPTANCE_CODE_EXPIRED' });
    state.challenges[0].expiresAt = new Date(Date.now() + 60_000);
    state.offer.version = 4; // the terms were revised after the code was sent
    await expect(store.confirmInPersonAcceptance(alice, LEAD, OFFER, { challengeId: started.challengeId, code: lastCode() })).rejects.toMatchObject({ status: 409, code: 'OFFER_CHANGED_REQUEST_NEW_CODE' });
  });
});
