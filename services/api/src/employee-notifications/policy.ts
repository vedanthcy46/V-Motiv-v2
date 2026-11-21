// Versioned routing policy: the catalog gives version 0; a stored row with a higher version replaces it. Edits are validated so a
// policy can never widen who sees an event beyond what the catalog and the module allow.
import type { Prisma, PrismaClient } from '@prisma/client';
import { HttpError } from '../errors.js';
import { getEventDefinition, EVENT_CATALOG, type Channel, type RecipientStrategy, type Severity, type BranchScope } from './catalog.js';
import type { EffectivePolicy } from './routing.js';

type Db = PrismaClient | Prisma.TransactionClient;

const STRATEGIES: RecipientStrategy[] = ['ASSIGNED_EMPLOYEE', 'ASSIGNED_TEAM', 'BRANCH_QUEUE_OWNER', 'DESIGNATED_APPROVER', 'FINANCE_CASE_OWNER', 'INSPECTOR_ASSIGNEE', 'ADMIN_RESPONDER', 'AUTHORIZED_SUBSCRIBERS'];
const SEVERITIES: Severity[] = ['CRITICAL', 'ACTION_REQUIRED', 'INFORMATIONAL'];
const CHANNELS: Channel[] = ['IN_APP', 'PUSH', 'EMAIL'];
const SCOPES: BranchScope[] = ['BRANCH', 'GLOBAL', 'ASSIGNED'];

export async function getEffectivePolicy(db: Db, eventType: string): Promise<EffectivePolicy | null> {
  const def = getEventDefinition(eventType);
  if (!def) return null;
  const stored = await db.notificationRoutingPolicy.findFirst({ where: { eventType }, orderBy: { version: 'desc' } });
  if (!stored) return { ...def, policyVersion: 0, enabled: true };
  const strategy = stored.recipientStrategy as RecipientStrategy;
  return {
    ...def,
    policyVersion: stored.version,
    // A critical event cannot be switched off: security and incident alerts are mandatory.
    enabled: stored.enabled || def.severity === 'CRITICAL',
    module: stored.module as any,
    requiredPermission: stored.requiredPermission ?? undefined,
    // The stored strategy leads; the catalog's other strategies (for example "also tell the assignee") stay.
    strategies: [strategy, ...def.strategies.filter(item => item !== strategy)],
    branchScope: stored.branchScope as BranchScope,
    severity: stored.severity as Severity,
    channels: stored.deliveryChannels as Channel[],
    requiresAck: stored.requiresAcknowledgement,
    escalationPolicyKey: stored.escalationPolicyKey ?? undefined,
    dedupWindowMinutes: stored.dedupWindowMinutes,
  };
}

export interface PolicyUpdate {
  eventType: string; enabled?: boolean; requiredPermission?: string | null; recipientStrategy?: RecipientStrategy; branchScope?: BranchScope;
  severity?: Severity; deliveryChannels?: Channel[]; requiresAcknowledgement?: boolean; escalationPolicyKey?: string | null; dedupWindowMinutes?: number; note?: string;
}

/** Store a new version. Validates every field against the catalog so a change can narrow or retune routing but never leak data. */
export async function saveRoutingPolicy(db: PrismaClient, update: PolicyUpdate, actorId: string) {
  const def = getEventDefinition(update.eventType);
  if (!def) throw new HttpError(404, 'UNKNOWN_EVENT_TYPE');
  const current = await getEffectivePolicy(db, update.eventType);
  const next = {
    enabled: update.enabled ?? current!.enabled,
    requiredPermission: update.requiredPermission === undefined ? current!.requiredPermission ?? null : update.requiredPermission,
    recipientStrategy: update.recipientStrategy ?? current!.strategies[0]!,
    branchScope: update.branchScope ?? current!.branchScope,
    severity: update.severity ?? current!.severity,
    deliveryChannels: update.deliveryChannels ?? current!.channels,
    requiresAcknowledgement: update.requiresAcknowledgement ?? current!.requiresAck,
    escalationPolicyKey: update.escalationPolicyKey === undefined ? current!.escalationPolicyKey ?? null : update.escalationPolicyKey,
    dedupWindowMinutes: update.dedupWindowMinutes ?? current!.dedupWindowMinutes,
  };
  if (!STRATEGIES.includes(next.recipientStrategy)) throw new HttpError(400, 'INVALID_RECIPIENT_STRATEGY');
  if (!SEVERITIES.includes(next.severity)) throw new HttpError(400, 'INVALID_SEVERITY');
  if (!SCOPES.includes(next.branchScope)) throw new HttpError(400, 'INVALID_BRANCH_SCOPE');
  if (next.deliveryChannels.some(channel => !CHANNELS.includes(channel))) throw new HttpError(400, 'INVALID_CHANNEL');
  if (next.dedupWindowMinutes < 0 || next.dedupWindowMinutes > 10_080) throw new HttpError(400, 'INVALID_DEDUP_WINDOW');
  // No leaking: only admin-module events may be global, and the branch scope may never be widened above the catalog's.
  const rank: Record<BranchScope, number> = { ASSIGNED: 0, BRANCH: 1, GLOBAL: 2 };
  if (rank[next.branchScope] > rank[def.branchScope]) throw new HttpError(400, 'POLICY_WIDENS_BRANCH_SCOPE', 'A policy cannot let more people see an event than the catalog allows.');
  // A permission gate cannot be removed, and a critical event cannot be downgraded or disabled.
  if (def.requiredPermission && next.requiredPermission !== def.requiredPermission) {
    const known = await db.permission.findFirst({ where: { key: next.requiredPermission ?? '' }, select: { id: true } });
    if (!next.requiredPermission || !known) throw new HttpError(400, 'POLICY_REMOVES_PERMISSION_GATE');
  }
  if (def.severity === 'CRITICAL' && (next.severity !== 'CRITICAL' || !next.enabled)) throw new HttpError(400, 'CRITICAL_EVENT_IS_MANDATORY');
  const latest = await db.notificationRoutingPolicy.findFirst({ where: { eventType: update.eventType }, orderBy: { version: 'desc' }, select: { version: true } });
  return db.notificationRoutingPolicy.create({
    data: { eventType: update.eventType, version: (latest?.version ?? 0) + 1, module: def.module, createdById: actorId, note: update.note, ...next },
  });
}

export function catalogSummary() {
  return EVENT_CATALOG.map(def => ({
    eventType: def.eventType, module: def.module, strategies: def.strategies, queueKey: def.queueKey ?? null, requiredPermission: def.requiredPermission ?? null,
    requiredRoles: def.requiredRoles ?? [], branchScope: def.branchScope, severity: def.severity, channels: def.channels, requiresAck: def.requiresAck,
    escalationPolicyKey: def.escalationPolicyKey ?? null, dedupWindowMinutes: def.dedupWindowMinutes, emitted: def.emitted, note: def.note ?? null,
  }));
}
