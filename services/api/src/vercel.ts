import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { PrismaIdentityStore } from './identity-store.js';
import { PrismaCustomerStore } from './customer-store.js';

const config = readConfig(process.env);
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required for Vercel.');
const firebase = getApps().length ? getApp() : initializeApp({
  credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)), projectId: config.FIREBASE_PROJECT_ID,
});
const db = new PrismaClient({ datasourceUrl: config.DATABASE_URL, transactionOptions: { timeout: 15000, maxWait: 5000 } });
// Vercel owns the HTTP listener. No long-running email loop in a request function.
export default createApp({
  verify: (token, revoked) => getAuth(firebase).verifyIdToken(token, revoked),
  store: new PrismaIdentityStore(db), customer: new PrismaCustomerStore(db), webOrigin: config.WEB_ORIGIN,
});
