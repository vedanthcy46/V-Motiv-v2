// What an employee can do with their own inbox. Every function takes the signed-in employee's user id and only ever touches rows
// that belong to them: there is no way to name another employee here.
import type { Prisma, PrismaClient } from '@prisma/client';
import { HttpError } from '../errors.js';
import { isExpoPushToken } from '../notification/expo-push.js';
import { MODULE_PORTAL, isAllowedActionRoute, type NotificationModule } from './routes.js';
import { loadEmployeeFacts } from './routing.js';

export const MODULES: NotificationModule[] = ['SALES', 'OPERATIONS', 'FINANCE', 'ADMIN', 'INSPECTION'];
const SEVERITIES = ['CRITICAL', 'ACTION_REQUIRED', 'INFORMATIONAL'] as const;

export interface InboxQuery {
  module?: string; severity?: string; unreadOnly?: boolean; actionRequired?: boolean; branchId?: string;
  from?: Date; to?: Date; cursor?: string; limit?: number;
}

/** Branches the employee may filter by: theirs, or every active branch for global staff. */
export async function authorisedBranches(db: PrismaClient, userId: string) {
  const facts = (await loadEmployeeFacts(db, [userId])).get(userId);
  if (!facts) throw new HttpError(403, 'EMPLOYEE_REQUIRED');
  const branches = await db.branch.findMany({ where: facts.isGlobal ? { active: true } : { id: { in: [...facts.branchIds] } }, select: { id: true, code: true, name: true, city: true }, orderBy: { name: 'asc' } });
  return { facts, branches };
}

export const isActionable = (row: { resolvedAt: Date | null; supersededAt: Date | null; expiresAt: Date | null }, now = new Date()) =>
  !row.resolvedAt && !row.supersededAt && (!row.expiresAt || row.expiresAt > now);

export function toItem(row: Prisma.NotificationGetPayload<{}>, now = new Date()) {
  const module = (row.module ?? 'ADMIN') as NotificationModule;
  return {
    id: row.id, createdAt: row.createdAt, readAt: row.readAt, acknowledgedAt: row.acknowledgedAt, resolvedAt: row.resolvedAt, supersededAt: row.supersededAt,
    severity: row.severity, module, portal: MODULE_PORTAL[module], title: row.title, body: row.body, resourceType: row.resourceType, resourceId: row.resourceId,
    // Re-validated on the way out as well as on the way in.
    actionRoute: isAllowedActionRoute(module, row.actionRoute) ? row.actionRoute : null,
    branchId: row.branchId, requiresAck: row.requiresAck, read: row.read, actionable: isActionable(row, now),
  };
}

const employeeInboxWhere = (userId: string): Prisma.NotificationWhereInput => ({ userId, module: { not: null }, dismissedAt: null });

export async function listInbox(db: PrismaClient, userId: string, query: InboxQuery) {
  const { branches } = await authorisedBranches(db, userId);
  if (query.branchId && !branches.some(branch => branch.id === query.branchId)) throw new HttpError(403, 'BRANCH_NOT_AUTHORISED');
  if (query.module && !MODULES.includes(query.module as NotificationModule)) throw new HttpError(400, 'INVALID_MODULE');
  if (query.severity && !(SEVERITIES as readonly string[]).includes(query.severity)) throw new HttpError(400, 'INVALID_SEVERITY');
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
  const where: Prisma.NotificationWhereInput = {
    ...employeeInboxWhere(userId),
    ...(query.module ? { module: query.module } : {}),
    ...(query.severity ? { severity: query.severity as any } : {}),
    ...(query.unreadOnly ? { read: false } : {}),
    ...(query.actionRequired ? { requiresAck: true, acknowledgedAt: null, resolvedAt: null, supersededAt: null } : {}),
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...((query.from || query.to) ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
  };
  const rows = await db.notification.findMany({
    where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, limit);
  const [unread, needsAction] = await Promise.all([
    db.notification.count({ where: { ...employeeInboxWhere(userId), read: false } }),
    db.notification.count({ where: { ...employeeInboxWhere(userId), requiresAck: true, acknowledgedAt: null, resolvedAt: null, supersededAt: null } }),
  ]);
  const now = new Date();
  return { items: page.map(row => toItem(row, now)), nextCursor: rows.length > limit ? page[page.length - 1]!.id : null, unreadCount: unread, actionRequiredCount: needsAction, branches };
}

export async function unreadCounts(db: PrismaClient, userId: string, module?: string) {
  const base = { ...employeeInboxWhere(userId), ...(module ? { module } : {}) };
  const [count, actionRequired, critical] = await Promise.all([
    db.notification.count({ where: { ...base, read: false } }),
    db.notification.count({ where: { ...base, requiresAck: true, acknowledgedAt: null, resolvedAt: null, supersededAt: null } }),
    db.notification.count({ where: { ...base, severity: 'CRITICAL', acknowledgedAt: null, resolvedAt: null, read: false } }),
  ]);
  return { count, actionRequired, critical };
}

async function ownRow(db: PrismaClient, userId: string, id: string) {
  const row = await db.notification.findFirst({ where: { id, ...employeeInboxWhere(userId) } });
  if (!row) throw new HttpError(404, 'NOTIFICATION_NOT_FOUND'); // Someone else's id is indistinguishable from a missing one.
  return row;
}

/** Marking read changes only the inbox. It never touches the booking, payment, inspection or approval behind it. */
export async function markRead(db: PrismaClient, userId: string, id: string) {
  const row = await ownRow(db, userId, id);
  if (row.read) return toItem(row);
  return toItem(await db.notification.update({ where: { id }, data: { read: true, readAt: new Date() } }));
}

export async function markAllRead(db: PrismaClient, userId: string, module?: string) {
  if (module && !MODULES.includes(module as NotificationModule)) throw new HttpError(400, 'INVALID_MODULE');
  const result = await db.notification.updateMany({ where: { ...employeeInboxWhere(userId), read: false, ...(module ? { module } : {}) }, data: { read: true, readAt: new Date() } });
  return { updated: result.count };
}

export async function acknowledge(db: PrismaClient, userId: string, id: string) {
  const row = await ownRow(db, userId, id);
  if (!row.requiresAck) throw new HttpError(409, 'ACKNOWLEDGEMENT_NOT_REQUIRED');
  if (row.acknowledgedAt) return toItem(row);
  const now = new Date();
  const updated = await db.$transaction(async tx => {
    const saved = await tx.notification.update({ where: { id }, data: { acknowledgedAt: now, read: true, readAt: row.readAt ?? now } });
    await tx.auditEvent.create({ data: { actorId: userId, action: 'NOTIFICATION_ACKNOWLEDGED', entityType: 'Notification', entityId: id, details: { eventType: row.eventType, severity: row.severity, resourceType: row.resourceType, resourceId: row.resourceId } } });
    return saved;
  });
  return toItem(updated);
}

/** Is this still the employee's work? Checked against live records, so a reassigned job does not open for the old owner. */
async function stillAssigned(db: PrismaClient, userId: string, row: { resourceType: string | null; resourceId: string | null; metadata: unknown }): Promise<boolean | null> {
  if (!row.resourceId) return null;
  switch (row.resourceType) {
    case 'AcquisitionLead': {
      const meta = (row.metadata ?? {}) as { reason?: string };
      if (meta.reason !== 'ASSIGNED_EMPLOYEE') return null;
      return Boolean(await db.sellerLeadAssignment.findFirst({ where: { leadId: row.resourceId, employeeId: userId, releasedAt: null }, select: { id: true } }));
    }
    case 'InspectionAssignment': {
      const assignment = await db.inspectionAssignment.findUnique({ where: { id: row.resourceId }, select: { inspectorId: true, status: true } });
      return Boolean(assignment && assignment.inspectorId === userId && assignment.status !== 'CANCELLED');
    }
    case 'TestDriveRequest': {
      const drive = await db.testDriveRequest.findUnique({ where: { id: row.resourceId }, select: { assignedEmployeeId: true, status: true } });
      return Boolean(drive && drive.assignedEmployeeId === userId && drive.status !== 'CANCELLED');
    }
    default:
      return null;
  }
}

export type OpenDecision =
  | { allowed: true; actionRoute: string; module: NotificationModule; portal: string }
  | { allowed: false; reason: 'NO_LONGER_EMPLOYED' | 'NO_LONGER_AUTHORISED' | 'REASSIGNED' | 'RESOLVED' | 'EXPIRED' | 'NO_LINK' };

/**
 * Called when someone clicks a notification, before anything opens. It says whether the link may be followed NOW. It does not grant
 * access: the portal still authorises the record itself.
 */
export async function authoriseOpen(db: PrismaClient, userId: string, id: string): Promise<OpenDecision> {
  const row = await ownRow(db, userId, id);
  const module = (row.module ?? 'ADMIN') as NotificationModule;
  const facts = (await loadEmployeeFacts(db, [userId])).get(userId);
  if (!facts || !facts.active || !facts.userActive) return { allowed: false, reason: 'NO_LONGER_EMPLOYED' };
  if (!isAllowedActionRoute(module, row.actionRoute)) return { allowed: false, reason: 'NO_LINK' };
  if (row.expiresAt && row.expiresAt < new Date()) return { allowed: false, reason: 'EXPIRED' };
  if (row.supersededAt) return { allowed: false, reason: 'REASSIGNED' };
  const mine = await stillAssigned(db, userId, row);
  if (mine === false) return { allowed: false, reason: 'REASSIGNED' };
  // Not an assignment: the employee must still be authorised for the branch the event affected.
  if (mine === null && row.branchId && !facts.isGlobal && !facts.branchIds.has(row.branchId)) return { allowed: false, reason: 'NO_LONGER_AUTHORISED' };
  if (row.resolvedAt) return { allowed: false, reason: 'RESOLVED' };
  return { allowed: true, actionRoute: row.actionRoute!, module, portal: MODULE_PORTAL[module] };
}

// ------------------------------------------------------------------------------------------------------ preferences
export interface PreferenceUpdate {
  pushEnabled?: boolean; emailEnabled?: boolean; inAppEnabled?: boolean; quietHoursEnabled?: boolean; quietHoursStart?: string; quietHoursEnd?: string;
  digestFrequency?: 'OFF' | 'DAILY'; mutedModules?: string[];
}
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function getPreferences(db: PrismaClient, userId: string) {
  const pref = await db.notificationPreference.findUnique({ where: { userId } });
  return {
    pushEnabled: pref?.pushEnabled ?? true, emailEnabled: pref?.emailEnabled ?? true, inAppEnabled: pref?.inAppEnabled ?? true,
    quietHoursEnabled: pref?.quietHoursEnabled ?? false, quietHoursStart: pref?.quietHoursStart ?? '22:00', quietHoursEnd: pref?.quietHoursEnd ?? '08:00',
    digestFrequency: pref?.digestFrequency ?? 'OFF', mutedModules: pref?.mutedModules ?? [],
    // What a preference can never switch off.
    mandatory: 'Critical alerts and anything that needs your acknowledgement are always delivered. Preferences cannot remove work from your queue.',
  };
}

export async function updatePreferences(db: PrismaClient, userId: string, update: PreferenceUpdate) {
  if (update.quietHoursStart && !HHMM.test(update.quietHoursStart)) throw new HttpError(400, 'INVALID_QUIET_HOURS');
  if (update.quietHoursEnd && !HHMM.test(update.quietHoursEnd)) throw new HttpError(400, 'INVALID_QUIET_HOURS');
  if (update.digestFrequency && !['OFF', 'DAILY'].includes(update.digestFrequency)) throw new HttpError(400, 'INVALID_DIGEST_FREQUENCY');
  if (update.mutedModules?.some(module => !MODULES.includes(module as NotificationModule))) throw new HttpError(400, 'INVALID_MODULE');
  await db.notificationPreference.upsert({ where: { userId }, update, create: { userId, ...update } });
  return getPreferences(db, userId);
}

// ---------------------------------------------------------------------------------------------------------- devices
export async function registerDevice(db: PrismaClient, userId: string, input: { token: string; app: string; platform: string; installationId?: string; projectId?: string }) {
  const facts = (await loadEmployeeFacts(db, [userId])).get(userId);
  if (!facts || !facts.active || !facts.userActive) throw new HttpError(403, 'EMPLOYEE_REQUIRED');
  if (!isExpoPushToken(input.token)) throw new HttpError(400, 'INVALID_EXPO_PUSH_TOKEN');
  // One installation, one token: a changed token replaces the old one, and a device used by another employee earlier is released.
  if (input.installationId) await db.pushDevice.updateMany({ where: { installationId: input.installationId, NOT: { userId, token: input.token } }, data: { active: false } });
  await db.pushDevice.updateMany({ where: { token: input.token, NOT: { userId } }, data: { active: false } });
  const device = await db.pushDevice.upsert({
    where: { userId_token_app: { userId, token: input.token, app: input.app } },
    update: { platform: input.platform, installationId: input.installationId, projectId: input.projectId, active: true, lastSeenAt: new Date() },
    create: { userId, token: input.token, app: input.app, platform: input.platform, installationId: input.installationId, projectId: input.projectId },
  });
  return { id: device.id, app: device.app, platform: device.platform, lastSeenAt: device.lastSeenAt };
}

export async function removeDevice(db: PrismaClient, userId: string, id: string) {
  const result = await db.pushDevice.updateMany({ where: { id, userId }, data: { active: false } });
  if (result.count === 0) throw new HttpError(404, 'DEVICE_NOT_FOUND');
  return { removed: true };
}

/** Stop pushing to a person's devices: used when they are suspended, deactivated or sign out everywhere. */
export async function invalidateEmployeeDevices(db: PrismaClient, userId: string) {
  const result = await db.pushDevice.updateMany({ where: { userId, active: true }, data: { active: false } });
  return result.count;
}
