import express, { type ErrorRequestHandler, type Router } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import { isCloudinaryConfigured, uploadToCloudinary } from './cloudinary.js';

if (!('toJSON' in BigInt.prototype)) {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value: function () {
      return this.toString();
    },
    writable: true,
    configurable: true,
  });
}

const __filename = typeof import.meta !== 'undefined' && typeof import.meta.url === 'string'
  ? fileURLToPath(import.meta.url)
  : '';
const __dirname = __filename ? path.dirname(__filename) : (typeof process !== 'undefined' && process.cwd ? process.cwd() : '');
import { rateLimit } from 'express-rate-limit';
import { withMfaStatusSync } from './mfa-sync.js';
import { isSandboxPaymentsEnabled } from './payment-signature.js';
import { authentication, optionalAuthentication, type Identity, type VerifyToken } from './auth.js';
import type { IdentityStore } from './identity-store.js';
import { HttpError } from './errors.js';
import { z, ZodError } from 'zod';
import type { CustomerStore } from './customer-store.js';
import type { AdminStore } from './admin-store.js';
import { createAdminRouter } from './admin-router.js';
import { createSalesRouter } from './sales-router.js';
import type { SalesStore } from './sales-store.js';
import { createFinanceAcquisitionRouter, createInspectorRouter, createInspectionReviewRouter, createOperationsInspectionRouter } from './inspection-router.js';
import type { PrismaInspectionStore } from './inspection-store.js';
import { createFinanceRouter } from './finance-router.js';
import type { PrismaFinanceStore } from './finance-store.js';
import type { NotificationService } from './notification/index.js';
import type { PrismaClient } from '@prisma/client';
import type { PrismaServiceStore } from './service-store.js';
import { createServiceCustomerRouter, createServiceOperationsRouter } from './service-router.js';
import type { PrismaRentalStore } from './rental-store.js';
import { createRentalCustomerRouter, createRentalOperationsRouter, createRentalWebhookRouter } from './rental-router.js';
import type { PrismaConnectStore } from './connect-store.js';
import { createConnectCustomerRouter, createConnectPublicRouter, createConnectWebhookRouter } from './connect-router.js';
import type { PrismaValuationStore } from './valuation-store.js';
import { createValuationRouter } from './valuation-router.js';
import { currentCalendarYear } from './calendar.js';

const uuid = z.string().uuid();
const profileInput = z.object({ displayName: z.string().trim().min(1).max(80).optional(), phone: z.string().regex(/^\+91[6-9]\d{9}$/).optional(), marketingConsent: z.boolean().optional(), preferredCity: z.string().trim().min(2).max(100).optional(), termsVersion: z.string().trim().min(1).max(40).optional() }).strict().refine(value => Object.keys(value).length > 0);
const sellInput = z.object({
  sellerName: z.string().trim().min(2).max(100), sellerPhone: z.string().regex(/^\+91[6-9]\d{9}$/), city: z.string().trim().min(2).max(100), pincode: z.string().regex(/^\d{6}$/),
  make: z.string().trim().min(1).max(80), model: z.string().trim().min(1).max(80), variant: z.string().trim().max(100).optional(), manufacturingYear: z.number().int().min(1980).max(currentCalendarYear() + 1),
  fuelType: z.string().trim().min(2).max(30), transmission: z.string().trim().min(2).max(30), odometerKm: z.number().int().min(0).max(2_000_000), expectedPricePaise: z.number().int().positive().max(10_000_000_000).optional(), ownershipCount: z.number().int().min(0).max(20).optional(), registrationYear: z.number().int().min(1980).max(currentCalendarYear() + 1).optional(), color: z.string().trim().max(40).optional(), registrationCity: z.string().trim().max(100).optional(), registrationNumber: z.string().trim().max(30).optional(), loanOutstanding: z.boolean().optional(), accidentHistory: z.enum(['YES', 'NO', 'NOT_SURE']).optional(), serviceHistory: z.enum(['COMPLETE', 'PARTIAL', 'NOT_SURE']).optional(), sellerNotes: z.string().trim().max(1000).optional(),
  inspectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  inspectionTimeSlot: z.enum(['10:00-12:00', '12:00-14:00', '14:00-16:00', '16:00-18:00']).optional(),
  inspectionLocationType: z.enum(['HUB', 'HOME']).optional(),
  inspectionAddress: z.string().trim().min(10).max(300).optional(),
  idempotencyKey: z.string().trim().min(16).max(120).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.inspectionLocationType === 'HOME' && !value.inspectionAddress) {
    ctx.addIssue({ code: 'custom', message: 'Address is required for home inspection', path: ['inspectionAddress'] });
  }
});
const instantValuationInput = z.object({
  leadId: uuid.optional(),
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  variant: z.string().trim().min(1).max(100).optional(),
  manufacturingYear: z.number().int().min(1980).max(currentCalendarYear() + 1),
  registrationYear: z.number().int().min(1980).max(currentCalendarYear() + 1).optional(),
  fuelType: z.string().trim().min(2).max(30),
  transmission: z.string().trim().min(2).max(30),
  odometerKm: z.number().int().min(0).max(2_000_000),
  city: z.string().trim().min(2).max(100),
  ownershipCount: z.number().int().min(0).max(20).optional(),
  accidentHistory: z.enum(['YES', 'NO', 'NOT_SURE']).optional(),
  serviceHistory: z.enum(['COMPLETE', 'PARTIAL', 'NOT_SURE']).optional(),
  loanOutstanding: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  if (value.registrationYear && value.registrationYear < value.manufacturingYear) {
    context.addIssue({ code: 'custom', message: 'Registration year cannot precede manufacturing year', path: ['registrationYear'] });
  }
});
const acceptOfferInput = z.object({ version: z.number().int().positive() }).strict();
const declineOfferInput = z.object({ version: z.number().int().positive(), reason: z.string().trim().max(500).optional() }).strict();
const driveInput = z.object({ listingId: uuid, requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), timeSlot: z.enum(['10:00-12:00', '12:00-14:00', '15:00-17:00']), serviceCity: z.string().trim().min(2).max(100), locationPreference: z.enum(['HUB', 'HOME']).default('HUB'), address: z.string().trim().min(10).max(300).optional(), customerNotes: z.string().trim().max(500).optional() }).strict().superRefine((value, context) => {
  const selected = new Date(`${value.requestedDate}T00:00:00.000Z`); const today = new Date(); today.setUTCHours(0, 0, 0, 0); const latest = new Date(today); latest.setUTCDate(latest.getUTCDate() + 30);
  if (!Number.isFinite(selected.getTime()) || selected <= today || selected > latest) context.addIssue({ code: 'custom', message: 'Date must be within the next 30 days', path: ['requestedDate'] });
  if (value.locationPreference === 'HOME' && !value.address) context.addIssue({ code: 'custom', message: 'Address is required for home preference', path: ['address'] });
});
const savedSearchInput = z.object({ name: z.string().trim().min(1).max(60), query: z.record(z.string(), z.unknown()).default({}) }).strict();
const purchaseInput = z.object({ listingId: uuid, message: z.string().trim().min(1, 'Enquiry message is required').max(500), idempotencyKey: z.string().trim().min(16).max(120) }).strict();
const supportInput = z.object({ subject: z.string().trim().min(3).max(120), category: z.enum(['ACCOUNT', 'BUYING', 'SELLING', 'INSPECTION', 'PAYMENT_REFUND', 'DELIVERY', 'OWNERSHIP_TRANSFER', 'PRIVACY', 'OTHER']), description: z.string().trim().min(10).max(2000) }).strict();
const supportReplyInput = z.object({ body: z.string().trim().min(1).max(2000) }).strict();
const addressInput = z.object({ label: z.string().trim().min(1).max(40), addressLine: z.string().trim().min(10).max(300), city: z.string().trim().min(2).max(100), pincode: z.string().regex(/^\d{6}$/) }).strict();
const privacyRequestInput = z.object({ requestType: z.enum(['DATA_ACCESS', 'ACCOUNT_DELETION']) }).strict();
const inventoryQuery = z.object({
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  city: z.string().trim().max(100).optional(),
  fuelType: z.string().trim().max(30).optional(),
  transmission: z.string().trim().max(30).optional(),
  make: z.string().trim().max(500).optional(),
  model: z.string().trim().max(500).optional(),
  bodyType: z.string().trim().max(80).optional(),
  color: z.string().trim().max(80).optional(),
  minYear: z.coerce.number().int().min(1980).max(currentCalendarYear() + 1).optional(),
  maxYear: z.coerce.number().int().min(1980).max(currentCalendarYear() + 1).optional(),
  maxOdometerKm: z.coerce.number().int().min(0).max(2_000_000).optional(),
  minPricePaise: z.coerce.number().int().min(0).max(10_000_000_000).optional(),
  maxPricePaise: z.coerce.number().int().min(0).max(10_000_000_000).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'year_desc']).default('newest'),
}).strip().superRefine((value, ctx) => {
  if (value.minYear && value.maxYear && value.minYear > value.maxYear) ctx.addIssue({ code: 'custom', message: 'Invalid year range' });
  if (value.minPricePaise && value.maxPricePaise && value.minPricePaise > value.maxPricePaise) ctx.addIssue({ code: 'custom', message: 'Invalid price range' });
});
function parsed<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = Array.isArray(error.issues) ? error.issues : Array.isArray((error as any).errors) ? (error as any).errors : [];
      console.error('INVALID_INPUT_FIELDS', JSON.stringify(issues.map((e: any) => ({ path: e.path, message: e.message }))));
      const first = issues[0] as { path?: Array<string | number>; message?: string } | undefined;
      const field = first?.path?.length ? String(first.path[0]).replace(/([A-Z])/g, ' $1').toLowerCase() : '';
      const message = first?.message && first.message !== 'Invalid input'
        ? (field ? `${field.charAt(0).toUpperCase()}${field.slice(1)}: ${first.message}` : first.message)
        : field
          ? `Please review ${field}.`
          : 'Please review the submitted details.';
      throw new HttpError(400, 'INVALID_INPUT', message);
    }
    throw error;
  }
}

export function createApp(deps: {
  verify: VerifyToken;
  store: IdentityStore;
  webOrigin: string;
  customer?: CustomerStore;
  adminWebOrigin?: string;
  employeePortalOrigins?: string[];
  adminPortalDestinations?: { admin: string; sales: string; inspectionReview: string; operations: string; inspector: string };
  admin?: AdminStore;
  sales?: SalesStore;
  inspection?: PrismaInspectionStore;
  finance?: PrismaFinanceStore;
  notificationRouter?: Router;
  notificationService?: NotificationService;
  service?: PrismaServiceStore;
  rental?: PrismaRentalStore;
  connect?: PrismaConnectStore;
  valuation?: PrismaValuationStore;
  db?: PrismaClient;
  revokeTokens?: (firebaseUid: string) => Promise<void>;
  onEmailQueued?: () => Promise<unknown> | unknown;
  drainEmails?: () => Promise<number>;
}) {
  // Keep each employee's MFA status truthful whichever portal or app they signed in to.
  deps.verify = withMfaStatusSync(deps.verify, (deps as { db?: any }).db);
  const app = express();
  app.disable('x-powered-by');
  // Required for Vercel/proxy environments: enables correct IP detection for rate limiting
  app.set('trust proxy', 1);
  app.use(helmet({
    crossOriginOpenerPolicy: false,
  }));
  const rawWebOrigins = (deps.webOrigin || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
  const primaryWebOrigin = rawWebOrigins[0] || 'http://localhost:3100';
  let configuredWebHost = 'localhost';
  try {
    configuredWebHost = new URL(primaryWebOrigin).hostname;
  } catch {
    configuredWebHost = 'localhost';
  }
  const localDevelopmentOrigin = ['localhost', '127.0.0.1', '[::1]'].includes(configuredWebHost);
  // Vercel generates a unique production/preview hostname for this project
  // (for example vmotiv-<deployment>-<team>.vercel.app). These are first-
  // party builds, unlike arbitrary *.vercel.app origins, and must be allowed
  // to POST durable Connect WebRTC signals after browser preflight.
  const isVmotivVercelDeployment = (origin?: string) => Boolean(
    origin && /^https:\/\/vmotiv(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin)
  );
  const allowedOrigins = new Set([
    deps.webOrigin,
    ...rawWebOrigins,
    deps.adminWebOrigin,
    ...(deps.employeePortalOrigins || []),
    ...(localDevelopmentOrigin ? ['http://localhost:3100', 'http://127.0.0.1:3100', 'http://localhost:3200', 'http://127.0.0.1:3200', 'http://localhost:3300', 'http://127.0.0.1:3300', 'http://localhost:3400', 'http://127.0.0.1:3400', 'http://localhost:3500', 'http://127.0.0.1:3500', 'http://localhost:3600', 'http://127.0.0.1:3600', 'http://localhost:5173', 'http://127.0.0.1:5173'] : []),
  ].filter((origin): origin is string => Boolean(origin)));
  app.use(cors({
    origin: (origin, callback) => {
      const normalizedOrigin = origin?.replace(/\/$/, '');
      if (
        !origin ||
        allowedOrigins.has(origin) ||
        (normalizedOrigin && allowedOrigins.has(normalizedOrigin)) ||
        isVmotivVercelDeployment(normalizedOrigin) ||
        (localDevelopmentOrigin && origin.startsWith('http://192.168.')) ||
        normalizedOrigin === 'http://localhost:3100' ||
        normalizedOrigin === 'http://127.0.0.1:3100' ||
        normalizedOrigin === 'http://localhost:3200' ||
        normalizedOrigin === 'http://127.0.0.1:3200' ||
        normalizedOrigin === 'http://localhost:3300' ||
        normalizedOrigin === 'http://127.0.0.1:3300' ||
        normalizedOrigin === 'http://localhost:3400' ||
        normalizedOrigin === 'http://127.0.0.1:3400' ||
        normalizedOrigin === 'http://localhost:3500' ||
        normalizedOrigin === 'http://127.0.0.1:3500' ||
        normalizedOrigin === 'http://localhost:3600' ||
        normalizedOrigin === 'http://127.0.0.1:3600' ||
        normalizedOrigin === 'https://vmotiv.in' ||
        normalizedOrigin === 'https://www.vmotiv.in' ||
        normalizedOrigin?.endsWith('.vmotiv.in') ||
        normalizedOrigin?.endsWith('.pages.dev') ||
        normalizedOrigin?.endsWith('.workers.dev') ||
        normalizedOrigin === 'https://admin.vmotiv.in' ||
        normalizedOrigin === 'https://sales.vmotiv.in' ||
        normalizedOrigin === 'https://review.vmotiv.in' ||
        normalizedOrigin === 'https://ops.vmotiv.in' ||
        normalizedOrigin === 'https://finance.vmotiv.in' ||
        normalizedOrigin === 'https://api.vmotiv.in' ||
        normalizedOrigin === 'https://vmotiv-admin.vercel.app' ||
        normalizedOrigin === 'https://vmotiv-sales.vercel.app' ||
        normalizedOrigin === 'https://vmotiv-review.vercel.app' ||
        normalizedOrigin === 'https://vmotiv-ops.vercel.app' ||
        normalizedOrigin === 'https://vmotiv-finance.vercel.app' ||
        normalizedOrigin === 'https://vmotiv.vercel.app'
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Origin'],
    credentials: false,
  }));
  const jsonBodyParser = express.json({
    limit: '50mb',
    // Keep the exact bytes so webhook HMACs are verified against what the provider signed.
    verify: (req, _res, buf) => { (req as any).rawBody = buf.toString('utf8'); },
  });
  const formBodyParser = express.urlencoded({ limit: '50mb', extended: true });
  // The Cloudflare bridge has already materialized JSON request bodies. Do not
  // consume its completed stream a second time; ordinary Node/Vercel requests
  // still use Express's normal parsers below.
  app.use((req, res, next) => req.body !== undefined ? next() : jsonBodyParser(req, res, next));
  app.use((req, res, next) => req.body !== undefined ? next() : formBodyParser(req, res, next));
  if (__dirname) {
    try {
      const brandPath = path.resolve(__dirname, '../assets/brand');
      if (fs.existsSync(brandPath)) {
        app.use('/brand', express.static(brandPath));
      }
    } catch {
      // In edge environments where local assets directory is not mounted, continue cleanly
    }
  }
  app.get('/', (_req, res) => res.json({ service: 'vmotiv-api', status: 'ready', version: 'v2' }));
  // Public: lets apps show the demo gateway only when this deployment really accepts it.
  app.get(['/api/v2/payments/config', '/api/v1/payments/config', '/api/payments/config'], (_req, res) =>
    res.json({ gateway: 'RAZORPAY', sandbox: isSandboxPaymentsEnabled() }),
  );
  app.get(['/health', '/health/live', '/api/health/live', '/api/v1/health/live', '/api/v2/health/live'], (_req, res) => res.json({ status: 'alive' }));
  app.get(['/health/ready', '/api/health/ready', '/api/v1/health/ready', '/api/v2/health/ready'], async (_req, res) => {
    try { await deps.store.ready(); res.json({ database: 'ready' }); }
    catch { res.status(503).json({ code: 'DATABASE_UNAVAILABLE' }); }
  });
  const triggerEmailDrain = async () => {
    if (deps.drainEmails) {
      try {
        await deps.drainEmails();
      } catch (err: any) {
        console.error('[EMAIL DRAIN HOOK FAILED]', err?.message || err);
      }
    } else if (deps.onEmailQueued) {
      try {
        await deps.onEmailQueued();
      } catch (err: any) {
        console.error('[EMAIL DRAIN HOOK FAILED]', err?.message || err);
      }
    }
  };

  const createLimiter = (options: { windowMs: number; limit: number }) => rateLimit({
    ...options,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    validate: false,
    keyGenerator: (req) => {
      const cfIp = req.headers['cf-connecting-ip'];
      if (typeof cfIp === 'string') return cfIp;
      const xff = req.headers['x-forwarded-for'];
      if (typeof xff === 'string') return (xff.split(',')[0] || '').trim();
      return (req as any).ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
    },
  });

  const apiLimiter = createLimiter({ windowMs: 60_000, limit: 120 });
  const standardLimiter = createLimiter({ windowMs: 60_000, limit: 120 });
  const salesLimiter = createLimiter({ windowMs: 60_000, limit: 120 });
  const financeLimiter = createLimiter({ windowMs: 60_000, limit: 60 });
  const serviceLimiter = createLimiter({ windowMs: 60_000, limit: 120 });
  const rentalLimiter = createLimiter({ windowMs: 60_000, limit: 120 });
  const connectLimiter = createLimiter({ windowMs: 60_000, limit: 120 });
  const connectPublicLimiter = createLimiter({ windowMs: 15 * 60_000, limit: 30 });

  if (deps.inspection) {
    const inspectorRouter = createInspectorRouter({ verify: deps.verify, store: deps.inspection });
    const inspectionReviewRouter = createInspectionReviewRouter({ verify: deps.verify, store: deps.inspection });
    const operationsRouter = createOperationsInspectionRouter({ verify: deps.verify, store: deps.inspection });
    const financeRouter = createFinanceAcquisitionRouter({ verify: deps.verify, store: deps.inspection });

    app.use('/api/v2/inspector', standardLimiter, inspectorRouter);
    app.use('/api/v1/inspector', standardLimiter, inspectorRouter);
    app.use('/api/inspector', standardLimiter, inspectorRouter);
    app.use('/inspector', standardLimiter, inspectorRouter);

    app.use('/api/v2/inspection-review', standardLimiter, inspectionReviewRouter);
    app.use('/api/v1/inspection-review', standardLimiter, inspectionReviewRouter);
    app.use('/api/inspection-review', standardLimiter, inspectionReviewRouter);
    app.use('/inspection-review', standardLimiter, inspectionReviewRouter);

    // Service & Rental Operations must be mounted before generic /operations to prevent inspectionRouter shadowing
    if (deps.service && deps.db) {
      const serviceOpsRouter = createServiceOperationsRouter({ verify: deps.verify, db: deps.db, store: deps.service });
      app.use('/api/v2/operations/service', serviceLimiter, serviceOpsRouter);
      app.use('/api/v1/operations/service', serviceLimiter, serviceOpsRouter);
      app.use('/api/operations/service', serviceLimiter, serviceOpsRouter);
      app.use('/operations/service', serviceLimiter, serviceOpsRouter);
    }

    if (deps.rental && deps.db) {
      const rentalOpsRouter = createRentalOperationsRouter({ verify: deps.verify, store: deps.rental, db: deps.db });
      app.use('/api/v2/operations/rentals', rentalLimiter, rentalOpsRouter);
      app.use('/api/v1/operations/rentals', rentalLimiter, rentalOpsRouter);
      app.use('/api/operations/rentals', rentalLimiter, rentalOpsRouter);
      app.use('/operations/rentals', rentalLimiter, rentalOpsRouter);
    }

    app.use('/api/v2/operations', standardLimiter, operationsRouter);
    app.use('/api/v1/operations', standardLimiter, operationsRouter);
    app.use('/api/operations', standardLimiter, operationsRouter);
    app.use('/operations', standardLimiter, operationsRouter);

    app.use('/api/v2/finance-legacy', financeLimiter, financeRouter);
    app.use('/api/v1/finance-legacy', financeLimiter, financeRouter);
    app.use('/api/finance-legacy', financeLimiter, financeRouter);
    app.use('/finance-legacy', financeLimiter, financeRouter);
  }
  if (deps.finance) {
    const financeRouter = createFinanceRouter({ verify: deps.verify, store: deps.finance });
    app.use('/api/v2/finance', financeLimiter, financeRouter);
    app.use('/api/v1/finance', financeLimiter, financeRouter);
    app.use('/api/finance', financeLimiter, financeRouter);
    app.use('/finance', financeLimiter, financeRouter);
  }
  if (deps.sales) {
    const salesRouter = createSalesRouter({ verify: deps.verify, store: deps.sales });
    app.use('/api/v2/sales', salesLimiter, salesRouter);
    app.use('/api/v1/sales', salesLimiter, salesRouter);
    app.use('/api/sales', salesLimiter, salesRouter);
    app.use('/sales', salesLimiter, salesRouter);
  }
  if (deps.valuation && deps.db) {
    const valuationStaffRouter = createValuationRouter({ verify: deps.verify, store: deps.valuation, db: deps.db });
    const valuationStaffLimiter = createLimiter({ windowMs: 60_000, limit: 120 });
    app.use('/api/v2/valuations', valuationStaffLimiter, valuationStaffRouter);
    app.use('/api/v1/valuations', valuationStaffLimiter, valuationStaffRouter);
    app.use('/api/valuations', valuationStaffLimiter, valuationStaffRouter);
    app.use('/valuations', valuationStaffLimiter, valuationStaffRouter);
  }
  if (deps.admin && deps.adminWebOrigin && deps.revokeTokens) {
    const adminRouter = createAdminRouter({
      verify: deps.verify,
      store: deps.admin,
      adminWebOrigin: deps.adminWebOrigin,
      employeePortalOrigins: deps.adminPortalDestinations || {
        admin: deps.adminWebOrigin,
        sales: deps.adminWebOrigin,
        inspectionReview: deps.adminWebOrigin,
        operations: deps.adminWebOrigin,
        inspector: deps.adminWebOrigin,
      },
      revokeTokens: deps.revokeTokens,
      drainEmails: deps.drainEmails,
    });
    const adminLimiter = createLimiter({ windowMs: 60_000, limit: 120 });
    app.use('/api/v2', adminLimiter, adminRouter);
    app.use('/api/v1', adminLimiter, adminRouter);
    app.use('/api', adminLimiter, adminRouter);
    app.use('/admin', adminLimiter, adminRouter);
    app.use('/staff', adminLimiter, adminRouter);
  }

  // Unified API Router (serves /api/v2, /api/v1, and /api seamlessly)
  const unifiedApiRouter = express.Router();

  if (deps.notificationRouter) {
    unifiedApiRouter.use(deps.notificationRouter);
  }

  if (deps.service) {
    const serviceCustomerRouter = createServiceCustomerRouter({ verify: deps.verify, store: deps.service });
    unifiedApiRouter.use('/customer', serviceCustomerRouter);
    unifiedApiRouter.use('/service', serviceCustomerRouter);

    app.use('/customer', serviceLimiter, serviceCustomerRouter);

    if (deps.db) {
      const serviceOpsRouter = createServiceOperationsRouter({ verify: deps.verify, db: deps.db, store: deps.service });
      unifiedApiRouter.use('/operations/service', serviceOpsRouter);
      app.use('/api/v2/operations/service', serviceLimiter, serviceOpsRouter);
      app.use('/api/v1/operations/service', serviceLimiter, serviceOpsRouter);
      app.use('/api/operations/service', serviceLimiter, serviceOpsRouter);
      app.use('/operations/service', serviceLimiter, serviceOpsRouter);
    }
  }

  if (deps.rental && deps.db) {
    const rentalCustomerRouter = createRentalCustomerRouter({ verify: deps.verify, store: deps.rental, db: deps.db });
    unifiedApiRouter.use('/rentals', rentalCustomerRouter);
    unifiedApiRouter.use('/customer/rentals', rentalCustomerRouter);

    app.use('/rentals', rentalLimiter, rentalCustomerRouter);

    const rentalOpsRouter = createRentalOperationsRouter({ verify: deps.verify, store: deps.rental, db: deps.db });
    unifiedApiRouter.use('/operations/rentals', rentalOpsRouter);
    app.use('/api/v2/operations/rentals', rentalLimiter, rentalOpsRouter);
    app.use('/api/v1/operations/rentals', rentalLimiter, rentalOpsRouter);
    app.use('/api/operations/rentals', rentalLimiter, rentalOpsRouter);
    app.use('/operations/rentals', rentalLimiter, rentalOpsRouter);

    const rentalWebhookRouter = createRentalWebhookRouter({ store: deps.rental, db: deps.db });
    app.use('/api/v2/webhooks/rentals', rentalLimiter, rentalWebhookRouter);
    app.use('/api/v1/webhooks/rentals', rentalLimiter, rentalWebhookRouter);
    app.use('/api/webhooks/rentals', rentalLimiter, rentalWebhookRouter);
    app.use('/webhooks/rentals', rentalLimiter, rentalWebhookRouter);
  }

  if (deps.connect) {
    const connectCustomerRouter = createConnectCustomerRouter({ verify: deps.verify, store: deps.connect });
    unifiedApiRouter.use('/customer', connectCustomerRouter);
    unifiedApiRouter.use('/connect', connectCustomerRouter);
    unifiedApiRouter.use('/public/connect', connectPublicLimiter, createConnectPublicRouter({ store: deps.connect }));

    const connectWebhookRouter = createConnectWebhookRouter({ store: deps.connect });
    unifiedApiRouter.use('/webhooks/connect', connectWebhookRouter);
    app.use('/customer', connectLimiter, connectCustomerRouter);
  }

  // Published inventory is deliberately public.
  if (deps.customer) {
    unifiedApiRouter.get('/inventory', optionalAuthentication(deps.verify), async (req, res) => res.json(await deps.customer!.inventory((res.locals.identity as Identity | undefined)?.uid, parsed(inventoryQuery, req.query))));
    unifiedApiRouter.get('/inventory/:id', optionalAuthentication(deps.verify), async (req, res) => res.json(await deps.customer!.vehicle((res.locals.identity as Identity | undefined)?.uid, parsed(uuid, req.params.id))));
    unifiedApiRouter.get('/cities', async (_req, res) => res.json(await deps.customer!.cities()));
    unifiedApiRouter.get('/master-data', async (req, res) => {
      const category = req.query.category ? String(req.query.category).trim() : undefined;
      const items = (await deps.customer!.masterData(category)) as Array<{ updatedAt?: Date | string }>;
      // Version tag so apps can cache the list and only re-download it when an administrator changes something.
      const latest = items.reduce((max, item) => Math.max(max, item.updatedAt ? new Date(item.updatedAt).getTime() : 0), 0);
      const etag = `W/"md-${category ?? 'all'}-${items.length}-${latest}"`;
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=60');
      if (req.headers['if-none-match'] === etag) {
        res.status(304).end();
        return;
      }
      res.json(items);
    });
  }

  // Authenticated customer & profile routes
  const auth = authentication(deps.verify);

  unifiedApiRouter.post('/auth/sync', auth, async (req, res) => {
    if (req.body && Object.keys(req.body).length) throw new HttpError(400, 'BODY_MUST_BE_EMPTY');
    const profile = await deps.store.sync(res.locals.identity as Identity);
    await triggerEmailDrain();
    res.json(profile);
  });

  unifiedApiRouter.get('/me', auth, async (_req, res) => {
    const identity = res.locals.identity as Identity;
    const user = await deps.store.find(identity.uid);
    if (!user) throw new HttpError(404, 'PROFILE_NOT_REGISTERED');
    if (user.status !== 'ACTIVE') throw new HttpError(403, 'ACCOUNT_INACTIVE');
    res.json(user);
  });

  unifiedApiRouter.get('/employee/me', auth, async (_req, res) => {
    const identity = res.locals.identity as Identity;
    const user = await deps.store.find(identity.uid);
    if (!user || user.status !== 'ACTIVE' || !user.employee?.active) throw new HttpError(403, 'EMPLOYEE_ACCESS_REQUIRED');
    const privilegedRoles = new Set(['ADMIN', 'FINANCE', 'PRICING_APPROVER', 'SUPER_ADMIN', 'SECURITY_ADMIN', 'AUDIT_VIEWER']);
    const mfaRequired = process.env.ENFORCE_ADMIN_MFA !== 'false' && (process.env.ENFORCE_ADMIN_MFA === 'true' || process.env.NODE_ENV === 'test');
    if (privilegedRoles.has(user.employee.role) && !identity.secondFactor && mfaRequired) throw new HttpError(403, 'EMPLOYEE_MFA_REQUIRED');
    res.json(user);
  });

  if (deps.valuation) {
    const valuationLimiter = createLimiter({ windowMs: 60_000, limit: 60 });
    const optAuth = optionalAuthentication(deps.verify);
    unifiedApiRouter.post('/valuations/instant', optAuth, valuationLimiter, async (req, res) => {
      const identity = res.locals.identity as Identity | undefined;
      res.status(201).json(await deps.valuation!.instant(identity?.uid, parsed(instantValuationInput, req.body)));
    });
    unifiedApiRouter.get('/valuations/:id/public-summary', optAuth, async (req, res) => {
      const identity = res.locals.identity as Identity | undefined;
      res.json(await deps.valuation!.publicSummaryForUser(identity?.uid ?? '', parsed(uuid, req.params.id)));
    });
  }

  if (deps.customer) {
    unifiedApiRouter.patch('/me', auth, async (req, res) => res.json(await deps.customer!.updateProfile((res.locals.identity as Identity).uid, parsed(profileInput, req.body))));
    unifiedApiRouter.get('/me/wishlist', auth, async (_req, res) => res.json(await deps.customer!.wishlist((res.locals.identity as Identity).uid)));
    unifiedApiRouter.put('/me/wishlist/:id', auth, async (req, res) => { await deps.customer!.addWishlist((res.locals.identity as Identity).uid, parsed(uuid, req.params.id)); res.status(204).end(); });
    unifiedApiRouter.delete('/me/wishlist/:id', auth, async (req, res) => { await deps.customer!.removeWishlist((res.locals.identity as Identity).uid, parsed(uuid, req.params.id)); res.status(204).end(); });

    // Test drive requests (supports canonical and /me/drives alias)
    unifiedApiRouter.get(['/me/test-drive-requests', '/me/drives'], auth, async (_req, res) => res.json(await deps.customer!.drives((res.locals.identity as Identity).uid)));
    unifiedApiRouter.get(['/me/test-drive-requests/:id', '/me/drives/:id'], auth, async (req, res) => res.json(await deps.customer!.drive((res.locals.identity as Identity).uid, parsed(uuid, req.params.id))));
    unifiedApiRouter.post(['/test-drive-requests', '/me/drives'], auth, async (req, res) => {
      const result = await deps.customer!.bookDrive((res.locals.identity as Identity).uid, parsed(driveInput, req.body));
      await triggerEmailDrain();
      res.status(201).json(result);
    });
    unifiedApiRouter.patch(['/test-drive-requests/:id/cancel', '/me/drives/:id/cancel'], auth, async (req, res) => { parsed(z.object({ reason: z.string().trim().min(1).max(200) }).strict(), req.body); await deps.customer!.cancelDrive((res.locals.identity as Identity).uid, parsed(uuid, req.params.id)); res.status(204).end(); });

    // Acquisition leads / Sell car requests (supports canonical and /me/sell alias)
    unifiedApiRouter.get(['/me/acquisition-leads', '/me/sell'], auth, async (_req, res) => res.json(await deps.customer!.leads((res.locals.identity as Identity).uid)));
    unifiedApiRouter.get('/me/acquisition-leads/:id', auth, async (req, res) => res.json(await deps.customer!.lead((res.locals.identity as Identity).uid, parsed(uuid, req.params.id))));
    unifiedApiRouter.post(['/acquisition-leads', '/me/sell'], auth, async (req, res) => {
      const result = await deps.customer!.createLead((res.locals.identity as Identity).uid, parsed(sellInput, req.body));
      await triggerEmailDrain();
      res.status(201).json(result);
    });
    unifiedApiRouter.patch('/acquisition-leads/:id/cancel', auth, async (req, res) => { const body = parsed(z.object({ reason: z.string().trim().max(500).optional() }).strict(), req.body); await deps.customer!.cancelLead((res.locals.identity as Identity).uid, parsed(uuid, req.params.id), body.reason); res.status(204).end(); });
    unifiedApiRouter.patch('/acquisition-offers/:id/accept', auth, async (req, res) => {
      const body = parsed(acceptOfferInput, req.body);
      const result = await deps.customer!.acceptOffer((res.locals.identity as Identity).uid, parsed(uuid, req.params.id), body.version);
      await triggerEmailDrain();
      res.json(result);
    });
    unifiedApiRouter.patch('/acquisition-offers/:id/decline', auth, async (req, res) => { const body = parsed(declineOfferInput, req.body); res.json(await deps.customer!.declineOffer((res.locals.identity as Identity).uid, parsed(uuid, req.params.id), body)); });
    unifiedApiRouter.get('/me/saved-searches', auth, async (_req, res) => res.json(await deps.customer!.savedSearches((res.locals.identity as Identity).uid)));
    unifiedApiRouter.post('/me/saved-searches', auth, async (req, res) => res.status(201).json(await deps.customer!.createSavedSearch((res.locals.identity as Identity).uid, parsed(savedSearchInput, req.body))));
    unifiedApiRouter.delete('/me/saved-searches/:id', auth, async (req, res) => { await deps.customer!.deleteSavedSearch((res.locals.identity as Identity).uid, parsed(uuid, req.params.id)); res.status(204).end(); });

    // Purchase enquiries (supports canonical and /me/enquiries alias)
    unifiedApiRouter.get(['/me/purchase-enquiries', '/me/enquiries'], auth, async (_req, res) => res.json(await deps.customer!.purchaseEnquiries((res.locals.identity as Identity).uid)));
    unifiedApiRouter.get(['/me/purchase-enquiries/:id', '/me/enquiries/:id'], auth, async (req, res) => res.json(await deps.customer!.purchaseEnquiry((res.locals.identity as Identity).uid, parsed(uuid, req.params.id))));
    unifiedApiRouter.post(['/me/purchase-enquiries/:id/cancel', '/me/enquiries/:id/cancel'], auth, async (req, res) => {
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
      res.json(await deps.customer!.cancelPurchaseEnquiry((res.locals.identity as Identity).uid, parsed(uuid, req.params.id), reason));
    });
    unifiedApiRouter.post(['/purchase-enquiries', '/me/enquiries'], auth, async (req, res) => {
      const result = await deps.customer!.createPurchaseEnquiry((res.locals.identity as Identity).uid, parsed(purchaseInput, req.body));
      await triggerEmailDrain();
      res.status(201).json(result);
    });
    unifiedApiRouter.get('/me/support-cases', auth, async (_req, res) => res.json(await deps.customer!.supportCases((res.locals.identity as Identity).uid)));
    unifiedApiRouter.post('/support-cases', auth, async (req, res) => {
      const result = await deps.customer!.createSupportCase((res.locals.identity as Identity).uid, parsed(supportInput, req.body));
      await triggerEmailDrain();
      res.status(201).json(result);
    });
    unifiedApiRouter.get('/support-cases/:id', auth, async (req, res) => res.json(await deps.customer!.supportCase((res.locals.identity as Identity).uid, parsed(uuid, req.params.id))));
    unifiedApiRouter.post('/support-cases/:id/replies', auth, async (req, res) => {
      const result = await deps.customer!.replySupportCase((res.locals.identity as Identity).uid, parsed(uuid, req.params.id), parsed(supportReplyInput, req.body).body);
      await triggerEmailDrain();
      res.status(201).json(result);
    });
    unifiedApiRouter.get('/me/activity', auth, async (req, res) => res.json(await deps.customer!.activity((res.locals.identity as Identity).uid, parsed(z.coerce.number().int().min(1).default(1), req.query.page ?? 1), parsed(z.coerce.number().int().min(1).max(100).default(20), req.query.limit ?? 20))));
    unifiedApiRouter.get('/me/addresses', auth, async (_req, res) => res.json(await deps.customer!.addresses((res.locals.identity as Identity).uid)));
    unifiedApiRouter.post('/me/addresses', auth, async (req, res) => res.status(201).json(await deps.customer!.createAddress((res.locals.identity as Identity).uid, parsed(addressInput, req.body))));
    unifiedApiRouter.delete('/me/addresses/:id', auth, async (req, res) => { await deps.customer!.deleteAddress((res.locals.identity as Identity).uid, parsed(uuid, req.params.id)); res.status(204).end(); });
    unifiedApiRouter.post('/me/privacy-requests', auth, async (req, res) => res.status(201).json(await deps.customer!.createPrivacyRequest((res.locals.identity as Identity).uid, parsed(privacyRequestInput, req.body).requestType)));
  }

  // General Media Upload Route (Cloudinary backed)
  unifiedApiRouter.post('/media/upload', auth, express.json({ limit: '50mb' }), async (req, res, next) => {
    try {
      const input = z.object({
        base64Data: z.string().trim().min(1).transform(value => value.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '')),
        mimeType: z.string().trim().min(3).max(100).default('image/jpeg'),
        folder: z.string().trim().max(100).optional(),
        filename: z.string().trim().max(100).optional(),
        tags: z.array(z.string().trim().max(50)).max(20).optional(),
      }).parse(req.body);

      const buffer = Buffer.from(input.base64Data, 'base64');
      if (!buffer.length) throw new HttpError(400, 'INVALID_INPUT', 'The selected media file could not be read. Please choose it again.');
      const identity = res.locals.identity as Identity;

      if (isCloudinaryConfigured()) {
        const result = await uploadToCloudinary({
          buffer,
          folder: input.folder || 'vmotiv/uploads',
          filename: input.filename,
          mimeType: input.mimeType,
          tags: [...(input.tags || []), `user-${identity.uid}`],
        });
        res.status(201).json(result);
        return;
      }

      // Local storage fallback when Cloudinary is not configured
      const ext = input.mimeType.split('/')[1] || 'bin';
      const filename = `${input.filename || 'upload'}-${Date.now()}.${ext}`;
      const isEdge = typeof (globalThis as any).WebSocketPair !== 'undefined' ||
                     !fs.mkdirSync ||
                     (fs.mkdirSync as any)?.name === 'createNotImplementedError';
      const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
      const storageBase = isServerless ? os.tmpdir() : process.cwd();
      const localDir = path.resolve(storageBase, 'storage/uploads');
      if (!isEdge && typeof fs.existsSync === 'function' && !fs.existsSync(localDir)) {
        try { fs.mkdirSync(localDir, { recursive: true }); } catch {}
      }
      if (!isEdge) {
        try { await fs.promises.writeFile(path.resolve(localDir, filename), buffer); } catch {}
      }
      const checksumSha256 = buffer ? crypto.createHash('sha256').update(buffer).digest('hex') : '';
      res.status(201).json({
        url: `/storage/uploads/${filename}`,
        secureUrl: `/storage/uploads/${filename}`,
        publicId: filename,
        format: ext,
        byteSize: buffer.length,
        resourceType: input.mimeType.startsWith('video/') ? 'video' : 'image',
        checksumSha256,
      });
    } catch (e) {
      next(e);
    }
  });

  // Mount unified routes across /api/v2 (canonical), /api/v1 (compat), and /api (alias)
  app.use('/api/v2', apiLimiter, unifiedApiRouter);
  app.use('/api/v1', apiLimiter, unifiedApiRouter);
  app.use('/api', apiLimiter, unifiedApiRouter);

  app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND' }));
  const errors: ErrorRequestHandler = (error: unknown, req, res, _next) => {
    const origin = req.headers.origin;
    if (origin && !res.getHeader('Access-Control-Allow-Origin')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, Origin');
    }
    const isHttpError =
      error instanceof HttpError ||
      (typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        typeof (error as any).status === 'number' &&
        'code' in error &&
        typeof (error as any).code === 'string');

    if (isHttpError) {
      const payload: Record<string, any> = {
        code: (error as any).code,
      };
      if ((error as any).message && (error as any).message !== (error as any).code) {
        payload.message = (error as any).message;
      }
      res.status((error as any).status).json(payload);
      return;
    }

    if (error instanceof ZodError || (error as any)?.name === 'ZodError') {
      const issues = (error as any).issues || [];
      console.error('INVALID_INPUT_ISSUES', JSON.stringify(issues.map((e: any) => ({ path: e.path, message: e.message }))));
      res.status(400).json({ code: 'INVALID_INPUT', issues });
      return;
    }

    if ((error as any)?.code === 'P2002') {
      const target = (error as any)?.meta?.target;
      const targetStr = Array.isArray(target) ? target.join(', ') : target ? String(target) : 'identifier';
      const isBankRef = targetStr.toLowerCase().includes('bankreference');
      res.status(409).json({
        code: isBankRef ? 'BANK_REFERENCE_ALREADY_EXISTS' : 'RESOURCE_CONFLICT',
        message: `A record with this ${targetStr} already exists.`,
      });
      return;
    }

    if ((error as any)?.code === 'P2025') {
      res.status(404).json({
        code: 'RESOURCE_NOT_FOUND',
        message: 'The requested resource was not found.',
      });
      return;
    }

    if (error instanceof SyntaxError) {
      res.status(400).json({ code: 'INVALID_JSON' });
      return;
    }

    if ((error as any)?.type === 'entity.too.large' || (error as any)?.status === 413 || (error as any)?.name === 'PayloadTooLargeError') {
      res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: 'Request payload exceeds limit' });
      return;
    }

    // Tokens, email addresses, request bodies, provider payloads and credentials are never logged.
    if (error instanceof Error) {
      console.error('API_REQUEST_FAILED', error.constructor.name, error.message, (error as any).code ?? '', (error as any).meta ?? '');
    } else {
      console.error('API_REQUEST_FAILED', error);
    }
    res.status(500).json({ code: 'INTERNAL_ERROR' });
  };
  app.use(errors);
  return app;
}

