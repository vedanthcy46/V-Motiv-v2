import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { PrismaIdentityStore } from './identity-store.js';
import { PrismaCustomerStore } from './customer-store.js';
import { createResendSender, drainOutbox } from './email.js';
import { PrismaAdminStore } from './admin-store.js';
import { PrismaSalesStore } from './sales-store.js';
import { PrismaInspectionStore } from './inspection-store.js';

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
  datasources: { db: { url: config.DATABASE_URL } },
  transactionOptions: { timeout: 15000, maxWait: 5000 },
});

const resendApiKey = config.RESEND_API_KEY;
const emailFrom = config.EMAIL_FROM;

let drainEmails: (() => Promise<number>) | undefined;
if (config.EMAIL_DELIVERY_ENABLED === 'true' && resendApiKey && emailFrom) {
  try {
    const send = createResendSender({
      apiKey: resendApiKey,
      from: emailFrom,
      webOrigin: config.WEB_ORIGIN,
    });
    drainEmails = async () => drainOutbox(db, send, emailFrom, 5);
  } catch (err) {
    console.warn('[VERCEL EMAIL DISPATCHER INIT FAILED]', err);
  }
}

const adminWebOrigin = config.ADMIN_WEB_ORIGIN || (config.NODE_ENV === 'production' ? 'https://admin.vmotiv.in' : 'http://localhost:3200');
const employeePortalOrigins = {
  admin: adminWebOrigin,
  sales: config.SALES_WEB_ORIGIN || (config.NODE_ENV === 'production' ? 'https://sales.vmotiv.in' : 'http://localhost:3300'),
  inspectionReview: config.INSPECTION_REVIEW_WEB_ORIGIN || (config.NODE_ENV === 'production' ? 'https://review.vmotiv.in' : 'http://localhost:3400'),
  operations: config.OPERATIONS_WEB_ORIGIN || (config.NODE_ENV === 'production' ? 'https://ops.vmotiv.in' : 'http://localhost:3500'),
  inspector: config.INSPECTOR_MOBILE_DEEP_LINK || 'vmotiv://inspector',
};

// Serverless entry point: transactional outbox drains inline on mutation requests
export default createApp({
  verify: (token, revoked) => {
    const hasServiceAccount = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    return getAuth(getFirebase()).verifyIdToken(token, hasServiceAccount ? revoked : false);
  },
  store: new PrismaIdentityStore(db),
  customer: new PrismaCustomerStore(db),
  webOrigin: config.WEB_ORIGIN,
  adminWebOrigin,
  employeePortalOrigins: Object.values(employeePortalOrigins),
  adminPortalDestinations: employeePortalOrigins,
  admin: new PrismaAdminStore(db),
  sales: new PrismaSalesStore(db),
  inspection: new PrismaInspectionStore(db),
  revokeTokens: firebaseUid => {
    const hasServiceAccount = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (!hasServiceAccount) return Promise.resolve();
    return getAuth(getFirebase()).revokeRefreshTokens(firebaseUid);
  },
  drainEmails,
});
