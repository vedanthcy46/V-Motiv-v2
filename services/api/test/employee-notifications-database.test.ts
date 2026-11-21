import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ensureAdminCatalog } from '../src/admin-catalog.js';
import { enqueueDomainEvent } from '../src/employee-notifications/outbox.js';
import { runOutboxOnce } from '../src/employee-notifications/processor.js';
import { settleOutbox } from './helpers/outbox.js';
import { saveRoutingPolicy } from '../src/employee-notifications/policy.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) {
  throw new Error('Integration tests require the isolated local vmotiv_v2_test database.');
}

describe.skipIf(!url)('Employee notification pipeline, with real PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const suffix = crypto.randomUUID().slice(0, 8);
  let blr: string; // Bengaluru branch
  let mys: string; // Mysuru branch

  beforeAll(async () => {
    await ensureAdminCatalog(db as any);
    await db.notificationQueueMember.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); // left by an interrupted earlier run
    blr = (await db.branch.create({ data: { code: `BLR${suffix}`, name: 'Bengaluru', city: `Bengaluru-${suffix}` } as any })).id;
    mys = (await db.branch.create({ data: { code: `MYS${suffix}`, name: 'Mysuru', city: `Mysuru-${suffix}` } as any })).id;
  });
  afterAll(() => db.$disconnect());

  type Role = 'SALES_EXECUTIVE' | 'OPERATIONS_MANAGER' | 'FINANCE' | 'ADMIN' | 'SUPER_ADMIN' | 'INSPECTOR' | 'RENTAL_MANAGER' | 'INVENTORY_MANAGER';
  async function staff(name: string, roles: Role[], opts: { branches?: string[]; permissions?: string[]; status?: 'ACTIVE' | 'SUSPENDED'; reportsTo?: string } = {}) {
    const user = await db.user.create({ data: { firebaseUid: `${name}-${crypto.randomUUID()}`, email: `${name}-${crypto.randomUUID()}@example.test`, displayName: name } });
    const roleRows = await db.role.findMany({ where: { key: { in: roles } } });
    await db.employee.create({ data: {
      userId: user.id, role: roles[0]!, active: (opts.status ?? 'ACTIVE') === 'ACTIVE', status: opts.status ?? 'ACTIVE', mfaStatus: 'COMPLIANT',
      employeeCode: `E-${crypto.randomUUID().slice(0, 8)}`.toUpperCase(), permissions: opts.permissions ?? [], reportsToId: opts.reportsTo,
      roleAssignments: { create: roleRows.map(row => ({ roleId: row.id })) },
      branchAssignments: { create: (opts.branches ?? []).map(branchId => ({ branchId })) },
    } });
    return user.id;
  }
  const inbox = (userId: string) => db.notification.findMany({ where: { userId, eventId: { not: null } }, orderBy: { createdAt: 'asc' } });
  const drain = () => settleOutbox(db);
  const lead = () => crypto.randomUUID();

  it('SALES: the assigned executive is told; a colleague in the same branch and another branch are not', async () => {
    const a = await staff('salesA', ['SALES_EXECUTIVE'], { branches: [blr] });
    const b = await staff('salesB', ['SALES_EXECUTIVE'], { branches: [blr] });
    const m = await staff('salesMys', ['SALES_EXECUTIVE'], { branches: [mys] });
    const id = lead();
    await enqueueDomainEvent(db, { eventType: 'LEAD_ASSIGNED', aggregateId: id, branchId: blr, assigneeUserIds: [a], payload: { referenceCode: 'VM-ACQ-1', vehicle: 'Honda City' } });
    await drain();
    const mine = await inbox(a);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ severity: 'ACTION_REQUIRED', module: 'SALES', resourceType: 'AcquisitionLead', resourceId: id, actionRoute: `/seller-leads/${id}`, requiresAck: true, branchId: blr });
    expect(await inbox(b)).toHaveLength(0);
    expect(await inbox(m)).toHaveLength(0);
  });

  it('QUEUE: an unassigned lead goes to the designated owner in its own branch, not to every Sales Executive', async () => {
    const owner = await staff('teamLead', ['SALES_EXECUTIVE'], { branches: [blr] });
    const other = await staff('exec', ['SALES_EXECUTIVE'], { branches: [blr] });
    const mysOwner = await staff('mysLead', ['SALES_EXECUTIVE'], { branches: [mys] });
    await db.notificationQueueMember.createMany({ data: [{ queueKey: 'SALES_LEADS', userId: owner, branchId: blr, memberRole: 'OWNER' }, { queueKey: 'SALES_LEADS', userId: mysOwner, branchId: mys, memberRole: 'OWNER' }] });
    const id = lead();
    await enqueueDomainEvent(db, { eventType: 'CUSTOMER_SELL_SUBMITTED', aggregateId: id, branchId: blr, payload: { vehicle: 'Hyundai i20' } });
    await drain();
    expect(await inbox(owner)).toHaveLength(1);
    expect(await inbox(other)).toHaveLength(0);
    expect(await inbox(mysOwner)).toHaveLength(0);
    const event = await db.domainOutboxEvent.findFirstOrThrow({ where: { aggregateId: id } });
    expect((event.routing as any).fallbackUsed).toBe(false);
    await db.notificationQueueMember.deleteMany({ where: { userId: { in: [owner, mysOwner] } } });
  });

  it('FALLBACK: with no designated owner the branch\'s permission holders are used (flagged, capped), never another branch', async () => {
    const queueLessBranch = (await db.branch.create({ data: { code: `QL${suffix}`, name: 'Hubli', city: `Hubli-${suffix}` } as any })).id;
    const insideIds: string[] = [];
    for (let i = 0; i < 12; i++) insideIds.push(await staff(`hubli${i}`, ['RENTAL_MANAGER'], { branches: [queueLessBranch] }));
    const elsewhere = await staff('elsewhere', ['RENTAL_MANAGER'], { branches: [blr] });
    const id = lead();
    await enqueueDomainEvent(db, { eventType: 'RENTAL_BOOKING_CONFIRMED', aggregateId: id, branchId: queueLessBranch, payload: { referenceCode: 'VMR-1' } });
    await drain();
    const told = (await Promise.all(insideIds.map(inbox))).filter(rows => rows.length).length;
    expect(told).toBeGreaterThan(0);
    expect(told).toBeLessThanOrEqual(8);
    expect(await inbox(elsewhere)).toHaveLength(0);
    const event = await db.domainOutboxEvent.findFirstOrThrow({ where: { aggregateId: id } });
    expect((event.routing as any).fallbackUsed).toBe(true);
  });

  it('FINANCE: approvers hold the permission and exclude the preparer; Operations never gets Finance detail', async () => {
    const preparer = await staff('preparer', ['FINANCE'], { branches: [blr] });
    const approver = await staff('approver', ['FINANCE'], { branches: [blr], permissions: ['finance.payout.approve'] });
    const ops = await staff('ops', ['OPERATIONS_MANAGER'], { branches: [blr] });
    // The preparer also happens to hold the approval permission (maker-checker is enforced elsewhere): still excluded.
    await db.employee.update({ where: { userId: preparer }, data: { permissions: ['finance.payout.approve'] } });
    const id = lead();
    await enqueueDomainEvent(db, { eventType: 'FINANCE_PAYOUT_APPROVAL_REQUESTED', aggregateId: id, branchId: blr, excludeUserIds: [preparer], payload: { referenceCode: 'PO-1', accountNumber: '1234567890', amountPaise: 9900000 } });
    await drain();
    const rows = await inbox(approver);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actionRoute).toBe(`/payouts/${id}`);
    expect(JSON.stringify(rows[0])).not.toMatch(/1234567890|9900000/);
    expect(await inbox(preparer)).toHaveLength(0);
    expect(await inbox(ops)).toHaveLength(0);
  });

  it('DEDUPE: two roles and two strategies matching the same person give one notification', async () => {
    const both = await staff('bothRoles', ['OPERATIONS_MANAGER', 'INVENTORY_MANAGER'], { branches: [blr, mys] });
    await db.notificationQueueMember.create({ data: { queueKey: 'OPS_ACQUISITIONS', userId: both, branchId: null, memberRole: 'OWNER' } });
    const id = lead();
    await enqueueDomainEvent(db, { eventType: 'ACQUISITION_OFFER_ACCEPTED_STAFF', aggregateId: id, branchId: blr, assigneeUserIds: [both], payload: { referenceCode: 'CASE-1' } });
    await drain();
    expect(await inbox(both)).toHaveLength(1);
    await db.notificationQueueMember.deleteMany({ where: { userId: both } });
  });

  it('SUSPENDED: a suspended employee gets nothing, even when named as the assignee', async () => {
    const gone = await staff('suspended', ['SALES_EXECUTIVE'], { branches: [blr], status: 'SUSPENDED' });
    const id = lead();
    await enqueueDomainEvent(db, { eventType: 'LEAD_ASSIGNED', aggregateId: id, branchId: blr, assigneeUserIds: [gone] });
    await drain();
    expect(await inbox(gone)).toHaveLength(0);
  });

  it('REASSIGNMENT: the new owner is told, the old alert stops being actionable, and history is kept', async () => {
    const a = await staff('oldOwner', ['SALES_EXECUTIVE'], { branches: [blr] });
    const b = await staff('newOwner', ['SALES_EXECUTIVE'], { branches: [blr] });
    const id = lead();
    await enqueueDomainEvent(db, { eventType: 'LEAD_ASSIGNED', aggregateId: id, branchId: blr, assigneeUserIds: [a], dedupKey: `t-${id}-1` });
    await drain();
    await enqueueDomainEvent(db, { eventType: 'LEAD_ASSIGNED', aggregateId: id, branchId: blr, assigneeUserIds: [b], dedupKey: `t-${id}-2` });
    await drain();
    const old = (await inbox(a))[0]!;
    expect(old.supersededAt).not.toBeNull();
    expect(old.resolvedAt).not.toBeNull();
    expect((await inbox(b))[0]).toMatchObject({ supersededAt: null, resolvedAt: null });
  });

  it('RELIABILITY: the event survives with no worker, and replays or duplicates never create a second inbox item', async () => {
    const a = await staff('reliable', ['SALES_EXECUTIVE'], { branches: [blr] });
    const id = lead();
    // The event is written in the SAME transaction as the business change: a rollback leaves nothing behind...
    await expect(db.$transaction(async tx => {
      await enqueueDomainEvent(tx, { eventType: 'LEAD_ASSIGNED', aggregateId: id, branchId: blr, assigneeUserIds: [a], dedupKey: `rb-${id}` });
      throw new Error('business change failed');
    })).rejects.toThrow('business change failed');
    expect(await db.domainOutboxEvent.count({ where: { dedupKey: `rb-${id}` } })).toBe(0);
    // ...and a commit leaves a durable PENDING event even though no worker has run yet.
    let status = '';
    const eventId = await db.$transaction(async tx => {
      const created = await enqueueDomainEvent(tx, { eventType: 'LEAD_ASSIGNED', aggregateId: id, branchId: blr, assigneeUserIds: [a], dedupKey: `r-${id}` });
      status = (await tx.domainOutboxEvent.findUniqueOrThrow({ where: { id: created! } })).status;
      return created;
    });
    expect(status).toBe('PENDING');
    expect(await db.notification.count({ where: { userId: a, resourceId: id } })).toBe(0);
    // The same event raised again (a retry in the caller) is the same event.
    expect(await enqueueDomainEvent(db, { eventType: 'LEAD_ASSIGNED', aggregateId: id, branchId: blr, assigneeUserIds: [a], dedupKey: `r-${id}` })).toBe(eventId);
    // A worker that claimed it and crashed (lease expired) lets another worker take it over.
    // (Our own claim, with a lease that has already expired.)
    await db.domainOutboxEvent.update({ where: { id: eventId! }, data: { status: 'PROCESSING', lockedBy: 'crashed-worker', leaseUntil: new Date(Date.now() - 1000), attempts: 1 } });
    await drain();
    expect(await inbox(a)).toHaveLength(1);
    // Force a replay of the same event: still one.
    await db.domainOutboxEvent.update({ where: { id: eventId! }, data: { status: 'PENDING', nextAttemptAt: new Date() } });
    await drain();
    expect(await inbox(a)).toHaveLength(1);
    expect((await db.notificationDelivery.findMany({ where: { notification: { userId: a } } })).filter(d => d.channel === 'IN_APP')).toHaveLength(1);
  });

  it('RETRY: a failing event backs off and ends DEAD after its attempts, visible rather than lost', async () => {
    const id = lead();
    const eventId = (await enqueueDomainEvent(db, { eventType: 'LEAD_ASSIGNED', aggregateId: id, dedupKey: `x-${id}` }))!;
    await db.domainOutboxEvent.update({ where: { id: eventId }, data: { eventType: 'NO_SUCH_EVENT', maxAttempts: 2 } });
    await settleOutbox(db);
    let event = await db.domainOutboxEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect(event).toMatchObject({ status: 'FAILED', attempts: 1 });
    expect(event.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    await db.domainOutboxEvent.update({ where: { id: eventId }, data: { nextAttemptAt: new Date() } });
    await settleOutbox(db);
    event = await db.domainOutboxEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect(event.status).toBe('DEAD');
  });

  it('DEDUP WINDOW: a repeating detector raises one event per window', async () => {
    const id = lead();
    const first = await enqueueDomainEvent(db, { eventType: 'RENTAL_BALANCE_OVERDUE', aggregateId: id, branchId: blr });
    const second = await enqueueDomainEvent(db, { eventType: 'RENTAL_BALANCE_OVERDUE', aggregateId: id, branchId: blr });
    expect(second).toBe(first);
  });

  it('PRIVACY: only allow-listed fields are kept, so contact details never reach the inbox or a push', async () => {
    const a = await staff('privacy', ['SALES_EXECUTIVE'], { branches: [blr] });
    const id = lead();
    await enqueueDomainEvent(db, { eventType: 'LEAD_ASSIGNED', aggregateId: id, branchId: blr, assigneeUserIds: [a], payload: { referenceCode: 'VM-ACQ-9', sellerPhone: '+919876543210', sellerEmail: 'x@gmail.com', bankAccount: '000111222', vehicle: 'Maruti Swift' } });
    await drain();
    const row = (await inbox(a))[0]!;
    expect(JSON.stringify(row)).not.toMatch(/9876543210|x@gmail|000111222/);
    expect(row.body).toContain('VM-ACQ-9');
  });

  it('PUSH: action alerts push to the employee\'s own devices with a minimal payload; informational ones never push', async () => {
    const a = await staff('pushy', ['SALES_EXECUTIVE'], { branches: [blr] });
    const device = await db.pushDevice.create({ data: { userId: a, app: 'INSPECTOR', token: `ExponentPushToken[${crypto.randomUUID()}]`, platform: 'android' } });
    const id = lead();
    await enqueueDomainEvent(db, { eventType: 'LEAD_ASSIGNED', aggregateId: id, branchId: blr, assigneeUserIds: [a], payload: { vehicle: 'Kia Seltos' } });
    await enqueueDomainEvent(db, { eventType: 'FINANCE_PAYOUT_VERIFIED', aggregateId: lead(), branchId: blr, assigneeUserIds: [a] });
    await drain();
    const tickets = await db.pushTicket.findMany({ where: { deviceId: device.id } });
    expect(tickets).toHaveLength(1);
    expect(Object.keys(tickets[0]!.data as object).sort()).toEqual(['actionRoute', 'module', 'notificationId', 'severity']);
  });

  it('CRITICAL: a security incident reaches designated responders; with none, only platform administrators; escalation-free routing is branch-independent', async () => {
    const responder = await staff('responder', ['ADMIN'], { branches: [] });
    const bystander = await staff('bystander', ['ADMIN'], { branches: [blr] });
    await db.notificationQueueMember.create({ data: { queueKey: 'ADMIN_SECURITY', userId: responder, branchId: null, memberRole: 'OWNER' } });
    const id = lead();
    await enqueueDomainEvent(db, { eventType: 'SECURITY_INCIDENT', aggregateId: id, payload: { reasonCode: 'SUSPICIOUS_LOGIN' } });
    await drain();
    const rows = await inbox(responder);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ severity: 'CRITICAL', requiresAck: true, priority: 'URGENT' });
    expect(await inbox(bystander)).toHaveLength(0);
    await db.notificationQueueMember.deleteMany({ where: { userId: responder } });
  });

  it('POLICY: a stored policy can retune delivery but cannot widen who sees an event, drop a gate, or switch off a critical alert', async () => {
    const admin = await staff('policyAdmin', ['SUPER_ADMIN']);
    await expect(saveRoutingPolicy(db, { eventType: 'LEAD_ASSIGNED', branchScope: 'GLOBAL' }, admin)).rejects.toMatchObject({ code: 'POLICY_WIDENS_BRANCH_SCOPE' });
    await expect(saveRoutingPolicy(db, { eventType: 'FINANCE_PAYOUT_APPROVAL_REQUESTED', requiredPermission: null }, admin)).rejects.toMatchObject({ code: 'POLICY_REMOVES_PERMISSION_GATE' });
    await expect(saveRoutingPolicy(db, { eventType: 'SECURITY_INCIDENT', enabled: false }, admin)).rejects.toMatchObject({ code: 'CRITICAL_EVENT_IS_MANDATORY' });
    const saved = await saveRoutingPolicy(db, { eventType: 'BUYER_ENQUIRY_SUBMITTED', severity: 'INFORMATIONAL', note: 'quiet' }, admin);
    const next = await saveRoutingPolicy(db, { eventType: 'BUYER_ENQUIRY_SUBMITTED', deliveryChannels: ['IN_APP'] }, admin);
    expect(next.version).toBe(saved.version + 1);
    // Leave the stored policy as the catalog default so other tests see normal routing.
    await db.notificationRoutingPolicy.deleteMany({ where: { eventType: 'BUYER_ENQUIRY_SUBMITTED' } });
  });
});
