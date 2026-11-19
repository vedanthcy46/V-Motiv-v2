import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { HttpError } from '../src/errors.js';
import { signDirectUpload } from '../src/cloudinary.js';
import {
  HomeContentStore, contentProblems, createHomeContentManageRouter, createHomeContentPublicRouter, isAllowedMediaUrl, scheduleState, videoPosterUrl,
} from '../src/home-content.js';

type Any = any;
const CLOUD = 'vmotiv';
const IMG = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/home-content/diwali.jpg`;
const VID = `https://res.cloudinary.com/${CLOUD}/video/upload/v1/home-content/hub-tour.mp4`;
const NOW = new Date('2026-11-19T10:00:00Z');

describe('media addresses', () => {
  it('accepts only https from our own media account when one is configured', () => {
    expect(isAllowedMediaUrl(IMG, CLOUD)).toBe(true);
    for (const bad of ['http://res.cloudinary.com/vmotiv/image/upload/a.jpg', 'https://evil.example/vmotiv/a.jpg', 'https://res.cloudinary.com/othercloud/image/upload/a.jpg', 'https://user:pw@res.cloudinary.com/vmotiv/a.jpg', 'javascript:alert(1)', 'not a url', '']) {
      expect(isAllowedMediaUrl(bad, CLOUD), bad).toBe(false);
    }
  });
  it('accepts any https address when no media account is configured (local development), but never http', () => {
    expect(isAllowedMediaUrl('https://example.test/a.jpg', null)).toBe(true);
    expect(isAllowedMediaUrl('http://example.test/a.jpg', null)).toBe(false);
  });
  it('derives a poster image from a Cloudinary video address, and nothing for any other address', () => {
    expect(videoPosterUrl(VID)).toBe(`https://res.cloudinary.com/${CLOUD}/video/upload/so_0,w_900,c_limit,q_auto,f_jpg/v1/home-content/hub-tour.jpg`);
    expect(videoPosterUrl('https://example.test/clip.mp4')).toBeNull();
    expect(videoPosterUrl(IMG)).toBeNull(); // an image address is not a video
  });
});

describe('what is wrong with an item', () => {
  const ok = { kind: 'BANNER' as const, mediaUrl: IMG, actionType: 'NONE' as const };
  const problems = (item: Any, forPublish = false) => contentProblems({ ...ok, ...item }, { cloudName: CLOUD, forPublish }).map(p => p.field);

  it('accepts a plain banner, and a banner with a screen, a listing or a link', () => {
    expect(problems({})).toEqual([]);
    expect(problems({ actionType: 'SCREEN', actionTarget: 'SERVICE' })).toEqual([]);
    expect(problems({ actionType: 'LISTING', actionTarget: '11111111-1111-4111-8111-111111111111' })).toEqual([]);
    expect(problems({ actionType: 'URL', actionTarget: 'https://vmotiv.in/offers' })).toEqual([]);
  });
  it('refuses a button that would open nothing, or something unsafe', () => {
    expect(problems({ actionType: 'SCREEN', actionTarget: 'SETTINGS' })).toEqual(['actionTarget']);
    expect(problems({ actionType: 'SCREEN', actionTarget: null })).toEqual(['actionTarget']);
    expect(problems({ actionType: 'LISTING', actionTarget: 'abc' })).toEqual(['actionTarget']);
    expect(problems({ actionType: 'URL', actionTarget: 'http://vmotiv.in' })).toEqual(['actionTarget']);
    expect(problems({ actionType: 'URL', actionTarget: 'javascript:alert(1)' })).toEqual(['actionTarget']);
  });
  it('needs media from our account and an end date after the start', () => {
    expect(problems({ mediaUrl: '' })).toEqual(['mediaUrl']);
    expect(problems({ mediaUrl: 'https://evil.example/a.jpg' })).toEqual(['mediaUrl']);
    expect(problems({ startsAt: new Date('2026-12-02'), endsAt: new Date('2026-12-01') })).toEqual(['endsAt']);
  });
  it('a published video needs a title and a cover (derived for our own videos)', () => {
    expect(problems({ kind: 'HUB_VIDEO', mediaUrl: VID }, true)).toEqual(['title']);
    expect(problems({ kind: 'HUB_VIDEO', mediaUrl: VID, title: 'Hub tour' }, true)).toEqual([]);
    expect(contentProblems({ kind: 'HUB_VIDEO', mediaUrl: 'https://example.test/v.mp4', title: 't' }, { cloudName: null, forPublish: true }).map(p => p.field)).toEqual(['thumbnailUrl']);
    expect(problems({ kind: 'HUB_VIDEO', mediaUrl: VID }, false)).toEqual([]); // a draft may be incomplete
  });
});

describe('when an item shows', () => {
  const item = (over: Any) => ({ status: 'PUBLISHED', startsAt: null, endsAt: null, ...over });
  it('is live only when published and inside its dates', () => {
    expect(scheduleState(item({}), NOW)).toBe('LIVE');
    expect(scheduleState(item({ status: 'DRAFT' }), NOW)).toBe('DRAFT');
    expect(scheduleState(item({ status: 'ARCHIVED' }), NOW)).toBe('ARCHIVED');
    expect(scheduleState(item({ startsAt: new Date('2026-11-20') }), NOW)).toBe('SCHEDULED');
    expect(scheduleState(item({ endsAt: new Date('2026-11-19T10:00:00Z') }), NOW)).toBe('EXPIRED'); // the end moment itself is already over
    expect(scheduleState(item({ startsAt: new Date('2026-11-01'), endsAt: new Date('2026-12-01') }), NOW)).toBe('LIVE');
  });
});

/** A small in-memory stand-in for the database calls the store makes. */
function fakeDb(seed: Any[] = []) {
  const rows: Any[] = seed.map(row => ({ status: 'DRAFT', sortOrder: 0, createdAt: new Date('2026-11-01'), updatedAt: new Date('2026-11-01'), publishedAt: null, startsAt: null, endsAt: null, city: null, title: null, subtitle: null, thumbnailUrl: null, durationSeconds: null, actionType: 'NONE', actionTarget: null, ctaLabel: null, hubName: null, ...row }));
  const audits: Any[] = [];
  const inRange = (row: Any, now: Date) => (!row.startsAt || row.startsAt <= now) && (!row.endsAt || row.endsAt > now);
  const db: Any = {
    homeContent: {
      findMany: vi.fn(async ({ where = {}, take }: Any) => {
        let out = rows.filter(row => (!where.kind || row.kind === where.kind) && (!where.status || (typeof where.status === 'string' ? row.status === where.status : row.status !== where.status.not)));
        if (where.AND) { // the public query
          const now = new Date();
          out = out.filter(row => inRange(row, now));
          const cityClause = where.AND[2]?.OR;
          const wantsCity = cityClause?.[1]?.city?.equals;
          out = out.filter(row => row.city === null || (wantsCity && row.city.toLowerCase() === wantsCity.toLowerCase()));
          if (where.AND.length === 3 && cityClause?.length === undefined) out = out.filter(row => row.city === null);
        }
        return out.sort((a, b) => a.sortOrder - b.sortOrder).slice(0, take ?? 1000).map(row => ({ ...row }));
      }),
      findUnique: vi.fn(async ({ where }: Any) => { const row = rows.find(r => r.id === where.id); return row ? { ...row } : null; }),
      create: vi.fn(async ({ data }: Any) => { const row = { id: crypto.randomUUID(), status: 'DRAFT', sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), publishedAt: null, ...data }; rows.push(row); return { ...row }; }),
      update: vi.fn(async ({ where, data }: Any) => { const row = rows.find(r => r.id === where.id)!; Object.assign(row, data, { updatedAt: new Date() }); return { ...row }; }),
      delete: vi.fn(async ({ where }: Any) => { rows.splice(rows.findIndex(r => r.id === where.id), 1); }),
    },
    auditEvent: { create: vi.fn(async ({ data }: Any) => { audits.push(data); }) },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { db, rows, audits };
}

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const banner = (n: number, over: Any = {}) => ({ id: ID(n), kind: 'BANNER', mediaUrl: IMG, ...over });

describe('what the apps read', () => {
  it('shows only published, in-date items, in Operations\' order, split by kind', async () => {
    const { db } = fakeDb([
      banner(1, { status: 'PUBLISHED', sortOrder: 2, title: 'Second' }),
      banner(2, { status: 'PUBLISHED', sortOrder: 1, title: 'First' }),
      banner(3, { status: 'DRAFT', title: 'Draft' }),
      banner(4, { status: 'ARCHIVED', title: 'Archived' }),
      banner(5, { status: 'PUBLISHED', endsAt: new Date('2020-01-01'), title: 'Expired' }),
      { id: ID(6), kind: 'HUB_VIDEO', status: 'PUBLISHED', mediaUrl: VID, title: 'Tour' },
      { id: ID(7), kind: 'HUB_PHOTO', status: 'PUBLISHED', mediaUrl: IMG },
    ]);
    const result = await new HomeContentStore(db).listPublic(undefined);
    expect(result.banners.map(b => b.title)).toEqual(['First', 'Second']);
    expect(result.hubVideos).toHaveLength(1);
    expect(result.hubVideos[0]!.thumbnailUrl).toContain('so_0'); // poster derived for our own videos
    expect(result.hubPhotos).toHaveLength(1);
  });

  it('shows city-specific items only in that city, and everywhere-items everywhere', async () => {
    const { db } = fakeDb([banner(1, { status: 'PUBLISHED', title: 'Everywhere' }), banner(2, { status: 'PUBLISHED', title: 'Bengaluru only', city: 'Bengaluru' })]);
    const store = new HomeContentStore(db);
    expect((await store.listPublic('bengaluru')).banners.map(b => b.title).sort()).toEqual(['Bengaluru only', 'Everywhere']);
    expect((await store.listPublic('Chennai')).banners.map(b => b.title)).toEqual(['Everywhere']);
    expect((await store.listPublic(undefined)).banners.map(b => b.title)).toEqual(['Everywhere']);
  });

  it('never sends staff-only fields, and caps each strip', async () => {
    const many = Array.from({ length: 12 }, (_, i) => banner(i, { id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`, status: 'PUBLISHED', sortOrder: i }));
    const { db } = fakeDb(many);
    const result = await new HomeContentStore(db).listPublic(undefined);
    expect(result.banners).toHaveLength(8);
    expect(Object.keys(result.banners[0]!).sort()).toEqual(['actionTarget', 'actionType', 'ctaLabel', 'durationSeconds', 'endsAt', 'hubName', 'id', 'kind', 'mediaUrl', 'startsAt', 'subtitle', 'thumbnailUrl', 'title']);
  });

  it('returns an empty Home, not an error, when the table does not exist yet', async () => {
    const { db } = fakeDb();
    db.homeContent.findMany.mockRejectedValueOnce(Object.assign(new Error('relation does not exist'), { code: 'P2021' }));
    expect(await new HomeContentStore(db).listPublic(undefined)).toEqual({ banners: [], hubPhotos: [], hubVideos: [] });
  });
});

describe('managing content', () => {
  const store = (seed: Any[] = []) => { const f = fakeDb(seed); return { ...f, store: new HomeContentStore(f.db, () => CLOUD) }; };
  const input = { kind: 'BANNER' as const, mediaUrl: IMG, actionType: 'NONE' as const, sortOrder: 0, title: 'Diwali offers' };

  it('creates a draft, publishes it, unpublishes it, and records each step', async () => {
    const { store: s, audits, rows } = store();
    const created = await s.create('staff-1', input as Any);
    expect(created.status).toBe('DRAFT');
    expect((await s.setStatus('staff-1', created.id, 'PUBLISHED')).publishedAt).toBeInstanceOf(Date);
    expect((await s.setStatus('staff-1', created.id, 'DRAFT')).status).toBe('DRAFT');
    expect(audits.map(a => a.action)).toEqual(['HOME_CONTENT_CREATED', 'HOME_CONTENT_PUBLISHED', 'HOME_CONTENT_DRAFT']);
    expect(rows[0].createdById).toBe('staff-1');
  });

  it('refuses to publish an incomplete item, and says what is missing', async () => {
    const { store: s, rows } = store([{ id: ID(1), kind: 'HUB_VIDEO', mediaUrl: VID }]);
    await expect(s.setStatus('staff-1', ID(1), 'PUBLISHED')).rejects.toMatchObject({ status: 400, code: 'INVALID_CONTENT', message: 'Give the video a short title.' });
    expect(rows[0].status).toBe('DRAFT');
  });

  it('refuses media from anywhere but our account', async () => {
    const { store: s, rows } = store();
    await expect(s.create('staff-1', { ...input, mediaUrl: 'https://evil.example/a.jpg' } as Any)).rejects.toMatchObject({ status: 400 });
    expect(rows).toHaveLength(0);
  });

  it('does not let a published item be edited into something invalid, or change its type', async () => {
    const { store: s } = store([banner(1, { status: 'PUBLISHED' })]);
    await expect(s.update('staff-1', ID(1), { actionType: 'SCREEN', actionTarget: 'NOPE' })).rejects.toMatchObject({ code: 'INVALID_CONTENT' });
    await expect(s.update('staff-1', ID(1), { kind: 'HUB_PHOTO' })).rejects.toMatchObject({ code: 'KIND_CANNOT_CHANGE' });
    expect((await s.update('staff-1', ID(1), { title: 'New title' })).title).toBe('New title');
  });

  it('will not delete something customers can see, but deletes a draft', async () => {
    const { store: s, rows } = store([banner(1, { status: 'PUBLISHED' }), banner(2)]);
    await expect(s.remove('staff-1', ID(1))).rejects.toMatchObject({ status: 409, code: 'UNPUBLISH_FIRST' });
    expect(await s.remove('staff-1', ID(2))).toEqual({ deleted: true });
    expect(rows.map(r => r.id)).toEqual([ID(1)]);
    await expect(s.remove('staff-1', ID(9))).rejects.toMatchObject({ status: 404 });
  });

  it('moves an item up or down by renumbering its group, even when order numbers were all equal', async () => {
    const { store: s, rows } = store([banner(1), banner(2), banner(3)]); // all sortOrder 0
    const order = () => [...rows].sort((a, b) => a.sortOrder - b.sortOrder).map(r => r.id);
    const start = order();
    expect(await s.move('staff-1', start[1]!, 'UP')).toEqual({ moved: true });
    expect(order()).toEqual([start[1], start[0], start[2]]);
    expect(await s.move('staff-1', order()[0]!, 'UP')).toEqual({ moved: false }); // already first
  });
});

describe('the routes', () => {
  function build(options: { employee?: Any; seed?: Any[]; sign?: Any } = {}) {
    const { db, rows } = fakeDb(options.seed);
    const employeeRow = options.employee === undefined ? { userId: 'staff-1', role: 'OPERATIONS_MANAGER', permissions: [], roleAssignments: [] } : options.employee;
    db.employee = { findFirst: vi.fn(async () => employeeRow) };
    const store = new HomeContentStore(db, () => CLOUD);
    const app = express();
    app.use(express.json());
    app.use('/api/v2', createHomeContentPublicRouter({ store }));
    app.use('/api/v2/operations/home-content', createHomeContentManageRouter({ verify: (async (t: string) => ({ uid: t, email: 'x@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } })) as Any, db, store, signUpload: () => options.sign ?? null }));
    app.use((error: Any, _req: Any, res: Any, _next: Any) => {
      if (error instanceof ZodError) return res.status(400).json({ code: 'INVALID_INPUT' });
      res.status(error instanceof HttpError ? error.status : 500).json({ code: error.code ?? 'INTERNAL', message: error.message });
    });
    return { app, rows, db };
  }
  const staffGet = (app: Any, path = '') => request(app).get(`/api/v2/operations/home-content${path}`).set('Authorization', 'Bearer s');

  it('the public list is open, cached for a minute, and answers an unchanged request with 304', async () => {
    const { app } = build({ seed: [banner(1, { status: 'PUBLISHED', title: 'Hello' })] });
    const first = await request(app).get('/api/v2/home/content?city=Bengaluru');
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toMatch(/max-age=60/);
    expect(first.body.banners[0].title).toBe('Hello');
    const again = await request(app).get('/api/v2/home/content?city=Bengaluru').set('If-None-Match', first.headers.etag!);
    expect(again.status).toBe(304);
  });

  it('only Operations managers, administrators or people given the permission may manage it', async () => {
    for (const [name, employee, status] of [
      ['operations manager', undefined, 200],
      ['admin through a role assignment', { userId: 'a', role: 'SALES_EXECUTIVE', permissions: [], roleAssignments: [{ role: { key: 'ADMIN' } }] }, 200],
      ['named permission', { userId: 'p', role: 'SALES_EXECUTIVE', permissions: ['content.home.manage'], roleAssignments: [] }, 200],
      ['sales executive', { userId: 's', role: 'SALES_EXECUTIVE', permissions: [], roleAssignments: [] }, 403],
      ['not staff', null, 403],
    ] as const) {
      const { app } = build({ employee: employee as Any });
      expect((await staffGet(app)).status, name).toBe(status);
    }
    expect((await request(build().app).get('/api/v2/operations/home-content')).status).toBe(401);
  });

  it('creates, publishes and lists through the routes, and rejects bad input', async () => {
    const { app } = build();
    const created = await request(app).post('/api/v2/operations/home-content').set('Authorization', 'Bearer s').send({ kind: 'BANNER', mediaUrl: IMG, title: 'Offer', actionType: 'SCREEN', actionTarget: 'SERVICE' });
    expect(created.status).toBe(201);
    const published = await request(app).post(`/api/v2/operations/home-content/${created.body.id}/publish`).set('Authorization', 'Bearer s');
    expect(published.body.status).toBe('PUBLISHED');
    expect((await staffGet(app)).body.items[0]).toMatchObject({ title: 'Offer', state: 'LIVE' });
    expect((await request(app).post('/api/v2/operations/home-content').set('Authorization', 'Bearer s').send({ kind: 'BANNER', mediaUrl: IMG, bogus: 1 })).status).toBe(400);
    expect((await request(app).post('/api/v2/operations/home-content').set('Authorization', 'Bearer s').send({ kind: 'POSTER', mediaUrl: IMG })).status).toBe(400);
    expect((await request(app).post('/api/v2/operations/home-content/not-a-uuid/publish').set('Authorization', 'Bearer s')).status).toBe(400);
  });

  it('hands out an upload signature for staff only, and says so plainly when uploads are not set up', async () => {
    const withKeys = build({ sign: { cloudName: CLOUD, apiKey: 'k', timestamp: 1, folder: 'home-content', signature: 'sig' } });
    const ok = await request(withKeys.app).post('/api/v2/operations/home-content/upload-signature').set('Authorization', 'Bearer s');
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ cloudName: CLOUD, apiKey: 'k', timestamp: 1, folder: 'home-content', signature: 'sig' });
    expect(JSON.stringify(ok.body)).not.toMatch(/secret/i);
    const without = await request(build().app).post('/api/v2/operations/home-content/upload-signature').set('Authorization', 'Bearer s');
    expect(without.status).toBe(503);
    expect(without.body.code).toBe('MEDIA_UPLOAD_NOT_CONFIGURED');
    const denied = build({ employee: null, sign: { cloudName: CLOUD, apiKey: 'k', timestamp: 1, folder: 'f', signature: 's' } });
    expect((await request(denied.app).post('/api/v2/operations/home-content/upload-signature').set('Authorization', 'Bearer s')).status).toBe(403);
  });
});

describe('the upload signature', () => {
  it('signs only the folder and time with the secret, never exposing it, and is null when not configured', () => {
    const saved = { ...process.env };
    delete process.env.CLOUDINARY_URL;
    delete process.env.CLOUDINARY_CLOUD_NAME; delete process.env.CLOUDINARY_API_KEY; delete process.env.CLOUDINARY_API_SECRET;
    expect(signDirectUpload('home-content', 1000)).toBeNull();
    process.env.CLOUDINARY_CLOUD_NAME = 'vmotiv'; process.env.CLOUDINARY_API_KEY = 'key123'; process.env.CLOUDINARY_API_SECRET = 'topsecret';
    const signed = signDirectUpload('home-content', 1_700_000_000)!;
    expect(signed).toMatchObject({ cloudName: 'vmotiv', apiKey: 'key123', timestamp: 1_700_000_000, folder: 'home-content' });
    // Cloudinary's documented scheme, computed here independently: sha1("folder=<folder>&timestamp=<ts>" + secret)
    expect(signed.signature).toBe(createHash('sha1').update('folder=home-content&timestamp=1700000000topsecret').digest('hex'));
    expect(signed.signature).toMatch(/^[0-9a-f]{40}$/);
    expect(JSON.stringify(signed)).not.toContain('topsecret');
    process.env = saved;
  });
});
