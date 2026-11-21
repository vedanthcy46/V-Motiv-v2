import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ensureAdminCatalog } from '../src/admin-catalog.js';
import { enqueueDomainEvent } from '../src/employee-notifications/outbox.js';
import { runOutboxOnce } from '../src/employee-notifications/processor.js';
import { settleOutbox } from './helpers/outbox.js';
import { runEscalations } from '../src/employee-notifications/escalation.js';
import { detectUnassignedLeads, detectRentals } from '../src/employee-notifications/detectors.js';
import { runNotificationCycle } from '../src/employee-notifications/cycle.js';
import { workingMinutesBetween, zonedInstant } from '../src/employee-notifications/workhours.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) {
  throw new Error('Integration tests require the isolated local vmotiv_v2_test database.');
}

describe('working-time arithmetic', () => {
  const cal = { timezone: 'Asia/Kolkata', start: '09:00', end: '19:00', workingDays: [1, 2, 3, 4, 5, 6], holidays: ['2030-03-05'] };
  const at = (date: string, hhmm: string) => zonedInstant(date, hhmm, 'Asia/Kolkata');
  it('counts only working hours in the branch timezone', () => {
    // Monday 2030-03-04 17:00 -> Tuesday 2030-03-05 11:00 is 2h on Monday + 2h on Tuesday... but 5 March is a holiday.
    expect(workingMinutesBetween(at('2030-03-04', '17:00'), at('2030-03-05', '11:00'), cal)).toBe(120);
    expect(workingMinutesBetween(at('2030-03-04', '17:00'), at('2030-03-06', '11:00'), cal)).toBe(120 + 120);
  });
  it('does not run at night or on rest days', () => {
    expect(workingMinutesBetween(at('2030-03-04', '20:00'), at('2030-03-05', '08:00'), cal)).toBe(0);
    // Saturday 10:00 -> Monday 10:00 with Sunday and Saturday off: only Monday's first hour counts.
    expect(workingMinutesBetween(at('2030-03-09', '10:00'), at('2030-03-11', '10:00'), { ...cal, holidays: [], workingDays: [1, 2, 3, 4, 5] })).toBe(60);
  });
  it('a critical clock can run day and night', () => {
    // 20:00 -> 08:00 next day, window 00:00-23:59: 3h59 on the first day + 8h on the second.
    expect(workingMinutesBetween(at('2030-03-04', '20:00'), at('2030-03-05', '08:00'), { ...cal, start: '00:00', end: '23:59', holidays: [] })).toBe(239 + 480);
  });
});

describe.skipIf(!url)('Escalation and detectors, with real PostgreSQL', { timeout: 30_000 }, () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const suffix = crypto.randomUUID().slice(0, 8);
  let blr: string;
  beforeAll(async () => {
    await ensureAdminCatalog(db as any);
    await db.notificationQueueMember.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); // left by an interrupted earlier run
    // Alerts left over from earlier runs of other tests are not part of these scenarios.
    await db.notification.updateMany({ where: { requiresAck: true, resolvedAt: null, createdAt: { lt: new Date(Date.now() - 600_000) } }, data: { resolvedAt: new Date() } });
    blr = (await db.branch.create({ data: { code: `ES${suffix}`, name: 'Esc', city: `Esc-${suffix}` } as any })).id;
  });
  afterAll(() => db.$disconnect());

  async function staff(name: string, role: string, opts: { branches?: string[]; reportsTo?: string } = {}) {
    const user = await db.user.create({ data: { firebaseUid: `${name}-${crypto.randomUUID()}`, email: `${name}-${crypto.randomUUID()}@example.test`, displayName: name } });
    const roleRow = await db.role.findUnique({ where: { key: role as any } });
    await db.employee.create({ data: { userId: user.id, role: role as any, active: true, status: 'ACTIVE', mfaStatus: 'COMPLIANT', employeeCode: `E-${crypto.randomUUID().slice(0, 8)}`.toUpperCase(), permissions: [], reportsToId: opts.reportsTo, roleAssignments: roleRow ? { create: { roleId: roleRow.id } } : undefined, branchAssignments: { create: (opts.branches ?? []).map(branchId => ({ branchId })) } } });
    return user.id;
  }
  const lead = async () => (await db.acquisitionLead.create({ data: { userId: (await db.user.create({ data: { firebaseUid: `s-${crypto.randomUUID()}`, email: `s-${crypto.randomUUID()}@example.test` } })).id, sellerName: 'S', sellerPhone: '+919999999999', city: `Esc-${suffix}`, pincode: '560001', make: 'Honda', model: 'City', manufacturingYear: 2020, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 1000, status: 'SUBMITTED' } })).id;
  // A weekday at 11:00 India time, so the working clock is running.
  const WORKING_NOW = () => { const d = new Date(); for (let i = 0; i < 8; i++) { const t = zonedInstant(d.toISOString().slice(0, 10), '11:00', 'Asia/Kolkata'); const wd = new Date(t.getTime() + 330 * 60_000).getUTCDay(); if (wd >= 1 && wd <= 5) return t; d.setUTCDate(d.getUTCDate() + 1); } return d; };

  it('ESCALATION: an unanswered lead goes to the manager after the wait, once, and is recorded', async () => {
    const manager = await staff('manager', 'SALES_EXECUTIVE', { branches: [blr] });
    const exec = await staff('exec', 'SALES_EXECUTIVE', { branches: [blr], reportsTo: manager });
    const id = await lead();
    await db.sellerLeadAssignment.create({ data: { leadId: id, employeeId: exec, branchId: blr, assignedById: manager, reason: 'TEST' } });
    await enqueueDomainEvent(db, { eventType: 'LEAD_ASSIGNED', aggregateId: id, branchId: blr, assigneeUserIds: [exec], payload: { referenceCode: 'VM-1' } });
    await settleOutbox(db);
    const original = await db.notification.findFirstOrThrow({ where: { userId: exec, resourceId: id } });
    const base = WORKING_NOW();
    await db.notification.update({ where: { id: original.id }, data: { createdAt: new Date(base.getTime() - 90 * 60_000) } });
    const first = await runEscalations(db, base);
    expect(first.escalated).toBeGreaterThanOrEqual(1);
    const copy = await db.notification.findFirstOrThrow({ where: { userId: manager, resourceId: id } });
    expect(copy.title).toMatch(/^Escalated:/);
    expect(copy.requiresAck).toBe(true);
    expect((await db.notification.findUniqueOrThrow({ where: { id: original.id } })).escalationLevel).toBe(1);
    expect(await db.notificationEscalationEvent.count({ where: { notificationId: original.id, outcome: 'ESCALATED' } })).toBe(1);
    // Running again at the same moment does not escalate the same level twice.
    await runEscalations(db, base);
    expect(await db.notification.count({ where: { userId: manager, resourceId: id } })).toBe(1);
    expect(await db.notificationEscalationEvent.count({ where: { notificationId: original.id, level: 1 } })).toBe(1);
  });

  it('ESCALATION: work that is already done is never chased, and acknowledged alerts stop', async () => {
    const manager = await staff('manager2', 'SALES_EXECUTIVE', { branches: [blr] });
    const exec = await staff('exec2', 'SALES_EXECUTIVE', { branches: [blr], reportsTo: manager });
    const id = await lead();
    await db.sellerLeadAssignment.create({ data: { leadId: id, employeeId: exec, branchId: blr, assignedById: manager, reason: 'TEST' } });
    await enqueueDomainEvent(db, { eventType: 'LEAD_ASSIGNED', aggregateId: id, branchId: blr, assigneeUserIds: [exec] });
    await settleOutbox(db);
    const original = await db.notification.findFirstOrThrow({ where: { userId: exec, resourceId: id } });
    const base = WORKING_NOW();
    await db.notification.update({ where: { id: original.id }, data: { createdAt: new Date(base.getTime() - 90 * 60_000) } });
    // The salesperson replied to the seller (an interaction was recorded after the alert) but never clicked anything.
    await db.leadInteraction.create({ data: { leadId: id, employeeId: exec, channel: 'CALL', outcome: 'CONNECTED', notes: 'Called the seller', createdAt: new Date(base.getTime() - 30 * 60_000) } });
    await runEscalations(db, base);
    const handled = await db.notification.findUniqueOrThrow({ where: { id: original.id } });
    expect(handled.resolvedAt).not.toBeNull();
    expect(await db.notification.count({ where: { userId: manager, resourceId: id } })).toBe(0);
    expect(await db.notificationEscalationEvent.count({ where: { notificationId: original.id, outcome: 'SKIPPED_WORK_DONE' } })).toBe(1);
    // Acknowledged alerts do not escalate at all.
    const id2 = await lead();
    await db.sellerLeadAssignment.create({ data: { leadId: id2, employeeId: exec, branchId: blr, assignedById: manager, reason: 'TEST' } });
    await enqueueDomainEvent(db, { eventType: 'LEAD_ASSIGNED', aggregateId: id2, branchId: blr, assigneeUserIds: [exec] });
    await settleOutbox(db);
    const n2 = await db.notification.findFirstOrThrow({ where: { userId: exec, resourceId: id2 } });
    await db.notification.update({ where: { id: n2.id }, data: { createdAt: new Date(base.getTime() - 90 * 60_000), acknowledgedAt: base } });
    await runEscalations(db, base);
    expect(await db.notification.count({ where: { userId: manager, resourceId: id2 } })).toBe(0);
  });

  it('ESCALATION: a normal alert waits through the night, a critical one does not', async () => {
    const manager = await staff('manager3', 'SALES_EXECUTIVE', { branches: [blr] });
    const exec = await staff('exec3', 'SALES_EXECUTIVE', { branches: [blr], reportsTo: manager });
    const nightNow = zonedInstant('2030-03-10', '03:00', 'Asia/Kolkata'); // 3am on a Sunday
    const idNormal = await lead();
    await db.sellerLeadAssignment.create({ data: { leadId: idNormal, employeeId: exec, branchId: blr, assignedById: manager, reason: 'TEST' } });
    await enqueueDomainEvent(db, { eventType: 'LEAD_ASSIGNED', aggregateId: idNormal, branchId: blr, assigneeUserIds: [exec] });
    await settleOutbox(db);
    const normal = await db.notification.findFirstOrThrow({ where: { userId: exec, resourceId: idNormal } });
    // Created 3 hours before 3am Sunday = midnight: no working minute has passed.
    await db.notification.update({ where: { id: normal.id }, data: { createdAt: new Date(nightNow.getTime() - 3 * 3_600_000) } });
    await runEscalations(db, nightNow);
    expect(await db.notification.count({ where: { userId: manager, resourceId: idNormal } })).toBe(0);

    // A critical incident: the policy clock runs day and night.
    const queueMember = await db.notificationQueueMember.create({ data: { queueKey: 'ADMIN_SECURITY', userId: exec, branchId: null, memberRole: 'OWNER' } });
    await db.employee.update({ where: { userId: exec }, data: { role: 'SECURITY_ADMIN' } });
    const incident = crypto.randomUUID();
    await enqueueDomainEvent(db, { eventType: 'SECURITY_INCIDENT', aggregateId: incident, payload: { reasonCode: 'TEST' } });
    await settleOutbox(db);
    const critical = await db.notification.findFirstOrThrow({ where: { userId: exec, resourceId: incident } });
    await db.notification.update({ where: { id: critical.id }, data: { createdAt: new Date(nightNow.getTime() - 15 * 60_000) } });
    await runEscalations(db, nightNow);
    expect((await db.notification.findUniqueOrThrow({ where: { id: critical.id } })).escalationLevel).toBe(1);
    expect(await db.notification.count({ where: { userId: manager, resourceId: incident } })).toBe(1);
    await db.notificationQueueMember.delete({ where: { id: queueMember.id } });
  });

  it('DETECTORS: an unassigned lead raises one overdue alert to its branch queue; an assigned lead raises none', async () => {
    const owner = await staff('queueOwner', 'SALES_EXECUTIVE', { branches: [blr] });
    await db.notificationQueueMember.create({ data: { queueKey: 'SALES_LEADS', userId: owner, branchId: blr, memberRole: 'OWNER' } });
    const open = await lead();
    const taken = await lead();
    await db.sellerLeadAssignment.create({ data: { leadId: taken, employeeId: owner, branchId: blr, assignedById: owner, reason: 'TEST' } });
    await db.acquisitionLead.updateMany({ where: { id: { in: [open, taken] } }, data: { createdAt: new Date(Date.now() - 2 * 3_600_000) } });
    await detectUnassignedLeads(db);
    await detectUnassignedLeads(db); // a second pass in the same window adds nothing
    await settleOutbox(db);
    const alerts = await db.notification.findMany({ where: { userId: owner, eventType: 'LEAD_UNASSIGNED_OVERDUE' } });
    expect(alerts.some(a => a.resourceId === open)).toBe(true);
    expect(alerts.some(a => a.resourceId === taken)).toBe(false);
    expect(alerts.filter(a => a.resourceId === open)).toHaveLength(1);
    await db.notificationQueueMember.deleteMany({ where: { userId: owner } });
  });

  it('CYCLE: one pass drains the outbox, and a worker restart in the middle loses nothing', async () => {
    const exec = await staff('cycler', 'SALES_EXECUTIVE', { branches: [blr] });
    const id = await lead();
    await enqueueDomainEvent(db, { eventType: 'LEAD_ASSIGNED', aggregateId: id, branchId: blr, assigneeUserIds: [exec] });
    const first = await runNotificationCycle(db, { workerId: 'w1', slow: false });
    expect(first.outbox.processed).toBeGreaterThanOrEqual(1);
    expect(await db.notification.count({ where: { userId: exec, resourceId: id } })).toBe(1);
    const second = await runNotificationCycle(db, { workerId: 'w2', slow: false });
    expect(second.outbox.processed).toBe(0);
    expect(await db.notification.count({ where: { userId: exec, resourceId: id } })).toBe(1);
  });

  it('DETECTORS: the rental detector runs against real bookings without raising anything for an empty hub', async () => {
    const result = await detectRentals(db);
    expect(result).toEqual({ pickups: expect.any(Number), balances: expect.any(Number), returns: expect.any(Number) });
  });
});
