import { beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { buildMakeAliasGroups, canonicalMakeModel, canonicalizeMakeModel, resetVehicleNameCache, type MasterNameItem } from '../src/vehicle-names.js';
import { computeInventoryFacets } from '../src/inventory-facets.js';
import { PrismaRentalStore } from '../src/rental-store.js';
import { PrismaServiceStore } from '../src/service-store.js';

type Any = any;

const catalogue: MasterNameItem[] = [
  { category: 'MAKE', code: 'MARUTI_SUZUKI', name: 'Maruti Suzuki', parentCode: null },
  { category: 'MAKE', code: 'HYUNDAI', name: 'Hyundai', parentCode: null },
  { category: 'MODEL', code: 'SWIFT', name: 'Swift', parentCode: 'MARUTI_SUZUKI' },
  { category: 'MODEL', code: 'CRETA', name: 'Creta', parentCode: 'HYUNDAI' },
];

describe('canonical make / model names', () => {
  it('uses the catalogue spelling for catalogue cars (case, spacing, short names)', () => {
    expect(canonicalizeMakeModel(catalogue, '  hyundai ', 'creta')).toEqual({ make: 'Hyundai', model: 'Creta' });
    expect(canonicalizeMakeModel(catalogue, 'MARUTI', 'swift')).toEqual({ make: 'Maruti Suzuki', model: 'Swift' });
    expect(canonicalizeMakeModel(catalogue, 'maruti   suzuki', 'SWIFT')).toEqual({ make: 'Maruti Suzuki', model: 'Swift' });
  });
  it('keeps a typed model that is not in the catalogue, and a typed brand that is not in the catalogue', () => {
    expect(canonicalizeMakeModel(catalogue, 'Hyundai', 'Grand Santro')).toEqual({ make: 'Hyundai', model: 'Grand Santro' });
    expect(canonicalizeMakeModel(catalogue, 'Force Motors', ' Gurkha ')).toEqual({ make: 'Force Motors', model: 'Gurkha' });
  });
  it('does not match a model under the wrong make', () => {
    expect(canonicalizeMakeModel(catalogue, 'Hyundai', 'swift')).toEqual({ make: 'Hyundai', model: 'swift' });
  });
  it('never throws: a database problem keeps what was typed', async () => {
    resetVehicleNameCache();
    const broken = { masterDataItem: { findMany: async () => { throw new Error('db down'); } } };
    expect(await canonicalMakeModel(broken, ' honda ', 'City')).toEqual({ make: 'honda', model: 'City' });
    expect(await canonicalMakeModel({}, 'honda', 'City')).toEqual({ make: 'honda', model: 'City' });
  });
});

describe('rental walk-in hand-over readings', () => {
  const vehicle = { id: 'veh-1', status: 'AVAILABLE', odometerKm: 41200, fuelLevelPercent: 62, hubId: 'hub-1', hub: null };
  const input = (extra: Record<string, unknown> = {}) => ({
    vehicleId: 'veh-1', customerName: 'A', customerPhone: '9', licenseNumber: 'KA01', licenseExpiry: new Date('2030-01-01T00:00:00Z'), licenseFrontUrl: 'f', licenseBackUrl: 'b', paymentMethod: 'UPI',
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

  it('rejects a licence that expires before the return date', async () => {
    const { store, customersCreated } = makeStore();
    await expect(store.createWalkInBooking('emp-1', input({ licenseExpiry: new Date('2026-11-07T00:00:00Z') }))).rejects.toMatchObject({ status: 400, code: 'LICENSE_EXPIRES_BEFORE_RETURN' });
    expect(customersCreated()).toBe(0);
  });

  it('rejects an odometer below the vehicle record before creating anything', async () => {
    const { store, customersCreated } = makeStore();
    await expect(store.createWalkInBooking('emp-1', input({ startOdometerKm: 41000 }))).rejects.toMatchObject({ status: 400, code: 'ODOMETER_BELOW_RECORDED' });
    expect(customersCreated()).toBe(0);
  });
});

describe('service release readings', () => {
  const sr = { id: 'sr-1', status: 'IN_SERVICE', vehicleId: 'v-1' };
  const release = (odometerKm: number) => {
    const db: Any = {
      serviceRequest: { findUnique: async () => sr },
      serviceCustodyRecord: { findFirst: async () => ({ odometerKm: 60000 }) },
    };
    return (new PrismaServiceStore(db as PrismaClient) as Any).recordCustodyReturn('emp-1', 'sr-1', { odometerKm, fuelChargeLevel: '40%', handoverByPerson: 'Customer' });
  };

  it('rejects a release odometer lower than the check-in reading', async () => {
    await expect(release(59000)).rejects.toMatchObject({ status: 400, code: 'ODOMETER_BELOW_CHECK_IN' });
  });
});

describe('master-data driven make aliases', () => {
  const items: MasterNameItem[] = [
    ...catalogue,
    { category: 'MAKE', code: 'MG', name: 'MG', parentCode: null, metadata: { aliases: ['Morris Garages', 'MG Motor'] } },
  ];
  it('groups built-in short names and administrator aliases under the catalogue make', () => {
    const groups = buildMakeAliasGroups(items);
    expect(groups.find(g => g.canonical === 'Maruti Suzuki')?.names).toEqual(expect.arrayContaining(['maruti suzuki', 'maruti', 'suzuki']));
    expect(groups.find(g => g.canonical === 'MG')?.names).toEqual(expect.arrayContaining(['mg', 'morris garages', 'mg motor']));
    expect(groups.find(g => g.canonical === 'Hyundai')).toBeUndefined(); // nothing to fold
  });
  it('uses the same aliases when normalising typed names', () => {
    expect(canonicalizeMakeModel(items, 'morris garages', 'Hector')).toEqual({ make: 'MG', model: 'Hector' });
  });
  it('facets fold a master-data alias into one make and keep the catalogue spelling', () => {
    const groups = buildMakeAliasGroups(items);
    const row = (make: string) => ({ title: make, pricePaise: 1, make, model: 'Hector', fuelType: null, transmission: null, bodyType: null, color: null, city: null, year: null, odometerKm: null, features: [] });
    const facets = computeInventoryFacets([row('Morris Garages'), row('MG'), row('mg motor')], { makes: ['MG'] }, groups);
    expect(facets.total).toBe(3);
    expect(facets.makes).toEqual([expect.objectContaining({ value: 'MG', count: 3 })]);
  });
});
