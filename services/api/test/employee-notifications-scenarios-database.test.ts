import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ensureAdminCatalog } from '../src/admin-catalog.js';
import { enqueueDomainEvent } from '../src/employee-notifications/outbox.js';
import { updatePreferences } from '../src/employee-notifications/inbox.js';
import { processEmail, type EmailSender } from '../src/email.js';
import { settleOutbox } from './helpers/outbox.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) {
  throw new Error('Integration tests require the isolated local vmotiv_v2_test database.');
}

// End-to-end scenarios from the specification, against a real database. External providers are not called: Expo and Resend are
// represented by the queue rows this system writes and, for email, by the real outbox processor with a recording sender.
describe.skipIf(!url)('Employee notification scenarios, with real PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const suffix = crypto.randomUUID().slice(0, 8);
  let blr: string;
  let mys: string;

  beforeAll(async () => {
    await ensureAdminCatalog(db as any);
    blr = (await db.branch.create({ data: { code: `SB${suffix}`, name: 'Bengaluru', city: `Bengaluru-S-${suffix}` } as any })).id;
    mys = (await db.branch.create({ data: { code: `SM${suffix}`, name: 'Mysuru', city: `Mysuru-S-${suffix}` } as any })).id;
  });
  afterAll(() => db.$disconnect());

  async function staff(name: string, roles: string[], opts: { branches?: string[]; permissions?: string[] } = {}) {
    const user = await db.user.create({ data: { firebaseUid: `${name}-${crypto.randomUUID()}`, email: `${name}-${crypto.randomUUID()}@example.test`, displayName: name } });
    const roleRows = await db.role.findMany({ where: { key: { in: roles } } });
    await db.employee.create({ data: {
      userId: user.id, role: roles[0] as any, active: true, status: 'ACTIVE', mfaStatus: 'COMPLIANT', employeeCode: `E-${crypto.randomUUID().slice(0, 8)}`.toUpperCase(), permissions: opts.permissions ?? [],
      roleAssignments: { create: roleRows.map(row => ({ roleId: row.id })) }, branchAssignments: { create: (opts.branches ?? []).map(branchId => ({ branchId })) },
    } });
    return user.id;
  }
  const inbox = (userId: string) => db.notification.findMany({ where: { userId, eventId: { not: null } }, orderBy: { createdAt: 'asc' } });
  const device = (userId: string) => db.pushDevice.create({ data: { userId, app: 'INSPECTOR', token: `ExponentPushToken[${crypto.randomUUID()}]`, platform: 'android' } });

  it('OPERATIONS -> INSPECTOR: the assigned inspector gets a push with a minimal payload and a job route; another inspector gets nothing', async () => {
    const mine = await staff('inspectorMine', ['INSPECTOR'], { branches: [blr] });
    const other = await staff('inspectorOther', ['INSPECTOR'], { branches: [blr] });
    const phone = await device(mine);
    await device(other);
    const assignment = crypto.randomUUID();
    await enqueueDomainEvent(db, { eventType: 'INSPECTION_ASSIGNED', aggregateId: assignment, branchId: blr, assigneeUserIds: [mine], payload: { vehicle: 'Hyundai i20', slot: '10:00', ownerPhone: '+919811122233', address: '12 MG Road' } });
    await settleOutbox(db);
    const row = (await inbox(mine))[0]!;
    expect(row).toMatchObject({ module: 'INSPECTION', actionRoute: `/inspections/${assignment}`, severity: 'ACTION_REQUIRED' });
    expect(JSON.stringify(row)).not.toMatch(/9811122233|MG Road/);
    const tickets = await db.pushTicket.findMany({ where: { deviceId: phone.id } });
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ status: 'QUEUED' });
    expect(tickets[0]!.data).toEqual({ notificationId: row.id, module: 'INSPECTION', actionRoute: `/inspections/${assignment}`, severity: 'ACTION_REQUIRED' });
    expect(await inbox(other)).toHaveLength(0);
    expect(await db.pushTicket.count({ where: { device: { userId: other } } })).toBe(0);
  });

  it('FINANCE -> OPERATIONS: a blocked pickup tells the branch rental manager only the safe reason, never payment details', async () => {
    const manager = await staff('rentalMgr', ['RENTAL_MANAGER'], { branches: [blr] });
    const otherBranch = await staff('rentalMgrMys', ['RENTAL_MANAGER'], { branches: [mys] });
    const booking = crypto.randomUUID();
    await enqueueDomainEvent(db, { eventType: 'RENTAL_PICKUP_BLOCKED', aggregateId: booking, branchId: blr, payload: { referenceCode: 'RB-1042', reasonCode: 'BALANCE_PENDING', amountPaise: 4500000, utr: 'UTR998877', bankAccount: '00112233' } });
    await settleOutbox(db);
    const rows = await inbox(manager);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toContain('RB-1042');
    expect(rows[0]!.body.toLowerCase()).toContain('balance pending');
    expect(JSON.stringify(rows[0])).not.toMatch(/4500000|UTR998877|00112233/);
    expect(await inbox(otherBranch)).toHaveLength(0);
  });

  it('ADMIN: a routine informational event never pushes or emails; a critical incident and an approval do email, once each', async () => {
    const responder = await staff('incidentOwner', ['ADMIN'], { branches: [] });
    await db.notificationQueueMember.create({ data: { queueKey: 'ADMIN_SECURITY', userId: responder, branchId: null, memberRole: 'OWNER' } });
    const approver = await staff('approver', ['ADMIN'], { branches: [blr], permissions: ['role.assign.privileged'] });
    const phone = await device(responder);

    await enqueueDomainEvent(db, { eventType: 'FINANCE_PAYOUT_VERIFIED', aggregateId: crypto.randomUUID(), branchId: blr, assigneeUserIds: [responder] });
    const incident = crypto.randomUUID();
    await enqueueDomainEvent(db, { eventType: 'SECURITY_INCIDENT', aggregateId: incident, payload: { reasonCode: 'SUSPICIOUS_LOGIN' } });
    const approval = crypto.randomUUID();
    await enqueueDomainEvent(db, { eventType: 'EMPLOYEE_INVITE_APPROVAL', aggregateId: approval, branchId: blr });
    await settleOutbox(db);

    const ownerRows = await inbox(responder);
    const routine = ownerRows.find(row => row.title.toLowerCase().includes('payout'));
    expect(routine).toBeTruthy();
    const routineDeliveries = await db.notificationDelivery.findMany({ where: { notificationId: routine!.id } });
    expect(routineDeliveries.map(item => item.channel)).toEqual(['IN_APP']);

    const critical = ownerRows.find(row => row.severity === 'CRITICAL')!;
    const channels = (await db.notificationDelivery.findMany({ where: { notificationId: critical.id } })).map(item => item.channel).sort();
    expect(channels).toEqual(['EMAIL', 'IN_APP', 'PUSH']);
    expect(await db.pushTicket.count({ where: { deviceId: phone.id, notificationId: critical.id } })).toBe(1);

    const sent: Array<{ to: string; subject: string; text: string; key: string }> = [];
    const recording: EmailSender = async event => { sent.push({ to: event.recipient, subject: event.subject, text: event.text, key: event.eventKey }); return `provider-${crypto.randomUUID()}`; };
    const ownerEmail = (await db.user.findUnique({ where: { id: responder } }))!.email!;
    const approverEmail = (await db.user.findUnique({ where: { id: approver } }))!.email!;
    // The shared test database holds other tests' queued mail, so process exactly this test's rows.
    for (const row of await db.emailOutbox.findMany({ where: { recipient: { in: [ownerEmail, approverEmail] } } })) await processEmail(db, recording, 'alerts@example.test', row.id);
    const mine = sent.filter(item => [ownerEmail, approverEmail].includes(item.to));
    expect(mine.map(item => item.to).sort()).toEqual([ownerEmail, approverEmail].sort());
    expect(mine.every(item => /^emp-notif\//.test(item.key))).toBe(true);
    expect(mine.map(item => item.text).join('\n')).not.toMatch(/SUSPICIOUS_LOGIN/); // reason codes stay out of email
    const stored = await db.emailOutbox.findMany({ where: { recipient: { in: [ownerEmail, approverEmail] } } });
    expect(stored.every(item => item.state === 'ACCEPTED' && item.providerMessageId)).toBe(true);

    // A replay of the same events creates no second email (idempotent by notification).
    await settleOutbox(db);
    expect(await db.emailOutbox.count({ where: { recipient: { in: [ownerEmail, approverEmail] } } })).toBe(2);
    await db.notificationQueueMember.deleteMany({ where: { userId: responder } });
  });

  it('EMAIL: an employee who turned email off gets the in-app alert but no email', async () => {
    const approver = await staff('noEmail', ['ADMIN'], { branches: [mys], permissions: ['policy.approve'] });
    await updatePreferences(db, approver, { emailEnabled: false });
    await enqueueDomainEvent(db, { eventType: 'POLICY_CHANGE_APPROVAL', aggregateId: crypto.randomUUID(), branchId: mys });
    await settleOutbox(db);
    expect(await inbox(approver)).toHaveLength(1);
    const email = (await db.user.findUnique({ where: { id: approver } }))!.email!;
    expect(await db.emailOutbox.count({ where: { recipient: email } })).toBe(0);
  });

  it('EMAIL FAILURE: a provider rejection leaves the in-app alert intact and the email queued for retry with a safe error code', async () => {
    const brFail = (await db.branch.create({ data: { code: `SF${suffix}`, name: 'Hubballi', city: `Hubballi-S-${suffix}` } as any })).id;
    const approver = await staff('failMail', ['ADMIN'], { branches: [brFail], permissions: ['export.sensitive.approve'] });
    await enqueueDomainEvent(db, { eventType: 'SENSITIVE_EXPORT_APPROVAL', aggregateId: crypto.randomUUID(), branchId: brFail });
    await settleOutbox(db);
    const email = (await db.user.findUnique({ where: { id: approver } }))!.email!;
    const failing: EmailSender = async () => { throw new Error('401 key re_secret_token rejected'); };
    for (const queued of await db.emailOutbox.findMany({ where: { recipient: email } })) await processEmail(db, failing, 'alerts@example.test', queued.id);
    expect(await inbox(approver)).toHaveLength(1);
    const row = (await db.emailOutbox.findFirst({ where: { recipient: email } }))!;
    expect(row.state).toBe('PENDING');
    expect(row.lastErrorCode).toBe('EMAIL_SEND_FAILED');
    expect(JSON.stringify(row)).not.toContain('re_secret_token');
  });

  it('VOLUME: 120 events (each enqueued twice) become exactly 120 inbox items, with no duplicates, in reasonable time', async () => {
    const rep = await staff('volumeRep', ['SALES_EXECUTIVE'], { branches: [blr] });
    const ids = Array.from({ length: 120 }, () => crypto.randomUUID());
    const started = Date.now();
    for (const id of ids) {
      await enqueueDomainEvent(db, { eventType: 'LEAD_ASSIGNED', aggregateId: id, branchId: blr, assigneeUserIds: [rep], payload: { referenceCode: 'VM-V' }, dedupKey: `volume-${id}` });
      await enqueueDomainEvent(db, { eventType: 'LEAD_ASSIGNED', aggregateId: id, branchId: blr, assigneeUserIds: [rep], payload: { referenceCode: 'VM-V' }, dedupKey: `volume-${id}` }).catch(() => undefined);
    }
    const enqueued = Date.now() - started;
    for (let i = 0; i < 40 && (await inbox(rep)).length < 120; i++) await settleOutbox(db, 15_000);
    const rows = await inbox(rep);
    const drained = Date.now() - started;
    expect(new Set(rows.map(row => row.resourceId)).size).toBe(120);
    expect(rows.length).toBe(120);
    console.info(`[NOTIFICATION_VOLUME] 120 events: enqueue ${enqueued} ms, enqueue+process ${drained} ms (${Math.round(drained / 120)} ms/event, local database)`);
    expect(drained).toBeLessThan(60_000);
  }, 90_000);
});
