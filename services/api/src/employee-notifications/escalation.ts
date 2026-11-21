// The escalation engine. An alert that needs acknowledgement and is still open after its policy's wait moves up: first to the person's
// manager or the queue owner, then to administrators. It never escalates work that is already done: it looks at the business record
// first, and an acknowledged or resolved alert stops. Every step is recorded.
import type { Prisma, PrismaClient } from '@prisma/client';
import { EVENT_CATALOG, ESCALATION_DEFAULTS, getEventDefinition, type EscalationStep } from './catalog.js';
import { deliverNotification } from './processor.js';
import { enqueueDomainEvent } from './outbox.js';
import { getEffectivePolicy } from './policy.js';
import { isAllowedActionRoute, MODULE_PORTAL } from './routes.js';
import { loadEmployeeFacts, resolveRecipients } from './routing.js';
import { workingMinutesBetween, type WorkingCalendar } from './workhours.js';

type Db = PrismaClient;

export interface EscalationPolicyView { key: string; steps: EscalationStep[]; respectWorkingHours: boolean; start: string; end: string; workingDays: number[]; holidays: string[] }

export async function loadEscalationPolicy(db: Db, key: string): Promise<EscalationPolicyView | null> {
  const stored = await db.notificationEscalationPolicy.findUnique({ where: { key } });
  if (stored) return stored.enabled ? { key, steps: stored.steps as unknown as EscalationStep[], respectWorkingHours: stored.respectWorkingHours, start: stored.workingHoursStart, end: stored.workingHoursEnd, workingDays: stored.workingDays, holidays: stored.holidays } : null;
  const fallback = ESCALATION_DEFAULTS.find(item => item.key === key);
  return fallback ? { key, steps: fallback.steps, respectWorkingHours: fallback.respectWorkingHours, start: '09:00', end: '19:00', workingDays: [1, 2, 3, 4, 5, 6], holidays: [] } : null;
}

/**
 * Has the business work behind this alert already been done? Judged from the live record, not from whether anyone clicked "read".
 * `null` means "no rule for this record type": acknowledgement and explicit resolution are then the only things that stop escalation.
 */
export async function workIsDone(db: Db, row: { eventType: string; resourceType: string | null; resourceId: string | null; userId: string; createdAt: Date }): Promise<boolean | null> {
  const id = row.resourceId;
  if (!id) return null;
  switch (row.resourceType) {
    case 'AcquisitionLead': {
      if (row.eventType === 'LEAD_ASSIGNED') {
        const own = await db.sellerLeadAssignment.findFirst({ where: { leadId: id, employeeId: row.userId, releasedAt: null }, select: { id: true } });
        if (!own) return true; // no longer theirs
        const reply = await db.leadInteraction.findFirst({ where: { leadId: id, createdAt: { gt: row.createdAt } }, select: { id: true } });
        return Boolean(reply);
      }
      const owned = await db.sellerLeadAssignment.findFirst({ where: { leadId: id, releasedAt: null }, select: { id: true } });
      return Boolean(owned); // an unassigned alert is done once someone owns the lead
    }
    case 'InspectionRequest': {
      const request = await db.inspectionRequest.findUnique({ where: { id }, select: { status: true, assignment: { select: { id: true } } } });
      return !request || request.status !== 'REQUESTED' || Boolean(request.assignment);
    }
    case 'InspectionAssignment': {
      const assignment = await db.inspectionAssignment.findUnique({ where: { id }, select: { status: true } });
      return !assignment || !['ASSIGNED'].includes(assignment.status);
    }
    case 'ApprovalRequest': {
      const approval = await db.approvalRequest.findUnique({ where: { id }, select: { status: true } });
      return !approval || approval.status !== 'PENDING';
    }
    case 'FinancePayoutInstruction': {
      const payout = await db.financePayoutInstruction.findUnique({ where: { id }, select: { status: true } });
      if (!payout) return true;
      return row.eventType === 'FINANCE_PAYOUT_APPROVAL_REQUESTED' ? payout.status !== 'APPROVAL_PENDING' : ['VERIFIED', 'CANCELLED', 'REJECTED'].includes(payout.status);
    }
    case 'RentalBooking': {
      const booking = await db.rentalBooking.findUnique({ where: { id }, select: { status: true, outstandingBalancePaise: true } });
      if (!booking) return true;
      if (row.eventType === 'RENTAL_BALANCE_OVERDUE') return booking.outstandingBalancePaise <= 0n || booking.status === 'CANCELLED';
      if (row.eventType === 'RENTAL_RETURN_OVERDUE') return ['RETURN_INSPECTED', 'SETTLED', 'CANCELLED'].includes(booking.status);
      return ['SETTLED', 'CANCELLED', 'RETURN_INSPECTED'].includes(booking.status);
    }
    default:
      return null;
  }
}

async function branchCalendar(db: Db, branchId: string | null, policy: EscalationPolicyView): Promise<WorkingCalendar> {
  const branch = branchId ? await db.branch.findUnique({ where: { id: branchId }, select: { timezone: true } }) : null;
  return { timezone: branch?.timezone ?? 'Asia/Kolkata', start: policy.start, end: policy.end, workingDays: policy.workingDays, holidays: policy.holidays };
}

async function escalationTarget(db: Db, row: { userId: string; eventType: string; branchId: string | null }, step: EscalationStep, queueKey: string | undefined): Promise<string | null> {
  const original = (await loadEmployeeFacts(db, [row.userId])).get(row.userId);
  const usable = async (id: string | null | undefined) => (id && id !== row.userId && (await loadEmployeeFacts(db, [id])).get(id)?.active ? id : null);
  if (step.to === 'REPORTS_TO') {
    const manager = await usable(original?.reportsToId);
    if (manager) return manager;
  }
  if (step.to === 'REPORTS_TO' || step.to === 'QUEUE_OWNER') {
    const owners = queueKey ? await db.notificationQueueMember.findMany({ where: { queueKey, active: true, memberRole: 'OWNER', OR: [{ branchId: null }, ...(row.branchId ? [{ branchId: row.branchId }] : [])] }, select: { userId: true } }) : [];
    for (const owner of owners) { const id = await usable(owner.userId); if (id) return id; }
    if (step.to === 'QUEUE_OWNER') return null;
  }
  // Administrators: the designated security/admin responders, else platform administrators.
  const policy = await getEffectivePolicy(db, 'CRITICAL_ESCALATION_UNRESOLVED');
  const result = policy ? await resolveRecipients(db, { policy, branchId: null, excludeUserIds: [row.userId] }) : null;
  return result?.recipients[0]?.userId ?? null;
}

export interface EscalationRun { checked: number; escalated: number; skippedDone: number; unresolvedRaised: number }

export async function runEscalations(db: Db, now = new Date()): Promise<EscalationRun> {
  // Walk every open, acknowledgement-needing alert in pages (oldest first) so a long list of old ones never starves newer ones.
  const pageSize = 200;
  const maxPages = 10;
  const where: Prisma.NotificationWhereInput = { requiresAck: true, acknowledgedAt: null, resolvedAt: null, supersededAt: null, module: { not: null }, eventId: { not: null }, createdAt: { gt: new Date(now.getTime() - 14 * 86_400_000) } };
  const candidates: Awaited<ReturnType<typeof db.notification.findMany>> = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const rows = await db.notification.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: pageSize, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    candidates.push(...rows);
    if (rows.length < pageSize) break;
    cursor = rows[rows.length - 1]!.id;
  }
  const run: EscalationRun = { checked: 0, escalated: 0, skippedDone: 0, unresolvedRaised: 0 };
  const policies = new Map<string, EscalationPolicyView | null>();
  const effectiveByType = new Map<string, Awaited<ReturnType<typeof getEffectivePolicy>>>();
  const calendars = new Map<string, WorkingCalendar>();

  for (const row of candidates) {
    const def = getEventDefinition(row.eventType);
    if (def && !effectiveByType.has(row.eventType)) effectiveByType.set(row.eventType, await getEffectivePolicy(db, row.eventType));
    const effective = def ? effectiveByType.get(row.eventType) ?? null : null;
    const key = effective?.escalationPolicyKey;
    if (!def || !key) continue;
    if (!policies.has(key)) policies.set(key, await loadEscalationPolicy(db, key));
    const policy = policies.get(key);
    if (!policy) continue;
    run.checked++;

    // 1. Already done? Then stop, and say so, rather than chasing someone about finished work.
    const done = await workIsDone(db, row);
    if (done === true) {
      await db.notification.update({ where: { id: row.id }, data: { resolvedAt: now } });
      await db.notificationEscalationEvent.upsert({ where: { notificationId_level: { notificationId: row.id, level: row.escalationLevel + 1 } }, update: {}, create: { notificationId: row.id, level: row.escalationLevel + 1, outcome: 'SKIPPED_WORK_DONE' } });
      run.skippedDone++;
      continue;
    }

    const step = policy.steps[row.escalationLevel];
    const calendarKey = `${policy.key}:${row.branchId ?? ''}`;
    if (!calendars.has(calendarKey)) calendars.set(calendarKey, await branchCalendar(db, row.branchId, policy));
    const calendar = calendars.get(calendarKey)!;
    const waited = policy.respectWorkingHours ? workingMinutesBetween(row.createdAt, now, calendar) : Math.floor((now.getTime() - row.createdAt.getTime()) / 60_000);

    if (!step) {
      // Every level used and a critical alert is still open: raise one platform-level alert about it.
      const last = policy.steps[policy.steps.length - 1];
      if (row.severity === 'CRITICAL' && last && waited >= last.afterMinutes + 60) {
        const exists = await db.notificationEscalationEvent.findUnique({ where: { notificationId_level: { notificationId: row.id, level: 100 } } });
        if (!exists) {
          await enqueueDomainEvent(db, { eventType: 'CRITICAL_ESCALATION_UNRESOLVED', aggregateId: row.id, payload: { reasonCode: row.eventType }, dedupKey: `UNRESOLVED:${row.id}` });
          await db.notificationEscalationEvent.create({ data: { notificationId: row.id, level: 100, outcome: 'UNRESOLVED_ALERT_RAISED' } });
          run.unresolvedRaised++;
        }
      }
      continue;
    }
    if (waited < step.afterMinutes) continue;

    const targetId = await escalationTarget(db, row, step, effective?.queueKey);
    const level = row.escalationLevel + 1;
    if (!targetId) {
      // No one to escalate to at this level: record it (so it is visible) and move on to the next level.
      await db.$transaction([
        db.notificationEscalationEvent.upsert({ where: { notificationId_level: { notificationId: row.id, level } }, update: {}, create: { notificationId: row.id, level, outcome: 'NO_TARGET', reason: step.to } }),
        db.notification.update({ where: { id: row.id }, data: { escalationLevel: level } }),
      ]);
      continue;
    }

    const route = def.route(row.resourceId ?? 'none', {});
    const actionRoute = row.actionRoute && isAllowedActionRoute(effective!.module, row.actionRoute) ? row.actionRoute : isAllowedActionRoute(effective!.module, route) ? route : null;
    const title = `Escalated: ${row.title}`;
    const body = `${row.body} It has not been acknowledged for ${waited} minutes.`;
    const escalated = await db.notification.create({
      data: {
        userId: targetId, eventType: row.eventType, category: row.category, module: row.module, severity: row.severity, priority: row.priority, title, body,
        entityType: row.entityType, entityId: row.entityId, resourceType: row.resourceType, resourceId: row.resourceId, actionRoute, branchId: row.branchId,
        requiresAck: true, expiresAt: row.expiresAt, dedupKey: `esc:${row.id}:${level}`, targetApp: row.targetApp,
        metadata: { escalatedFrom: row.id, level, waitedMinutes: waited, to: step.to } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    const pref = await db.notificationPreference.findUnique({ where: { userId: targetId } });
    await deliverNotification(db, { notificationId: escalated.id, userId: targetId, policy: { channels: effective!.channels, severity: effective!.severity, module: effective!.module }, title, body, actionRoute, pref, now });
    await db.$transaction([
      db.notificationEscalationEvent.upsert({ where: { notificationId_level: { notificationId: row.id, level } }, update: {}, create: { notificationId: row.id, level, escalatedToUserId: targetId, outcome: 'ESCALATED', reason: `${step.to} after ${waited} working minutes` } }),
      db.notification.update({ where: { id: row.id }, data: { escalationLevel: level } }),
    ]);
    run.escalated++;
  }
  return run;
}

export const KNOWN_ESCALATION_KEYS = new Set([...EVENT_CATALOG.map(def => def.escalationPolicyKey).filter(Boolean) as string[], ...ESCALATION_DEFAULTS.map(item => item.key)]);
void MODULE_PORTAL;
