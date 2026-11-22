import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ensureAdminCatalog } from '../src/admin-catalog.js';
import { createAnnouncementRouter } from '../src/announcements/router.js';
import { BATCH_SIZE, inSendWindow, nextSendWindowStart, processAnnouncements, processBatch } from '../src/announcements/announcements.js';
import { HttpError } from '../src/errors.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) {
  throw new Error('Integration tests require the isolated local vmotiv_v2_test database.');
}

const DAYTIME = new Date('2026-11-22T06:00:00Z'); // 11:30 in India
const NIGHT = new Date('2026-11-22T19:00:00Z');   // 00:30 in India

describe('send window', () => {
  it('is 9 am to 9 pm India time, and a night request waits for 9 am', () => {
    expect(inSendWindow(DAYTIME)).toBe(true);
    expect(inSendWindow(NIGHT)).toBe(false);
    expect(nextSendWindowStart(NIGHT).toISOString()).toBe('2026-11-23T03:30:00.000Z'); // 09:00 IST next day
    expect(nextSendWindowStart(new Date('2026-11-22T02:00:00Z')).toISOString()).toBe('2026-11-22T03:30:00.000Z'); // 07:30 IST -> 09:00 same day
    expect(nextSendWindowStart(DAYTIME)).toEqual(DAYTIME);
  });
});

describe.skipIf(!url)('Platform announcements, with real PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const suffix = crypto.randomUUID().slice(0, 8);
  let city = '';
  const verify = async (token: string) => ({ uid: token, email: `${token}@example.test`, email_verified: true, name: token, firebase: { sign_in_provider: 'google.com' } }) as any;
  const app = express();
  app.use(express.json());
  app.use('/api/v2', createAnnouncementRouter({ verify, db }));
  app.use((err: any, _req: any, res: any, _next: any) => res.status(err instanceof HttpError ? err.status : 400).json({ code: err.code ?? 'BAD_REQUEST', message: err.message }));
  const as = (uid: string) => ({ Authorization: `Bearer ${uid}` });

  async function staff(role: 'ADMIN' | 'OPERATIONS_MANAGER' | 'SALES_EXECUTIVE') {
    const uid = `s-${crypto.randomUUID()}`;
    const user = await db.user.create({ data: { firebaseUid: uid, email: `${uid}@example.test`, displayName: uid } });
    const roleRow = await db.role.findUnique({ where: { key: role } });
    await db.employee.create({ data: { userId: user.id, role, active: true, status: 'ACTIVE', mfaStatus: 'COMPLIANT', employeeCode: `E-${crypto.randomUUID().slice(0, 8)}`.toUpperCase(), roleAssignments: { create: { roleId: roleRow!.id } } } });
    return { uid, id: user.id };
  }
  async function customer(opts: { consent?: boolean; push?: boolean | 'off'; status?: 'ACTIVE' | 'SUSPENDED'; city?: string } = {}) {
    const uid = `c-${crypto.randomUUID()}`;
    const user = await db.user.create({ data: { firebaseUid: uid, email: `${uid}@example.test`, displayName: uid, marketingConsent: opts.consent ?? true, status: opts.status ?? 'ACTIVE', preferredCity: opts.city ?? city } });
    if (opts.push === 'off') await db.notificationPreference.create({ data: { userId: user.id, pushEnabled: false } });
    let device;
    if (opts.push !== false) device = await db.pushDevice.create({ data: { userId: user.id, app: 'CUSTOMER', token: `ExponentPushToken[${crypto.randomUUID()}]`, platform: 'android' } });
    return { id: user.id, device };
  }
  const inbox = (userId: string) => db.notification.findMany({ where: { userId, eventType: 'PLATFORM_ANNOUNCEMENT' } });
  const tickets = (deviceId: string) => db.pushTicket.findMany({ where: { deviceId } });
  const draft = async (admin: { uid: string }, overrides: Record<string, unknown> = {}) => (await request(app).post('/api/v2/staff/announcements').set(as(admin.uid)).send({ title: 'New cars in your city', body: 'Fresh certified cars just arrived. Take a look.', target: 'BUY', city, ...overrides })).body;
  const send = (admin: { uid: string }, id: string, expected: number, extra: Record<string, unknown> = {}) => request(app).post(`/api/v2/staff/announcements/${id}/send`).set(as(admin.uid)).send({ expectedRecipients: expected, ...extra });

  beforeAll(async () => { await ensureAdminCatalog(db as any); });
  beforeEach(async () => { city = `Announceville-${crypto.randomUUID().slice(0, 8)}`; await db.supportedCity.create({ data: { name: city } }); await db.platformAnnouncement.deleteMany({}); await db.announcementSettings.deleteMany({}); });
  afterAll(() => db.$disconnect());

  it('PERMISSION: Admin and Operations Manager can manage announcements; Sales and customers cannot', async () => {
    const admin = await staff('ADMIN');
    const ops = await staff('OPERATIONS_MANAGER');
    const sales = await staff('SALES_EXECUTIVE');
    expect((await request(app).get('/api/v2/staff/announcements').set(as(admin.uid))).status).toBe(200);
    expect((await request(app).get('/api/v2/staff/announcements').set(as(ops.uid))).status).toBe(200);
    const denied = await request(app).get('/api/v2/staff/announcements').set(as(sales.uid));
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('PERMISSION_DENIED');
    const c = await customer();
    const asCustomer = await request(app).post('/api/v2/staff/announcements').set(as(`c-${c.id}`)).send({});
    expect([401, 403]).toContain(asCustomer.status);
    expect((await request(app).get('/api/v2/staff/announcements')).status).toBe(401);
  });

  it('AUDIENCE: only active customers who opted in, in the chosen city, and never staff; push only with the push preference and a device', async () => {
    const admin = await staff('ADMIN');
    const yes = await customer();
    const pushOff = await customer({ push: 'off' });
    const noDevice = await customer({ push: false });
    const noConsent = await customer({ consent: false });
    const suspended = await customer({ status: 'SUSPENDED' });
    const elsewhere = await customer({ city: `Other-${suffix}` });
    const aStaff = await staff('SALES_EXECUTIVE');
    await db.user.update({ where: { id: aStaff.id }, data: { marketingConsent: true, preferredCity: city } });

    const audience = (await request(app).get(`/api/v2/staff/announcements/audience?city=${encodeURIComponent(city)}`).set(as(admin.uid))).body;
    expect(audience).toEqual({ recipients: 3, withPushDevice: 1 });

    const a = await draft(admin);
    const sent = await send(admin, a.id, 3);
    expect(sent.status).toBe(200);
    // sendAnnouncement runs on the real clock: outside 9am-9pm IST it waits, so deliver it as the worker would in the window
    if (sent.body.deferred) await db.platformAnnouncement.update({ where: { id: a.id }, data: { scheduledFor: new Date(Date.now() - 1000) } });
    await db.platformAnnouncement.update({ where: { id: a.id }, data: { startedAt: DAYTIME } });
    await processAnnouncements(db, DAYTIME);

    expect(await inbox(yes.id)).toHaveLength(1);
    expect(await inbox(pushOff.id)).toHaveLength(1);
    expect(await inbox(noDevice.id)).toHaveLength(1);
    for (const out of [noConsent, suspended, elsewhere]) expect(await inbox(out.id)).toHaveLength(0);
    expect(await inbox(aStaff.id)).toHaveLength(0);
    expect(await tickets(yes.device!.id)).toHaveLength(1);
    expect(await tickets(pushOff.device!.id)).toHaveLength(0);
    const row = (await inbox(yes.id))[0]!;
    expect(row).toMatchObject({ category: 'PROMOTION', deepLink: 'vmotiv://app/buy', priority: 'LOW' });
    const ticket = (await tickets(yes.device!.id))[0]!;
    expect(ticket.data).toMatchObject({ type: 'PLATFORM_ANNOUNCEMENT', notificationId: row.id, deepLink: 'vmotiv://app/buy' });
    const done = await db.platformAnnouncement.findUnique({ where: { id: a.id } });
    expect(done).toMatchObject({ status: 'SENT', recipientCount: 3, pushQueued: 1 });
    expect(await db.auditEvent.count({ where: { entityId: a.id, action: { in: ['ANNOUNCEMENT_CREATED', 'ANNOUNCEMENT_SENT', 'ANNOUNCEMENT_SCHEDULED'] } } })).toBeGreaterThanOrEqual(2);
  });

  it('BATCHES: a large audience is delivered in batches, once each, and a replayed batch never doubles anyone', async () => {
    const admin = await staff('ADMIN');
    const bigCity = `Big-${suffix}`;
    const total = BATCH_SIZE * 2 + 37;
    await db.supportedCity.create({ data: { name: bigCity } });
    await db.user.createMany({ data: Array.from({ length: total }, (_, i) => ({ firebaseUid: `big-${suffix}-${i}`, email: `big-${suffix}-${i}@example.test`, marketingConsent: true, preferredCity: bigCity })) });
    const a = await draft(admin, { city: bigCity });
    await db.platformAnnouncement.update({ where: { id: a.id }, data: { status: 'SENDING', startedAt: DAYTIME } });
    expect(await processBatch(db, a.id)).toBe(BATCH_SIZE);
    expect((await db.platformAnnouncement.findUnique({ where: { id: a.id } }))!.recipientCount).toBe(BATCH_SIZE);
    // simulate a crash after delivery but before the cursor moved: the same people come around again
    await db.platformAnnouncement.update({ where: { id: a.id }, data: { cursorUserId: null, recipientCount: 0 } });
    await processBatch(db, a.id);
    expect(await db.notification.count({ where: { announcementId: a.id } })).toBe(BATCH_SIZE);
    for (let i = 0; i < 6; i++) await processAnnouncements(db, DAYTIME);
    expect(await db.notification.count({ where: { announcementId: a.id } })).toBe(total);
    expect((await db.platformAnnouncement.findUnique({ where: { id: a.id } }))!.status).toBe('SENT');
  }, 60_000);

  it('SAFETY: kill switch, daily cap, audience drift, bad targets and no-one-to-send-to are all refused', async () => {
    const admin = await staff('ADMIN');
    await customer();
    const a = await draft(admin);

    const off = await request(app).put('/api/v2/staff/announcements/settings').set(as(admin.uid)).send({ enabled: false });
    expect(off.body).toEqual({ enabled: false, maxPerDay: 2 });
    const refused = await send(admin, a.id, 1);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('ANNOUNCEMENTS_DISABLED');
    await request(app).put('/api/v2/staff/announcements/settings').set(as(admin.uid)).send({ enabled: true, maxPerDay: 1 });

    const drift = await send(admin, a.id, 50);
    expect(drift.status).toBe(409);
    expect(drift.body.code).toBe('AUDIENCE_CHANGED');

    const nowhere = `Nowhere-${suffix}-${crypto.randomUUID().slice(0, 4)}`;
    await db.supportedCity.create({ data: { name: nowhere } });
    const none = await draft(admin, { city: nowhere });
    expect((await send(admin, none.id, 0)).body.code).toBe('NO_RECIPIENTS');

    expect((await request(app).post('/api/v2/staff/announcements').set(as(admin.uid)).send({ title: 'x', body: 'too short', target: 'BUY' })).status).toBe(400);
    expect((await request(app).post('/api/v2/staff/announcements').set(as(admin.uid)).send({ title: 'Hello there', body: 'A fine body for it', target: 'https://evil.example' })).status).toBe(400);
    expect((await request(app).post('/api/v2/staff/announcements').set(as(admin.uid)).send({ title: 'Hello there', body: 'A fine body for it', target: 'VEHICLE', listingId: crypto.randomUUID() })).body.code).toBe('LISTING_NOT_PUBLISHED');

    const first = await send(admin, a.id, 1);
    expect(first.status).toBe(200);
    const second = await draft(admin);
    const capped = await send(admin, second.id, 1);
    expect(capped.status).toBe(429);
    expect(capped.body.code).toBe('ANNOUNCEMENT_DAILY_LIMIT');
    // already sent: cannot be sent again or edited
    expect((await send(admin, a.id, 1)).body.code).toMatch(/ANNOUNCEMENT_ALREADY_SENT|ANNOUNCEMENT_DAILY_LIMIT/);
    expect((await request(app).patch(`/api/v2/staff/announcements/${a.id}`).set(as(admin.uid)).send({ title: 'Changed title', body: 'Changed body text', target: 'HOME' })).status).toBe(409);
  });

  it('SCHEDULING: a night send waits for 9 am, scheduled ones need the window, and nothing leaves at night or while switched off', async () => {
    const admin = await staff('ADMIN');
    const c = await customer();
    const a = await draft(admin);
    const outside = await send(admin, a.id, 1, { scheduledFor: new Date(Date.now() + 3_600_000 * 24 * 2 + 1).toISOString().replace(/T\d\d:/, 'T19:') });
    // 19:xx UTC is after midnight in India: refused
    expect([400]).toContain(outside.status);
    expect(outside.body.code).toBe('OUTSIDE_SEND_WINDOW');
    expect((await send(admin, a.id, 1, { scheduledFor: new Date(Date.now() - 3_600_000).toISOString() })).body.code).toBe('SCHEDULE_IN_PAST');
    expect((await send(admin, a.id, 1, { scheduledFor: new Date(Date.now() + 40 * 24 * 3_600_000).toISOString() })).body.code).toBe('SCHEDULE_TOO_FAR');

    // schedule properly, then let the worker pick it up at the right times
    const when = new Date(Date.now() + 3 * 24 * 3_600_000); when.setUTCHours(6, 0, 0, 0);
    const ok = await send(admin, a.id, 1, { scheduledFor: when.toISOString() });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'SCHEDULED', deferred: true });
    await processAnnouncements(db, new Date(when.getTime() - 3_600_000));
    expect(await inbox(c.id)).toHaveLength(0); // not yet
    await processAnnouncements(db, new Date(when.getTime() + 13 * 3_600_000)); // 19:00 UTC = night in India, due but paused
    expect(await inbox(c.id)).toHaveLength(0);
    await db.announcementSettings.create({ data: { id: 'default', enabled: false } });
    await processAnnouncements(db, new Date(when.getTime() + 60_000));
    expect(await inbox(c.id)).toHaveLength(0); // switched off
    await db.announcementSettings.update({ where: { id: 'default' }, data: { enabled: true } });
    await processAnnouncements(db, new Date(when.getTime() + 60_000));
    expect(await inbox(c.id)).toHaveLength(1);
  });

  it('CANCEL and TEST: cancelling stops further delivery, and a test goes only to the person testing', async () => {
    const admin = await staff('ADMIN');
    const c = await customer();
    const phone = await db.pushDevice.create({ data: { userId: admin.id, app: 'INSPECTOR', token: `ExponentPushToken[${crypto.randomUUID()}]`, platform: 'android' } });
    const a = await draft(admin);

    const test = await request(app).post(`/api/v2/staff/announcements/${a.id}/test`).set(as(admin.uid));
    expect(test.body).toEqual({ sent: true, pushDevices: 1 });
    expect(await tickets(phone.id)).toHaveLength(1);
    expect(await inbox(c.id)).toHaveLength(0);
    expect(await db.notification.count({ where: { userId: admin.id, eventType: 'PLATFORM_ANNOUNCEMENT_TEST' } })).toBe(1);
    expect((await db.platformAnnouncement.findUnique({ where: { id: a.id } }))!.recipientCount).toBe(0);

    await db.platformAnnouncement.update({ where: { id: a.id }, data: { status: 'SENDING', startedAt: DAYTIME } });
    const cancelled = await request(app).post(`/api/v2/staff/announcements/${a.id}/cancel`).set(as(admin.uid));
    expect(cancelled.body.status).toBe('CANCELLED');
    await processAnnouncements(db, DAYTIME);
    expect(await inbox(c.id)).toHaveLength(0);
    expect((await request(app).post(`/api/v2/staff/announcements/${a.id}/cancel`).set(as(admin.uid))).status).toBe(409);
  });

  it('IMAGE: only a secure https picture is accepted, and it travels with the in-app notification and the push', async () => {
    const admin = await staff('ADMIN');
    const c = await customer();
    const bad = await request(app).post('/api/v2/staff/announcements').set(as(admin.uid)).send({ title: 'Big sale news', body: 'Take a look at what is new.', target: 'HOME', imageUrl: 'http://insecure.example/x.jpg' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('IMAGE_NOT_ALLOWED');
    const picture = 'https://res.cloudinary.com/demo/image/upload/announcements/new-cars.jpg';
    const a = await draft(admin, { title: 'New cars have arrived', imageUrl: picture, target: 'HOME' });
    expect(a.imageUrl).toBe(picture);
    // it can be removed again
    const removed = await request(app).patch(`/api/v2/staff/announcements/${a.id}`).set(as(admin.uid)).send({ title: 'New cars have arrived', body: 'Fresh certified cars just arrived. Take a look.', target: 'HOME', imageUrl: null });
    expect(removed.body.imageUrl).toBeNull();
    await request(app).patch(`/api/v2/staff/announcements/${a.id}`).set(as(admin.uid)).send({ title: 'New cars have arrived', body: 'Fresh certified cars just arrived. Take a look.', target: 'HOME', imageUrl: picture, city });

    await db.platformAnnouncement.update({ where: { id: a.id }, data: { status: 'SENDING', startedAt: DAYTIME } });
    await processAnnouncements(db, DAYTIME);
    const row = (await inbox(c.id))[0]!;
    expect(row.metadata).toMatchObject({ imageUrl: picture });
    expect((await tickets(c.device!.id))[0]!.data).toMatchObject({ imageUrl: picture, type: 'PLATFORM_ANNOUNCEMENT' });
    expect((await request(app).get(`/api/v2/staff/announcements/${a.id}`).set(as(admin.uid))).body.imageUrl).toBe(picture);
  });

  it('OPTIONS: the city and car dropdowns list supported cities with their opted-in customers and published cars; unknown cities are refused', async () => {
    const admin = await staff('ADMIN');
    await customer(); await customer(); await customer({ consent: false });
    const options = (await request(app).get('/api/v2/staff/announcements/options').set(as(admin.uid))).body;
    expect(options.cities).toContainEqual({ name: city, recipients: 2 });
    expect(Array.isArray(options.listings)).toBe(true);
    const typo = await request(app).post('/api/v2/staff/announcements').set(as(admin.uid)).send({ title: 'Hello there', body: 'A fine body for it', target: 'HOME', city: 'Atlantis' });
    expect(typo.status).toBe(400);
    expect(typo.body.code).toBe('CITY_NOT_SUPPORTED');
    // case does not matter for a real city
    expect((await draft(admin, { city: city.toUpperCase() })).id).toBeTruthy();
  });
});
