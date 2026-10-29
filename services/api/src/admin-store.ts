import crypto from 'node:crypto';
import { PrismaClient, type EmployeeRole, type EmployeeStatus, type Prisma, type SupportCaseStatus } from '@prisma/client';
import { z } from 'zod';
import type { Identity } from './auth.js';
import { HttpError } from './errors.js';
import type { PermissionKey } from './admin-catalog.js';

if (!('toJSON' in BigInt.prototype)) {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value: function () {
      return this.toString();
    },
    writable: true,
    configurable: true,
  });
}

export type AdminActor = {
  userId: string;
  firebaseUid: string;
  email: string;
  displayName: string | null;
  employeeCode: string | null;
  designation: string | null;
  status: EmployeeStatus;
  mfaStatus: string;
  roles: EmployeeRole[];
  permissions: string[];
  branches: Array<{ id: string; code: string; name: string; city: string }>;
};

export type EmployeeListQuery = {
  page: number;
  limit: number;
  search?: string;
  status?: EmployeeStatus;
  role?: EmployeeRole;
  branchId?: string;
};

export type CreateInvitation = {
  email: string;
  fullName: string;
  designation?: string;
  roleId: string;
  branchIds: string[];
  expiresInHours: number;
  adminOrigin: string;
};

export type ApprovalListQuery = { page: number; limit: number; status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'STALE' };
export type ApprovalDecisionInput = { version: number; decision: 'APPROVE' | 'REJECT'; reason: string; adminOrigin: string };
export type SupportCaseListQuery = { page: number; limit: number; status?: SupportCaseStatus; search?: string };
export type PolicyProposal = { key: string; title: string; content: unknown; effectiveAt?: string; reason: string };

export type BusinessSellingQuery = { page: number; limit: number; status?: string; search?: string };
export type BusinessBuyingQuery = { page: number; limit: number; status?: string; search?: string };
export type BusinessInventoryQuery = { page: number; limit: number; status?: string; search?: string };
export type MasterDataItemInput = { category: string; code: string; name: string; parentCode?: string; metadata?: Record<string, unknown> };
export type MasterDataUpdateInput = { name?: string; active?: boolean; metadata?: Record<string, unknown> };
export type CommunicationsOutboxQuery = { page: number; limit: number; state?: string };
export type PrivacyRequestListQuery = { page: number; limit: number; status?: string };
export type CreateExportJobInput = { resourceType: string; scope?: string; filter?: Record<string, unknown>; format?: string; sensitive?: boolean; reason?: string };

export interface AdminStore {
  actor(uid: string): Promise<AdminActor>;
  touchAccess(userId: string, mfaCompliant: boolean): Promise<void>;
  dashboard(actor: AdminActor): Promise<unknown>;
  roles(actor: AdminActor): Promise<unknown[]>;
  branches(actor: AdminActor): Promise<unknown[]>;
  manageBranches(actor: AdminActor): Promise<unknown[]>;
  createBranch(actor: AdminActor, input: { code: string; name: string; city: string; address?: string }): Promise<unknown>;
  updateBranch(actor: AdminActor, id: string, input: { name?: string; city?: string; address?: string | null; active?: boolean }): Promise<unknown>;
  serviceAreas(actor: AdminActor): Promise<unknown[]>;
  createServiceArea(actor: AdminActor, name: string): Promise<unknown>;
  updateServiceArea(actor: AdminActor, id: string, active: boolean): Promise<unknown>;
  supportCases(actor: AdminActor, query: SupportCaseListQuery): Promise<unknown>;
  updateSupportCase(actor: AdminActor, id: string, input: { status: SupportCaseStatus; note?: string }): Promise<unknown>;
  replySupportCase(actor: AdminActor, id: string, body: string): Promise<unknown>;
  systemHealth(actor: AdminActor): Promise<unknown>;
  policies(actor: AdminActor): Promise<unknown[]>;
  proposePolicy(actor: AdminActor, input: PolicyProposal): Promise<unknown>;
  employees(actor: AdminActor, query: EmployeeListQuery): Promise<unknown>;
  invite(actor: AdminActor, input: CreateInvitation): Promise<unknown>;
  proposePrivilegedInvitation(actor: AdminActor, input: CreateInvitation, reason: string): Promise<unknown>;
  approvals(actor: AdminActor, query: ApprovalListQuery): Promise<unknown>;
  decideApproval(actor: AdminActor, id: string, input: ApprovalDecisionInput): Promise<unknown>;
  acceptInvitation(identity: Identity, token: string): Promise<AdminActor>;
  setEmployeeStatus(actor: AdminActor, employeeId: string, status: EmployeeStatus, reason: string): Promise<{ firebaseUid: string }>;
  audit(actor: AdminActor, page: number, limit: number): Promise<unknown>;
  businessSelling(actor: AdminActor, query: BusinessSellingQuery): Promise<unknown>;
  businessBuying(actor: AdminActor, query: BusinessBuyingQuery): Promise<unknown>;
  businessInventory(actor: AdminActor, query: BusinessInventoryQuery): Promise<unknown>;
  businessFinance(actor: AdminActor): Promise<unknown>;
  masterData(actor: AdminActor, category?: string): Promise<unknown[]>;
  createMasterDataItem(actor: AdminActor, input: MasterDataItemInput): Promise<unknown>;
  updateMasterDataItem(actor: AdminActor, id: string, input: MasterDataUpdateInput): Promise<unknown>;
  communicationsOutbox(actor: AdminActor, query: CommunicationsOutboxQuery): Promise<unknown>;
  communicationsTemplates(actor: AdminActor): Promise<unknown[]>;
  retryEmailOutbox(actor: AdminActor, id: string): Promise<unknown>;
  privacyRequests(actor: AdminActor, query: PrivacyRequestListQuery): Promise<unknown>;
  updatePrivacyRequest(actor: AdminActor, id: string, status: string, resolution?: string): Promise<unknown>;
  exportJobs(actor: AdminActor, page: number, limit: number): Promise<unknown>;
  createExportJob(actor: AdminActor, input: CreateExportJobInput): Promise<{ id: string; status: string; sensitive: boolean; resourceType: string; rowCount?: number | null; expiresAt?: Date | null; [key: string]: unknown }>;
  downloadExport(actor: AdminActor, id: string): Promise<{ fileContent: string; resourceType: string; format: string }>;
}

const actorInclude = {
  user: { select: { firebaseUid: true, email: true, displayName: true, status: true } },
  roleAssignments: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
  branchAssignments: { include: { branch: true } },
} satisfies Prisma.EmployeeInclude;

export function hasPermission(actor: AdminActor, permission: PermissionKey) {
  return actor.permissions.includes(permission);
}

export function requirePermission(actor: AdminActor, permission: PermissionKey) {
  if (!hasPermission(actor, permission)) throw new HttpError(403, 'PERMISSION_DENIED');
}

const privilegedInvitationPayload = z.object({
  email: z.string().email().max(254), fullName: z.string().min(2).max(120), designation: z.string().max(120).optional(),
  roleId: z.string().uuid(), branchIds: z.array(z.string().uuid()).min(1).max(20), expiresInHours: z.number().int().min(1).max(168), reason: z.string().min(8).max(500).optional(),
}).strict();

async function createInvitationRecord(
  tx: Prisma.TransactionClient,
  createdById: string,
  input: CreateInvitation,
  role: { id: string; key: EmployeeRole; name: string },
) {
  const email = input.email.trim().toLowerCase();
  const existingEmployee = await tx.employee.findFirst({ where: { user: { email: { equals: email, mode: 'insensitive' } } } });
  if (existingEmployee) throw new HttpError(409, 'EMPLOYEE_ALREADY_EXISTS');
  const pending = await tx.employeeInvitation.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, status: 'PENDING', expiresAt: { gt: new Date() } } });
  if (pending) throw new HttpError(409, 'INVITATION_ALREADY_PENDING');
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);
  const invitation = await tx.employeeInvitation.create({ data: {
    email, fullName: input.fullName, designation: input.designation, tokenHash, expiresAt, createdById, roleId: role.id,
    branches: { create: input.branchIds.map(branchId => ({ branchId })) },
  }, select: { id: true, email: true, fullName: true, status: true, expiresAt: true, createdAt: true } });
  const link = `${input.adminOrigin}/accept-invitation?token=${encodeURIComponent(rawToken)}`;
  await tx.emailOutbox.create({ data: {
    eventKey: `employee-invitation/${invitation.id}`, recipient: email, templateVersion: 'employee-invitation-v1',
    subject: 'Your V MOTIV employee invitation',
    text: `Hello ${input.fullName},\n\nYou have been invited to join V MOTIV as ${role.name}. This one-time invitation expires at ${expiresAt.toISOString()}.\n\nOpen invitation: ${link}\n\nIf you did not expect this invitation, do not use the link and contact V MOTIV security.`,
  } });
  return invitation;
}

function normalizeEmployee(employee: Prisma.EmployeeGetPayload<{ include: typeof actorInclude }>): AdminActor {
  const rolePermissions = employee.roleAssignments.flatMap(assignment => assignment.role.permissions.map(item => item.permission.key));
  const roles = employee.roleAssignments.map(assignment => assignment.role.key);
  return {
    userId: employee.userId,
    firebaseUid: employee.user.firebaseUid,
    email: employee.user.email,
    displayName: employee.user.displayName,
    employeeCode: employee.employeeCode,
    designation: employee.designation,
    status: employee.status,
    mfaStatus: employee.mfaStatus,
    roles,
    permissions: [...new Set([...rolePermissions, ...employee.permissions])].sort(),
    branches: employee.branchAssignments.map(({ branch }) => ({ id: branch.id, code: branch.code, name: branch.name, city: branch.city })),
  };
}

export class PrismaAdminStore implements AdminStore {
  constructor(private db: PrismaClient) {}

  async actor(uid: string) {
    const employee = await this.db.employee.findFirst({ where: { user: { firebaseUid: uid } }, include: actorInclude });
    if (!employee || !employee.active || employee.status !== 'ACTIVE' || employee.user.status !== 'ACTIVE') {
      throw new HttpError(403, 'ADMIN_ACCESS_DENIED');
    }
    const actor = normalizeEmployee(employee);
    if (!actor.permissions.includes('admin.portal.access')) throw new HttpError(403, 'ADMIN_ACCESS_DENIED');
    return actor;
  }

  async touchAccess(userId: string, mfaCompliant: boolean) {
    await this.db.employee.update({
      where: { userId },
      data: { lastAccessAt: new Date(), ...(mfaCompliant ? { mfaStatus: 'COMPLIANT' as const } : {}) },
    });
  }

  async dashboard(actor: AdminActor) {
    requirePermission(actor, 'employee.read');
    const branchScope = actor.roles.includes('SUPER_ADMIN') ? undefined : { branchAssignments: { some: { branchId: { in: actor.branches.map(branch => branch.id) } } } };
    const [active, suspended, deactivated, invitations, approvals, supportCases, recentAudit] = await this.db.$transaction([
      this.db.employee.count({ where: { ...branchScope, status: 'ACTIVE', active: true } }),
      this.db.employee.count({ where: { ...branchScope, status: 'SUSPENDED' } }),
      this.db.employee.count({ where: { ...branchScope, status: 'DEACTIVATED' } }),
      this.db.employeeInvitation.count({ where: { status: 'PENDING', ...(actor.roles.includes('SUPER_ADMIN') ? {} : { branches: { some: { branchId: { in: actor.branches.map(branch => branch.id) } } } }) } }),
      this.db.approvalRequest.count({ where: { status: 'PENDING', ...(actor.roles.includes('SUPER_ADMIN') ? {} : { scopeBranchIds: { hasSome: actor.branches.map(branch => branch.id) } }) } }),
      this.db.supportCase.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, ...(actor.roles.includes('SUPER_ADMIN') ? {} : { user: { preferredCity: { in: actor.branches.map(branch => branch.city) } } }) } }),
      this.db.auditEvent.findMany({ where: { actorId: actor.userId }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, action: true, entityType: true, entityId: true, outcome: true, createdAt: true } }),
    ]);
    return { employees: { active, suspended, deactivated, invited: invitations }, pendingAdministrativeTasks: invitations + approvals, approvals, supportCases, recentOwnActions: recentAudit, generatedAt: new Date() };
  }

  roles(actor: AdminActor) {
    requirePermission(actor, 'role.read');
    return this.db.role.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, key: true, name: true, description: true, privileged: true, permissions: { select: { permission: { select: { key: true, description: true } } } } } });
  }

  branches(actor: AdminActor) {
    requirePermission(actor, 'branch.read');
    return this.db.branch.findMany({ where: { active: true }, orderBy: [{ city: 'asc' }, { name: 'asc' }], select: { id: true, code: true, name: true, city: true, address: true, active: true } });
  }

  async manageBranches(actor: AdminActor) {
    requirePermission(actor, 'branch.read');
    const scoped = actor.roles.includes('SUPER_ADMIN') ? {} : { id: { in: actor.branches.map(branch => branch.id) } };
    return this.db.branch.findMany({ where: scoped, orderBy: [{ active: 'desc' }, { city: 'asc' }, { name: 'asc' }], select: { id: true, code: true, name: true, city: true, address: true, active: true, createdAt: true, _count: { select: { employees: true, invitations: true } } } });
  }

  async createBranch(actor: AdminActor, input: { code: string; name: string; city: string; address?: string }) {
    requirePermission(actor, 'branch.manage');
    const code = input.code.trim().toUpperCase();
    return this.db.$transaction(async tx => {
      const branch = await tx.branch.create({ data: { code, name: input.name.trim(), city: input.city.trim(), address: input.address?.trim() || null }, select: { id: true, code: true, name: true, city: true, address: true, active: true } }).catch(error => {
        if ((error as { code?: string }).code === 'P2002') throw new HttpError(409, 'BRANCH_CODE_EXISTS');
        throw error;
      });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'BRANCH_CREATED', entityType: 'Branch', entityId: branch.id, details: { code: branch.code, city: branch.city } } });
      return branch;
    });
  }

  async updateBranch(actor: AdminActor, id: string, input: { name?: string; city?: string; address?: string | null; active?: boolean }) {
    requirePermission(actor, 'branch.manage');
    if (!actor.roles.includes('SUPER_ADMIN') && !actor.branches.some(branch => branch.id === id)) throw new HttpError(403, 'BRANCH_SCOPE_DENIED');
    return this.db.$transaction(async tx => {
      const branch = await tx.branch.findUnique({ where: { id } });
      if (!branch) throw new HttpError(404, 'BRANCH_NOT_FOUND');
      if (input.active === false) {
        const activeAssignments = await tx.employeeBranchAssignment.count({ where: { branchId: id, employee: { active: true, status: 'ACTIVE' } } });
        if (activeAssignments) throw new HttpError(409, 'BRANCH_HAS_ACTIVE_EMPLOYEES');
      }
      const updated = await tx.branch.update({ where: { id }, data: { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.city !== undefined ? { city: input.city.trim() } : {}), ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}), ...(input.active !== undefined ? { active: input.active } : {}) }, select: { id: true, code: true, name: true, city: true, address: true, active: true } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'BRANCH_UPDATED', entityType: 'Branch', entityId: id, details: input } });
      return updated;
    });
  }

  async serviceAreas(actor: AdminActor) {
    requirePermission(actor, 'branch.read');
    return this.db.supportedCity.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, active: true, createdAt: true } });
  }

  async createServiceArea(actor: AdminActor, name: string) {
    requirePermission(actor, 'branch.manage');
    const normalized = name.trim();
    return this.db.$transaction(async tx => {
      const city = await tx.supportedCity.create({ data: { name: normalized }, select: { id: true, name: true, active: true, createdAt: true } }).catch(error => {
        if ((error as { code?: string }).code === 'P2002') throw new HttpError(409, 'SERVICE_AREA_EXISTS');
        throw error;
      });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'SERVICE_AREA_CREATED', entityType: 'SupportedCity', entityId: city.id, details: { name: city.name } } });
      return city;
    });
  }

  async updateServiceArea(actor: AdminActor, id: string, active: boolean) {
    requirePermission(actor, 'branch.manage');
    return this.db.$transaction(async tx => {
      const city = await tx.supportedCity.update({ where: { id }, data: { active }, select: { id: true, name: true, active: true, createdAt: true } }).catch(error => {
        if ((error as { code?: string }).code === 'P2025') throw new HttpError(404, 'SERVICE_AREA_NOT_FOUND');
        throw error;
      });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: active ? 'SERVICE_AREA_ACTIVATED' : 'SERVICE_AREA_DEACTIVATED', entityType: 'SupportedCity', entityId: city.id, details: { name: city.name } } });
      return city;
    });
  }

  async supportCases(actor: AdminActor, query: SupportCaseListQuery) {
    requirePermission(actor, 'support.read');
    const cities = actor.branches.map(branch => branch.city);
    const where: Prisma.SupportCaseWhereInput = {
      ...(actor.roles.includes('SUPER_ADMIN') ? {} : { user: { preferredCity: { in: cities } } }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { OR: [
        { referenceCode: { contains: query.search, mode: 'insensitive' } }, { subject: { contains: query.search, mode: 'insensitive' } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } }, { user: { displayName: { contains: query.search, mode: 'insensitive' } } },
      ] } : {}),
    };
    const [total, items] = await this.db.$transaction([
      this.db.supportCase.count({ where }),
      this.db.supportCase.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit, include: { user: { select: { email: true, displayName: true, preferredCity: true } }, replies: { orderBy: { createdAt: 'asc' }, select: { id: true, authorType: true, body: true, createdAt: true } } } }),
    ]);
    return { page: query.page, limit: query.limit, total, items };
  }

  async updateSupportCase(actor: AdminActor, id: string, input: { status: SupportCaseStatus; note?: string }) {
    requirePermission(actor, 'support.escalate');
    return this.db.$transaction(async tx => {
      const support = await tx.supportCase.findUnique({ where: { id }, include: { user: { select: { preferredCity: true } } } });
      if (!support) throw new HttpError(404, 'SUPPORT_CASE_NOT_FOUND');
      if (!actor.roles.includes('SUPER_ADMIN') && (!support.user.preferredCity || !actor.branches.some(branch => branch.city === support.user.preferredCity))) throw new HttpError(403, 'BRANCH_SCOPE_DENIED');
      const updated = await tx.supportCase.update({ where: { id }, data: { status: input.status }, select: { id: true, status: true, referenceCode: true, updatedAt: true } });
      if (input.note) await tx.supportCaseReply.create({ data: { caseId: id, authorType: 'INTERNAL_NOTE', body: input.note } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'SUPPORT_CASE_STATUS_CHANGED', entityType: 'SupportCase', entityId: id, details: { status: input.status, hasInternalNote: Boolean(input.note) } } });
      return updated;
    });
  }

  async replySupportCase(actor: AdminActor, id: string, body: string) {
    requirePermission(actor, 'support.respond');
    return this.db.$transaction(async tx => {
      const support = await tx.supportCase.findUnique({ where: { id }, include: { user: { select: { email: true, preferredCity: true } } } });
      if (!support) throw new HttpError(404, 'SUPPORT_CASE_NOT_FOUND');
      if (!actor.roles.includes('SUPER_ADMIN') && (!support.user.preferredCity || !actor.branches.some(branch => branch.city === support.user.preferredCity))) throw new HttpError(403, 'BRANCH_SCOPE_DENIED');
      const previousSupportReplies = await tx.supportCaseReply.count({ where: { caseId: id, authorType: 'SUPPORT' } });
      const reply = await tx.supportCaseReply.create({ data: { caseId: id, authorType: 'SUPPORT', body }, select: { id: true, authorType: true, body: true, createdAt: true } });
      await tx.supportCase.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
      if (previousSupportReplies === 0) {
        await tx.emailOutbox.create({
          data: {
            eventKey: `support-agent-first-reply/${id}`,
            recipient: support.user.email,
            templateVersion: 'support-reply-v1',
            subject: `Update on Case [${support.referenceCode}] · ${support.subject}`,
            text: `A V MOTIV support representative replied to case ${support.referenceCode}:\n\n${body}\n\nOpen the V MOTIV app to view and reply securely.`,
          },
        }).catch(() => undefined);
      }
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'SUPPORT_CASE_REPLIED', entityType: 'SupportCase', entityId: id } });
      return reply;
    });
  }

  async systemHealth(actor: AdminActor) {
    requirePermission(actor, 'system.health.read');
    const [database, outbox] = await Promise.all([
      this.db.$queryRaw<Array<{ healthy: number }>>`SELECT 1::int AS healthy`,
      this.db.emailOutbox.groupBy({ by: ['state'], _count: { _all: true } }),
    ]);
    return {
      checkedAt: new Date(),
      services: [
        { key: 'api', status: 'HEALTHY', detail: 'Authenticated Admin API responded.' },
        { key: 'database', status: database[0]?.healthy === 1 ? 'HEALTHY' : 'DEGRADED', detail: 'Connectivity check only; credentials are never returned.' },
        { key: 'email_outbox', status: outbox.some(row => row.state === 'FAILED') ? 'DEGRADED' : 'HEALTHY', detail: 'Queued and failed-message counts are shown without recipient data.' },
      ],
      emailOutbox: Object.fromEntries(outbox.map(row => [row.state, row._count._all])),
    };
  }

  async policies(actor: AdminActor) {
    requirePermission(actor, 'policy.read');
    return this.db.policyVersion.findMany({ orderBy: [{ key: 'asc' }, { version: 'desc' }], select: { id: true, key: true, version: true, title: true, status: true, effectiveAt: true, createdAt: true, createdBy: { select: { email: true, displayName: true } } } });
  }

  async proposePolicy(actor: AdminActor, input: PolicyProposal) {
    requirePermission(actor, 'policy.propose');
    return this.db.$transaction(async tx => {
      const request = await tx.approvalRequest.create({ data: { requestType: 'POLICY_VERSION', requesterId: actor.userId, requiredPermission: 'policy.approve', payload: input as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, select: { id: true, status: true, version: true, createdAt: true, expiresAt: true } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'POLICY_VERSION_PROPOSED', entityType: 'ApprovalRequest', entityId: request.id, details: { key: input.key } } });
      return request;
    });
  }

  async employees(actor: AdminActor, query: EmployeeListQuery) {
    requirePermission(actor, 'employee.read');
    const scopedBranches = actor.roles.includes('SUPER_ADMIN') ? undefined : actor.branches.map(branch => branch.id);
    const where: Prisma.EmployeeWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { OR: [
        { employeeCode: { contains: query.search, mode: 'insensitive' } },
        { designation: { contains: query.search, mode: 'insensitive' } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
        { user: { displayName: { contains: query.search, mode: 'insensitive' } } },
      ] } : {}),
      ...(query.role ? { roleAssignments: { some: { role: { key: query.role } } } } : {}),
      ...(query.branchId ? { branchAssignments: { some: { branchId: query.branchId } } } : scopedBranches ? { branchAssignments: { some: { branchId: { in: scopedBranches } } } } : {}),
    };
    if (query.branchId && scopedBranches && !scopedBranches.includes(query.branchId)) throw new HttpError(403, 'BRANCH_SCOPE_DENIED');
    const [total, rows] = await this.db.$transaction([
      this.db.employee.count({ where }),
      this.db.employee.findMany({ where, include: actorInclude, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    ]);
    return { page: query.page, limit: query.limit, total, items: rows.map(normalizeEmployee) };
  }

  async invite(actor: AdminActor, input: CreateInvitation) {
    requirePermission(actor, 'employee.invite');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.email.trim().toLowerCase()}, 0))::text`;
      const role = await tx.role.findUnique({ where: { id: input.roleId } });
      if (!role?.active) throw new HttpError(400, 'ROLE_NOT_AVAILABLE');
      if (role.privileged) throw new HttpError(403, 'PRIVILEGED_ROLE_APPROVAL_REQUIRED');
      const branches = await tx.branch.findMany({ where: { id: { in: input.branchIds }, active: true }, select: { id: true } });
      if (branches.length !== input.branchIds.length) throw new HttpError(400, 'BRANCH_NOT_AVAILABLE');
      if (!actor.roles.includes('SUPER_ADMIN') && input.branchIds.some(id => !actor.branches.some(branch => branch.id === id))) throw new HttpError(403, 'BRANCH_SCOPE_DENIED');
      const invitation = await createInvitationRecord(tx, actor.userId, input, role);
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'EMPLOYEE_INVITATION_CREATED', entityType: 'EmployeeInvitation', entityId: invitation.id, details: { role: role.key, branchIds: input.branchIds, expiresAt: invitation.expiresAt.toISOString() } } });
      return invitation;
    });
  }

  async proposePrivilegedInvitation(actor: AdminActor, input: CreateInvitation, reason: string) {
    requirePermission(actor, 'employee.invite');
    requirePermission(actor, 'role.assign');
    return this.db.$transaction(async tx => {
      const email = input.email.trim().toLowerCase();
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))::text`;
      const role = await tx.role.findUnique({ where: { id: input.roleId } });
      if (!role?.active || !role.privileged) throw new HttpError(400, 'PRIVILEGED_ROLE_REQUIRED');
      const branches = await tx.branch.findMany({ where: { id: { in: input.branchIds }, active: true }, select: { id: true } });
      if (branches.length !== input.branchIds.length) throw new HttpError(400, 'BRANCH_NOT_AVAILABLE');
      if (!actor.roles.includes('SUPER_ADMIN') && input.branchIds.some(id => !actor.branches.some(branch => branch.id === id))) throw new HttpError(403, 'BRANCH_SCOPE_DENIED');
      const existingEmployee = await tx.employee.findFirst({ where: { user: { email: { equals: email, mode: 'insensitive' } } } });
      if (existingEmployee) throw new HttpError(409, 'EMPLOYEE_ALREADY_EXISTS');
      const pendingInvitation = await tx.employeeInvitation.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, status: 'PENDING', expiresAt: { gt: new Date() } } });
      if (pendingInvitation) throw new HttpError(409, 'INVITATION_ALREADY_PENDING');
      const duplicate = await tx.approvalRequest.findFirst({ where: { requestType: 'PRIVILEGED_EMPLOYEE_INVITATION', status: 'PENDING', payload: { path: ['email'], equals: email } } });
      if (duplicate) throw new HttpError(409, 'APPROVAL_ALREADY_PENDING');
      const request = await tx.approvalRequest.create({ data: {
        requestType: 'PRIVILEGED_EMPLOYEE_INVITATION', requesterId: actor.userId, requiredPermission: 'role.assign.privileged',
        scopeBranchIds: input.branchIds, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        payload: { email, fullName: input.fullName, designation: input.designation, roleId: input.roleId, branchIds: input.branchIds, expiresInHours: input.expiresInHours, reason },
      }, select: { id: true, requestType: true, status: true, version: true, expiresAt: true, createdAt: true } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'APPROVAL_REQUEST_CREATED', entityType: 'ApprovalRequest', entityId: request.id, details: { requestType: request.requestType, role: role.key, branchIds: input.branchIds } } });
      return request;
    });
  }

  async approvals(actor: AdminActor, query: ApprovalListQuery) {
    requirePermission(actor, 'approval.read');
    let scopeWhere: Prisma.ApprovalRequestWhereInput = {};
    if (!actor.roles.includes('SUPER_ADMIN')) {
      // `hasSome` would leak a multi-branch request to an actor who only owns one
      // of its branches. Exclude requests containing any branch outside the actor scope.
      const assigned = actor.branches.map(branch => branch.id);
      const unassigned = await this.db.branch.findMany({ where: { id: { notIn: assigned } }, select: { id: true } });
      scopeWhere = { NOT: { scopeBranchIds: { hasSome: unassigned.map(branch => branch.id) } } };
    }
    const where: Prisma.ApprovalRequestWhereInput = { ...(query.status ? { status: query.status } : {}), ...scopeWhere };
    const [total, items] = await this.db.$transaction([
      this.db.approvalRequest.count({ where }),
      this.db.approvalRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit, include: { requester: { include: { user: { select: { displayName: true, email: true } } } }, decision: { include: { actor: { include: { user: { select: { displayName: true, email: true } } } } } } } }),
    ]);
    return { page: query.page, limit: query.limit, total, items };
  }

  async decideApproval(actor: AdminActor, id: string, input: ApprovalDecisionInput) {
    requirePermission(actor, 'approval.decide');
    const result = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))::text`;
      const request = await tx.approvalRequest.findUnique({ where: { id }, include: { decision: true } });
      if (!request) throw new HttpError(404, 'APPROVAL_NOT_FOUND');
      if (request.requestType === 'PRIVILEGED_EMPLOYEE_INVITATION') requirePermission(actor, 'role.assign.privileged');
      else if (request.requestType === 'POLICY_VERSION') requirePermission(actor, 'policy.approve');
      else if (request.requestType === 'SENSITIVE_EXPORT_PROPOSAL') requirePermission(actor, 'export.sensitive.approve');
      else if (request.requestType === 'DISCOUNT_REQUEST' || request.requestType === 'OFFER_REQUEST' || request.requestType === 'ACQUISITION_VALUATION') requirePermission(actor, 'approval.decide');
      else throw new HttpError(400, 'APPROVAL_TYPE_NOT_SUPPORTED');
      if (request.requesterId === actor.userId && !actor.roles.includes('SUPER_ADMIN')) throw new HttpError(409, 'SELF_APPROVAL_DENIED');
      if (request.status !== 'PENDING' || request.decision) throw new HttpError(409, 'APPROVAL_NOT_PENDING');
      if (request.version !== input.version) throw new HttpError(409, 'APPROVAL_VERSION_MISMATCH');
      if (request.expiresAt <= new Date()) {
        await tx.approvalRequest.update({ where: { id }, data: { status: 'EXPIRED' } });
        await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'APPROVAL_EXPIRED', entityType: 'ApprovalRequest', entityId: id, outcome: 'REJECTED' } });
        return { stale: true, code: 'APPROVAL_EXPIRED' } as const;
      }
      if (!actor.roles.includes('SUPER_ADMIN') && !request.scopeBranchIds.every(branchId => actor.branches.some(branch => branch.id === branchId))) throw new HttpError(403, 'BRANCH_SCOPE_DENIED');
      if (input.decision === 'REJECT') {
        await tx.approvalDecision.create({ data: { requestId: id, actorId: actor.userId, decision: 'REJECT', reason: input.reason, requestVersion: request.version } });
        await tx.approvalRequest.update({ where: { id }, data: { status: 'REJECTED' } });
        if (request.requestType === 'SENSITIVE_EXPORT_PROPOSAL') {
          await tx.exportJob.updateMany({ where: { approvalRequestId: id }, data: { status: 'REJECTED' } });
        }
        if (request.requestType === 'DISCOUNT_REQUEST') {
          const discountId = (request.payload as any)?.discountRequestId;
          if (discountId) {
            await tx.discountRequest.update({
              where: { id: discountId },
              data: { status: 'REJECTED', decisionNotes: input.reason, decidedById: actor.userId, decidedAt: new Date() },
            });
          }
        }
        if (request.requestType === 'OFFER_REQUEST' || request.requestType === 'ACQUISITION_VALUATION') {
          const valuationId = (request.payload as any)?.valuationId;
          const leadId = (request.payload as any)?.leadId;
          if (valuationId) {
            await tx.acquisitionValuation.update({
              where: { id: valuationId },
              data: {
                status: 'REJECTED',
                approvedById: actor.userId,
                approvedAt: new Date(),
                notes: input.reason ? `Rejection reason: ${input.reason}` : undefined,
                version: { increment: 1 },
              },
            });
          }
          if (leadId) {
            await tx.acquisitionLead.update({
              where: { id: leadId },
              data: { status: 'OFFER_PENDING' },
            });
          }
        }
        await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'APPROVAL_REJECTED', entityType: 'ApprovalRequest', entityId: id, details: { reason: input.reason } } });
        return { stale: false, value: { id, status: 'REJECTED' } } as const;
      }
      if (request.requestType === 'DISCOUNT_REQUEST') {
        const payload = request.payload as Record<string, any>;
        const discountReq = await tx.discountRequest.findUnique({
          where: { id: payload.discountRequestId },
          include: { quotation: true },
        });
        if (!discountReq) {
          await tx.approvalRequest.update({ where: { id }, data: { status: 'STALE' } });
          return { stale: true, code: 'APPROVAL_STALE' } as const;
        }

        await tx.discountRequest.update({
          where: { id: discountReq.id },
          data: {
            status: 'APPROVED',
            decisionNotes: input.reason,
            decidedById: actor.userId,
            decidedAt: new Date(),
          },
        });

        const finalAmount = discountReq.quotation.basePricePaise + discountReq.quotation.chargesPaise - discountReq.requestedDiscountPaise;
        await tx.buyerQuotation.update({
          where: { id: discountReq.quotationId },
          data: {
            discountPaise: discountReq.requestedDiscountPaise,
            finalAmountPaise: finalAmount,
            status: 'APPROVED',
          },
        });

        await tx.approvalDecision.create({ data: { requestId: id, actorId: actor.userId, decision: 'APPROVE', reason: input.reason, requestVersion: request.version } });
        await tx.approvalRequest.update({ where: { id }, data: { status: 'APPROVED', executedAt: new Date() } });
        await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'DISCOUNT_REQUEST_APPROVED_AND_EXECUTED', entityType: 'BuyerQuotation', entityId: discountReq.quotationId, details: { discountRequestId: discountReq.id, amount: discountReq.requestedDiscountPaise.toString() } } });
        return { stale: false, value: { id, status: 'APPROVED', discountRequestId: discountReq.id } } as const;
      }
      if (request.requestType === 'OFFER_REQUEST' || request.requestType === 'ACQUISITION_VALUATION') {
        const payload = request.payload as Record<string, any>;
        const valuation = await tx.acquisitionValuation.findUnique({
          where: { id: payload.valuationId },
          include: { lead: true },
        });
        if (!valuation) {
          await tx.approvalRequest.update({ where: { id }, data: { status: 'STALE' } });
          return { stale: true, code: 'APPROVAL_STALE' } as const;
        }

        await tx.acquisitionValuation.update({
          where: { id: valuation.id },
          data: {
            status: 'APPROVED',
            approvedById: actor.userId,
            approvedAt: new Date(),
            version: { increment: 1 },
          },
        });

        let offerId: string | undefined;
        if (valuation.leadId) {
          const latestOffer = await tx.acquisitionOffer.findFirst({
            where: { leadId: valuation.leadId },
            orderBy: { version: 'desc' },
            select: { version: true },
          });
          const nextVersion = (latestOffer?.version || 0) + 1;
          const offer = await tx.acquisitionOffer.create({
            data: {
              leadId: valuation.leadId,
              valuationId: valuation.id,
              offerAmountPaise: valuation.recommendedPurchasePaise,
              validUntil: new Date(Date.now() + 7 * 86400000),
              terms: payload.terms || 'Authorized purchase valuation approved by administration. Valid for 7 days.',
              status: 'OFFERED',
              version: nextVersion,
            },
          });
          offerId = offer.id;
          await tx.acquisitionLead.update({
            where: { id: valuation.leadId },
            data: { status: 'OFFERED' },
          });
        }

        await tx.approvalDecision.create({ data: { requestId: id, actorId: actor.userId, decision: 'APPROVE', reason: input.reason, requestVersion: request.version } });
        await tx.approvalRequest.update({ where: { id }, data: { status: 'APPROVED', executedAt: new Date() } });
        await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'OFFER_REQUEST_APPROVED_AND_EXECUTED', entityType: 'AcquisitionValuation', entityId: valuation.id, details: { valuationId: valuation.id, amount: valuation.recommendedPurchasePaise.toString(), offerId } } });
        return { stale: false, value: { id, status: 'APPROVED', valuationId: valuation.id, offerId } } as const;
      }
      if (request.requestType === 'SENSITIVE_EXPORT_PROPOSAL') {
        const exportJob = await tx.exportJob.findUnique({ where: { approvalRequestId: id } });
        let csvText = '';
        let rowCount = 0;
        if (exportJob?.resourceType === 'CUSTOMERS') {
          const users = await tx.user.findMany({ select: { id: true, email: true, displayName: true, phone: true, status: true, createdAt: true } });
          rowCount = users.length;
          csvText = generateCsv(['User ID', 'Email', 'Name', 'Phone', 'Status', 'Created At'], users.map(u => [u.id, u.email, u.displayName || '', u.phone || '', u.status, u.createdAt.toISOString()]));
        } else {
          const leads = await tx.acquisitionLead.findMany({ include: { user: { select: { email: true, displayName: true } } } });
          rowCount = leads.length;
          csvText = generateCsv(['Lead ID', 'Reference', 'Seller Name', 'Seller Phone', 'City', 'Make', 'Model', 'Status', 'Expected Price', 'Created At'], leads.map(l => [l.id, l.referenceCode, l.sellerName, l.sellerPhone, l.city, l.make, l.model, l.status, l.expectedPricePaise ? String(l.expectedPricePaise) : '', l.createdAt.toISOString()]));
        }
        if (exportJob) {
          await tx.exportJob.update({ where: { id: exportJob.id }, data: { status: 'READY', fileContent: csvText, rowCount, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) } });
        }
        await tx.approvalDecision.create({ data: { requestId: id, actorId: actor.userId, decision: 'APPROVE', reason: input.reason, requestVersion: request.version } });
        await tx.approvalRequest.update({ where: { id }, data: { status: 'APPROVED', executedAt: new Date() } });
        await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'SENSITIVE_EXPORT_APPROVED_AND_EXECUTED', entityType: 'ExportJob', entityId: exportJob?.id || id, details: { rowCount } } });
        return { stale: false, value: { id, status: 'APPROVED', exportJob } } as const;
      }
      if (request.requestType === 'POLICY_VERSION') {
        const policy = z.object({ key: z.string().min(2).max(80), title: z.string().min(3).max(160), content: z.record(z.string(), z.unknown()), effectiveAt: z.string().datetime().optional(), reason: z.string().min(8).max(500) }).safeParse(request.payload);
        if (!policy.success) { await tx.approvalRequest.update({ where: { id }, data: { status: 'STALE' } }); return { stale: true, code: 'APPROVAL_STALE' } as const; }
        const latest = await tx.policyVersion.findFirst({ where: { key: policy.data.key }, orderBy: { version: 'desc' }, select: { version: true } });
        const version = (latest?.version || 0) + 1;
        await tx.policyVersion.updateMany({ where: { key: policy.data.key, status: 'ACTIVE' }, data: { status: 'SUPERSEDED' } });
        const created = await tx.policyVersion.create({ data: { key: policy.data.key, version, title: policy.data.title, content: policy.data.content as Prisma.InputJsonValue, status: 'ACTIVE', effectiveAt: policy.data.effectiveAt ? new Date(policy.data.effectiveAt) : new Date(), createdById: request.requesterId } });
        await tx.approvalDecision.create({ data: { requestId: id, actorId: actor.userId, decision: 'APPROVE', reason: input.reason, requestVersion: request.version } });
        await tx.approvalRequest.update({ where: { id }, data: { status: 'APPROVED', executedAt: new Date() } });
        await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'POLICY_VERSION_APPROVED', entityType: 'PolicyVersion', entityId: created.id, details: { key: created.key, version } } });
        return { stale: false, value: { id, status: 'APPROVED', policy: created } } as const;
      }
      const payload = privilegedInvitationPayload.safeParse(request.payload);
      if (!payload.success) {
        await tx.approvalRequest.update({ where: { id }, data: { status: 'STALE' } });
        await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'APPROVAL_STALE', entityType: 'ApprovalRequest', entityId: id, outcome: 'REJECTED', details: { reason: 'INVALID_PAYLOAD' } } });
        return { stale: true, code: 'APPROVAL_STALE' } as const;
      }
      const role = await tx.role.findUnique({ where: { id: payload.data.roleId } });
      const branches = await tx.branch.findMany({ where: { id: { in: payload.data.branchIds }, active: true }, select: { id: true } });
      if (!role?.active || !role.privileged || branches.length !== payload.data.branchIds.length) {
        await tx.approvalRequest.update({ where: { id }, data: { status: 'STALE' } });
        await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'APPROVAL_STALE', entityType: 'ApprovalRequest', entityId: id, outcome: 'REJECTED' } });
        return { stale: true, code: 'APPROVAL_STALE' } as const;
      }
      const invitation = await createInvitationRecord(tx, request.requesterId, { ...payload.data, adminOrigin: input.adminOrigin }, role);
      await tx.approvalDecision.create({ data: { requestId: id, actorId: actor.userId, decision: 'APPROVE', reason: input.reason, requestVersion: request.version } });
      await tx.approvalRequest.update({ where: { id }, data: { status: 'APPROVED', executedAt: new Date() } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'APPROVAL_APPROVED_AND_EXECUTED', entityType: 'ApprovalRequest', entityId: id, details: { invitationId: invitation.id, requestVersion: request.version } } });
      return { stale: false, value: { id, status: 'APPROVED', invitation } } as const;
    });
    if (result.stale) throw new HttpError(409, result.code);
    return result.value;
  }

  async acceptInvitation(identity: Identity, token: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const employeeId = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tokenHash}, 0))::text`;
      const invitation = await tx.employeeInvitation.findUnique({ where: { tokenHash }, include: { role: true, branches: true } });
      if (!invitation) throw new HttpError(400, 'INVITATION_INVALID');
      if (invitation.status !== 'PENDING') throw new HttpError(409, 'INVITATION_NOT_ACTIVE');
      if (invitation.expiresAt <= new Date()) {
        await tx.employeeInvitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
        throw new HttpError(410, 'INVITATION_EXPIRED');
      }
      if (invitation.email.toLowerCase() !== identity.email.toLowerCase()) throw new HttpError(403, 'INVITATION_IDENTITY_MISMATCH');
      const user = await tx.user.upsert({
        where: { firebaseUid: identity.uid },
        update: { email: identity.email, displayName: identity.name || invitation.fullName },
        create: { firebaseUid: identity.uid, email: identity.email, displayName: identity.name || invitation.fullName },
        select: { id: true, status: true },
      });
      if (user.status !== 'ACTIVE') throw new HttpError(403, 'ACCOUNT_INACTIVE');
      const existing = await tx.employee.findUnique({ where: { userId: user.id } });
      if (existing) throw new HttpError(409, 'EMPLOYEE_ALREADY_EXISTS');
      const employee = await tx.employee.create({ data: {
        userId: user.id, role: invitation.role.key, active: true, status: 'ACTIVE', designation: invitation.designation,
        employeeCode: `VM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        mfaStatus: identity.secondFactor ? 'COMPLIANT' : 'REQUIRED',
        roleAssignments: { create: { roleId: invitation.roleId, assignedById: invitation.createdById } },
        branchAssignments: { create: invitation.branches.map(branch => ({ branchId: branch.branchId })) },
      } });
      await tx.employeeInvitation.update({ where: { id: invitation.id }, data: { status: 'ACCEPTED', acceptedAt: new Date(), activatedEmployeeId: employee.userId } });
      await tx.auditEvent.create({ data: { actorId: employee.userId, action: 'EMPLOYEE_INVITATION_ACCEPTED', entityType: 'Employee', entityId: employee.userId, details: { invitationId: invitation.id, role: invitation.role.key } } });
      return employee.userId;
    });
    const employee = await this.db.employee.findUniqueOrThrow({ where: { userId: employeeId }, include: actorInclude });
    return normalizeEmployee(employee);
  }

  async setEmployeeStatus(actor: AdminActor, employeeId: string, status: EmployeeStatus, reason: string) {
    if (status === 'DEACTIVATED') requirePermission(actor, 'employee.deactivate');
    else requirePermission(actor, 'employee.suspend');
    if (actor.userId === employeeId) throw new HttpError(409, 'SELF_STATUS_CHANGE_DENIED');
    return this.db.$transaction(async tx => {
      const target = await tx.employee.findUnique({ where: { userId: employeeId }, include: { user: true, roleAssignments: { include: { role: true } }, branchAssignments: true } });
      if (!target) throw new HttpError(404, 'EMPLOYEE_NOT_FOUND');
      if (!actor.roles.includes('SUPER_ADMIN') && target.branchAssignments.some(item => !actor.branches.some(branch => branch.id === item.branchId))) throw new HttpError(403, 'BRANCH_SCOPE_DENIED');
      if (target.roleAssignments.some(item => item.role.key === 'SUPER_ADMIN')) {
        const remaining = await tx.employee.count({ where: { userId: { not: employeeId }, active: true, status: 'ACTIVE', roleAssignments: { some: { role: { key: 'SUPER_ADMIN' } } } } });
        if (!remaining) throw new HttpError(409, 'LAST_SUPER_ADMIN_PROTECTED');
        requirePermission(actor, 'role.assign.privileged');
      }
      await tx.employee.update({ where: { userId: employeeId }, data: { status, active: status === 'ACTIVE' } });
      await tx.user.update({ where: { id: employeeId }, data: { status: status === 'ACTIVE' ? 'ACTIVE' : status } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: `EMPLOYEE_${status}`, entityType: 'Employee', entityId: employeeId, details: { reason } } });
      return { firebaseUid: target.user.firebaseUid };
    });
  }

  async audit(actor: AdminActor, page: number, limit: number) {
    requirePermission(actor, 'audit.read');
    const where: Prisma.AuditEventWhereInput = actor.roles.includes('SUPER_ADMIN') ? {} : { OR: [{ actorId: actor.userId }, { actor: { employee: { branchAssignments: { some: { branchId: { in: actor.branches.map(branch => branch.id) } } } } } }] };
    const [total, items] = await this.db.$transaction([
      this.db.auditEvent.count({ where }),
      this.db.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, select: { id: true, actorId: true, action: true, entityType: true, entityId: true, outcome: true, correlationId: true, details: true, createdAt: true } }),
    ]);
    return { page, limit, total, items };
  }

  async businessSelling(actor: AdminActor, query: BusinessSellingQuery) {
    requirePermission(actor, 'business.oversight.read');
    const branchCities = actor.branches.map(b => b.city);
    const scopeWhere: Prisma.AcquisitionLeadWhereInput = actor.roles.includes('SUPER_ADMIN') ? {} : { city: { in: branchCities } };
    const searchWhere: Prisma.AcquisitionLeadWhereInput = query.search ? {
      OR: [
        { sellerName: { contains: query.search, mode: 'insensitive' } },
        { sellerPhone: { contains: query.search } },
        { referenceCode: { contains: query.search, mode: 'insensitive' } },
        { make: { contains: query.search, mode: 'insensitive' } },
        { model: { contains: query.search, mode: 'insensitive' } },
      ],
    } : {};
    const where: Prisma.AcquisitionLeadWhereInput = {
      ...scopeWhere,
      ...searchWhere,
      ...(query.status ? { status: query.status as any } : {}),
    };
    const [total, items, statusCounts] = await this.db.$transaction([
      this.db.acquisitionLead.count({ where }),
      this.db.acquisitionLead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          user: { select: { email: true, displayName: true, phone: true } },
          offers: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      (this.db.acquisitionLead as any).groupBy({
        by: ['status'],
        where: scopeWhere,
        orderBy: { status: 'asc' },
        _count: { status: true },
      }),
    ]);
    const counts: Record<string, number> = {};
    for (const item of statusCounts) {
      counts[item.status] = (item._count as any)?.status ?? 0;
    }
    const safeItems = items.map(item => ({
      ...item,
      expectedPricePaise: item.expectedPricePaise !== null && item.expectedPricePaise !== undefined ? item.expectedPricePaise.toString() : null,
      offers: item.offers.map(offer => ({
        ...offer,
        offerAmountPaise: offer.offerAmountPaise.toString(),
      })),
    }));
    return { page: query.page, limit: query.limit, total, items: safeItems, counts };
  }

  async businessBuying(actor: AdminActor, query: BusinessBuyingQuery) {
    requirePermission(actor, 'business.oversight.read');
    const branchCities = actor.branches.map(b => b.city);
    const scopeWhere = actor.roles.includes('SUPER_ADMIN') ? {} : { serviceCity: { in: branchCities } };
    const [testDrivesTotal, testDrives, enquiriesTotal, enquiries] = await this.db.$transaction([
      this.db.testDriveRequest.count({ where: scopeWhere }),
      this.db.testDriveRequest.findMany({
        where: scopeWhere,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          user: { select: { email: true, displayName: true } },
          listing: { include: { vehicle: true } },
        },
      }),
      this.db.purchaseEnquiry.count(),
      this.db.purchaseEnquiry.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          user: { select: { email: true, displayName: true } },
          listing: { include: { vehicle: true } },
        },
      }),
    ]);
    const safeTestDrives = testDrives.map(td => ({
      ...td,
      listing: {
        ...td.listing,
        pricePaise: td.listing.pricePaise.toString(),
      },
    }));
    const safeEnquiries = enquiries.map(enq => ({
      ...enq,
      listing: {
        ...enq.listing,
        pricePaise: enq.listing.pricePaise.toString(),
      },
    }));
    return {
      testDrives: { total: testDrivesTotal, items: safeTestDrives },
      purchaseEnquiries: { total: enquiriesTotal, items: safeEnquiries },
    };
  }

  async businessInventory(actor: AdminActor, query: BusinessInventoryQuery) {
    requirePermission(actor, 'business.oversight.read');
    const where: Prisma.VehicleListingWhereInput = {
      ...(query.status ? { status: query.status as any } : {}),
      ...(query.search ? {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { vehicle: { make: { contains: query.search, mode: 'insensitive' } } },
          { vehicle: { model: { contains: query.search, mode: 'insensitive' } } },
        ],
      } : {}),
    };
    const [total, items, statusCounts] = await this.db.$transaction([
      this.db.vehicleListing.count({ where }),
      this.db.vehicleListing.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          vehicle: true,
          media: { orderBy: { displayOrder: 'asc' }, take: 1 },
          _count: { select: { testDriveRequests: true, purchaseEnquiries: true, wishlist: true } },
        },
      }),
      (this.db.vehicleListing as any).groupBy({
        by: ['status'],
        orderBy: { status: 'asc' },
        _count: { status: true },
      }),
    ]);
    const counts: Record<string, number> = {};
    for (const item of statusCounts) {
      counts[item.status] = (item._count as any)?.status ?? 0;
    }
    const safeItems = items.map(item => ({
      ...item,
      pricePaise: item.pricePaise.toString(),
    }));
    return { page: query.page, limit: query.limit, total, items: safeItems, counts };
  }

  async businessFinance(actor: AdminActor) {
    requirePermission(actor, 'business.oversight.read');
    const [activeListings, totalLeads, offers, pendingPayouts] = await this.db.$transaction([
      this.db.vehicleListing.findMany({
        where: { status: 'PUBLISHED' },
        select: { pricePaise: true },
      }),
      this.db.acquisitionLead.count(),
      this.db.acquisitionOffer.aggregate({
        _sum: { offerAmountPaise: true },
        _count: { id: true },
      }),
      this.db.acquisitionLead.count({
        where: { status: 'ACCEPTED' },
      }),
    ]);
    const activeInventoryValuePaise = activeListings.reduce((sum, item) => sum + BigInt(item.pricePaise), 0n);
    return {
      activeInventoryCount: activeListings.length,
      activeInventoryValueRupees: Number(activeInventoryValuePaise / 100n),
      totalAcquisitionLeads: totalLeads,
      totalOffersIssued: offers._count.id,
      totalOffersValueRupees: Number((offers._sum.offerAmountPaise || 0n) / 100n),
      pendingSettlements: pendingPayouts,
      reconciliationStatus: 'HEALTHY',
    };
  }

  async masterData(actor: AdminActor, category?: string) {
    requirePermission(actor, 'masterdata.read');
    return this.db.masterDataItem.findMany({
      where: category ? { category } : {},
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async createMasterDataItem(actor: AdminActor, input: MasterDataItemInput) {
    requirePermission(actor, 'masterdata.manage');
    const item = await this.db.masterDataItem.create({
      data: {
        category: input.category.trim().toUpperCase(),
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        parentCode: input.parentCode ? input.parentCode.trim().toUpperCase() : null,
        metadata: (input.metadata || {}) as Prisma.InputJsonValue,
      },
    });
    await this.db.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: 'MASTER_DATA_CREATED',
        entityType: 'MasterDataItem',
        entityId: item.id,
        details: { category: item.category, code: item.code, name: item.name },
      },
    });
    return item;
  }

  async updateMasterDataItem(actor: AdminActor, id: string, input: MasterDataUpdateInput) {
    requirePermission(actor, 'masterdata.manage');
    const item = await this.db.masterDataItem.update({
      where: { id },
      data: {
        ...(typeof input.name === 'string' ? { name: input.name.trim() } : {}),
        ...(typeof input.active === 'boolean' ? { active: input.active } : {}),
        ...(input.metadata ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
      },
    });
    await this.db.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: 'MASTER_DATA_UPDATED',
        entityType: 'MasterDataItem',
        entityId: item.id,
        details: { active: item.active, name: item.name },
      },
    });
    return item;
  }

  async communicationsOutbox(actor: AdminActor, query: CommunicationsOutboxQuery) {
    requirePermission(actor, 'email.delivery.read');
    const where: Prisma.EmailOutboxWhereInput = query.state ? { state: query.state as any } : {};
    const [total, items, stateCounts] = await this.db.$transaction([
      this.db.emailOutbox.count({ where }),
      this.db.emailOutbox.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      (this.db.emailOutbox as any).groupBy({
        by: ['state'],
        orderBy: { state: 'asc' },
        _count: { state: true },
      }),
    ]);
    const summary: Record<string, number> = {};
    for (const s of stateCounts) {
      summary[s.state] = (s._count as any)?.state ?? 0;
    }
    const safeItems = items.map(item => ({
      ...item,
      recipient: maskEmail(item.recipient),
      maxAttempts: 6,
    }));
    return { page: query.page, limit: query.limit, total, items: safeItems, summary };
  }

  async communicationsTemplates(actor: AdminActor) {
    requirePermission(actor, 'email.delivery.read');
    return [
      { key: 'employee-invitation-v1', name: 'Employee Invitation', type: 'TRANSACTIONAL', description: 'Sent when an administrator invites an employee into an approved role and branch scope.' },
      { key: 'test-drive-requested-v1', name: 'Test Drive Confirmation', type: 'TRANSACTIONAL', description: 'Sent to a customer upon booking a test drive at a V MOTIV Hub or doorstep address.' },
      { key: 'acquisition-offer-v1', name: 'Selling Valuation & Offer', type: 'TRANSACTIONAL', description: 'Notifies a seller when an evaluated acquisition offer is made on their car.' },
      { key: 'support-reply-v1', name: 'Concierge Case Reply', type: 'TRANSACTIONAL', description: 'Delivered to a customer when concierge operations replies to their support ticket.' },
      { key: 'welcome-v1', name: 'Customer Welcome', type: 'TRANSACTIONAL', description: 'Initial onboarding greeting when a customer authenticates their profile.' },
    ];
  }

  async retryEmailOutbox(actor: AdminActor, id: string) {
    requirePermission(actor, 'email.delivery.read');
    const updated = await this.db.emailOutbox.update({
      where: { id },
      data: {
        state: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
        leaseUntil: null,
        lastErrorCode: null,
      },
    });
    await this.db.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: 'EMAIL_OUTBOX_RETRY',
        entityType: 'EmailOutbox',
        entityId: id,
        details: { eventKey: updated.eventKey },
      },
    });
    return { id, state: updated.state };
  }

  async privacyRequests(actor: AdminActor, query: PrivacyRequestListQuery) {
    requirePermission(actor, 'privacy.request.manage');
    const cities = actor.branches.map(branch => branch.city);
    const where: Prisma.PrivacyRequestWhereInput = {
      ...(actor.roles.includes('SUPER_ADMIN') ? {} : { user: { preferredCity: { in: cities } } }),
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, items] = await this.db.$transaction([
      this.db.privacyRequest.count({ where }),
      this.db.privacyRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          user: { select: { email: true, displayName: true, phone: true } },
        },
      }),
    ]);
    return { page: query.page, limit: query.limit, total, items };
  }

  async updatePrivacyRequest(actor: AdminActor, id: string, status: string, resolution?: string) {
    requirePermission(actor, 'privacy.request.manage');
    const request = await this.db.privacyRequest.findUnique({
      where: { id },
      include: { user: { select: { preferredCity: true } } },
    });
    if (!request) throw new HttpError(404, 'PRIVACY_REQUEST_NOT_FOUND');
    if (!actor.roles.includes('SUPER_ADMIN') && (!request.user.preferredCity || !actor.branches.some(branch => branch.city === request.user.preferredCity))) {
      throw new HttpError(403, 'BRANCH_SCOPE_DENIED');
    }
    const resolved = status === 'COMPLETED' || status === 'REJECTED';
    const updated = await this.db.privacyRequest.update({
      where: { id },
      data: {
        status,
        resolution: resolution?.trim() || null,
        resolvedAt: resolved ? new Date() : null,
        resolvedById: resolved ? actor.userId : null,
      },
    });
    await this.db.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: resolved ? 'PRIVACY_REQUEST_RESOLVED' : 'PRIVACY_REQUEST_STATUS_CHANGED',
        entityType: 'PrivacyRequest',
        entityId: id,
        details: { status, resolution },
      },
    });
    return updated;
  }

  async exportJobs(actor: AdminActor, page: number, limit: number) {
    requirePermission(actor, 'export.create');
    const where: Prisma.ExportJobWhereInput = actor.roles.includes('SUPER_ADMIN') ? {} : { requesterId: actor.userId };
    const [total, items] = await this.db.$transaction([
      this.db.exportJob.count({ where }),
      this.db.exportJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          resourceType: true,
          scope: true,
          format: true,
          sensitive: true,
          status: true,
          rowCount: true,
          expiresAt: true,
          downloadCount: true,
          createdAt: true,
          requester: { select: { user: { select: { displayName: true, email: true } } } },
        },
      }),
    ]);
    return { page, limit, total, items };
  }

  async createExportJob(actor: AdminActor, input: CreateExportJobInput) {
    requirePermission(actor, 'export.create');
    if (input.sensitive) {
      const approval = await this.db.approvalRequest.create({
        data: {
          requestType: 'SENSITIVE_EXPORT_PROPOSAL',
          requesterId: actor.userId,
          requiredPermission: 'export.sensitive.approve',
          scopeBranchIds: actor.branches.map(b => b.id),
          payload: {
            resourceType: input.resourceType,
            reason: input.reason || 'Controlled compliance export',
            scope: input.scope || 'ALL',
          },
          expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        },
      });
      const job = await this.db.exportJob.create({
        data: {
          resourceType: input.resourceType,
          scope: input.scope || 'ALL',
          sensitive: true,
          status: 'APPROVAL_PENDING',
          requesterId: actor.userId,
          approvalRequestId: approval.id,
          expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        },
      });
      await this.db.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'SENSITIVE_EXPORT_REQUESTED',
          entityType: 'ExportJob',
          entityId: job.id,
          details: { approvalRequestId: approval.id, resourceType: input.resourceType },
        },
      });
      return job;
    }

    let csvText = '';
    let rowCount = 0;
    if (input.resourceType === 'INVENTORY') {
      const items = await this.db.vehicleListing.findMany({ include: { vehicle: true } });
      rowCount = items.length;
      csvText = generateCsv(['Listing ID', 'Title', 'Make', 'Model', 'Year', 'Price (INR)', 'Status'], items.map(i => [i.id, i.title, i.vehicle.make, i.vehicle.model, i.vehicle.manufacturingYear, Number(i.pricePaise / 100n), i.status]));
    } else if (input.resourceType === 'AUDIT') {
      const logs = await this.db.auditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
      rowCount = logs.length;
      csvText = generateCsv(['Time', 'Action', 'Target Type', 'Target ID', 'Outcome'], logs.map(l => [l.createdAt.toISOString(), l.action, l.entityType, l.entityId, l.outcome]));
    } else {
      const staff = await this.db.employee.findMany({ include: { user: { select: { email: true, displayName: true } } } });
      rowCount = staff.length;
      csvText = generateCsv(['Employee ID', 'Name', 'Email', 'Role', 'Status', 'MFA'], staff.map(s => [s.employeeCode || '', s.user.displayName || '', s.user.email, s.role, s.status, s.mfaStatus]));
    }

    const job = await this.db.exportJob.create({
      data: {
        resourceType: input.resourceType,
        scope: input.scope || 'ALL',
        sensitive: false,
        status: 'READY',
        requesterId: actor.userId,
        fileContent: csvText,
        rowCount,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      },
    });
    await this.db.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: 'EXPORT_JOB_CREATED',
        entityType: 'ExportJob',
        entityId: job.id,
        details: { resourceType: input.resourceType, rowCount },
      },
    });
    return job;
  }

  async downloadExport(actor: AdminActor, id: string) {
    requirePermission(actor, 'export.create');
    const job = await this.db.exportJob.findUnique({ where: { id } });
    if (!job) throw new HttpError(404, 'EXPORT_NOT_FOUND');
    if (job.status !== 'READY' || !job.fileContent) throw new HttpError(409, 'EXPORT_NOT_READY');
    if (job.expiresAt <= new Date()) throw new HttpError(410, 'EXPORT_EXPIRED');
    if (!actor.roles.includes('SUPER_ADMIN') && job.requesterId !== actor.userId) throw new HttpError(403, 'EXPORT_ACCESS_DENIED');

    await this.db.exportJob.update({
      where: { id },
      data: { downloadCount: { increment: 1 } },
    });
    await this.db.auditEvent.create({
      data: {
        actorId: actor.userId,
        action: 'EXPORT_DOWNLOADED',
        entityType: 'ExportJob',
        entityId: id,
        details: { downloadCount: job.downloadCount + 1 },
      },
    });
    return {
      fileContent: job.fileContent,
      resourceType: job.resourceType,
      format: job.format,
    };
  }
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const rowLines = rows.map(row => row.map(escapeCsvCell).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}

function maskEmail(email: string): string {
  const parts = email.split('@');
  const local = parts[0] ?? '';
  const domain = parts[1] ?? '';
  if (!domain) return email;
  const maskedLocal = local.length <= 2 ? `${local[0] ?? '*'}*` : `${local.slice(0, 2)}***${local.slice(-1)}`;
  return `${maskedLocal}@${domain}`;
}
