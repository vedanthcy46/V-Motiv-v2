import { PrismaClient, Prisma, RentalVehicleStatus, RentalBlockReason, RentalBookingStatus, RentalDriverKycStatus, RentalExtensionStatus, RentalHoldStatus, RentalPaymentType, RentalPaymentStatus } from '@prisma/client';
import { canonicalMakeModel } from './vehicle-names.js';
import { gstOn, rentalGstPercent } from './rental-pricing.js';
import { HttpError } from './errors.js';
import { requireAdultDateOfBirth, requireDrivingExperience, requireLicenseNumber, requireLicensePhotos } from './rental-kyc.js';
import { assertGatewayPaymentSignature } from './payment-signature.js';
import { assertCapturedAmount } from './razorpay-gateway.js';
import { resolveWalkInCustomer } from './walk-in-customer.js';
import { computeAvailability, type RentalAvailability } from './rental-availability.js';
import { resolveKmPolicy, type KmPolicyHub } from './rental-km-policy.js';
import type { NotificationService } from './notification/notification-service.js';
import crypto from 'node:crypto';
import { currentCalendarYear } from './calendar.js';

if (!('toJSON' in BigInt.prototype)) {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value: function () {
      return this.toString();
    },
  });
}

const AVAILABILITY_QUERY_PADDING_MS = 24 * 60 * 60 * 1000;

export interface RentalSearchFilter {
  hubId?: string;
  city?: string;
  startTime: string | Date;
  endTime: string | Date;
  fuelType?: string;
  transmission?: string;
  seats?: number;
  /** Also return vehicles that cannot be booked for these dates, flagged via `availability`. */
  includeUnavailable?: boolean | string;
}

export interface RentalPaymentPlanConfig {
  planId: 'FULL_100' | 'ADVANCE_25' | 'ADVANCE_50';
  name: string;
  type: 'FULL' | 'PARTIAL';
  advancePercent: number;
  minNoticeHours: number;
}

export interface RentalPaymentPolicyConfig {
  version: string;
  name: string;
  isActive: boolean;
  isApproved: boolean;
  allowPartialMoreThanHours: number;
  allowPartialWindowHours: number;
  requireFullWithinHours: number;
  balanceDueHoursBeforePickup: number;
  plans: RentalPaymentPlanConfig[];
}

export const DEFAULT_RENTAL_PAYMENT_POLICY: RentalPaymentPolicyConfig = {
  version: 'VMR-POL-2026.1',
  name: 'Standard Advance & Full Payment Policy 2026.1',
  isActive: true,
  isApproved: true,
  allowPartialMoreThanHours: 72,
  allowPartialWindowHours: 24,
  requireFullWithinHours: 24,
  balanceDueHoursBeforePickup: 24,
  plans: [
    {
      planId: 'ADVANCE_25',
      name: 'Pay 25% Advance',
      type: 'PARTIAL',
      advancePercent: 25,
      minNoticeHours: 72,
    },
    {
      planId: 'ADVANCE_50',
      name: 'Pay 50% Advance',
      type: 'PARTIAL',
      advancePercent: 50,
      minNoticeHours: 24,
    },
    {
      planId: 'FULL_100',
      name: 'Pay 100% in Full',
      type: 'FULL',
      advancePercent: 100,
      minNoticeHours: 0,
    },
  ],
};

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

/** Whether a booking still owes its refundable security deposit (collected at the counter, never in the app). */
export function depositStillDue(booking: { securityDepositPaise?: bigint | number | string | null; depositStatus?: string | null }): boolean {
  if (booking.securityDepositPaise === undefined || booking.securityDepositPaise === null) return false;
  let required = 0n;
  try { required = BigInt(booking.securityDepositPaise); } catch { return false; }
  if (required <= 0n) return false;
  return !['HELD_ESCROW', 'COLLECTED'].includes(String(booking.depositStatus ?? ''));
}

export class PrismaRentalStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly notifications?: NotificationService
  ) {}

  public async resolveUserId(idOrUid: string, identity?: { email?: string; name?: string }): Promise<string> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrUid);
    if (isUuid) {
      const userById = await this.db.user.findUnique({ where: { id: idOrUid } });
      if (userById) return userById.id;
    }
    let userByFirebase = await this.db.user.findUnique({ where: { firebaseUid: idOrUid } });
    if (!userByFirebase) {
      if (identity?.email) {
        userByFirebase = await this.db.user.create({
          data: {
            firebaseUid: idOrUid,
            email: identity.email.toLowerCase().trim(),
            displayName: identity.name?.trim() || null,
          },
        });
      } else {
        userByFirebase = await this.db.user.create({
          data: {
            firebaseUid: idOrUid,
            email: `${idOrUid.toLowerCase().slice(0, 16)}@customer.vmotiv.in`,
            displayName: 'Valued Customer',
          },
        });
      }
    }
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
      /** When the vehicle's hub is loaded, the hub's km policy (set by an administrator) wins. */
      hub?: KmPolicyHub | null;
    },
    startTime: Date,
    endTime: Date
  ): QuoteBreakdown {
    const km = resolveKmPolicy(vehicle, vehicle.hub);
    const durationMs = endTime.getTime() - startTime.getTime();
    const totalHours = Math.ceil(durationMs / (1000 * 60 * 60));
    const billableDays = Math.floor(totalHours / 24);
    const remainderHours = totalHours % 24;

    let baseFarePaise = BigInt(billableDays) * vehicle.baseDailyRatePaise;
    if (remainderHours > 0) {
      baseFarePaise += BigInt(remainderHours) * vehicle.baseHourlyRatePaise;
    }

    // GST on the rental fare (rate: rental-pricing.ts)
    const taxPaise = gstOn(baseFarePaise);
    const securityDepositPaise = vehicle.securityDepositPaise;
    const totalPayablePaise = baseFarePaise + taxPaise + securityDepositPaise;

    const daysCount = billableDays > 0 ? (remainderHours > 0 ? billableDays + 1 : billableDays) : 1;
    const includedKm = daysCount * km.includedKmPerDay;

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
      extraKmRatePaise: km.extraKmRatePaise,
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

    // Base query for eligible fleet vehicles. Vehicles that are busy for the requested dates are still
    // loaded so the app can show WHY (on hold / booked / in trip / maintenance) instead of hiding them.
    const where: Prisma.RentalFleetVehicleWhereInput = {
      isEligibleForRental: true,
      status: { not: RentalVehicleStatus.RETIRED },
      // A document with no date on file is allowed (compliance details are optional); one that is on file must cover the trip.
      AND: [
        { OR: [{ commercialPermitExpiry: null }, { commercialPermitExpiry: { gte: end } }] },
        { OR: [{ insuranceExpiry: null }, { insuranceExpiry: { gte: end } }] },
        { OR: [{ fitnessCertExpiry: null }, { fitnessCertExpiry: { gte: end } }] },
      ],
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

    // Query a day either side of the window; the exact per-vehicle turnaround buffer is applied below.
    const queryStart = new Date(start.getTime() - AVAILABILITY_QUERY_PADDING_MS);
    const queryEnd = new Date(end.getTime() + AVAILABILITY_QUERY_PADDING_MS);

    const candidateVehicles = await this.db.rentalFleetVehicle.findMany({
      where,
      include: {
        hub: true,
        blocks: { where: { startTime: { lt: queryEnd }, endTime: { gt: queryStart } } },
        holds: {
          where: {
            status: RentalHoldStatus.ACTIVE,
            expiresAt: { gt: now },
            startTime: { lt: queryEnd },
            endTime: { gt: queryStart },
          },
        },
        bookings: {
          where: {
            OR: [
              {
                status: { in: [RentalBookingStatus.CONFIRMED, RentalBookingStatus.PENDING_PAYMENT] },
                startTime: { lt: queryEnd },
                endTime: { gt: queryStart },
              },
              // Cars currently out stay occupied even if the trip is overdue.
              {
                status: { in: [RentalBookingStatus.VEHICLE_COLLECTED, RentalBookingStatus.TRIP_ACTIVE] },
                startTime: { lt: queryEnd },
              },
            ],
          },
          include: { hold: { select: { expiresAt: true } } },
        },
      },
    });

    const withAvailability = candidateVehicles.map(v => ({
      vehicle: v,
      availability: this.availabilityFor(v, start, end, now),
    }));

    const includeUnavailable = filter.includeUnavailable === true || filter.includeUnavailable === 'true';
    return withAvailability
      .filter(x => includeUnavailable || x.availability.bookable)
      .sort((a, b) => Number(b.availability.bookable) - Number(a.availability.bookable))
      .map(({ vehicle: v, availability }) => ({
        ...v,
        blocks: undefined,
        holds: undefined,
        bookings: undefined,
        quote: this.calculateQuote(v, start, end),
        availability,
        ...this.effectiveKmFields(v),
      }));
  }

  /**
   * Availability of many vehicles for one interval, with three bounded queries (no per-vehicle N+1).
   * Works with the base client or a transaction client.
   */
  private async loadAvailabilityFor(
    client: Prisma.TransactionClient | PrismaClient,
    vehicles: Array<{ id: string; status: string; cleaningBufferMinutes: number | null }>,
    start: Date,
    end: Date,
    now = new Date(),
  ): Promise<Map<string, RentalAvailability>> {
    const result = new Map<string, RentalAvailability>();
    if (vehicles.length === 0) return result;
    const ids = vehicles.map(v => v.id);
    const queryStart = new Date(start.getTime() - AVAILABILITY_QUERY_PADDING_MS);
    const queryEnd = new Date(end.getTime() + AVAILABILITY_QUERY_PADDING_MS);
    const [blocks, holds, bookings] = await Promise.all([
      client.rentalVehicleBlock.findMany({ where: { vehicleId: { in: ids }, startTime: { lt: queryEnd }, endTime: { gt: queryStart } } }),
      client.rentalBookingHold.findMany({
        where: { vehicleId: { in: ids }, status: RentalHoldStatus.ACTIVE, expiresAt: { gt: now }, startTime: { lt: queryEnd }, endTime: { gt: queryStart } },
      }),
      client.rentalBooking.findMany({
        where: {
          vehicleId: { in: ids },
          OR: [
            { status: { in: [RentalBookingStatus.CONFIRMED, RentalBookingStatus.PENDING_PAYMENT] }, startTime: { lt: queryEnd }, endTime: { gt: queryStart } },
            { status: { in: [RentalBookingStatus.VEHICLE_COLLECTED, RentalBookingStatus.TRIP_ACTIVE] }, startTime: { lt: queryEnd } },
          ],
        },
        include: { hold: { select: { expiresAt: true } } },
      }),
    ]);
    for (const v of vehicles) {
      result.set(
        v.id,
        this.availabilityFor(
          {
            status: v.status,
            cleaningBufferMinutes: v.cleaningBufferMinutes,
            blocks: blocks.filter(b => b.vehicleId === v.id),
            holds: holds.filter(h => h.vehicleId === v.id),
            bookings: bookings.filter(b => b.vehicleId === v.id),
          },
          start,
          end,
          now,
        ),
      );
    }
    return result;
  }

  /** The km allowance and excess rate customers and staff should see for this vehicle (hub policy first). */
  private effectiveKmFields(v: { includedKmPerDay: number; extraKmRatePaise: bigint; hub?: KmPolicyHub | null }) {
    const km = resolveKmPolicy(v, v.hub);
    return {
      includedKmPerDay: km.includedKmPerDay,
      extraKmRatePaise: km.extraKmRatePaise,
      kmPolicySource: km.source,
    };
  }

  /** Availability of one vehicle (with its blocks/holds/bookings loaded) for a requested interval. */
  private availabilityFor(
    v: {
      status: string;
      cleaningBufferMinutes: number | null;
      blocks: Array<{ startTime: Date; endTime: Date; reason: string }>;
      holds: Array<{ startTime: Date; endTime: Date; expiresAt: Date; status: string }>;
      bookings: Array<{ startTime: Date; endTime: Date; status: string; hold?: { expiresAt: Date } | null }>;
    },
    start: Date,
    end: Date,
    now: Date,
  ): RentalAvailability {
    return computeAvailability({
      start,
      end,
      now,
      bufferMinutes: v.cleaningBufferMinutes || 120,
      vehicleStatus: v.status,
      blocks: v.blocks,
      holds: v.holds,
      bookings: v.bookings.map(b => ({
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        holdExpiresAt: b.hold?.expiresAt ?? null,
      })),
    });
  }

  /**
   * Fetches vehicle details by ID with calculated quote if dates provided.
   */
  async getVehicleDetails(vehicleId: string, startTime?: string | Date, endTime?: string | Date, allowImmediateForTest = false) {
    const now = new Date();
    const hasDates = Boolean(startTime && endTime);
    const rangeStart = hasDates ? new Date(startTime as string | Date) : null;
    const rangeEnd = hasDates ? new Date(endTime as string | Date) : null;
    const queryStart = rangeStart ? new Date(rangeStart.getTime() - AVAILABILITY_QUERY_PADDING_MS) : now;
    const queryEnd = rangeEnd ? new Date(rangeEnd.getTime() + AVAILABILITY_QUERY_PADDING_MS) : now;

    const vehicle = await this.db.rentalFleetVehicle.findUnique({
      where: { id: vehicleId },
      include: {
        hub: true,
        blocks: { where: { startTime: { lt: queryEnd }, endTime: { gt: queryStart } } },
        holds: { where: { status: RentalHoldStatus.ACTIVE, expiresAt: { gt: now }, startTime: { lt: queryEnd }, endTime: { gt: queryStart } } },
        bookings: {
          where: {
            OR: [
              { status: { in: [RentalBookingStatus.CONFIRMED, RentalBookingStatus.PENDING_PAYMENT] }, startTime: { lt: queryEnd }, endTime: { gt: queryStart } },
              { status: { in: [RentalBookingStatus.VEHICLE_COLLECTED, RentalBookingStatus.TRIP_ACTIVE] }, startTime: { lt: queryEnd } },
            ],
          },
          include: { hold: { select: { expiresAt: true } } },
        },
      },
    });
    if (!vehicle) {
      throw new HttpError(404, 'RENTAL_VEHICLE_NOT_FOUND');
    }
    // A busy car is still viewable (the response says why); only ineligible/retired cars are hidden.
    if (!vehicle.isEligibleForRental || vehicle.status === RentalVehicleStatus.RETIRED || !vehicle.hub.isActive) {
      throw new HttpError(404, 'RENTAL_VEHICLE_NOT_AVAILABLE');
    }

    let quote: QuoteBreakdown | null = null;
    let availability: RentalAvailability | null = null;
    if (rangeStart && rangeEnd) {
      this.validateRentalInterval(rangeStart, rangeEnd, allowImmediateForTest);
      quote = this.calculateQuote(vehicle, rangeStart, rangeEnd);
      availability = this.availabilityFor(vehicle, rangeStart, rangeEnd, now);
    }

    const { blocks: _blocks, holds: _holds, bookings: _bookings, ...publicVehicle } = vehicle;
    return { ...publicVehicle, quote, availability, ...this.effectiveKmFields(vehicle) };
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
      hubId?: string;
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
      if (!vehicle.isEligibleForRental || vehicle.status === RentalVehicleStatus.RETIRED || !vehicle.hub.isActive) {
        throw new HttpError(400, 'VEHICLE_NOT_ELIGIBLE_FOR_RENTAL');
      }
      if ((vehicle.insuranceExpiry && vehicle.insuranceExpiry < end) || (vehicle.commercialPermitExpiry && vehicle.commercialPermitExpiry < end)) {
        throw new HttpError(400, 'VEHICLE_COMPLIANCE_EXPIRED_FOR_REQUESTED_DATES');
      }

      // Serialize competing checkouts for the same car so two customers cannot both pass the
      // availability check for overlapping dates. Best effort: never block booking if unsupported.
      try {
        await tx.$queryRaw`SELECT id FROM "RentalFleetVehicle" WHERE id = ${vehicle.id}::uuid FOR UPDATE`;
      } catch (lockErr) {
        console.warn('[RENTAL_HOLD_LOCK_UNAVAILABLE]', (lockErr as Error)?.message);
      }

      const now = new Date();
      const queryStart = new Date(start.getTime() - AVAILABILITY_QUERY_PADDING_MS);
      const queryEnd = new Date(end.getTime() + AVAILABILITY_QUERY_PADDING_MS);
      const [blocks, holds, bookings] = await Promise.all([
        tx.rentalVehicleBlock.findMany({ where: { vehicleId: vehicle.id, startTime: { lt: queryEnd }, endTime: { gt: queryStart } } }),
        tx.rentalBookingHold.findMany({
          where: { vehicleId: vehicle.id, status: RentalHoldStatus.ACTIVE, expiresAt: { gt: now }, startTime: { lt: queryEnd }, endTime: { gt: queryStart } },
        }),
        tx.rentalBooking.findMany({
          where: {
            vehicleId: vehicle.id,
            OR: [
              { status: { in: [RentalBookingStatus.CONFIRMED, RentalBookingStatus.PENDING_PAYMENT] }, startTime: { lt: queryEnd }, endTime: { gt: queryStart } },
              { status: { in: [RentalBookingStatus.VEHICLE_COLLECTED, RentalBookingStatus.TRIP_ACTIVE] }, startTime: { lt: queryEnd } },
            ],
          },
          include: { hold: { select: { expiresAt: true } } },
        }),
      ]);
      const availability = this.availabilityFor({ ...vehicle, blocks, holds, bookings }, start, end, now);
      if (!availability.bookable) {
        const code =
          availability.state === 'ON_HOLD'
            ? 'VEHICLE_UNAVAILABLE_ACTIVE_CHECKOUT_HOLD'
            : availability.state === 'MAINTENANCE' || availability.state === 'CLEANING'
              ? 'VEHICLE_UNAVAILABLE_MAINTENANCE_BLOCK'
              : 'VEHICLE_UNAVAILABLE_OVERLAPPING_BOOKING';
        throw new HttpError(409, code, availability.label);
      }

      const quote = this.calculateQuote(vehicle, start, end);
      const holdCode = `HLD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins TTL
      const effectiveHubId = vehicle.hubId || input.hubId || vehicle.hub?.id;

      const hold = await tx.rentalBookingHold.create({
        data: {
          holdCode,
          vehicleId: vehicle.id,
          customerId,
          hubId: effectiveHubId,
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
      paymentPlanId?: 'FULL_100' | 'ADVANCE_25' | 'ADVANCE_50';
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
      const bookingNumber = `VMR-${currentCalendarYear()}-${String(count + 1).padStart(5, '0')}`;
      const returnHubId = input.returnHubId || hold.hubId;

      // Calculate authoritative payment obligations
      const totalRentalPaise = BigInt(quote.baseFarePaise) + BigInt(quote.taxPaise);
      const securityDepositPaise = BigInt(quote.securityDepositPaise);
      const requestedPlanId = input.paymentPlanId || 'FULL_100';
      const hoursToPickup = (hold.startTime.getTime() - Date.now()) / (1000 * 60 * 60);

      let advancePercent = 100;
      let planType = 'FULL';
      let planName = 'Pay 100% in Full';
      let balanceDueAt: Date | null = null;

      if (requestedPlanId === 'ADVANCE_25') {
        if (hoursToPickup <= 72) {
          throw new HttpError(400, 'ADVANCE_25_PLAN_ONLY_AVAILABLE_MORE_THAN_72_HOURS_BEFORE_PICKUP');
        }
        advancePercent = 25;
        planType = 'PARTIAL';
        planName = 'Pay 25% Advance';
        balanceDueAt = new Date(hold.startTime.getTime() - 24 * 60 * 60 * 1000);
      } else if (requestedPlanId === 'ADVANCE_50') {
        if (hoursToPickup <= 24) {
          throw new HttpError(400, 'ADVANCE_50_PLAN_ONLY_AVAILABLE_MORE_THAN_24_HOURS_BEFORE_PICKUP');
        }
        advancePercent = 50;
        planType = 'PARTIAL';
        planName = 'Pay 50% Advance';
        balanceDueAt = new Date(hold.startTime.getTime() - 24 * 60 * 60 * 1000);
      } else {
        advancePercent = 100;
        planType = 'FULL';
        planName = 'Pay 100% in Full';
        balanceDueAt = null;
      }

      const advancePaise = (totalRentalPaise * BigInt(advancePercent)) / 100n;
      const balancePaise = totalRentalPaise - advancePaise;
      const initialPaymentDuePaise = advancePaise;

      const paymentPlanSnapshot = {
        planId: requestedPlanId,
        type: planType,
        name: planName,
        advancePercent,
        rentalTotalPaise: totalRentalPaise.toString(),
        advancePaise: advancePaise.toString(),
        balancePaise: balancePaise.toString(),
        securityDepositPaise: securityDepositPaise.toString(),
        initialPaymentDuePaise: initialPaymentDuePaise.toString(),
        balanceDueAt: balanceDueAt ? balanceDueAt.toISOString() : null,
        policyVersion: 'VMR-POL-2026.1',
      };

      // Update hold to CONVERTED
      await tx.rentalBookingHold.update({
        where: { id: hold.id },
        data: { status: RentalHoldStatus.CONVERTED },
      });

      // Create booking record with payment schedule snapshot
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
          paymentPlanSnapshot: paymentPlanSnapshot as any,
          rentalPaymentStatus: 'NOT_PAID',
          depositStatus: 'NOT_COLLECTED',
          balanceDueAt,
          verifiedPaidPaise: 0n,
          outstandingBalancePaise: totalRentalPaise,
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

      // Create initial installment payment order
      const gatewayOrderId = `order_${booking.bookingNumber}_${Date.now()}`;
      await tx.rentalPaymentRecord.create({
        data: {
          bookingId: booking.id,
          type: RentalPaymentType.RENTAL_PREPAYMENT,
          installmentType: planType === 'PARTIAL' ? 'ADVANCE' : 'FULL',
          amountPaise: initialPaymentDuePaise,
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
          metadata: {
            bookingNumber,
            planId: requestedPlanId,
            advancePaise: advancePaise.toString(),
            balancePaise: balancePaise.toString(),
            totalRentalPaise: totalRentalPaise.toString(),
          },
        },
      });

      return {
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        totalPayablePaise: quote.totalPayablePaise,
        rentalTotalPaise: totalRentalPaise.toString(),
        initialPaymentDuePaise: initialPaymentDuePaise.toString(),
        paymentPlan: paymentPlanSnapshot,
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
      assertGatewayPaymentSignature(input);

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

      // Mark payment record verified - update existing pending order or upsert
      const existingPending = await tx.rentalPaymentRecord.findFirst({
        where: {
          bookingId: booking.id,
          OR: [
            { gatewayOrderId: input.gatewayOrderId },
            { status: RentalPaymentStatus.PENDING },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existingPending) {
        await tx.rentalPaymentRecord.update({
          where: { id: existingPending.id },
          data: {
            status: RentalPaymentStatus.VERIFIED,
            gatewayOrderId: input.gatewayOrderId,
            gatewayPaymentId: input.gatewayPaymentId,
            gatewaySignature: input.gatewaySignature,
            idempotencyKey: input.gatewayPaymentId,
            verifiedAt: new Date(),
          },
        });
      } else {
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
      }

      // Determine partial vs full payment allocation
      const isPartial = booking.paymentPlanSnapshot && (booking.paymentPlanSnapshot as any).type === 'PARTIAL';
      const advancePaise = isPartial
        ? BigInt((booking.paymentPlanSnapshot as any).advancePaise || 0)
        : (booking.baseFarePaise + booking.taxPaise);
      const balancePaise = isPartial
        ? BigInt((booking.paymentPlanSnapshot as any).balancePaise || 0)
        : 0n;
      const nextRentalPaymentStatus = isPartial ? 'PARTIALLY_PAID' : 'PAID_IN_FULL';
      await assertCapturedAmount(input, advancePaise);

      // Update booking to CONFIRMED
      const updatedBooking = await tx.rentalBooking.update({
        where: { id: booking.id },
        data: {
          status: RentalBookingStatus.CONFIRMED,
          rentalPaymentStatus: nextRentalPaymentStatus,
          verifiedPaidPaise: advancePaise,
          outstandingBalancePaise: balancePaise,
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

      // Transactional Email & Notification
      const customer = await tx.user.findUnique({
        where: { id: customerId },
        select: { id: true, email: true, displayName: true, phone: true },
      });
      if (customer?.email) {
        const vehicleTitle = `${updatedBooking.vehicle.year} ${updatedBooking.vehicle.make} ${updatedBooking.vehicle.model} ${updatedBooking.vehicle.variant || ''}`.trim();
        const hubName = updatedBooking.pickupHub?.name || updatedBooking.vehicle.hub?.name || 'Local Hub';
        const startStr = updatedBooking.startTime.toISOString().replace('T', ' ').slice(0, 16);
        const endStr = updatedBooking.endTime.toISOString().replace('T', ' ').slice(0, 16);
        const fareStr = `₹${(Number(updatedBooking.baseFarePaise) / 100).toLocaleString('en-IN')}`;
        const depStr = `₹${(Number(updatedBooking.securityDepositPaise) / 100).toLocaleString('en-IN')}`;
        const totalStr = `₹${(Number(updatedBooking.totalPayablePaise) / 100).toLocaleString('en-IN')}`;

        await tx.emailOutbox.create({
          data: {
            userId: customer.id,
            recipient: customer.email,
            templateVersion: 'rental-booking-confirmed-v1',
            eventKey: `rental-confirmed/${booking.id}`,
            subject: `Rental Booking Confirmed [${updatedBooking.bookingNumber}] · ${vehicleTitle}`,
            text: `Your self-drive rental booking has been confirmed!\n\nBooking Reference: ${updatedBooking.bookingNumber}\nVehicle: ${vehicleTitle} (${updatedBooking.vehicle.registrationNumber || 'Fleet Vehicle'})\nPickup Hub: ${hubName}\n\nSchedule:\n• Pickup Date & Time: ${startStr}\n• Expected Return: ${endStr}\n• Included Allowance: ${updatedBooking.includedKm} km (Extra @ ₹${(Number(updatedBooking.extraKmRatePaise) / 100).toFixed(2)}/km)\n\nPayment Summary:\n• Rental Tariff: ${fareStr}\n• Refundable Security Deposit: ${depStr}\n• Total Paid: ${totalStr}\n\nMandatory Checklist:\n• Upload Driver License in the V MOTIV mobile app under Activity.\n• Original physical driving license required at hub for vehicle collection.\n• 24/7 Roadside Assistance: 1800-866-848.\n\nYou can track and manage this booking in the V MOTIV mobile app under Activity.`,
          },
        });
      }

      if (this.notifications) {
        void this.notifications.dispatchDomainEvent({
          type: 'RENTAL_BOOKING_CONFIRMED',
          actorId: customerId,
          referenceId: booking.id,
          entityType: 'RentalBooking',
          title: 'Rental Booking Confirmed',
          body: `Your booking ${updatedBooking.bookingNumber} for ${updatedBooking.vehicle.make} ${updatedBooking.vehicle.model} has been confirmed.`,
          category: 'RENTAL',
          recipientUserIds: [customerId],
          recipientRoles: ['RENTAL_MANAGER', 'RENTAL_DISPATCH'],
          deepLink: `vmotiv://rentals/${booking.id}`,
        });
      }

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

    // Age validation (legal driving age: min 18)
    const ageYears = (now.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (!isNaN(ageYears) && ageYears < 18) {
      throw new HttpError(400, 'DRIVER_MUST_BE_AT_LEAST_18_YEARS_OLD');
    }

    // Experience validation (min 0)
    if (typeof input.drivingExperienceYears === 'number' && input.drivingExperienceYears < 0) {
      throw new HttpError(400, 'INVALID_DRIVING_EXPERIENCE');
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
   * Strictly enforces that driver license front and back documents must be uploaded.
   */
  async reviewDriverKyc(
    employeeId: string,
    bookingId: string,
    decision: 'APPROVE' | 'REJECT',
    rejectionReason?: string
  ) {
    return await this.db.$transaction(async tx => {
      const bookingRecord = await tx.rentalBooking.findUnique({ where: { id: bookingId } });
      if (!bookingRecord) throw new HttpError(404, 'BOOKING_NOT_FOUND');

      const verification = await tx.rentalDriverVerification.findUnique({
        where: { bookingId },
        include: { booking: true },
      });
      // A KYC decision is about the documents the driver actually submitted. When nothing has been submitted there is nothing to
      // approve or reject: no placeholder licence number, date of birth or stock photo is created to get the booking through the gate.
      if (!verification) {
        throw new HttpError(400, 'DRIVER_DOCUMENTS_MISSING', 'No driving licence details have been submitted for this booking yet. Add the licence number, expiry, date of birth and both photos first.');
      }
      if (decision === 'APPROVE') {
        if (!verification.licenseFrontUrl?.trim() || !verification.licenseBackUrl?.trim()) {
          throw new HttpError(400, 'MANDATORY_LICENSE_DOCUMENTS_MISSING', 'Both the front and the back photo of the driving licence are required before KYC can be approved.');
        }
        if (verification.licenseExpiry.getTime() <= bookingRecord.endTime.getTime()) {
          throw new HttpError(400, 'DRIVING_LICENSE_EXPIRED_OR_EXPIRES_BEFORE_TRIP_END');
        }
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

      // Dispatch KYC review transactional email & in-app notification
      const booking = await tx.rentalBooking.findUnique({
        where: { id: bookingId },
        include: {
          customer: { select: { id: true, email: true, displayName: true } },
          vehicle: true,
        },
      });
      if (booking?.customer?.email) {
        const vehicleTitle = `${booking.vehicle.make} ${booking.vehicle.model}`;
        if (decision === 'APPROVE') {
          await tx.emailOutbox.create({
            data: {
              userId: booking.customerId,
              recipient: booking.customer.email,
              templateVersion: 'rental-kyc-reviewed-v1',
              eventKey: `rental-kyc-approved/${booking.id}`,
              subject: `Driver KYC Approved [${booking.bookingNumber}] · Cleared for Pickup`,
              text: `Great news! Your driver license verification for booking ${booking.bookingNumber} (${vehicleTitle}) has been approved.\n\nYou are cleared to collect your vehicle at the scheduled pickup time. Please remember to carry your physical original driving license at the hub.\n\nHub Support Helpline: 1800-866-848.`,
            },
          });
          if (this.notifications) {
            void this.notifications.dispatchDomainEvent({
              type: 'RENTAL_BOOKING_CONFIRMED',
              actorId: employeeId,
              referenceId: booking.id,
              entityType: 'RentalBooking',
              title: 'Driver KYC Approved',
              body: `Your driver license verification for ${booking.bookingNumber} has been approved. You are ready for pickup.`,
              category: 'RENTAL',
              recipientUserIds: [booking.customerId],
              deepLink: `vmotiv://rentals/${booking.id}`,
            });
          }
        } else {
          await tx.emailOutbox.create({
            data: {
              userId: booking.customerId,
              recipient: booking.customer.email,
              templateVersion: 'rental-kyc-reviewed-v1',
              eventKey: `rental-kyc-rejected/${booking.id}-${Date.now()}`,
              subject: `Action Required: Driver License Verification [${booking.bookingNumber}]`,
              text: `Your driver license verification for rental booking ${booking.bookingNumber} (${vehicleTitle}) requires attention.\n\nReason: ${rejectionReason || 'Document details could not be verified'}.\n\nPlease upload clear, uncropped photos of your original valid Driving License in the V MOTIV mobile app under Activity > Rental Details before your scheduled pickup.\n\nNeed assistance? Contact support@vmotiv.in or call 1800-866-848.`,
            },
          });
          if (this.notifications) {
            void this.notifications.dispatchDomainEvent({
              type: 'RENTAL_KYC_REQUIRED',
              actorId: employeeId,
              referenceId: booking.id,
              entityType: 'RentalBooking',
              title: 'Driver KYC Action Required',
              body: `Your driver license for ${booking.bookingNumber} needs attention: ${rejectionReason || 'Please re-upload license'}.`,
              category: 'RENTAL',
              recipientUserIds: [booking.customerId],
              deepLink: `vmotiv://rentals/${booking.id}`,
            });
          }
        }
      }

      return updatedVerification;
    });
  }

  /**
   * Operations: Hub staff upload or update physical driving license documents.
   */
  async updateDriverKycDocuments(
    employeeId: string,
    bookingId: string,
    input: {
      licenseNumber: string;
      licenseExpiry: Date;
      licenseCategory?: string;
      dateOfBirth: Date;
      drivingExperienceYears: number;
      licenseFrontUrl: string;
      licenseBackUrl: string;
    }
  ) {
    // Everything here comes from the licence in front of the staff member; nothing is defaulted (a made-up date of birth would
    // pass the age check and a made-up number or picture would pass the KYC gate).
    const photos = requireLicensePhotos(input.licenseFrontUrl, input.licenseBackUrl);
    const licenseNumber = requireLicenseNumber(input.licenseNumber);
    const dateOfBirth = requireAdultDateOfBirth(input.dateOfBirth);
    const drivingExperienceYears = requireDrivingExperience(input.drivingExperienceYears);
    if (!(input.licenseExpiry instanceof Date) || Number.isNaN(input.licenseExpiry.getTime())) {
      throw new HttpError(400, 'LICENSE_EXPIRY_REQUIRED', 'Enter the licence expiry date as printed on the licence.');
    }

    return await this.db.$transaction(async tx => {
      const booking = await tx.rentalBooking.findUnique({ where: { id: bookingId } });
      if (!booking) throw new HttpError(404, 'BOOKING_NOT_FOUND');
      if (input.licenseExpiry.getTime() <= booking.endTime.getTime()) {
        throw new HttpError(400, 'DRIVING_LICENSE_EXPIRED_OR_EXPIRES_BEFORE_TRIP_END');
      }

      const details = {
        licenseNumber,
        licenseExpiry: input.licenseExpiry,
        licenseCategory: input.licenseCategory || 'LMV',
        dateOfBirth,
        drivingExperienceYears,
        licenseFrontUrl: photos.front,
        licenseBackUrl: photos.back,
        status: RentalDriverKycStatus.PENDING_REVIEW,
      };
      const verification = await tx.rentalDriverVerification.upsert({
        where: { bookingId },
        update: details,
        create: { bookingId, customerId: booking.customerId, ...details },
      });

      await tx.rentalBooking.update({
        where: { id: bookingId },
        data: { kycStatus: RentalDriverKycStatus.PENDING_REVIEW },
      });

      await tx.rentalAuditEvent.create({
        data: {
          bookingId,
          eventType: 'RENTAL_KYC_DOCUMENTS_UPDATED',
          actorId: employeeId,
          metadata: { licenseNumber },
        },
      });

      return verification;
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

      // CRITICAL PRODUCTION GATE: RENTAL BALANCE MUST BE FULLY PAID
      // Only rental charges count here: a refundable deposit is held for damages and must never pay off a rental balance.
      const payments = await tx.rentalPaymentRecord.findMany({
        where: { bookingId, status: RentalPaymentStatus.VERIFIED, type: { not: RentalPaymentType.REFUNDABLE_DEPOSIT } },
      });
      const totalPaid = payments.reduce((acc, p) => acc + p.amountPaise, 0n);
      const totalRental = booking.baseFarePaise + booking.taxPaise;
      if (totalPaid < totalRental || booking.outstandingBalancePaise > 0n || booking.rentalPaymentStatus !== 'PAID_IN_FULL') {
        throw new HttpError(403, 'RENTAL_BALANCE_PENDING_CANNOT_HANDOVER_VEHICLE');
      }

      // CRITICAL PRODUCTION GATE: the refundable security deposit is collected at the counter and must be on record first
      if (depositStillDue(booking)) {
        throw new HttpError(403, 'SECURITY_DEPOSIT_NOT_COLLECTED_CANNOT_HANDOVER_VEHICLE',
          `Collect the security deposit of ₹${(Number(booking.securityDepositPaise) / 100).toLocaleString('en-IN')} at the counter and record it (Record Payment → Deposit) before handing over the keys.`);
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

      // Dispatch trip started email & notification
      const customer = await tx.user.findUnique({
        where: { id: booking.customerId },
        select: { id: true, email: true, displayName: true },
      });
      if (customer?.email) {
        const vehicleTitle = `${updatedBooking.vehicle.year} ${updatedBooking.vehicle.make} ${updatedBooking.vehicle.model}`.trim();
        const endStr = updatedBooking.endTime.toISOString().replace('T', ' ').slice(0, 16);

        await tx.emailOutbox.create({
          data: {
            userId: customer.id,
            recipient: customer.email,
            templateVersion: 'rental-trip-started-v1',
            eventKey: `rental-trip-started/${booking.id}`,
            subject: `Rental Trip Started [${updatedBooking.bookingNumber}] · ${vehicleTitle}`,
            text: `Your rental trip has commenced! Vehicle keys and legal custody have been handed over.\n\nBooking: ${updatedBooking.bookingNumber}\nVehicle: ${vehicleTitle} (${updatedBooking.vehicle.registrationNumber || 'Fleet Vehicle'})\n\nDeparture Inspection Snapshot:\n• Start Odometer: ${input.odometerKm.toLocaleString('en-IN')} km\n• Start Fuel Level: ${input.fuelPercent}%\n• Scheduled Return: ${endStr}\n\nKey Travel Reminders:\n• Drive safely and adhere to highway speed limits.\n• Refuel to matching level prior to hub return to avoid refueling charges.\n• 24/7 Fleet Emergency & Roadside Hotline: 1800-866-848.\n\nYou can view active trip details anytime in the V MOTIV mobile app under Activity.`,
          },
        });
      }

      if (this.notifications) {
        void this.notifications.dispatchDomainEvent({
          type: 'RENTAL_TRIP_STARTED',
          actorId: employeeId,
          referenceId: booking.id,
          entityType: 'RentalBooking',
          title: 'Rental Trip Active',
          body: `Trip has commenced for ${updatedBooking.bookingNumber} (${updatedBooking.vehicle.make} ${updatedBooking.vehicle.model}) at ${input.odometerKm} km.`,
          category: 'RENTAL',
          recipientUserIds: [booking.customerId],
          deepLink: `vmotiv://rentals/${booking.id}`,
        });
      }

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
      const additionalTaxPaise = gstOn(additionalFarePaise);
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

      // Dispatch return and settlement email & notification
      const customer = await tx.user.findUnique({
        where: { id: booking.customerId },
        select: { id: true, email: true, displayName: true },
      });
      if (customer?.email) {
        const vehicleTitle = `${updatedBooking.vehicle.year} ${updatedBooking.vehicle.make} ${updatedBooking.vehicle.model}`.trim();
        const refundStr = `₹${(Number(depositRefundPaise) / 100).toLocaleString('en-IN')}`;
        const excessKmStr = `₹${(Number(excessKmChargePaise) / 100).toLocaleString('en-IN')}`;
        const fuelStr = `₹${(Number(fuelRefillChargePaise) / 100).toLocaleString('en-IN')}`;
        const damageStr = `₹${(Number(undisputedDamageChargePaise) / 100).toLocaleString('en-IN')}`;

        await tx.emailOutbox.create({
          data: {
            userId: customer.id,
            recipient: customer.email,
            templateVersion: 'rental-trip-returned-v1',
            eventKey: `rental-settled/${booking.id}`,
            subject: `Rental Concluded & Settlement Summary [${booking.bookingNumber}] · ${vehicleTitle}`,
            text: `Your rental vehicle return inspection has concluded.\n\nBooking: ${booking.bookingNumber}\nVehicle: ${vehicleTitle}\n\nReturn Check-Out Report:\n• Return Odometer: ${input.returnOdometerKm.toLocaleString('en-IN')} km (Driven: ${distanceDriven} km)\n• Return Fuel Level: ${input.returnFuelPercent}%\n\nSettlement Adjustments:\n• Excess Mileage Charges: ${excessKmStr} (${excessKm} extra km)\n• Fuel Refueling Charges: ${fuelStr}\n• Damage Deductions: ${damageStr}\n\nSecurity Deposit Status:\n• Eligible Refund Amount: ${refundStr}\n• Refund Process: Directly initiated to your original payment method (estimated 3 to 5 banking days).\n\nThank you for choosing V MOTIV! You can view full trip logs and invoices in the V MOTIV mobile app under Activity.`,
          },
        });
      }

      if (this.notifications) {
        void this.notifications.dispatchDomainEvent({
          type: 'RENTAL_RETURN_RECEIVED',
          actorId: employeeId,
          referenceId: booking.id,
          entityType: 'RentalBooking',
          title: 'Rental Concluded & Settled',
          body: `Return recorded for ${booking.bookingNumber}. Security deposit refund of ₹${(Number(depositRefundPaise) / 100).toLocaleString('en-IN')} initiated.`,
          category: 'RENTAL',
          recipientUserIds: [booking.customerId],
          deepLink: `vmotiv://rentals/${booking.id}`,
        });
      }

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
        include: { vehicle: true, hold: true, trip: true },
      });

      if (!booking) {
        throw new HttpError(404, 'RENTAL_BOOKING_NOT_FOUND');
      }
      if (!isOperator && booking.customerId !== actorId) {
        throw new HttpError(403, 'FORBIDDEN_BOOKING_OWNER_MISMATCH');
      }
      if (
        booking.status === RentalBookingStatus.TRIP_ACTIVE ||
        booking.status === RentalBookingStatus.VEHICLE_COLLECTED ||
        booking.status === RentalBookingStatus.RETURN_INSPECTED ||
        booking.status === RentalBookingStatus.SETTLED ||
        booking.status === RentalBookingStatus.CANCELLED ||
        Boolean(booking.trip?.pickupTime)
      ) {
        throw new HttpError(400, 'CANNOT_CANCEL_DISPATCHED_BOOKING');
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

      // Restore fleet vehicle to AVAILABLE if no other active trip exists on it
      const otherActiveBooking = await tx.rentalBooking.findFirst({
        where: {
          vehicleId: booking.vehicleId,
          id: { not: bookingId },
          status: RentalBookingStatus.TRIP_ACTIVE,
          endTime: { gte: now },
        },
      });
      if (!otherActiveBooking) {
        const activeBlock = await tx.rentalVehicleBlock.findFirst({
          where: {
            vehicleId: booking.vehicleId,
            startTime: { lte: now },
            endTime: { gte: now },
          },
        });
        const targetStatus = activeBlock
          ? (activeBlock.reason === 'CLEANING' ? RentalVehicleStatus.CLEANING : RentalVehicleStatus.MAINTENANCE)
          : RentalVehicleStatus.AVAILABLE;

        await tx.rentalFleetVehicle.update({
          where: { id: booking.vehicleId },
          data: { status: targetStatus },
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

      // Dispatch rental cancellation email & notification
      const customer = await tx.user.findUnique({
        where: { id: booking.customerId },
        select: { id: true, email: true, displayName: true },
      });
      if (customer?.email) {
        const vehicleTitle = `${booking.vehicle.make} ${booking.vehicle.model}`;
        const refundStr = `₹${(Number(refundPaise) / 100).toLocaleString('en-IN')}`;

        await tx.emailOutbox.create({
          data: {
            userId: customer.id,
            recipient: customer.email,
            templateVersion: 'rental-booking-cancelled-v1',
            eventKey: `rental-cancelled/${booking.id}`,
            subject: `Rental Booking Cancelled [${updated.bookingNumber}] · ${vehicleTitle}`,
            text: `Your self-drive rental booking has been cancelled.\n\nBooking: ${updated.bookingNumber}\nVehicle: ${vehicleTitle}\nCancellation Reason: ${reason}\n\nRefund Summary:\n• Eligible Refund Amount: ${refundStr}\n• Refund Method: Initiated back to your original payment source (3 to 5 business days).\n\nIf you have any questions or would like to rebook another vehicle, please visit the V MOTIV mobile app or email support@vmotiv.in.`,
          },
        });
      }

      if (this.notifications) {
        void this.notifications.dispatchDomainEvent({
          type: 'RENTAL_BOOKING_CANCELLED',
          actorId,
          referenceId: booking.id,
          entityType: 'RentalBooking',
          title: 'Rental Booking Cancelled',
          body: `Rental booking ${updated.bookingNumber} (${booking.vehicle.make} ${booking.vehicle.model}) was cancelled. Refund of ₹${(Number(refundPaise) / 100).toLocaleString('en-IN')} initiated.`,
          category: 'RENTAL',
          recipientUserIds: [booking.customerId],
          recipientRoles: ['RENTAL_MANAGER', 'RENTAL_DISPATCH'],
          deepLink: `vmotiv://rentals/${booking.id}`,
        });
      }

      return { booking: updated, calculatedRefundPaise: refundPaise };
    });
  }

  /**
   * Operations Staff Manual Booking Cancellation.
   * Enables operations to cancel bookings when KYC correction is not received or customer requested cancellation.
   */
  async cancelBookingByOperations(
    operatorId: string,
    bookingId: string,
    input: {
      reason: string;
      cancellationCategory?: string;
      internalNotes?: string;
      waiveCancellationFee?: boolean;
    }
  ) {
    return await this.db.$transaction(async tx => {
      const booking = await tx.rentalBooking.findUnique({
        where: { id: bookingId },
        include: { vehicle: true, hold: true, driverVerification: true, trip: true },
      });

      if (!booking) {
        throw new HttpError(404, 'RENTAL_BOOKING_NOT_FOUND');
      }

      // STRICT BUSINESS RULE: Once pickup is dispatched (vehicle collected / trip active / return / settled),
      // booking cancellation is prohibited. Customer/operations must proceed with Return Inspection workflow instead.
      if (
        booking.status === RentalBookingStatus.TRIP_ACTIVE ||
        booking.status === RentalBookingStatus.VEHICLE_COLLECTED ||
        booking.status === RentalBookingStatus.RETURN_INSPECTED ||
        booking.status === RentalBookingStatus.SETTLED ||
        booking.status === RentalBookingStatus.CANCELLED ||
        Boolean(booking.trip?.pickupTime)
      ) {
        throw new HttpError(400, 'CANNOT_CANCEL_DISPATCHED_BOOKING');
      }

      const now = new Date();
      const category = input.cancellationCategory || 'CUSTOMER_REQUESTED';
      const formattedReason = `[${category}] ${input.reason}`;

      // Refund calculation
      let refundPaise = 0n;
      if (input.waiveCancellationFee) {
        refundPaise = booking.totalPayablePaise;
      } else {
        const hoursToPickup = (booking.startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (hoursToPickup >= 24 || category === 'KYC_CORRECTION_TIMEOUT') {
          refundPaise = booking.totalPayablePaise;
        } else if (hoursToPickup >= 6) {
          refundPaise = booking.securityDepositPaise + (booking.baseFarePaise * 50n) / 100n + (booking.taxPaise * 50n) / 100n;
        } else {
          refundPaise = booking.securityDepositPaise;
        }
      }

      const updated = await tx.rentalBooking.update({
        where: { id: bookingId },
        data: {
          status: RentalBookingStatus.CANCELLED,
          cancellationReason: formattedReason,
          cancelledAt: now,
        },
      });

      if (booking.hold) {
        await tx.rentalBookingHold.update({
          where: { id: booking.hold.id },
          data: { status: RentalHoldStatus.RELEASED },
        });
      }

      // Restore fleet vehicle to AVAILABLE if no other active trip on it
      const otherActiveBooking = await tx.rentalBooking.findFirst({
        where: {
          vehicleId: booking.vehicleId,
          id: { not: bookingId },
          status: RentalBookingStatus.TRIP_ACTIVE,
          endTime: { gte: now },
        },
      });
      if (!otherActiveBooking) {
        const activeBlock = await tx.rentalVehicleBlock.findFirst({
          where: {
            vehicleId: booking.vehicleId,
            startTime: { lte: now },
            endTime: { gte: now },
          },
        });
        const targetStatus = activeBlock
          ? (activeBlock.reason === 'CLEANING' ? RentalVehicleStatus.CLEANING : RentalVehicleStatus.MAINTENANCE)
          : RentalVehicleStatus.AVAILABLE;

        await tx.rentalFleetVehicle.update({
          where: { id: booking.vehicleId },
          data: { status: targetStatus },
        });
      }

      await tx.rentalAuditEvent.create({
        data: {
          bookingId,
          vehicleId: booking.vehicleId,
          eventType: 'RENTAL_BOOKING_CANCELLED_BY_OPERATIONS',
          actorId: operatorId,
          metadata: {
            reason: input.reason,
            category,
            internalNotes: input.internalNotes || '',
            refundPaise: refundPaise.toString(),
            waiveCancellationFee: Boolean(input.waiveCancellationFee),
          },
        },
      });

      // Dispatch rental cancellation email to customer
      const customer = await tx.user.findUnique({
        where: { id: booking.customerId },
        select: { id: true, email: true, displayName: true },
      });
      if (customer?.email) {
        const vehicleTitle = `${booking.vehicle.make} ${booking.vehicle.model}`;
        const refundStr = `₹${(Number(refundPaise) / 100).toLocaleString('en-IN')}`;
        const isKycTimeout = category === 'KYC_CORRECTION_TIMEOUT';

        await tx.emailOutbox.create({
          data: {
            userId: customer.id,
            recipient: customer.email,
            templateVersion: 'rental-booking-cancelled-ops-v1',
            eventKey: `rental-cancelled-ops/${booking.id}`,
            subject: `Rental Booking Cancelled [${updated.bookingNumber}] · ${vehicleTitle}`,
            text: `Your self-drive rental booking has been cancelled by operations.\n\n` +
              `Booking Number: ${updated.bookingNumber}\n` +
              `Vehicle: ${vehicleTitle}\n` +
              `Cancellation Category: ${category.replace(/_/g, ' ')}\n` +
              `Reason: ${input.reason}\n\n` +
              (isKycTimeout
                ? `Note: This booking was cancelled because required KYC document corrections were not submitted within the verification window.\n\n`
                : '') +
              `Refund Summary:\n` +
              `• Refund Amount: ${refundStr}\n` +
              `• Processing: Any eligible refunds have been initiated to your original payment method (3 to 5 business days).\n\n` +
              `If you have questions, please contact our 24/7 support at support@vmotiv.in.`,
          },
        });
      }

      if (this.notifications) {
        void this.notifications.dispatchDomainEvent({
          type: 'RENTAL_BOOKING_CANCELLED',
          actorId: operatorId,
          referenceId: booking.id,
          entityType: 'RentalBooking',
          title: 'Rental Booking Cancelled by Operations',
          body: `Rental booking ${updated.bookingNumber} was cancelled by operations staff (${category}). Refund of ₹${(Number(refundPaise) / 100).toLocaleString('en-IN')} queued.`,
          category: 'RENTAL',
          recipientUserIds: [booking.customerId],
          recipientRoles: ['RENTAL_MANAGER', 'RENTAL_DISPATCH'],
          deepLink: `vmotiv://rentals/${booking.id}`,
        });
      }

      return {
        success: true,
        booking: updated,
        calculatedRefundPaise: refundPaise,
        message: 'Booking successfully cancelled by operations staff.',
      };
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
        customer: { select: { id: true, displayName: true, email: true, phone: true } },
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
  async getFleet(filter?: { hubId?: string; status?: RentalVehicleStatus; startTime?: Date; endTime?: Date }) {
    const now = new Date();

    const where: Prisma.RentalFleetVehicleWhereInput = {};
    if (filter?.hubId) where.hubId = filter.hubId;

    const vehicles = await this.db.rentalFleetVehicle.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        hub: true,
        blocks: { orderBy: { startTime: 'desc' } },
        bookings: {
          where: {
            status: { in: [RentalBookingStatus.TRIP_ACTIVE, RentalBookingStatus.CONFIRMED, RentalBookingStatus.VEHICLE_COLLECTED] },
          },
          take: 1,
        },
      },
    });

    const staleMaintenanceVehicleIds: string[] = [];

    const mapped = vehicles.map(v => {
      const activeBlock = v.blocks.find(b => b.startTime <= now && b.endTime > now) ?? null;
      const hasActiveTrip = v.bookings && v.bookings.length > 0;
      let effectiveStatus = v.status;

      if (activeBlock) {
        effectiveStatus = activeBlock.reason === RentalBlockReason.CLEANING
          ? RentalVehicleStatus.CLEANING
          : RentalVehicleStatus.MAINTENANCE;
      } else if (v.status === RentalVehicleStatus.MAINTENANCE || v.status === RentalVehicleStatus.CLEANING) {
        // Vehicle has no current active block; auto-heal back to AVAILABLE
        effectiveStatus = RentalVehicleStatus.AVAILABLE;
        staleMaintenanceVehicleIds.push(v.id);
      } else if ((v.status === RentalVehicleStatus.ON_TRIP || v.status === RentalVehicleStatus.RESERVED) && !hasActiveTrip) {
        // Vehicle has no active non-cancelled trip; auto-heal back to AVAILABLE
        effectiveStatus = RentalVehicleStatus.AVAILABLE;
        staleMaintenanceVehicleIds.push(v.id);
      }

      return { ...v, status: effectiveStatus, activeBlock, ...this.effectiveKmFields(v) };
    });

    // Auto-heal database records that were permanently stuck in MAINTENANCE
    if (staleMaintenanceVehicleIds.length > 0) {
      void this.db.rentalFleetVehicle.updateMany({
        where: { id: { in: staleMaintenanceVehicleIds } },
        data: { status: RentalVehicleStatus.AVAILABLE },
      }).catch(() => { /* non-blocking */ });
    }

    // Apply status filter after deriving effective status
    const filtered = filter?.status ? mapped.filter(v => v.status === filter.status) : mapped;

    // Optional: availability for a requested interval (same rules customers see).
    if (filter?.startTime && filter?.endTime) {
      const availability = await this.loadAvailabilityFor(this.db, filtered, filter.startTime, filter.endTime, now);
      return filtered.map(v => ({ ...v, availability: availability.get(v.id) ?? null }));
    }
    return filtered;
  }

  /**
   * Operations: Get a single fleet vehicle with hub and blocks.
   */
  async getFleetVehicle(vehicleId: string) {
    const now = new Date();
    const vehicle = await this.db.rentalFleetVehicle.findUnique({
      where: { id: vehicleId },
      include: {
        hub: true,
        blocks: { orderBy: { startTime: 'desc' } },
      },
    });
    if (!vehicle) return null;

    const activeBlock = vehicle.blocks.find(b => b.startTime <= now && b.endTime > now) ?? null;
    let effectiveStatus = vehicle.status;
    if (activeBlock) {
      effectiveStatus = activeBlock.reason === RentalBlockReason.CLEANING
        ? RentalVehicleStatus.CLEANING
        : RentalVehicleStatus.MAINTENANCE;
    } else if (vehicle.status === RentalVehicleStatus.MAINTENANCE || vehicle.status === RentalVehicleStatus.CLEANING) {
      effectiveStatus = RentalVehicleStatus.AVAILABLE;
    }

    return {
      ...vehicle,
      status: effectiveStatus,
      activeBlock,
    };
  }

  /**
   * Operations: Explicitly release vehicle from MAINTENANCE back to AVAILABLE.
   * Closes active/future blocks (truncating endTime to now to preserve historical records)
   * and sets vehicle status to AVAILABLE and eligible.
   */
  async releaseVehicleFromMaintenance(vehicleId: string, notes?: string) {
    const now = new Date();
    return await this.db.$transaction(async tx => {
      const vehicle = await tx.rentalFleetVehicle.findUnique({
        where: { id: vehicleId },
        include: { blocks: { orderBy: { startTime: 'desc' } } },
      });
      if (!vehicle) {
        throw new HttpError(404, 'VEHICLE_NOT_FOUND');
      }

      // Truncate all active or upcoming blocks to now so maintenance history is retained
      const activeOrUpcomingBlocks = vehicle.blocks.filter(b => b.endTime > now);
      for (const b of activeOrUpcomingBlocks) {
        const releaseNote = `[Released to AVAILABLE on ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}${notes ? `: ${notes}` : ''}]`;
        const updatedNotes = b.notes ? `${b.notes} · ${releaseNote}` : releaseNote;

        await tx.rentalVehicleBlock.update({
          where: { id: b.id },
          data: {
            endTime: b.startTime < now ? now : b.startTime,
            notes: updatedNotes,
          },
        });
      }

      const updated = await tx.rentalFleetVehicle.update({
        where: { id: vehicleId },
        data: {
          status: RentalVehicleStatus.AVAILABLE,
          isEligibleForRental: true,
        },
        include: {
          hub: true,
          blocks: { orderBy: { startTime: 'desc' } },
        },
      });

      return {
        ...updated,
        status: RentalVehicleStatus.AVAILABLE,
        activeBlock: null,
      };
    });
  }

  /**
   * Operations: Release (end early) a vehicle block and restore AVAILABLE status if no other active block remains.
   * Preserves the maintenance history record with the actual release time.
   */
  async releaseVehicleBlock(vehicleId: string, blockId: string) {
    const now = new Date();
    return await this.db.$transaction(async tx => {
      const block = await tx.rentalVehicleBlock.findUnique({ where: { id: blockId } });
      if (!block || block.vehicleId !== vehicleId) {
        throw new HttpError(404, 'BLOCK_NOT_FOUND');
      }

      const releaseNote = `[Released early on ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}]`;
      const updatedNotes = block.notes ? `${block.notes} · ${releaseNote}` : releaseNote;

      // Truncate block to now so history is preserved
      await tx.rentalVehicleBlock.update({
        where: { id: blockId },
        data: {
          endTime: block.startTime < now ? now : block.startTime,
          notes: updatedNotes,
        },
      });

      // If no other block is active, restore vehicle status to AVAILABLE
      const otherActive = await tx.rentalVehicleBlock.findFirst({
        where: { vehicleId, id: { not: blockId }, startTime: { lte: now }, endTime: { gt: now } },
      });
      if (!otherActive) {
        await tx.rentalFleetVehicle.update({
          where: { id: vehicleId },
          data: { status: RentalVehicleStatus.AVAILABLE },
        });
      }

      return { released: true, blockId };
    });
  }

  /**
   * Operations: Permanently delete an accidental or invalid vehicle block.
   */
  async deleteVehicleBlock(vehicleId: string, blockId: string) {
    return await this.db.$transaction(async tx => {
      const block = await tx.rentalVehicleBlock.findUnique({ where: { id: blockId } });
      if (!block || block.vehicleId !== vehicleId) {
        throw new HttpError(404, 'BLOCK_NOT_FOUND');
      }

      await tx.rentalVehicleBlock.delete({ where: { id: blockId } });

      const now = new Date();
      const otherActive = await tx.rentalVehicleBlock.findFirst({
        where: { vehicleId, startTime: { lte: now }, endTime: { gt: now } },
      });
      if (!otherActive) {
        await tx.rentalFleetVehicle.update({
          where: { id: vehicleId },
          data: { status: RentalVehicleStatus.AVAILABLE },
        });
      }

      return { deleted: true, blockId };
    });
  }

  /**
   * Helper: Resolve ServiceHub id from either a ServiceHub id or a Branch id.
   */
  async resolveHubId(idOrBranchId?: string): Promise<string> {
    if (!idOrBranchId) {
      const first = await this.db.serviceHub.findFirst({ where: { isActive: true }, select: { id: true } });
      if (first) return first.id;
      throw new HttpError(400, 'NO_ACTIVE_HUBS_AVAILABLE');
    }

    // 1. Direct ServiceHub id check
    const directHub = await this.db.serviceHub.findUnique({ where: { id: idOrBranchId }, select: { id: true } });
    if (directHub) return directHub.id;

    // 2. Check if it's a branchId
    const branchHub = await this.db.serviceHub.findFirst({ where: { branchId: idOrBranchId }, select: { id: true } });
    if (branchHub) return branchHub.id;

    // 3. If a Branch exists with this ID, find or auto-upsert a corresponding ServiceHub
    const branch = await this.db.branch.findUnique({ where: { id: idOrBranchId } });
    if (branch) {
      const upserted = await this.db.serviceHub.upsert({
        where: { code: branch.code },
        update: {
          branchId: branch.id,
          name: branch.name,
          city: branch.city,
          address: branch.address || `${branch.city} Hub Facility`,
          isActive: branch.active,
          supportsRentals: true,
        },
        create: {
          branchId: branch.id,
          code: branch.code,
          name: branch.name,
          city: branch.city,
          address: branch.address || `${branch.city} Hub Facility`,
          isActive: branch.active,
          supportsRentals: true,
        },
        select: { id: true },
      });
      return upserted.id;
    }

    // 4. Fallback to any active hub
    const fallback = await this.db.serviceHub.findFirst({ where: { isActive: true }, select: { id: true } });
    if (fallback) return fallback.id;

    return idOrBranchId;
  }

  /**
   * Operations: Add fleet vehicle.
   */
  async createFleetVehicle(input: {
    fleetNumber?: string;
    registrationNumber: string;
    vin?: string;
    make: string;
    model: string;
    variant?: string;
    year: number;
    transmission: string;
    fuelType: string;
    seats?: number;
    color: string;
    hubId: string;
    images?: string[];
    /** Reading on the dashboard when the car joins the fleet. */
    odometerKm?: number;
    /** Fuel / charge level (%) when the car joins the fleet. */
    fuelLevelPercent?: number;
    commercialPermitNumber?: string;
    commercialPermitExpiry?: string | Date;
    insurancePolicyNumber?: string;
    insuranceExpiry?: string | Date;
    fitnessCertExpiry?: string | Date;
    baseDailyRatePaise: number | bigint | string;
    baseHourlyRatePaise?: number | bigint | string;
    securityDepositPaise?: number | bigint | string;
    includedKmPerDay?: number;
    includedDailyKm?: number;
    extraKmRatePaise?: number | bigint | string;
    features?: string[];
  }) {
    const regClean = input.registrationNumber.trim().toUpperCase();
    const fleetNumber = input.fleetNumber?.trim() || `VMF-${Math.floor(100 + Math.random() * 899)}`;
    // VIN, permit, insurance and fitness details are optional: blank means "not on file" and is stored as NULL.
    // They are facts about the car, never defaults - a made-up number or a "valid for a year" expiry would pass for a real document.
    const vin = input.vin?.trim().toUpperCase() || null;
    const commercialPermitNumber = input.commercialPermitNumber?.trim() || null;
    const insurancePolicyNumber = input.insurancePolicyNumber?.trim() || null;
    const optionalDate = (value: string | Date | undefined | null, label: string): Date | null => {
      if (value === undefined || value === null || value === '') return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) throw new HttpError(400, 'INVALID_COMPLIANCE_DATE', `${label} is not a valid date.`);
      return date;
    };
    const commercialPermitExpiry = optionalDate(input.commercialPermitExpiry, 'Commercial permit expiry');
    const insuranceExpiry = optionalDate(input.insuranceExpiry, 'Insurance expiry');
    const fitnessCertExpiry = optionalDate(input.fitnessCertExpiry, 'Fitness certificate expiry');
    const baseDailyRatePaise = BigInt(input.baseDailyRatePaise);
    const baseHourlyRatePaise = input.baseHourlyRatePaise ? BigInt(input.baseHourlyRatePaise) : BigInt(Math.max(100, Math.round(Number(baseDailyRatePaise) / 10)));
    const securityDepositPaise = input.securityDepositPaise !== undefined ? BigInt(input.securityDepositPaise) : 500000n;
    const resolvedHubId = await this.resolveHubId(input.hubId);
    // No hidden 250 km / ₹12 defaults: the vehicle's allowance comes from what staff entered or from the hub's policy, else it is refused.
    const onboardingHub = await this.db.serviceHub.findUnique({ where: { id: resolvedHubId }, select: { rentalIncludedKmPerDay: true, rentalExtraKmRatePaise: true } }).catch(() => null);
    const includedKmPerDay = input.includedKmPerDay || input.includedDailyKm || onboardingHub?.rentalIncludedKmPerDay || 0;
    const extraKmRate = input.extraKmRatePaise !== undefined && input.extraKmRatePaise !== '' ? BigInt(input.extraKmRatePaise) : onboardingHub?.rentalExtraKmRatePaise ?? null;
    if (!includedKmPerDay || extraKmRate === null) {
      throw new HttpError(400, 'KM_POLICY_REQUIRED', 'Enter the included km per day and the extra-km rate, or set them for this hub in the Admin portal first.');
    }
    // An empty list is honest; a stock photo of some other car is not.
    const images = input.images && input.images.length > 0 ? input.images : [];
    const names = await canonicalMakeModel(this.db as any, input.make, input.model);

    return await this.db.rentalFleetVehicle.create({
      data: {
        fleetNumber,
        registrationNumber: regClean,
        vin,
        // Current readings of the car being onboarded. Left out, the column defaults apply (0 km, full tank) until the first hand-over records real ones.
        ...(input.odometerKm !== undefined ? { odometerKm: input.odometerKm } : {}),
        ...(input.fuelLevelPercent !== undefined ? { fuelLevelPercent: input.fuelLevelPercent } : {}),
        make: names.make,
        model: names.model,
        variant: input.variant?.trim() || null,
        year: input.year,
        transmission: input.transmission as any,
        fuelType: input.fuelType as any,
        seats: input.seats || 5,
        color: input.color.trim(),
        hubId: resolvedHubId,
        images: images as any,
        commercialPermitNumber,
        commercialPermitExpiry,
        insurancePolicyNumber,
        insuranceExpiry,
        fitnessCertExpiry,
        baseDailyRatePaise,
        baseHourlyRatePaise,
        securityDepositPaise,
        includedKmPerDay,
        extraKmRatePaise: extraKmRate,
        features: (input.features || []) as any,
        status: RentalVehicleStatus.AVAILABLE,
      },
      include: { hub: true },
    });
  }

  /**
   * Operations: Update fleet vehicle (eligibility, status, rates, hub).
   */
  async updateFleetVehicle(
    vehicleId: string,
    input: {
      isEligibleForRental?: boolean;
      status?: RentalVehicleStatus;
      baseDailyRatePaise?: number | bigint | string;
      securityDepositPaise?: number | bigint | string;
      includedKmPerDay?: number;
      extraKmRatePaise?: number | bigint | string;
      hubId?: string;
    }
  ) {
    const resolvedHubId = input.hubId ? await this.resolveHubId(input.hubId) : undefined;
    return await this.db.rentalFleetVehicle.update({
      where: { id: vehicleId },
      data: {
        ...(input.isEligibleForRental !== undefined ? { isEligibleForRental: input.isEligibleForRental } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.baseDailyRatePaise !== undefined ? { baseDailyRatePaise: BigInt(input.baseDailyRatePaise) } : {}),
        ...(input.securityDepositPaise !== undefined ? { securityDepositPaise: BigInt(input.securityDepositPaise) } : {}),
        ...(input.includedKmPerDay !== undefined ? { includedKmPerDay: input.includedKmPerDay } : {}),
        ...(input.extraKmRatePaise !== undefined ? { extraKmRatePaise: BigInt(input.extraKmRatePaise) } : {}),
        ...(resolvedHubId !== undefined ? { hubId: resolvedHubId } : {}),
      },
      include: { hub: true },
    });
  }

  /**
   * Operations: edit a rental car's details - rates, deposit, km allowance, look and compliance documents.
   * Only a delisted car can be edited (customers cannot be looking at it or booking it while its price changes); bookings
   * already made keep the rates they were quoted. Every change is audited with the previous and new values.
   */
  async updateFleetDetails(
    employeeId: string,
    vehicleId: string,
    input: {
      baseDailyRatePaise?: number | bigint | string;
      baseHourlyRatePaise?: number | bigint | string;
      securityDepositPaise?: number | bigint | string;
      includedKmPerDay?: number;
      extraKmRatePaise?: number | bigint | string;
      variant?: string;
      color?: string;
      seats?: number;
      features?: string[];
      vin?: string;
      commercialPermitNumber?: string;
      commercialPermitExpiry?: string | Date;
      insurancePolicyNumber?: string;
      insuranceExpiry?: string | Date;
      fitnessCertExpiry?: string | Date;
    }
  ) {
    const vehicle = await this.db.rentalFleetVehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new HttpError(404, 'RENTAL_VEHICLE_NOT_FOUND');
    if (vehicle.isEligibleForRental !== false) {
      throw new HttpError(409, 'DELIST_BEFORE_EDITING', 'Delist this car first. Its details can only be edited while customers cannot see or book it.');
    }

    const positive = (value: number | bigint | string | undefined, code: string, label: string, allowZero = false): bigint | undefined => {
      if (value === undefined) return undefined;
      let amount: bigint;
      try { amount = BigInt(value); } catch { throw new HttpError(400, code, `${label} must be a whole number of paise.`); }
      if (amount < 0n || (!allowZero && amount === 0n)) throw new HttpError(400, code, `${label} must be ${allowZero ? 'zero or more' : 'more than zero'}.`);
      return amount;
    };
    const optionalDate = (value: string | Date | undefined, label: string): Date | undefined => {
      if (value === undefined || value === '') return undefined;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) throw new HttpError(400, 'INVALID_COMPLIANCE_DATE', `${label} is not a valid date.`);
      return date;
    };
    if (input.includedKmPerDay !== undefined && (!Number.isInteger(input.includedKmPerDay) || input.includedKmPerDay < 50)) {
      throw new HttpError(400, 'INVALID_INCLUDED_KM', 'Included km per day must be a whole number, at least 50.');
    }
    if (input.seats !== undefined && (!Number.isInteger(input.seats) || input.seats < 2 || input.seats > 10)) {
      throw new HttpError(400, 'INVALID_SEATS', 'Seats must be between 2 and 10.');
    }

    const data: Record<string, unknown> = {};
    const daily = positive(input.baseDailyRatePaise, 'INVALID_DAILY_RATE', 'The daily rate');
    const hourly = positive(input.baseHourlyRatePaise, 'INVALID_HOURLY_RATE', 'The hourly rate');
    const deposit = positive(input.securityDepositPaise, 'INVALID_DEPOSIT', 'The security deposit', true);
    const extra = positive(input.extraKmRatePaise, 'INVALID_EXTRA_KM_RATE', 'The extra-km charge');
    if (daily !== undefined) data.baseDailyRatePaise = daily;
    if (hourly !== undefined) data.baseHourlyRatePaise = hourly;
    if (deposit !== undefined) data.securityDepositPaise = deposit;
    if (extra !== undefined) data.extraKmRatePaise = extra;
    if (input.includedKmPerDay !== undefined) data.includedKmPerDay = input.includedKmPerDay;
    if (input.variant !== undefined) data.variant = input.variant.trim() || null;
    if (input.color !== undefined && input.color.trim()) data.color = input.color.trim();
    if (input.seats !== undefined) data.seats = input.seats;
    if (input.features !== undefined) data.features = input.features.map(f => f.trim()).filter(Boolean);
    // Compliance details stay optional: a blank value leaves what is on file unchanged.
    if (input.vin !== undefined && input.vin.trim()) data.vin = input.vin.trim().toUpperCase();
    if (input.commercialPermitNumber !== undefined && input.commercialPermitNumber.trim()) data.commercialPermitNumber = input.commercialPermitNumber.trim();
    if (input.insurancePolicyNumber !== undefined && input.insurancePolicyNumber.trim()) data.insurancePolicyNumber = input.insurancePolicyNumber.trim();
    const permitExpiry = optionalDate(input.commercialPermitExpiry, 'Commercial permit expiry');
    const insuranceExpiry = optionalDate(input.insuranceExpiry, 'Insurance expiry');
    const fitnessExpiry = optionalDate(input.fitnessCertExpiry, 'Fitness certificate expiry');
    if (permitExpiry) data.commercialPermitExpiry = permitExpiry;
    if (insuranceExpiry) data.insuranceExpiry = insuranceExpiry;
    if (fitnessExpiry) data.fitnessCertExpiry = fitnessExpiry;

    // Only what really changes is written and audited.
    const plain = (value: unknown) => (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'string' ? String(value) : value instanceof Date ? value.toISOString() : JSON.stringify(value));
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
      const previous = (vehicle as Record<string, unknown>)[key];
      if (plain(previous ?? null) !== plain(data[key])) { before[key] = plain(previous ?? null); after[key] = plain(data[key]); } else delete data[key];
    }
    if (Object.keys(data).length === 0) return await this.db.rentalFleetVehicle.findUnique({ where: { id: vehicleId }, include: { hub: true } });

    return await this.db.$transaction(async tx => {
      const updated = await tx.rentalFleetVehicle.update({ where: { id: vehicleId }, data: data as any, include: { hub: true } });
      await tx.rentalAuditEvent.create({
        data: { vehicleId, eventType: 'RENTAL_VEHICLE_DETAILS_UPDATED', actorId: employeeId, metadata: { before, after } as any },
      });
      return updated;
    });
  }

  /**
   * Operations: correct the odometer and / or fuel level recorded for a car (a mistyped reading, a refuel at the hub).
   * A hand-over or return records readings as part of the trip; this is the only other way to change them, so it needs a
   * reason, is refused while the car is on a trip (the return records its readings then) and is audited with the previous
   * and the new values - a reading is never changed quietly.
   */
  async correctVehicleReadings(
    employeeId: string,
    vehicleId: string,
    input: { odometerKm?: number; fuelLevelPercent?: number; reason: string }
  ) {
    const reason = (input.reason ?? '').trim();
    if (reason.length < 3) {
      throw new HttpError(400, 'CORRECTION_REASON_REQUIRED', 'Say why the reading is being changed.');
    }
    if (input.odometerKm === undefined && input.fuelLevelPercent === undefined) {
      throw new HttpError(400, 'NO_READING_TO_CORRECT', 'Enter the odometer reading and / or the fuel level to record.');
    }
    if (input.odometerKm !== undefined && (!Number.isInteger(input.odometerKm) || input.odometerKm < 0)) {
      throw new HttpError(400, 'INVALID_ODOMETER', 'The odometer must be a whole number of kilometres.');
    }
    if (input.fuelLevelPercent !== undefined && (!Number.isInteger(input.fuelLevelPercent) || input.fuelLevelPercent < 0 || input.fuelLevelPercent > 100)) {
      throw new HttpError(400, 'INVALID_FUEL_LEVEL', 'The fuel / charge level must be between 0 and 100 %.');
    }

    return await this.db.$transaction(async tx => {
      const vehicle = await tx.rentalFleetVehicle.findUnique({
        where: { id: vehicleId },
        select: { id: true, status: true, odometerKm: true, fuelLevelPercent: true },
      });
      if (!vehicle) throw new HttpError(404, 'RENTAL_VEHICLE_NOT_FOUND');
      if (vehicle.status === RentalVehicleStatus.ON_TRIP) {
        throw new HttpError(409, 'VEHICLE_ON_TRIP', 'This car is on a trip - its readings are recorded when it is returned.');
      }

      const updated = await tx.rentalFleetVehicle.update({
        where: { id: vehicleId },
        data: {
          ...(input.odometerKm !== undefined ? { odometerKm: input.odometerKm } : {}),
          ...(input.fuelLevelPercent !== undefined ? { fuelLevelPercent: input.fuelLevelPercent } : {}),
        },
        include: { hub: true },
      });

      await tx.rentalAuditEvent.create({
        data: {
          vehicleId,
          eventType: 'RENTAL_VEHICLE_READINGS_CORRECTED',
          actorId: employeeId,
          metadata: {
            reason,
            previous: { odometerKm: vehicle.odometerKm, fuelLevelPercent: vehicle.fuelLevelPercent },
            next: { odometerKm: updated.odometerKm, fuelLevelPercent: updated.fuelLevelPercent },
          },
        },
      });

      return updated;
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

    return await this.db.$transaction(async tx => {
      const block = await tx.rentalVehicleBlock.create({
        data: {
          vehicleId,
          reason: input.reason,
          startTime: start,
          endTime: end,
          notes: input.notes,
          createdById: input.createdById,
        },
      });

      // If the block covers now, update vehicle status immediately
      const now = new Date();
      if (start <= now && end > now) {
        const newStatus = input.reason === RentalBlockReason.CLEANING
          ? RentalVehicleStatus.CLEANING
          : RentalVehicleStatus.MAINTENANCE;
        await tx.rentalFleetVehicle.update({
          where: { id: vehicleId },
          data: { status: newStatus },
        });
      }

      return block;
    });
  }

  /**
   * Operations: List bookings with status filter.
   */
  async getOperationsBookings(filter?: {
    status?: RentalBookingStatus;
    paymentStatus?: string;
    hubId?: string;
    search?: string;
  }) {
    const where: Prisma.RentalBookingWhereInput = {};
    if (filter?.status) where.status = filter.status;
    if (filter?.hubId) where.pickupHubId = filter.hubId;
    if (filter?.paymentStatus && filter.paymentStatus !== 'ALL') {
      if (filter.paymentStatus === 'OVERDUE') {
        where.outstandingBalancePaise = { gt: 0n };
        where.balanceDueAt = { lt: new Date() };
      } else {
        where.rentalPaymentStatus = filter.paymentStatus;
      }
    }

    const bookings = await this.db.rentalBooking.findMany({
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
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });

    return bookings.map(b => {
      const totalRental = b.baseFarePaise + b.taxPaise;
      const verifiedPaid = b.payments
        .filter(p => p.status === RentalPaymentStatus.VERIFIED)
        .reduce((acc, p) => acc + p.amountPaise, 0n);
      const outstanding = totalRental > verifiedPaid ? totalRental - verifiedPaid : 0n;
      const isOverdue = Boolean(b.balanceDueAt && new Date() > b.balanceDueAt && outstanding > 0n);
      const paymentStatus = outstanding === 0n && verifiedPaid > 0n
        ? 'PAID_IN_FULL'
        : isOverdue
        ? 'OVERDUE'
        : (b.rentalPaymentStatus || (verifiedPaid > 0n ? 'PARTIALLY_PAID' : 'NOT_PAID'));

      const pickupReadiness = this.computePickupReadiness(b, outstanding, paymentStatus);

      return {
        ...b,
        rentalPaymentStatus: paymentStatus,
        verifiedPaidPaise: verifiedPaid,
        outstandingBalancePaise: outstanding,
        isOverdue,
        pickupReadiness,
      };
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

  /**
   * Operations: Delete a rental fleet vehicle.
   * If vehicle has active or upcoming bookings, blocks deletion to preserve customer contract.
   * Otherwise cleanly purges associated blocks, holds, and removes the vehicle.
   */
  async deleteFleetVehicle(vehicleId: string) {
    return await this.db.$transaction(async tx => {
      const vehicle = await tx.rentalFleetVehicle.findUnique({
        where: { id: vehicleId },
        include: {
          bookings: {
            where: {
              status: { in: [RentalBookingStatus.CONFIRMED, RentalBookingStatus.TRIP_ACTIVE] },
            },
          },
        },
      });

      if (!vehicle) {
        throw new HttpError(404, 'VEHICLE_NOT_FOUND');
      }

      if (vehicle.bookings.length > 0) {
        throw new HttpError(400, 'CANNOT_DELETE_VEHICLE_WITH_ACTIVE_BOOKINGS');
      }

      // Delete blocks and holds
      await tx.rentalVehicleBlock.deleteMany({ where: { vehicleId } });
      await tx.rentalBookingHold.deleteMany({ where: { vehicleId } });

      // If it has historical completed or cancelled bookings, archive/soft-delete
      const allBookingsCount = await tx.rentalBooking.count({ where: { vehicleId } });
      if (allBookingsCount > 0) {
        await tx.rentalFleetVehicle.update({
          where: { id: vehicleId },
          data: {
            status: RentalVehicleStatus.RETIRED,
            isEligibleForRental: false,
          },
        });
        return { deleted: true, archived: true, vehicleId };
      }

      await tx.rentalFleetVehicle.delete({ where: { id: vehicleId } });
      return { deleted: true, archived: false, vehicleId };
    });
  }

  /**
   * Operations: Create Walk-In / Offline Hub Rental Booking.
   * Books a vehicle on the spot at an offline hub for an on-road rental.
   * Enforces mandatory driving license document upload, counter payment, and immediate handover option.
   */
  /** Price preview for the counter: exactly what createWalkInBooking will charge, including the km package. */
  async quoteWalkIn(vehicleId: string, startTime: Date, endTime: Date) {
    if (endTime.getTime() <= startTime.getTime()) throw new HttpError(400, 'END_TIME_MUST_BE_AFTER_START_TIME');
    const vehicle = await this.db.rentalFleetVehicle.findUnique({ where: { id: vehicleId }, include: { hub: true } });
    if (!vehicle) throw new HttpError(404, 'VEHICLE_NOT_FOUND');
    const quote = this.calculateQuote({ ...vehicle, hub: vehicle.hub }, startTime, endTime);
    const km = resolveKmPolicy(vehicle, vehicle.hub);
    return {
      vehicleId,
      days: Math.max(1, quote.billableDays + (quote.remainderHours > 0 ? 1 : 0)),
      totalHours: quote.totalHours,
      gstPercent: rentalGstPercent(),
      baseFarePaise: quote.baseFarePaise.toString(),
      taxPaise: quote.taxPaise.toString(),
      securityDepositPaise: quote.securityDepositPaise.toString(),
      totalPayablePaise: quote.totalPayablePaise.toString(),
      includedKm: quote.includedKm,
      includedKmPerDay: km.includedKmPerDay,
      extraKmRatePaise: quote.extraKmRatePaise.toString(),
      kmPolicySource: km.source,
    };
  }

  async createWalkInBooking(
    employeeId: string,
    input: {
      vehicleId: string;
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      startTime: Date;
      endTime: Date;
      licenseNumber: string;
      licenseExpiry: Date;
      dateOfBirth: Date;
      drivingExperienceYears: number;
      licenseFrontUrl: string;
      licenseBackUrl: string;
      paymentMethod: string;
      transactionReference?: string;
      startOdometerKm?: number;
      fuelPercent?: number;
      notes?: string;
      immediateHandover?: boolean;
    }
  ) {
    // The driver's details come from the licence the customer shows at the counter. None of them is defaulted: a stock picture,
    // a placeholder number or an assumed date of birth would mark a driver nobody checked as verified.
    const licensePhotos = requireLicensePhotos(input.licenseFrontUrl, input.licenseBackUrl);
    const licenseNumber = requireLicenseNumber(input.licenseNumber);
    const dateOfBirth = requireAdultDateOfBirth(input.dateOfBirth);
    const drivingExperienceYears = requireDrivingExperience(input.drivingExperienceYears);
    if (input.endTime.getTime() <= input.startTime.getTime()) {
      throw new HttpError(400, 'END_TIME_MUST_BE_AFTER_START_TIME');
    }

    const vehicle = await this.db.rentalFleetVehicle.findUnique({
      where: { id: input.vehicleId },
      include: { hub: true },
    });
    if (!vehicle) {
      throw new HttpError(404, 'VEHICLE_NOT_FOUND');
    }
    if (vehicle.status !== RentalVehicleStatus.AVAILABLE) {
      throw new HttpError(409, `VEHICLE_NOT_AVAILABLE_FOR_RENTAL (Status: ${vehicle.status})`);
    }
    // The counter must respect future bookings, holds and blocks exactly like online customers do.
    const walkInAvailability = (await this.loadAvailabilityFor(this.db, [vehicle], input.startTime, input.endTime)).get(vehicle.id);
    if (walkInAvailability && !walkInAvailability.bookable) {
      throw new HttpError(409, `VEHICLE_NOT_AVAILABLE_FOR_RENTAL (${walkInAvailability.label})`, walkInAvailability.label);
    }

    if (Number.isNaN(input.licenseExpiry.getTime()) || input.licenseExpiry.getTime() < input.endTime.getTime()) {
      throw new HttpError(400, 'LICENSE_EXPIRES_BEFORE_RETURN', 'The driving licence must be valid until the return date.');
    }

    // Odometer and fuel at hand-over must agree with the vehicle's own record. The reading can only go up, and the fuel
    // level defaults to what the vehicle last recorded (not an invented 100%).
    const recordedOdometer = vehicle.odometerKm ?? 0;
    if (input.immediateHandover && typeof input.startOdometerKm === 'number' && input.startOdometerKm < recordedOdometer) {
      throw new HttpError(400, 'ODOMETER_BELOW_RECORDED', `Odometer cannot be lower than the vehicle's recorded ${recordedOdometer.toLocaleString('en-IN')} km.`);
    }
    const handoverOdometerKm = Math.max(input.startOdometerKm ?? recordedOdometer, recordedOdometer);
    const handoverFuelPercent = typeof input.fuelPercent === 'number' ? input.fuelPercent : vehicle.fuelLevelPercent ?? 100;

    // One account per customer: use theirs, or create it (and invite them to the app when we have their Gmail)
    const resolved = await resolveWalkInCustomer(this.db, {
      name: input.customerName,
      phone: input.customerPhone,
      email: input.customerEmail,
      placeholderDomain: 'rental.vmotiv.in',
      context: 'your rental booking and trip',
    });
    const customer = resolved.user;

    // Same pricing as the customer quote (hourly remainder, GST rate, hub km policy) so the counter and the app never disagree.
    const quote = this.calculateQuote({ ...vehicle, hub: vehicle.hub }, input.startTime, input.endTime);
    const days = Math.max(1, quote.billableDays + (quote.remainderHours > 0 ? 1 : 0));
    const { baseFarePaise, taxPaise, securityDepositPaise, totalPayablePaise, includedKm, extraKmRatePaise } = quote;

    return await this.db.$transaction(async tx => {
      const count = await tx.rentalBooking.count();
      const bookingNumber = `VMR-${currentCalendarYear()}-${String(count + 1).padStart(5, '0')}`;

      const bookingStatus = input.immediateHandover
        ? RentalBookingStatus.TRIP_ACTIVE
        : RentalBookingStatus.CONFIRMED;

      const booking = await tx.rentalBooking.create({
        data: {
          bookingNumber,
          customerId: customer.id,
          vehicleId: vehicle.id,
          pickupHubId: vehicle.hubId,
          returnHubId: vehicle.hubId,
          startTime: input.startTime,
          endTime: input.endTime,
          status: bookingStatus,
          kycStatus: RentalDriverKycStatus.VERIFIED,
          pricingSnapshot: {
            days,
            baseFarePaise: baseFarePaise.toString(),
            taxPaise: taxPaise.toString(),
            securityDepositPaise: securityDepositPaise.toString(),
            totalPayablePaise: totalPayablePaise.toString(),
            includedKm,
            extraKmRatePaise: extraKmRatePaise.toString(),
            source: 'OFFLINE_HUB_WALKIN',
          },
          baseFarePaise,
          taxPaise,
          securityDepositPaise,
          totalPayablePaise,
          includedKm,
          extraKmRatePaise,
          customerNotes: input.notes ? `[Offline Hub Walk-in] ${input.notes}` : '[Offline Hub Walk-in]',
        },
      });

      // Agreement record
      await tx.rentalAgreementAcceptance.create({
        data: {
          bookingId: booking.id,
          customerId: customer.id,
          termsVersion: 'VMR-HUB-OFFLINE-V2026.1',
          ipAddress: 'HUB-OFFLINE-TERMINAL',
          userAgent: 'Operations Portal Staff Walk-In',
        },
      });

      // Driver KYC Verification Record (Verified by staff in person)
      await tx.rentalDriverVerification.create({
        data: {
          bookingId: booking.id,
          customerId: customer.id,
          licenseNumber,
          licenseExpiry: input.licenseExpiry,
          licenseCategory: 'LMV',
          dateOfBirth,
          drivingExperienceYears,
          licenseFrontUrl: licensePhotos.front,
          licenseBackUrl: licensePhotos.back,
          status: RentalDriverKycStatus.VERIFIED,
          verifiedById: employeeId,
          verifiedAt: new Date(),
        },
      });

      // Counter payment records: the rental charges, and the refundable deposit separately (it is held, not earned).
      const counterReference = input.transactionReference || `OFFLINE-COUNTER-${Date.now()}`;
      await tx.rentalPaymentRecord.create({
        data: {
          bookingId: booking.id,
          type: RentalPaymentType.RENTAL_PREPAYMENT,
          amountPaise: baseFarePaise + taxPaise,
          status: RentalPaymentStatus.VERIFIED,
          paymentGateway: input.paymentMethod || 'OFFLINE_COUNTER',
          gatewayPaymentId: counterReference,
          verifiedAt: new Date(),
        },
      });
      if (securityDepositPaise > 0n) {
        await tx.rentalPaymentRecord.create({
          data: {
            bookingId: booking.id,
            type: RentalPaymentType.REFUNDABLE_DEPOSIT,
            amountPaise: securityDepositPaise,
            status: RentalPaymentStatus.VERIFIED,
            paymentGateway: input.paymentMethod || 'OFFLINE_COUNTER',
            gatewayPaymentId: `${counterReference}-DEPOSIT`,
            verifiedAt: new Date(),
          },
        });
        await tx.rentalBooking.update({ where: { id: booking.id }, data: { depositStatus: 'HELD_ESCROW' } });
      }

      // If immediate handover, release keys and set trip active!
      if (input.immediateHandover) {
        await tx.rentalTrip.upsert({
          where: { bookingId: booking.id },
          create: {
            bookingId: booking.id,
            pickupTime: new Date(),
            pickupOdometerKm: handoverOdometerKm,
            pickupFuelPercent: handoverFuelPercent,
            pickupStaffId: employeeId,
            pickupCustomerSigned: true,
            pickupNotes: input.notes || 'Verified on-road rental at hub counter - keys handed over.',
          },
          update: {
            pickupTime: new Date(),
            pickupOdometerKm: handoverOdometerKm,
            pickupFuelPercent: handoverFuelPercent,
            pickupStaffId: employeeId,
            pickupCustomerSigned: true,
            pickupNotes: input.notes || 'Verified on-road rental at hub counter - keys handed over.',
          },
        });

        await tx.rentalFleetVehicle.update({
          where: { id: vehicle.id },
          data: {
            status: RentalVehicleStatus.ON_TRIP,
            odometerKm: handoverOdometerKm,
            fuelLevelPercent: handoverFuelPercent,
          },
        });
      }

      await tx.rentalAuditEvent.create({
        data: {
          bookingId: booking.id,
          vehicleId: vehicle.id,
          eventType: 'RENTAL_OFFLINE_WALKIN_BOOKED',
          actorId: employeeId,
          metadata: {
            bookingNumber,
            customerName: input.customerName,
            immediateHandover: Boolean(input.immediateHandover),
            totalPayablePaise: totalPayablePaise.toString(),
          },
        },
      });

      // Dispatch walk-in confirmation email & notifications
      if (customer?.email) {
        const vehicleTitle = `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.variant || ''}`.trim();
        const startStr = input.startTime.toISOString().replace('T', ' ').slice(0, 16);
        const endStr = input.endTime.toISOString().replace('T', ' ').slice(0, 16);
        const fareStr = `₹${(Number(baseFarePaise + taxPaise) / 100).toLocaleString('en-IN')}`;
        const depStr = `₹${(Number(securityDepositPaise) / 100).toLocaleString('en-IN')}`;
        const totalStr = `₹${(Number(totalPayablePaise) / 100).toLocaleString('en-IN')}`;
        const hubTitle = vehicle.hub?.name ? `${vehicle.hub.name} (${vehicle.hub.city})` : 'Local Hub';

        await tx.emailOutbox.create({
          data: {
            userId: customer.id,
            recipient: customer.email,
            templateVersion: 'rental-booking-confirmed-v1',
            eventKey: `rental-walkin/${booking.id}`,
            subject: `Rental Booking Confirmed [${bookingNumber}] · ${vehicleTitle}`,
            text: `Your walk-in on-road rental booking has been registered at the hub!\n\nBooking: ${bookingNumber}\nVehicle: ${vehicleTitle} (${vehicle.registrationNumber || 'Fleet Vehicle'})\nPickup Hub: ${hubTitle}\n\nSchedule:\n• Pickup Time: ${startStr}\n• Expected Return: ${endStr}\n• Included Allowance: ${includedKm} km\n\nPayment Breakdown:\n• Rental Tariff: ${fareStr}\n• Security Deposit: ${depStr}\n• Total Paid at Counter: ${totalStr}\n\nEmergency & Roadside Hotline: 1800-866-848.\n\nYou can view and track this rental in the V MOTIV mobile app under Activity.`,
          },
        });

        if (input.immediateHandover) {
          await tx.emailOutbox.create({
            data: {
              userId: customer.id,
              recipient: customer.email,
              templateVersion: 'rental-trip-started-v1',
              eventKey: `rental-walkin-trip/${booking.id}`,
              subject: `Rental Trip Started [${bookingNumber}] · ${vehicleTitle}`,
              text: `Your rental keys have been handed over and trip is now active!\n\nBooking: ${bookingNumber}\nVehicle: ${vehicleTitle}\nStart Odometer: ${handoverOdometerKm.toLocaleString('en-IN')} km\nStart Fuel: ${handoverFuelPercent}%\nReturn Scheduled: ${endStr}\n\nEmergency Roadside Helpline: 1800-866-848.\n\nSafe travels with V MOTIV!`,
            },
          });
        }
      }

      if (this.notifications) {
        void this.notifications.dispatchDomainEvent({
          type: 'RENTAL_BOOKING_CONFIRMED',
          actorId: employeeId,
          referenceId: booking.id,
          entityType: 'RentalBooking',
          title: 'Walk-In Rental Confirmed',
          body: `Rental ${bookingNumber} for ${vehicle.make} ${vehicle.model} registered at hub.`,
          category: 'RENTAL',
          recipientUserIds: [customer.id],
          recipientRoles: ['RENTAL_MANAGER', 'RENTAL_DISPATCH'],
          deepLink: `vmotiv://rentals/${booking.id}`,
        });
      }

      const created = await tx.rentalBooking.findUnique({
        where: { id: booking.id },
        include: {
          customer: { select: { id: true, displayName: true, email: true, phone: true } },
          vehicle: { include: { hub: true } },
          driverVerification: true,
          trip: true,
          payments: true,
        },
      });
      return created && Object.assign(created, {
        customerAccount: {
          created: resolved.accountCreated,
          existing: resolved.existingAccount,
          appInviteEmailed: resolved.inviteEmailed,
          email: resolved.inviteEmailed ? resolved.user.email : null,
        },
      });
    });
  }

  /**
   * Evaluates authoritative pickup readiness gates.
   */
  public computePickupReadiness(
    booking: any,
    outstandingPaise: bigint,
    currentPaymentStatus: string
  ) {
    const blockers: string[] = [];
    const checklist = {
      rentalPaymentComplete: false,
      depositSatisfied: true,
      driverEligible: false,
      vehicleReady: false,
      termsAccepted: true,
      bookingConfirmed: false,
    };

    if (
      booking.status === RentalBookingStatus.CONFIRMED ||
      booking.status === RentalBookingStatus.TRIP_ACTIVE ||
      booking.status === RentalBookingStatus.SETTLED
    ) {
      checklist.bookingConfirmed = true;
    } else {
      blockers.push('BOOKING_NOT_CONFIRMED');
    }

    if (outstandingPaise === 0n && (currentPaymentStatus === 'PAID_IN_FULL' || booking.rentalPaymentStatus === 'PAID_IN_FULL')) {
      checklist.rentalPaymentComplete = true;
    } else {
      blockers.push('RENTAL_BALANCE_PENDING');
    }

    // The refundable security deposit is collected at the counter (it is not charged in the app) and must be recorded before the keys go out.
    if (depositStillDue(booking)) {
      checklist.depositSatisfied = false;
      blockers.push('DEPOSIT_NOT_COLLECTED');
    }

    if (booking.kycStatus === RentalDriverKycStatus.VERIFIED) {
      checklist.driverEligible = true;
    } else {
      blockers.push('KYC_NOT_VERIFIED');
    }

    if (
      !booking.vehicle ||
      booking.vehicle.status === RentalVehicleStatus.AVAILABLE ||
      booking.vehicle.status === RentalVehicleStatus.ON_TRIP ||
      booking.vehicle.status === RentalVehicleStatus.RESERVED
    ) {
      checklist.vehicleReady = true;
    } else {
      blockers.push('VEHICLE_NOT_READY');
    }

    const eligible = blockers.length === 0;

    const reasons = blockers.map(b => {
      switch (b) {
        case 'RENTAL_BALANCE_PENDING':
          return 'Rental charges balance is unpaid. Full payment required prior to handover.';
        case 'BOOKING_NOT_CONFIRMED':
          return 'Booking is not confirmed.';
        case 'KYC_NOT_VERIFIED':
          return 'Primary driver KYC identity is not verified.';
        case 'VEHICLE_NOT_READY':
          return 'Vehicle is not in available or assigned state.';
        case 'DEPOSIT_NOT_COLLECTED':
          return `Security deposit of ₹${(Number(booking.securityDepositPaise) / 100).toLocaleString('en-IN')} has not been collected. Collect it at the counter and record it (Record Payment → Deposit) before handing over the keys.`;
        default:
          return b;
      }
    });

    return {
      eligible,
      isReady: eligible,
      blockers,
      reasons,
      checklist,
    };
  }

  /**
   * Fetches available payment plans for a hold or vehicle based on notice window.
   */
  async getPaymentOptions(holdOrVehicleId: string, startTimeQuery?: string | Date) {
    let hold = await this.db.rentalBookingHold.findUnique({
      where: { id: holdOrVehicleId },
      include: { vehicle: true },
    });

    let startTime: Date;
    let quote: QuoteBreakdown;

    if (hold) {
      startTime = hold.startTime;
      quote = hold.quoteSnapshot as any as QuoteBreakdown;
    } else {
      const vehicle = await this.db.rentalFleetVehicle.findUnique({
        where: { id: holdOrVehicleId },
      });
      if (!vehicle) throw new HttpError(404, 'HOLD_OR_VEHICLE_NOT_FOUND');
      startTime = startTimeQuery ? new Date(startTimeQuery) : new Date(Date.now() + 48 * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + 48 * 60 * 60 * 1000);
      quote = this.calculateQuote(vehicle, startTime, endTime);
    }

    const hoursToPickup = (startTime.getTime() - Date.now()) / (1000 * 60 * 60);
    const totalRentalPaise = BigInt(quote.baseFarePaise) + BigInt(quote.taxPaise);
    const securityDepositPaise = BigInt(quote.securityDepositPaise);
    const balanceDueAt = new Date(startTime.getTime() - 24 * 60 * 60 * 1000);

    const is25Available = hoursToPickup > 72;
    const advance25Paise = (totalRentalPaise * 25n) / 100n;
    const balance25Paise = totalRentalPaise - advance25Paise;

    const is50Available = hoursToPickup > 24;
    const advance50Paise = (totalRentalPaise * 50n) / 100n;
    const balance50Paise = totalRentalPaise - advance50Paise;

    const is100Available = true;

    return {
      quoteId: hold?.id || holdOrVehicleId,
      policyVersion: 'VMR-POL-2026.1',
      currency: 'INR',
      pickupTime: startTime.toISOString(),
      hoursToPickup: Math.round(hoursToPickup * 10) / 10,
      rentalChargesPaise: totalRentalPaise.toString(),
      baseFarePaise: quote.baseFarePaise.toString(),
      taxPaise: quote.taxPaise.toString(),
      securityDepositPaise: securityDepositPaise.toString(),
      termsVersion: quote.termsVersion || 'VMR-TERMS-V2026.1',
      plans: [
        {
          planId: 'ADVANCE_25',
          name: 'Pay 25% Advance',
          type: 'PARTIAL',
          advancePercent: 25,
          advancePaise: advance25Paise.toString(),
          balancePaise: balance25Paise.toString(),
          securityDepositPaise: securityDepositPaise.toString(),
          initialPaymentDuePaise: advance25Paise.toString(),
          balanceDueAt: balanceDueAt.toISOString(),
          isAvailable: is25Available,
          ineligibilityReason: is25Available ? null : 'Available only when booking more than 72 hours before pickup',
        },
        {
          planId: 'ADVANCE_50',
          name: 'Pay 50% Advance',
          type: 'PARTIAL',
          advancePercent: 50,
          advancePaise: advance50Paise.toString(),
          balancePaise: balance50Paise.toString(),
          securityDepositPaise: securityDepositPaise.toString(),
          initialPaymentDuePaise: advance50Paise.toString(),
          balanceDueAt: balanceDueAt.toISOString(),
          isAvailable: is50Available,
          ineligibilityReason: is50Available ? null : 'Within 24 hours of pickup, 100% full payment is required',
        },
        {
          planId: 'FULL_100',
          name: 'Pay 100% in Full',
          type: 'FULL',
          advancePercent: 100,
          advancePaise: totalRentalPaise.toString(),
          balancePaise: '0',
          securityDepositPaise: securityDepositPaise.toString(),
          initialPaymentDuePaise: totalRentalPaise.toString(),
          balanceDueAt: null,
          isAvailable: is100Available,
          ineligibilityReason: null,
        },
      ],
    };
  }

  /**
   * Authoritative Payment Summary DTO consumed by Customer and Operations.
   */
  async getPaymentSummary(bookingId: string, customerId?: string, isOperations = false) {
    const booking = await this.db.rentalBooking.findUnique({
      where: { id: bookingId },
      include: {
        payments: { orderBy: { createdAt: 'desc' } },
        vehicle: true,
        driverVerification: true,
      },
    });
    if (!booking) throw new HttpError(404, 'RENTAL_BOOKING_NOT_FOUND');
    if (customerId && booking.customerId !== customerId && !isOperations) {
      throw new HttpError(403, 'FORBIDDEN_BOOKING_OWNER_MISMATCH');
    }

    const totalRentalPaise = booking.baseFarePaise + booking.taxPaise;
    const verifiedPayments = booking.payments.filter(p => p.status === RentalPaymentStatus.VERIFIED);
    const paymentsVerifiedPaise = verifiedPayments.reduce((acc, p) => acc + p.amountPaise, 0n);
    const dbVerifiedPaise = booking.verifiedPaidPaise || 0n;
    const verifiedPaidPaise = paymentsVerifiedPaise > dbVerifiedPaise ? paymentsVerifiedPaise : dbVerifiedPaise;
    const outstandingPaise = totalRentalPaise > verifiedPaidPaise ? totalRentalPaise - verifiedPaidPaise : 0n;

    // Auto-heal orphaned pending payment record to verified if verifiedPaidPaise > 0
    if (verifiedPaidPaise > 0n && verifiedPayments.length === 0 && booking.payments.length > 0) {
      const firstPending = booking.payments.find(p => p.status === RentalPaymentStatus.PENDING);
      if (firstPending) {
        firstPending.status = RentalPaymentStatus.VERIFIED;
        void this.db.rentalPaymentRecord.update({
          where: { id: firstPending.id },
          data: { status: RentalPaymentStatus.VERIFIED, verifiedAt: new Date() },
        }).catch(() => {});
      }
    }

    const isOverdue = Boolean(booking.balanceDueAt && new Date() > booking.balanceDueAt && outstandingPaise > 0n);

    let currentPaymentStatus: string = booking.rentalPaymentStatus || 'NOT_PAID';
    if (outstandingPaise === 0n && verifiedPaidPaise > 0n) {
      currentPaymentStatus = 'PAID_IN_FULL';
    } else if (isOverdue) {
      currentPaymentStatus = 'OVERDUE';
    } else if (verifiedPaidPaise > 0n) {
      currentPaymentStatus = 'PARTIALLY_PAID';
    }

    const readiness = this.computePickupReadiness(booking, outstandingPaise, currentPaymentStatus);

    return {
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      bookingStatus: booking.status,
      currency: 'INR',
      paymentPlan: booking.paymentPlanSnapshot || {
        planId: 'FULL_100',
        type: 'FULL',
        name: 'Pay 100% in Full',
        advancePercent: 100,
        policyVersion: 'VMR-POL-2026.1',
      },
      rentalTotalPaise: totalRentalPaise.toString(),
      baseFarePaise: booking.baseFarePaise.toString(),
      taxPaise: booking.taxPaise.toString(),
      verifiedPaidPaise: verifiedPaidPaise.toString(),
      outstandingPaise: outstandingPaise.toString(),
      paymentStatus: currentPaymentStatus,
      balanceDueAt: booking.balanceDueAt?.toISOString() || null,
      isOverdue,
      deposit: {
        requiredPaise: booking.securityDepositPaise.toString(),
        status: booking.depositStatus || 'NOT_COLLECTED',
      },
      pickupReadiness: readiness,
    };
  }

  /**
   * Returns itemized payment schedule (Advance installment, Balance installment, Deposit).
   */
  async getPaymentSchedule(bookingId: string, customerId?: string) {
    const summary = await this.getPaymentSummary(bookingId, customerId);
    const booking = await this.db.rentalBooking.findUnique({
      where: { id: bookingId },
      include: { payments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!booking) throw new HttpError(404, 'RENTAL_BOOKING_NOT_FOUND');

    const isAdvancePaid = (booking.verifiedPaidPaise && booking.verifiedPaidPaise > 0n) ||
      summary.verifiedPaidPaise !== '0' ||
      booking.status === RentalBookingStatus.CONFIRMED ||
      booking.status === RentalBookingStatus.TRIP_ACTIVE ||
      booking.status === RentalBookingStatus.SETTLED ||
      booking.rentalPaymentStatus === 'PAID_IN_FULL' ||
      booking.rentalPaymentStatus === 'PARTIALLY_PAID';

    const advancePayment = booking.payments.find(
      p => (p.installmentType === 'ADVANCE' || p.installmentType === 'FULL') && p.status === RentalPaymentStatus.VERIFIED
    ) || booking.payments.find(p => p.installmentType === 'ADVANCE' || p.installmentType === 'FULL');
    const balancePayment = booking.payments.find(p => p.installmentType === 'BALANCE' && p.status === RentalPaymentStatus.VERIFIED);

    const isPartial = booking.paymentPlanSnapshot && (booking.paymentPlanSnapshot as any).type === 'PARTIAL';
    const advancePaise = isPartial
      ? ((booking.paymentPlanSnapshot as any).advancePaise || summary.verifiedPaidPaise)
      : summary.rentalTotalPaise;
    const balancePaise = isPartial
      ? ((booking.paymentPlanSnapshot as any).balancePaise || summary.outstandingPaise)
      : '0';

    const total = Number(summary.rentalTotalPaise || 0);
    const advanceNum = Number(advancePaise || 0);
    const balanceNum = Number(balancePaise || 0);
    const advancePct = total > 0 ? Math.round((advanceNum / total) * 100) : (isPartial ? 20 : 100);
    const balancePct = total > 0 ? 100 - advancePct : 0;

    return {
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      currency: 'INR',
      rentalPaymentStatus: booking.rentalPaymentStatus,
      rentalTotalPaise: summary.rentalTotalPaise,
      rentalTotalRupees: Math.round(total / 100),
      installments: [
        {
          installmentNumber: 1,
          type: isPartial ? 'ADVANCE' : 'FULL',
          title: isPartial ? 'Advance Booking Installment' : 'Full Rental Payment',
          percentage: isPartial ? advancePct : 100,
          amountPaise: advancePaise,
          amountRupees: Math.round(advanceNum / 100),
          status: isAdvancePaid ? 'VERIFIED' : (advancePayment?.status || 'PENDING'),
          dueAt: null,
          paidAt: advancePayment?.verifiedAt?.toISOString() || (isAdvancePaid ? booking.updatedAt.toISOString() : null),
          gatewayOrderId: advancePayment?.gatewayOrderId || null,
          gatewayPaymentId: advancePayment?.gatewayPaymentId || null,
        },
        ...(isPartial
          ? [
              {
                installmentNumber: 2,
                type: 'BALANCE',
                title: 'Remaining Rental Balance',
                percentage: balancePct,
                amountPaise: balancePaise,
                amountRupees: Math.round(balanceNum / 100),
                status: summary.paymentStatus === 'PAID_IN_FULL'
                  ? 'VERIFIED'
                  : summary.isOverdue
                  ? 'OVERDUE'
                  : 'PENDING',
                dueAt: summary.balanceDueAt,
                paidAt: balancePayment?.verifiedAt?.toISOString() || null,
                gatewayOrderId: balancePayment?.gatewayOrderId || null,
                gatewayPaymentId: balancePayment?.gatewayPaymentId || null,
              },
            ]
          : []),
      ],
      deposit: {
        title: 'Refundable Security Deposit',
        amountPaise: summary.deposit.requiredPaise,
        status: summary.deposit.status,
        note: 'Held separately; refundable post-trip inspection and settlement.',
      },
    };
  }

  /**
   * Returns immutable payment transaction history.
   */
  async getPaymentHistory(bookingId: string, customerId?: string) {
    const booking = await this.db.rentalBooking.findUnique({
      where: { id: bookingId },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!booking) throw new HttpError(404, 'RENTAL_BOOKING_NOT_FOUND');
    if (customerId && booking.customerId !== customerId) {
      throw new HttpError(403, 'FORBIDDEN_BOOKING_OWNER_MISMATCH');
    }

    return booking.payments.map(p => ({
      id: p.id,
      bookingId: p.bookingId,
      type: p.type,
      installmentType: p.installmentType || 'FULL',
      amountPaise: p.amountPaise.toString(),
      amountRupees: Math.round(Number(p.amountPaise) / 100),
      status: p.status,
      provider: p.paymentGateway,
      paymentGateway: p.paymentGateway,
      reference: p.gatewayPaymentId || p.gatewayOrderId || '—',
      gatewayOrderId: p.gatewayOrderId,
      gatewayPaymentId: p.gatewayPaymentId,
      createdAt: p.createdAt.toISOString(),
      verifiedAt: p.verifiedAt?.toISOString() || null,
    }));
  }

  /**
   * Creates an idempotent payment order for remaining balance.
   */
  async createBalancePaymentOrder(customerId: string, bookingId: string) {
    const booking = await this.db.rentalBooking.findUnique({
      where: { id: bookingId },
      include: { payments: true },
    });
    if (!booking) throw new HttpError(404, 'RENTAL_BOOKING_NOT_FOUND');
    if (booking.customerId !== customerId) throw new HttpError(403, 'FORBIDDEN_BOOKING_OWNER_MISMATCH');
    if (booking.status === RentalBookingStatus.CANCELLED) throw new HttpError(400, 'BOOKING_IS_CANCELLED');

    const totalRental = booking.baseFarePaise + booking.taxPaise;
    const verifiedPayments = booking.payments.filter(p => p.status === RentalPaymentStatus.VERIFIED);
    const verifiedPaid = verifiedPayments.reduce((acc, p) => acc + p.amountPaise, 0n);
    const outstanding = totalRental > verifiedPaid ? totalRental - verifiedPaid : 0n;

    if (outstanding <= 0n || booking.rentalPaymentStatus === 'PAID_IN_FULL') {
      throw new HttpError(400, 'NO_OUTSTANDING_RENTAL_BALANCE');
    }

    // Idempotency: reuse recently created pending order if within 15 mins
    const recentPending = booking.payments.find(
      p => p.installmentType === 'BALANCE' && p.status === RentalPaymentStatus.PENDING &&
           (Date.now() - p.createdAt.getTime()) < 15 * 60 * 1000
    );
    if (recentPending && recentPending.gatewayOrderId) {
      return {
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        gatewayOrderId: recentPending.gatewayOrderId,
        amountPaise: outstanding.toString(),
        currency: 'INR',
      };
    }

    const gatewayOrderId = `order_bal_${booking.bookingNumber}_${Date.now()}`;
    await this.db.rentalPaymentRecord.create({
      data: {
        bookingId: booking.id,
        type: RentalPaymentType.RENTAL_PREPAYMENT,
        installmentType: 'BALANCE',
        amountPaise: outstanding,
        status: RentalPaymentStatus.PENDING,
        paymentGateway: 'RAZORPAY',
        gatewayOrderId,
      },
    });

    return {
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      gatewayOrderId,
      amountPaise: outstanding.toString(),
      currency: 'INR',
    };
  }

  /**
   * Verifies payment for remaining balance.
   */
  async verifyBalancePayment(
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
        include: { payments: true, vehicle: true },
      });
      if (!booking) throw new HttpError(404, 'RENTAL_BOOKING_NOT_FOUND');
      if (booking.customerId !== customerId) throw new HttpError(403, 'FORBIDDEN_BOOKING_OWNER_MISMATCH');

      // Idempotency
      const existing = booking.payments.find(
        p => p.gatewayPaymentId === input.gatewayPaymentId && p.status === RentalPaymentStatus.VERIFIED
      );
      if (existing && booking.rentalPaymentStatus === 'PAID_IN_FULL') {
        return { success: true, booking, alreadyVerified: true };
      }

      // Signature verification
      assertGatewayPaymentSignature(input);

      const totalRental = booking.baseFarePaise + booking.taxPaise;
      const verifiedBefore = booking.payments
        .filter(p => p.status === RentalPaymentStatus.VERIFIED)
        .reduce((acc, p) => acc + p.amountPaise, 0n);
      const balanceAmount = totalRental > verifiedBefore ? totalRental - verifiedBefore : totalRental;
      await assertCapturedAmount(input, balanceAmount);

      await tx.rentalPaymentRecord.upsert({
        where: { idempotencyKey: input.gatewayPaymentId },
        update: {
          status: RentalPaymentStatus.VERIFIED,
          verifiedAt: new Date(),
          installmentType: 'BALANCE',
        },
        create: {
          bookingId: booking.id,
          type: RentalPaymentType.RENTAL_PREPAYMENT,
          installmentType: 'BALANCE',
          amountPaise: balanceAmount,
          status: RentalPaymentStatus.VERIFIED,
          paymentGateway: input.paymentGateway || 'RAZORPAY',
          gatewayOrderId: input.gatewayOrderId,
          gatewayPaymentId: input.gatewayPaymentId,
          gatewaySignature: input.gatewaySignature,
          idempotencyKey: input.gatewayPaymentId,
          verifiedAt: new Date(),
        },
      });

      const updatedBooking = await tx.rentalBooking.update({
        where: { id: booking.id },
        data: {
          rentalPaymentStatus: 'PAID_IN_FULL',
          verifiedPaidPaise: totalRental,
          outstandingBalancePaise: 0n,
        },
        include: {
          vehicle: { include: { hub: true } },
          pickupHub: true,
          returnHub: true,
          driverVerification: true,
          payments: true,
        },
      });

      await tx.rentalAuditEvent.create({
        data: {
          bookingId: booking.id,
          vehicleId: booking.vehicleId,
          eventType: 'RENTAL_BALANCE_PAID',
          actorId: customerId,
          metadata: { gatewayPaymentId: input.gatewayPaymentId, verifiedPaidPaise: totalRental.toString() },
        },
      });

      return {
        success: true,
        booking: updatedBooking,
        rentalPaymentStatus: 'PAID_IN_FULL',
        verifiedPaidPaise: totalRental.toString(),
        outstandingBalancePaise: '0',
      };
    });
  }

  /**
   * Operations: Record manual / offline counter payment for a rental booking.
   */
  async recordOperationsPayment(
    actorId: string,
    bookingId: string,
    input: {
      type?: 'RENTAL_PREPAYMENT' | 'REFUNDABLE_DEPOSIT' | 'EXTENSION_FEE' | 'ADDITIONAL_CHARGES';
      installmentType?: 'ADVANCE' | 'BALANCE' | 'FULL' | 'DEPOSIT' | 'ADDITIONAL';
      amountRupees?: number;
      amountPaise?: string | number | bigint;
      paymentMethod?: string;
      reference?: string;
      notes?: string;
      autoVerify?: boolean;
    }
  ) {
    const booking = await this.db.rentalBooking.findUnique({
      where: { id: bookingId },
      include: { payments: true, vehicle: true },
    });
    if (!booking) throw new HttpError(404, 'RENTAL_BOOKING_NOT_FOUND');

    const amountPaise = input.amountRupees !== undefined
      ? BigInt(Math.round(input.amountRupees * 100))
      : BigInt(input.amountPaise || 0);

    if (amountPaise <= 0n) {
      throw new HttpError(400, 'INVALID_PAYMENT_AMOUNT');
    }

    const installmentType = input.installmentType || 'BALANCE';
    const paymentType = (input.type as RentalPaymentType) || (
      installmentType === 'DEPOSIT'
        ? RentalPaymentType.REFUNDABLE_DEPOSIT
        : installmentType === 'ADDITIONAL'
        ? RentalPaymentType.ADDITIONAL_CHARGES
        : RentalPaymentType.RENTAL_PREPAYMENT
    );

    return await this.db.$transaction(async tx => {
      const payment = await tx.rentalPaymentRecord.create({
        data: {
          bookingId: booking.id,
          type: paymentType,
          installmentType,
          amountPaise,
          status: RentalPaymentStatus.VERIFIED,
          paymentGateway: input.paymentMethod || 'OFFLINE_COUNTER',
          gatewayOrderId: `OPS-${booking.bookingNumber}`,
          gatewayPaymentId: input.reference || `COUNTER-${Date.now()}`,
          gatewaySignature: 'ops_manual_verified',
          idempotencyKey: `ops_pay_${booking.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          verifiedByFinanceId: actorId,
          verifiedAt: new Date(),
        },
      });

      const totalRental = booking.baseFarePaise + booking.taxPaise;
      const allVerifiedPrepayments = await tx.rentalPaymentRecord.findMany({
        where: {
          bookingId: booking.id,
          status: RentalPaymentStatus.VERIFIED,
          type: RentalPaymentType.RENTAL_PREPAYMENT,
        },
      });
      const totalVerifiedRentalPaise = allVerifiedPrepayments.reduce((acc, p) => acc + p.amountPaise, 0n);
      const outstandingRentalPaise = totalRental > totalVerifiedRentalPaise ? totalRental - totalVerifiedRentalPaise : 0n;

      const rentalPaymentStatus = outstandingRentalPaise === 0n
        ? 'PAID_IN_FULL'
        : (totalVerifiedRentalPaise > 0n ? 'PARTIALLY_PAID' : 'NOT_PAID');

      const isDepositPaid = installmentType === 'DEPOSIT' ||
        (await tx.rentalPaymentRecord.count({
          where: {
            bookingId: booking.id,
            status: RentalPaymentStatus.VERIFIED,
            type: RentalPaymentType.REFUNDABLE_DEPOSIT,
          },
        })) > 0;

      const updateData: any = {
        verifiedPaidPaise: totalVerifiedRentalPaise,
        outstandingBalancePaise: outstandingRentalPaise,
        rentalPaymentStatus,
      };

      if (isDepositPaid) {
        updateData.depositStatus = 'HELD_ESCROW';
      }

      if (booking.status === RentalBookingStatus.PENDING_PAYMENT && totalVerifiedRentalPaise > 0n) {
        updateData.status = RentalBookingStatus.CONFIRMED;
      }

      const updatedBooking = await tx.rentalBooking.update({
        where: { id: booking.id },
        data: updateData,
        include: {
          vehicle: { include: { hub: true } },
          pickupHub: true,
          returnHub: true,
          driverVerification: true,
          payments: true,
        },
      });

      await tx.rentalAuditEvent.create({
        data: {
          bookingId: booking.id,
          vehicleId: booking.vehicleId,
          eventType: 'RENTAL_COUNTER_PAYMENT_RECORDED',
          actorId,
          metadata: {
            amountRupees: Number(amountPaise) / 100,
            installmentType,
            paymentMethod: input.paymentMethod || 'OFFLINE_COUNTER',
            reference: input.reference || null,
            notes: input.notes || null,
          },
        },
      });

      return {
        success: true,
        booking: updatedBooking,
        payment,
      };
    });
  }

  /**
   * Authoritative pickup-readiness check.
   */
  async getPickupReadiness(bookingId: string, customerId?: string) {
    const summary = await this.getPaymentSummary(bookingId, customerId);
    return summary.pickupReadiness;
  }

  /**
   * Operations Payment Dashboard widgets.
   */
  async getOperationsPaymentDashboard(branchId?: string) {
    const where: Prisma.RentalBookingWhereInput = {};
    if (branchId) where.pickupHubId = branchId;

    const now = new Date();
    const [
      allBookings,
      partiallyPaidBookings,
      fullyPaidBookings,
      overduePayments,
      totalBookings,
      reconciliationCount,
    ] = await Promise.all([
      this.db.rentalBooking.findMany({
        where: {
          ...where,
          status: { in: [RentalBookingStatus.CONFIRMED, RentalBookingStatus.PENDING_PAYMENT, RentalBookingStatus.TRIP_ACTIVE] },
        },
        include: {
          vehicle: true,
          driverVerification: true,
          payments: true,
        },
      }),
      this.db.rentalBooking.count({
        where: {
          ...where,
          rentalPaymentStatus: 'PARTIALLY_PAID',
          status: { in: [RentalBookingStatus.CONFIRMED, RentalBookingStatus.PENDING_PAYMENT] },
        },
      }),
      this.db.rentalBooking.count({
        where: {
          ...where,
          rentalPaymentStatus: 'PAID_IN_FULL',
          status: { in: [RentalBookingStatus.CONFIRMED, RentalBookingStatus.TRIP_ACTIVE, RentalBookingStatus.SETTLED] },
        },
      }),
      this.db.rentalBooking.count({
        where: {
          ...where,
          outstandingBalancePaise: { gt: 0n },
          balanceDueAt: { lt: now },
          status: { in: [RentalBookingStatus.CONFIRMED, RentalBookingStatus.PENDING_PAYMENT] },
        },
      }),
      this.db.rentalBooking.count({ where }),
      this.db.rentalPaymentRecord.count({
        where: { status: RentalPaymentStatus.FAILED },
      }),
    ]);

    let upcomingPickupsBlocked = 0;
    for (const b of allBookings) {
      const totalRental = b.baseFarePaise + b.taxPaise;
      const verified = b.payments.filter(p => p.status === RentalPaymentStatus.VERIFIED).reduce((acc, p) => acc + p.amountPaise, 0n);
      const outstanding = totalRental > verified ? totalRental - verified : 0n;
      const readiness = this.computePickupReadiness(b, outstanding, b.rentalPaymentStatus || 'NOT_PAID');
      if (!readiness.eligible) {
        upcomingPickupsBlocked++;
      }
    }

    return {
      partiallyPaidBookings,
      fullyPaidBookings,
      overduePayments,
      upcomingPickupsBlocked,
      paymentReconciliation: reconciliationCount,
      totalBookings,
    };
  }

}
