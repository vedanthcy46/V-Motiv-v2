import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createRtdbSignaler, domainsForModel, isWriteOperation, signalerFromEnv } from '../src/rtdb-signal.js';

type Any = any;
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }) as Any;
const account = { client_email: 'svc@v-motiv.iam.gserviceaccount.com', private_key: privateKey as string };

function makeFetch() {
  return vi.fn(async (url: string) => {
    if (String(url).includes('oauth2.googleapis.com')) return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
    return { ok: true, status: 200, json: async () => ({}) };
  }) as Any;
}

describe('model to domain mapping', () => {
  it('maps Prisma model names to the staff domains they invalidate', () => {
    expect(domainsForModel('RentalBooking')).toEqual(['rentals']);
    expect(domainsForModel('InspectionRequest').sort()).toEqual(['dispatch', 'sales']);
    expect(domainsForModel('SomethingUnrelated')).toEqual([]);
    expect(domainsForModel(undefined)).toEqual([]);
  });
  it('only writes trigger signals', () => {
    expect(isWriteOperation('update')).toBe(true);
    expect(isWriteOperation('findMany')).toBe(false);
  });
});

describe('createRtdbSignaler', () => {
  it('writes /pulse/<domain> after the delay, coalesces bursts and reuses the access token', async () => {
    const fetchImpl = makeFetch();
    const jobs: Promise<unknown>[] = [];
    const signaler = createRtdbSignaler({ databaseUrl: 'https://x.firebaseio.com/', serviceAccount: account, fetchImpl, waitUntil: () => p => { jobs.push(p); }, sleep: async () => undefined, now: () => 1_700_000_000_000 });
    signaler.signal(['rentals', 'dispatch']);
    signaler.signal(['rentals']); // burst: already pending
    await Promise.all(jobs);
    const writes = fetchImpl.mock.calls.filter(([url]: Any) => String(url).includes('firebaseio.com'));
    expect(writes.map(([url]: Any) => url).sort()).toEqual(['https://x.firebaseio.com/pulse/dispatch.json', 'https://x.firebaseio.com/pulse/rentals.json']);
    expect(writes[0][1].method).toBe('PUT');
    expect(writes[0][1].headers.Authorization).toBe('Bearer tok');
    expect(fetchImpl.mock.calls.filter(([url]: Any) => String(url).includes('oauth2')).length).toBe(1);
  });

  it('never throws into the request path when Firebase is unreachable', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network'); }) as Any;
    const jobs: Promise<unknown>[] = [];
    const signaler = createRtdbSignaler({ databaseUrl: 'https://x.firebaseio.com', serviceAccount: account, fetchImpl, waitUntil: () => p => { jobs.push(p); }, sleep: async () => undefined });
    signaler.signal(['finance']);
    await expect(Promise.all(jobs)).resolves.toBeDefined();
  });
});

describe('signalerFromEnv', () => {
  it('is disabled unless both the database URL and service account are present and valid', () => {
    expect(signalerFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect(signalerFromEnv({ FIREBASE_DATABASE_URL: 'https://x.firebaseio.com' } as NodeJS.ProcessEnv)).toBeNull();
    expect(signalerFromEnv({ FIREBASE_DATABASE_URL: 'https://x.firebaseio.com', FIREBASE_SERVICE_ACCOUNT_JSON: 'not json' } as NodeJS.ProcessEnv)).toBeNull();
    expect(signalerFromEnv({ FIREBASE_DATABASE_URL: 'https://x.firebaseio.com', FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(account) } as NodeJS.ProcessEnv)).not.toBeNull();
  });
});
