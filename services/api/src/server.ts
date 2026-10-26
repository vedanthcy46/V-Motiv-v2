import 'dotenv/config';
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
import { processEmail, resendSender } from './email.js';

const config = readConfig(process.env);

let firebaseCredential = undefined;
const possibleSecrets = [
  path.resolve(process.cwd(), 'secrets/firebase-admin.json'),
  path.resolve(process.cwd(), '../secrets/firebase-admin.json'),
  path.resolve(process.cwd(), '../../secrets/firebase-admin.json'),
];
for (const p of possibleSecrets) {
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
}

const firebase = initializeApp({
  credential: firebaseCredential,
  projectId: config.FIREBASE_PROJECT_ID,
});
const db = new PrismaClient({
  datasources: config.DATABASE_URL ? { db: { url: config.DATABASE_URL } } : undefined,
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
  inspector: config.INSPECTOR_MOBILE_DEEP_LINK || 'vmotiv://inspector',
};
const app = createApp({
  verify: (token, revoked) => getAuth(firebase).verifyIdToken(token, revoked),
  store: new PrismaIdentityStore(db), customer: new PrismaCustomerStore(db), webOrigin: config.WEB_ORIGIN,
  adminWebOrigin,
  employeePortalOrigins: Object.values(employeePortalOrigins),
  adminPortalDestinations: employeePortalOrigins,
  admin: new PrismaAdminStore(db),
  sales: new PrismaSalesStore(db),
  inspection: new PrismaInspectionStore(db),
  revokeTokens: firebaseUid => getAuth(firebase).revokeRefreshTokens(firebaseUid),
  drainEmails: drainOutbox,
});
const server = app.listen(config.PORT, '0.0.0.0', () => console.info(`V MOTIV V2 API listening on 0.0.0.0:${config.PORT}`));

async function shutdown() {
  if (emailInterval) clearInterval(emailInterval);
  server.close(async () => { await db.$disconnect(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

