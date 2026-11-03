// Suppress Node.js DEP0169 deprecation warning from third-party middlewares so Cloudflare Workers do not flag healthy requests as errors
const originalEmitWarning = process.emitWarning;
process.emitWarning = function (warning: any, ...args: any[]) {
  if (typeof warning === 'string' && warning.includes('url.parse')) return;
  if (typeof args[0] === 'object' && args[0]?.code === 'DEP0169') return;
  if (args[1] === 'DEP0169') return;
  return (originalEmitWarning as any).call(process, warning, ...args);
};

import { Socket } from 'node:net';
import { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';
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
import { PrismaFinanceStore } from './finance-store.js';
import { PrismaServiceStore } from './service-store.js';
import { PrismaRentalStore } from './rental-store.js';
import { NotificationService, createNotificationRouter } from './notification/index.js';
import { PrismaConnectStore } from './connect-store.js';

let expressApp: Express | null = null;
let dbClient: PrismaClient | null = null;

function getOrCreateApp(): Express {
  if (expressApp) return expressApp;

  // Gracefully degrade email delivery if RESEND_API_KEY or EMAIL_FROM is not configured in worker secrets
  if (process.env.EMAIL_DELIVERY_ENABLED === 'true' && (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)) {
    console.warn('[CLOUDFLARE WORKER] RESEND_API_KEY or EMAIL_FROM not found in environment secrets. Disabling outbound email dispatch to keep API healthy.');
    process.env.EMAIL_DELIVERY_ENABLED = 'false';
  }

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
    firebaseApp = initializeApp({
      projectId: config.FIREBASE_PROJECT_ID,
    });
    return firebaseApp;
  }

  const db = new PrismaClient({
    datasourceUrl: config.DATABASE_URL,
    transactionOptions: { timeout: 15000, maxWait: 5000 },
  });
  dbClient = db;

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
      console.warn('[CLOUDFLARE EMAIL DISPATCHER INIT FAILED]', err);
    }
  }

  const adminWebOrigin = config.ADMIN_WEB_ORIGIN || (config.NODE_ENV === 'production' ? 'https://admin.vmotiv.in' : 'http://localhost:3200');
  const employeePortalOrigins = {
    admin: adminWebOrigin,
    sales: config.SALES_WEB_ORIGIN || (config.NODE_ENV === 'production' ? 'https://sales.vmotiv.in' : 'http://localhost:3300'),
    inspectionReview: config.INSPECTION_REVIEW_WEB_ORIGIN || (config.NODE_ENV === 'production' ? 'https://review.vmotiv.in' : 'http://localhost:3400'),
    operations: config.OPERATIONS_WEB_ORIGIN || (config.NODE_ENV === 'production' ? 'https://ops.vmotiv.in' : 'http://localhost:3500'),
    finance: config.FINANCE_WEB_ORIGIN || (config.NODE_ENV === 'production' ? 'https://finance.vmotiv.in' : 'http://localhost:3600'),
    inspector: config.INSPECTOR_MOBILE_DEEP_LINK || 'vmotiv://inspector',
  };

  const verifyToken = (token: string, revoked: boolean) => {
    const hasServiceAccount = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    return getAuth(getFirebase()).verifyIdToken(token, hasServiceAccount ? revoked : false);
  };

  const notificationService = new NotificationService(db);
  const notificationRouter = createNotificationRouter({
    verify: verifyToken,
    db,
    service: notificationService,
  });

  expressApp = createApp({
    verify: verifyToken,
    store: new PrismaIdentityStore(db),
    customer: new PrismaCustomerStore(db),
    webOrigin: config.WEB_ORIGIN,
    adminWebOrigin,
    employeePortalOrigins: [
      ...Object.values(employeePortalOrigins),
      ...(config.ALLOWED_ORIGINS || []),
    ],
    adminPortalDestinations: employeePortalOrigins,
    admin: new PrismaAdminStore(db),
    sales: new PrismaSalesStore(db),
    inspection: new PrismaInspectionStore(db, undefined, notificationService),
    finance: new PrismaFinanceStore(db, notificationService),
    service: new PrismaServiceStore(db, notificationService),
    rental: new PrismaRentalStore(db, notificationService),
    connect: new PrismaConnectStore(db, notificationService),
    db,
    notificationRouter,
    notificationService,
    revokeTokens: firebaseUid => {
      const hasServiceAccount = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      if (!hasServiceAccount) return Promise.resolve();
      return getAuth(getFirebase()).revokeRefreshTokens(firebaseUid);
    },
    drainEmails,
  });

  return expressApp;
}

/**
 * High-performance, zero-dependency bridge between Cloudflare Worker Web Fetch
 * requests and the Express application handler.
 */
async function fetchToExpress(app: Express, webReq: Request): Promise<Response> {
  return new Promise(async (resolve, reject) => {
    try {
      const clientIp = webReq.headers.get('cf-connecting-ip') ||
                       (webReq.headers.get('x-forwarded-for')?.split(',')[0] || '').trim() ||
                       webReq.headers.get('x-real-ip') ||
                       '127.0.0.1';

      const socket = new Socket();
      Object.defineProperty(socket, 'remoteAddress', {
        value: clientIp,
        writable: true,
        configurable: true,
      });

      const req = new IncomingMessage(socket);
      const parsedUrl = new URL(webReq.url);
      
      req.url = parsedUrl.pathname + parsedUrl.search;
      req.method = webReq.method;
      req.headers = Object.fromEntries(webReq.headers.entries());

      req.headers['cf-connecting-ip'] = clientIp;
      if (!req.headers['x-forwarded-for']) {
        req.headers['x-forwarded-for'] = clientIp;
      }
      (req as any).ip = clientIp;

      const res = new ServerResponse(req);
      res.assignSocket(socket);

      const chunks: Buffer[] = [];
      res.write = (chunk: any, encoding?: any, cb?: any): any => {
        if (typeof chunk === 'function') { cb = chunk; chunk = null; }
        if (typeof encoding === 'function') { cb = encoding; encoding = undefined; }
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding));
        }
        if (typeof cb === 'function') cb();
        return true;
      };

      res.end = (chunk?: any, encoding?: any, cb?: any): any => {
        if (typeof chunk === 'function') { cb = chunk; chunk = null; }
        if (typeof encoding === 'function') { cb = encoding; encoding = undefined; }
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding));
        }
        if (typeof cb === 'function') cb();

        const responseBody = Buffer.concat(chunks);
        const resHeaders = new Headers();
        const rawHeaders = res.getHeaders();
        for (const [k, v] of Object.entries(rawHeaders)) {
          if (Array.isArray(v)) {
            for (const item of v) resHeaders.append(k, String(item));
          } else if (v !== undefined) {
            resHeaders.set(k, String(v));
          }
        }

        resolve(new Response(responseBody, {
          status: res.statusCode || 200,
          statusText: res.statusMessage || 'OK',
          headers: resHeaders,
        }));
        return res;
      };

      if (webReq.body && webReq.method !== 'GET' && webReq.method !== 'HEAD') {
        const arrayBuffer = await webReq.arrayBuffer();
        req.push(Buffer.from(arrayBuffer));
      }
      req.push(null);

      app(req, res);
    } catch (err) {
      reject(err);
    }
  });
}

export default {
  async fetch(request: Request, env: Record<string, string>, ctx: { waitUntil: (p: Promise<any>) => void }): Promise<Response> {
    const origin = request.headers.get('Origin') || '';

    // 1. Explicit Worker-level CORS preflight
    if (request.method === 'OPTIONS') {
      const reqHeaders = request.headers.get('Access-Control-Request-Headers') || 'Content-Type, Authorization, Accept, X-Requested-With, Origin';
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': reqHeaders,
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      // 2. Populate process.env from Cloudflare Worker env/secrets bindings
      if (env && typeof env === 'object') {
        for (const [key, value] of Object.entries(env)) {
          if (typeof value === 'string') {
            process.env[key] = value;
          }
        }
      }

      // 3. Initialize application with populated environment
      const app = getOrCreateApp();

      // 4. Forward request through Express bridge
      const response = await fetchToExpress(app, request);

      // 5. Ensure CORS headers are present on all responses
      if (origin && !response.headers.has('Access-Control-Allow-Origin')) {
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, Origin');
      }

      return response;
    } catch (err: any) {
      console.error('[WORKER_UNHANDLED_ERROR]', err);
      const fallbackOrigin = origin || '*';
      return new Response(
        JSON.stringify({
          code: 'WORKER_INTERNAL_ERROR',
          message: err?.message || 'Internal Worker Error',
          issues: err?.issues || undefined,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': fallbackOrigin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-Requested-With, Origin',
          },
        }
      );
    }
  },
};
