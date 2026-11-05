import { Router } from 'express';
import { z } from 'zod';
import type { VerifyToken, Identity } from './auth.js';
import { authentication } from './auth.js';
import type { SalesStore } from './sales-store.js';
import { currentCalendarYear } from './calendar.js';

const uuid = z.string().uuid();
const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(80).optional(),
});

const leadQuery = pagination.extend({
  status: z.enum(['SUBMITTED', 'QUALIFYING', 'INSPECTION_SCHEDULED', 'OFFER_PENDING', 'OFFERED', 'ACCEPTED', 'REJECTED', 'CANCELLED']).optional(),
  city: z.string().trim().max(80).optional(),
  unassigned: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
}).strip();

const manualLeadInput = z.object({
  sellerName: z.string().trim().min(2).max(100),
  sellerPhone: z.string().regex(/^\+91[6-9]\d{9}$/, 'Must be an Indian mobile number starting with +91'),
  city: z.string().trim().min(2).max(80),
  pincode: z.string().regex(/^\d{6}$/, 'Must be a 6-digit postal code'),
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  variant: z.string().trim().max(100).optional(),
  manufacturingYear: z.number().int().min(1990).max(currentCalendarYear() + 1),
  fuelType: z.string().trim().min(2).max(30),
  transmission: z.string().trim().min(2).max(30),
  odometerKm: z.number().int().min(0).max(2_000_000),
  expectedPricePaise: z.coerce.bigint().positive().optional(),
  sellerNotes: z.string().trim().max(1000).optional(),
}).strict();

const statusUpdate = z.object({
  status: z.enum(['QUALIFYING', 'INSPECTION_SCHEDULED', 'OFFER_PENDING', 'OFFERED', 'ACCEPTED', 'REJECTED', 'CANCELLED']),
  note: z.string().trim().min(2).max(500).optional(),
}).strict();

const assignInput = z.object({
  employeeId: uuid,
  reason: z.string().trim().max(200).optional(),
}).strict();

const qualifyInput = z.object({
  qualified: z.boolean(),
  reasonCode: z.string().trim().min(2).max(80),
  notes: z.string().trim().max(1000).optional(),
}).strict();

const interactionInput = z.object({
  channel: z.enum(['CALL', 'EMAIL', 'MEETING', 'INTERNAL_NOTE']),
  outcome: z.enum(['ATTEMPTED', 'CONNECTED', 'NO_ANSWER', 'WRONG_NUMBER', 'RESCHEDULE_REQUESTED', 'INFORMATION_PROVIDED']),
  notes: z.string().trim().min(1).max(2_000).optional(),
}).strict();

const taskInput = z.object({
  type: z.enum(['CALL', 'EMAIL', 'MEETING', 'INSPECTION_COORDINATION', 'TEST_DRIVE_FOLLOW_UP', 'QUOTATION_FOLLOW_UP', 'DOCUMENT_FOLLOW_UP']),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  dueAt: z.string().datetime().transform(v => new Date(v)),
  details: z.string().trim().min(2).max(2_000),
  expectedOutcome: z.string().trim().min(2).max(500).optional(),
}).strict();

const completeTaskInput = z.object({
  actualOutcome: z.string().trim().min(2).max(2_000),
}).strict();

const taskQuery = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  overdue: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  leadId: uuid.optional(),
}).strip();

const inspectionRequestQuery = pagination.extend({
  status: z.enum(['REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
}).strip();

const inspectionInput = z.object({
  requestedDate: z.string().date().transform(value => new Date(`${value}T00:00:00.000Z`)).optional(),
  timeSlot: z.string().trim().min(2).max(80).optional(),
  locationType: z.enum(['HUB', 'HOME']),
  address: z.string().trim().min(5).max(500).optional(),
  notes: z.string().trim().max(2_000).optional(),
}).strict();

const inspectionScheduleInput = z.object({
  inspectionDate: z.string().date().transform(value => new Date(`${value}T00:00:00.000Z`)),
  inspectionTimeSlot: z.enum(['10:00-12:00', '12:00-14:00', '14:00-16:00', '16:00-18:00']),
  inspectionLocationType: z.enum(['HUB', 'HOME']),
  inspectionAddress: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2_000).optional(),
}).strict();

const vehicleDetailsInput = z.object({
  registrationNumber: z.string().trim().max(30).optional(),
  variant: z.string().trim().max(100).optional(),
  color: z.string().trim().max(40).optional(),
  registrationYear: z.number().int().min(1980).max(currentCalendarYear() + 1).optional(),
  registrationCity: z.string().trim().max(100).optional(),
  odometerKm: z.number().int().min(0).max(2_000_000).optional(),
}).strict();

const acquisitionOfferQuery = pagination.extend({
  status: z.enum(['OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED']).optional(),
}).strip();

const valuationQuery = pagination.extend({
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED']).optional(),
}).strip();

const offerInput = z.object({
  valuationId: uuid.optional(),
  offerAmountPaise: z.coerce.bigint().positive(),
  validUntil: z.string().datetime().optional().transform(value => value ? new Date(value) : undefined),
  terms: z.string().trim().max(1000).optional(),
  reason: z.string().trim().max(1000).optional(),
}).strict();
const valuationInput = z.object({ inspectionReportId: uuid, expectedResalePaise: z.coerce.bigint().positive(), refurbishmentPaise: z.coerce.bigint().min(0n).optional(), otherCostsPaise: z.coerce.bigint().min(0n).optional(), requiredMarginPaise: z.coerce.bigint().min(0n).optional(), recommendedPurchasePaise: z.coerce.bigint().positive(), notes: z.string().trim().max(2_000).optional(), autoApprove: z.boolean().optional() }).strict();
const valuationDecisionInput = z.object({ version: z.number().int().positive(), decision: z.enum(['APPROVE', 'REJECT']), reason: z.string().trim().max(1_000).optional() }).strict();

const inPersonConfirmInput = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).strict();
const offerResponseInput = z.object({
  decision: z.enum(['ACCEPTED', 'DECLINED']),
  declineReason: z.string().trim().max(500).optional(),
}).strict();

const buyerLeadQuery = pagination.extend({
  status: z.preprocess(v => {
    if (typeof v === 'string' && ['RECEIVED', 'IN_REVIEW', 'CONTACTED', 'CLOSED'].includes(v)) return v;
    return undefined;
  }, z.enum(['RECEIVED', 'IN_REVIEW', 'CONTACTED', 'CLOSED']).optional()),
}).strip();

const buyerLeadStatus = z.object({
  status: z.enum(['RECEIVED', 'IN_REVIEW', 'CONTACTED', 'CLOSED']),
}).strict();

const inventoryQuery = pagination.extend({
  city: z.string().trim().max(80).optional(),
}).strip();

const testDriveQuery = pagination.extend({
  search: z.string().trim().max(80).optional(),
  status: z.preprocess(v => {
    if (typeof v === 'string' && ['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(v)) return v;
    return undefined;
  }, z.enum(['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional()),
}).strip();

const createTestDriveInput = z.object({
  listingId: uuid,
  customerId: uuid,
  enquiryId: uuid.optional(),
  requestedDate: z.string().date().optional().transform(v => v ? new Date(`${v}T00:00:00.000Z`) : undefined),
  timeSlot: z.string().trim().min(2).max(80),
  locationPreference: z.enum(['HUB', 'HOME']).optional(),
  serviceCity: z.string().trim().max(80).optional(),
  customerNotes: z.string().trim().max(500).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.requestedDate && value.requestedDate < new Date(new Date().toISOString().slice(0, 10))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['requestedDate'], message: 'Test drives cannot be scheduled in the past.' });
  }
});

const updateTestDriveInput = z.object({
  status: z.enum(['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  customerNotes: z.string().trim().max(500).optional(),
}).strict();

const quotationQuery = pagination.extend({
  listingId: uuid.optional(),
  customerId: uuid.optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'SUPERSEDED']).optional(),
}).strip();

const createQuotationInput = z.object({
  listingId: uuid,
  customerId: uuid,
  enquiryId: uuid.optional(),
  chargesPaise: z.coerce.bigint().min(0n).optional(),
  chargeBreakdown: z.record(z.string(), z.unknown()).optional(),
  validUntil: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
  terms: z.string().trim().max(1000).optional(),
}).strict();
const updateQuotationInput = z.object({
  chargesPaise: z.coerce.bigint().min(0n).optional(),
  chargeBreakdown: z.record(z.string(), z.unknown()).optional(),
  validUntil: z.string().datetime().transform(v => new Date(v)).optional(),
  terms: z.string().trim().max(1000).optional(),
}).strict().refine(value => Object.keys(value).length > 0);

const requestDiscountInput = z.object({
  requestedDiscountPaise: z.coerce.bigint().positive(),
  reason: z.string().trim().min(5).max(500),
}).strict();

const decideDiscountInput = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  decisionNotes: z.string().trim().max(500).optional(),
}).strict();

const reservationQuery = pagination.extend({
  status: z.enum(['REQUESTED', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'RELEASED', 'CONVERTED_TO_SALE']).optional(),
}).strip();

const requestReservationInput = z.object({
  listingId: uuid,
  customerId: uuid,
  quotationId: uuid.optional(),
  enquiryId: uuid.optional(),
  expiresAt: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
  notes: z.string().trim().max(500).optional(),
}).strict();

const releaseReservationInput = z.object({
  reason: z.string().trim().max(500).optional(),
}).strict();

const sendEmailInput = z.object({
  customerId: uuid,
  template: z.string().trim().min(2).max(80),
  variables: z.record(z.string(), z.string()).optional(),
}).strict();

/** Employee identity and scope are resolved from server-side Firebase and database records only. */
export function createSalesRouter(deps: { verify: VerifyToken; store: SalesStore }) {
  const router = Router();
  router.use(authentication(deps.verify));
  router.use(async (_req, res, next) => {
    try {
      res.locals.salesActor = await deps.store.actor((res.locals.identity as Identity).uid);
      next();
    } catch (error) {
      next(error);
    }
  });

  // Base profile & dashboard
  router.get('/me', (_req, res) => res.json(res.locals.salesActor));
  router.get('/dashboard', async (_req, res) => res.json(await deps.store.dashboard(res.locals.salesActor)));
  router.get('/notifications', async (_req, res) => res.json(await deps.store.notifications(res.locals.salesActor)));
  router.get('/reports', async (_req, res) => res.json(await deps.store.reports(res.locals.salesActor)));

  // Seller leads
  router.get('/seller-leads', async (req, res) => res.json(await deps.store.sellerLeads(res.locals.salesActor, leadQuery.parse(req.query))));
  router.post('/seller-leads', async (req, res) => res.status(201).json(await deps.store.createManualSellerLead(res.locals.salesActor, manualLeadInput.parse(req.body))));
  router.get('/seller-leads/:id', async (req, res) => res.json(await deps.store.sellerLead(res.locals.salesActor, uuid.parse(req.params.id))));
  router.patch('/seller-leads/:id/status', async (req, res) => res.json(await deps.store.updateSellerLeadStatus(res.locals.salesActor, uuid.parse(req.params.id), statusUpdate.parse(req.body))));
  router.post('/seller-leads/:id/claim', async (req, res) => res.status(201).json(await deps.store.claimSellerLead(res.locals.salesActor, uuid.parse(req.params.id))));
  router.post('/seller-leads/:id/release', async (req, res) => res.json(await deps.store.releaseSellerLead(res.locals.salesActor, uuid.parse(req.params.id))));
  router.post('/seller-leads/:id/assign', async (req, res) => res.json(await deps.store.assignSellerLead(res.locals.salesActor, uuid.parse(req.params.id), assignInput.parse(req.body))));
  router.post('/seller-leads/:id/qualify', async (req, res) => res.json(await deps.store.qualifySellerLead(res.locals.salesActor, uuid.parse(req.params.id), qualifyInput.parse(req.body))));

  // Interactions & Tasks
  router.get('/seller-leads/:id/interactions', async (req, res) => res.json(await deps.store.interactions(res.locals.salesActor, uuid.parse(req.params.id))));
  router.post('/seller-leads/:id/interactions', async (req, res) => res.status(201).json(await deps.store.createInteraction(res.locals.salesActor, uuid.parse(req.params.id), interactionInput.parse(req.body))));
  router.get('/tasks', async (req, res) => res.json(await deps.store.tasks(res.locals.salesActor, taskQuery.parse(req.query))));
  router.post('/seller-leads/:id/tasks', async (req, res) => {
    const input = taskInput.parse(req.body);
    res.status(201).json(await deps.store.createTask(res.locals.salesActor, uuid.parse(req.params.id), { ...input, dueAt: input.dueAt! }));
  });
  router.patch('/tasks/:id/complete', async (req, res) => res.json(await deps.store.completeTask(res.locals.salesActor, uuid.parse(req.params.id), completeTaskInput.parse(req.body))));

  // Inspection requests & outcomes
  router.get('/inspection-requests', async (req, res) => res.json(await deps.store.inspectionRequests(res.locals.salesActor, inspectionRequestQuery.parse(req.query))));
  router.post('/seller-leads/:id/inspection-requests', async (req, res) => res.status(201).json(await deps.store.requestInspection(res.locals.salesActor, uuid.parse(req.params.id), inspectionInput.parse(req.body))));
  router.patch('/seller-leads/:id/inspection-schedule', async (req, res) => {
    const input = inspectionScheduleInput.parse(req.body);
    res.json(await deps.store.updateInspectionSchedule(res.locals.salesActor, uuid.parse(req.params.id), {
      ...input,
      inspectionDate: input.inspectionDate!,
    }));
  });
  router.patch('/seller-leads/:id/vehicle-details', async (req, res) => res.json(await deps.store.updateVehicleDetails(res.locals.salesActor, uuid.parse(req.params.id), vehicleDetailsInput.parse(req.body))));
  router.get('/seller-leads/:id/inspection-summary', async (req, res) => res.json(await deps.store.inspectionSummary(res.locals.salesActor, uuid.parse(req.params.id))));

  router.get('/seller-leads/:id/valuations', async (req, res) => res.json(await deps.store.valuations(res.locals.salesActor, uuid.parse(req.params.id))));
  router.post('/seller-leads/:id/valuations', async (req, res) => res.status(201).json(await deps.store.createValuation(res.locals.salesActor, uuid.parse(req.params.id), valuationInput.parse(req.body))));
  router.post('/seller-leads/:id/valuations/:valuationId/decision', async (req, res) => res.json(await deps.store.decideValuation(res.locals.salesActor, uuid.parse(req.params.id), uuid.parse(req.params.valuationId), valuationDecisionInput.parse(req.body))));
  router.get('/valuations', async (req, res) => res.json(await deps.store.allValuations(res.locals.salesActor, valuationQuery.parse(req.query))));
  router.get('/review-requests', async (_req, res) => res.json(await deps.store.reviewRequests(res.locals.salesActor)));

  // Acquisition offers
  router.get('/acquisition-offers', async (req, res) => res.json(await deps.store.acquisitionOffers(res.locals.salesActor, acquisitionOfferQuery.parse(req.query))));
  router.get('/seller-leads/:id/offers', async (req, res) => res.json(await deps.store.getAcquisitionOffers(res.locals.salesActor, uuid.parse(req.params.id))));
  router.post('/seller-leads/:id/offers', async (req, res) => res.status(201).json(await deps.store.proposeAcquisitionOffer(res.locals.salesActor, uuid.parse(req.params.id), offerInput.parse(req.body))));
  router.post('/seller-leads/:id/offers/:offerId/in-person-acceptance/start', async (req, res) => res.status(201).json(await deps.store.startInPersonAcceptance(res.locals.salesActor, uuid.parse(req.params.id), uuid.parse(req.params.offerId))));
  router.post('/seller-leads/:id/offers/:offerId/in-person-acceptance/confirm', async (req, res) => res.json(await deps.store.confirmInPersonAcceptance(res.locals.salesActor, uuid.parse(req.params.id), uuid.parse(req.params.offerId), inPersonConfirmInput.parse(req.body))));
  router.post('/seller-leads/:id/offers/:offerId/decision', async (req, res) => res.json(await deps.store.recordSellerOfferResponse(res.locals.salesActor, uuid.parse(req.params.id), uuid.parse(req.params.offerId), offerResponseInput.parse(req.body))));

  // Buyer leads (Purchase enquiries)
  router.get('/buyer-leads', async (req, res) => res.json(await deps.store.buyerLeads(res.locals.salesActor, buyerLeadQuery.parse(req.query))));
  router.get('/buyer-leads/:id', async (req, res) => res.json(await deps.store.buyerLead(res.locals.salesActor, uuid.parse(req.params.id))));
  router.patch('/buyer-leads/:id/status', async (req, res) => res.json(await deps.store.updateBuyerLeadStatus(res.locals.salesActor, uuid.parse(req.params.id), buyerLeadStatus.parse(req.body).status)));

  // Inventory
  router.get('/inventory', async (req, res) => res.json(await deps.store.inventory(res.locals.salesActor, inventoryQuery.parse(req.query))));
  router.get('/inventory/:id', async (req, res) => res.json(await deps.store.inventoryItem(res.locals.salesActor, uuid.parse(req.params.id))));

  // Test drives
  router.get('/test-drives', async (req, res) => res.json(await deps.store.testDrives(res.locals.salesActor, testDriveQuery.parse(req.query))));
  router.post('/test-drives', async (req, res) => res.status(201).json(await deps.store.requestTestDrive(res.locals.salesActor, createTestDriveInput.parse(req.body))));
  router.patch('/test-drives/:id/status', async (req, res) => res.json(await deps.store.updateTestDriveStatus(res.locals.salesActor, uuid.parse(req.params.id), updateTestDriveInput.parse(req.body))));

  // Retail quotations
  router.get('/quotations', async (req, res) => res.json(await deps.store.quotations(res.locals.salesActor, quotationQuery.parse(req.query))));
  router.get('/quotations/:id', async (req, res) => res.json(await deps.store.quotation(res.locals.salesActor, uuid.parse(req.params.id))));
  router.post('/quotations', async (req, res) => res.status(201).json(await deps.store.createQuotation(res.locals.salesActor, createQuotationInput.parse(req.body))));
  router.patch('/quotations/:id', async (req, res) => res.json(await deps.store.updateQuotation(res.locals.salesActor, uuid.parse(req.params.id), updateQuotationInput.parse(req.body))));
  router.post('/quotations/:id/submit', async (req, res) => res.json(await deps.store.submitQuotation(res.locals.salesActor, uuid.parse(req.params.id))));
  router.post('/quotations/:id/discount-requests', async (req, res) => res.status(201).json(await deps.store.requestDiscount(res.locals.salesActor, uuid.parse(req.params.id), requestDiscountInput.parse(req.body))));
  router.post('/quotations/discount-requests/:id/decision', async (req, res) => res.json(await deps.store.decideDiscount(res.locals.salesActor, uuid.parse(req.params.id), decideDiscountInput.parse(req.body))));

  // Vehicle reservations
  router.get('/reservations', async (req, res) => res.json(await deps.store.reservations(res.locals.salesActor, reservationQuery.parse(req.query))));
  router.post('/reservations', async (req, res) => res.status(201).json(await deps.store.requestReservation(res.locals.salesActor, requestReservationInput.parse(req.body))));
  router.post('/reservations/:id/release', async (req, res) => res.json(await deps.store.releaseReservation(res.locals.salesActor, uuid.parse(req.params.id), releaseReservationInput.parse(req.body).reason)));
  router.post('/listings/:id/release-reservation', async (req, res) => res.json(await deps.store.releaseListingReservation(res.locals.salesActor, uuid.parse(req.params.id), releaseReservationInput.parse(req.body).reason)));
  router.post('/inventory/:id/release-reservation', async (req, res) => res.json(await deps.store.releaseListingReservation(res.locals.salesActor, uuid.parse(req.params.id), releaseReservationInput.parse(req.body).reason)));

  // Customers CRM
  router.get('/customers', async (req, res) => res.json(await deps.store.customers(res.locals.salesActor, pagination.parse(req.query))));
  router.get('/customers/:id', async (req, res) => res.json(await deps.store.customer(res.locals.salesActor, uuid.parse(req.params.id))));

  // Communications (Resend Outbox)
  router.post('/communications/email', async (req, res) => res.status(201).json(await deps.store.sendApprovedEmail(res.locals.salesActor, sendEmailInput.parse(req.body))));

  return router;
}
