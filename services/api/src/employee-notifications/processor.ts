// Turns outbox events into per-employee inbox items and queued deliveries. Safe to run twice on the same event: the inbox row is
// unique per (event, recipient), so a replay after a crash cannot create a second notification or a second push.
import { Prisma, type PrismaClient } from '@prisma/client';
import { isExpoPushToken } from '../notification/expo-push.js';
import { getEventDefinition, pickAllowedFields } from './catalog.js';
import { claimOutboxBatch, markFailed, markProcessed, type ClaimedEvent } from './outbox.js';
import { getEffectivePolicy } from './policy.js';
import { isAllowedActionRoute, MODULE_PORTAL } from './routes.js';
import { resolveRecipients } from './routing.js';

const EXPIRES_DAYS: Record<string, number> = { INFORMATIONAL: 30, ACTION_REQUIRED: 90, CRITICAL: 365 };

const PORTAL_ORIGIN_ENV: Record<string, string> = { sales: 'SALES_WEB_ORIGIN', ops: 'OPERATIONS_WEB_ORIGIN', finance: 'FINANCE_WEB_ORIGIN', admin: 'ADMIN_WEB_ORIGIN' };

function isQuietHours(start?: string | null, end?: string | null, now = new Date()): boolean {
  if (!start || !end) return false;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes() + 330; // quiet hours are kept in India time
  const current = minutes % 1440;
  const from = (sh! * 60 + sm!) % 1440;
  const to = (eh! * 60 + em!) % 1440;
  return from <= to ? current >= from && current < to : current >= from || current < to;
}

export interface ProcessOutcome { notifications: number; pushQueued: number; emailQueued: number; fallbackUsed: boolean; skipped: number; suppressed?: boolean }

export async function processOutboxEvent(db: PrismaClient, event: ClaimedEvent, now = new Date()): Promise<ProcessOutcome> {
  const def = getEventDefinition(event.eventType);
  const policy = await getEffectivePolicy(db, event.eventType);
  if (!def || !policy) throw new Error(`Unknown event type ${event.eventType}`);
  if (!policy.enabled) {
    await markProcessed(db, event.id, { suppressed: true }, policy.policyVersion);
    return { notifications: 0, pushQueued: 0, emailQueued: 0, fallbackUsed: false, skipped: 0, suppressed: true };
  }

  const raw = event.payload as Record<string, unknown>;
  const assignees = Array.isArray(raw._assignees) ? (raw._assignees as string[]) : [];
  const exclude = [...(Array.isArray(raw._exclude) ? (raw._exclude as string[]) : []), ...(event.actorId && def.severity !== 'CRITICAL' ? [event.actorId] : [])];
  const vars = pickAllowedFields(def, raw);
  const routing = await resolveRecipients(db, { policy, branchId: event.branchId, assigneeUserIds: assignees, excludeUserIds: exclude });

  const route = def.route(event.aggregateId, vars);
  // An event with no record id has nothing specific to open.
  const actionRoute = event.aggregateId !== 'none' && isAllowedActionRoute(policy.module, route) ? route : null;
  const expiresAt = new Date(now.getTime() + (EXPIRES_DAYS[policy.severity] ?? 30) * 86_400_000);
  const portal = MODULE_PORTAL[policy.module];

  let pushQueued = 0;
  let emailQueued = 0;
  let created = 0;

  for (const recipient of routing.recipients) {
    const pref = await db.notificationPreference.findUnique({ where: { userId: recipient.userId } });
    const critical = policy.severity === 'CRITICAL';
    // Preferences shape non-critical delivery. They never remove the work from the queue, and never silence a critical alert.
    if (!critical && policy.severity === 'INFORMATIONAL' && pref?.mutedModules?.includes(policy.module)) continue;

    let notificationId: string;
    try {
      const row = await db.notification.create({
        data: {
          userId: recipient.userId, eventId: event.id, eventType: event.eventType, category: policy.module, module: policy.module, severity: policy.severity,
          priority: critical ? 'URGENT' : policy.severity === 'ACTION_REQUIRED' ? 'HIGH' : 'NORMAL',
          title: def.title(vars), body: def.body(vars), entityType: policy.resourceType, entityId: event.aggregateId,
          resourceType: policy.resourceType, resourceId: event.aggregateId, actionRoute, branchId: event.branchId, requiresAck: policy.requiresAck,
          expiresAt, dedupKey: event.id, targetApp: portal === 'inspector' ? 'INSPECTOR' : portal.toUpperCase(),
          metadata: { reason: recipient.reason, policyVersion: policy.policyVersion, ...vars } as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      notificationId = row.id;
      created++;
    } catch (error) {
      // A replay: this recipient already has it from an earlier attempt.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
      throw error;
    }

    await db.notificationDelivery.create({ data: { notificationId, channel: 'IN_APP', status: 'DELIVERED', sentAt: now } });

    const quiet = !critical && Boolean(pref?.quietHoursEnabled) && isQuietHours(pref?.quietHoursStart, pref?.quietHoursEnd, now);
    if (policy.channels.includes('PUSH') && (pref?.pushEnabled ?? true) && !quiet && policy.severity !== 'INFORMATIONAL') {
      const devices = await db.pushDevice.findMany({ where: { userId: recipient.userId, active: true } });
      for (const device of devices.filter(item => isExpoPushToken(item.token))) {
        // The push carries the title, the safe body and the id. Nothing else: the app fetches the job after the person opens it.
        await db.pushTicket.create({ data: { deviceId: device.id, notificationId, title: def.title(vars), body: def.body(vars), data: { notificationId, module: policy.module, actionRoute, severity: policy.severity }, status: 'QUEUED' } });
        await db.notificationDelivery.create({ data: { notificationId, channel: 'PUSH', status: 'QUEUED', provider: 'EXPO' } });
        pushQueued++;
      }
    }

    const wantsEmail = policy.channels.includes('EMAIL') && (pref?.emailEnabled ?? true) && (critical || !quiet);
    if (wantsEmail) {
      const user = await db.user.findUnique({ where: { id: recipient.userId }, select: { email: true } });
      if (user?.email) {
        const origin = process.env[PORTAL_ORIGIN_ENV[portal] ?? ''];
        const link = origin && actionRoute ? `\n\nOpen it: ${origin.replace(/\/$/, '')}${actionRoute}` : '';
        await db.emailOutbox.upsert({
          where: { eventKey: `emp-notif/${notificationId}` },
          update: {},
          create: { userId: recipient.userId, eventKey: `emp-notif/${notificationId}`, recipient: user.email, templateVersion: 'employee-alert-v1', subject: def.title(vars), text: `${def.body(vars)}${link}\n\nSign in to the V MOTIV ${policy.module.toLowerCase()} portal to act on it.` },
        });
        await db.notificationDelivery.create({ data: { notificationId, channel: 'EMAIL', status: 'QUEUED', provider: 'RESEND' } });
        emailQueued++;
      }
    }
  }

  // Reassignment: whoever held this same work before no longer has an actionable alert for it. History is kept.
  const keepers = routing.recipients.map(recipient => recipient.userId);
  if (policy.strategies.some(strategy => strategy === 'ASSIGNED_EMPLOYEE' || strategy === 'INSPECTOR_ASSIGNEE') && assignees.length > 0) {
    await db.notification.updateMany({
      where: { eventType: event.eventType, resourceId: event.aggregateId, resolvedAt: null, userId: { notIn: keepers }, eventId: { not: event.id } },
      data: { supersededAt: now, resolvedAt: now },
    });
  }

  const outcome: ProcessOutcome = { notifications: created, pushQueued, emailQueued, fallbackUsed: routing.fallbackUsed, skipped: routing.skipped.length };
  await markProcessed(db, event.id, { recipients: routing.recipients.length, created, pushQueued, emailQueued, fallbackUsed: routing.fallbackUsed, skipped: routing.skipped.map(item => item.reason) } as unknown as Prisma.InputJsonValue, policy.policyVersion);
  return outcome;
}

/** One pass of the worker: claim due events and process each, recording failures for retry. */
export async function runOutboxOnce(db: PrismaClient, opts: { workerId?: string; limit?: number; now?: Date } = {}): Promise<{ processed: number; failed: number; dead: number }> {
  const batch = await claimOutboxBatch(db, opts.workerId ?? undefined, opts.limit ?? 20, 60_000, opts.now);
  let processed = 0, failed = 0, dead = 0;
  for (const event of batch) {
    try {
      await processOutboxEvent(db, event, opts.now);
      processed++;
    } catch (error) {
      const state = await markFailed(db, event, error, opts.now);
      if (state === 'DEAD') dead++; else failed++;
      console.error('[EMPLOYEE_NOTIFICATION_EVENT_FAILED]', event.eventType, event.id, (error as Error)?.message || error);
    }
  }
  return { processed, failed, dead };
}
