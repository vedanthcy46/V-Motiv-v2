import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaServiceStore } from '../src/service-store.js';
import { gstOn, rentalGstPercent } from '../src/rental-pricing.js';
import { nextServiceDue } from '../src/service-intervals.js';

type Any = any;

describe('rental GST', () => {
  it('uses 18% by default and the configured rate when set', () => {
    expect(rentalGstPercent({})).toBe(18);
    expect(gstOn(100_000n, {})).toBe(18_000n);
    expect(gstOn(100_000n, { RENTAL_GST_PERCENT: '12.5' })).toBe(12_500n);
    expect(rentalGstPercent({ RENTAL_GST_PERCENT: 'abc' })).toBe(18); // an invalid setting never zeroes the tax
    expect(rentalGstPercent({ RENTAL_GST_PERCENT: '99' })).toBe(18);
  });
});

describe('next service due', () => {
  const now = new Date('2026-11-05T00:00:00Z');
  it('is only set after a periodic service, with configurable intervals', () => {
    expect(nextServiceDue('periodic-maintenance', 50_000, now, {})).toEqual({ nextServiceDueKm: 60_000, nextServiceDueDate: new Date('2027-05-04T00:00:00Z') });
    expect(nextServiceDue('periodic-maintenance', 50_000, now, { SERVICE_INTERVAL_KM: '5000', SERVICE_INTERVAL_DAYS: '90' })).toEqual({ nextServiceDueKm: 55_000, nextServiceDueDate: new Date('2027-02-03T00:00:00Z') });
    expect(nextServiceDue('ac-repair', 50_000, now, {})).toBeNull();
  });
});

describe('service walk-in booking', () => {
  const hub = { id: 'hub-1', isActive: true };
  function makeStore(options: { existingVehicle?: Any } = {}) {
    const calls = { vehicleCreate: [] as Any[], vehicleUpdate: [] as Any[], serviceRequest: [] as Any[], custody: [] as Any[] };
    const db: Any = {
      serviceHub: { findUnique: async () => hub },
      serviceIssueTemplate: { findUnique: async () => ({ categoryKey: 'periodic-maintenance', version: 1 }) },
      masterDataItem: { findMany: async () => [
        { category: 'MAKE', code: 'HYUNDAI', name: 'Hyundai', parentCode: null },
        { category: 'MODEL', code: 'CRETA', name: 'Creta', parentCode: 'HYUNDAI' },
      ] },
      user: { findFirst: async () => ({ id: 'cust-1', email: 'c@x.test' }) },
      customerVehicle: {
        findFirst: async () => options.existingVehicle ?? null,
        create: async ({ data }: Any) => { calls.vehicleCreate.push(data); return { id: 'veh-new', odometerKm: data.odometerKm }; },
        update: async (args: Any) => { calls.vehicleUpdate.push(args); return {}; },
      },
      serviceRequest: { create: async ({ data }: Any) => { calls.serviceRequest.push(data); return { id: 'sr-1', requestNumber: data.requestNumber, ...data }; }, findUnique: async () => null },
      serviceCustodyRecord: { create: async ({ data }: Any) => { calls.custody.push(data); return data; } },
      servicePaymentRecord: { create: async () => ({}) },
      serviceHistoryEvent: { create: async () => ({}) },
      $transaction: async (fn: (tx: Any) => Promise<unknown>) => fn(db),
    };
    const store = new PrismaServiceStore(db as PrismaClient) as Any;
    store.ensureSeedData = async () => undefined;
    return { store, calls };
  }
  const base = { hubId: 'hub-1', customerName: 'A', customerPhone: '9876543210', vehicleMake: ' hyundai ', vehicleModel: 'creta', vehicleYear: 2021, categoryKey: 'periodic-maintenance', registrationNumber: 'KA01AB1234', immediateIntake: true, intakeOdometerKm: 62_000, intakeFuelPercent: 0 };

  it('stores the catalogue spelling, records fuel 0 as 0, and syncs the vehicle odometer up', async () => {
    const { store, calls } = makeStore({ existingVehicle: { id: 'veh-1', odometerKm: 60_000 } });
    await store.createWalkInServiceJob('emp-1', { ...base });
    expect(calls.custody[0]).toMatchObject({ type: 'CHECK_IN', odometerKm: 62_000, fuelChargeLevel: '0%' });
    expect(calls.vehicleUpdate[0]).toMatchObject({ where: { id: 'veh-1' }, data: { odometerKm: 62_000 } });
  });

  it('creates new vehicles with the master-data spelling', async () => {
    const { store, calls } = makeStore();
    await store.createWalkInServiceJob('emp-1', { ...base });
    expect(calls.vehicleCreate[0]).toMatchObject({ make: 'Hyundai', model: 'Creta' });
  });

  it('rejects an intake odometer below the vehicle record without creating a request', async () => {
    const { store, calls } = makeStore({ existingVehicle: { id: 'veh-1', odometerKm: 70_000 } });
    await expect(store.createWalkInServiceJob('emp-1', { ...base })).rejects.toMatchObject({ status: 400, code: 'ODOMETER_BELOW_RECORDED' });
    expect(calls.serviceRequest).toHaveLength(0);
  });

  it('books a doorstep pickup as an appointment (no counter check-in) and keeps the address', async () => {
    const { store, calls } = makeStore();
    await store.createWalkInServiceJob('emp-1', { ...base, fulfillmentType: 'PICKUP_AND_RETURN', pickupAddress: { line1: '12 MG Road', city: 'Bengaluru', pincode: '560001' } });
    expect(calls.serviceRequest[0]).toMatchObject({ fulfillmentType: 'PICKUP_AND_RETURN', status: 'APPOINTMENT_SCHEDULED' });
    expect(JSON.parse(calls.serviceRequest[0].pickupAddress)).toMatchObject({ line1: '12 MG Road', pincode: '560001' });
    expect(calls.custody).toHaveLength(0);
  });

  it('requires an address for a doorstep pickup', async () => {
    const { store } = makeStore();
    await expect(store.createWalkInServiceJob('emp-1', { ...base, fulfillmentType: 'PICKUP_AND_RETURN' })).rejects.toMatchObject({ status: 400, code: 'PICKUP_ADDRESS_REQUIRED' });
  });
});
