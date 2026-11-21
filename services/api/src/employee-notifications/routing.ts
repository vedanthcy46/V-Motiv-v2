// Who should be told. The engine never answers "everyone with this role": it starts from the person the work belongs to, then the
// queue's designated owners, then people who both hold the permission AND are authorised for the event's branch, and only as a flagged,
// capped fallback does it widen to permission holders. Eligibility is always re-checked against live employee data.
import type { Prisma, PrismaClient } from '@prisma/client';
import type { EventDefinition, RecipientStrategy } from './catalog.js';

type Db = PrismaClient | Prisma.TransactionClient;

/** A policy as applied: the catalog definition with any stored override merged in. */
export interface EffectivePolicy extends EventDefinition { policyVersion: number; enabled: boolean }

export interface RoutingInput {
  policy: EffectivePolicy;
  /** The branch the EVENT affects. (Whether an employee may access a branch is a different question, answered per employee.) */
  branchId?: string | null;
  /** The people the business gave the work to (lead owner, assigned inspector, payout preparer…). */
  assigneeUserIds?: string[];
  /** People who must not be told: the actor, and for approvals the person who asked. */
  excludeUserIds?: string[];
}

export interface Recipient { userId: string; reason: RecipientStrategy | 'FALLBACK'; branchId: string | null }
export interface RoutingResult {
  recipients: Recipient[];
  /** The designated owner was missing, so permission holders in the branch were used (capped). Admins should fix the queue. */
  fallbackUsed: boolean;
  skipped: Array<{ userId: string; reason: string }>;
}

export const FALLBACK_CAP = 8;

interface EmployeeFacts {
  userId: string;
  active: boolean;
  userActive: boolean;
  isGlobal: boolean;
  roles: Set<string>;
  permissions: Set<string>;
  branchIds: Set<string>;
  reportsToId: string | null;
}

const employeeSelect = {
  userId: true, active: true, status: true, role: true, permissions: true, reportsToId: true,
  user: { select: { status: true } },
  branchAssignments: { select: { branchId: true } },
  roleAssignments: { select: { role: { select: { key: true, permissions: { select: { permission: { select: { key: true } } } } } } } },
} satisfies Prisma.EmployeeSelect;

type EmployeeRow = Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>;

function facts(row: EmployeeRow): EmployeeFacts {
  const roles = new Set<string>([row.role, ...row.roleAssignments.map(item => item.role.key)]);
  const permissions = new Set<string>(row.permissions);
  for (const assignment of row.roleAssignments) for (const link of assignment.role.permissions) permissions.add(link.permission.key);
  return {
    userId: row.userId,
    active: row.active && row.status === 'ACTIVE',
    userActive: row.user.status === 'ACTIVE',
    isGlobal: roles.has('SUPER_ADMIN'),
    roles, permissions,
    branchIds: new Set(row.branchAssignments.map(item => item.branchId)),
    reportsToId: row.reportsToId,
  };
}

export async function loadEmployeeFacts(db: Db, userIds: string[]): Promise<Map<string, EmployeeFacts>> {
  if (userIds.length === 0) return new Map();
  const rows = await db.employee.findMany({ where: { userId: { in: [...new Set(userIds)] } }, select: employeeSelect });
  return new Map(rows.map(row => [row.userId, facts(row)]));
}

/** Why this employee may not receive the event, or null when they may. Pure, so it is easy to test. */
export function ineligibleReason(employee: EmployeeFacts | undefined, policy: EventDefinition, branchId: string | null | undefined, opts: { assigned: boolean }): string | null {
  if (!employee) return 'NOT_AN_EMPLOYEE';
  if (!employee.active || !employee.userActive) return 'NOT_ACTIVE';
  if (opts.assigned) return null; // The business gave them this work; the live-employee check above is the only gate.
  // The permission gate. A permission wins over roles; with neither there is no gate.
  if (policy.requiredPermission) {
    if (!employee.permissions.has(policy.requiredPermission)) return 'MISSING_PERMISSION';
  } else if (policy.requiredRoles?.length && !policy.requiredRoles.some(role => employee.roles.has(role))) {
    return 'MISSING_ROLE';
  }
  if (policy.branchScope === 'GLOBAL') return employee.isGlobal || employee.roles.has('SECURITY_ADMIN') || employee.roles.has('ADMIN') ? null : 'GLOBAL_SCOPE_REQUIRED';
  if (policy.branchScope === 'ASSIGNED') return 'NOT_ASSIGNED';
  // BRANCH: the event's branch must be one the employee is authorised for. With no branch on the event only global staff qualify.
  if (!branchId) return employee.isGlobal ? null : 'EVENT_BRANCH_UNKNOWN';
  return employee.isGlobal || employee.branchIds.has(branchId) ? null : 'BRANCH_NOT_AUTHORISED';
}

async function queueMembers(db: Db, queueKey: string, branchId: string | null | undefined) {
  return db.notificationQueueMember.findMany({
    where: { queueKey, active: true, OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])] },
    select: { userId: true, memberRole: true, branchId: true },
  });
}

/** Permission/role holders for a branch: the capped fallback and the approver pool. */
async function holders(db: Db, policy: EventDefinition, branchId: string | null | undefined, cap: number): Promise<string[]> {
  const or: Prisma.EmployeeWhereInput[] = [];
  if (policy.requiredPermission) {
    or.push({ permissions: { has: policy.requiredPermission } }, { roleAssignments: { some: { role: { permissions: { some: { permission: { key: policy.requiredPermission } } } } } } });
  } else if (policy.requiredRoles?.length) {
    or.push({ role: { in: policy.requiredRoles as any } }, { roleAssignments: { some: { role: { key: { in: policy.requiredRoles as any } } } } });
  } else {
    return []; // No gate to look people up by: never guess.
  }
  const gate: Prisma.EmployeeWhereInput[] = [{ OR: or }];
  if (branchId) gate.push({ OR: [{ branchAssignments: { some: { branchId } } }, { role: 'SUPER_ADMIN' }] });
  const rows = await db.employee.findMany({
    where: { active: true, status: 'ACTIVE', user: { status: 'ACTIVE' }, AND: gate },
    orderBy: { createdAt: 'asc' },
    take: cap,
    select: { userId: true },
  });
  return rows.map(row => row.userId);
}

export async function resolveRecipients(db: Db, input: RoutingInput): Promise<RoutingResult> {
  const { policy } = input;
  const branchId = input.branchId ?? null;
  const exclude = new Set(input.excludeUserIds ?? []);
  const assignees = [...new Set(input.assigneeUserIds ?? [])];
  const skipped: RoutingResult['skipped'] = [];
  const chosen = new Map<string, Recipient>();
  let fallbackUsed = false;

  type Candidate = { userId: string; reason: RecipientStrategy | 'FALLBACK'; assigned: boolean };
  const candidates: Candidate[] = [];
  const add = (userIds: string[], reason: Candidate['reason'], assigned = false) => { for (const userId of userIds) candidates.push({ userId, reason, assigned }); };

  for (const strategy of policy.strategies) {
    switch (strategy) {
      case 'ASSIGNED_EMPLOYEE':
      case 'INSPECTOR_ASSIGNEE':
        add(assignees, strategy, true);
        break;
      case 'FINANCE_CASE_OWNER': {
        if (assignees.length) { add(assignees, strategy, true); break; }
        const members = policy.queueKey ? await queueMembers(db, policy.queueKey, branchId) : [];
        if (members.length) add(members.map(m => m.userId), strategy);
        else { fallbackUsed = true; add(await holders(db, policy, branchId, FALLBACK_CAP), 'FALLBACK'); }
        break;
      }
      case 'BRANCH_QUEUE_OWNER':
      case 'AUTHORIZED_SUBSCRIBERS':
      case 'ASSIGNED_TEAM':
      case 'ADMIN_RESPONDER': {
        const members = policy.queueKey ? await queueMembers(db, policy.queueKey, branchId) : [];
        const owners = members.filter(member => member.memberRole === 'OWNER');
        const pool = strategy === 'BRANCH_QUEUE_OWNER' || strategy === 'ADMIN_RESPONDER' ? (owners.length ? owners : members) : members;
        if (pool.length) { add(pool.map(m => m.userId), strategy); break; }
        fallbackUsed = true;
        if (strategy === 'ADMIN_RESPONDER') {
          // Nobody designated: the platform's own administrators, never every employee.
          const admins = await db.employee.findMany({ where: { active: true, status: 'ACTIVE', user: { status: 'ACTIVE' }, OR: [{ role: { in: ['SUPER_ADMIN', 'SECURITY_ADMIN'] } }, { roleAssignments: { some: { role: { key: { in: ['SUPER_ADMIN', 'SECURITY_ADMIN'] } } } } }] }, orderBy: { createdAt: 'asc' }, take: FALLBACK_CAP, select: { userId: true } });
          add(admins.map(row => row.userId), 'FALLBACK', true);
        } else {
          add(await holders(db, policy, branchId, FALLBACK_CAP), 'FALLBACK');
        }
        break;
      }
      case 'DESIGNATED_APPROVER': {
        const members = policy.queueKey ? await queueMembers(db, policy.queueKey, branchId) : [];
        if (members.length) add(members.map(m => m.userId), strategy);
        else add(await holders(db, policy, branchId, 50), strategy);
        break;
      }
    }
  }

  const loaded = await loadEmployeeFacts(db, candidates.map(candidate => candidate.userId));
  for (const candidate of candidates) {
    if (exclude.has(candidate.userId)) { skipped.push({ userId: candidate.userId, reason: 'EXCLUDED' }); continue; }
    if (chosen.has(candidate.userId)) continue; // Two roles or two strategies matched: one notification.
    const why = ineligibleReason(loaded.get(candidate.userId), policy, branchId, { assigned: candidate.assigned });
    if (why) { skipped.push({ userId: candidate.userId, reason: why }); continue; }
    chosen.set(candidate.userId, { userId: candidate.userId, reason: candidate.reason, branchId });
  }
  return { recipients: [...chosen.values()], fallbackUsed: fallbackUsed && chosen.size > 0, skipped };
}
