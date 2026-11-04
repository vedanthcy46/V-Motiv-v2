import { Router, type RequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { authentication, type Identity, type VerifyToken } from './auth.js';
import { PrismaRentalStore } from './rental-store.js';
import { HttpError } from './errors.js';
import { PrismaClient, type EmployeeRole } from '@prisma/client';
import crypto from 'node:crypto';

const uuid = z.string().trim().min(1);

const flexibleDateSchema = z.preprocess((val) => {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'number') return new Date(val).toISOString();
  if (typeof val === 'string') {
    const trimmed = val.trim();
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d.toISOString();
    return trimmed;
  }
  return val;
}, z.string().min(8));

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('RENTAL_ROUTER_INVALID_INPUT', JSON.stringify(error.issues));
      const firstIssue = error.issues[0];
      const issueMessage = firstIssue?.message && firstIssue.message !== 'Required'
        ? firstIssue.message
        : firstIssue?.path?.length
        ? `Invalid ${firstIssue.path.join('.')}`
        : 'INVALID_INPUT';
      throw new HttpError(400, 'INVALID_INPUT', issueMessage);
    }
    throw error;
  }
}

// -------------------------------------------------------------
// SCHEMAS
// -------------------------------------------------------------
const searchFilterSchema = z.object({
  hubId: uuid.optional(),
  city: z.string().trim().max(80).optional(),
  startTime: flexibleDateSchema.optional().default(() => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
  endTime: flexibleDateSchema.optional().default(() => new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()),
  fuelType: z.string().trim().max(30).optional(),
  transmission: z.string().trim().max(30).optional(),
  seats: z.coerce.number().int().min(2).max(12).optional(),
}).passthrough();

const holdCreateSchema = z.object({
  vehicleId: uuid,
  hubId: uuid.optional(),
  startTime: flexibleDateSchema,
  endTime: flexibleDateSchema,
}).passthrough();

const checkoutSchema = z.object({
  returnHubId: uuid.optional(),
  customerNotes: z.string().trim().max(1000).optional(),
  acceptTerms: z.preprocess((val) => val === true || val === 'true' || val === 1 || val === '1', z.literal(true)),
  termsVersion: z.string().trim().default('VMR-TERMS-V2026.1'),
  paymentPlanId: z.enum(['FULL_100', 'ADVANCE_25', 'ADVANCE_50']).default('FULL_100'),
}).passthrough();

const verifyPaymentSchema = z.object({
  paymentGateway: z.string().trim().default('RAZORPAY'),
  gatewayOrderId: z.string().trim().min(1),
  gatewayPaymentId: z.string().trim().min(1),
  gatewaySignature: z.string().trim().min(1),
}).passthrough();

const driverKycSchema = z.object({
  licenseNumber: z.string().trim().min(3).max(50),
  licenseExpiry: z.string().min(8),
  licenseCategory: z.string().trim().max(30).default('LMV'),
  dateOfBirth: z.string().min(8),
  drivingExperienceYears: z.coerce.number().int().min(0).max(80).default(3),
  licenseFrontUrl: z.string().trim().min(1),
  licenseBackUrl: z.string().trim().min(1),
}).passthrough();

const kycReviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  rejectionReason: z.string().trim().max(500).optional(),
});

const walkinRentalBookingSchema = z.object({
  vehicleId: uuid,
  customerName: z.string().trim().min(1).max(100),
  customerPhone: z.string().trim().min(7).max(30),
  customerEmail: z.preprocess((v) => typeof v === 'string' && v.trim() ? v.trim() : undefined, z.string().email().optional().nullable()),
  startTime: z.preprocess((val) => {
    if (val instanceof Date) return val;
    if (typeof val === 'string' || typeof val === 'number') {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
    }
    return val;
  }, z.coerce.date()),
  endTime: z.preprocess((val) => {
    if (val instanceof Date) return val;
    if (typeof val === 'string' || typeof val === 'number') {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
    }
    return val;
  }, z.coerce.date()),
  licenseNumber: z.preprocess((v) => typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : 'DL-WALKIN', z.string().min(2).max(50)),
  licenseExpiry: z.preprocess((val) => {
    if (val instanceof Date) return val;
    if (typeof val === 'string' || typeof val === 'number') {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date(Date.now() + 365 * 24 * 3600 * 1000);
  }, z.coerce.date()),
  drivingExperienceYears: z.coerce.number().int().min(0).max(80).default(3),
  licenseFrontUrl: z.preprocess((v) => typeof v === 'string' && v.trim() ? v.trim() : 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80', z.string().min(1)),
  licenseBackUrl: z.preprocess((v) => typeof v === 'string' && v.trim() ? v.trim() : 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80', z.string().min(1)),
  paymentMethod: z.string().trim().default('UPI'),
  transactionReference: z.preprocess((v) => typeof v === 'string' && v.trim() ? v.trim() : undefined, z.string().max(100).optional().nullable()),
  startOdometerKm: z.preprocess((v) => v === '' || v === null || v === undefined ? undefined : Number(v), z.coerce.number().int().min(0).optional().nullable()),
  fuelPercent: z.preprocess((v) => v === '' || v === null || v === undefined ? 100 : Number(v), z.coerce.number().int().min(0).max(100).default(100)),
  notes: z.preprocess((v) => typeof v === 'string' && v.trim() ? v.trim() : undefined, z.string().max(1000).optional().nullable()),
  immediateHandover: z.coerce.boolean().default(false),
}).passthrough();

const handoverSchema = z.object({
  odometerKm: z.coerce.number().int().min(0),
  fuelPercent: z.coerce.number().int().min(0).max(100),
  photos: z.array(z.string().trim().min(1)).default([]),
  notes: z.string().trim().max(1000).optional(),
  customerSigned: z.boolean().default(true),
});

const returnSchema = z.object({
  returnOdometerKm: z.coerce.number().int().min(0),
  returnFuelPercent: z.coerce.number().int().min(0).max(100),
  photos: z.array(z.string().trim().min(1)).default([]),
  notes: z.string().trim().max(1000).optional(),
  customerSigned: z.boolean().default(true),
  damages: z
    .array(
      z.object({
        description: z.string().trim().min(3).max(500),
        estimatedRepairCostPaise: z.coerce.number().int().min(0),
        photos: z.array(z.string().trim()).default([]),
        isDisputed: z.boolean().default(false),
        disputeNotes: z.string().trim().max(500).optional(),
      })
    )
    .optional(),
});

const extensionRequestSchema = z.object({
  requestedEndTime: z.string().datetime().or(z.string().min(10)),
});

const cancelBookingSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const opsCancelBookingSchema = z.object({
  reason: z.string().trim().min(2).max(500),
  cancellationCategory: z.enum([
    'KYC_CORRECTION_TIMEOUT',
    'CUSTOMER_REQUESTED',
    'NO_SHOW',
    'OPERATIONS_DISCRETION',
    'VEHICLE_UNAVAILABLE',
    'PAYMENT_FAILED_OR_OVERDUE',
    'OTHER',
  ]).default('CUSTOMER_REQUESTED'),
  waiveCancellationFee: z.boolean().default(true),
  internalNotes: z.string().trim().max(1000).optional(),
});

const fleetCreateSchema = z.object({
  fleetNumber: z.string().trim().min(3).max(30).optional(),
  registrationNumber: z.string().trim().min(5).max(30),
  vin: z.string().trim().min(5).max(30),
  make: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(50),
  variant: z.string().trim().max(50).optional(),
  year: z.number().int().min(2010).max(new Date().getFullYear() + 1),
  transmission: z.enum(['MANUAL', 'AUTOMATIC']),
  fuelType: z.enum(['PETROL', 'DIESEL', 'EV', 'HYBRID', 'CNG']),
  seats: z.number().int().min(2).max(10).default(5),
  color: z.string().trim().min(2).max(40),
  hubId: uuid,
  images: z.array(z.string().trim()).optional().default([]),
  commercialPermitNumber: z.string().trim().min(3).optional(),
  commercialPermitExpiry: z.string().datetime().or(z.string().min(10)).optional(),
  insurancePolicyNumber: z.string().trim().min(3).optional(),
  insuranceExpiry: z.string().datetime().or(z.string().min(10)).optional(),
  fitnessCertExpiry: z.string().datetime().or(z.string().min(10)).optional(),
  baseDailyRatePaise: z.number().int().positive(),
  baseHourlyRatePaise: z.number().int().positive().optional(),
  securityDepositPaise: z.number().int().min(0).default(500000),
  includedKmPerDay: z.number().int().min(50).default(250).optional(),
  includedDailyKm: z.number().int().min(50).optional(),
  extraKmRatePaise: z.number().int().positive().default(1200).optional(),
  features: z.array(z.string().trim()).optional(),
});

const blockCreateSchema = z.object({
  reason: z.enum(['MAINTENANCE', 'CLEANING', 'OPERATIONAL_RESTRICTION', 'ACCIDENT_REPAIR', 'BUFFER']),
  startTime: z.string().datetime().or(z.string().min(10)),
  endTime: z.string().datetime().or(z.string().min(10)),
  notes: z.string().trim().max(500).optional(),
});

const refundAuthorizeSchema = z.object({
  refundPaise: z.number().int().positive(),
  bankReference: z.string().trim().min(3),
  notes: z.string().trim().max(500).optional(),
});

const recordOperationsPaymentSchema = z.object({
  type: z.enum(['RENTAL_PREPAYMENT', 'REFUNDABLE_DEPOSIT', 'EXTENSION_FEE', 'ADDITIONAL_CHARGES']).optional(),
  installmentType: z.enum(['ADVANCE', 'BALANCE', 'FULL', 'DEPOSIT', 'ADDITIONAL']).optional(),
  amountRupees: z.number().positive().optional(),
  amountPaise: z.union([z.string(), z.number()]).optional(),
  paymentMethod: z.string().trim().default('CASH'),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  autoVerify: z.boolean().default(true),
});

// -------------------------------------------------------------
// CUSTOMER RENTAL ROUTER
// -------------------------------------------------------------
export function createRentalCustomerRouter(deps: {
  verify: VerifyToken;
  store: PrismaRentalStore;
  db: PrismaClient;
}) {
  const router = Router();

  // Public: Search available rental cars
  router.get('/search', async (req, res, next) => {
    try {
      const filter = parse(searchFilterSchema, req.query);
      const isTest = req.headers['x-test-immediate-booking'] === 'true';
      const results = await deps.store.searchVehicles(filter as any, isTest);
      res.json(results);
    } catch (e) {
      next(e);
    }
  });

  // Public: Hubs list
  router.get('/hubs', async (_req, res, next) => {
    try {
      const hubs = await deps.db.serviceHub.findMany({
        where: {
          isActive: true,
          supportsRentals: true,
        },
        orderBy: { city: 'asc' },
      });
      res.json(hubs);
    } catch (e) {
      next(e);
    }
  });

  // Public: Vehicle details & quote
  router.get('/vehicles/:id', async (req, res, next) => {
    try {
      const id = uuid.parse(req.params.id);
      const startTime = typeof req.query.startTime === 'string' ? req.query.startTime : undefined;
      const endTime = typeof req.query.endTime === 'string' ? req.query.endTime : undefined;
      const isTest = req.headers['x-test-immediate-booking'] === 'true';
      const details = await deps.store.getVehicleDetails(id, startTime, endTime, isTest);
      res.json(details);
    } catch (e) {
      next(e);
    }
  });

  // Protected customer endpoints
  const authMiddleware = authentication(deps.verify);

  // Create temporary hold (15-min TTL)
  router.post('/holds', authMiddleware, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const userId = await deps.store.resolveUserId(identity.uid, identity);
      const input = parse(holdCreateSchema, req.body);
      const isTest = req.headers['x-test-immediate-booking'] === 'true';
      const hold = await deps.store.createHold(userId, input as any, isTest);
      res.status(201).json(hold);
    } catch (e) {
      next(e);
    }
  });

  // Convert hold to checkout booking
  router.post('/holds/:id/checkout', authMiddleware, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const userId = await deps.store.resolveUserId(identity.uid, identity);
      const holdId = uuid.parse(req.params.id);
      const input = parse(checkoutSchema, req.body);
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await deps.store.checkoutHold(userId, holdId, {
        ...input,
        ipAddress,
        userAgent,
      });
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  });

  // Verify payment & confirm booking
  router.post('/bookings/:id/verify-payment', authMiddleware, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const userId = await deps.store.resolveUserId(identity.uid, identity);
      const bookingId = uuid.parse(req.params.id);
      const input = parse(verifyPaymentSchema, req.body);
      const result = await deps.store.verifyPayment(userId, bookingId, input);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Get payment options for a hold or vehicle
  router.get('/holds/:id/payment-options', async (req, res, next) => {
    try {
      const holdId = uuid.parse(req.params.id);
      const options = await deps.store.getPaymentOptions(holdId);
      res.json(options);
    } catch (e) {
      next(e);
    }
  });

  router.get('/quotes/:id/payment-options', async (req, res, next) => {
    try {
      const quoteOrVehicleId = uuid.parse(req.params.id);
      const startTime = typeof req.query.startTime === 'string' ? req.query.startTime : undefined;
      const options = await deps.store.getPaymentOptions(quoteOrVehicleId, startTime);
      res.json(options);
    } catch (e) {
      next(e);
    }
  });

  // Get authoritative payment summary for a booking
  router.get('/bookings/:id/payment-summary', authMiddleware, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const userId = await deps.store.resolveUserId(identity.uid, identity);
      const bookingId = uuid.parse(req.params.id);
      const summary = await deps.store.getPaymentSummary(bookingId, userId);
      res.json(summary);
    } catch (e) {
      next(e);
    }
  });

  // Get itemized payment schedule (Advance, Balance, Deposit)
  router.get('/bookings/:id/payment-schedule', authMiddleware, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const userId = await deps.store.resolveUserId(identity.uid, identity);
      const bookingId = uuid.parse(req.params.id);
      const schedule = await deps.store.getPaymentSchedule(bookingId, userId);
      res.json(schedule);
    } catch (e) {
      next(e);
    }
  });

  // Create payment order for remaining rental balance
  router.post('/bookings/:id/pay-balance', authMiddleware, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const userId = await deps.store.resolveUserId(identity.uid, identity);
      const bookingId = uuid.parse(req.params.id);
      const order = await deps.store.createBalancePaymentOrder(userId, bookingId);
      res.status(201).json(order);
    } catch (e) {
      next(e);
    }
  });

  // Verify remaining balance payment
  router.post('/bookings/:id/verify-balance-payment', authMiddleware, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const userId = await deps.store.resolveUserId(identity.uid, identity);
      const bookingId = uuid.parse(req.params.id);
      const input = parse(verifyPaymentSchema, req.body);
      const result = await deps.store.verifyBalancePayment(userId, bookingId, input);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Payment transaction history
  router.get('/bookings/:id/payment-history', authMiddleware, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const userId = await deps.store.resolveUserId(identity.uid, identity);
      const bookingId = uuid.parse(req.params.id);
      const history = await deps.store.getPaymentHistory(bookingId, userId);
      res.json(history);
    } catch (e) {
      next(e);
    }
  });

  // Authoritative pickup readiness
  router.get('/bookings/:id/pickup-readiness', authMiddleware, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const userId = await deps.store.resolveUserId(identity.uid, identity);
      const bookingId = uuid.parse(req.params.id);
      const readiness = await deps.store.getPickupReadiness(bookingId, userId);
      res.json(readiness);
    } catch (e) {
      next(e);
    }
  });

  // Customer submit driver KYC
  router.post('/bookings/:id/driver-kyc', authMiddleware, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const userId = await deps.store.resolveUserId(identity.uid, identity);
      const bookingId = uuid.parse(req.params.id);
      const input = parse(driverKycSchema, req.body);
      const result = await deps.store.submitDriverKyc(userId, bookingId, input as any);
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  });

  // Customer list of bookings
  router.get('/bookings', authMiddleware, async (_req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const userId = await deps.store.resolveUserId(identity.uid, identity);
      const bookings = await deps.store.getCustomerRentals(userId);
      res.json(bookings);
    } catch (e) {
      next(e);
    }
  });

  // Customer single booking details
  router.get('/bookings/:id', authMiddleware, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const userId = await deps.store.resolveUserId(identity.uid, identity);
      const bookingId = uuid.parse(req.params.id);
      const booking = await deps.store.getBookingDetails(bookingId, userId);
      res.json(booking);
    } catch (e) {
      next(e);
    }
  });

  // Customer cancel booking
  router.post('/bookings/:id/cancel', authMiddleware, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const userId = await deps.store.resolveUserId(identity.uid, identity);
      const bookingId = uuid.parse(req.params.id);
      const input = parse(cancelBookingSchema, req.body);
      const result = await deps.store.cancelBooking(userId, bookingId, input.reason, false);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Customer request trip extension
  router.post('/bookings/:id/extension-requests', authMiddleware, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const userId = await deps.store.resolveUserId(identity.uid, identity);
      const bookingId = uuid.parse(req.params.id);
      const input = parse(extensionRequestSchema, req.body);
      const extension = await deps.store.requestExtension(userId, bookingId, input as any);
      res.status(201).json(extension);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

// -------------------------------------------------------------
// OPERATIONS RENTAL ROUTER
// -------------------------------------------------------------
export function createRentalOperationsRouter(deps: {
  verify: VerifyToken;
  store: PrismaRentalStore;
  db: PrismaClient;
}) {
  const router = Router();
  const authMiddleware = authentication(deps.verify);

  const requireRentalRole = (allowedRoles: EmployeeRole[]): RequestHandler => {
    return async (req, res, next) => {
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
          throw new HttpError(403, 'RENTAL_STAFF_ACCESS_DENIED');
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

  const ALL_RENTAL_STAFF: EmployeeRole[] = [
    'RENTAL_MANAGER',
    'RENTAL_DISPATCH',
    'RENTAL_FLEET_OFFICER',
    'OPERATIONS_MANAGER',
    'HUB_MANAGER',
    'FINANCE',
    'ADMIN',
    'SUPER_ADMIN',
  ];

  router.use(authMiddleware);

  // Operations summary metrics
  router.get('/summary', requireRentalRole(ALL_RENTAL_STAFF), async (_req, res, next) => {
    try {
      const summary = await deps.store.getOperationsSummary();
      res.json(summary);
    } catch (e) {
      next(e);
    }
  });

  // Fleet listing
  router.get('/fleet', requireRentalRole(ALL_RENTAL_STAFF), async (req, res, next) => {
    try {
      const hubId = typeof req.query.hubId === 'string' ? req.query.hubId : undefined;
      const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;
      const fleet = await deps.store.getFleet({ hubId, status });
      res.json(fleet);
    } catch (e) {
      next(e);
    }
  });

  // Get single fleet vehicle details
  router.get('/fleet/:id', requireRentalRole(ALL_RENTAL_STAFF), async (req, res, next) => {
    try {
      const vehicleId = uuid.parse(req.params.id);
      const vehicle = await deps.store.getFleetVehicle(vehicleId);
      if (!vehicle) {
        res.status(404).json({ code: 'VEHICLE_NOT_FOUND', message: 'Vehicle not found' });
        return;
      }
      res.json(vehicle);
    } catch (e) {
      next(e);
    }
  });

  // Add fleet vehicle
  router.post('/fleet', requireRentalRole(['RENTAL_MANAGER', 'ADMIN', 'SUPER_ADMIN']), async (req, res, next) => {
    try {
      const input = parse(fleetCreateSchema, req.body);
      const vehicle = await deps.store.createFleetVehicle(input as any);
      res.status(201).json(vehicle);
    } catch (e) {
      next(e);
    }
  });

  // Update fleet vehicle (eligibility, status, pricing)
  router.patch('/fleet/:id', requireRentalRole(ALL_RENTAL_STAFF), async (req, res, next) => {
    try {
      const vehicleId = uuid.parse(req.params.id);
      const vehicle = await deps.store.updateFleetVehicle(vehicleId, req.body);
      res.json(vehicle);
    } catch (e) {
      next(e);
    }
  });

  // Add vehicle block
  router.post('/fleet/:id/blocks', requireRentalRole(ALL_RENTAL_STAFF), async (req, res, next) => {
    try {
      const vehicleId = uuid.parse(req.params.id);
      const input = parse(blockCreateSchema, req.body);
      const employee = res.locals.employee;
      const block = await deps.store.addVehicleBlock(vehicleId, { ...input, createdById: employee.userId } as any);
      res.status(201).json(block);
    } catch (e) {
      next(e);
    }
  });

  // Release vehicle from maintenance to AVAILABLE
  router.post('/fleet/:id/release-maintenance', requireRentalRole(ALL_RENTAL_STAFF), async (req, res, next) => {
    try {
      const vehicleId = uuid.parse(req.params.id);
      const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
      const vehicle = await deps.store.releaseVehicleFromMaintenance(vehicleId, notes);
      res.json(vehicle);
    } catch (e) {
      next(e);
    }
  });

  // Release (end early) a specific vehicle block
  router.post('/fleet/:id/blocks/:blockId/release', requireRentalRole(ALL_RENTAL_STAFF), async (req, res, next) => {
    try {
      const vehicleId = uuid.parse(req.params.id);
      const blockId = uuid.parse(req.params.blockId);
      const result = await deps.store.releaseVehicleBlock(vehicleId, blockId);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Permanently delete an accidental vehicle block
  router.delete('/fleet/:id/blocks/:blockId', requireRentalRole(ALL_RENTAL_STAFF), async (req, res, next) => {
    try {
      const vehicleId = uuid.parse(req.params.id);
      const blockId = uuid.parse(req.params.blockId);
      const result = await deps.store.deleteVehicleBlock(vehicleId, blockId);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Delete fleet vehicle
  router.delete('/fleet/:id', requireRentalRole(['RENTAL_MANAGER', 'ADMIN', 'SUPER_ADMIN']), async (req, res, next) => {
    try {
      const vehicleId = uuid.parse(req.params.id);
      res.json(await deps.store.deleteFleetVehicle(vehicleId));
    } catch (e) {
      next(e);
    }
  });

  // Create walk-in / on-road booking at offline hub
  router.post('/walkin-booking', requireRentalRole(['RENTAL_MANAGER', 'RENTAL_DISPATCH', 'HUB_MANAGER', 'ADMIN', 'SUPER_ADMIN']), async (req, res, next) => {
    try {
      const input = parse(walkinRentalBookingSchema, req.body);
      const employee = res.locals.employee;
      const booking = await deps.store.createWalkInBooking(employee.userId, input as any);
      res.status(201).json(booking);
    } catch (e) {
      next(e);
    }
  });

  // Payment Dashboard summary widgets for operations (support both /dashboard/payments and /payment-dashboard)
  router.get(['/dashboard/payments', '/payment-dashboard'], requireRentalRole(ALL_RENTAL_STAFF), async (req, res, next) => {
    try {
      const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
      const dashboard = await deps.store.getOperationsPaymentDashboard(branchId);
      res.json(dashboard);
    } catch (e) {
      next(e);
    }
  });

  // Bookings list for operations with paymentStatus filter
  router.get('/bookings', requireRentalRole(ALL_RENTAL_STAFF), async (req, res, next) => {
    try {
      const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;
      const paymentStatus = typeof req.query.paymentStatus === 'string' ? req.query.paymentStatus : undefined;
      const hubId = typeof req.query.hubId === 'string' ? req.query.hubId : undefined;
      const bookings = await deps.store.getOperationsBookings({ status, paymentStatus, hubId });
      res.json(bookings);
    } catch (e) {
      next(e);
    }
  });

  // Payment summary for operations
  router.get('/bookings/:id/payment-summary', requireRentalRole(ALL_RENTAL_STAFF), async (req, res, next) => {
    try {
      const bookingId = uuid.parse(req.params.id);
      const summary = await deps.store.getPaymentSummary(bookingId, undefined, true);
      res.json(summary);
    } catch (e) {
      next(e);
    }
  });

  // Authoritative pickup readiness for operations
  router.get('/bookings/:id/pickup-readiness', requireRentalRole(ALL_RENTAL_STAFF), async (req, res, next) => {
    try {
      const bookingId = uuid.parse(req.params.id);
      const readiness = await deps.store.getPickupReadiness(bookingId);
      res.json(readiness);
    } catch (e) {
      next(e);
    }
  });

  // Detailed booking view
  router.get('/bookings/:id', requireRentalRole(ALL_RENTAL_STAFF), async (req, res, next) => {
    try {
      const bookingId = uuid.parse(req.params.id);
      const booking = await deps.store.getBookingDetails(bookingId);
      res.json(booking);
    } catch (e) {
      next(e);
    }
  });

  // Get booking payment schedule for operations panel
  router.get('/bookings/:id/payment-schedule', requireRentalRole(ALL_RENTAL_STAFF), async (req, res, next) => {
    try {
      const bookingId = uuid.parse(req.params.id);
      const schedule = await deps.store.getPaymentSchedule(bookingId);
      res.json(schedule);
    } catch (e) {
      next(e);
    }
  });

  // Get booking payment transactions history for operations panel
  router.get('/bookings/:id/payment-history', requireRentalRole(ALL_RENTAL_STAFF), async (req, res, next) => {
    try {
      const bookingId = uuid.parse(req.params.id);
      const history = await deps.store.getPaymentHistory(bookingId);
      res.json(history);
    } catch (e) {
      next(e);
    }
  });

  // Driver KYC review (Accepts either decision: 'APPROVE' | 'REJECT' or status: 'VERIFIED' | 'REJECTED')
  router.post('/bookings/:id/kyc/review', requireRentalRole(['RENTAL_MANAGER', 'RENTAL_DISPATCH', 'ADMIN', 'SUPER_ADMIN']), async (req, res, next) => {
    try {
      const bookingId = uuid.parse(req.params.id);
      const raw = req.body || {};
      let dec = raw.decision || raw.status;
      if (dec === 'VERIFIED') dec = 'APPROVE';
      if (dec === 'REJECTED') dec = 'REJECT';
      const normalizedBody = {
        decision: dec,
        rejectionReason: raw.rejectionReason,
      };
      const input = parse(kycReviewSchema, normalizedBody);
      const employee = res.locals.employee;
      const result = await deps.store.reviewDriverKyc(employee.userId, bookingId, input.decision, input.rejectionReason);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Upload or update physical driver KYC documents at hub
  router.post('/bookings/:id/kyc/documents', requireRentalRole(['RENTAL_MANAGER', 'RENTAL_DISPATCH', 'ADMIN', 'SUPER_ADMIN']), async (req, res, next) => {
    try {
      const bookingId = uuid.parse(req.params.id);
      const input = parse(driverKycSchema, req.body);
      const employee = res.locals.employee;
      const result = await deps.store.updateDriverKycDocuments(employee.userId, bookingId, {
        ...input,
        licenseExpiry: new Date(input.licenseExpiry),
        dateOfBirth: new Date(input.dateOfBirth),
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Pickup Handover (Strict KYC Gate checked inside store)
  router.post('/bookings/:id/handover', requireRentalRole(['RENTAL_DISPATCH', 'RENTAL_MANAGER', 'HUB_MANAGER', 'ADMIN', 'SUPER_ADMIN']), async (req, res, next) => {
    try {
      const bookingId = uuid.parse(req.params.id);
      const rawBody = (req.body || {}) as Record<string, any>;
      const normalizedBody = {
        odometerKm: rawBody.odometerKm,
        fuelPercent: rawBody.fuelPercent,
        photos: Array.isArray(rawBody.photos) && rawBody.photos.length > 0
          ? rawBody.photos
          : ['https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80'],
        notes: rawBody.notes || rawBody.conditionNotes || '',
        customerSigned: rawBody.customerSigned ?? rawBody.keyReleased ?? true,
      };
      const input = parse(handoverSchema, normalizedBody);
      const employee = res.locals.employee;
      const result = await deps.store.recordPickupHandover(employee.userId, bookingId, input);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Return Inspection & Settlement
  router.post('/bookings/:id/return', requireRentalRole(['RENTAL_DISPATCH', 'RENTAL_MANAGER', 'HUB_MANAGER', 'ADMIN', 'SUPER_ADMIN']), async (req, res, next) => {
    try {
      const bookingId = uuid.parse(req.params.id);
      const rawBody = (req.body || {}) as Record<string, any>;
      const normalizedBody = {
        returnOdometerKm: rawBody.returnOdometerKm ?? rawBody.odometerKm,
        returnFuelPercent: rawBody.returnFuelPercent ?? rawBody.fuelPercent,
        photos: Array.isArray(rawBody.photos) && rawBody.photos.length > 0
          ? rawBody.photos
          : ['https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80'],
        notes: rawBody.notes || rawBody.conditionNotes || '',
        customerSigned: rawBody.customerSigned ?? rawBody.keyReceived ?? true,
        damages: rawBody.damages,
      };
      const input = parse(returnSchema, normalizedBody);
      const employee = res.locals.employee;
      const result = await deps.store.recordReturnAndSettlement(employee.userId, bookingId, input);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Approve extension
  router.post('/extensions/:id/approve', requireRentalRole(['RENTAL_MANAGER', 'ADMIN', 'SUPER_ADMIN']), async (req, res, next) => {
    try {
      const extensionId = uuid.parse(req.params.id);
      const employee = res.locals.employee;
      const result = await deps.store.approveExtension(employee.userId, extensionId);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Authorize Deposit Refund (FINANCE or SUPER_ADMIN ONLY!)
  router.post('/bookings/:id/refund', requireRentalRole(['FINANCE', 'SUPER_ADMIN']), async (req, res, next) => {
    try {
      const bookingId = uuid.parse(req.params.id);
      const input = parse(refundAuthorizeSchema, req.body);
      const employee = res.locals.employee;
      const result = await deps.store.authorizeDepositRefund(employee.userId, bookingId, input);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Record counter / offline payment from operations
  router.post('/bookings/:id/record-payment', requireRentalRole(['RENTAL_MANAGER', 'RENTAL_DISPATCH', 'HUB_MANAGER', 'ADMIN', 'SUPER_ADMIN', 'FINANCE']), async (req, res, next) => {
    try {
      const bookingId = uuid.parse(req.params.id);
      const employee = res.locals.employee;
      const input = parse(recordOperationsPaymentSchema, req.body);
      const result = await deps.store.recordOperationsPayment(employee.userId, bookingId, input);
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  });

  // Operations manual cancel booking (e.g. no KYC correction received or customer requested cancellation)
  router.post('/bookings/:id/cancel', requireRentalRole(['RENTAL_MANAGER', 'RENTAL_DISPATCH', 'HUB_MANAGER', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN']), async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const employee = res.locals.employee;
      const actorId = employee?.userId || employee?.id || identity.uid;
      const bookingId = uuid.parse(req.params.id);
      const input = parse(opsCancelBookingSchema, req.body);
      const result = await deps.store.cancelBookingByOperations(actorId, bookingId, input);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

// -------------------------------------------------------------
// WEBHOOK ROUTER (Razorpay Idempotent Receiver)
// -------------------------------------------------------------
export function createRentalWebhookRouter(deps: {
  store: PrismaRentalStore;
  db: PrismaClient;
}) {
  const router = Router();

  router.post('/razorpay', async (req, res, next) => {
    try {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'dev_webhook_secret_key_12345';
      const signature = req.headers['x-razorpay-signature'] as string;

      if (!signature) {
        throw new HttpError(400, 'MISSING_WEBHOOK_SIGNATURE');
      }

      const bodyRaw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const expectedSignature = crypto.createHmac('sha256', secret).update(bodyRaw).digest('hex');

      if (signature !== expectedSignature && process.env.NODE_ENV === 'production') {
        throw new HttpError(400, 'INVALID_WEBHOOK_SIGNATURE');
      }

      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const event = payload.event;

      if (event === 'payment.captured' || event === 'order.paid') {
        const payment = payload.payload?.payment?.entity;
        const orderId = payment?.order_id;
        const paymentId = payment?.id;

        if (orderId && paymentId) {
          // Find matching booking
          const existingPayment = await deps.db.rentalPaymentRecord.findFirst({
            where: { gatewayOrderId: orderId },
            include: { booking: true },
          });

          if (existingPayment && existingPayment.booking) {
            await deps.store.verifyPayment(
              existingPayment.booking.customerId,
              existingPayment.booking.id,
              {
                gatewayOrderId: orderId,
                gatewayPaymentId: paymentId,
                gatewaySignature: signature,
              }
            );
          }
        }
      }

      res.json({ status: 'ok', received: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
