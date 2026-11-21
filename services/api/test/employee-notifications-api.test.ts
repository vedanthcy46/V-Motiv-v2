import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ensureAdminCatalog } from '../src/admin-catalog.js';
import { createEmployeeNotificationRouter } from '../src/employee-notifications/router.js';
import { enqueueDomainEvent } from '../src/employee-notifications/outbox.js';
import { runOutboxOnce } from '../src/employee-notifications/processor.js';
import { settleOutbox } from './helpers/outbox.js';
import { invalidateEmployeeDevices } from '../src/employee-notifications/inbox.js';
import { resolveNotificationsForResource } from '../src/employee-notifications/resolve.js';
import { HttpError } from '../src/errors.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) {
  throw new Error('Integration tests require the isolated local vmotiv_v2_test database.');
}

describe.skipIf(!url)('Employee notification API, with real PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const suffix = crypto.randomUUID().slice(0, 8);
  let blr: string; let mys: string;
  const verify = async (token: string) => ({ uid: token, email: `${token}@example.test`, email_verified: true, name: token, firebase: { sign_in_provider: 'google.com' } }) as any;
  const app = express();
  app.use(express.json());
  app.use('/api/v2', createEmployeeNotificationRouter({ verify, db, streamPollMs: 40, streamMaxMs: 600 }));
  app.use((err: any, _req: any, res: any, _next: any) => res.status(err instanceof HttpError ? err.status : 400).json({ code: err.code ?? 'BAD_REQUEST', message: err.message }));

  beforeAll(async () => {
    await ensureAdminCatalog(db as any);
    await db.notificationQueueMember.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); // left by an interrupted earlier run
    blr = (await db.branch.create({ data: { code: `BA${suffix}`, name: 'Blr', city: `Blr-${suffix}` } as any })).id;
    mys = (await db.branch.create({ data: { code: `MA${suffix}`, name: 'Mys', city: `Mys-${suffix}` } as any })).id;
  });
  afterAll(() => db.$disconnect());

  async function staff(role: string, opts: { branches?: string[]; permissions?: string[]; status?: 'ACTIVE' | 'SUSPENDED' } = {}) {
    const uid = `u-${crypto.randomUUID()}`;
    const user = await db.user.create({ data: { firebaseUid: uid, email: `${uid}@example.test`, displayName: uid } });
    const roleRow = await db.role.findUnique({ where: { key: role as any } });
    await db.employee.create({ data: { userId: user.id, role: role as any, active: (opts.status ?? 'ACTIVE') === 'ACTIVE', status: opts.status ?? 'ACTIVE', mfaStatus: 'COMPLIANT', employeeCode: `E-${crypto.randomUUID().slice(0, 8)}`.toUpperCase(), permissions: opts.permissions ?? [], roleAssignments: roleRow ? { create: { roleId: roleRow.id } } : undefined, branchAssignments: { create: (opts.branches ?? []).map(branchId => ({ branchId })) } } });
    return { uid, id: user.id };
  }
  const as = (uid: string) => ({ Authorization: `Bearer ${uid}` });
  const give = async (assignee: string, branchId: string, resourceId = crypto.randomUUID()) => {
    await enqueueDomainEvent(db, { eventType: 'LEAD_ASSIGNED', aggregateId: resourceId, branchId, assigneeUserIds: [assignee], payload: { referenceCode: 'VM-ACQ-7', vehicle: 'Honda City' }, dedupKey: `api-${resourceId}-${assignee}` });
    await settleOutbox(db);
    return resourceId;
  };

  it('requires a signed-in ACTIVE employee: no token, a customer, and a suspended employee are all refused', async () => {
    expect((await request(app).get('/api/v2/employees/me/notifications')).status).toBe(401);
    const customer = await db.user.create({ data: { firebaseUid: `c-${crypto.randomUUID()}`, email: `c-${crypto.randomUUID()}@example.test` } });
    expect((await request(app).get('/api/v2/employees/me/notifications').set(as(customer.firebaseUid))).body.code).toBe('EMPLOYEE_REQUIRED');
    const suspended = await staff('SALES_EXECUTIVE', { branches: [blr], status: 'SUSPENDED' });
    expect((await request(app).get('/api/v2/employees/me/notifications').set(as(suspended.uid))).status).toBe(403);
  });

  it('lists only my own notifications, with my counts, and the branches I may filter by', async () => {
    const a = await staff('SALES_EXECUTIVE', { branches: [blr] });
    const b = await staff('SALES_EXECUTIVE', { branches: [blr] });
    await give(a.id, blr); await give(b.id, blr);
    const res = await request(app).get('/api/v2/employees/me/notifications').set(as(a.uid));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.unreadCount).toBe(1);
    expect(res.body.actionRequiredCount).toBe(1);
    expect(res.body.branches.map((x: any) => x.id)).toEqual([blr]);
    expect(res.body.items[0]).toMatchObject({ module: 'SALES', severity: 'ACTION_REQUIRED', portal: 'sales', actionable: true });
  });

  it('SECURITY: another branch\'s filter is denied, and another employee\'s notification cannot be read, marked or acknowledged', async () => {
    const a = await staff('SALES_EXECUTIVE', { branches: [blr] });
    const b = await staff('SALES_EXECUTIVE', { branches: [blr] });
    await give(b.id, blr);
    const theirs = (await request(app).get('/api/v2/employees/me/notifications').set(as(b.uid))).body.items[0].id;
    expect((await request(app).get(`/api/v2/employees/me/notifications?branchId=${mys}`).set(as(a.uid))).body.code).toBe('BRANCH_NOT_AUTHORISED');
    expect((await request(app).patch(`/api/v2/employees/me/notifications/${theirs}/read`).set(as(a.uid))).status).toBe(404);
    expect((await request(app).post(`/api/v2/employees/me/notifications/${theirs}/acknowledge`).set(as(a.uid))).status).toBe(404);
    expect((await request(app).get(`/api/v2/employees/me/notifications/${theirs}/open`).set(as(a.uid))).status).toBe(404);
    // The client may not name an employee at all.
    expect((await request(app).get(`/api/v2/employees/me/notifications?userId=${b.id}`).set(as(a.uid))).status).toBe(400);
  });

  it('marking read or acknowledging changes the inbox only, never the lead behind it', async () => {
    const a = await staff('SALES_EXECUTIVE', { branches: [blr] });
    const seller = await db.user.create({ data: { firebaseUid: `s-${crypto.randomUUID()}`, email: `s-${crypto.randomUUID()}@example.test` } });
    const lead = await db.acquisitionLead.create({ data: { userId: seller.id, sellerName: 'S', sellerPhone: '+919999999999', city: `Blr-${suffix}`, pincode: '560001', make: 'Honda', model: 'City', manufacturingYear: 2020, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 1000, status: 'SUBMITTED' } });
    await give(a.id, blr, lead.id);
    const id = (await request(app).get('/api/v2/employees/me/notifications').set(as(a.uid))).body.items[0].id;
    expect((await request(app).patch(`/api/v2/employees/me/notifications/${id}/read`).set(as(a.uid))).body.read).toBe(true);
    const acked = await request(app).post(`/api/v2/employees/me/notifications/${id}/acknowledge`).set(as(a.uid));
    expect(acked.body.acknowledgedAt).not.toBeNull();
    expect((await db.acquisitionLead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe('SUBMITTED');
    expect(await db.auditEvent.count({ where: { action: 'NOTIFICATION_ACKNOWLEDGED', entityId: id } })).toBe(1);
    expect((await request(app).get('/api/v2/employees/me/notifications/unread-count').set(as(a.uid))).body).toMatchObject({ count: 0, actionRequired: 0 });
    // A notification that needs no acknowledgement cannot be acknowledged.
    await enqueueDomainEvent(db, { eventType: 'FINANCE_PAYOUT_VERIFIED', aggregateId: crypto.randomUUID(), branchId: blr, assigneeUserIds: [a.id] });
    await settleOutbox(db);
    const info = (await request(app).get('/api/v2/employees/me/notifications?severity=INFORMATIONAL').set(as(a.uid))).body.items[0];
    expect((await request(app).post(`/api/v2/employees/me/notifications/${info.id}/acknowledge`).set(as(a.uid))).body.code).toBe('ACKNOWLEDGEMENT_NOT_REQUIRED');
  });

  it('OPEN: a click is re-authorised: reassigned, branch revoked, resolved and employment ended are each handled', async () => {
    const a = await staff('SALES_EXECUTIVE', { branches: [blr] });
    const b = await staff('SALES_EXECUTIVE', { branches: [blr] });
    const lead = await db.acquisitionLead.create({ data: { userId: (await db.user.create({ data: { firebaseUid: `s-${crypto.randomUUID()}`, email: `s-${crypto.randomUUID()}@example.test` } })).id, sellerName: 'S', sellerPhone: '+919999999999', city: `Blr-${suffix}`, pincode: '560001', make: 'Honda', model: 'City', manufacturingYear: 2020, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 1000, status: 'SUBMITTED' } });
    await db.sellerLeadAssignment.create({ data: { leadId: lead.id, employeeId: a.id, branchId: blr, assignedById: a.id, reason: 'TEST' } });
    await give(a.id, blr, lead.id);
    const id = (await request(app).get('/api/v2/employees/me/notifications').set(as(a.uid))).body.items[0].id;
    const open = () => request(app).get(`/api/v2/employees/me/notifications/${id}/open`).set(as(a.uid));
    expect((await open()).body).toMatchObject({ allowed: true, actionRoute: `/seller-leads/${lead.id}`, portal: 'sales' });
    // The lead is reassigned in the business module: the old owner's link stops working.
    await db.sellerLeadAssignment.updateMany({ where: { leadId: lead.id }, data: { releasedAt: new Date() } });
    await db.sellerLeadAssignment.create({ data: { leadId: lead.id, employeeId: b.id, branchId: blr, assignedById: b.id, reason: 'TEST' } });
    expect((await open()).body).toMatchObject({ allowed: false, reason: 'REASSIGNED' });
    // Work completed: resolved.
    const done = await request(app).get('/api/v2/employees/me/notifications').set(as(b.uid));
    expect(done.body.items).toHaveLength(0);
    await db.sellerLeadAssignment.updateMany({ where: { leadId: lead.id, employeeId: b.id }, data: { releasedAt: new Date() } });
    await db.sellerLeadAssignment.create({ data: { leadId: lead.id, employeeId: a.id, branchId: blr, assignedById: a.id, reason: 'TEST' } });
    await resolveNotificationsForResource(db, 'AcquisitionLead', lead.id);
    expect((await open()).body).toMatchObject({ allowed: false, reason: 'RESOLVED' });
    // Employment ended.
    await db.employee.update({ where: { userId: a.id }, data: { active: false, status: 'SUSPENDED' } });
    expect((await open()).status).toBe(403);
  });

  it('branch authorisation is checked live for queue-style alerts', async () => {
    const owner = await staff('RENTAL_MANAGER', { branches: [blr] });
    await db.notificationQueueMember.create({ data: { queueKey: 'OPS_RENTALS', userId: owner.id, branchId: blr, memberRole: 'OWNER' } });
    await enqueueDomainEvent(db, { eventType: 'RENTAL_RETURN_OVERDUE', aggregateId: crypto.randomUUID(), branchId: blr, payload: { referenceCode: 'VMR-9' } });
    await settleOutbox(db);
    const id = (await request(app).get('/api/v2/employees/me/notifications').set(as(owner.uid))).body.items[0].id;
    expect((await request(app).get(`/api/v2/employees/me/notifications/${id}/open`).set(as(owner.uid))).body.allowed).toBe(true);
    await db.employeeBranchAssignment.deleteMany({ where: { employeeId: owner.id } });
    expect((await request(app).get(`/api/v2/employees/me/notifications/${id}/open`).set(as(owner.uid))).body).toMatchObject({ allowed: false, reason: 'NO_LONGER_AUTHORISED' });
    await db.notificationQueueMember.deleteMany({ where: { userId: owner.id } });
  });

  it('preferences are validated, informational alerts can be muted, and critical alerts cannot', async () => {
    const a = await staff('SALES_EXECUTIVE', { branches: [blr] });
    expect((await request(app).patch('/api/v2/employees/me/notification-preferences').set(as(a.uid)).send({ quietHoursStart: '25:00' })).body.code).toBe('INVALID_QUIET_HOURS');
    expect((await request(app).patch('/api/v2/employees/me/notification-preferences').set(as(a.uid)).send({ mutedModules: ['NOPE'] })).body.code).toBe('INVALID_MODULE');
    const saved = await request(app).patch('/api/v2/employees/me/notification-preferences').set(as(a.uid)).send({ mutedModules: ['FINANCE'], digestFrequency: 'DAILY', pushEnabled: false });
    expect(saved.body).toMatchObject({ mutedModules: ['FINANCE'], digestFrequency: 'DAILY', pushEnabled: false });
    await enqueueDomainEvent(db, { eventType: 'FINANCE_PAYOUT_VERIFIED', aggregateId: crypto.randomUUID(), branchId: blr, assigneeUserIds: [a.id] });
    await settleOutbox(db);
    expect((await request(app).get('/api/v2/employees/me/notifications?module=FINANCE').set(as(a.uid))).body.items).toHaveLength(0);
    await db.notificationPreference.update({ where: { userId: a.id }, data: { mutedModules: ['ADMIN', 'FINANCE', 'SALES', 'OPERATIONS', 'INSPECTION'] } });
    const resp = await staff('ADMIN', { branches: [] });
    await db.notificationQueueMember.create({ data: { queueKey: 'ADMIN_SECURITY', userId: a.id, branchId: null, memberRole: 'OWNER' } });
    await db.employee.update({ where: { userId: a.id }, data: { role: 'SECURITY_ADMIN' } });
    await enqueueDomainEvent(db, { eventType: 'SECURITY_INCIDENT', aggregateId: crypto.randomUUID(), payload: { reasonCode: 'TEST' } });
    await settleOutbox(db);
    expect((await request(app).get('/api/v2/employees/me/notifications?severity=CRITICAL').set(as(a.uid))).body.items.length).toBeGreaterThan(0);
    await db.notificationQueueMember.deleteMany({ where: { userId: a.id } });
    void resp;
  });

  it('devices: register for me only, reject bad tokens, hand a token over between employees, and release them all on suspension', async () => {
    const a = await staff('INSPECTOR', { branches: [blr] });
    const b = await staff('INSPECTOR', { branches: [blr] });
    const token = `ExponentPushToken[${crypto.randomUUID()}]`;
    expect((await request(app).post('/api/v2/employees/me/notification-devices').set(as(a.uid)).send({ token: 'nope-nope-nope', app: 'INSPECTOR', platform: 'android' })).body.code).toBe('INVALID_EXPO_PUSH_TOKEN');
    const first = await request(app).post('/api/v2/employees/me/notification-devices').set(as(a.uid)).send({ token, app: 'INSPECTOR', platform: 'android', installationId: 'inst-1' });
    expect(first.status).toBe(201);
    // The same phone signs in as a different employee: the first employee must stop receiving its pushes.
    await request(app).post('/api/v2/employees/me/notification-devices').set(as(b.uid)).send({ token, app: 'INSPECTOR', platform: 'android', installationId: 'inst-1' });
    expect(await db.pushDevice.count({ where: { userId: a.id, active: true } })).toBe(0);
    expect(await db.pushDevice.count({ where: { userId: b.id, active: true } })).toBe(1);
    // Another employee cannot remove it.
    const deviceId = (await db.pushDevice.findFirstOrThrow({ where: { userId: b.id } })).id;
    expect((await request(app).delete(`/api/v2/employees/me/notification-devices/${deviceId}`).set(as(a.uid))).status).toBe(404);
    // Suspension releases every device.
    expect(await invalidateEmployeeDevices(db, b.id)).toBe(1);
    expect(await db.pushDevice.count({ where: { userId: b.id, active: true } })).toBe(0);
  });

  it('STREAM: delivers a new notification live and ends when the employee is no longer authorised', async () => {
    const a = await staff('SALES_EXECUTIVE', { branches: [blr] });
    const server = http.createServer(app).listen(0);
    const port = (server.address() as AddressInfo).port;
    try {
      const controller = new AbortController();
      const response = await fetch(`http://127.0.0.1:${port}/api/v2/employees/me/notifications/stream`, { headers: as(a.uid), signal: controller.signal });
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      const reader = response.body!.getReader();
      let text = '';
      const read = async (until: RegExp) => { const stop = Date.now() + 3000; while (Date.now() < stop && !until.test(text)) { const { value, done } = await reader.read(); if (done) break; text += new TextDecoder().decode(value); } };
      await read(/event: ready/);
      await give(a.id, blr);
      await read(/event: notification/);
      expect(text).toMatch(/event: notification/);
      expect(text).toMatch(/seller lead is assigned to you/);
      await db.employee.update({ where: { userId: a.id }, data: { active: false, status: 'SUSPENDED' } });
      await read(/event: end/);
      expect(text).toMatch(/NOT_AUTHORISED/);
      controller.abort();
    } finally { server.close(); }
  });

  it('ADMIN: governance needs its permission; health reports the pipeline; the Activity Monitor is scoped, safe and separate from alerts', async () => {
    const plain = await staff('SALES_EXECUTIVE', { branches: [blr] });
    const root = await staff('SUPER_ADMIN');
    expect((await request(app).get('/api/v2/admin/notification-health').set(as(plain.uid))).body.code).toBe('PERMISSION_DENIED');
    expect((await request(app).get('/api/v2/admin/activity-monitor').set(as(plain.uid))).body.code).toBe('PERMISSION_DENIED');
    const health = await request(app).get('/api/v2/admin/notification-health').set(as(root.uid));
    expect(health.status).toBe(200);
    expect(health.body).toHaveProperty('outbox');
    expect(health.body.catalog.total).toBeGreaterThan(30);
    const routing = await request(app).get('/api/v2/admin/notification-routing').set(as(root.uid));
    expect(routing.body.events.find((e: any) => e.eventType === 'LEAD_ASSIGNED')).toMatchObject({ module: 'SALES', policyVersion: 0 });
    expect(routing.body.queues.map((q: any) => q.queueKey)).toContain('ADMIN_SECURITY');

    // Activity Monitor: a branch-bound auditor sees only their branch's events, never another branch's, and no sensitive details.
    const auditor = await staff('AUDIT_VIEWER', { branches: [blr], permissions: ['audit.read'] });
    const marker = crypto.randomUUID();
    await db.auditEvent.create({ data: { actorId: root.id, action: 'SELLER_LEAD_CLAIMED', entityType: 'AcquisitionLead', entityId: marker, details: { branchId: blr, referenceCode: 'VM-ACQ-5', sellerPhone: '+919876543210', reason: 'private text' } } });
    await db.auditEvent.create({ data: { actorId: root.id, action: 'SELLER_LEAD_CLAIMED', entityType: 'AcquisitionLead', entityId: `${marker}-other`, details: { branchId: mys, referenceCode: 'VM-ACQ-6' } } });
    const seen = await request(app).get(`/api/v2/admin/activity-monitor?domain=SALES&limit=100`).set(as(auditor.uid));
    expect(seen.status).toBe(200);
    expect(seen.body.items.some((i: any) => i.entityId === marker)).toBe(true);
    expect(seen.body.items.some((i: any) => i.entityId === `${marker}-other`)).toBe(false);
    const mine = seen.body.items.find((i: any) => i.entityId === marker);
    expect(JSON.stringify(mine)).not.toMatch(/9876543210|private text/);
    expect(mine.details).toMatchObject({ referenceCode: 'VM-ACQ-5', branchId: blr });
    expect((await request(app).get(`/api/v2/admin/activity-monitor?branchId=${mys}`).set(as(auditor.uid))).body.code).toBe('BRANCH_NOT_AUTHORISED');
    // Reading the monitor created no notification for anyone.
    expect(await db.domainOutboxEvent.count({ where: { aggregateId: marker } })).toBe(0);
  });

  it('ADMIN: queue owners are managed with a permission and an audit trail, and a policy change cannot widen scope', async () => {
    const root = await staff('SUPER_ADMIN');
    const rental = await staff('RENTAL_MANAGER', { branches: [blr] });
    const outsider = await staff('RENTAL_MANAGER', { branches: [mys] });
    const plain = await staff('SALES_EXECUTIVE', { branches: [blr] });
    expect((await request(app).post('/api/v2/admin/notification-queues').set(as(plain.uid)).send({ queueKey: 'OPS_RENTALS', userId: rental.id, branchId: blr, memberRole: 'OWNER' })).status).toBe(403);
    // An owner of Bengaluru's queue must actually work in Bengaluru.
    expect((await request(app).post('/api/v2/admin/notification-queues').set(as(root.uid)).send({ queueKey: 'OPS_RENTALS', userId: outsider.id, branchId: blr, memberRole: 'OWNER' })).body.code).toBe('EMPLOYEE_NOT_IN_BRANCH');
    const added = await request(app).post('/api/v2/admin/notification-queues').set(as(root.uid)).send({ queueKey: 'OPS_RENTALS', userId: rental.id, branchId: blr, memberRole: 'OWNER' });
    expect(added.status).toBe(201);
    expect(await db.auditEvent.count({ where: { action: 'NOTIFICATION_QUEUE_MEMBER_SET', entityId: added.body.id } })).toBe(1);
    expect((await request(app).delete(`/api/v2/admin/notification-queues/${added.body.id}`).set(as(root.uid))).body.removed).toBe(true);
    const widen = await request(app).put('/api/v2/admin/notification-routing/LEAD_ASSIGNED').set(as(root.uid)).send({ branchScope: 'GLOBAL' });
    expect(widen.body.code).toBe('POLICY_WIDENS_BRANCH_SCOPE');
  });
});
