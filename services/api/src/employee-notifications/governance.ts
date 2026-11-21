// Admin-facing views of the notification system: routing policy, queue ownership, pipeline health, and the Activity Monitor.
// The Activity Monitor is deliberately separate from notifications: it reads the audit trail, it never creates alerts.
import type { Prisma, PrismaClient } from '@prisma/client';
import { HttpError } from '../errors.js';
import { EVENT_CATALOG } from './catalog.js';
import { catalogSummary, getEffectivePolicy } from './policy.js';
import { loadEmployeeFacts } from './routing.js';

export const QUEUE_KEYS = ['SALES_LEADS', 'OPS_DISPATCH', 'OPS_ACQUISITIONS', 'OPS_INVENTORY', 'OPS_SERVICE', 'OPS_RENTALS', 'FINANCE_PAYOUTS', 'FINANCE_RECON', 'INSPECTION_REVIEW', 'ADMIN_SECURITY'] as const;

export async function routingOverview(db: PrismaClient) {
  const stored = await db.notificationRoutingPolicy.findMany({ orderBy: [{ eventType: 'asc' }, { version: 'desc' }], distinct: ['eventType'] });
  const storedBy = new Map(stored.map(row => [row.eventType, row]));
  const members = await db.notificationQueueMember.groupBy({ by: ['queueKey'], where: { active: true }, _count: { _all: true } });
  const owners = await db.notificationQueueMember.groupBy({ by: ['queueKey'], where: { active: true, memberRole: 'OWNER' }, _count: { _all: true } });
  const ownerCount = new Map(owners.map(row => [row.queueKey, row._count._all]));
  const memberCount = new Map(members.map(row => [row.queueKey, row._count._all]));
  return {
    events: catalogSummary().map(def => ({ ...def, policyVersion: storedBy.get(def.eventType)?.version ?? 0, overridden: storedBy.has(def.eventType) })),
    queues: QUEUE_KEYS.map(queueKey => ({ queueKey, members: memberCount.get(queueKey) ?? 0, owners: ownerCount.get(queueKey) ?? 0, hasOwner: (ownerCount.get(queueKey) ?? 0) > 0 })),
  };
}

export async function effectivePolicyFor(db: PrismaClient, eventType: string) {
  const policy = await getEffectivePolicy(db, eventType);
  if (!policy) throw new HttpError(404, 'UNKNOWN_EVENT_TYPE');
  return { eventType, policyVersion: policy.policyVersion, enabled: policy.enabled, severity: policy.severity, strategies: policy.strategies, branchScope: policy.branchScope, channels: policy.channels, requiresAck: policy.requiresAck, requiredPermission: policy.requiredPermission ?? null, escalationPolicyKey: policy.escalationPolicyKey ?? null, dedupWindowMinutes: policy.dedupWindowMinutes };
}

export async function listQueueMembers(db: PrismaClient, queueKey?: string) {
  const rows = await db.notificationQueueMember.findMany({ where: { active: true, ...(queueKey ? { queueKey } : {}) }, orderBy: [{ queueKey: 'asc' }, { createdAt: 'asc' }] });
  const users = await db.user.findMany({ where: { id: { in: rows.map(row => row.userId) } }, select: { id: true, displayName: true, email: true } });
  const byId = new Map(users.map(user => [user.id, user]));
  return rows.map(row => ({ id: row.id, queueKey: row.queueKey, branchId: row.branchId, memberRole: row.memberRole, userId: row.userId, name: byId.get(row.userId)?.displayName ?? byId.get(row.userId)?.email ?? null }));
}

export async function addQueueMember(db: PrismaClient, input: { queueKey: string; userId: string; branchId?: string | null; memberRole?: 'OWNER' | 'MEMBER' }, actorId: string) {
  if (!(QUEUE_KEYS as readonly string[]).includes(input.queueKey)) throw new HttpError(400, 'UNKNOWN_QUEUE');
  const facts = (await loadEmployeeFacts(db, [input.userId])).get(input.userId);
  if (!facts || !facts.active) throw new HttpError(400, 'EMPLOYEE_NOT_ACTIVE');
  // A branch-bound owner must actually work in that branch.
  if (input.branchId && !facts.isGlobal && !facts.branchIds.has(input.branchId)) throw new HttpError(400, 'EMPLOYEE_NOT_IN_BRANCH');
  const existing = await db.notificationQueueMember.findFirst({ where: { queueKey: input.queueKey, userId: input.userId, branchId: input.branchId ?? null } });
  const member = existing
    ? await db.notificationQueueMember.update({ where: { id: existing.id }, data: { active: true, memberRole: input.memberRole ?? existing.memberRole } })
    : await db.notificationQueueMember.create({ data: { queueKey: input.queueKey, userId: input.userId, branchId: input.branchId ?? null, memberRole: input.memberRole ?? 'MEMBER' } });
  await db.auditEvent.create({ data: { actorId, action: 'NOTIFICATION_QUEUE_MEMBER_SET', entityType: 'NotificationQueueMember', entityId: member.id, details: { queueKey: input.queueKey, branchId: input.branchId ?? null, memberRole: member.memberRole } } });
  return member;
}

export async function removeQueueMember(db: PrismaClient, id: string, actorId: string) {
  const result = await db.notificationQueueMember.updateMany({ where: { id, active: true }, data: { active: false } });
  if (result.count === 0) throw new HttpError(404, 'QUEUE_MEMBER_NOT_FOUND');
  await db.auditEvent.create({ data: { actorId, action: 'NOTIFICATION_QUEUE_MEMBER_REMOVED', entityType: 'NotificationQueueMember', entityId: id } });
  return { removed: true };
}

/** Pipeline health: is the outbox moving, what is stuck or dead, and is any queue without an owner. */
export async function pipelineHealth(db: PrismaClient, now = new Date()) {
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const [byStatus, oldestPending, dead, unrouted, failedDeliveries, pushFailures, devices, ackOverdue, queues] = await Promise.all([
    db.domainOutboxEvent.groupBy({ by: ['status'], _count: { _all: true } }),
    db.domainOutboxEvent.findFirst({ where: { status: { in: ['PENDING', 'FAILED'] } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    db.domainOutboxEvent.findMany({ where: { status: 'DEAD' }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, eventType: true, aggregateId: true, attempts: true, lastError: true, createdAt: true } }),
    db.domainOutboxEvent.findMany({ where: { status: 'PROCESSED', createdAt: { gte: since } }, select: { eventType: true, routing: true } }),
    db.notificationDelivery.count({ where: { status: 'FAILED', createdAt: { gte: since } } }),
    db.pushTicket.count({ where: { status: 'FAILED' as any, createdAt: { gte: since } } }).catch(() => 0),
    db.pushDevice.count({ where: { active: true } }),
    db.notification.count({ where: { requiresAck: true, acknowledgedAt: null, resolvedAt: null, supersededAt: null, createdAt: { lt: new Date(now.getTime() - 3_600_000) }, module: { not: null } } }),
    routingOverview(db).then(view => view.queues),
  ]);
  const routing = unrouted.map(row => ({ type: row.eventType, r: (row.routing ?? {}) as { recipients?: number; fallbackUsed?: boolean } }));
  const noRecipients = routing.filter(item => item.r.recipients === 0);
  return {
    generatedAt: now,
    outbox: Object.fromEntries(byStatus.map(row => [row.status, row._count._all])) as Record<string, number>,
    oldestPendingSeconds: oldestPending ? Math.round((now.getTime() - oldestPending.createdAt.getTime()) / 1000) : 0,
    deadEvents: dead,
    last24h: {
      processed: routing.length,
      usedFallback: routing.filter(item => item.r.fallbackUsed).length,
      reachedNobody: noRecipients.length,
      reachedNobodyByType: Object.entries(noRecipients.reduce<Record<string, number>>((acc, item) => { acc[item.type] = (acc[item.type] ?? 0) + 1; return acc; }, {})).map(([eventType, count]) => ({ eventType, count })),
      failedDeliveries, pushFailures,
    },
    activeDevices: devices,
    unacknowledgedOverOneHour: ackOverdue,
    queuesWithoutOwner: queues.filter(queue => !queue.hasOwner).map(queue => queue.queueKey),
    catalog: { total: EVENT_CATALOG.length, emitted: EVENT_CATALOG.filter(def => def.emitted).length },
  };
}

// ------------------------------------------------------------------------------------------------------ activity monitor
const DOMAIN_PREFIXES: Record<string, { entityTypes: string[]; actionPrefixes: string[] }> = {
  SALES: { entityTypes: ['AcquisitionLead', 'PurchaseEnquiry', 'BuyerQuotation', 'DiscountRequest', 'TestDriveRequest', 'AcquisitionOffer', 'VehicleReservation'], actionPrefixes: ['SELLER_LEAD', 'MANUAL_', 'RETAIL_QUOTATION', 'DISCOUNT', 'ACQUISITION_OFFER', 'TEST_DRIVE'] },
  OPERATIONS: { entityTypes: ['InspectionRequest', 'AcquisitionCase', 'VehicleStockUnit', 'RefurbishmentWorkOrder', 'ServiceRequest', 'RentalBooking', 'RentalFleetVehicle'], actionPrefixes: ['INSPECTION_REQUESTED', 'VEHICLE_', 'SERVICE_', 'RENTAL_', 'ACQUISITION_'] },
  FINANCE: { entityTypes: ['FinancePayoutInstruction', 'BuyerPaymentObligation', 'RefundCase', 'IncomingReceipt'], actionPrefixes: ['FINANCE_', 'PAYMENT_', 'REFUND_'] },
  INSPECTION: { entityTypes: ['InspectionReport', 'InspectionAssignment'], actionPrefixes: ['INSPECTION_'] },
  ADMIN: { entityTypes: ['ApprovalRequest', 'Employee', 'ExportJob', 'PolicyVersion', 'NotificationQueueMember', 'Role'], actionPrefixes: ['APPROVAL_', 'EMPLOYEE_', 'SENSITIVE_EXPORT', 'POLICY_', 'ROLE_', 'NOTIFICATION_'] },
};

export function domainOf(action: string, entityType: string): string {
  for (const [domain, rule] of Object.entries(DOMAIN_PREFIXES)) {
    if (rule.entityTypes.includes(entityType) || rule.actionPrefixes.some(prefix => action.startsWith(prefix))) return domain;
  }
  return 'OTHER';
}

/** Only these keys of an audit event's details are shown. Reasons, names, contacts, amounts and bank details are never in the monitor. */
const SAFE_DETAIL_KEYS = ['referenceCode', 'stockCode', 'bookingNumber', 'requestType', 'decision', 'status', 'from', 'to', 'count', 'branchId', 'queueKey', 'memberRole', 'eventType', 'severity'];
const safeDetails = (details: unknown) => {
  const out: Record<string, string | number | boolean | null> = {};
  if (details && typeof details === 'object') for (const key of SAFE_DETAIL_KEYS) {
    const value = (details as Record<string, unknown>)[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = typeof value === 'string' ? value.slice(0, 80) : value;
  }
  return out;
};

export interface ActivityQuery { from?: Date; to?: Date; domain?: string; actorId?: string; branchId?: string; outcome?: string; resourceId?: string; page?: number; limit?: number }

export async function activityMonitor(db: PrismaClient, userId: string, query: ActivityQuery) {
  const facts = (await loadEmployeeFacts(db, [userId])).get(userId);
  if (!facts) throw new HttpError(403, 'EMPLOYEE_REQUIRED');
  if (!(facts.permissions.has('audit.read') || facts.permissions.has('business.oversight.read'))) throw new HttpError(403, 'PERMISSION_DENIED');
  if (query.branchId && !facts.isGlobal && !facts.branchIds.has(query.branchId)) throw new HttpError(403, 'BRANCH_NOT_AUTHORISED');
  if (query.domain && !DOMAIN_PREFIXES[query.domain]) throw new HttpError(400, 'INVALID_DOMAIN');
  const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
  const page = Math.max(query.page ?? 1, 1);

  const and: Prisma.AuditEventWhereInput[] = [];
  // Scope: global staff see everything they filter for; everyone else only sees events recorded against their own branches.
  if (!facts.isGlobal) and.push({ OR: [...facts.branchIds].map(branchId => ({ details: { path: ['branchId'], equals: branchId } })) });
  if (query.branchId) and.push({ details: { path: ['branchId'], equals: query.branchId } });
  if (query.domain) {
    const rule = DOMAIN_PREFIXES[query.domain]!;
    and.push({ OR: [{ entityType: { in: rule.entityTypes } }, ...rule.actionPrefixes.map(prefix => ({ action: { startsWith: prefix } }))] });
  }
  const where: Prisma.AuditEventWhereInput = {
    AND: and.length ? and : undefined,
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.outcome ? { outcome: query.outcome } : {}),
    ...(query.resourceId ? { entityId: query.resourceId } : {}),
    ...((query.from || query.to) ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
  };
  const [total, rows, exceptions, last24h] = await Promise.all([
    db.auditEvent.count({ where }),
    db.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { actor: { select: { displayName: true, email: true } } } }),
    db.auditEvent.findMany({ where: { ...where, outcome: { not: 'SUCCEEDED' } }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, action: true, entityType: true, entityId: true, outcome: true, createdAt: true } }),
    db.auditEvent.findMany({ where: { ...where, createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } }, select: { action: true, entityType: true, outcome: true }, take: 5000 }),
  ]);
  const byDomain: Record<string, number> = {};
  for (const row of last24h) byDomain[domainOf(row.action, row.entityType)] = (byDomain[domainOf(row.action, row.entityType)] ?? 0) + 1;
  return {
    page, limit, total,
    items: rows.map(row => ({ id: row.id, createdAt: row.createdAt, action: row.action, domain: domainOf(row.action, row.entityType), entityType: row.entityType, entityId: row.entityId, outcome: row.outcome, actor: row.actor ? (row.actor.displayName ?? row.actor.email) : null, details: safeDetails(row.details) })),
    summary: { last24hByDomain: byDomain, last24hTotal: last24h.length, exceptions: exceptions.map(item => ({ ...item, domain: domainOf(item.action, item.entityType) })) },
  };
}
