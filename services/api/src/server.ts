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
import { PrismaSalesStore } from './sales-store.js';
import { PrismaInspectionStore } from './inspection-store.js';
import { PrismaFinanceStore } from './finance-store.js';
import { PrismaServiceStore } from './service-store.js';
import { PrismaRentalStore } from './rental-store.js';
import { PrismaConnectStore } from './connect-store.js';
import { PrismaValuationStore } from './valuation-store.js';
import { attachConnectRealtime } from './connect-realtime.js';
import { processEmail, resendSender } from './email.js';
import { NotificationService, createNotificationRouter } from './notification/index.js';
import { keepAliveTarget, startKeepAlive } from './keep-alive.js';
import { repairPrematurelyPaidServiceRequests } from './service-repair.js';
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
});

let drainOutbox: (() => Promise<number>) | undefined;
let emailInterval: NodeJS.Timeout | null = null;
if (config.EMAIL_DELIVERY_ENABLED === 'true' && config.RESEND_API_KEY && config.EMAIL_FROM) {
  try {
    const send = resendSender(config);
    drainOutbox = async () => {
      let totalSent = 0;
      try {
        let sent = false;
        do {
          sent = await processEmail(db, send, config.EMAIL_FROM!);
          if (sent) totalSent++;
        } while (sent);
      } catch (err: any) {
        console.error('[EMAIL DISPATCH ERROR]', err?.message || err);
      }
      return totalSent;
    };
    emailInterval = setInterval(drainOutbox, 3000);
    emailInterval.unref();
    void drainOutbox();
    console.info(`[EMAIL ENGINE] Active · Automated outbox dispatcher running every 3s via ${config.EMAIL_FROM}`);
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
const notificationRouter = createNotificationRouter({
  verify: verifyToken,
  db,
  service: notificationService,
});

const app = createApp({
  verify: verifyToken,
  store: new PrismaIdentityStore(db), customer: new PrismaCustomerStore(db, notificationService), webOrigin: config.WEB_ORIGIN,
  adminWebOrigin,
  employeePortalOrigins: Object.values(employeePortalOrigins),
  adminPortalDestinations: employeePortalOrigins,
  admin: new PrismaAdminStore(db),
  sales: new PrismaSalesStore(db, undefined, notificationService),
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

