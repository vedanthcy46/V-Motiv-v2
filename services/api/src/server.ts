import 'dotenv/config';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { PrismaIdentityStore } from './identity-store.js';
import { PrismaCustomerStore } from './customer-store.js';

const config = readConfig(process.env);
const firebase = initializeApp({ credential: applicationDefault(), projectId: config.FIREBASE_PROJECT_ID });
const db = new PrismaClient();
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
});
const server = app.listen(config.PORT, '0.0.0.0', () => console.info(`V MOTIV V2 API listening on 0.0.0.0:${config.PORT}`));
async function shutdown() { server.close(async () => { await db.$disconnect(); process.exit(0); }); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

