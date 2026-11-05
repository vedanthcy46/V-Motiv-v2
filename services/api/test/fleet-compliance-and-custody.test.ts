import { beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaRentalStore } from '../src/rental-store.js';
import { PrismaServiceStore } from '../src/service-store.js';
import { fuelPercentFromLabel, pickCustodyRecords } from '../src/custody-readings.js';
import { resetVehicleNameCache } from '../src/vehicle-names.js';

type Any = any;

describe('rental fleet onboarding: compliance details are optional', () => {
  beforeEach(() => resetVehicleNameCache());

  function makeStore() {
    const created: Any[] = [];
    const db: Any = {
      serviceHub: {
        findUnique: async () => ({ id: 'hub-1', rentalIncludedKmPerDay: 250, rentalExtraKmRatePaise: 1200n }),
        findFirst: async () => null,
      },
      masterDataItem: { findMany: async () => [] },
      rentalFleetVehicle: { create: async ({ data }: Any) => { created.push(data); return { id: 'veh-1', ...data }; } },
    };
    return { store: new PrismaRentalStore(db as PrismaClient), created };
  }
  const base = {
    registrationNumber: 'ka01ab1234', make: 'Hyundai', model: 'Creta', year: 2024, transmission: 'AUTOMATIC', fuelType: 'PETROL',
    color: 'White', hubId: 'hub-1', baseDailyRatePaise: 280000,
  };

  it('accepts a car with no VIN, permit, insurance or fitness details and stores them as "not on file"', async () => {
    const { store, created } = makeStore();
    await store.createFleetVehicle({ ...base } as Any);
    expect(created[0]).toMatchObject({ registrationNumber: 'KA01AB1234', vin: null, commercialPermitNumber: null, commercialPermitExpiry: null, insurancePolicyNumber: null, insuranceExpiry: null, fitnessCertExpiry: null });
  });

  it('treats blank strings from a form like missing values, never storing an empty VIN', async () => {
    const { store, created } = makeStore();
    await store.createFleetVehicle({ ...base, vin: '   ', commercialPermitNumber: '', insurancePolicyNumber: ' ', insuranceExpiry: '' } as Any);
    expect(created[0].vin).toBeNull();
    expect(created[0].commercialPermitNumber).toBeNull();
    expect(created[0].insurancePolicyNumber).toBeNull();
    expect(created[0].insuranceExpiry).toBeNull();
  });

  it('keeps the details that were entered, in normal form', async () => {
    const { store, created } = makeStore();
    await store.createFleetVehicle({ ...base, vin: ' mal123456789 ', commercialPermitNumber: 'KA-PERMIT-1', commercialPermitExpiry: '2027-03-31', insurancePolicyNumber: 'POL-9', insuranceExpiry: '2027-01-15', fitnessCertExpiry: '2028-02-01' } as Any);
    expect(created[0]).toMatchObject({ vin: 'MAL123456789', commercialPermitNumber: 'KA-PERMIT-1', insurancePolicyNumber: 'POL-9' });
    expect(created[0].commercialPermitExpiry).toEqual(new Date('2027-03-31'));
    expect(created[0].fitnessCertExpiry).toEqual(new Date('2028-02-01'));
  });

  it('still rejects an expiry that is not a real date', async () => {
    const { store, created } = makeStore();
    await expect(store.createFleetVehicle({ ...base, insuranceExpiry: 'not-a-date' } as Any)).rejects.toMatchObject({ status: 400, code: 'INVALID_COMPLIANCE_DATE' });
    expect(created).toHaveLength(0);
  });

  it('records the odometer and fuel level the car joins with, and leaves them to the column defaults otherwise', async () => {
    const { store, created } = makeStore();
    await store.createFleetVehicle({ ...base, odometerKm: 18250, fuelLevelPercent: 0 } as Any);
    expect(created[0]).toMatchObject({ odometerKm: 18250, fuelLevelPercent: 0 });
    await store.createFleetVehicle({ ...base, registrationNumber: 'KA02CD5678' } as Any);
    expect('odometerKm' in created[1]).toBe(false);
    expect('fuelLevelPercent' in created[1]).toBe(false);
  });
});

describe('rental availability with optional compliance dates', () => {
  it('only excludes a document that is on file and expires before the trip ends', async () => {
    let where: Any;
    const db: Any = { rentalFleetVehicle: { findMany: async (args: Any) => { where = args.where; return []; } } };
    const store = new PrismaRentalStore(db as PrismaClient) as Any;
    const start = new Date(Date.now() + 24 * 3600 * 1000);
    const end = new Date(start.getTime() + 48 * 3600 * 1000);
    await store.searchVehicles({ startTime: start.toISOString(), endTime: end.toISOString() }).catch(() => undefined);
    expect(where.AND).toEqual([
      { OR: [{ commercialPermitExpiry: null }, { commercialPermitExpiry: { gte: end } }] },
      { OR: [{ insuranceExpiry: null }, { insuranceExpiry: { gte: end } }] },
      { OR: [{ fitnessCertExpiry: null }, { fitnessCertExpiry: { gte: end } }] },
    ]);
  });
});

describe('custody readings shown to staff', () => {
  it('reads a numeric fuel level from the recorded text and nothing from words', () => {
    expect(fuelPercentFromLabel('75%')).toBe(75);
    expect(fuelPercentFromLabel(' 0 % ')).toBe(0);
    expect(fuelPercentFromLabel('100')).toBe(100);
    expect(fuelPercentFromLabel('62.5%')).toBe(62);
    expect(fuelPercentFromLabel('Half tank')).toBeNull();
    expect(fuelPercentFromLabel('Not recorded')).toBeNull();
    expect(fuelPercentFromLabel('150%')).toBeNull();
    expect(fuelPercentFromLabel(null)).toBeNull();
  });

  const row = (id: string, type: string, odometerKm: number, fuelChargeLevel: string, at: string, notes: string | null = null) => ({
    id, type, odometerKm, fuelChargeLevel, keyCount: 1, preExistingDamageNotes: notes, handoverByPerson: 'Customer', customerAcknowledged: true, recordedAt: new Date(at),
  });

  it('separates what the car arrived with from what it left with, using the latest of each', () => {
    const { checkIn, checkOut } = pickCustodyRecords([
      row('a', 'CHECK_IN', 60000, '30%', '2026-11-01T09:00:00Z', 'Scratch on rear bumper'),
      row('b', 'CHECK_IN', 60010, '35%', '2026-11-01T10:00:00Z'),
      row('c', 'CHECK_OUT', 60030, '80%', '2026-11-02T17:00:00Z'),
    ]);
    expect(checkIn).toMatchObject({ id: 'b', odometerKm: 60010, fuelPercent: 35, exteriorNotes: null });
    expect(checkOut).toMatchObject({ id: 'c', odometerKm: 60030, fuelPercent: 80 });
  });

  it('has no release record before the car is released, and none at all before check-in', () => {
    expect(pickCustodyRecords([row('a', 'CHECK_IN', 1, '10%', '2026-11-01T09:00:00Z')]).checkOut).toBeNull();
    expect(pickCustodyRecords([])).toEqual({ checkIn: null, checkOut: null });
  });
});

describe('service job details for the operations portal', () => {
  it('carries the check-in and release readings the portal shows and pre-fills from', async () => {
    const record = (id: string, type: string, odometerKm: number, fuel: string, at: string) => ({ id, type, odometerKm, fuelChargeLevel: fuel, keyCount: 1, preExistingDamageNotes: null, handoverByPerson: 'C', customerAcknowledged: true, recordedAt: new Date(at) });
    const serviceRequest = {
      id: 'sr-1', questionAnswers: null, mediaUrls: null, pickupAddress: null, returnAddress: null, paymentPlanSnapshot: null,
      servicePaymentStatus: 'UNPAID', depositStatus: null, verifiedPaidPaise: null, outstandingBalancePaise: null, finalInvoiceId: null,
      invoices: [], estimates: [], payments: [],
      custodyRecords: [record('in', 'CHECK_IN', 62000, '40%', '2026-11-01T09:00:00Z'), record('out', 'CHECK_OUT', 62030, '90%', '2026-11-02T17:00:00Z')],
    };
    const db: Any = { serviceRequest: { findUnique: async () => serviceRequest } };
    const job = await (new PrismaServiceStore(db as PrismaClient) as Any).getOperationsJobDetails('sr-1');
    expect(job.custodyRecord).toMatchObject({ odometerKm: 62000, fuelPercent: 40 });
    expect(job.releaseRecord).toMatchObject({ odometerKm: 62030, fuelPercent: 90 });
    expect(job.custodyRecords).toHaveLength(2); // the raw rows stay available
  });

  it('records no fuel level when a walk-in is checked in without a reading', async () => {
    const custody: Any[] = [];
    const db: Any = {
      serviceHub: { findUnique: async () => ({ id: 'hub-1', isActive: true }) },
      serviceIssueTemplate: { findUnique: async () => ({ categoryKey: 'periodic-maintenance', version: 1 }) },
      masterDataItem: { findMany: async () => [] },
      user: { findFirst: async () => ({ id: 'cust-1', email: 'c@x.test' }) },
      customerVehicle: { findFirst: async () => null, create: async ({ data }: Any) => ({ id: 'veh-new', odometerKm: data.odometerKm }), update: async () => ({}) },
      serviceRequest: { create: async ({ data }: Any) => ({ id: 'sr-1', requestNumber: data.requestNumber, ...data }), findUnique: async () => null },
      serviceCustodyRecord: { create: async ({ data }: Any) => { custody.push(data); return data; } },
      servicePaymentRecord: { create: async () => ({}) },
      serviceHistoryEvent: { create: async () => ({}) },
      $transaction: async (fn: (tx: Any) => Promise<unknown>) => fn(db),
    };
    const store = new PrismaServiceStore(db as PrismaClient) as Any;
    store.ensureSeedData = async () => undefined;
    await store.createWalkInServiceJob('emp-1', {
      hubId: 'hub-1', customerName: 'A', customerPhone: '9876543210', vehicleMake: 'Hyundai', vehicleModel: 'Creta', vehicleYear: 2021,
      categoryKey: 'periodic-maintenance', registrationNumber: 'KA01AB1234', immediateIntake: true, intakeOdometerKm: 62000,
    });
    expect(custody[0]).toMatchObject({ type: 'CHECK_IN', odometerKm: 62000, fuelChargeLevel: 'Not recorded' });
  });
});
