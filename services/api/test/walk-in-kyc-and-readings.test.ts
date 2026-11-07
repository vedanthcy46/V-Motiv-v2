import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaRentalStore } from '../src/rental-store.js';
import { requireAdultDateOfBirth, requireDrivingExperience, requireLicenseNumber, requireLicensePhotos } from '../src/rental-kyc.js';

type Any = any;

describe('driver details are required, never defaulted', () => {
  const now = new Date('2026-11-05T00:00:00Z');

  it('accepts an adult date of birth, including someone who turned 18 today', () => {
    expect(requireAdultDateOfBirth('1992-03-14', now)).toEqual(new Date('1992-03-14'));
    expect(requireAdultDateOfBirth(new Date('2008-11-05T00:00:00Z'), now)).toEqual(new Date('2008-11-05T00:00:00Z'));
  });

  it('refuses a missing, invalid, future or under-age date of birth', () => {
    for (const bad of [undefined, null, '']) expect(() => requireAdultDateOfBirth(bad as Any, now)).toThrowError(expect.objectContaining({ code: 'DATE_OF_BIRTH_REQUIRED' }));
    expect(() => requireAdultDateOfBirth('not a date', now)).toThrowError(expect.objectContaining({ code: 'INVALID_DATE_OF_BIRTH' }));
    expect(() => requireAdultDateOfBirth('2030-01-01', now)).toThrowError(expect.objectContaining({ code: 'INVALID_DATE_OF_BIRTH' }));
    expect(() => requireAdultDateOfBirth('2008-11-06', now)).toThrowError(expect.objectContaining({ code: 'DRIVER_MUST_BE_AT_LEAST_18_YEARS_OLD' }));
  });

  it('keeps 0 years of experience as an answer and refuses a blank', () => {
    expect(requireDrivingExperience(0)).toBe(0);
    expect(requireDrivingExperience('7')).toBe(7);
    for (const bad of [undefined, null, '', ' ', 'x', -1, 81, 2.5]) {
      expect(() => requireDrivingExperience(bad as Any)).toThrowError(expect.objectContaining({ code: 'DRIVING_EXPERIENCE_REQUIRED' }));
    }
  });

  it('needs a real licence number and both photos', () => {
    expect(requireLicenseNumber(' ka01 2018 0012345 ')).toBe('KA01 2018 0012345');
    expect(() => requireLicenseNumber('')).toThrowError(expect.objectContaining({ code: 'LICENSE_NUMBER_REQUIRED' }));
    expect(() => requireLicenseNumber('ab')).toThrowError(expect.objectContaining({ code: 'LICENSE_NUMBER_REQUIRED' }));
    expect(requireLicensePhotos(' f ', ' b ')).toEqual({ front: 'f', back: 'b' });
    expect(() => requireLicensePhotos('f', '')).toThrowError(expect.objectContaining({ code: 'MANDATORY_LICENSE_DOCUMENTS_MISSING' }));
    expect(() => requireLicensePhotos(undefined, 'b')).toThrowError(expect.objectContaining({ code: 'MANDATORY_LICENSE_DOCUMENTS_MISSING' }));
  });
});

describe('walk-in rental booking keeps the driver details it was given', () => {
  const vehicle = { id: 'veh-1', status: 'AVAILABLE', odometerKm: 41200, fuelLevelPercent: 62, hubId: 'hub-1', hub: null };
  const input = (extra: Record<string, unknown> = {}) => ({
    vehicleId: 'veh-1', customerName: 'A', customerPhone: '9', licenseNumber: 'KA01 2018 0012345', licenseExpiry: new Date('2030-01-01T00:00:00Z'),
    dateOfBirth: new Date('1992-03-14T00:00:00Z'), drivingExperienceYears: 0, licenseFrontUrl: 'f', licenseBackUrl: 'b', paymentMethod: 'UPI',
    startTime: new Date('2026-11-06T10:00:00Z'), endTime: new Date('2026-11-08T10:00:00Z'), immediateHandover: true, ...extra,
  }) as Any;
  const makeStore = () => {
    let customersCreated = 0;
    const db: Any = {
      rentalFleetVehicle: { findUnique: async () => vehicle },
      user: { findFirst: async () => null, create: async () => { customersCreated += 1; return { id: 'u' }; } },
    };
    const store = new PrismaRentalStore(db as PrismaClient) as Any;
    store.loadAvailabilityFor = async () => new Map();
    return { store, customersCreated: () => customersCreated };
  };

  it.each([
    ['no licence number', { licenseNumber: '' }, 'LICENSE_NUMBER_REQUIRED'],
    ['no front photo', { licenseFrontUrl: '' }, 'MANDATORY_LICENSE_DOCUMENTS_MISSING'],
    ['no back photo', { licenseBackUrl: undefined }, 'MANDATORY_LICENSE_DOCUMENTS_MISSING'],
    ['no date of birth', { dateOfBirth: undefined }, 'DATE_OF_BIRTH_REQUIRED'],
    ['a driver under 18', { dateOfBirth: new Date('2012-01-01T00:00:00Z') }, 'DRIVER_MUST_BE_AT_LEAST_18_YEARS_OLD'],
    ['no years of experience', { drivingExperienceYears: undefined }, 'DRIVING_EXPERIENCE_REQUIRED'],
  ])('refuses %s before any customer is created', async (_label, change, code) => {
    const { store, customersCreated } = makeStore();
    await expect(store.createWalkInBooking('emp-1', input(change))).rejects.toMatchObject({ status: 400, code });
    expect(customersCreated()).toBe(0);
  });
});

describe('hub licence upload', () => {
  const booking = { id: 'b-1', customerId: 'c-1', endTime: new Date('2026-11-08T10:00:00Z') };
  function makeStore() {
    const upserts: Any[] = [];
    const db: Any = {
      rentalBooking: { findUnique: async () => booking, update: async () => ({}) },
      rentalDriverVerification: { upsert: async (args: Any) => { upserts.push(args); return { bookingId: 'b-1' }; } },
      rentalAuditEvent: { create: async () => ({}) },
      $transaction: async (fn: (tx: Any) => Promise<unknown>) => fn(db),
    };
    return { store: new PrismaRentalStore(db as PrismaClient) as Any, upserts };
  }
  const good = { licenseNumber: 'ka01 123', licenseExpiry: new Date('2030-01-01T00:00:00Z'), dateOfBirth: new Date('1990-06-15T00:00:00Z'), drivingExperienceYears: 0, licenseFrontUrl: 'f', licenseBackUrl: 'b' };

  it('stores the details exactly as entered', async () => {
    const { store, upserts } = makeStore();
    await store.updateDriverKycDocuments('emp-1', 'b-1', good);
    expect(upserts[0].update).toMatchObject({ licenseNumber: 'KA01 123', dateOfBirth: good.dateOfBirth, drivingExperienceYears: 0, licenseFrontUrl: 'f', licenseBackUrl: 'b', status: 'PENDING_REVIEW' });
    expect(upserts[0].create).toMatchObject({ customerId: 'c-1', dateOfBirth: good.dateOfBirth, drivingExperienceYears: 0 });
  });

  it.each([
    ['no date of birth', { dateOfBirth: undefined }, 'DATE_OF_BIRTH_REQUIRED'],
    ['no experience', { drivingExperienceYears: undefined }, 'DRIVING_EXPERIENCE_REQUIRED'],
    ['no licence number', { licenseNumber: '' }, 'LICENSE_NUMBER_REQUIRED'],
    ['no licence expiry', { licenseExpiry: new Date('invalid') }, 'LICENSE_EXPIRY_REQUIRED'],
    ['a licence that expires before the trip ends', { licenseExpiry: new Date('2026-11-07T00:00:00Z') }, 'DRIVING_LICENSE_EXPIRED_OR_EXPIRES_BEFORE_TRIP_END'],
  ])('refuses %s without saving anything', async (_label, change, code) => {
    const { store, upserts } = makeStore();
    await expect(store.updateDriverKycDocuments('emp-1', 'b-1', { ...good, ...change })).rejects.toMatchObject({ status: 400, code });
    expect(upserts).toHaveLength(0);
  });
});

describe('KYC review decides on submitted documents only', () => {
  function makeStore(verification: Any | null) {
    const created: Any[] = [];
    const updated: Any[] = [];
    const db: Any = {
      rentalBooking: {
        findUnique: async () => ({ id: 'b-1', customerId: 'c-1', endTime: new Date('2026-11-08T10:00:00Z'), customer: null, vehicle: null }),
        update: async () => ({}),
      },
      rentalDriverVerification: {
        findUnique: async () => verification,
        create: async (args: Any) => { created.push(args); return args.data; },
        update: async (args: Any) => { updated.push(args); return { ...verification, ...args.data }; },
      },
      rentalAuditEvent: { create: async () => ({}) },
      $transaction: async (fn: (tx: Any) => Promise<unknown>) => fn(db),
    };
    return { store: new PrismaRentalStore(db as PrismaClient) as Any, created, updated };
  }
  const submitted = { licenseNumber: 'KA01 123', licenseExpiry: new Date('2030-01-01T00:00:00Z'), licenseFrontUrl: 'f', licenseBackUrl: 'b' };

  it('creates no placeholder verification when nothing was submitted - approve or reject', async () => {
    for (const decision of ['APPROVE', 'REJECT'] as const) {
      const { store, created, updated } = makeStore(null);
      await expect(store.reviewDriverKyc('emp-1', 'b-1', decision, 'blurry')).rejects.toMatchObject({ status: 400, code: 'DRIVER_DOCUMENTS_MISSING' });
      expect(created).toHaveLength(0);
      expect(updated).toHaveLength(0);
    }
  });

  it('will not approve without both photos, and substitutes no picture', async () => {
    const { store, updated } = makeStore({ ...submitted, licenseBackUrl: '' });
    await expect(store.reviewDriverKyc('emp-1', 'b-1', 'APPROVE')).rejects.toMatchObject({ status: 400, code: 'MANDATORY_LICENSE_DOCUMENTS_MISSING' });
    expect(updated).toHaveLength(0);
  });

  it('will not approve a licence that expires before the trip ends', async () => {
    const { store } = makeStore({ ...submitted, licenseExpiry: new Date('2026-11-07T00:00:00Z') });
    await expect(store.reviewDriverKyc('emp-1', 'b-1', 'APPROVE')).rejects.toMatchObject({ status: 400, code: 'DRIVING_LICENSE_EXPIRED_OR_EXPIRES_BEFORE_TRIP_END' });
  });

  it('approves and rejects real submissions', async () => {
    const approve = makeStore(submitted);
    await approve.store.reviewDriverKyc('emp-1', 'b-1', 'APPROVE');
    expect(approve.updated[0].data).toMatchObject({ status: 'VERIFIED', verifiedById: 'emp-1' });

    const reject = makeStore(submitted);
    await reject.store.reviewDriverKyc('emp-1', 'b-1', 'REJECT', 'Photo is blurry');
    expect(reject.updated[0].data).toMatchObject({ status: 'REJECTED', rejectionReason: 'Photo is blurry' });
  });
});

describe('correcting a rental car\'s recorded readings', () => {
  function makeStore(vehicle: Any | null) {
    const updates: Any[] = [];
    const audits: Any[] = [];
    const db: Any = {
      rentalFleetVehicle: {
        findUnique: async () => vehicle,
        update: async (args: Any) => { updates.push(args); return { ...vehicle, ...args.data }; },
      },
      rentalAuditEvent: { create: async (args: Any) => { audits.push(args.data); return args.data; } },
      $transaction: async (fn: (tx: Any) => Promise<unknown>) => fn(db),
    };
    return { store: new PrismaRentalStore(db as PrismaClient) as Any, updates, audits };
  }
  const car = { id: 'veh-1', status: 'AVAILABLE', odometerKm: 125000, fuelLevelPercent: 40 };

  it('changes only the reading given and audits the previous and new values with the reason', async () => {
    const { store, updates, audits } = makeStore(car);
    const result = await store.correctVehicleReadings('emp-1', 'veh-1', { odometerKm: 12500, reason: 'Extra zero typed at the last return' });
    expect(updates[0].data).toEqual({ odometerKm: 12500 });
    expect(result).toMatchObject({ odometerKm: 12500, fuelLevelPercent: 40 });
    expect(audits[0]).toMatchObject({
      vehicleId: 'veh-1', eventType: 'RENTAL_VEHICLE_READINGS_CORRECTED', actorId: 'emp-1',
      metadata: { reason: 'Extra zero typed at the last return', previous: { odometerKm: 125000, fuelLevelPercent: 40 }, next: { odometerKm: 12500, fuelLevelPercent: 40 } },
    });
  });

  it('can set the fuel level alone, including an empty tank', async () => {
    const { store, updates } = makeStore(car);
    await store.correctVehicleReadings('emp-1', 'veh-1', { fuelLevelPercent: 0, reason: 'Gauge checked' });
    expect(updates[0].data).toEqual({ fuelLevelPercent: 0 });
  });

  it('is refused while the car is on a trip - the return records its readings', async () => {
    const { store, updates } = makeStore({ ...car, status: 'ON_TRIP' });
    await expect(store.correctVehicleReadings('emp-1', 'veh-1', { odometerKm: 1, reason: 'Fix' })).rejects.toMatchObject({ status: 409, code: 'VEHICLE_ON_TRIP' });
    expect(updates).toHaveLength(0);
  });

  it.each([
    ['without a reason', { odometerKm: 5, reason: ' ' }, 'CORRECTION_REASON_REQUIRED'],
    ['with a one-word reason that is too short', { odometerKm: 5, reason: 'ok' }, 'CORRECTION_REASON_REQUIRED'],
    ['with no reading', { reason: 'Because' }, 'NO_READING_TO_CORRECT'],
    ['with a negative odometer', { odometerKm: -4, reason: 'Because' }, 'INVALID_ODOMETER'],
    ['with a fractional odometer', { odometerKm: 4.5, reason: 'Because' }, 'INVALID_ODOMETER'],
    ['with a fuel level over 100', { fuelLevelPercent: 101, reason: 'Because' }, 'INVALID_FUEL_LEVEL'],
  ])('is refused %s', async (_label, change, code) => {
    const { store, updates, audits } = makeStore(car);
    await expect(store.correctVehicleReadings('emp-1', 'veh-1', change)).rejects.toMatchObject({ status: 400, code });
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it('reports a car that does not exist', async () => {
    const { store } = makeStore(null);
    await expect(store.correctVehicleReadings('emp-1', 'nope', { odometerKm: 5, reason: 'Because' })).rejects.toMatchObject({ status: 404, code: 'RENTAL_VEHICLE_NOT_FOUND' });
  });
});

import { depositStillDue } from '../src/rental-store.js';
describe('security deposit is collected at the counter before the keys go out', () => {
  const store = new PrismaRentalStore({} as PrismaClient) as Any;
  const base = { status: 'CONFIRMED', kycStatus: 'VERIFIED', rentalPaymentStatus: 'PAID_IN_FULL', vehicle: { status: 'AVAILABLE' } };

  it('knows when a deposit is still owed', () => {
    expect(depositStillDue({ securityDepositPaise: 500000n, depositStatus: 'NOT_COLLECTED' })).toBe(true);
    expect(depositStillDue({ securityDepositPaise: 500000n, depositStatus: null })).toBe(true);
    expect(depositStillDue({ securityDepositPaise: 500000n, depositStatus: 'HELD_ESCROW' })).toBe(false);
    expect(depositStillDue({ securityDepositPaise: 0n, depositStatus: 'NOT_COLLECTED' })).toBe(false); // no deposit required
    expect(depositStillDue({})).toBe(false);
  });

  it('blocks pickup readiness until the deposit is recorded, with a clear reason', () => {
    const blocked = store.computePickupReadiness({ ...base, securityDepositPaise: 500000n, depositStatus: 'NOT_COLLECTED' }, 0n, 'PAID_IN_FULL');
    expect(blocked.eligible).toBe(false);
    expect(blocked.blockers).toContain('DEPOSIT_NOT_COLLECTED');
    expect(blocked.checklist.depositSatisfied).toBe(false);
    expect(blocked.reasons.join(' ')).toContain('₹5,000');
    const ready = store.computePickupReadiness({ ...base, securityDepositPaise: 500000n, depositStatus: 'HELD_ESCROW' }, 0n, 'PAID_IN_FULL');
    expect(ready.eligible).toBe(true);
  });

  it('refuses the hand-over itself while the deposit is not collected', async () => {
    const booking = { id: 'b-1', status: 'CONFIRMED', securityDepositPaise: 500000n, depositStatus: 'NOT_COLLECTED', baseFarePaise: 100000n, taxPaise: 18000n, outstandingBalancePaise: 0n, rentalPaymentStatus: 'PAID_IN_FULL', kycStatus: 'VERIFIED', vehicle: {}, driverVerification: {} };
    const db: Any = {
      rentalBooking: { findUnique: async () => booking },
      rentalPaymentRecord: { findMany: async (args: Any) => { expect(args.where.type).toEqual({ not: 'REFUNDABLE_DEPOSIT' }); return [{ amountPaise: 118000n }]; } },
      $transaction: async (fn: (tx: Any) => Promise<unknown>) => fn(db),
    };
    await expect((new PrismaRentalStore(db as PrismaClient) as Any).recordPickupHandover('emp-1', 'b-1', { odometerKm: 1, fuelPercent: 50, photos: [], customerSigned: true }))
      .rejects.toMatchObject({ status: 403, code: 'SECURITY_DEPOSIT_NOT_COLLECTED_CANNOT_HANDOVER_VEHICLE' });
  });
});
