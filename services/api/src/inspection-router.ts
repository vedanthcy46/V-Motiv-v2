import express, { Router } from 'express';
import { z } from 'zod';
import { authentication, type Identity, type VerifyToken } from './auth.js';
import { PrismaInspectionStore } from './inspection-store.js';

const uuid = z.string().uuid();

const draftInput = z.object({
  recordVersion: z.number().int().positive().optional(),
  identity: z.record(z.string(), z.unknown()),
  answers: z.array(z.object({
    itemKey: z.string().trim().min(1).max(100),
    status: z.enum(['PASS', 'ISSUE', 'NOT_TESTED', 'NOT_APPLICABLE']),
    value: z.unknown().optional(),
    notes: z.string().trim().max(2_000).optional(),
  }).strip()).max(250),
  defects: z.array(z.object({
    category: z.string().trim().min(1).max(80),
    severity: z.enum(['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL']),
    description: z.string().trim().min(1).max(2_000),
    location: z.string().trim().max(200).optional(),
  }).strip()).max(100),
}).strip();

const submitInput = z.object({
  recordVersion: z.number().int().positive().optional(),
}).strip();

const mediaInitiateInput = z.object({
  logicalMediaId: z.string().trim().min(1).max(100),
  mimeType: z.string().trim().min(3).max(100),
}).strict();

const mediaUploadJsonInput = z.object({
  base64Data: z.string().min(1),
  mimeType: z.string().trim().min(3).max(100).default('image/jpeg'),
  clientChecksum: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  capturedAt: z.string().datetime().transform(val => new Date(val)).optional(),
  logicalMediaId: z.string().trim().min(1).max(100).optional(),
  slotId: z.string().trim().min(1).max(100).optional(),
}).passthrough();

const assignmentInput = z.object({
  inspectorId: uuid,
  scheduledAt: z.string().datetime().transform(value => new Date(value)).optional(),
  locationType: z.enum(['HUB', 'HOME']),
  address: z.string().trim().max(500).optional(),
  instructions: z.string().trim().max(2_000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.locationType === 'HOME' && !value.address) {
    ctx.addIssue({ code: 'custom', path: ['address'], message: 'Address is required for a home appointment.' });
  }
});

const rescheduleInput = z.object({
  scheduledAt: z.string().datetime().transform(value => new Date(value)),
  locationType: z.enum(['HUB', 'HOME']),
  address: z.string().trim().max(500).optional(),
  instructions: z.string().trim().max(2_000).optional(),
  reason: z.string().trim().min(3).max(500),
}).strict().superRefine((value, ctx) => {
  if (value.locationType === 'HOME' && !value.address) {
    ctx.addIssue({ code: 'custom', path: ['address'], message: 'Address is required for a home appointment.' });
  }
});

const cancelInput = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict();

const acquisitionDocumentInput = z.object({
  documentType: z.string().trim().min(2).max(80).regex(/^[A-Z0-9_]+$/),
  status: z.enum(['REQUESTED', 'RECEIVED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'MISMATCH', 'WAIVED_BY_AUTHORIZED_POLICY']),
  notes: z.string().trim().max(2_000).optional(),
  expectedVersion: z.number().int().positive().optional(),
}).strict();
const settlementInput = z.object({
  status: z.enum(['READY_FOR_PAYMENT', 'PAYMENT_PENDING', 'PAYMENT_VERIFIED', 'PAYMENT_FAILED', 'CANCELLED']),
  transactionReference: z.string().trim().min(3).max(200).optional(),
  notes: z.string().trim().max(2_000).optional(),
  expectedVersion: z.number().int().positive().optional(),
}).strict();
const handoverInput = z.object({
  branchId: uuid.optional(),
  status: z.enum(['SCHEDULED', 'RECEIVED', 'DISPUTED', 'REJECTED']),
  location: z.string().trim().min(3).max(500),
  observedAt: z.string().datetime().optional().transform(value => value ? new Date(value) : new Date()),
  registrationNumber: z.string().trim().min(3).max(32).optional(),
  odometerKm: z.number().int().min(0).max(2_000_000).optional(),
  mainKeysReceived: z.number().int().min(0).max(10).optional(),
  spareKeysReceived: z.number().int().min(0).max(10).optional(),
  documentsReceived: z.boolean().optional(),
  accessoriesNotes: z.string().trim().max(2_000).optional(),
  conditionNotes: z.string().trim().max(2_000).optional(),
  exceptionNotes: z.string().trim().max(2_000).optional(),
  expectedVersion: z.number().int().positive().optional(),
}).strict();
const completeAcquisitionInput = z.object({
  expectedVersion: z.number().int().positive(),
  completionNotes: z.string().trim().max(2_000).optional(),
}).strict();
const stockInwardInput = z.object({
  branchId: uuid.optional(),
  physicalLocation: z.string().trim().min(3).max(500),
  notes: z.string().trim().max(2_000).optional(),
}).strict();
const workOrderInput = z.object({
  category: z.string().trim().min(2).max(80),
  requiredAction: z.string().trim().min(5).max(2_000),
  assignedProvider: z.string().trim().max(160).optional(),
  estimatedCostPaise: z.number().int().positive().max(10_000_000_000).optional(),
  notes: z.string().trim().max(2_000).optional(),
}).strict();
const submitCostInput = z.object({ expectedVersion: z.number().int().positive(), estimatedCostPaise: z.number().int().positive().max(10_000_000_000), reason: z.string().trim().min(5).max(2_000) }).strict();
const costDecisionInput = z.object({ expectedVersion: z.number().int().positive(), decision: z.enum(['APPROVE', 'REJECT']), reason: z.string().trim().min(5).max(2_000) }).strict();
const startWorkOrderInput = z.object({ expectedVersion: z.number().int().positive() }).strict();
const completeWorkOrderInput = z.object({ expectedVersion: z.number().int().positive(), actualCostPaise: z.number().int().min(0).max(10_000_000_000).optional(), notes: z.string().trim().max(2_000).optional() }).strict();
const startQualityControlInput = z.object({ workOrderId: uuid.optional(), findings: z.string().trim().max(4_000).optional(), evidenceNotes: z.string().trim().max(4_000).optional() }).strict();
const qualityControlDecisionInput = z.object({ expectedVersion: z.number().int().positive(), decision: z.enum(['PASS', 'REWORK_REQUIRED', 'FAIL']), findings: z.string().trim().max(4_000).optional(), evidenceNotes: z.string().trim().max(4_000).optional() }).strict();

const prepareListingInput = z.object({
  title: z.string().trim().min(3).max(200),
  features: z.array(z.string().trim()).optional(),
  color: z.string().trim().optional(),
  conditionSummary: z.string().trim().max(2_000).optional(),
  inspectionSummary: z.string().trim().max(2_000).optional(),
  verifiedTags: z.array(z.string().trim()).optional(),
  mediaUrls: z.array(z.string().trim().min(5)).optional(),
  expectedVersion: z.number().int().positive(),
}).strict();

const publishListingInput = z.object({
  retailPricePaise: z.coerce.bigint().positive(),
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().max(200).optional(),
}).strict();

const deliverVehicleInput = z.object({
  buyerName: z.string().trim().min(2).max(100),
  buyerPhone: z.string().trim().min(7).max(20),
  odometerKm: z.number().int().min(0).optional(),
  deliveryNotes: z.string().trim().max(2_000).optional(),
  expectedVersion: z.number().int().positive(),
}).strict();

const decisionInput = z.object({
  decision: z.enum(['APPROVE', 'REQUEST_CORRECTION', 'REJECT']),
  reason: z.string().trim().max(2_000).optional(),
}).strict();

function secured(store: PrismaInspectionStore, verify: VerifyToken) {
  const router = Router();
  router.use(authentication(verify));
  router.use(async (_req, res, next) => {
    try {
      res.locals.inspectionActor = await store.actor((res.locals.identity as Identity).uid);
      next();
    } catch (error) {
      next(error);
    }
  });
  return router;
}

export function createInspectorRouter(deps: { verify: VerifyToken; store: PrismaInspectionStore }) {
  const router = secured(deps.store, deps.verify);

  router.get('/me', (_req, res) => res.json(res.locals.inspectionActor));

  router.get('/assignments', async (_req, res, next) => {
    try {
      res.json(await deps.store.assignments(res.locals.inspectionActor));
    } catch (e) {
      next(e);
    }
  });

  router.get('/assignments/:id', async (req, res, next) => {
    try {
      res.json(await deps.store.assignment(res.locals.inspectionActor, uuid.parse(req.params.id)));
    } catch (e) {
      next(e);
    }
  });

  router.post('/assignments/:id/start', async (req, res, next) => {
    try {
      const report = await deps.store.start(res.locals.inspectionActor, uuid.parse(req.params.id));
      const template = deps.store.template(res.locals.inspectionActor, report.templateKey, report.templateVersion);
      res.json({
        ...report,
        report,
        template,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/templates/:key/:version', (req, res, next) => {
    try {
      res.json(deps.store.template(
        res.locals.inspectionActor,
        z.string().regex(/^[a-z0-9-]+$/).parse(req.params.key),
        z.coerce.number().int().positive().parse(req.params.version)
      ));
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/:id', async (req, res, next) => {
    try {
      res.json(await deps.store.report(res.locals.inspectionActor, uuid.parse(req.params.id)));
    } catch (e) {
      next(e);
    }
  });

  router.put('/reports/:id/draft', async (req, res, next) => {
    try {
      res.json(await deps.store.saveDraft(res.locals.inspectionActor, uuid.parse(req.params.id), draftInput.parse(req.body)));
    } catch (e) {
      next(e);
    }
  });

  router.post('/reports/:id/submit', async (req, res, next) => {
    try {
      const parsed = submitInput.parse(req.body ?? {});
      res.json(await deps.store.submit(res.locals.inspectionActor, uuid.parse(req.params.id), parsed.recordVersion));
    } catch (e) {
      next(e);
    }
  });

  // Media Initiation & Upload
  router.post('/reports/:id/media/initiate', async (req, res, next) => {
    try {
      const input = mediaInitiateInput.parse(req.body);
      res.json(await deps.store.initiateMediaUpload(res.locals.inspectionActor, uuid.parse(req.params.id), input));
    } catch (e) {
      next(e);
    }
  });

  const handleMediaUpload = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const reportId = uuid.parse(req.params.id);
      const parsed = mediaUploadJsonInput.parse(req.body);
      const logicalMediaId = z.string().trim().min(1).max(100).parse(
        req.params.mediaId || parsed.logicalMediaId || parsed.slotId || `evidence-${Date.now()}`
      );

      const buffer = Buffer.from(parsed.base64Data, 'base64');

      const media = await deps.store.uploadMedia(
        res.locals.inspectionActor,
        reportId,
        logicalMediaId,
        buffer,
        parsed.mimeType,
        parsed.clientChecksum,
        parsed.capturedAt
      );
      res.json(media);
    } catch (e) {
      next(e);
    }
  };

  router.post('/reports/:id/media/:mediaId/upload', express.json({ limit: '50mb' }), handleMediaUpload);
  router.post('/reports/:id/media/upload-json', express.json({ limit: '50mb' }), handleMediaUpload);

  router.get('/reports/:id/media/:mediaId/content', async (req, res, next) => {
    try {
      const reportId = uuid.parse(req.params.id);
      const mediaId = req.params.mediaId;
      const { buffer, mimeType } = await deps.store.readMediaContent(res.locals.inspectionActor, reportId, mediaId);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

export function createInspectionReviewRouter(deps: { verify: VerifyToken; store: PrismaInspectionStore }) {
  const router = secured(deps.store, deps.verify);

  router.get('/queue', async (_req, res, next) => {
    try {
      res.json(await deps.store.reviewQueue(res.locals.inspectionActor));
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/:id', async (req, res, next) => {
    try {
      res.json(await deps.store.reviewReport(res.locals.inspectionActor, uuid.parse(req.params.id)));
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/:id/diff', async (req, res, next) => {
    try {
      res.json(await deps.store.revisionDiff(res.locals.inspectionActor, uuid.parse(req.params.id)));
    } catch (e) {
      next(e);
    }
  });

  router.post('/reports/:id/decision', async (req, res, next) => {
    try {
      res.json(await deps.store.decide(res.locals.inspectionActor, uuid.parse(req.params.id), decisionInput.parse(req.body)));
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/:id/media/:mediaId/content', async (req, res, next) => {
    try {
      const reportId = uuid.parse(req.params.id);
      const mediaId = req.params.mediaId;
      const { buffer, mimeType } = await deps.store.readMediaContent(res.locals.inspectionActor, reportId, mediaId);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

export function createOperationsInspectionRouter(deps: { verify: VerifyToken; store: PrismaInspectionStore }) {
  const router = secured(deps.store, deps.verify);

  router.get('/dashboard', async (_req, res, next) => {
    try { res.json(await deps.store.operationsDashboard(res.locals.inspectionActor)); }
    catch (e) { next(e); }
  });

  router.get('/acquisitions', async (_req, res, next) => {
    try { res.json(await deps.store.acquisitionCases(res.locals.inspectionActor)); }
    catch (e) { next(e); }
  });

  router.post('/acquisitions/:id/documents', async (req, res, next) => {
    try { res.json(await deps.store.updateAcquisitionDocument(res.locals.inspectionActor, uuid.parse(req.params.id), acquisitionDocumentInput.parse(req.body))); }
    catch (e) { next(e); }
  });

  router.post('/acquisitions/:id/handover', async (req, res, next) => {
    try {
      const input = handoverInput.parse(req.body);
      res.json(await deps.store.recordVehicleHandover(res.locals.inspectionActor, uuid.parse(req.params.id), { ...input, observedAt: input.observedAt ?? new Date() }));
    }
    catch (e) { next(e); }
  });

  router.post('/acquisitions/:id/complete', async (req, res, next) => {
    try { res.json(await deps.store.completeAcquisition(res.locals.inspectionActor, uuid.parse(req.params.id), completeAcquisitionInput.parse(req.body))); }
    catch (e) { next(e); }
  });

  router.post('/acquisitions/:id/stock-inward', async (req, res, next) => {
    try { res.status(201).json(await deps.store.stockInward(res.locals.inspectionActor, uuid.parse(req.params.id), stockInwardInput.parse(req.body))); }
    catch (e) { next(e); }
  });

  router.get('/inventory', async (_req, res, next) => {
    try { res.json(await deps.store.stockUnits(res.locals.inspectionActor)); }
    catch (e) { next(e); }
  });

  router.post('/inventory/:id/work-orders', async (req, res, next) => {
    try {
      const body = workOrderInput.parse(req.body);
      res.status(201).json(await deps.store.createWorkOrder(res.locals.inspectionActor, uuid.parse(req.params.id), { ...body, estimatedCostPaise: body.estimatedCostPaise === undefined ? undefined : BigInt(body.estimatedCostPaise) }));
    } catch (e) { next(e); }
  });

  router.post('/work-orders/:id/cost-approval', async (req, res, next) => {
    try {
      const body = submitCostInput.parse(req.body);
      res.json(await deps.store.submitWorkOrderCost(res.locals.inspectionActor, uuid.parse(req.params.id), { ...body, estimatedCostPaise: BigInt(body.estimatedCostPaise) }));
    } catch (e) { next(e); }
  });

  router.post('/work-orders/:id/cost-decision', async (req, res, next) => {
    try { res.json(await deps.store.decideWorkOrderCost(res.locals.inspectionActor, uuid.parse(req.params.id), costDecisionInput.parse(req.body))); }
    catch (e) { next(e); }
  });

  router.post('/work-orders/:id/start', async (req, res, next) => {
    try { res.json(await deps.store.startWorkOrder(res.locals.inspectionActor, uuid.parse(req.params.id), startWorkOrderInput.parse(req.body).expectedVersion)); }
    catch (e) { next(e); }
  });

  router.post('/work-orders/:id/complete', async (req, res, next) => {
    try {
      const body = completeWorkOrderInput.parse(req.body);
      res.json(await deps.store.completeWorkOrder(res.locals.inspectionActor, uuid.parse(req.params.id), { ...body, actualCostPaise: body.actualCostPaise === undefined ? undefined : BigInt(body.actualCostPaise) }));
    } catch (e) { next(e); }
  });

  router.post('/inventory/:id/qc', async (req, res, next) => {
    try { res.status(201).json(await deps.store.startQualityControl(res.locals.inspectionActor, uuid.parse(req.params.id), startQualityControlInput.parse(req.body))); }
    catch (e) { next(e); }
  });

  router.post('/quality-control/:id/decision', async (req, res, next) => {
    try { res.json(await deps.store.decideQualityControl(res.locals.inspectionActor, uuid.parse(req.params.id), qualityControlDecisionInput.parse(req.body))); }
    catch (e) { next(e); }
  });

  router.post('/inventory/:id/prepare-listing', async (req, res, next) => {
    try {
      res.json(await deps.store.prepareListing(res.locals.inspectionActor, uuid.parse(req.params.id), prepareListingInput.parse(req.body)));
    } catch (e) { next(e); }
  });

  router.post('/inventory/:id/publish-listing', async (req, res, next) => {
    try {
      res.json(await deps.store.publishListing(res.locals.inspectionActor, uuid.parse(req.params.id), publishListingInput.parse(req.body)));
    } catch (e) { next(e); }
  });

  router.post('/inventory/:id/deliver', async (req, res, next) => {
    try {
      res.json(await deps.store.deliverVehicle(res.locals.inspectionActor, uuid.parse(req.params.id), deliverVehicleInput.parse(req.body)));
    } catch (e) { next(e); }
  });

  router.get('/inspection-requests', async (_req, res, next) => {
    try {
      res.json(await deps.store.operationRequests(res.locals.inspectionActor));
    } catch (e) {
      next(e);
    }
  });

  router.get('/inspectors', async (req, res, next) => {
    try {
      const branchId = typeof req.query.branchId === 'string' && req.query.branchId ? uuid.parse(req.query.branchId) : undefined;
      res.json(await deps.store.operationInspectors(res.locals.inspectionActor, branchId));
    } catch (e) {
      next(e);
    }
  });

  router.post('/inspection-requests/:id/assign', async (req, res, next) => {
    try {
      res.json(await deps.store.assign(res.locals.inspectionActor, uuid.parse(req.params.id), assignmentInput.parse(req.body)));
    } catch (e) {
      next(e);
    }
  });

  router.post('/inspection-requests/:id/reschedule', async (req, res, next) => {
    try {
      const input = rescheduleInput.parse(req.body);
      res.json(await deps.store.reschedule(res.locals.inspectionActor, uuid.parse(req.params.id), { ...input, scheduledAt: input.scheduledAt! }));
    } catch (e) {
      next(e);
    }
  });

  router.post('/inspection-requests/:id/cancel', async (req, res, next) => {
    try {
      res.json(await deps.store.cancel(res.locals.inspectionActor, uuid.parse(req.params.id), cancelInput.parse(req.body).reason));
    } catch (e) {
      next(e);
    }
  });

  return router;
}

export function createFinanceAcquisitionRouter(deps: { verify: VerifyToken; store: PrismaInspectionStore }) {
  const router = secured(deps.store, deps.verify);
  router.post('/acquisitions/:id/settlement', async (req, res, next) => {
    try { res.json(await deps.store.updateAcquisitionSettlement(res.locals.inspectionActor, uuid.parse(req.params.id), settlementInput.parse(req.body))); }
    catch (e) { next(e); }
  });
  return router;
}
