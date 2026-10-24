import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ensureAdminCatalog } from '../src/admin-catalog.js';
import { PrismaAdminStore } from '../src/admin-store.js';

const url = process.env.V2_TEST_DATABASE_URL;
if (url && (!url.startsWith('postgresql://') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/vmotiv_v2_test')) {
  throw new Error('Admin integration tests require the isolated local vmotiv_v2_test database.');
}

describe.skipIf(!url)('Admin foundation with real PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url || 'postgresql://unused@127.0.0.1:5440/vmotiv_v2_test' });
  const store = new PrismaAdminStore(db);
  const suffix = crypto.randomUUID().slice(0, 8);
  const adminUid = `admin-${suffix}`;
  const securityUid = `security-${suffix}`;
  const invitedUid = `sales-${suffix}`;
  const invitedEmail = `sales-${suffix}@example.test`;
  let actor: Awaited<ReturnType<typeof store.actor>>;
  let branchId: string;
  let otherBranchId: string;
  let salesRoleId: string;
  let superRoleId: string;
  let securityRoleId: string;
  let securityActor: Awaited<ReturnType<typeof store.actor>>;

  beforeAll(async () => {
    await db.$connect();
    await ensureAdminCatalog(db);
    const [adminRole, salesRole, superRole, securityRole] = await Promise.all([
      db.role.findUniqueOrThrow({ where: { key: 'ADMIN' } }),
      db.role.findUniqueOrThrow({ where: { key: 'SALES_EXECUTIVE' } }),
      db.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } }),
      db.role.findUniqueOrThrow({ where: { key: 'SECURITY_ADMIN' } }),
    ]);
    salesRoleId = salesRole.id;
    superRoleId = superRole.id;
    securityRoleId = securityRole.id;
    const branch = await db.branch.create({ data: { code: `T-${suffix}`, name: 'Test Branch', city: 'Bengaluru' } });
    const other = await db.branch.create({ data: { code: `O-${suffix}`, name: 'Other Branch', city: 'Chennai' } });
    branchId = branch.id;
    otherBranchId = other.id;
    const user = await db.user.create({ data: { firebaseUid: adminUid, email: `admin-${suffix}@example.test`, displayName: 'Admin Test' } });
    await db.employee.create({ data: {
      userId: user.id, role: 'ADMIN', active: true, status: 'ACTIVE', mfaStatus: 'COMPLIANT', employeeCode: `TEST-${suffix}`,
      roleAssignments: { create: { roleId: adminRole.id } }, branchAssignments: { create: { branchId } },
    } });
    const securityUser = await db.user.create({ data: { firebaseUid: securityUid, email: `security-${suffix}@example.test`, displayName: 'Security Test' } });
    await db.employee.create({ data: {
      userId: securityUser.id, role: 'SECURITY_ADMIN', active: true, status: 'ACTIVE', mfaStatus: 'COMPLIANT', employeeCode: `SEC-${suffix}`,
      roleAssignments: { create: { roleId: securityRole.id } }, branchAssignments: { create: { branchId } },
    } });
    actor = await store.actor(adminUid);
    securityActor = await store.actor(securityUid);
  });

  afterAll(async () => { await db.$disconnect(); });

  it('derives effective permissions and branch scope from database assignments', () => {
    expect(actor.roles).toContain('ADMIN');
    expect(actor.permissions).toContain('employee.invite');
    expect(actor.branches.map(branch => branch.id)).toEqual([branchId]);
  });

  it('returns real scoped approval and support workload counts for the dashboard', async () => {
    const dashboard = await store.dashboard(actor) as { approvals: number; supportCases: number; pendingAdministrativeTasks: number };
    expect(typeof dashboard.approvals).toBe('number');
    expect(typeof dashboard.supportCases).toBe('number');
    expect(dashboard.pendingAdministrativeTasks).toBeGreaterThanOrEqual(dashboard.approvals);
  });

  it('creates a scoped, hashed, expiring invitation and an outbox event', async () => {
    const invitation = await store.invite(actor, {
      email: invitedEmail, fullName: 'Invited Sales', designation: 'Sales Executive', roleId: salesRoleId,
      branchIds: [branchId], expiresInHours: 24, adminOrigin: 'https://admin.example.test',
    }) as { id: string };
    const [stored, email] = await Promise.all([
      db.employeeInvitation.findUniqueOrThrow({ where: { id: invitation.id } }),
      db.emailOutbox.findUniqueOrThrow({ where: { eventKey: `employee-invitation/${invitation.id}` } }),
    ]);
    const rawToken = /[?&]token=([^\s]+)/.exec(email.text)?.[1];
    expect(rawToken).toBeTruthy();
    expect(stored.tokenHash).toBe(crypto.createHash('sha256').update(decodeURIComponent(rawToken!)).digest('hex'));
    expect(stored.tokenHash).not.toBe(rawToken);
  });

  it('accepts exactly once for the matching verified Google identity', async () => {
    const pending = await db.employeeInvitation.findFirstOrThrow({ where: { email: invitedEmail, status: 'PENDING' } });
    const email = await db.emailOutbox.findUniqueOrThrow({ where: { eventKey: `employee-invitation/${pending.id}` } });
    const rawToken = decodeURIComponent(/[?&]token=([^\s]+)/.exec(email.text)![1]!);
    const employee = await store.acceptInvitation({ uid: invitedUid, email: invitedEmail, name: 'Invited Sales', secondFactor: false }, rawToken);
    expect(employee.roles).toEqual(['SALES_EXECUTIVE']);
    expect(employee.branches.map(branch => branch.id)).toEqual([branchId]);
    await expect(store.acceptInvitation({ uid: invitedUid, email: invitedEmail, secondFactor: false }, rawToken)).rejects.toMatchObject({ status: 409, code: 'INVITATION_NOT_ACTIVE' });
  });

  it('denies cross-branch and privileged invitations for a routine Admin', async () => {
    await expect(store.invite(actor, { email: `cross-${suffix}@example.test`, fullName: 'Cross Branch', roleId: salesRoleId, branchIds: [otherBranchId], expiresInHours: 24, adminOrigin: 'https://admin.example.test' })).rejects.toMatchObject({ status: 403, code: 'BRANCH_SCOPE_DENIED' });
    await expect(store.invite(actor, { email: `priv-${suffix}@example.test`, fullName: 'Privileged', roleId: superRoleId, branchIds: [branchId], expiresInHours: 24, adminOrigin: 'https://admin.example.test' })).rejects.toMatchObject({ status: 403, code: 'PRIVILEGED_ROLE_APPROVAL_REQUIRED' });
  });

  it('requires an independent privileged approver and executes an approved invitation once', async () => {
    const proposal = await store.proposePrivilegedInvitation(actor, {
      email: `security-lead-${suffix}@example.test`, fullName: 'Security Lead', roleId: securityRoleId,
      branchIds: [branchId], expiresInHours: 48, adminOrigin: 'https://admin.example.test',
    }, 'Need independent security coverage');
    const decision = await store.decideApproval(securityActor, (proposal as { id: string }).id, {
      version: 1, decision: 'APPROVE', reason: 'Reviewed branch scope and role need', adminOrigin: 'https://admin.example.test',
    }) as { status: string; invitation: { id: string } };
    expect(decision.status).toBe('APPROVED');
    expect(await db.employeeInvitation.count({ where: { id: decision.invitation.id } })).toBe(1);
    const record = await db.approvalRequest.findUniqueOrThrow({ where: { id: (proposal as { id: string }).id }, include: { decision: true } });
    expect(record.status).toBe('APPROVED');
    expect(record.decision?.actorId).not.toBe(record.requesterId);
    await expect(store.decideApproval(securityActor, record.id, { version: 1, decision: 'APPROVE', reason: 'Repeat attempt', adminOrigin: 'https://admin.example.test' })).rejects.toMatchObject({ status: 409, code: 'APPROVAL_NOT_PENDING' });
    const selfRequested = await db.approvalRequest.create({ data: {
      requestType: 'PRIVILEGED_EMPLOYEE_INVITATION', requesterId: securityActor.userId, requiredPermission: 'role.assign.privileged', scopeBranchIds: [branchId], expiresAt: new Date(Date.now() + 60_000),
      payload: { email: `self-${suffix}@example.test`, fullName: 'Self Approver', roleId: securityRoleId, branchIds: [branchId], expiresInHours: 24 },
    } });
    await expect(store.decideApproval(securityActor, selfRequested.id, { version: 1, decision: 'APPROVE', reason: 'Should never be allowed', adminOrigin: 'https://admin.example.test' })).rejects.toMatchObject({ status: 409, code: 'SELF_APPROVAL_DENIED' });
  });

  it('does not reveal a multi-branch approval to an actor missing any requested branch', async () => {
    const request = await db.approvalRequest.create({ data: {
      requestType: 'PRIVILEGED_EMPLOYEE_INVITATION', requesterId: actor.userId, requiredPermission: 'role.assign.privileged', scopeBranchIds: [branchId, otherBranchId], expiresAt: new Date(Date.now() + 60_000),
      payload: { email: `hidden-${suffix}@example.test`, fullName: 'Hidden Scope', roleId: securityRoleId, branchIds: [branchId, otherBranchId], expiresInHours: 24 },
    } });
    const page = await store.approvals(securityActor, { page: 1, limit: 50, status: 'PENDING' }) as { items: Array<{ id: string }> };
    expect(page.items.map(item => item.id)).not.toContain(request.id);
  });

  it('keeps support cases within the employee city scope and audits an agent reply', async () => {
    const inScopeUser = await db.user.create({ data: { firebaseUid: `support-${suffix}`, email: `support-${suffix}@example.test`, preferredCity: 'Bengaluru' } });
    const outScopeUser = await db.user.create({ data: { firebaseUid: `private-${suffix}`, email: `private-${suffix}@example.test`, preferredCity: 'Chennai' } });
    const [inScope, outScope] = await Promise.all([
      db.supportCase.create({ data: { userId: inScopeUser.id, subject: 'In-scope support', category: 'BUYING', description: 'Need help with a test drive booking.' } }),
      db.supportCase.create({ data: { userId: outScopeUser.id, subject: 'Out-of-scope support', category: 'BUYING', description: 'This case must remain outside this branch.' } }),
    ]);
    const page = await store.supportCases(actor, { page: 1, limit: 50 }) as { items: Array<{ id: string }> };
    expect(page.items.map(item => item.id)).toContain(inScope.id);
    expect(page.items.map(item => item.id)).not.toContain(outScope.id);
    const reply = await store.replySupportCase(actor, inScope.id, 'Our local team is checking the requested appointment.');
    expect(reply).toMatchObject({ authorType: 'SUPPORT' });
    await expect(store.replySupportCase(actor, outScope.id, 'This must be denied.')).rejects.toMatchObject({ status: 403, code: 'BRANCH_SCOPE_DENIED' });
    expect(await db.auditEvent.findFirst({ where: { entityId: inScope.id, action: 'SUPPORT_CASE_REPLIED' } })).not.toBeNull();
  });

  it('suspends an in-scope employee immediately and writes an audit event', async () => {
    const target = await db.user.findUniqueOrThrow({ where: { firebaseUid: invitedUid } });
    await store.setEmployeeStatus(actor, target.id, 'SUSPENDED', 'Integration security verification');
    const [employee, user, audit] = await Promise.all([
      db.employee.findUniqueOrThrow({ where: { userId: target.id } }),
      db.user.findUniqueOrThrow({ where: { id: target.id } }),
      db.auditEvent.findFirst({ where: { entityId: target.id, action: 'EMPLOYEE_SUSPENDED' } }),
    ]);
    expect(employee.active).toBe(false);
    expect(employee.status).toBe('SUSPENDED');
    expect(user.status).toBe('SUSPENDED');
    expect(audit).not.toBeNull();
    await expect(store.actor(invitedUid)).rejects.toMatchObject({ status: 403, code: 'ADMIN_ACCESS_DENIED' });
  });
});
