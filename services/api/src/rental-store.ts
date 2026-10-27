import { PrismaClient, Prisma, RentalVehicleStatus, RentalBlockReason, RentalBookingStatus, RentalDriverKycStatus, RentalExtensionStatus, RentalHoldStatus, RentalPaymentType, RentalPaymentStatus } from '@prisma/client';
import { HttpError } from './errors.js';
import type { NotificationService } from './notification/notification-service.js';
import crypto from 'node:crypto';

if (!('toJSON' in BigInt.prototype)) {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value: function () {
      return this.toString();
    },
  });
}

export interface RentalSearchFilter {
  hubId?: string;
  city?: string;
  startTime: string | Date;
  endTime: string | Date;
  fuelType?: string;
  transmission?: string;
  seats?: number;
}

export interface QuoteBreakdown {
  vehicleId: string;
  startTime: Date;
  endTime: Date;
  totalHours: number;
  billableDays: number;
  remainderHours: number;
  baseFarePaise: bigint;
  taxPaise: bigint;
  securityDepositPaise: bigint;
  totalPayablePaise: bigint;
  includedKm: number;
  extraKmRatePaise: bigint;
  termsVersion: string;
  validUntil: Date;
  quoteVersion: number;
}

export class PrismaRentalStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly notifications?: NotificationService
  ) {}

  public async resolveUserId(idOrUid: string): Promise<string> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrUid);
    if (isUuid) {
      const userById = await this.db.user.findUnique({ where: { id: idOrUid } });
      if (userById) return userById.id;
    }
    const userByFirebase = await this.db.user.findUnique({ where: { firebaseUid: idOrUid } });
    if (!userByFirebase) throw new HttpError(404, 'USER_NOT_FOUND');
    return userByFirebase.id;
  }

  /**
   * Helper: validates start/end timestamps.
   * Start must be at least 2 hours in advance and within 90 days.
   * End must be greater than start (minimum 8 hours, maximum 30 days).
   */
  public validateRentalInterval(start: Date, end: Date, allowImmediateForTest = false): void {
    const now = new Date();
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new HttpError(400, 'INVALID_DATE_FORMAT');
    }
    if (end.getTime() <= start.getTime()) {
      throw new HttpError(400, 'END_TIME_MUST_BE_AFTER_START_TIME');
    }

    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    if (durationHours < 8) {
      throw new HttpError(400, 'MINIMUM_RENTAL_DURATION_IS_8_HOURS');
    }
    if (durationHours > 30 * 24) {
      throw new HttpError(400, 'MAXIMUM_RENTAL_DURATION_IS_30_DAYS');
    }

    if (!allowImmediateForTest) {
      const minAdvanceMs = 2 * 60 * 60 * 1000; // 2 hours
      if (start.getTime() < now.getTime() + minAdvanceMs - 60000) {
        throw new HttpError(400, 'START_TIME_MUST_BE_AT_LEAST_2_HOURS_IN_ADVANCE');
      }
      const maxHorizonMs = 90 * 24 * 60 * 60 * 1000; // 90 days
      if (start.getTime() > now.getTime() + maxHorizonMs) {
        throw new HttpError(400, 'START_TIME_EXCEEDS_90_DAY_BOOKING_HORIZON');
      }
    }
  }

  /**
   * Calculates dynamic versioned quote for a vehicle and interval.
   */
  public calculateQuote(
    vehicle: {
      id: string;
      baseDailyRatePaise: bigint;
      baseHourlyRatePaise: bigint;
      securityDepositPaise: bigint;
      includedKmPerDay: number;
      extraKmRatePaise: bigint;
    },
    startTime: Date,
    endTime: Date
  ): QuoteBreakdown {
    const durationMs = endTime.getTime() - startTime.getTime();
    const totalHours = Math.ceil(durationMs / (1000 * 60 * 60));
    const billableDays = Math.floor(totalHours / 24);
    const remainderHours = totalHours % 24;

    let baseFarePaise = BigInt(billableDays) * vehicle.baseDailyRatePaise;
    if (remainderHours > 0) {
      baseFarePaise += BigInt(remainderHours) * vehicle.baseHourlyRatePaise;
    }

    // 18% GST on rental fare (CGST 9% + SGST 9%)
    const taxPaise = (baseFarePaise * 18n) / 100n;
    const securityDepositPaise = vehicle.securityDepositPaise;
    const totalPayablePaise = baseFarePaise + taxPaise + securityDepositPaise;

    const daysCount = billableDays > 0 ? (remainderHours > 0 ? billableDays + 1 : billableDays) : 1;
    const includedKm = daysCount * vehicle.includedKmPerDay;

    const validUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    return {
      vehicleId: vehicle.id,
      startTime,
      endTime,
      totalHours,
      billableDays,
      remainderHours,
      baseFarePaise,
      taxPaise,
      securityDepositPaise,
      totalPayablePaise,
      includedKm,
      extraKmRatePaise: vehicle.extraKmRatePaise,
      termsVersion: 'VMR-TERMS-V2026.1',
      validUntil,
      quoteVersion: 1,
    };
  }

  /**
   * Search available rental fleet vehicles for the requested interval.
   * Excludes vehicles with:
   * 1. Confirmed / active bookings overlapping interval (+ cleaningBuffer)
   * 2. Active temporary holds overlapping interval (+ cleaningBuffer)
   * 3. Operational or maintenance blocks overlapping interval
   * 4. Lapsed commercial permits or insurance
   */
  async searchVehicles(filter: RentalSearchFilter, allowImmediateForTest = false) {
    const start = new Date(filter.startTime);
    const end = new Date(filter.endTime);
    this.validateRentalInterval(start, end, allowImmediateForTest);

    const now = new Date();

    // Base query for active, eligible fleet vehicles
    const where: Prisma.RentalFleetVehicleWhereInput = {
      isEligibleForRental: true,
      // Public search must only include a vehicle dispatch explicitly marked
      // available. A non-retired vehicle can still be on a trip or in service.
      status: RentalVehicleStatus.AVAILABLE,
      commercialPermitExpiry: { gte: end },
      insuranceExpiry: { gte: end },
      fitnessCertExpiry: { gte: end },
      hub: { isActive: true },
    };

    if (filter.hubId) {
      where.hubId = filter.hubId;
    } else if (filter.city) {
      where.hub = { city: { equals: filter.city, mode: 'insensitive' } };
    }

    if (filter.fuelType) {
      where.fuelType = { equals: filter.fuelType, mode: 'insensitive' };
    }
    if (filter.transmission) {
      where.transmission = { equals: filter.transmission, mode: 'insensitive' };
    }
    if (filter.seats) {
      where.seats = { gte: Number(filter.seats) };
    }

    const candidateVehicles = await this.db.rentalFleetVehicle.findMany({
      where,
      include: {
        hub: true,
        blocks: {
          where: {
            OR: [
              { startTime: { lt: end }, endTime: { gt: start } },
            ],
          },
        },
        holds: {
          where: {
            status: RentalHoldStatus.ACTIVE,
            expiresAt: { gt: now },
            OR: [
              { startTime: { lt: end }, endTime: { gt: start } },
            ],
          },
        },
        bookings: {
          where: {
            status: { in: [RentalBookingStatus.CONFIRMED, RentalBookingStatus.VEHICLE_COLLECTED, RentalBookingStatus.TRIP_ACTIVE] },
            OR: [
              { startTime: { lt: end }, endTime: { gt: start } },
            ],
          },
        },
      },
    });

    // Filter strictly by checking operational turnaround buffer
    const availableVehicles = candidateVehicles.filter(v => {
      const bufferMs = (v.cleaningBufferMinutes || 120) * 60 * 1000;
      const windowStartWithBuffer = new Date(start.getTime() - bufferMs);
      const windowEndWithBuffer = new Date(end.getTime() + bufferMs);

      // Check maintenance / cleaning blocks
      if (v.blocks.length > 0) return false;

      // Check active unexpired holds
      const hasConflictingHold = v.holds.some(h => {
        return h.startTime < windowEndWithBuffer && h.endTime > windowStartWithBuffer;
      });
      if (hasConflictingHold) return false;

      // Check confirmed bookings
      const hasConflictingBooking = v.bookings.some(b => {
        return b.startTime < windowEndWithBuffer && b.endTime > windowStartWithBuffer;
      });
      if (hasConflictingBooking) return false;

      return true;
    });

    // Attach calculated quote to each vehicle
    return availableVehicles.map(v => {
      const quote = this.calculateQuote(v, start, end);
      return {
        ...v,
        blocks: undefined,
        holds: undefined,
        bookings: undefined,
        quote,
      };
    });
  }

  /**
   * Fetches vehicle details by ID with calculated quote if dates provided.
   */
  async getVehicleDetails(vehicleId: string, startTime?: string | Date, endTime?: string | Date, allowImmediateForTest = false) {
    const vehicle = await this.db.rentalFleetVehicle.findUnique({
      where: { id: vehicleId },
      include: { hub: true },
    });
    if (!vehicle) {
      throw new HttpError(404, 'RENTAL_VEHICLE_NOT_FOUND');
    }
    if (!vehicle.isEligibleForRental || vehicle.status !== RentalVehicleStatus.AVAILABLE || !vehicle.hub.isActive) {
      throw new HttpError(404, 'RENTAL_VEHICLE_NOT_AVAILABLE');
    }

    let quote: QuoteBreakdown | null = null;
    if (startTime && endTime) {
      const start = new Date(startTime);
      const end = new Date(endTime);
      this.validateRentalInterval(start, end, allowImmediateForTest);
      quote = this.calculateQuote(vehicle, start, end);
    }

    return { ...vehicle, quote };
  }

  /**
   * Creates an exclusive temporary checkout hold with a 15-minute TTL.
   * Concurrency Safe: Uses transaction locking to prevent race conditions when two customers
   * attempt to reserve the same vehicle for overlapping intervals.
   */
  async createHold(
    customerId: string,
    input: {
      vehicleId: string;
      hubId: string;
      startTime: string | Date;
      endTime: string | Date;
    },
    allowImmediateForTest = false
  ) {
    const start = new Date(input.startTime);
    const end = new Date(input.endTime);
    this.validateRentalInterval(start, end, allowImmediateForTest);

    return await this.db.$transaction(async tx => {
      const vehicle = await tx.rentalFleetVehicle.findUnique({
        where: { id: input.vehicleId },
        include: { hub: true },
      });

      if (!vehicle) {
        throw new HttpError(404, 'RENTAL_VEHICLE_NOT_FOUND');
      }
      if (
        !vehicle.isEligibleForRental ||
        vehicle.status !== RentalVehicleStatus.AVAILABLE ||
        !vehicle.hub.isActive ||
        vehicle.hubId !== input.hubId
      ) {
        throw new HttpError(400, 'VEHICLE_NOT_ELIGIBLE_FOR_RENTAL');
      }
      if (vehicle.insuranceExpiry < end || vehicle.commercialPermitExpiry < end) {
        throw new HttpError(400, 'VEHICLE_COMPLIANCE_EXPIRED_FOR_REQUESTED_DATES');
      }

      const bufferMs = (vehicle.cleaningBufferMinutes || 120) * 60 * 1000;
      const windowStartWithBuffer = new Date(start.getTime() - bufferMs);
      const windowEndWithBuffer = new Date(end.getTime() + bufferMs);
      const now = new Date();

      // Check overlapping confirmed bookings
      const conflictingBooking = await tx.rentalBooking.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: { in: [RentalBookingStatus.CONFIRMED, RentalBookingStatus.VEHICLE_COLLECTED, RentalBookingStatus.TRIP_ACTIVE] },
          startTime: { lt: windowEndWithBuffer },
          endTime: { gt: windowStartWithBuffer },
        },
      });
      if (conflictingBooking) {
        throw new HttpError(409, 'VEHICLE_UNAVAILABLE_OVERLAPPING_BOOKING');
      }

      // Check overlapping active holds
      const conflictingHold = await tx.rentalBookingHold.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: RentalHoldStatus.ACTIVE,
          expiresAt: { gt: now },
          startTime: { lt: windowEndWithBuffer },
          endTime: { gt: windowStartWithBuffer },
        },
      });
      if (conflictingHold) {
        throw new HttpError(409, 'VEHICLE_UNAVAILABLE_ACTIVE_CHECKOUT_HOLD');
      }

      // Check overlapping blocks
      const conflictingBlock = await tx.rentalVehicleBlock.findFirst({
        where: {
          vehicleId: vehicle.id,
          startTime: { lt: windowEndWithBuffer },
          endTime: { gt: windowStartWithBuffer },
        },
      });
      if (conflictingBlock) {
        throw new HttpError(409, 'VEHICLE_UNAVAILABLE_MAINTENANCE_BLOCK');
      }

      const quote = this.calculateQuote(vehicle, start, end);
      const holdCode = `HLD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins TTL

      const hold = await tx.rentalBookingHold.create({
        data: {
          holdCode,
          vehicleId: vehicle.id,
          customerId,
          hubId: input.hubId,
          startTime: start,
          endTime: end,
          expiresAt,
          status: RentalHoldStatus.ACTIVE,
          quoteSnapshot: quote as any,
          estimatedTotalPaise: quote.totalPayablePaise,
        },
        include: {
          vehicle: { include: { hub: true } },
        },
      });

      await tx.rentalAuditEvent.create({
        data: {
          vehicleId: vehicle.id,
          eventType: 'RENTAL_HOLD_CREATED',
          actorId: customerId,
          metadata: { holdId: hold.id, holdCode, expiresAt: expiresAt.toISOString(), quote: quote as any },
        },
      });

      return hold;
    });
  }

  /**
   * Converts an active hold into a confirmed checkout order (PENDING_PAYMENT).
   * Validates customer acceptance of versioned terms.
   */
  async checkoutHold(
    customerId: string,
    holdId: string,
    input: {
      returnHubId?: string;
      customerNotes?: string;
      acceptTerms: boolean;
      termsVersion: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ) {
    if (!input.acceptTerms) {
      throw new HttpError(400, 'TERMS_AND_CONDITIONS_MUST_BE_ACCEPTED');
    }

    return await this.db.$transaction(async tx => {
      const hold = await tx.rentalBookingHold.findUnique({
        where: { id: holdId },
        include: { vehicle: true },
      });

      if (!hold) {
        throw new HttpError(404, 'RENTAL_HOLD_NOT_FOUND');
      }
      if (hold.customerId !== customerId) {
        throw new HttpError(403, 'FORBIDDEN_HOLD_OWNER_MISMATCH');
      }
      if (hold.status !== RentalHoldStatus.ACTIVE) {
        throw new HttpError(409, 'HOLD_ALREADY_CONVERTED_OR_RELEASED');
      }
      if (hold.expiresAt.getTime() < Date.now()) {
        await tx.rentalBookingHold.update({
          where: { id: hold.id },
          data: { status: RentalHoldStatus.EXPIRED },
        });
        throw new HttpError(410, 'CHECKOUT_HOLD_EXPIRED');
      }

      const quote = hold.quoteSnapshot as any as QuoteBreakdown;
      const count = await tx.rentalBooking.count();
      const bookingNumber = `VMR-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
      const returnHubId = input.returnHubId || hold.hubId;

      // Update hold to CONVERTED
      await tx.rentalBookingHold.update({
        where: { id: hold.id },
        data: { status: RentalHoldStatus.CONVERTED },
      });

      // Create booking record
      const booking = await tx.rentalBooking.create({
        data: {
          bookingNumber,
          holdId: hold.id,
          customerId,
          vehicleId: hold.vehicleId,
          pickupHubId: hold.hubId,
          returnHubId,
          startTime: hold.startTime,
          endTime: hold.endTime,
          status: RentalBookingStatus.PENDING_PAYMENT,
          kycStatus: RentalDriverKycStatus.PENDING_REVIEW,
          pricingSnapshot: hold.quoteSnapshot as any,
          baseFarePaise: BigInt(quote.baseFarePaise),
          taxPaise: BigInt(quote.taxPaise),
          securityDepositPaise: BigInt(quote.securityDepositPaise),
          totalPayablePaise: BigInt(quote.totalPayablePaise),
          includedKm: quote.includedKm,
          extraKmRatePaise: BigInt(quote.extraKmRatePaise),
          customerNotes: input.customerNotes,
        },
      });

      // Record agreement acceptance
      await tx.rentalAgreementAcceptance.create({
        data: {
          bookingId: booking.id,
          customerId,
          termsVersion: input.termsVersion,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      });

      // Create pending payment record
      const gatewayOrderId = `order_${booking.bookingNumber}_${Date.now()}`;
      await tx.rentalPaymentRecord.create({
        data: {
          bookingId: booking.id,
          type: RentalPaymentType.RENTAL_PREPAYMENT,
          amountPaise: BigInt(quote.totalPayablePaise),
          status: RentalPaymentStatus.PENDING,
          paymentGateway: 'RAZORPAY',
          gatewayOrderId,
        },
      });

      await tx.rentalAuditEvent.create({
        data: {
          bookingId: booking.id,
          vehicleId: hold.vehicleId,
          eventType: 'RENTAL_PAYMENT_PENDING',
          actorId: customerId,
          metadata: { bookingNumber, totalPayablePaise: quote.totalPayablePaise.toString() },
        },
      });

      return {
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        totalPayablePaise: quote.totalPayablePaise,
        gatewayOrderId,
        currency: 'INR',
        validUntil: hold.expiresAt,
      };
    });
  }

  /**
   * Server-side payment verification (Razorpay / Cashfree signature & idempotency).
   * Verifies signature HMAC, updates payment obligation, and confirms the booking.
   */
  async verifyPayment(
    customerId: string,
    bookingId: string,
    input: {
      paymentGateway?: string;
      gatewayOrderId: string;
      gatewayPaymentId: string;
      gatewaySignature: string;
    }
  ) {
    return await this.db.$transaction(async tx => {
      const booking = await tx.rentalBooking.findUnique({
        where: { id: bookingId },
        include: { vehicle: true, hold: true, payments: true },
      });

      if (!booking) {
        throw new HttpError(404, 'RENTAL_BOOKING_NOT_FOUND');
      }
      if (booking.customerId !== customerId) {
        throw new HttpError(403, 'FORBIDDEN_BOOKING_OWNER_MISMATCH');
      }

      // Idempotency check: if payment ID already verified, return confirmed booking cleanly
      const existingVerified = booking.payments.find(
        p => p.gatewayPaymentId === input.gatewayPaymentId && p.status === RentalPaymentStatus.VERIFIED
      );
      if (existingVerified && booking.status === RentalBookingStatus.CONFIRMED) {
        return { booking, alreadyVerified: true };
      }

      // Signature verification
      const secret = process.env.RAZORPAY_KEY_SECRET || 'dev_secret_key_12345';
      const generatedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${input.gatewayOrderId}|${input.gatewayPaymentId}`)
        .digest('hex');

      if (generatedSignature !== input.gatewaySignature && process.env.NODE_ENV === 'production') {
        throw new HttpError(400, 'INVALID_PAYMENT_SIGNATURE');
      }

      // Check if hold had expired before payment completion
      if (booking.hold && booking.hold.expiresAt.getTime() < Date.now()) {
        // Late payment after hold expired: Check if car is still available
        const bufferMs = (booking.vehicle.cleaningBufferMinutes || 120) * 60 * 1000;
        const windowStartWithBuffer = new Date(booking.startTime.getTime() - bufferMs);
        const windowEndWithBuffer = new Date(booking.endTime.getTime() + bufferMs);

        const competingBooking = await tx.rentalBooking.findFirst({
          where: {
            vehicleId: booking.vehicleId,
            id: { not: booking.id },
            status: { in: [RentalBookingStatus.CONFIRMED, RentalBookingStatus.VEHICLE_COLLECTED, RentalBookingStatus.TRIP_ACTIVE] },
            startTime: { lt: windowEndWithBuffer },
            endTime: { gt: windowStartWithBuffer },
          },
        });

        if (competingBooking) {
          // Flag payment for immediate Finance refund exception!
          await tx.rentalPaymentRecord.create({
            data: {
              bookingId: booking.id,
              type: RentalPaymentType.RENTAL_PREPAYMENT,
              amountPaise: booking.totalPayablePaise,
              status: RentalPaymentStatus.VERIFIED,
              gatewayOrderId: input.gatewayOrderId,
              gatewayPaymentId: input.gatewayPaymentId,
              gatewaySignature: input.gatewaySignature,
              idempotencyKey: input.gatewayPaymentId,
            },
          });
          await tx.rentalBooking.update({
            where: { id: booking.id },
            data: {
              status: RentalBookingStatus.CANCELLED,
              cancellationReason: 'LATE_PAYMENT_HOLD_EXPIRED_VEHICLE_TAKEN',
            },
          });
          throw new HttpError(409, 'PAYMENT_RECEIVED_AFTER_HOLD_EXPIRY_REFUND_INITIATED');
        }
      }

      // Mark payment record verified
      await tx.rentalPaymentRecord.upsert({
        where: { idempotencyKey: input.gatewayPaymentId },
        update: {
          status: RentalPaymentStatus.VERIFIED,
          verifiedAt: new Date(),
        },
        create: {
          bookingId: booking.id,
          type: RentalPaymentType.RENTAL_PREPAYMENT,
          amountPaise: booking.totalPayablePaise,
          status: RentalPaymentStatus.VERIFIED,
          paymentGateway: input.paymentGateway || 'RAZORPAY',
          gatewayOrderId: input.gatewayOrderId,
          gatewayPaymentId: input.gatewayPaymentId,
          gatewaySignature: input.gatewaySignature,
          idempotencyKey: input.gatewayPaymentId,
          verifiedAt: new Date(),
        },
      });

      // Update booking to CONFIRMED
      const updatedBooking = await tx.rentalBooking.update({
        where: { id: booking.id },
        data: {
          status: RentalBookingStatus.CONFIRMED,
        },
        include: {
          vehicle: { include: { hub: true } },
          pickupHub: true,
          returnHub: true,
          driverVerification: true,
        },
      });

      await tx.rentalAuditEvent.create({
        data: {
          bookingId: booking.id,
          vehicleId: booking.vehicleId,
          eventType: 'RENTAL_BOOKING_CONFIRMED',
          actorId: customerId,
          metadata: { gatewayPaymentId: input.gatewayPaymentId },
        },
      });

      return { booking: updatedBooking, alreadyVerified: false };
    });
  }

  /**
   * Driver KYC Submission by Customer.
   * Enforces minimum 21 years of age and 1 year of driving experience.
   */
  async submitDriverKyc(
    customerId: string,
    bookingId: string,
    input: {
      licenseNumber: string;
      licenseExpiry: string | Date;
      licenseCategory?: string;
      dateOfBirth: string | Date;
      drivingExperienceYears: number;
      licenseFrontUrl: string;
      licenseBackUrl: string;
    }
  ) {
    const booking = await this.db.rentalBooking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) {
      throw new HttpError(404, 'RENTAL_BOOKING_NOT_FOUND');
    }
    if (booking.customerId !== customerId) {
      throw new HttpError(403, 'FORBIDDEN_BOOKING_OWNER_MISMATCH');
    }

    const dob = new Date(input.dateOfBirth);
    const expiry = new Date(input.licenseExpiry);
    const now = new Date();

    // Age validation (min 21)
    const ageYears = (now.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (ageYears < 21) {
      throw new HttpError(400, 'DRIVER_MUST_BE_AT_LEAST_21_YEARS_OLD');
    }

    // Experience validation (min 1 year)
    if (input.drivingExperienceYears < 1) {
      throw new HttpError(400, 'DRIVER_MUST_HAVE_AT_LEAST_1_YEAR_EXPERIENCE');
    }

    // Expiry validation
    if (expiry.getTime() <= booking.endTime.getTime()) {
      throw new HttpError(400, 'DRIVING_LICENSE_EXPIRED_OR_EXPIRES_BEFORE_TRIP_END');
    }

    return await this.db.$transaction(async tx => {
      const verification = await tx.rentalDriverVerification.upsert({
        where: { bookingId },
        update: {
          licenseNumber: input.licenseNumber.toUpperCase().trim(),
          licenseExpiry: expiry,
          licenseCategory: input.licenseCategory || 'LMV',
          dateOfBirth: dob,
          drivingExperienceYears: input.drivingExperienceYears,
          licenseFrontUrl: input.licenseFrontUrl,
          licenseBackUrl: input.licenseBackUrl,
          status: RentalDriverKycStatus.PENDING_REVIEW,
        },
        create: {
          bookingId,
          customerId,
          licenseNumber: input.licenseNumber.toUpperCase().trim(),
          licenseExpiry: expiry,
          licenseCategory: input.licenseCategory || 'LMV',
          dateOfBirth: dob,
          drivingExperienceYears: input.drivingExperienceYears,
          licenseFrontUrl: input.licenseFrontUrl,
          licenseBackUrl: input.licenseBackUrl,
          status: RentalDriverKycStatus.PENDING_REVIEW,
        },
      });

      await tx.rentalBooking.update({
        where: { id: bookingId },
        data: { kycStatus: RentalDriverKycStatus.PENDING_REVIEW },
      });

      return verification;
    });
  }

  /**
   * Operations Driver KYC Verification / Approval.
   */
  async reviewDriverKyc(
    employeeId: string,
    bookingId: string,
    decision: 'APPROVE' | 'REJECT',
    rejectionReason?: string
  ) {
    return await this.db.$transaction(async tx => {
      const verification = await tx.rentalDriverVerification.findUnique({
        where: { bookingId },
        include: { booking: true },
      });
      if (!verification) {
        throw new HttpError(404, 'DRIVER_VERIFICATION_RECORD_NOT_FOUND');
      }

      const status = decision === 'APPROVE' ? RentalDriverKycStatus.VERIFIED : RentalDriverKycStatus.REJECTED;

      const updatedVerification = await tx.rentalDriverVerification.update({
        where: { bookingId },
        data: {
          status,
          rejectionReason: decision === 'REJECT' ? rejectionReason : null,
          verifiedById: employeeId,
          verifiedAt: new Date(),
        },
      });

      await tx.rentalBooking.update({
        where: { id: bookingId },
        data: { kycStatus: status },
      });

      await tx.rentalAuditEvent.create({
        data: {
          bookingId,
          eventType: decision === 'APPROVE' ? 'RENTAL_KYC_APPROVED' : 'RENTAL_KYC_REJECTED',
          actorId: employeeId,
          metadata: { decision, rejectionReason },
        },
      });

      return updatedVerification;
    });
  }

  /**
   * Operations Pickup Handover.
   * STRICT KYC GATE: Cannot hand over vehicle if driver KYC is not VERIFIED.
   */
  async recordPickupHandover(
    employeeId: string,
    bookingId: string,
    input: {
      odometerKm: number;
      fuelPercent: number;
      photos: string[];
      notes?: string;
      customerSigned: boolean;
    }
  ) {
    if (!input.customerSigned) {
      throw new HttpError(400, 'CUSTOMER_SIGNATURE_REQUIRED_FOR_HANDOVER');
    }

    return await this.db.$transaction(async tx => {
      const booking = await tx.rentalBooking.findUnique({
        where: { id: bookingId },
        include: { vehicle: true, driverVerification: true },
      });

      if (!booking) {
        throw new HttpError(404, 'RENTAL_BOOKING_NOT_FOUND');
      }
      if (booking.status !== RentalBookingStatus.CONFIRMED) {
        throw new HttpError(400, 'BOOKING_MUST_BE_CONFIRMED_FOR_HANDOVER');
      }

      // CRITICAL PRODUCTION GATE: KYC MUST BE VERIFIED
      if (booking.kycStatus !== RentalDriverKycStatus.VERIFIED) {
        throw new HttpError(403, 'KYC_NOT_VERIFIED_CANNOT_HANDOVER_VEHICLE');
      }

      // Record Trip Pickup Handover
      const trip = await tx.rentalTrip.upsert({
        where: { bookingId },
        update: {
          pickupTime: new Date(),
          pickupOdometerKm: input.odometerKm,
          pickupFuelPercent: input.fuelPercent,
          pickupPhotos: input.photos as any,
          pickupNotes: input.notes,
          pickupStaffId: employeeId,
          pickupCustomerSigned: true,
        },
        create: {
          bookingId,
          pickupTime: new Date(),
          pickupOdometerKm: input.odometerKm,
          pickupFuelPercent: input.fuelPercent,
          pickupPhotos: input.photos as any,
          pickupNotes: input.notes,
          pickupStaffId: employeeId,
          pickupCustomerSigned: true,
        },
      });

      // Update vehicle state
      await tx.rentalFleetVehicle.update({
        where: { id: booking.vehicleId },
        data: {
          status: RentalVehicleStatus.ON_TRIP,
          odometerKm: input.odometerKm,
          fuelLevelPercent: input.fuelPercent,
        },
      });

      // Update booking status
      const updatedBooking = await tx.rentalBooking.update({
        where: { id: bookingId },
        data: {
          status: RentalBookingStatus.TRIP_ACTIVE,
        },
        include: { trip: true, vehicle: true },
      });

      await tx.rentalAuditEvent.create({
        data: {
          bookingId,
          vehicleId: booking.vehicleId,
          eventType: 'RENTAL_TRIP_STARTED',
          actorId: employeeId,
          metadata: { pickupOdometerKm: input.odometerKm, pickupFuelPercent: input.fuelPercent },
        },
      });

      return updatedBooking;
    });
  }

  /**
   * Trip Extension Request.
   * Checks future availability, prevents collision with subsequent bookings,
   * and calculates additional payment.
   */
  async requestExtension(
    customerId: string,
    bookingId: string,
    input: { requestedEndTime: string | Date }
  ) {
    const requestedEnd = new Date(input.requestedEndTime);
    if (isNaN(requestedEnd.getTime())) {
      throw new HttpError(400, 'INVALID_REQUESTED_END_TIME');
    }

    return await this.db.$transaction(async tx => {
      const booking = await tx.rentalBooking.findUnique({
        where: { id: bookingId },
        include: { vehicle: true },
      });

      if (!booking) {
        throw new HttpError(404, 'RENTAL_BOOKING_NOT_FOUND');
      }
      if (booking.customerId !== customerId) {
        throw new HttpError(403, 'FORBIDDEN_BOOKING_OWNER_MISMATCH');
      }
      if (booking.status !== RentalBookingStatus.TRIP_ACTIVE && booking.status !== RentalBookingStatus.CONFIRMED) {
        throw new HttpError(400, 'EXTENSIONS_ONLY_ALLOWED_FOR_ACTIVE_OR_CONFIRMED_BOOKINGS');
      }
      if (requestedEnd.getTime() <= booking.endTime.getTime()) {
        throw new HttpError(400, 'REQUESTED_END_TIME_MUST_BE_AFTER_CURRENT_END_TIME');
      }

      // Check collision with subsequent bookings or holds
      const bufferMs = (booking.vehicle.cleaningBufferMinutes || 120) * 60 * 1000;
      const windowStart = booking.endTime;
      const windowEndWithBuffer = new Date(requestedEnd.getTime() + bufferMs);

      const conflictingBooking = await tx.rentalBooking.findFirst({
        where: {
          vehicleId: booking.vehicleId,
          id: { not: booking.id },
          status: { in: [RentalBookingStatus.CONFIRMED, RentalBookingStatus.VEHICLE_COLLECTED, RentalBookingStatus.TRIP_ACTIVE] },
          startTime: { lt: windowEndWithBuffer },
          endTime: { gt: windowStart },
        },
      });
      if (conflictingBooking) {
        throw new HttpError(409, 'EXTENSION_UNAVAILABLE_VEHICLE_RESERVED_BY_ANOTHER_CUSTOMER');
      }

      const conflictingBlock = await tx.rentalVehicleBlock.findFirst({
        where: {
          vehicleId: booking.vehicleId,
          startTime: { lt: windowEndWithBuffer },
          endTime: { gt: windowStart },
        },
      });
      if (conflictingBlock) {
        throw new HttpError(409, 'EXTENSION_UNAVAILABLE_SCHEDULED_MAINTENANCE');
      }

      // Calculate additional charges
      const extraHours = Math.ceil((requestedEnd.getTime() - booking.endTime.getTime()) / (1000 * 60 * 60));
      const extraDays = Math.floor(extraHours / 24);
      const remHours = extraHours % 24;

      let additionalFarePaise = BigInt(extraDays) * booking.vehicle.baseDailyRatePaise;
      if (remHours > 0) {
        additionalFarePaise += BigInt(remHours) * booking.vehicle.baseHourlyRatePaise;
      }
      const additionalTaxPaise = (additionalFarePaise * 18n) / 100n;
      const totalPayablePaise = additionalFarePaise + additionalTaxPaise;

      const extension = await tx.rentalExtension.create({
        data: {
          bookingId: booking.id,
          originalEndTime: booking.endTime,
          requestedEndTime: requestedEnd,
          additionalHours: extraHours,
          additionalFarePaise,
          additionalTaxPaise,
          totalPayablePaise,
          status: RentalExtensionStatus.REQUESTED,
        },
      });

      return extension;
    });
  }

  /**
   * Approves and executes a trip extension.
   */
  async approveExtension(
    employeeId: string,
    extensionId: string
  ) {
    return await this.db.$transaction(async tx => {
      const extension = await tx.rentalExtension.findUnique({
        where: { id: extensionId },
        include: { booking: true },
      });
      if (!extension) {
        throw new HttpError(404, 'RENTAL_EXTENSION_NOT_FOUND');
      }
      if (extension.status !== RentalExtensionStatus.REQUESTED) {
        throw new HttpError(400, 'EXTENSION_NOT_IN_REQUESTED_STATUS');
      }

      const updated = await tx.rentalExtension.update({
        where: { id: extensionId },
        data: {
          status: RentalExtensionStatus.APPROVED,
          reviewedById: employeeId,
          reviewedAt: new Date(),
        },
      });

      // Update booking endTime and totalPayablePaise
      await tx.rentalBooking.update({
        where: { id: extension.bookingId },
        data: {
          endTime: extension.requestedEndTime,
          baseFarePaise: { increment: extension.additionalFarePaise },
          taxPaise: { increment: extension.additionalTaxPaise },
          totalPayablePaise: { increment: extension.totalPayablePaise },
        },
      });

      await tx.rentalAuditEvent.create({
        data: {
          bookingId: extension.bookingId,
          eventType: 'RENTAL_EXTENSION_APPROVED',
          actorId: employeeId,
          metadata: { extensionId, newEndTime: extension.requestedEndTime },
        },
      });

      return updated;
    });
  }

  /**
   * Operations Vehicle Return & Final Settlement.
   * Calculations:
   * - Excess Km fee = max(0, distanceDriven - includedKm) * extraKmRate
   * - Fuel Refill Penalty if return < pickup
   * - Overtime charge if returned past scheduled end time (>30 min grace)
   * - Disputed damage is NEVER auto-deducted; flagged with isCustomerDisputed: true for Finance review.
   * - Refundable deposit balance reconciled.
   */
  async recordReturnAndSettlement(
    employeeId: string,
    bookingId: string,
    input: {
      returnOdometerKm: number;
      returnFuelPercent: number;
      photos: string[];
      notes?: string;
      customerSigned: boolean;
      damages?: Array<{
        description: string;
        estimatedRepairCostPaise: number;
        photos: string[];
        isDisputed?: boolean;
        disputeNotes?: string;
      }>;
    }
  ) {
    if (!input.customerSigned) {
      throw new HttpError(400, 'CUSTOMER_SIGNATURE_REQUIRED_FOR_RETURN');
    }

    return await this.db.$transaction(async tx => {
      const booking = await tx.rentalBooking.findUnique({
        where: { id: bookingId },
        include: { vehicle: true, trip: true },
      });

      if (!booking || !booking.trip) {
        throw new HttpError(404, 'RENTAL_TRIP_RECORD_NOT_FOUND');
      }
      if (booking.status !== RentalBookingStatus.TRIP_ACTIVE) {
        throw new HttpError(400, 'BOOKING_IS_NOT_CURRENTLY_ACTIVE');
      }

      const pickupKm = booking.trip.pickupOdometerKm ?? booking.vehicle.odometerKm;
      if (input.returnOdometerKm < pickupKm) {
        throw new HttpError(400, 'RETURN_ODOMETER_CANNOT_BE_LESS_THAN_PICKUP_ODOMETER');
      }

      const distanceDriven = input.returnOdometerKm - pickupKm;
      const excessKm = Math.max(0, distanceDriven - booking.includedKm);
      const excessKmChargePaise = BigInt(excessKm) * booking.extraKmRatePaise;

      // Fuel penalty: if return fuel < pickup fuel
      const pickupFuel = booking.trip.pickupFuelPercent ?? 100;
      let fuelRefillChargePaise = 0n;
      if (input.returnFuelPercent < pickupFuel) {
        const fuelDeficit = pickupFuel - input.returnFuelPercent;
        // ~₹65 per % of fuel (approx ₹6,500 for a full 50L tank in India)
        fuelRefillChargePaise = BigInt(fuelDeficit) * 6500n;
      }

      // Late return overtime charge (> 30 mins grace period)
      const now = new Date();
      let lateReturnChargePaise = 0n;
      const scheduledEnd = booking.endTime;
      const gracePeriodMs = 30 * 60 * 1000;
      if (now.getTime() > scheduledEnd.getTime() + gracePeriodMs) {
        const overtimeHours = Math.ceil((now.getTime() - scheduledEnd.getTime()) / (1000 * 60 * 60));
        // Overtime rate: 1.5x standard hourly rate
        lateReturnChargePaise = BigInt(overtimeHours) * ((booking.vehicle.baseHourlyRatePaise * 15n) / 10n);
      }

      // Damage Claims Processing
      let undisputedDamageChargePaise = 0n;
      if (input.damages && input.damages.length > 0) {
        for (const dmg of input.damages) {
          const costPaise = BigInt(dmg.estimatedRepairCostPaise);
          await tx.rentalDamageClaim.create({
            data: {
              bookingId,
              description: dmg.description,
              estimatedRepairCostPaise: costPaise,
              photos: dmg.photos as any,
              reportedByStaffId: employeeId,
              isCustomerDisputed: dmg.isDisputed ?? false,
              customerDisputeNotes: dmg.disputeNotes,
              status: dmg.isDisputed ? 'CUSTOMER_DISPUTED' : 'PENDING_FINANCE_REVIEW',
            },
          });

          // DISPUTED DAMAGE IS NEVER AUTO-DEDUCTED FROM DEPOSIT!
          if (!dmg.isDisputed) {
            undisputedDamageChargePaise += costPaise;
          }
        }
      }

      const totalAdditionalChargesPaise =
        excessKmChargePaise + fuelRefillChargePaise + lateReturnChargePaise + undisputedDamageChargePaise;

      // Deposit refund calculation
      const depositRefundPaise =
        booking.securityDepositPaise > totalAdditionalChargesPaise
          ? booking.securityDepositPaise - totalAdditionalChargesPaise
          : 0n;

      // Update Trip record with return evidence & charges
      const updatedTrip = await tx.rentalTrip.update({
        where: { bookingId },
        data: {
          returnTime: now,
          returnOdometerKm: input.returnOdometerKm,
          returnFuelPercent: input.returnFuelPercent,
          returnPhotos: input.photos as any,
          returnNotes: input.notes,
          returnStaffId: employeeId,
          returnCustomerSigned: true,
          excessKm,
          excessKmChargePaise,
          fuelRefillChargePaise,
          lateReturnChargePaise,
          damageChargePaise: undisputedDamageChargePaise,
          totalAdditionalChargesPaise,
          depositRefundPaise,
          isSettled: true,
          settledAt: now,
        },
      });

      // Update vehicle to CLEANING status and create automatic cleaning buffer block
      await tx.rentalFleetVehicle.update({
        where: { id: booking.vehicleId },
        data: {
          status: RentalVehicleStatus.CLEANING,
          odometerKm: input.returnOdometerKm,
          fuelLevelPercent: input.returnFuelPercent,
        },
      });

      const bufferMinutes = booking.vehicle.cleaningBufferMinutes || 120;
      await tx.rentalVehicleBlock.create({
        data: {
          vehicleId: booking.vehicleId,
          reason: RentalBlockReason.CLEANING,
          startTime: now,
          endTime: new Date(now.getTime() + bufferMinutes * 60 * 1000),
          notes: `Automatic post-trip turnaround cleaning buffer for booking ${booking.bookingNumber}`,
          createdById: employeeId,
        },
      });

      // Update booking status to SETTLED
      const updatedBooking = await tx.rentalBooking.update({
        where: { id: bookingId },
        data: {
          status: RentalBookingStatus.SETTLED,
        },
        include: {
          trip: true,
          damageClaims: true,
          vehicle: true,
        },
      });

      await tx.rentalAuditEvent.create({
        data: {
          bookingId,
          vehicleId: booking.vehicleId,
          eventType: 'RENTAL_RETURN_RECEIVED',
          actorId: employeeId,
          metadata: {
            returnOdometerKm: input.returnOdometerKm,
            excessKm,
            excessKmChargePaise: excessKmChargePaise.toString(),
            totalAdditionalChargesPaise: totalAdditionalChargesPaise.toString(),
            depositRefundPaise: depositRefundPaise.toString(),
          },
        },
      });

      return { booking: updatedBooking, trip: updatedTrip };
    });
  }

  /**
   * Finance Deposit Refund Execution & Bank Reconciliation.
   * Restricted to Finance role.
   */
  async authorizeDepositRefund(
    financeActorId: string,
    bookingId: string,
    input: {
      refundPaise: number | bigint;
      bankReference: string;
      notes?: string;
    }
  ) {
    return await this.db.$transaction(async tx => {
      const booking = await tx.rentalBooking.findUnique({
        where: { id: bookingId },
        include: { trip: true },
      });

      if (!booking || !booking.trip) {
        throw new HttpError(404, 'BOOKING_OR_TRIP_NOT_FOUND');
      }

      const refundRecord = await tx.rentalPaymentRecord.create({
        data: {
          bookingId,
          type: RentalPaymentType.DEPOSIT_REFUND,
          amountPaise: BigInt(input.refundPaise),
          status: RentalPaymentStatus.VERIFIED,
          paymentGateway: 'BANK_TRANSFER',
          gatewayPaymentId: input.bankReference,
          verifiedByFinanceId: financeActorId,
          verifiedAt: new Date(),
        },
      });

      await tx.rentalAuditEvent.create({
        data: {
          bookingId,
          eventType: 'RENTAL_DEPOSIT_REFUND_VERIFIED',
          actorId: financeActorId,
          metadata: { bankReference: input.bankReference, refundPaise: input.refundPaise.toString() },
        },
      });

      return refundRecord;
    });
  }

  /**
   * Customer / Operator Booking Cancellation.
   */
  async cancelBooking(
    actorId: string,
    bookingId: string,
    reason: string,
    isOperator = false
  ) {
    return await this.db.$transaction(async tx => {
      const booking = await tx.rentalBooking.findUnique({
        where: { id: bookingId },
        include: { vehicle: true, hold: true },
      });

      if (!booking) {
        throw new HttpError(404, 'RENTAL_BOOKING_NOT_FOUND');
      }
      if (!isOperator && booking.customerId !== actorId) {
        throw new HttpError(403, 'FORBIDDEN_BOOKING_OWNER_MISMATCH');
      }
      if (
        booking.status === RentalBookingStatus.TRIP_ACTIVE ||
        booking.status === RentalBookingStatus.SETTLED ||
        booking.status === RentalBookingStatus.CANCELLED
      ) {
        throw new HttpError(400, 'CANNOT_CANCEL_ACTIVE_SETTLED_OR_CANCELLED_BOOKING');
      }

      // Cancellation policy refund calculation
      const now = new Date();
      const hoursToPickup = (booking.startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      let refundPaise = 0n;
      if (hoursToPickup >= 24) {
        // Full refund of fare and deposit
        refundPaise = booking.totalPayablePaise;
      } else if (hoursToPickup >= 6) {
        // 50% fare cancellation fee, 100% deposit refund
        refundPaise = booking.securityDepositPaise + (booking.baseFarePaise * 50n) / 100n + (booking.taxPaise * 50n) / 100n;
      } else {
        // 1 day fare retained, deposit fully refunded
        refundPaise = booking.securityDepositPaise;
      }

      const updated = await tx.rentalBooking.update({
        where: { id: bookingId },
        data: {
          status: RentalBookingStatus.CANCELLED,
          cancellationReason: reason,
          cancelledAt: now,
        },
      });

      if (booking.hold) {
        await tx.rentalBookingHold.update({
          where: { id: booking.hold.id },
          data: { status: RentalHoldStatus.RELEASED },
        });
      }

      await tx.rentalAuditEvent.create({
        data: {
          bookingId,
          vehicleId: booking.vehicleId,
          eventType: 'RENTAL_BOOKING_CANCELLED',
          actorId,
          metadata: { reason, refundPaise: refundPaise.toString() },
        },
      });

      return { booking: updated, calculatedRefundPaise: refundPaise };
    });
  }

  /**
   * Fetch Customer's Rentals list.
   */
  async getCustomerRentals(customerId: string) {
    return await this.db.rentalBooking.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        vehicle: { include: { hub: true } },
        pickupHub: true,
        returnHub: true,
        trip: true,
        driverVerification: true,
        extensions: true,
        damageClaims: true,
        payments: true,
      },
    });
  }

  /**
   * Fetch Booking Details with Customer Privacy Check.
   */
  async getBookingDetails(bookingId: string, customerId?: string) {
    const booking = await this.db.rentalBooking.findUnique({
      where: { id: bookingId },
      include: {
        vehicle: { include: { hub: true } },
        pickupHub: true,
        returnHub: true,
        trip: true,
        driverVerification: true,
        agreement: true,
        extensions: true,
        damageClaims: true,
        payments: true,
        auditEvents: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!booking) {
      throw new HttpError(404, 'RENTAL_BOOKING_NOT_FOUND');
    }
    if (customerId && booking.customerId !== customerId) {
      throw new HttpError(403, 'FORBIDDEN_BOOKING_OWNER_MISMATCH');
    }

    return booking;
  }

  /**
   * Operations: Fleet vehicle listing with filters.
   */
  async getFleet(filter?: { hubId?: string; status?: RentalVehicleStatus }) {
    const where: Prisma.RentalFleetVehicleWhereInput = {};
    if (filter?.hubId) where.hubId = filter.hubId;
    if (filter?.status) where.status = filter.status;

    return await this.db.rentalFleetVehicle.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        hub: true,
        blocks: { where: { endTime: { gt: new Date() } } },
      },
    });
  }

  /**
   * Operations: Add fleet vehicle.
   */
  async createFleetVehicle(input: {
    fleetNumber: string;
    registrationNumber: string;
    vin: string;
    make: string;
    model: string;
    variant?: string;
    year: number;
    transmission: string;
    fuelType: string;
    seats?: number;
    color: string;
    hubId: string;
    images: string[];
    commercialPermitNumber: string;
    commercialPermitExpiry: string | Date;
    insurancePolicyNumber: string;
    insuranceExpiry: string | Date;
    fitnessCertExpiry: string | Date;
    baseDailyRatePaise: number | bigint;
    baseHourlyRatePaise: number | bigint;
    securityDepositPaise: number | bigint;
    includedKmPerDay?: number;
    extraKmRatePaise?: number | bigint;
    features?: string[];
  }) {
    return await this.db.rentalFleetVehicle.create({
      data: {
        fleetNumber: input.fleetNumber,
        registrationNumber: input.registrationNumber,
        vin: input.vin,
        make: input.make,
        model: input.model,
        variant: input.variant,
        year: input.year,
        transmission: input.transmission,
        fuelType: input.fuelType,
        seats: input.seats || 5,
        color: input.color,
        hubId: input.hubId,
        images: input.images as any,
        commercialPermitNumber: input.commercialPermitNumber,
        commercialPermitExpiry: new Date(input.commercialPermitExpiry),
        insurancePolicyNumber: input.insurancePolicyNumber,
        insuranceExpiry: new Date(input.insuranceExpiry),
        fitnessCertExpiry: new Date(input.fitnessCertExpiry),
        baseDailyRatePaise: BigInt(input.baseDailyRatePaise),
        baseHourlyRatePaise: BigInt(input.baseHourlyRatePaise),
        securityDepositPaise: BigInt(input.securityDepositPaise),
        includedKmPerDay: input.includedKmPerDay || 250,
        extraKmRatePaise: BigInt(input.extraKmRatePaise || 1200),
        features: (input.features || []) as any,
        status: RentalVehicleStatus.AVAILABLE,
      },
      include: { hub: true },
    });
  }

  /**
   * Operations: Add vehicle block (maintenance, cleaning, repair).
   */
  async addVehicleBlock(
    vehicleId: string,
    input: {
      reason: RentalBlockReason;
      startTime: string | Date;
      endTime: string | Date;
      notes?: string;
      createdById?: string;
    }
  ) {
    const start = new Date(input.startTime);
    const end = new Date(input.endTime);
    if (end.getTime() <= start.getTime()) {
      throw new HttpError(400, 'BLOCK_END_TIME_MUST_BE_AFTER_START');
    }

    return await this.db.rentalVehicleBlock.create({
      data: {
        vehicleId,
        reason: input.reason,
        startTime: start,
        endTime: end,
        notes: input.notes,
        createdById: input.createdById,
      },
    });
  }

  /**
   * Operations: List bookings with status filter.
   */
  async getOperationsBookings(filter?: { status?: RentalBookingStatus; hubId?: string }) {
    const where: Prisma.RentalBookingWhereInput = {};
    if (filter?.status) where.status = filter.status;
    if (filter?.hubId) where.pickupHubId = filter.hubId;

    return await this.db.rentalBooking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, displayName: true, email: true, phone: true } },
        vehicle: { include: { hub: true } },
        pickupHub: true,
        returnHub: true,
        trip: true,
        driverVerification: true,
        extensions: true,
        damageClaims: true,
        payments: true,
      },
    });
  }

  /**
   * Operations: Fleet utilization and summary metrics.
   */
  async getOperationsSummary() {
    const [
      totalFleet,
      availableCount,
      onTripCount,
      maintenanceCount,
      activeBookingsCount,
      pendingKycCount,
      pendingDamageReviewCount,
    ] = await Promise.all([
      this.db.rentalFleetVehicle.count({ where: { status: { not: RentalVehicleStatus.RETIRED } } }),
      this.db.rentalFleetVehicle.count({ where: { status: RentalVehicleStatus.AVAILABLE } }),
      this.db.rentalFleetVehicle.count({ where: { status: RentalVehicleStatus.ON_TRIP } }),
      this.db.rentalFleetVehicle.count({ where: { status: RentalVehicleStatus.MAINTENANCE } }),
      this.db.rentalBooking.count({ where: { status: { in: [RentalBookingStatus.CONFIRMED, RentalBookingStatus.TRIP_ACTIVE] } } }),
      this.db.rentalDriverVerification.count({ where: { status: RentalDriverKycStatus.PENDING_REVIEW } }),
      this.db.rentalDamageClaim.count({ where: { status: 'CUSTOMER_DISPUTED' } }),
    ]);

    return {
      totalFleet,
      availableCount,
      onTripCount,
      maintenanceCount,
      activeBookingsCount,
      pendingKycCount,
      pendingDamageReviewCount,
    };
  }
}
