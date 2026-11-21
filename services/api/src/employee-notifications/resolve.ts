import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Mark the alerts about a record as done because the work behind them is done (an approval was decided, a lead was answered, an
 * inspector was assigned). They stay in history; they stop being "needs action" and stop escalating. Call this from the business
 * transaction that completes the work, so the inbox never keeps asking for something that has already happened.
 */
export async function resolveNotificationsForResource(db: Db, resourceType: string, resourceId: string, opts: { eventTypes?: string[]; now?: Date } = {}): Promise<number> {
  const result = await db.notification.updateMany({
    where: { resourceType, resourceId, resolvedAt: null, ...(opts.eventTypes?.length ? { eventType: { in: opts.eventTypes } } : {}) },
    data: { resolvedAt: opts.now ?? new Date() },
  });
  return result.count;
}
