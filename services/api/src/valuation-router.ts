import { Router } from 'express';
import { z } from 'zod';
import type { VerifyToken, Identity } from './auth.js';
import { authentication } from './auth.js';
import type { PrismaValuationStore, MarketObservationInput } from './valuation-store.js';
import type { PrismaClient } from '@prisma/client';
import { HttpError } from './errors.js';

const uuid = z.string().uuid();

const marketRecordInput = z.object({
  externalReference: z.string().trim().max(120).optional(),
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  variant: z.string().trim().max(100).optional(),
  manufacturingYear: z.number().int().min(1980).max(new Date().getFullYear() + 1),
  fuelType: z.string().trim().min(2).max(30),
  transmission: z.string().trim().min(2).max(30),
  odometerKm: z.number().int().min(0).max(2_000_000),
  city: z.string().trim().min(2).max(100),
  pricePaise: z.union([z.string(), z.number(), z.bigint()]),
  priceType: z.enum(['ASKING_PRICE', 'COMPLETED_TRANSACTION', 'AUCTION', 'DEALER_WHOLESALE', 'OTHER']),
  conditionBasis: z.string().trim().max(80).optional(),
  observedAt: z.string().datetime(),
}).strict();

const marketImportBatchInput = z.object({
  sourceKey: z.string().trim().min(2).max(80),
  sourceDisplayName: z.string().trim().max(120).optional(),
  sourceProvenance: z.string().trim().max(500).optional(),
  records: z.array(marketRecordInput).min(1).max(1000),
}).strict();

const policyUpdateInput = z.object({
  title: z.string().trim().min(3).max(120),
  content: z.record(z.string(), z.unknown()),
}).strict();

export function createValuationRouter(deps: {
  verify: VerifyToken;
  store: PrismaValuationStore;
  db: PrismaClient;
}) {
  const router = Router();
  router.use(authentication(deps.verify));

  // Resolve staff employee context
  router.use(async (_req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const employee = await deps.db.employee.findFirst({
        where: { user: { firebaseUid: identity.uid } },
        include: { user: true, roleAssignments: { include: { role: true } } },
      });
      if (!employee || employee.status !== 'ACTIVE') {
        throw new HttpError(403, 'EMPLOYEE_ACCESS_DENIED');
      }
      const roles = [employee.role, ...employee.roleAssignments.map(ra => ra.role.name)];
      res.locals.actor = {
        userId: employee.userId,
        email: employee.user.email,
        roles,
      };
      next();
    } catch (err) {
      next(err);
    }
  });

  // 1. Post-Inspection Recommendation
  router.post('/inspection/:inspectionRevisionId/recommend', async (req, res) => {
    const reportId = uuid.parse(req.params.inspectionRevisionId);
    res.status(201).json(await deps.store.recommendFromInspection(res.locals.actor, reportId));
  });

  // 2. Internal Valuation Breakdown
  router.get('/:id/internal', async (req, res) => {
    const valuationId = uuid.parse(req.params.id);
    res.json(await deps.store.getInternalValuation(res.locals.actor, valuationId));
  });

  // 3. Market Data Ingestion
  router.post('/data/imports', async (req, res) => {
    const parsed = marketImportBatchInput.parse(req.body);
    const records: MarketObservationInput[] = parsed.records.map(r => ({
      externalReference: r.externalReference,
      make: r.make,
      model: r.model,
      variant: r.variant,
      manufacturingYear: r.manufacturingYear,
      fuelType: r.fuelType,
      transmission: r.transmission,
      odometerKm: r.odometerKm,
      city: r.city,
      pricePaise: r.pricePaise,
      priceType: r.priceType,
      conditionBasis: r.conditionBasis,
      observedAt: r.observedAt,
    }));
    res.status(201).json(await deps.store.importMarketDataBatch(res.locals.actor, {
      sourceKey: parsed.sourceKey,
      sourceDisplayName: parsed.sourceDisplayName,
      sourceProvenance: parsed.sourceProvenance,
      records,
    }));
  });

  // 4. Data Quality & Quarantine Dashboard
  router.get('/data/quality', async (_req, res) => {
    res.json(await deps.store.getQualityDashboard(res.locals.actor));
  });

  // 5. Pricing Policies
  router.get('/policies', async (_req, res) => {
    res.json(await deps.store.getPricingPolicy());
  });

  router.post('/policies/changes', async (req, res) => {
    const parsed = policyUpdateInput.parse(req.body);
    res.status(201).json(await deps.store.updatePricingPolicy(res.locals.actor, parsed));
  });

  return router;
}
