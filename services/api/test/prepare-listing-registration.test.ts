import { describe, expect, it, vi } from 'vitest';
import { PrismaInspectionStore, type InspectionActor } from '../src/inspection-store.js';

// Reading master data is not what is under test here.
vi.mock('../src/body-types.js', async importOriginal => ({ ...(await importOriginal<typeof import('../src/body-types.js')>()), refreshMasterBodyTypes: async () => undefined }));

type Any = any;
const BRANCH = '11111111-1111-4111-8111-111111111111';
const actor: InspectionActor = { userId: 'emp-1', email: 'ops@example.test', roles: ['OPERATIONS_MANAGER'], branchIds: [BRANCH], branchCities: [] };

function makeStore(stock: Record<string, unknown>) {
  const stockUpdates: Any[] = [];
  const listingUpserts: Any[] = [];
  const tx: Any = {
    vehicle: { create: vi.fn(async () => ({ id: 'vehicle-new' })), update: vi.fn(async () => ({})) },
    vehicleStockUnit: { update: vi.fn(async (args: Any) => { stockUpdates.push(args.data); return {}; }) },
    vehicleListing: { upsert: vi.fn(async (args: Any) => { listingUpserts.push(args); return { id: 'listing-1' }; }) },
    acquisitionLead: { update: vi.fn(async () => ({})) },
    auditEvent: { create: vi.fn(async () => ({})) },
  };
  const db: Any = {
    vehicleStockUnit: {
      findFirst: vi.fn(async () => ({
        id: 'stock-1', version: 3, status: 'LISTING_PREPARATION', branchId: BRANCH, branch: { name: 'Hub A', city: 'Bengaluru' },
        workOrders: [], qualityControlReports: [], acquisitionCase: null, vehicle: null, vehicleId: null, registrationNumber: null,
        make: 'MG', model: 'Astor', manufacturingYear: 2022, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 30000, variant: null, physicalLocation: 'Hub A',
        ...stock,
      })),
    },
    branch: { findFirst: vi.fn(async () => ({ id: BRANCH, name: 'Hub A', city: 'Bengaluru' })) },
    $transaction: vi.fn(async (fn: Any) => fn(tx)),
  };
  return { store: new PrismaInspectionStore(db), stockUpdates, listingUpserts };
}

const base = { title: '2022 MG Astor', expectedVersion: 3 };

describe('preparing a listing with a registration number typed in the studio', () => {
  it('saves it in the same single update as everything else, normalised, for a car that already has vehicle details', async () => {
    const { store, stockUpdates, listingUpserts } = makeStore({ vehicleId: 'vehicle-1', vehicle: { id: 'vehicle-1', color: 'Red', bodyType: 'SUV' }, registrationNumber: 'OLD1234' });
    await store.prepareListing(actor, 'stock-1', { ...base, registrationNumber: 'ka 07 ab 9879' });
    // One change to the stock record, so its version moves once and the caller never conflicts with itself.
    expect(stockUpdates).toHaveLength(1);
    expect(stockUpdates[0]).toMatchObject({ registrationNumber: 'KA07AB9879', status: 'LISTING_READY', version: { increment: 1 } });
    expect(listingUpserts[0].update.customerProfile.basicInformation.registrationNumber).toBe('KA07AB9879');
  });

  it('saves it on a first preparation too, where there is no vehicle record yet', async () => {
    const { store, stockUpdates } = makeStore({});
    await store.prepareListing(actor, 'stock-1', { ...base, registrationNumber: 'KA07AB9879' });
    expect(stockUpdates).toHaveLength(1);
    expect(stockUpdates[0]).toMatchObject({ vehicleId: 'vehicle-new', registrationNumber: 'KA07AB9879', version: { increment: 1 } });
  });

  it('keeps the registration already on the car when none is typed', async () => {
    const { store, stockUpdates } = makeStore({ vehicleId: 'vehicle-1', vehicle: { id: 'vehicle-1' }, registrationNumber: 'KA01XY1111' });
    await store.prepareListing(actor, 'stock-1', base);
    expect(stockUpdates[0]).toMatchObject({ registrationNumber: 'KA01XY1111' });
  });

  it('still refuses a stale version, so a real concurrent edit is caught', async () => {
    const { store } = makeStore({ vehicleId: 'vehicle-1', vehicle: { id: 'vehicle-1' } });
    await expect(store.prepareListing(actor, 'stock-1', { ...base, expectedVersion: 2, registrationNumber: 'KA07AB9879' })).rejects.toMatchObject({ code: 'STOCK_VERSION_CONFLICT' });
  });
});
