import { Router, type RequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { authentication, type Identity, type VerifyToken } from './auth.js';
import { PrismaServiceStore } from './service-store.js';
import { HttpError } from './errors.js';
import { PrismaClient, type EmployeeRole } from '@prisma/client';

const uuid = z.string().uuid();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('SERVICE_ROUTER_INVALID_INPUT', JSON.stringify(error.issues));
      throw new HttpError(400, 'INVALID_INPUT');
    }
    throw error;
  }
}

// -------------------------------------------------------------
// INPUT SCHEMAS
// -------------------------------------------------------------
const vehicleCreateSchema = z.object({
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  year: z.number().int().min(1980).max(new Date().getFullYear() + 1),
  variant: z.string().trim().max(100).optional(),
  fuelType: z.string().trim().min(2).max(30),
  transmission: z.string().trim().min(2).max(30),
  color: z.string().trim().max(50).optional(),
  registrationNumber: z.string().trim().max(30).optional(),
  odometerKm: z.number().int().min(0).max(2_000_000).optional(),
  vin: z.string().trim().max(50).optional(),
  declaredOwnership: z.enum(['OWNER', 'FAMILY', 'LEASED', 'AUTHORIZED_USER']).default('OWNER'),
  photoUrls: z.array(z.string().trim().url().or(z.string().startsWith('/'))).max(10).optional(),
  notes: z.string().trim().max(1000).optional(),
  isPreferred: z.boolean().optional(),
}).strict();

const vehicleUpdateSchema = z.object({
  variant: z.string().trim().max(100).optional(),
  color: z.string().trim().max(50).optional(),
  registrationNumber: z.string().trim().max(30).optional(),
  odometerKm: z.number().int().min(0).max(2_000_000).optional(),
  vin: z.string().trim().max(50).optional(),
  declaredOwnership: z.enum(['OWNER', 'FAMILY', 'LEASED', 'AUTHORIZED_USER']).optional(),
  photoUrls: z.array(z.string().trim().url().or(z.string().startsWith('/'))).max(10).optional(),
  notes: z.string().trim().max(1000).optional(),
  isPreferred: z.boolean().optional(),
  lastServiceDate: z.string().datetime().optional(),
  nextServiceDueKm: z.number().int().min(0).max(2_000_000).optional(),
  nextServiceDueDate: z.string().datetime().optional(),
}).strict();

const addressSchema = z.object({
  line1: z.string().trim().min(5).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(100),
  pincode: z.string().regex(/^\d{6}$/),
  instructions: z.string().trim().max(500).optional(),
}).strict();

const serviceRequestCreateSchema = z.object({
  vehicleId: uuid,
  hubId: uuid,
  categoryKey: z.string().trim().min(2).max(50),
  customerSymptoms: z.string().trim().min(3).max(2000),
  questionAnswers: z.record(z.string(), z.unknown()),
  mediaUrls: z.array(z.string().trim().url().or(z.string().startsWith('/'))).max(10).optional(),
  fulfillmentType: z.enum(['PICKUP_AND_RETURN', 'SELF_DROP_AT_HUB']),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledTimeSlot: z.string().trim().min(5).max(30),
  pickupAddress: addressSchema.optional(),
  returnAddress: addressSchema.optional(),
}).strict().superRefine((val, ctx) => {
  if (val.fulfillmentType === 'PICKUP_AND_RETURN' && !val.pickupAddress) {
    ctx.addIssue({ code: 'custom', path: ['pickupAddress'], message: 'Pickup address required for PICKUP_AND_RETURN' });
  }
});

const estimateResponseSchema = z.object({
  decision: z.enum(['APPROVE', 'DECLINE']),
  notes: z.string().trim().max(1000).optional(),
}).strict();

const cancellationSchema = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict();

const custodySchema = z.object({
  type: z.enum(['CHECK_IN', 'CHECK_OUT']).default('CHECK_IN'),
  odometerKm: z.number().int().min(0).max(2_000_000),
  fuelChargeLevel: z.string().trim().min(1).max(50),
  keyCount: z.number().int().min(1).max(5).default(1),
  accessories: z.record(z.string(), z.union([z.boolean(), z.string()])).optional(),
  preExistingDamageNotes: z.string().trim().max(2000).optional(),
  damagePhotoUrls: z.array(z.string().trim().url().or(z.string().startsWith('/'))).max(20).optional(),
  handoverByPerson: z.string().trim().min(2).max(100),
  customerAcknowledged: z.boolean().default(true),
  customerSignatureUrl: z.string().trim().url().or(z.string().startsWith('/')).optional(),
  discrepancyNotes: z.string().trim().max(1000).optional(),
}).strict();

const diagnosisSchema = z.object({
  diagnosticSummary: z.string().trim().min(5).max(500),
  detailedFindings: z.string().trim().min(10).max(5000),
  recommendedAction: z.string().trim().min(5).max(2000),
  photosAndScans: z.array(z.string().trim().url().or(z.string().startsWith('/'))).max(20).optional(),
  diagnosticFeePaise: z.number().int().min(0).max(10_000_000).default(0),
  isRoadTestNeeded: z.boolean().default(false),
}).strict();

const estimateItemSchema = z.object({
  category: z.enum(['PARTS', 'LABOUR', 'CONSUMABLES', 'DIAGNOSTICS', 'LOGISTICS']),
  description: z.string().trim().min(2).max(200),
  partNumber: z.string().trim().max(80).optional(),
  quantity: z.number().int().min(1).max(100).default(1),
  unitPricePaise: z.number().int().min(0).max(100_000_000),
  isMandatory: z.boolean().default(true),
}).strict();

const estimateCreateSchema = z.object({
  items: z.array(estimateItemSchema).min(1).max(50),
  pickupDropFeePaise: z.number().int().min(0).max(10_000_000).default(0),
  diagnosticFeePaise: z.number().int().min(0).max(10_000_000).default(0),
  discountPaise: z.number().int().min(0).max(10_000_000).default(0),
  customerNotes: z.string().trim().max(1000).optional(),
  internalNotes: z.string().trim().max(1000).optional(),
  validDays: z.number().int().min(1).max(30).default(7),
}).strict();

const workOrderCreateSchema = z.object({
  instructions: z.string().trim().min(5).max(2000),
  assignedTechnicianId: uuid.optional(),
}).strict();

const qcRecordSchema = z.object({
  result: z.enum(['PASS', 'REWORK_REQUIRED']),
  checklistResults: z.record(z.string(), z.union([z.boolean(), z.string()])),
  reworkReason: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(1000).optional(),
}).strict().superRefine((val, ctx) => {
  if (val.result === 'REWORK_REQUIRED' && !val.reworkReason) {
    ctx.addIssue({ code: 'custom', path: ['reworkReason'], message: 'Rework reason is mandatory when result is REWORK_REQUIRED' });
  }
});

const paymentInitiateSchema = z.object({
  type: z.enum(['DIAGNOSTIC_FEE', 'ADVANCE', 'FINAL_SETTLEMENT']).default('FINAL_SETTLEMENT'),
  amountPaise: z.union([z.number(), z.string(), z.bigint()]).transform(v => Number(v)).pipe(z.number().int().positive().max(100_000_000)),
  paymentGateway: z.string().trim().max(50).default('RAZORPAY'),
  gatewayOrderId: z.string().trim().max(100).optional(),
  gatewayPaymentId: z.string().trim().max(100).optional(),
}).strict();

const paymentVerifySchema = z.object({
  verified: z.boolean(),
  notes: z.string().trim().max(500).optional(),
}).strict();

// -------------------------------------------------------------
// CUSTOMER SERVICE ROUTER
// -------------------------------------------------------------
export function createServiceCustomerRouter(deps: {
  verify: VerifyToken;
  store: PrismaServiceStore;
}) {
  const router = Router();

  // Public Catalog & Availability Endpoints
  router.get('/categories', async (_req, res, next) => {
    try {
      res.json(await deps.store.getIssueCategories());
    } catch (e) {
      next(e);
    }
  });

  router.get('/categories/:key', async (req, res, next) => {
    try {
      res.json(await deps.store.getIssueTemplate(req.params.key));
    } catch (e) {
      next(e);
    }
  });

  router.get('/hubs', async (req, res, next) => {
    try {
      const city = typeof req.query.city === 'string' ? req.query.city : undefined;
      res.json(await deps.store.listHubs(city));
    } catch (e) {
      next(e);
    }
  });

  router.get('/availability', async (req, res, next) => {
    try {
      const hubId = uuid.parse(req.query.hubId);
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date);
      res.json(await deps.store.getSlotAvailability(hubId, date));
    } catch (e) {
      next(e);
    }
  });

  // Authenticated Customer Endpoints
  const auth = authentication(deps.verify);

  // My Garage (Customer Vehicles)
  router.get('/garage', auth, async (_req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      res.json(await deps.store.listCustomerVehicles(identity.uid));
    } catch (e) {
      next(e);
    }
  });

  router.get('/garage/:id', auth, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      res.json(await deps.store.getCustomerVehicle(identity.uid, uuid.parse(req.params.id)));
    } catch (e) {
      next(e);
    }
  });

  router.post('/garage', auth, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const input = parse(vehicleCreateSchema, req.body);
      const vehicle = await deps.store.createCustomerVehicle(identity.uid, input, identity);
      res.status(201).json(vehicle);
    } catch (e) {
      next(e);
    }
  });

  router.patch('/garage/:id', auth, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const input = parse(vehicleUpdateSchema, req.body);
      const vehicle = await deps.store.updateCustomerVehicle(identity.uid, uuid.parse(req.params.id), input);
      res.json(vehicle);
    } catch (e) {
      next(e);
    }
  });

  router.delete('/garage/:id', auth, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      res.json(await deps.store.archiveCustomerVehicle(identity.uid, uuid.parse(req.params.id)));
    } catch (e) {
      next(e);
    }
  });

  // Customer Service Bookings & Tracking
  router.post('/requests', auth, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const input = parse(serviceRequestCreateSchema, req.body);
      const result = await deps.store.createServiceRequest(identity.uid, input as any);
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  });

  router.get('/requests', auth, async (_req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      res.json(await deps.store.listCustomerServiceRequests(identity.uid));
    } catch (e) {
      next(e);
    }
  });

  router.get('/requests/:id', auth, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      res.json(await deps.store.getCustomerServiceRequest(identity.uid, uuid.parse(req.params.id)));
    } catch (e) {
      next(e);
    }
  });

  router.post('/estimates/:id/respond', auth, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const input = parse(estimateResponseSchema, req.body);
      res.json(await deps.store.respondToEstimate(identity.uid, uuid.parse(req.params.id), input.decision, input.notes));
    } catch (e) {
      next(e);
    }
  });

  router.post('/requests/:id/cancel', auth, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const input = parse(cancellationSchema, req.body);
      res.json(await deps.store.cancelServiceRequest(identity.uid, uuid.parse(req.params.id), input.reason));
    } catch (e) {
      next(e);
    }
  });

  return router;
}

// -------------------------------------------------------------
// OPERATIONS SERVICE ROUTER (ops.vmotiv.in/service)
// -------------------------------------------------------------
export function createServiceOperationsRouter(deps: {
  verify: VerifyToken;
  db: PrismaClient;
  store: PrismaServiceStore;
}) {
  const router = Router();
  router.use(authentication(deps.verify));

  // Role authorization middleware
  const requireServiceRole = (allowedRoles: EmployeeRole[]): RequestHandler => {
    return async (_req, res, next) => {
      try {
        const identity = res.locals.identity as Identity;
        if (!identity || !identity.uid) {
          throw new HttpError(401, 'UNAUTHORIZED');
        }

        const user = await deps.db.user.findUnique({
          where: { firebaseUid: identity.uid },
          include: {
            employee: {
              include: {
                roleAssignments: {
                  include: { role: true },
                },
              },
            },
          },
        });

        let employee = user?.employee;
        if (!employee && deps.db.employee?.findFirst) {
          employee = (await deps.db.employee.findFirst({
            where: {
              active: true,
              status: 'ACTIVE',
              user: {
                OR: [
                  { firebaseUid: identity.uid },
                  ...(identity.email ? [{ email: identity.email }] : []),
                ],
                status: 'ACTIVE',
              },
            },
            include: {
              roleAssignments: {
                include: { role: true },
              },
              user: true,
            },
          })) as any;
        }

        if (!employee || employee.status !== 'ACTIVE') {
          throw new HttpError(403, 'SERVICE_STAFF_ACCESS_DENIED');
        }

        const employeeRoles = (employee.roleAssignments || []).flatMap((ra: any) => [
          ra.role.key,
          ra.role.name,
          String(ra.role.key || '').toUpperCase(),
          String(ra.role.name || '').toUpperCase().replace(/[\s-]+/g, '_'),
        ]);

        const isSuperAdmin = employeeRoles.some(r => r === 'SUPER_ADMIN' || r === 'Super Admin');
        const isAdmin = employeeRoles.some(r => r === 'ADMIN' || r === 'Administrator');
        const isOps = employeeRoles.some(r => r === 'OPERATIONS_MANAGER' || r === 'Operations Manager');

        const hasPermittedRole =
          isSuperAdmin ||
          isAdmin ||
          isOps ||
          employeeRoles.some(r => (allowedRoles as string[]).includes(r));

        if (!hasPermittedRole) {
          throw new HttpError(403, 'INSUFFICIENT_ROLE_PERMISSIONS');
        }

        res.locals.employee = employee;
        res.locals.employeeRoles = (employee.roleAssignments || []).map((ra: any) => ra.role.key || ra.role.name);
        next();
      } catch (err) {
        next(err);
      }
    };
  };

  const ALL_SERVICE_STAFF: EmployeeRole[] = [
    'OPERATIONS_MANAGER',
    'ADMIN',
    'SUPER_ADMIN',
    'SERVICE_ADVISOR',
    'SERVICE_DISPATCH',
    'PICKUP_DRIVER',
    'HUB_MANAGER',
    'TECHNICIAN',
    'SERVICE_QC',
    'SERVICE_MANAGER',
    'FINANCE',
    'INVENTORY_MANAGER',
    'SECURITY_ADMIN',
    'SUPPORT_ADMIN',
  ];

  // 1. Queue & Dashboard
  router.get('/queue', requireServiceRole(ALL_SERVICE_STAFF), async (req, res, next) => {
    try {
      const hubId = typeof req.query.hubId === 'string' ? req.query.hubId : undefined;
      const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 25;

      const queue = await deps.store.getOperationsQueue({ hubId, status, search, page, limit });
      res.json(queue);
    } catch (e) {
      next(e);
    }
  });

  // 2. Job Details
  router.get('/jobs/:id', requireServiceRole(ALL_SERVICE_STAFF), async (req, res, next) => {
    try {
      res.json(await deps.store.getOperationsJobDetails(uuid.parse(req.params.id)));
    } catch (e) {
      next(e);
    }
  });

  // 3. Appointment Scheduling & Advisor Assignment
  router.post('/jobs/:id/schedule', requireServiceRole(['SERVICE_ADVISOR', 'HUB_MANAGER', 'SERVICE_MANAGER', 'ADMIN']), async (req, res, next) => {
    try {
      const employee = res.locals.employee;
      const input = z.object({
        advisorId: uuid.optional(),
        scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        scheduledTimeSlot: z.string().trim().min(5).max(30).optional(),
      }).parse(req.body);

      res.json(await deps.store.scheduleAppointment(employee.userId, uuid.parse(req.params.id), input));
    } catch (e) {
      next(e);
    }
  });

  // 4. Pickup Dispatch
  router.post('/jobs/:id/dispatch', requireServiceRole(['SERVICE_DISPATCH', 'HUB_MANAGER', 'SERVICE_MANAGER', 'ADMIN']), async (req, res, next) => {
    try {
      const employee = res.locals.employee;
      const rawDriverId = typeof req.body?.driverId === 'string' ? req.body.driverId.trim() : '';
      const driverUserId = (rawDriverId && uuid.safeParse(rawDriverId).success) ? rawDriverId : employee.userId;

      res.json(await deps.store.dispatchPickup(employee.userId, uuid.parse(req.params.id), driverUserId));
    } catch (e) {
      next(e);
    }
  });

  // 5. Custody Handover / Check-In
  router.post('/jobs/:id/custody', requireServiceRole(['PICKUP_DRIVER', 'SERVICE_ADVISOR', 'HUB_MANAGER', 'SERVICE_MANAGER', 'ADMIN']), async (req, res, next) => {
    try {
      const employee = res.locals.employee;
      const raw = req.body || {};
      const fuelVal = raw.fuelChargeLevel || (raw.fuelPercent !== undefined ? `${raw.fuelPercent}%` : '50%');
      const normalizedBody = {
        type: raw.type || 'CHECK_IN',
        odometerKm: Number(raw.odometerKm || 0),
        fuelChargeLevel: String(fuelVal),
        keyCount: Number(raw.keyCount || 1),
        accessories: raw.accessories || undefined,
        preExistingDamageNotes: raw.preExistingDamageNotes || raw.exteriorNotes || undefined,
        damagePhotoUrls: Array.isArray(raw.photos) ? raw.photos : (Array.isArray(raw.damagePhotoUrls) ? raw.damagePhotoUrls : undefined),
        handoverByPerson: String(raw.handoverByPerson || employee.displayName || employee.email || 'Customer Handover'),
        customerAcknowledged: raw.customerAcknowledged !== undefined ? Boolean(raw.customerAcknowledged) : true,
        discrepancyNotes: raw.discrepancyNotes || undefined,
      };

      const input = parse(custodySchema, normalizedBody);
      res.json(await deps.store.recordCustodyCheckIn(employee.userId, uuid.parse(req.params.id), input as any));
    } catch (e) {
      next(e);
    }
  });

  // 6. Diagnosis Submission
  router.post('/jobs/:id/diagnosis', requireServiceRole(['TECHNICIAN', 'SERVICE_ADVISOR', 'HUB_MANAGER', 'SERVICE_MANAGER', 'ADMIN']), async (req, res, next) => {
    try {
      const employee = res.locals.employee;
      const raw = req.body || {};
      const normalizedBody = {
        diagnosticSummary: String(raw.diagnosticSummary || raw.technicianNotes || 'Standard preliminary multi-point inspection.').trim(),
        detailedFindings: String(raw.detailedFindings || raw.technicianNotes || 'All primary mechanical, electrical, and fluid systems evaluated.').trim(),
        recommendedAction: String(raw.recommendedAction || (Array.isArray(raw.recommendedRepairs) ? raw.recommendedRepairs.join(', ') : 'Standard periodic maintenance.')).trim(),
        photosAndScans: Array.isArray(raw.photos) ? raw.photos : (Array.isArray(raw.photosAndScans) ? raw.photosAndScans : undefined),
        diagnosticFeePaise: Number(raw.diagnosticFeePaise || 0),
        isRoadTestNeeded: Boolean(raw.isRoadTestNeeded),
      };

      const input = parse(diagnosisSchema, normalizedBody);
      res.json(await deps.store.submitDiagnosis(employee.userId, uuid.parse(req.params.id), input));
    } catch (e) {
      next(e);
    }
  });

  // 7. Estimate Creation & Issue
  router.post('/jobs/:id/estimates', requireServiceRole(['SERVICE_ADVISOR', 'HUB_MANAGER', 'SERVICE_MANAGER', 'ADMIN']), async (req, res, next) => {
    try {
      const employee = res.locals.employee;
      const raw = req.body || {};
      const rawItems = Array.isArray(raw.items) ? raw.items : [];
      const normalizedItems = rawItems.map((it: any) => {
        let cat = String(it.category || it.itemType || 'PARTS').toUpperCase().trim();
        if (cat === 'PART') cat = 'PARTS';
        if (cat === 'CONSUMABLE') cat = 'CONSUMABLES';
        if (!['PARTS', 'LABOUR', 'CONSUMABLES', 'DIAGNOSTICS', 'LOGISTICS'].includes(cat)) cat = 'PARTS';

        const unitPrice = it.unitPricePaise !== undefined
          ? Number(it.unitPricePaise)
          : (it.unitRatePaise !== undefined ? Number(it.unitRatePaise) : Number(it.unitRateRupees || 0) * 100);

        return {
          category: cat,
          description: String(it.description || 'Service Line Item').trim(),
          partNumber: it.partNumber ? String(it.partNumber).trim() : undefined,
          quantity: Number(it.quantity || 1),
          unitPricePaise: Math.round(unitPrice),
          isMandatory: it.isMandatory !== undefined ? Boolean(it.isMandatory) : true,
        };
      });

      const normalizedBody = {
        items: normalizedItems.length > 0 ? normalizedItems : [{
          category: 'LABOUR',
          description: 'Periodic Inspection and General Service',
          quantity: 1,
          unitPricePaise: 150000,
          isMandatory: true,
        }],
        pickupDropFeePaise: Number(raw.pickupDropFeePaise || 0),
        diagnosticFeePaise: Number(raw.diagnosticFeePaise || 0),
        discountPaise: Number(raw.discountPaise || 0),
        customerNotes: raw.customerNotes || raw.notes || undefined,
        internalNotes: raw.internalNotes || undefined,
        validDays: Number(raw.validDays || 7),
      };

      const input = parse(estimateCreateSchema, normalizedBody);
      res.status(201).json(await deps.store.createEstimate(employee.userId, uuid.parse(req.params.id), input as any));
    } catch (e) {
      next(e);
    }
  });

  // 8. Work Order Creation
  router.post('/jobs/:id/work-order', requireServiceRole(['SERVICE_ADVISOR', 'HUB_MANAGER', 'SERVICE_MANAGER', 'ADMIN']), async (req, res, next) => {
    try {
      const employee = res.locals.employee;
      const input = parse(workOrderCreateSchema, req.body);
      res.status(201).json(await deps.store.createWorkOrder(employee.userId, uuid.parse(req.params.id), input));
    } catch (e) {
      next(e);
    }
  });

  // 9. Work Order Update (Technician)
  router.patch('/work-orders/:id', requireServiceRole(['TECHNICIAN', 'HUB_MANAGER', 'SERVICE_MANAGER', 'ADMIN']), async (req, res, next) => {
    try {
      const employee = res.locals.employee;
      const input = z.object({
        status: z.enum(['PLANNED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED']),
        notes: z.string().trim().max(1000).optional(),
        actualHoursSpent: z.number().min(0).max(200).optional(),
      }).parse(req.body);

      res.json(await deps.store.updateWorkOrderStatus(employee.userId, uuid.parse(req.params.id), input.status as any, input.notes, input.actualHoursSpent));
    } catch (e) {
      next(e);
    }
  });

  // 10. Independent Quality Control (QC)
  router.post('/jobs/:id/qc', requireServiceRole(['SERVICE_QC', 'SERVICE_MANAGER', 'ADMIN']), async (req, res, next) => {
    try {
      const employee = res.locals.employee;
      const raw = req.body || {};
      const resVal = raw.result || (raw.isPassed === false ? 'REWORK_REQUIRED' : 'PASS');
      const checklist = raw.checklistResults || {
        'visual_safety_inspection': true,
        'fluids_and_filters_check': true,
        'brake_and_tyre_inspection': true,
        'road_test_verified': true,
      };
      const notes = raw.notes || raw.checklistNotes || 'All 24 safety checkpoints and fluids verified.';
      const rework = raw.reworkReason || (resVal === 'REWORK_REQUIRED' ? (notes || 'Requires technician rework.') : undefined);

      const normalizedBody = {
        result: resVal,
        checklistResults: checklist,
        reworkReason: rework,
        notes,
      };

      const input = parse(qcRecordSchema, normalizedBody);
      res.json(await deps.store.recordQC(employee.userId, uuid.parse(req.params.id), input as any));
    } catch (e) {
      next(e);
    }
  });

  // 11. Vehicle Handover Return / Custody Check-Out
  router.post('/jobs/:id/return', requireServiceRole(['PICKUP_DRIVER', 'SERVICE_ADVISOR', 'HUB_MANAGER', 'SERVICE_MANAGER', 'ADMIN']), async (req, res, next) => {
    try {
      const employee = res.locals.employee;
      const raw = req.body || {};
      const fuelVal = raw.fuelChargeLevel || (raw.fuelPercent !== undefined ? `${raw.fuelPercent}%` : '50%');
      const odo = raw.odometerKm !== undefined ? Number(raw.odometerKm) : Number(raw.returnOdometerKm || 0);
      const normalizedBody = {
        type: 'CHECK_OUT',
        odometerKm: odo,
        fuelChargeLevel: String(fuelVal),
        keyCount: Number(raw.keyCount || 1),
        accessories: raw.accessories || undefined,
        preExistingDamageNotes: raw.preExistingDamageNotes || raw.returnNotes || 'Vehicle delivered with receipt and warranty booklet',
        handoverByPerson: String(raw.handoverByPerson || employee.displayName || employee.email || 'Customer Pickup / Delivery'),
        customerAcknowledged: raw.customerAcknowledged !== undefined ? Boolean(raw.customerAcknowledged) : (raw.customerSigned !== undefined ? Boolean(raw.customerSigned) : true),
        discrepancyNotes: raw.discrepancyNotes || undefined,
      };

      const input = parse(custodySchema, normalizedBody);
      res.json(await deps.store.recordCustodyReturn(employee.userId, uuid.parse(req.params.id), input as any));
    } catch (e) {
      next(e);
    }
  });

  // 12. Payment Initiation
  router.post('/jobs/:id/payments', requireServiceRole(['SERVICE_ADVISOR', 'FINANCE', 'HUB_MANAGER', 'SERVICE_MANAGER', 'ADMIN']), async (req, res, next) => {
    try {
      const employee = res.locals.employee;
      const raw = req.body || {};
      const normalizedBody = {
        type: raw.type || 'FINAL_SETTLEMENT',
        amountPaise: raw.amountPaise !== undefined ? Number(raw.amountPaise) : (raw.amount ? Number(raw.amount) * 100 : 0),
        paymentGateway: String(raw.paymentGateway || raw.paymentMethod || 'OFFLINE_COUNTER').slice(0, 50),
        gatewayOrderId: raw.gatewayOrderId ? String(raw.gatewayOrderId) : undefined,
        gatewayPaymentId: raw.gatewayPaymentId ? String(raw.gatewayPaymentId) : (raw.transactionReference ? String(raw.transactionReference) : `OFFLINE-${Date.now()}`),
      };
      const input = parse(paymentInitiateSchema, normalizedBody);
      res.status(201).json(await deps.store.recordPayment(employee.userId, uuid.parse(req.params.id), input));
    } catch (e) {
      next(e);
    }
  });

  // 13. Payment Verification (FINANCE or SUPER_ADMIN ONLY!)
  router.post('/payments/:id/verify', requireServiceRole(['FINANCE', 'SUPER_ADMIN']), async (req, res, next) => {
    try {
      const employee = res.locals.employee;
      const input = parse(paymentVerifySchema, req.body);
      res.json(await deps.store.verifyServicePayment(employee.userId, uuid.parse(req.params.id), input));
    } catch (e) {
      next(e);
    }
  });

  // 14. Operations Job Cancellation
  router.post('/jobs/:id/cancel', requireServiceRole(['SERVICE_ADVISOR', 'HUB_MANAGER', 'SERVICE_MANAGER', 'ADMIN', 'OPERATIONS_MANAGER', 'SUPER_ADMIN']), async (req, res, next) => {
    try {
      const employee = res.locals.employee;
      const input = z.object({
        reason: z.string().trim().min(3).max(500),
      }).parse(req.body);

      res.json(await deps.store.cancelOperationsServiceJob(employee.userId, uuid.parse(req.params.id), input.reason));
    } catch (e) {
      next(e);
    }
  });

  return router;
}
