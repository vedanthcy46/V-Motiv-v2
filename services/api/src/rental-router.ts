import { Router, type RequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { authentication, type Identity, type VerifyToken } from './auth.js';
import { PrismaRentalStore } from './rental-store.js';
import { HttpError } from './errors.js';
import { PrismaClient, type EmployeeRole } from '@prisma/client';
import crypto from 'node:crypto';

const uuid = z.string().uuid();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('RENTAL_ROUTER_INVALID_INPUT', JSON.stringify(error.issues));
      throw new HttpError(400, 'INVALID_INPUT');
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
  startTime: z.string().datetime().or(z.string().min(10)),
  endTime: z.string().datetime().or(z.string().min(10)),
  fuelType: z.string().trim().max(30).optional(),
  transmission: z.string().trim().max(30).optional(),
  seats: z.coerce.number().int().min(2).max(12).optional(),
});

const holdCreateSchema = z.object({
  vehicleId: uuid,
  hubId: uuid,
  startTime: z.string().datetime().or(z.string().min(10)),
  endTime: z.string().datetime().or(z.string().min(10)),
});

const checkoutSchema = z.object({
  returnHubId: uuid.optional(),
  customerNotes: z.string().trim().max(1000).optional(),
  acceptTerms: z.literal(true),
  termsVersion: z.string().trim().default('VMR-TERMS-V2026.1'),
});

const verifyPaymentSchema = z.object({
  paymentGateway: z.string().trim().default('RAZORPAY'),
  gatewayOrderId: z.string().trim().min(3),
  gatewayPaymentId: z.string().trim().min(3),
  gatewaySignature: z.string().trim().min(3),
});

const driverKycSchema = z.object({
  licenseNumber: z.string().trim().min(5).max(30),
  licenseExpiry: z.string().datetime().or(z.string().min(10)),
  licenseCategory: z.string().trim().max(20).default('LMV'),
  dateOfBirth: z.string().datetime().or(z.string().min(10)),
  drivingExperienceYears: z.number().int().min(1).max(60),
  licenseFrontUrl: z.string().trim().min(5),
  licenseBackUrl: z.string().trim().min(5),
});

const kycReviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  rejectionReason: z.string().trim().max(500).optional(),
});

const walkinRentalBookingSchema = z.object({
  vehicleId: uuid,
  customerName: z.string().trim().min(2).max(100),
  customerPhone: z.string().trim().min(10).max(15),
  customerEmail: z.string().trim().email(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  licenseNumber: z.string().trim().min(5).max(30),
  licenseExpiry: z.coerce.date(),
  drivingExperienceYears: z.number().int().min(1).max(60).default(3),
  licenseFrontUrl: z.string().trim().min(5),
  licenseBackUrl: z.string().trim().min(5),
  paymentMethod: z.enum(['CASH', 'POS_CARD', 'UPI', 'NEFT', 'COUNTER']).default('UPI'),
  transactionReference: z.string().trim().max(100).optional(),
  startOdometerKm: z.number().int().min(0).optional(),
  fuelPercent: z.number().int().min(1).max(100).default(100),
  notes: z.string().trim().max(1000).optional(),
  immediateHandover: z.boolean().default(false),
});

const handoverSchema = z.object({
  odometerKm: z.number().int().min(0),
  fuelPercent: z.number().int().min(0).max(100),
  photos: z.array(z.string().trim().min(5)).min(1),
  notes: z.string().trim().max(1000).optional(),
  customerSigned: z.boolean(),
});

const returnSchema = z.object({
  returnOdometerKm: z.number().int().min(0),
  returnFuelPercent: z.number().int().min(0).max(100),
  photos: z.array(z.string().trim().min(5)).min(1),
  notes: z.string().trim().max(1000).optional(),
  customerSigned: z.boolean(),
  damages: z
    .array(
      z.object({
        description: z.string().trim().min(3).max(500),
        estimatedRepairCostPaise: z.number().int().min(0),
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
      const userId = await deps.store.resolveUserId(identity.uid);
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
      const userId = await deps.store.resolveUserId(identity.uid);
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
      const userId = await deps.store.resolveUserId(identity.uid);
      const bookingId = uuid.parse(req.params.id);
      const input = parse(verifyPaymentSchema, req.body);
      const result = await deps.store.verifyPayment(userId, bookingId, input);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Customer submit driver KYC
  router.post('/bookings/:id/driver-kyc', authMiddleware, async (req, res, next) => {
    try {
      const identity = res.locals.identity as Identity;
      const userId = await deps.store.resolveUserId(identity.uid);
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
      const userId = await deps.store.resolveUserId(identity.uid);
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
      const userId = await deps.store.resolveUserId(identity.uid);
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
      const userId = await deps.store.resolveUserId(identity.uid);
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
      const userId = await deps.store.resolveUserId(identity.uid);
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
      const booking = await deps.store.createWalkInBooking(employee.userId, input);
      res.status(201).json(booking);
    } catch (e) {
      next(e);
    }
  });

  // Bookings list for operations
  router.get('/bookings', requireRentalRole(ALL_RENTAL_STAFF), async (req, res, next) => {
    try {
      const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;
      const hubId = typeof req.query.hubId === 'string' ? req.query.hubId : undefined;
      const bookings = await deps.store.getOperationsBookings({ status, hubId });
      res.json(bookings);
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
      const input = parse(handoverSchema, req.body);
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
      const input = parse(returnSchema, req.body);
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
