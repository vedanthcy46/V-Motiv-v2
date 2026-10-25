import express, { Router } from 'express';
import { z } from 'zod';
import { authentication, type Identity, type VerifyToken } from './auth.js';
import { PrismaInspectionStore } from './inspection-store.js';

const uuid = z.string().uuid();

const draftInput = z.object({
  recordVersion: z.number().int().positive(),
  identity: z.record(z.string(), z.unknown()),
  answers: z.array(z.object({
    itemKey: z.string().trim().min(1).max(100),
    status: z.enum(['PASS', 'ISSUE', 'NOT_TESTED', 'NOT_APPLICABLE']),
    value: z.unknown().optional(),
    notes: z.string().trim().max(2_000).optional(),
  }).strict()).max(250),
  defects: z.array(z.object({
    category: z.string().trim().min(1).max(80),
    severity: z.enum(['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL']),
    description: z.string().trim().min(2).max(2_000),
    location: z.string().trim().max(200).optional(),
  }).strict()).max(100),
}).strict();

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
      const recordVersion = z.object({ recordVersion: z.number().int().positive() }).strict().parse(req.body).recordVersion;
      res.json(await deps.store.submit(res.locals.inspectionActor, uuid.parse(req.params.id), recordVersion));
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
      res.json(await deps.store.reschedule(res.locals.inspectionActor, uuid.parse(req.params.id), rescheduleInput.parse(req.body)));
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
