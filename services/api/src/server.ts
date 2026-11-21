import 'dotenv/config';

// Suppress Node.js DEP0169 deprecation warning from third-party middlewares so loggers do not flag healthy requests as errors
const originalEmitWarning = process.emitWarning;
process.emitWarning = function (warning: any, ...args: any[]) {
  if (typeof warning === 'string' && warning.includes('url.parse')) return;
  if (typeof args[0] === 'object' && args[0]?.code === 'DEP0169') return;
  if (args[1] === 'DEP0169') return;
  return (originalEmitWarning as any).call(process, warning, ...args);
};

import fs from 'node:fs';
import path from 'node:path';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { PrismaIdentityStore } from './identity-store.js';
import { PrismaCustomerStore } from './customer-store.js';
import { PrismaAdminStore } from './admin-store.js';
import { ScrapRequestStore } from './scrap-requests.js';
import { HomeContentStore } from './home-content.js';
import { cloudinaryCloudName } from './cloudinary.js';
import { PrismaSalesStore } from './sales-store.js';
import { PrismaInspectionStore } from './inspection-store.js';
import { PrismaFinanceStore } from './finance-store.js';
import { PrismaServiceStore } from './service-store.js';
import { PrismaRentalStore } from './rental-store.js';
import { PrismaConnectStore } from './connect-store.js';
import { PrismaValuationStore } from './valuation-store.js';
import { attachConnectRealtime } from './connect-realtime.js';
import { processEmail, resendSender } from './email.js';
import { runNotificationCycle } from './employee-notifications/cycle.js';
import { NotificationService, createNotificationRouter } from './notification/index.js';
import { keepAliveTarget, startKeepAlive } from './keep-alive.js';
import compression from 'compression';
import { milliseconds, slowQueryLine } from './request-timing.js';
import { hasDeliverableEmail, singleFlight } from './email-drain.js';
import { ensureSchemaAdditions, repairPrematurelyPaidServiceRequests } from './service-repair.js';
import { parseServiceAccount } from './firebase-credential.js';

const config = readConfig(process.env);

let firebaseCredential = undefined;
// Hosted services (Render, etc.) have no secret files: the service-account JSON can be given as an environment variable
// (plain JSON, or the same JSON base64-encoded).
const inlineServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (inlineServiceAccount?.trim()) {
  const parsedKey = parseServiceAccount(inlineServiceAccount, config.FIREBASE_PROJECT_ID);
  if (parsedKey.ok) {
    try {
      firebaseCredential = cert(parsedKey.key as any);
      console.info(`[FIREBASE] Using the service-account key from FIREBASE_SERVICE_ACCOUNT_JSON (${parsedKey.format}) for ${parsedKey.key.client_email}`);
    } catch (error: any) {
      console.error('[FIREBASE] The service-account key was rejected:', error?.message || error);
    }
  } else {
    // Without a usable key every login fails with "app/invalid-credential", so say exactly why at start-up.
    console.error(`[FIREBASE] FIREBASE_SERVICE_ACCOUNT_JSON cannot be used: ${parsedKey.reason}`);
  }
}
const possibleSecrets = [
  path.resolve(process.cwd(), 'secrets/firebase-admin.json'),
  path.resolve(process.cwd(), '../secrets/firebase-admin.json'),
  path.resolve(process.cwd(), '../../secrets/firebase-admin.json'),
];
for (const p of firebaseCredential ? [] : possibleSecrets) {
  if (fs.existsSync(p)) {
    try {
      firebaseCredential = cert(JSON.parse(fs.readFileSync(p, 'utf8')));
      break;
    } catch {}
  }
}
if (!firebaseCredential) {
  try {
    firebaseCredential = applicationDefault();
  } catch {}
  if (config.NODE_ENV === 'production') {
    console.error('[FIREBASE] No service-account key was found (FIREBASE_SERVICE_ACCOUNT_JSON missing or unusable). Logins will fail with "app/invalid-credential" until it is set.');
  }
}

const firebase = initializeApp({
  credential: firebaseCredential,
  projectId: config.FIREBASE_PROJECT_ID,
});
const db = new PrismaClient({
  datasourceUrl: config.DATABASE_URL || undefined,
  transactionOptions: { timeout: 15000, maxWait: 5000 },
  log: [{ emit: 'event', level: 'query' }],
});
// Slow-query and slow-request logging, to find what is actually slow. SLOW_QUERY_MS / SLOW_REQUEST_MS change the thresholds; 0 turns one off.
const slowQueryMs = milliseconds(process.env.SLOW_QUERY_MS, 1000);
const slowRequestMs = milliseconds(process.env.SLOW_REQUEST_MS, 1500);
(db as unknown as { $on: (event: 'query', handler: (e: { duration: number; query: string }) => void) => void }).$on('query', event => {
  const line = slowQueryLine(event, slowQueryMs);
  if (line) console.warn(line);
});

let drainOutbox: (() => Promise<number>) | undefined;
let emailInterval: NodeJS.Timeout | null = null;
if (config.EMAIL_DELIVERY_ENABLED === 'true' && config.RESEND_API_KEY && config.EMAIL_FROM) {
  try {
    const send = resendSender(config);
    // One drain at a time, and nothing is claimed when nothing is due: the old loop opened a database transaction every 3 seconds even with an
    // empty outbox, and several could overlap when the database was slow.
    drainOutbox = singleFlight(async () => {
      let totalSent = 0;
      try {
        if (!(await hasDeliverableEmail(db))) return 0;
        let sent = false;
        do {
          sent = await processEmail(db, send, config.EMAIL_FROM!);
          if (sent) totalSent++;
        } while (sent);
      } catch (err: any) {
        console.error('[EMAIL DISPATCH ERROR]', err?.message || err);
      }
      return totalSent;
    });
    // New emails trigger a drain right away (see emailDrainInBackground). This timer only catches retries and abandoned leases, which are
    // never due sooner than about a minute, so it does not need to run every few seconds. EMAIL_POLL_MS changes it (minimum 1000).
    const pollMs = Math.max(1000, milliseconds(process.env.EMAIL_POLL_MS, 15_000));
    emailInterval = setInterval(() => { void drainOutbox?.(); }, pollMs);
    emailInterval.unref();
    void drainOutbox();
    console.info(`[EMAIL ENGINE] Active · outbox checked every ${Math.round(pollMs / 1000)}s and right after an email is queued, via ${config.EMAIL_FROM}`);
  } catch (err: any) {
    console.warn('[EMAIL ENGINE] Delivery disabled or not configured:', err?.message || err);
  }
}

const adminWebOrigin = config.ADMIN_WEB_ORIGIN || 'http://localhost:3200';
const employeePortalOrigins = {
  admin: adminWebOrigin,
  sales: config.SALES_WEB_ORIGIN || 'http://localhost:3300',
  inspectionReview: config.INSPECTION_REVIEW_WEB_ORIGIN || 'http://localhost:3400',
  operations: config.OPERATIONS_WEB_ORIGIN || 'http://localhost:3500',
  finance: config.FINANCE_WEB_ORIGIN || 'http://localhost:3600',
  inspector: config.INSPECTOR_MOBILE_DEEP_LINK || 'vmotiv://inspector',
};

const verifyToken = (token: string, revoked: boolean) => getAuth(firebase).verifyIdToken(token, revoked);
const notificationService = new NotificationService(db);
const pushInterval = setInterval(async () => {
  try {
    await notificationService.drainPushTickets(50);
  } catch {}
}, 4000);
pushInterval.unref();
// The notification pipeline: outbox -> inbox, detectors, escalations (see employee-notifications/cycle.ts).
let cycleRunning = false;
const cycleInterval = setInterval(async () => {
  if (cycleRunning) return;
  cycleRunning = true;
  try { await runNotificationCycle(db); } catch (error: any) { console.error('[NOTIFICATION_CYCLE_ERROR]', error?.message || error); } finally { cycleRunning = false; }
}, 5000);
cycleInterval.unref();
const notificationRouter = createNotificationRouter({
  verify: verifyToken,
  db,
  service: notificationService,
});

const app = createApp({
  emailDrainInBackground: true,
  compression: compression({ threshold: 1024 }),
  slowRequestMs,
  verify: verifyToken,
  store: new PrismaIdentityStore(db), customer: new PrismaCustomerStore(db, notificationService), webOrigin: config.WEB_ORIGIN,
  adminWebOrigin,
  employeePortalOrigins: Object.values(employeePortalOrigins),
  adminPortalDestinations: employeePortalOrigins,
  admin: new PrismaAdminStore(db),
  sales: new PrismaSalesStore(db, undefined, notificationService),
  scrap: new ScrapRequestStore(db, notificationService),
  homeContent: new HomeContentStore(db, cloudinaryCloudName),
  inspection: new PrismaInspectionStore(db, undefined, notificationService),
  finance: new PrismaFinanceStore(db, notificationService),
  service: new PrismaServiceStore(db, notificationService),
  rental: new PrismaRentalStore(db, notificationService),
  connect: new PrismaConnectStore(db, notificationService),
  valuation: new PrismaValuationStore(db),
  db,
  notificationRouter,
  notificationService,
  revokeTokens: firebaseUid => getAuth(firebase).revokeRefreshTokens(firebaseUid),
  drainEmails: drainOutbox,
});
// Before serving: add any column the code now reads that this database does not have yet (see service-repair.ts).
await ensureSchemaAdditions(db);
const server = app.listen(config.PORT, '0.0.0.0', () => console.info(`V MOTIV V2 API listening on 0.0.0.0:${config.PORT}`));
attachConnectRealtime(server);

// Put back service requests an earlier version wrongly marked PAID before they were billed (idempotent; see service-repair.ts).
void repairPrematurelyPaidServiceRequests(db);

// On Render's free plan the service sleeps after ~15 min without traffic: call our own health route every 5 minutes.
const keepAliveUrl = keepAliveTarget(process.env);
const stopKeepAlive = keepAliveUrl ? startKeepAlive({ baseUrl: keepAliveUrl }) : null;

async function shutdown() {
  if (emailInterval) clearInterval(emailInterval);
  stopKeepAlive?.();
  server.close(async () => { await db.$disconnect(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

