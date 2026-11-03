import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createApp } from '../src/app.js';
import type { IdentityStore } from '../src/identity-store.js';
import { readConfig } from '../src/config.js';
import { retryAllowed } from '../src/email.js';

const verified = {
  uid: 'firebase-one', email: 'customer@example.test', email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
} as DecodedIdToken;
const profile = {
  id: 'local-one', email: verified.email!, displayName: 'Customer', phone: null,
  status: 'ACTIVE' as const, marketingConsent: false, createdAt: new Date(), employee: null,
};
function setup(token = verified) {
  const verify = vi.fn().mockResolvedValue(token);
  const store: IdentityStore = {
    sync: vi.fn().mockResolvedValue(profile),
    find: vi.fn().mockResolvedValue(profile),
    ready: vi.fn().mockResolvedValue(undefined),
  };
  return { verify, store, app: createApp({ verify, store, webOrigin: 'http://localhost:3100' }) };
}
describe('authentication boundary', () => {
  it('rejects missing, malformed, expired and revoked tokens', async () => {
    const { app, verify, store } = setup();
    expect((await request(app).get('/api/v1/me')).status).toBe(401);
    expect((await request(app).get('/api/v1/me').set('Authorization', 'Bearer one two')).status).toBe(401);
    for (const code of ['auth/id-token-expired', 'auth/id-token-revoked']) {
      verify.mockRejectedValueOnce({ code });
      expect((await request(app).get('/api/v1/me').set('Authorization', 'Bearer token')).status).toBe(401);
    }
    expect(store.find).not.toHaveBeenCalled();
  });
  it('verifies preview-shaped tokens rather than trusting a client-selected identity', async () => {
    const { app, verify, store } = setup();
    verify.mockRejectedValueOnce({ code: 'auth/argument-error' });
    const response = await request(app).post('/api/v1/auth/sync').set('Authorization', 'Bearer dev-preview-token:someone@example.test');
    expect(response.status).toBe(401);
    expect(verify).toHaveBeenCalledWith('dev-preview-token:someone@example.test', true);
    expect(store.sync).not.toHaveBeenCalled();
  });
  it('checks revocation and uses verified UID, ignoring frontend identity', async () => {
    const { app, verify, store } = setup();
    const response = await request(app).post('/api/v1/auth/sync').set('Authorization', 'Bearer real-token');
    expect(response.status).toBe(200);
    expect(verify).toHaveBeenCalledWith('real-token', true);
    expect(store.sync).toHaveBeenCalledWith(expect.objectContaining({ uid: 'firebase-one' }));
    const tamper = await request(app).post('/api/v1/auth/sync').set('Authorization', 'Bearer real-token').send({ role: 'ADMIN', uid: 'other' });
    expect(tamper.status).toBe(400);
  });
  it.each([
    { ...verified, email_verified: false },
    { ...verified, firebase: { sign_in_provider: 'password' } },
  ])('requires a verified Google identity', async token => {
    const { app, store } = setup(token as DecodedIdToken);
    expect((await request(app).get('/api/v1/me').set('Authorization', 'Bearer token')).status).toBe(401);
    expect(store.find).not.toHaveBeenCalled();
  });
  it('denies a suspended user and customers entering employee APIs', async () => {
    const { app, store } = setup();
    expect((await request(app).get('/api/v1/employee/me').set('Authorization', 'Bearer token')).status).toBe(403);
    vi.mocked(store.find).mockResolvedValue({ ...profile, status: 'SUSPENDED' });
    expect((await request(app).get('/api/v1/me').set('Authorization', 'Bearer token')).status).toBe(403);
  });
  it('requires an active employee grant and second factor', async () => {
    const { app, store } = setup();
    vi.mocked(store.find).mockResolvedValue({ ...profile, employee: {
      role: 'ADMIN', active: true, permissions: [], locationIds: [],
    } });
    expect((await request(app).get('/api/v1/employee/me').set('Authorization', 'Bearer token')).body.code).toBe('EMPLOYEE_MFA_REQUIRED');
  });
  it('returns readiness failure without database details', async () => {
    const { app, store } = setup();
    vi.mocked(store.ready).mockRejectedValue(new Error('secret database credentials'));
    const response = await request(app).get('/api/v1/health/ready');
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });
  it('does not grant CORS to arbitrary Vercel or LAN origins in production configuration', async () => {
    const verify = vi.fn().mockResolvedValue(verified);
    const store: IdentityStore = { sync: vi.fn(), find: vi.fn(), ready: vi.fn().mockResolvedValue(undefined) };
    const app = createApp({ verify, store, webOrigin: 'https://www.vmotiv.in', adminWebOrigin: 'https://admin.vmotiv.in' });
    const untrusted = await request(app).get('/api/v1/health/live').set('Origin', 'https://attacker.vercel.app');
    expect(untrusted.headers['access-control-allow-origin']).toBeUndefined();
    const lan = await request(app).get('/api/v1/health/live').set('Origin', 'http://192.168.1.9:9999');
    expect(lan.headers['access-control-allow-origin']).toBeUndefined();
    const trusted = await request(app).get('/api/v1/health/live').set('Origin', 'https://admin.vmotiv.in');
    expect(trusted.headers['access-control-allow-origin']).toBe('https://admin.vmotiv.in');
    const vercelAdmin = await request(app).get('/api/v1/health/live').set('Origin', 'https://vmotiv-admin.vercel.app');
    expect(vercelAdmin.headers['access-control-allow-origin']).toBe('https://vmotiv-admin.vercel.app');
    const vercelCustomerPreview = await request(app).options('/api/v2/public/connect/example/calls/example/signals')
      .set('Origin', 'https://vmotiv-ih8dh83dx-vedanthh46-9191s-projects.vercel.app')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(vercelCustomerPreview.headers['access-control-allow-origin']).toBe('https://vmotiv-ih8dh83dx-vedanthh46-9191s-projects.vercel.app');
  });
});
describe('environment and retry guardrails', () => {
  const env = { DATABASE_URL: 'postgresql://local@127.0.0.1:5440/vmotiv_v2_dev', WEB_ORIGIN: 'http://localhost:3100', FIREBASE_PROJECT_ID: 'v2-development' };
  it('rejects non-V2 and remote development databases', () => {
    expect(() => readConfig({ ...env, DATABASE_URL: 'postgresql://local@localhost:5433/vmotiv' })).toThrow();
    expect(() => readConfig({ ...env, DATABASE_URL: 'postgresql://local@remote:5432/vmotiv_v2_dev' })).toThrow();
  });
  it('requires real email configuration before enabling sends', () => {
    expect(() => readConfig({ ...env, EMAIL_DELIVERY_ENABLED: 'true' })).toThrow();
    expect(readConfig(env).EMAIL_DELIVERY_ENABLED).toBe('false');
  });
  it('supports local frontend testing in production mode while requiring HTTPS publicly', () => {
    const production = { ...env, NODE_ENV: 'production', DATABASE_URL: 'postgresql://test@example.test/dedicated_v2' };
    expect(readConfig(production).NODE_ENV).toBe('production');
    expect(() => readConfig({ ...production, WEB_ORIGIN: 'http://example.test' })).toThrow('HTTPS');
    expect(() => readConfig({ ...production, FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' })).toThrow('emulator');
  });
  it('supports comma-separated WEB_ORIGIN and normalizes trailing slashes', () => {
    const production = { ...env, NODE_ENV: 'production', DATABASE_URL: 'postgresql://test@example.test/dedicated_v2' };
    const parsed = readConfig({
      ...production,
      WEB_ORIGIN: 'https://vmotiv.in, https://www.vmotiv.in/',
      ADMIN_WEB_ORIGIN: 'https://admin.vmotiv.in/',
    });
    expect(parsed.WEB_ORIGIN).toBe('https://vmotiv.in');
    expect(parsed.ALLOWED_ORIGINS).toEqual(['https://vmotiv.in', 'https://www.vmotiv.in']);
    expect(parsed.ADMIN_WEB_ORIGIN).toBe('https://admin.vmotiv.in');
  });
  it('quarantines retries outside provider deduplication window', () => {
    const now = new Date();
    expect(retryAllowed({ attempts: 1, firstAttemptAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, now)).toBe(false);
    expect(retryAllowed({ attempts: 6, firstAttemptAt: now }, now)).toBe(false);
    expect(retryAllowed({ attempts: 1, firstAttemptAt: now }, now)).toBe(true);
  });
});

