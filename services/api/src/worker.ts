import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { readConfig } from './config.js';
import { processEmail, resendSender } from './email.js';
import { NotificationService } from './notification/index.js';
import { runNotificationCycle } from './employee-notifications/cycle.js';

const config = readConfig(process.env);
const db = new PrismaClient({
  datasourceUrl: config.DATABASE_URL || undefined,
});
const notificationService = new NotificationService(db);

let sendEmail: ReturnType<typeof resendSender> | null = null;
try {
  sendEmail = resendSender(config);
} catch (e: any) {
  console.info('[WORKER_INFO] Resend email delivery disabled or not configured:', e?.message || e);
}

let stopped = false;
process.on('SIGINT', () => { stopped = true; });
process.on('SIGTERM', () => { stopped = true; });

console.info('[V_MOTIV_NOTIFICATION_WORKER_STARTED] Monitoring Email Outbox and Expo Push Queue...');

let loopIteration = 0;

try {
  while (!stopped) {
    loopIteration++;

    // 1. Drain Email Outbox (Resend)
    if (sendEmail && config.EMAIL_FROM) {
      try {
        let emailDrained = false;
        do {
          emailDrained = await processEmail(db, sendEmail, config.EMAIL_FROM);
        } while (emailDrained && !stopped);
      } catch (err: any) {
        console.error('[WORKER_EMAIL_PROCESS_ERROR]', err?.message || err);
      }
    }

    // 1b. Employee notifications: outbox -> inbox, detectors, escalations, digests
    try {
      const cycle = await runNotificationCycle(db, { workerId: `worker-${process.pid}` });
      if (cycle.outbox.processed + cycle.outbox.failed + cycle.outbox.dead > 0) console.info('[WORKER_NOTIFICATION_CYCLE]', JSON.stringify(cycle.outbox));
    } catch (err: any) {
      console.error('[WORKER_NOTIFICATION_CYCLE_ERROR]', err?.message || err);
    }

    // 2. Drain Expo Push Tickets
    try {
      const ticketsSent = await notificationService.drainPushTickets(50);
      if (ticketsSent > 0) {
        console.info(`[WORKER_PUSH_DISPATCHED] Sent ${ticketsSent} Expo push notification(s)`);
      }
    } catch (err: any) {
      console.error('[WORKER_PUSH_DRAIN_ERROR]', err?.message || err);
    }

    // 3. Check Expo Push Receipts every ~15 iterations (~30 seconds)
    if (loopIteration % 15 === 0) {
      try {
        const receiptsChecked = await notificationService.checkPushReceipts(100);
        if (receiptsChecked > 0) {
          console.info(`[WORKER_PUSH_RECEIPTS] Verified ${receiptsChecked} push receipt(s)`);
        }
      } catch (err: any) {
        console.error('[WORKER_RECEIPT_POLL_ERROR]', err?.message || err);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }
} finally {
  console.info('[WORKER_STOPPING] Disconnecting database...');
  await db.$disconnect();
}
