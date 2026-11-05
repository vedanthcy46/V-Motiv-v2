// Suppress Node.js DEP0169 deprecation warning from third-party middlewares so Cloudflare Workers do not flag healthy requests as errors
const originalEmitWarning = process.emitWarning;
process.emitWarning = function (warning: any, ...args: any[]) {
  if (typeof warning === 'string' && warning.includes('url.parse')) return;
  if (typeof args[0] === 'object' && args[0]?.code === 'DEP0169') return;
  if (args[1] === 'DEP0169') return;
  return (originalEmitWarning as any).call(process, warning, ...args);
};

import { AsyncLocalStorage } from 'node:async_hooks';
import { Socket } from 'node:net';
import { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';
import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { PrismaClient } from '@prisma/client';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';

// In edge environments (Cloudflare Workers), force Neon serverless queries to run over HTTP fetch
// instead of persistent WebSockets. WebSockets freeze/break across requests in warm isolates.
neonConfig.poolQueryViaFetch = true;
if (typeof WebSocket !== 'undefined') {
  neonConfig.webSocketConstructor = WebSocket;
}
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
import { createEdgeTokenVerifier } from './edge-auth.js';
import { domainsForModel, isWriteOperation, signalerFromEnv } from './rtdb-signal.js';

let expressApp: Express | null = null;
let createClientForRequest: (() => PrismaClient) | null = null;
// Cloudflare Workers forbid reusing I/O objects (such as a Neon WebSocket connection) across requests. A Prisma client
// created once and shared would keep a pooled connection from request A and hand it to request B, which fails with
// "Cannot perform I/O on behalf of a different request" (seen as INTERNAL_ERROR on every interactive transaction).
// So every request gets its own Prisma client, closed when the response is done. Stores keep using one `db` handle that
// forwards to the client of the request being served.
interface RequestScope {
  client: PrismaClient;
  /** Keep work running after the response is sent. The request's client is only closed once all of it has finished. */
  waitUntil: (promise: Promise<unknown>) => void;
  background: Promise<unknown>[];
}
const requestScope = new AsyncLocalStorage<RequestScope>();

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

  // Realtime signals for the staff portals (Firebase Realtime Database). No-op unless FIREBASE_DATABASE_URL is set.
  const signaler = signalerFromEnv(process.env, () => requestScope.getStore()?.waitUntil);

  function createRequestClient(): PrismaClient {
    let client: PrismaClient;
    try {
      neonConfig.poolQueryViaFetch = true;
      if (typeof WebSocket !== 'undefined') {
        neonConfig.webSocketConstructor = WebSocket;
      }
      const adapter = new PrismaNeon({ connectionString: config.DATABASE_URL });
      client = new PrismaClient({
        adapter,
        transactionOptions: { timeout: 15000, maxWait: 5000 },
      });
    } catch (adapterErr) {
      console.warn('[PRISMA_ADAPTER_FALLBACK]', adapterErr);
      client = new PrismaClient({
        datasourceUrl: config.DATABASE_URL,
        transactionOptions: { timeout: 15000, maxWait: 5000 },
      });
    }
    if (!signaler) return client;
    return (client as any).$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }: { model: string; operation: string; args: unknown; query: (a: unknown) => Promise<unknown> }) {
            const result = await query(args);
            if (isWriteOperation(operation)) signaler.signal(domainsForModel(model));
            return result;
          },
        },
      },
    }) as unknown as PrismaClient;
  }

  // Used only outside a request (there should be none); created lazily so it never holds a connection by default.
  let outOfRequestClient: PrismaClient | null = null;
  const db = new Proxy({} as PrismaClient, {
    get(_target, property) {
      const client = requestScope.getStore()?.client ?? (outOfRequestClient ??= createRequestClient());
      const value = Reflect.get(client as object, property);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  });
  createClientForRequest = createRequestClient;

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
      // Admin routes call this fire-and-forget right before responding. In a Worker, anything not registered with
      // waitUntil is cancelled when the response is sent, so queued mail (invitations, replies) was never delivered.
      drainEmails = () => {
        const job = drainOutbox(db, send, emailFrom, 5);
        requestScope.getStore()?.waitUntil(job);
        return job;
      };
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

  let fallbackVerifier: ((token: string, revoked: boolean) => Promise<any>) | undefined;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    fallbackVerifier = (t, r) => getAuth(getFirebase()).verifyIdToken(t, r);
  }

  const verifyToken = createEdgeTokenVerifier({
    projectId: config.FIREBASE_PROJECT_ID,
    fallbackVerifier,
  });

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
    revokeTokens: async firebaseUid => {
      const hasServiceAccount = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      if (!hasServiceAccount) return;
      try {
        await getAuth(getFirebase()).revokeRefreshTokens(firebaseUid);
      } catch (err) {
        console.warn('[CLOUDFLARE WORKER REVOKE TOKENS FAILED]', err);
      }
    },
    drainEmails,
  });

  return expressApp;
}

/**
 * High-performance, zero-dependency bridge between Cloudflare Worker Web Fetch
 * requests and the Express application handler.
 */
export async function fetchToExpress(app: Express, webReq: Request): Promise<Response> {
  return new Promise(async (resolve, reject) => {
    try {
      const clientIp = webReq.headers.get('cf-connecting-ip') ||
                       (webReq.headers.get('x-forwarded-for')?.split(',')[0] || '').trim() ||
                       webReq.headers.get('x-real-ip') ||
                       '127.0.0.1';

      const socket = new Socket();
      socket.on('error', () => { /* prevent unhandled socket error from crashing isolate */ });
      Object.defineProperty(socket, 'remoteAddress', {
        value: clientIp,
        writable: true,
        configurable: true,
      });

      const req = new IncomingMessage(socket);
      req.on('error', () => { /* prevent unhandled req error */ });
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
      res.on('error', () => { /* prevent unhandled res error */ });
      res.assignSocket(socket);

      let resolved = false;
      const timeoutTimer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(new Response(
            JSON.stringify({ code: 'GATEWAY_TIMEOUT', message: 'Request execution timed out' }),
            { status: 504, headers: { 'Content-Type': 'application/json' } }
          ));
        }
      }, 25000);

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
        if (resolved) return res;
        resolved = true;
        clearTimeout(timeoutTimer);

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

      let requestBody: Buffer | undefined;
      if (webReq.method !== 'GET' && webReq.method !== 'HEAD') {
        const arrayBuffer = await webReq.arrayBuffer();
        requestBody = Buffer.from(arrayBuffer);

        // Cloudflare's Fetch Request does not guarantee a Content-Length
        // header. Express/body-parser uses that header (or transfer-encoding)
        // to decide whether a request has a body. Without it, every JSON POST
        // crossing this bridge arrives as req.body === undefined even though
        // the bytes were pushed below.
        if (requestBody.length > 0) {
          // The Worker already owns the complete request body at this point.
          // Do not trust a proxy-provided zero/stale Content-Length: it makes
          // body-parser skip the bytes we are about to push into the bridge.
          req.headers['content-length'] = String(requestBody.length);
          delete req.headers['transfer-encoding'];

          // Cloudflare has already supplied the complete byte sequence. Give
          // Express the parsed JSON object directly, rather than depending on
          // its Node-stream body detection inside the Worker compatibility
          // layer. Invalid JSON deliberately falls through to Express's parser
          // so it retains the standard INVALID_JSON response.
          const contentType = String(req.headers['content-type'] || '');
          if (contentType.toLowerCase().includes('application/json')) {
            try {
              (req as any).rawBody = requestBody.toString('utf8');
              (req as any).body = JSON.parse((req as any).rawBody);
            } catch {
              // Leave req.body undefined; the normal Express parser will
              // produce the appropriate invalid-JSON response.
            }
          }
        }
      }
      if (requestBody?.length) {
        req.push(requestBody);
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

    let scope: RequestScope | null = null;
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
      const background: Promise<unknown>[] = [];
      scope = {
        client: createClientForRequest!(),
        background,
        waitUntil: p => {
          background.push(p);
          ctx?.waitUntil?.(p);
        },
      };

      // 4. Forward request through Express bridge (inside this request's own database scope)
      const response = await requestScope.run(scope, () => fetchToExpress(app, request));

      // 5. Ensure CORS headers are present on all responses
      const allowOrigin = origin || '*';
      if (!response.headers.has('Access-Control-Allow-Origin')) {
        response.headers.set('Access-Control-Allow-Origin', allowOrigin);
      }
      if (!response.headers.has('Access-Control-Allow-Methods')) {
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      }
      if (!response.headers.has('Access-Control-Allow-Headers')) {
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
    } finally {
      // Close this request's connections once the response is complete; never block or fail the response.
      const finished = scope;
      if (finished) {
        // Wait for background work (email drain, realtime signals) before closing the connections it may still be using.
        ctx?.waitUntil?.(Promise.allSettled(finished.background).then(() => finished.client.$disconnect()).catch(() => undefined));
      }
    }
  },
};
