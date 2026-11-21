// The transactional outbox. A business change and the fact that it happened are written in the SAME database transaction
// (enqueueDomainEvent(tx, …)); a worker later turns the event into inbox items and deliveries. Nothing here calls Expo or Resend.
import crypto from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { getEventDefinition, pickAllowedFields } from './catalog.js';

type Db = PrismaClient | Prisma.TransactionClient;

export interface DomainEventInput {
  eventType: string;
  /** The record the event is about (its id). */
  aggregateId: string;
  aggregateType?: string;
  /** The branch the event affects. */
  branchId?: string | null;
  actorId?: string | null;
  /** The people the business assigned the work to. */
  assigneeUserIds?: string[];
  /** People who must not be told (the person who asked for an approval, the actor). */
  excludeUserIds?: string[];
  /** Raw facts. Only the fields the catalog allows are kept; everything else is dropped. */
  payload?: Record<string, unknown>;
  /** Overrides the default idempotency key. */
  dedupKey?: string;
}

const uuidLike = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

/** Default idempotency: the same event for the same record inside the policy's window is one event. */
export function defaultDedupKey(eventType: string, aggregateId: string, windowMinutes: number, assignees: string[], now = new Date()): string | undefined {
  if (windowMinutes <= 0) return undefined;
  const bucket = Math.floor(now.getTime() / (windowMinutes * 60_000));
  const who = assignees.length ? `:${[...assignees].sort().join(',')}` : '';
  return `${eventType}:${aggregateId}${who}:${bucket}`;
}

/** Persist an event. Returns its id, or null when the event is unknown (nothing is queued for a name the catalog does not know). */
export async function enqueueDomainEvent(db: Db, input: DomainEventInput): Promise<string | null> {
  const def = getEventDefinition(input.eventType);
  if (!def) return null;
  const assignees = (input.assigneeUserIds ?? []).filter(uuidLike);
  const payload = {
    ...pickAllowedFields(def, input.payload),
    _assignees: assignees,
    _exclude: (input.excludeUserIds ?? []).filter(uuidLike),
  };
  const dedupKey = input.dedupKey ?? defaultDedupKey(input.eventType, input.aggregateId, def.dedupWindowMinutes, assignees);
  try {
    const created = await db.domainOutboxEvent.create({
      data: {
        eventType: input.eventType,
        aggregateType: input.aggregateType ?? def.resourceType,
        aggregateId: input.aggregateId,
        branchId: input.branchId && uuidLike(input.branchId) ? input.branchId : null,
        actorId: input.actorId && uuidLike(input.actorId) ? input.actorId : null,
        payload: payload as Prisma.InputJsonValue,
        dedupKey,
      },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    // A repeat of an event already queued is not an error, it is the dedup key doing its job.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && dedupKey) {
      const existing = await db.domainOutboxEvent.findUnique({ where: { dedupKey }, select: { id: true } });
      return existing?.id ?? null;
    }
    throw error;
  }
}

export interface ClaimedEvent { id: string; eventType: string; aggregateType: string; aggregateId: string; branchId: string | null; actorId: string | null; payload: Record<string, unknown>; attempts: number; maxAttempts: number }

/**
 * Take a batch of due events for this worker. Rows are locked with SKIP LOCKED, so two workers never take the same event, and a
 * row whose lease ran out (a worker that crashed mid-delivery) becomes claimable again.
 */
export async function claimOutboxBatch(db: PrismaClient, workerId: string = crypto.randomUUID(), limit = 20, leaseMs = 60_000, now = new Date()): Promise<ClaimedEvent[]> {
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    UPDATE "DomainOutboxEvent" SET "status" = 'PROCESSING', "lockedBy" = ${workerId}, "leaseUntil" = ${leaseUntil}, "attempts" = "attempts" + 1
    WHERE "id" IN (
      SELECT "id" FROM "DomainOutboxEvent"
      WHERE ("status" IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= ${now})
         OR ("status" = 'PROCESSING' AND "leaseUntil" < ${now})
      ORDER BY "createdAt" ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED
    )
    RETURNING "id"`;
  if (rows.length === 0) return [];
  const events = await db.domainOutboxEvent.findMany({ where: { id: { in: rows.map(row => row.id) } }, orderBy: { createdAt: 'asc' } });
  return events.map(event => ({ id: event.id, eventType: event.eventType, aggregateType: event.aggregateType, aggregateId: event.aggregateId, branchId: event.branchId, actorId: event.actorId, payload: (event.payload ?? {}) as Record<string, unknown>, attempts: event.attempts, maxAttempts: event.maxAttempts }));
}

export const backoffMs = (attempts: number) => Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 60 * 60_000);

export async function markProcessed(db: Db, id: string, routing: Prisma.InputJsonValue, policyVersion: number) {
  await db.domainOutboxEvent.update({ where: { id }, data: { status: 'PROCESSED', processedAt: new Date(), lockedBy: null, leaseUntil: null, lastError: null, routing, policyVersion } });
}

/** Retry with backoff; after the last attempt the event is DEAD and shows up in the health view instead of being retried forever. */
export async function markFailed(db: Db, event: Pick<ClaimedEvent, 'id' | 'attempts' | 'maxAttempts'>, error: unknown, now = new Date()) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  const dead = event.attempts >= event.maxAttempts;
  await db.domainOutboxEvent.update({
    where: { id: event.id },
    data: { status: dead ? 'DEAD' : 'FAILED', lastError: message, lockedBy: null, leaseUntil: null, nextAttemptAt: new Date(now.getTime() + backoffMs(event.attempts)) },
  });
  return dead ? 'DEAD' : 'FAILED';
}
