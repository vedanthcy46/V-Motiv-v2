import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { PrismaIdentityStore } from './identity-store.js';
import { PrismaCustomerStore } from './customer-store.js';

const config = readConfig(process.env);

let firebaseApp: ReturnType<typeof initializeApp> | null = null;
function getFirebase() {
  if (firebaseApp) return firebaseApp;
  if (getApps().length) {
    firebaseApp = getApp();
    return firebaseApp;
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      firebaseApp = initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
        projectId: config.FIREBASE_PROJECT_ID,
      });
      return firebaseApp;
    } catch (err) {
      console.error('Failed to initialize Firebase Admin with FIREBASE_SERVICE_ACCOUNT_JSON:', err);
    }
  }
  // Cryptographic token verification fallback using Google public x509 certificates and projectId
  firebaseApp = initializeApp({
    projectId: config.FIREBASE_PROJECT_ID,
  });
  return firebaseApp;
}

const db = new PrismaClient({
  datasourceUrl: config.DATABASE_URL,
  transactionOptions: { timeout: 15000, maxWait: 5000 },
});

// Vercel owns the HTTP listener. No long-running email loop in a request function.
export default createApp({
  verify: (token, revoked) => {
    const hasServiceAccount = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    return getAuth(getFirebase()).verifyIdToken(token, hasServiceAccount ? revoked : false);
  },
  store: new PrismaIdentityStore(db),
  customer: new PrismaCustomerStore(db),
  webOrigin: config.WEB_ORIGIN,
});
