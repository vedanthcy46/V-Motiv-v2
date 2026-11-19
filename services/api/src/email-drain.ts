// Helpers that keep the email outbox from costing the database (and the people waiting on requests) more than it needs to.
import type { PrismaClient } from '@prisma/client';

/**
 * Is any email due to be sent or retried? One cheap query with no transaction. Claiming an email takes a transaction (BEGIN, SELECT ... FOR
 * UPDATE, COMMIT: three round trips), so asking first means an empty outbox costs one round trip, not three.
 */
export async function hasDeliverableEmail(db: Pick<PrismaClient, 'emailOutbox'>, now: Date = new Date()): Promise<boolean> {
  const row = await db.emailOutbox.findFirst({
    where: { OR: [{ state: 'PENDING', availableAt: { lte: now } }, { state: 'PROCESSING', leaseUntil: { lt: now } }] },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Runs `run` one at a time. A call made while it is running does not start a second copy (two would fight over the same rows and hold two
 * connections); it asks for one more pass afterwards, so anything queued in the meantime is still picked up.
 */
export function singleFlight(run: () => Promise<number>): () => Promise<number> {
  let running: Promise<number> | null = null;
  let again = false;
  const launch = (): Promise<number> => {
    const current = run().catch(() => 0).finally(() => {
      running = null;
      if (again) { again = false; void launch(); }
    });
    running = current;
    return current;
  };
  return () => {
    if (running) { again = true; return running; }
    return launch();
  };
}
