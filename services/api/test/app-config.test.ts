import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { isValidVersion, parsePlatform, readAppConfig } from '../src/app-config.js';

const row = { latestVersion: '1.0.1', minSupportedVersion: '1.0.0', updateUrl: 'https://play.google.com/store/apps/details?id=in.vmotiv.customer', releaseNotes: 'Faster payments', updatedAt: new Date('2026-11-08T10:00:00Z') };

describe('app config', () => {
  it('understands platforms and versions', () => {
    expect(parsePlatform('android')).toBe('ANDROID');
    expect(parsePlatform('IOS')).toBe('IOS');
    expect(parsePlatform('windows')).toBeNull();
    expect(parsePlatform(undefined)).toBeNull();
    expect(isValidVersion('1.0.1')).toBe(true);
    expect(isValidVersion('2')).toBe(true);
    expect(isValidVersion('1.0.1-beta')).toBe(false);
    expect(isValidVersion('v1.0')).toBe(false);
  });

  it('returns the published row, or "no update" when none exists or the table is missing', async () => {
    expect(await readAppConfig({ appConfig: { findUnique: async () => row } } as any, 'customer', 'ANDROID')).toMatchObject({ latestVersion: '1.0.1', minSupportedVersion: '1.0.0', releaseNotes: 'Faster payments' });
    expect(await readAppConfig({ appConfig: { findUnique: async () => null } } as any, 'customer', 'IOS')).toMatchObject({ latestVersion: null });
    expect(await readAppConfig({ appConfig: { findUnique: async () => { throw new Error('relation "AppConfig" does not exist'); } } } as any, 'customer', 'IOS')).toMatchObject({ latestVersion: null });
  });

  function build(findUnique: any) {
    return createApp({ verify: vi.fn() as any, store: { sync: vi.fn(), find: vi.fn() } as any, webOrigin: 'http://localhost:3000', customer: {} as any, db: { appConfig: { findUnique } } as any });
  }

  it('GET /api/v2/app-config is public and returns the config for a platform', async () => {
    const findUnique = vi.fn(async () => row);
    const res = await request(build(findUnique)).get('/api/v2/app-config?platform=android');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ app: 'customer', platform: 'ANDROID', latestVersion: '1.0.1', updateUrl: row.updateUrl });
    expect(findUnique).toHaveBeenCalledWith({ where: { app_platform: { app: 'customer', platform: 'ANDROID' } } });
  });

  it('rejects an unknown platform', async () => {
    const res = await request(build(vi.fn())).get('/api/v2/app-config?platform=blackberry');
    expect(res.status).toBe(400);
  });
});

import { PrismaAdminStore } from '../src/admin-store.js';
describe('publishing a version from the admin portal', () => {
  const actor: any = { userId: 'u-1', roles: ['SUPER_ADMIN'], permissions: ['branch.manage'], branches: [] };
  function makeStore(existing: any = null) {
    const upserts: any[] = [];
    const audits: any[] = [];
    const saved = { id: 'cfg-1', app: 'customer', platform: 'ANDROID', latestVersion: '1.0.1', latestVersionCode: 12, minSupportedVersion: null, updateUrl: null, releaseNotes: null, updatedAt: new Date('2026-11-08T10:00:00Z') };
    const db: any = {
      appConfig: {
        findUnique: async () => existing ?? saved,
        upsert: async (args: any) => { upserts.push(args); return saved; },
      },
      auditEvent: { create: async (args: any) => { audits.push(args.data); return args.data; } },
    };
    return { store: new PrismaAdminStore(db), upserts, audits };
  }

  it('saves the version and build number for a platform and audits who changed it', async () => {
    const { store, upserts, audits } = makeStore();
    const result: any = await store.saveAppConfig(actor, { platform: 'ANDROID', latestVersion: '1.0.1', latestVersionCode: 12, minSupportedVersion: '1.0.0', releaseNotes: 'Faster payments' });
    expect(upserts[0].where).toEqual({ app_platform: { app: 'customer', platform: 'ANDROID' } });
    expect(upserts[0].update).toMatchObject({ latestVersion: '1.0.1', latestVersionCode: 12, minSupportedVersion: '1.0.0', releaseNotes: 'Faster payments', updateUrl: null });
    expect(audits[0]).toMatchObject({ action: 'APP_CONFIG_UPDATED', actorId: 'u-1' });
    expect(result).toMatchObject({ platform: 'ANDROID', latestVersion: '1.0.1', latestVersionCode: 12 });
  });

  it('lists both platforms for the editing screen, empty until published', async () => {
    const { store } = makeStore();
    const list: any[] = (await store.appConfigs(actor)) as any[];
    expect(list.map(item => item.platform)).toEqual(['ANDROID', 'IOS']);
  });

  it('needs the settings permission', async () => {
    const { store } = makeStore();
    await expect(store.saveAppConfig({ ...actor, roles: ['SUPPORT_ADMIN'], permissions: ['branch.read'] }, { platform: 'IOS', latestVersion: '1.0.1' })).rejects.toMatchObject({ status: 403 });
  });
});
