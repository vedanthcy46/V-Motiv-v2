import 'dotenv/config';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { PrismaIdentityStore } from './identity-store.js';
import { PrismaCustomerStore } from './customer-store.js';
import { processEmail, resendSender } from './email.js';

const config = readConfig(process.env);
const firebase = initializeApp({ credential: applicationDefault(), projectId: config.FIREBASE_PROJECT_ID });
const db = new PrismaClient({ datasourceUrl: config.DATABASE_URL, transactionOptions: { timeout: 15000, maxWait: 5000 } });

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

const app = createApp({
  verify: (token, revoked) => {
    if (process.env.NODE_ENV !== 'production' && (token === 'dev-preview-token' || token.startsWith('dev-preview-token:'))) {
      return Promise.resolve({
        uid: 'dev-customer-preview-uid',
        email: 'preview.customer@vmotiv.in',
        email_verified: true,
        name: 'Preview Customer',
        firebase: { sign_in_provider: 'google.com' },
      } as any);
    }
    return getAuth(firebase).verifyIdToken(token, revoked);
  },
  store: new PrismaIdentityStore(db), customer: new PrismaCustomerStore(db), webOrigin: config.WEB_ORIGIN,
  drainEmails: drainOutbox,
});
const server = app.listen(config.PORT, '0.0.0.0', () => console.info(`V MOTIV V2 API listening on 0.0.0.0:${config.PORT}`));

async function shutdown() {
  if (emailInterval) clearInterval(emailInterval);
  server.close(async () => { await db.$disconnect(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

