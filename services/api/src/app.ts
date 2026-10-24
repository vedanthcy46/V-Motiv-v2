import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';

if (!('toJSON' in BigInt.prototype)) {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value: function () {
      return this.toString();
    },
    writable: true,
    configurable: true,
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { rateLimit } from 'express-rate-limit';
import { authentication, optionalAuthentication, type Identity, type VerifyToken } from './auth.js';
import type { IdentityStore } from './identity-store.js';
import { HttpError } from './errors.js';
import { z, ZodError } from 'zod';
import type { CustomerStore } from './customer-store.js';
import type { AdminStore } from './admin-store.js';
import { createAdminRouter } from './admin-router.js';

const uuid = z.string().uuid();
const profileInput = z.object({ displayName: z.string().trim().min(1).max(80).optional(), phone: z.string().regex(/^\+91[6-9]\d{9}$/).optional(), marketingConsent: z.boolean().optional(), preferredCity: z.string().trim().min(2).max(100).optional(), termsVersion: z.string().trim().min(1).max(40).optional() }).strict().refine(value => Object.keys(value).length > 0);
const sellInput = z.object({
  sellerName: z.string().trim().min(2).max(100), sellerPhone: z.string().regex(/^\+91[6-9]\d{9}$/), city: z.string().trim().min(2).max(100), pincode: z.string().regex(/^\d{6}$/),
  make: z.string().trim().min(1).max(80), model: z.string().trim().min(1).max(80), variant: z.string().trim().max(100).optional(), manufacturingYear: z.number().int().min(1980).max(new Date().getFullYear() + 1),
  fuelType: z.string().trim().min(2).max(30), transmission: z.string().trim().min(2).max(30), odometerKm: z.number().int().min(0).max(2_000_000), expectedPricePaise: z.number().int().positive().max(10_000_000_000).optional(), ownershipCount: z.number().int().min(0).max(20).optional(), registrationYear: z.number().int().min(1980).max(new Date().getFullYear() + 1).optional(), color: z.string().trim().max(40).optional(), registrationCity: z.string().trim().max(100).optional(), loanOutstanding: z.boolean().optional(), accidentHistory: z.enum(['YES', 'NO', 'NOT_SURE']).optional(), serviceHistory: z.enum(['COMPLETE', 'PARTIAL', 'NOT_SURE']).optional(), sellerNotes: z.string().trim().max(1000).optional(),
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
const inventoryQuery = z.object({ search: z.string().trim().max(80).optional(), page: z.coerce.number().int().min(1).max(10_000).default(1), limit: z.coerce.number().int().min(1).max(50).default(20), city: z.string().trim().max(100).optional(), fuelType: z.string().trim().max(30).optional(), transmission: z.string().trim().max(30).optional(), minYear: z.coerce.number().int().min(1980).max(new Date().getFullYear() + 1).optional(), maxYear: z.coerce.number().int().min(1980).max(new Date().getFullYear() + 1).optional(), maxOdometerKm: z.coerce.number().int().min(0).max(2_000_000).optional(), minPricePaise: z.coerce.number().int().min(0).max(10_000_000_000).optional(), maxPricePaise: z.coerce.number().int().min(0).max(10_000_000_000).optional(), sort: z.enum(['newest', 'price_asc', 'price_desc', 'year_desc']).default('newest') }).strip().superRefine((value, ctx) => { if (value.minYear && value.maxYear && value.minYear > value.maxYear) ctx.addIssue({ code: 'custom', message: 'Invalid year range' }); if (value.minPricePaise && value.maxPricePaise && value.minPricePaise > value.maxPricePaise) ctx.addIssue({ code: 'custom', message: 'Invalid price range' }); });
function parsed<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = Array.isArray(error.issues) ? error.issues : Array.isArray((error as any).errors) ? (error as any).errors : [];
      console.error('INVALID_INPUT_FIELDS', JSON.stringify(issues.map((e: any) => ({ path: e.path, message: e.message }))));
      throw new HttpError(400, 'INVALID_INPUT');
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
  admin?: AdminStore;
  revokeTokens?: (firebaseUid: string) => Promise<void>;
  onEmailQueued?: () => Promise<unknown> | unknown;
  drainEmails?: () => Promise<number>;
}) {
  const app = express();
  app.disable('x-powered-by');
  // Required for Vercel/proxy environments: enables correct IP detection for rate limiting
  app.set('trust proxy', 1);
  app.use(helmet());
  const configuredWebHost = new URL(deps.webOrigin).hostname;
  const localDevelopmentOrigin = ['localhost', '127.0.0.1', '[::1]'].includes(configuredWebHost);
  const allowedOrigins = new Set([
    deps.webOrigin,
    deps.adminWebOrigin,
    ...(localDevelopmentOrigin ? ['http://localhost:3100', 'http://127.0.0.1:3100', 'http://localhost:3200', 'http://127.0.0.1:3200', 'http://localhost:5173', 'http://127.0.0.1:5173'] : []),
  ].filter((origin): origin is string => Boolean(origin)));
  app.use(cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.has(origin) ||
        (localDevelopmentOrigin && origin.startsWith('http://192.168.')) ||
        origin === 'https://vmotiv.in' ||
        origin === 'https://www.vmotiv.in' ||
        origin === 'https://admin.vmotiv.in'
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: false,
  }));
  app.use(express.json({ limit: '8kb' }));
  app.use('/brand', express.static(path.resolve(__dirname, '../assets/brand')));
  app.get('/api/v1/health/live', (_req, res) => res.json({ status: 'alive' }));
  app.get('/api/v1/health/ready', async (_req, res) => {
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

  app.use('/api/v1', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }));
  if (deps.admin && deps.adminWebOrigin && deps.revokeTokens) {
    app.use('/api/v2', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }), createAdminRouter({
      verify: deps.verify,
      store: deps.admin,
      adminWebOrigin: deps.adminWebOrigin,
      revokeTokens: deps.revokeTokens,
      drainEmails: deps.drainEmails,
    }));
  }
  // Published inventory is deliberately public. Every account-linked mutation remains below authentication.
  if (deps.customer) {
    app.get('/api/v1/inventory', optionalAuthentication(deps.verify), async (req, res) => res.json(await deps.customer!.inventory((res.locals.identity as Identity | undefined)?.uid, parsed(inventoryQuery, req.query))));
    app.get('/api/v1/inventory/:id', optionalAuthentication(deps.verify), async (req, res) => res.json(await deps.customer!.vehicle((res.locals.identity as Identity | undefined)?.uid, parsed(uuid, req.params.id))));
    app.get('/api/v1/cities', async (_req, res) => res.json(await deps.customer!.cities()));
  }
  app.use('/api/v1', authentication(deps.verify));
  app.post('/api/v1/auth/sync', async (req, res) => {
    if (req.body && Object.keys(req.body).length) throw new HttpError(400, 'BODY_MUST_BE_EMPTY');
    const profile = await deps.store.sync(res.locals.identity as Identity);
    await triggerEmailDrain();
    res.json(profile);
  });
  app.get('/api/v1/me', async (_req, res) => {
    const identity = res.locals.identity as Identity;
    const user = await deps.store.find(identity.uid);
    if (!user) throw new HttpError(404, 'PROFILE_NOT_REGISTERED');
    if (user.status !== 'ACTIVE') throw new HttpError(403, 'ACCOUNT_INACTIVE');
    res.json(user);
  });
  app.get('/api/v1/employee/me', async (_req, res) => {
    const identity = res.locals.identity as Identity;
    const user = await deps.store.find(identity.uid);
    if (!user || user.status !== 'ACTIVE' || !user.employee?.active) throw new HttpError(403, 'EMPLOYEE_ACCESS_REQUIRED');
    const privilegedRoles = new Set(['ADMIN', 'FINANCE', 'PRICING_APPROVER', 'SUPER_ADMIN', 'SECURITY_ADMIN', 'AUDIT_VIEWER']);
    const mfaRequired = process.env.ENFORCE_ADMIN_MFA !== 'false' && (process.env.ENFORCE_ADMIN_MFA === 'true' || process.env.NODE_ENV === 'test');
    if (privilegedRoles.has(user.employee.role) && !identity.secondFactor && mfaRequired) throw new HttpError(403, 'EMPLOYEE_MFA_REQUIRED');
    res.json(user);
  });
  if (deps.customer) {
    app.patch('/api/v1/me', async (req, res) => res.json(await deps.customer!.updateProfile((res.locals.identity as Identity).uid, parsed(profileInput, req.body))));
    app.get('/api/v1/me/wishlist', async (_req, res) => res.json(await deps.customer!.wishlist((res.locals.identity as Identity).uid)));
    app.put('/api/v1/me/wishlist/:id', async (req, res) => { await deps.customer!.addWishlist((res.locals.identity as Identity).uid, parsed(uuid, req.params.id)); res.status(204).end(); });
    app.delete('/api/v1/me/wishlist/:id', async (req, res) => { await deps.customer!.removeWishlist((res.locals.identity as Identity).uid, parsed(uuid, req.params.id)); res.status(204).end(); });
    // Test drive requests (supports canonical and /me/drives alias)
    app.get('/api/v1/me/test-drive-requests', async (_req, res) => res.json(await deps.customer!.drives((res.locals.identity as Identity).uid)));
    app.get('/api/v1/me/drives', async (_req, res) => res.json(await deps.customer!.drives((res.locals.identity as Identity).uid)));
    app.post('/api/v1/test-drive-requests', async (req, res) => {
      const result = await deps.customer!.bookDrive((res.locals.identity as Identity).uid, parsed(driveInput, req.body));
      await triggerEmailDrain();
      res.status(201).json(result);
    });
    app.post('/api/v1/me/drives', async (req, res) => {
      const result = await deps.customer!.bookDrive((res.locals.identity as Identity).uid, parsed(driveInput, req.body));
      await triggerEmailDrain();
      res.status(201).json(result);
    });
    app.patch('/api/v1/test-drive-requests/:id/cancel', async (req, res) => { parsed(z.object({ reason: z.string().trim().min(1).max(200) }).strict(), req.body); await deps.customer!.cancelDrive((res.locals.identity as Identity).uid, parsed(uuid, req.params.id)); res.status(204).end(); });
    app.patch('/api/v1/me/drives/:id/cancel', async (req, res) => { parsed(z.object({ reason: z.string().trim().min(1).max(200) }).strict(), req.body); await deps.customer!.cancelDrive((res.locals.identity as Identity).uid, parsed(uuid, req.params.id)); res.status(204).end(); });

    // Acquisition leads / Sell car requests (supports canonical and /me/sell alias)
    app.get('/api/v1/me/acquisition-leads', async (_req, res) => res.json(await deps.customer!.leads((res.locals.identity as Identity).uid)));
    app.get('/api/v1/me/sell', async (_req, res) => res.json(await deps.customer!.leads((res.locals.identity as Identity).uid)));
    app.get('/api/v1/me/acquisition-leads/:id', async (req, res) => res.json(await deps.customer!.lead((res.locals.identity as Identity).uid, parsed(uuid, req.params.id))));
    app.post('/api/v1/acquisition-leads', async (req, res) => {
      const result = await deps.customer!.createLead((res.locals.identity as Identity).uid, parsed(sellInput, req.body));
      await triggerEmailDrain();
      res.status(201).json(result);
    });
    app.post('/api/v1/me/sell', async (req, res) => {
      const result = await deps.customer!.createLead((res.locals.identity as Identity).uid, parsed(sellInput, req.body));
      await triggerEmailDrain();
      res.status(201).json(result);
    });
    app.patch('/api/v1/acquisition-leads/:id/cancel', async (req, res) => { const body = parsed(z.object({ reason: z.string().trim().max(500).optional() }).strict(), req.body); await deps.customer!.cancelLead((res.locals.identity as Identity).uid, parsed(uuid, req.params.id), body.reason); res.status(204).end(); });
    app.patch('/api/v1/acquisition-offers/:id/accept', async (req, res) => {
      const body = parsed(acceptOfferInput, req.body);
      const result = await deps.customer!.acceptOffer((res.locals.identity as Identity).uid, parsed(uuid, req.params.id), body.version);
      await triggerEmailDrain();
      res.json(result);
    });
    app.patch('/api/v1/acquisition-offers/:id/decline', async (req, res) => { const body = parsed(declineOfferInput, req.body); res.json(await deps.customer!.declineOffer((res.locals.identity as Identity).uid, parsed(uuid, req.params.id), body)); });
    app.get('/api/v1/me/saved-searches', async (_req, res) => res.json(await deps.customer!.savedSearches((res.locals.identity as Identity).uid)));
    app.post('/api/v1/me/saved-searches', async (req, res) => res.status(201).json(await deps.customer!.createSavedSearch((res.locals.identity as Identity).uid, parsed(savedSearchInput, req.body))));
    app.delete('/api/v1/me/saved-searches/:id', async (req, res) => { await deps.customer!.deleteSavedSearch((res.locals.identity as Identity).uid, parsed(uuid, req.params.id)); res.status(204).end(); });

    // Purchase enquiries (supports canonical and /me/enquiries alias)
    app.get('/api/v1/me/purchase-enquiries', async (_req, res) => res.json(await deps.customer!.purchaseEnquiries((res.locals.identity as Identity).uid)));
    app.get('/api/v1/me/enquiries', async (_req, res) => res.json(await deps.customer!.purchaseEnquiries((res.locals.identity as Identity).uid)));
    app.post('/api/v1/purchase-enquiries', async (req, res) => {
      const result = await deps.customer!.createPurchaseEnquiry((res.locals.identity as Identity).uid, parsed(purchaseInput, req.body));
      await triggerEmailDrain();
      res.status(201).json(result);
    });
    app.post('/api/v1/me/enquiries', async (req, res) => {
      const result = await deps.customer!.createPurchaseEnquiry((res.locals.identity as Identity).uid, parsed(purchaseInput, req.body));
      await triggerEmailDrain();
      res.status(201).json(result);
    });
    app.get('/api/v1/me/support-cases', async (_req, res) => res.json(await deps.customer!.supportCases((res.locals.identity as Identity).uid)));
    app.post('/api/v1/support-cases', async (req, res) => {
      const result = await deps.customer!.createSupportCase((res.locals.identity as Identity).uid, parsed(supportInput, req.body));
      await triggerEmailDrain();
      res.status(201).json(result);
    });
    app.get('/api/v1/support-cases/:id', async (req, res) => res.json(await deps.customer!.supportCase((res.locals.identity as Identity).uid, parsed(uuid, req.params.id))));
    app.post('/api/v1/support-cases/:id/replies', async (req, res) => {
      const result = await deps.customer!.replySupportCase((res.locals.identity as Identity).uid, parsed(uuid, req.params.id), parsed(supportReplyInput, req.body).body);
      await triggerEmailDrain();
      res.status(201).json(result);
    });
    app.get('/api/v1/me/activity', async (req, res) => res.json(await deps.customer!.activity((res.locals.identity as Identity).uid, parsed(z.coerce.number().int().min(1).default(1), req.query.page ?? 1), parsed(z.coerce.number().int().min(1).max(50).default(20), req.query.limit ?? 20))));
    app.get('/api/v1/me/addresses', async (_req, res) => res.json(await deps.customer!.addresses((res.locals.identity as Identity).uid)));
    app.post('/api/v1/me/addresses', async (req, res) => res.status(201).json(await deps.customer!.createAddress((res.locals.identity as Identity).uid, parsed(addressInput, req.body))));
    app.delete('/api/v1/me/addresses/:id', async (req, res) => { await deps.customer!.deleteAddress((res.locals.identity as Identity).uid, parsed(uuid, req.params.id)); res.status(204).end(); });
    app.post('/api/v1/me/privacy-requests', async (req, res) => res.status(201).json(await deps.customer!.createPrivacyRequest((res.locals.identity as Identity).uid, parsed(privacyRequestInput, req.body).requestType)));
  }
  app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND' }));
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof HttpError) { res.status(error.status).json({ code: error.code }); return; }
    if (error instanceof SyntaxError) { res.status(400).json({ code: 'INVALID_JSON' }); return; }
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

