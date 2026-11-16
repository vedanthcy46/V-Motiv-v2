import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z, ZodError } from 'zod';
import { authentication, type Identity, type VerifyToken } from '../auth.js';
import { HttpError } from '../errors.js';
import { SCRAP_STATUSES } from './scrap-workflow.js';
import { PrismaScrapStore, ScrapValidationError, type StaffContext } from './scrap-store.js';

const status = z.enum(SCRAP_STATUSES);
const uuid = z.string().uuid();

// In a draft patch every field may be null, which clears it.
const vehicle = z.object({
  registrationNumber: z.string().trim().max(20).nullable(),
  make: z.string().trim().max(60).nullable(),
  model: z.string().trim().max(80).nullable(),
  variant: z.string().trim().max(80).nullable(),
  manufacturingYear: z.number().int().nullable(),
  registrationYear: z.number().int().nullable(),
  fuelType: z.string().trim().max(20).nullable(),
  vehicleCategory: z.string().trim().max(40).nullable(),
  odometerKm: z.number().int().nullable(),
  vin: z.string().trim().max(32).nullable(),
}).partial().strict();

const answers = z.record(z.string().max(60), z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]));

const ownership = z.object({
  isRegisteredOwner: z.boolean().nullable(), ownerRelationship: z.string().trim().max(500).nullable(),
  hasLoan: z.boolean().nullable(), lenderName: z.string().trim().max(500).nullable(),
  hasPendingDues: z.boolean().nullable(), duesDetails: z.string().trim().max(500).nullable(),
  hasLegalDispute: z.boolean().nullable(), disputeDetails: z.string().trim().max(500).nullable(),
  declarationAccepted: z.boolean().nullable(),
}).partial().strict();

const pickupAddress = z.object({
  line1: z.string().trim().max(200).nullable(), line2: z.string().trim().max(200).nullable(), landmark: z.string().trim().max(200).nullable(),
  city: z.string().trim().max(80).nullable(), pincode: z.string().trim().max(10).nullable(),
}).partial().strict();

const draftPatch = z.object({ vehicle: vehicle.optional(), answers: answers.optional(), ownership: ownership.optional(), pickupAddress: pickupAddress.optional() }).strict();

const createDraftBody = z.object({
  customerVehicleId: z.string().uuid().optional(),
  submissionKey: z.string().trim().min(8).max(100).optional(),
  draft: draftPatch.optional(),
}).strict();
const updateDraftBody = draftPatch.extend({ expectedVersion: z.number().int().positive() }).strict();
const cancelBody = z.object({ reason: z.string().trim().min(3).max(500), expectedVersion: z.number().int().positive().optional() }).strict();
const disputeBody = z.object({ category: z.string().trim().max(60), description: z.string().max(4000) }).strict();
const offerResponseBody = z.object({ offerId: z.string().uuid(), decision: z.enum(['ACCEPTED', 'REJECTED']), note: z.string().trim().max(500).optional(), device: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).optional() }).strict();

const page = z.object({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(50).optional() });
const customerListQuery = page.extend({ status: status.optional() });
const staffListQuery = page.extend({ status: status.optional(), search: z.string().trim().max(40).optional(), assignedToMe: z.enum(['true', 'false']).optional() });

const qualifyBody = z.object({ qualified: z.boolean(), note: z.string().trim().min(3).max(1000) }).strict();
const requestDocumentsBody = z.object({ documentTypes: z.array(z.string().trim().min(2).max(40)).min(1).max(15), note: z.string().trim().max(500).optional() }).strict();
const reviewDocumentBody = z.object({ decision: z.enum(['ACCEPT', 'REJECT']), reason: z.string().trim().max(500).optional() }).strict();
const flagBody = z.object({ flag: z.string().trim().max(60), action: z.enum(['SET', 'CLEAR']), note: z.string().trim().min(3).max(1000) }).strict();
const transitionBody = z.object({ to: status, expectedVersion: z.number().int().positive(), reason: z.string().trim().max(1000).optional() }).strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ScrapValidationError(error.issues.map(issue => ({ field: issue.path.join('.') || 'body', message: issue.message === 'Required' ? 'This is required.' : issue.message })));
    }
    throw error;
  }
}

/**
 * Customer routes live under /customer/scrap and staff routes under /scrap. Customers can reach only their own requests; staff are known
 * from the database and act under the permissions their roles grant. The client never says who it is or what it may do.
 */
export function createScrapRouter(deps: { verify: VerifyToken; store: PrismaScrapStore; limiter?: RequestHandler }) {
  const router = Router();
  const auth = authentication(deps.verify);
  // Rate limiting applies to the scrapping prefixes only, so it never throttles unrelated API traffic that passes through the same router.
  if (deps.limiter) router.use(['/customer/scrap', '/scrap'], deps.limiter);

  const ready: RequestHandler = async (_req, _res, next) => {
    try { await deps.store.assertSchemaReady(); next(); } catch (error) { next(error); }
  };
  const customer = (handler: (uid: string, req: Request, res: Response) => Promise<unknown>, successStatus = 200): RequestHandler => async (req, res, next) => {
    try {
      res.status(successStatus).json(await handler((res.locals.identity as Identity).uid, req, res));
    } catch (error) { fail(error, res, next); }
  };
  const staff = (handler: (ctx: StaffContext, req: Request, res: Response) => Promise<unknown>, successStatus = 200): RequestHandler => async (req, res, next) => {
    try {
      const ctx = await deps.store.staffContext((res.locals.identity as Identity).uid);
      res.status(successStatus).json(await handler(ctx, req, res));
    } catch (error) { fail(error, res, next); }
  };
  /** Field-level problems are sent as `fields` so a screen can mark the right inputs; everything else goes to the shared error handler. */
  function fail(error: unknown, res: Response, next: NextFunction) {
    if (error instanceof ScrapValidationError) { res.status(400).json({ code: error.code, message: error.message, fields: error.fields }); return; }
    next(error);
  }
  const id = (req: Request) => parse(uuid, req.params.id);

  // ---- customer ----------------------------------------------------------------------------------------------------------------
  router.get('/customer/scrap/questionnaire', auth, customer(async () => deps.store.getQuestionnaire()));
  router.post('/customer/scrap/requests', auth, ready, customer(async (uid, req) => deps.store.createDraft(uid, parse(createDraftBody, req.body)), 201));
  router.get('/customer/scrap/requests', auth, ready, customer(async (uid, req) => deps.store.listForCustomer(uid, parse(customerListQuery, req.query))));
  router.get('/customer/scrap/requests/:id', auth, ready, customer(async (uid, req) => deps.store.getForCustomer(uid, req.params.id as string)));
  router.patch('/customer/scrap/requests/:id', auth, ready, customer(async (uid, req) => {
    const { expectedVersion, ...patch } = parse(updateDraftBody, req.body);
    return deps.store.updateDraft(uid, req.params.id as string, expectedVersion, patch);
  }));
  router.delete('/customer/scrap/requests/:id', auth, ready, customer(async (uid, req) => deps.store.deleteDraft(uid, req.params.id as string)));
  router.post('/customer/scrap/requests/:id/submit', auth, ready, customer(async (uid, req) => deps.store.submit(uid, req.params.id as string)));
  router.post('/customer/scrap/requests/:id/cancel', auth, ready, customer(async (uid, req) => deps.store.cancel(uid, req.params.id as string, parse(cancelBody, req.body))));
  router.post('/customer/scrap/requests/:id/disputes', auth, ready, customer(async (uid, req) => deps.store.raiseDispute(uid, req.params.id as string, parse(disputeBody, req.body)), 201));
  router.post('/customer/scrap/requests/:id/offer-response', auth, ready, customer(async (uid, req) => deps.store.respondToOffer(uid, req.params.id as string, { ...parse(offerResponseBody, req.body), networkAddress: req.ip })));

  // ---- staff -------------------------------------------------------------------------------------------------------------------
  router.get('/scrap/requests', auth, ready, staff(async (ctx, req) => {
    const query = parse(staffListQuery, req.query);
    return deps.store.listForStaff(ctx, { ...query, assignedToMe: query.assignedToMe === 'true' });
  }));
  router.get('/scrap/requests/:id', auth, ready, staff(async (ctx, req) => deps.store.getForStaff(ctx, id(req))));
  router.post('/scrap/requests/:id/qualify', auth, ready, staff(async (ctx, req) => deps.store.qualifyLead(ctx, id(req), parse(qualifyBody, req.body))));
  router.post('/scrap/requests/:id/documents/request', auth, ready, staff(async (ctx, req) => deps.store.requestDocuments(ctx, id(req), parse(requestDocumentsBody, req.body))));
  router.post('/scrap/documents/:id/review', auth, ready, staff(async (ctx, req) => deps.store.reviewDocument(ctx, id(req), parse(reviewDocumentBody, req.body))));
  router.post('/scrap/requests/:id/flags', auth, ready, staff(async (ctx, req) => deps.store.setBlockingFlag(ctx, id(req), parse(flagBody, req.body))));
  router.post('/scrap/requests/:id/transition', auth, ready, staff(async (ctx, req) => deps.store.transition(ctx, id(req), parse(transitionBody, req.body))));

  // Anything else under these prefixes is unknown, not a fall-through to another router.
  router.use(['/customer/scrap', '/scrap'], (_req, _res, next) => next(new HttpError(404, 'NOT_FOUND')));
  return router;
}
