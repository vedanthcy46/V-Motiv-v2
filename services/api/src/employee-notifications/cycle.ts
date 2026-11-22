// One worker pass. Safe to call from a loop (Node), a cron trigger (Cloudflare) or an authenticated HTTP call: every step is idempotent.
import type { PrismaClient } from '@prisma/client';
import { processAnnouncements } from '../announcements/announcements.js';
import { sendDailyDigests } from './digest.js';
import { runDetectors } from './detectors.js';
import { runEscalations } from './escalation.js';
import { runOutboxOnce } from './processor.js';
import { localDate } from './workhours.js';

export interface CycleResult { outbox: { processed: number; failed: number; dead: number }; escalations?: Awaited<ReturnType<typeof runEscalations>>; detectors?: Awaited<ReturnType<typeof runDetectors>>; digests?: number; announcements?: { batches: number; completed: number } }

export async function runNotificationCycle(db: PrismaClient, opts: { now?: Date; workerId?: string; slow?: boolean } = {}): Promise<CycleResult> {
  const now = opts.now ?? new Date();
  // Drain what is due (several batches, bounded), so a backlog clears quickly but one pass never runs unbounded.
  const outbox = { processed: 0, failed: 0, dead: 0 };
  for (let i = 0; i < 5; i++) {
    const pass = await runOutboxOnce(db, { workerId: opts.workerId, limit: 25, now });
    outbox.processed += pass.processed; outbox.failed += pass.failed; outbox.dead += pass.dead;
    if (pass.processed + pass.failed + pass.dead < 25) break;
  }
  const result: CycleResult = { outbox };
  // Platform announcements to customers: start any that are due and deliver the next batches (cheap when there is nothing to do).
  result.announcements = await processAnnouncements(db, now).catch(() => ({ batches: 0, completed: 0 }));
  // The slower jobs run every few minutes: detectors raise events (processed on the next pass), escalations look at open alerts.
  const minute = now.getUTCMinutes();
  if (opts.slow !== false && minute % 5 === 0) {
    result.detectors = await runDetectors(db, now);
    result.escalations = await runEscalations(db, now);
  }
  // The daily digest goes out at 08:00 India time, once (the email key is unique per person per day).
  const [hh] = new Date(now.getTime() + 330 * 60_000).toISOString().slice(11, 16).split(':').map(Number);
  if (hh === 8 && minute < 5 && localDate(now, 'Asia/Kolkata')) result.digests = await sendDailyDigests(db, now);
  return result;
}
