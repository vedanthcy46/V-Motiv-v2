import { describe, expect, it, vi } from 'vitest';
import { PrismaInspectionStore, type InspectionActor } from '../src/inspection-store.js';
import {
  isPlausibleRegistration,
  normalizeFuel,
  normalizeRegistrationNumber,
  normalizeTransmission,
  openingStockCode,
  openingStockProblems,
  type OpeningStockItem,
} from '../src/opening-stock.js';

// The publish check reads master data first; it is not what is under test here.
vi.mock('../src/body-types.js', async importOriginal => ({ ...(await importOriginal<typeof import('../src/body-types.js')>()), refreshMasterBodyTypes: async () => undefined }));

type Any = any;
const BRANCH_A = '11111111-1111-4111-8111-111111111111';
const BRANCH_B = '22222222-2222-4222-8222-222222222222';

const car = (overrides: Partial<OpeningStockItem> = {}): OpeningStockItem => ({
  registrationNumber: 'KA 01 AB 1234',
  make: 'Hyundai',
  model: 'Creta',
  variant: 'SX',
  manufacturingYear: 2020,
  fuelType: 'petrol',
  transmission: 'manual',
  odometerKm: 42_000,
  acquisitionCostPaise: 850_000_00n,
  documentsOnFile: ['RC', 'INSURANCE'],
  ...overrides,
});

const actor = (roles: string[], branchIds: string[] = [BRANCH_A]): InspectionActor => ({ userId: 'emp-1', email: 'ops@example.test', roles, branchIds, branchCities: [] });

function makeStore(existingStock: Array<{ id: string; stockCode: string; registrationNumber: string | null; status: string }> = []) {
  const created: Any[] = [];
  const audits: Any[] = [];
  const tx: Any = {
    vehicleStockUnit: {
      create: vi.fn(async ({ data }: Any) => { const row = { id: `stock-${created.length + 1}`, ...data }; created.push(row); return row; }),
    },
    auditEvent: { create: vi.fn(async ({ data }: Any) => { audits.push(data); return data; }) },
  };
  const db: Any = {
    branch: { findFirst: vi.fn(async ({ where }: Any) => ([BRANCH_A, BRANCH_B].includes(where.id) ? { id: where.id, name: where.id === BRANCH_A ? 'Hub A' : 'Hub B', city: 'Bengaluru' } : null)) },
    vehicleStockUnit: {
      findMany: vi.fn(async ({ where }: Any) => existingStock.filter(unit => !where.status.notIn.includes(unit.status))),
    },
    $transaction: vi.fn(async (fn: Any) => fn(tx)),
  };
  return { store: new PrismaInspectionStore(db), db, tx, created, audits };
}

describe('opening stock helpers', () => {
  it('treats the same plate typed differently as one registration number', () => {
    expect(normalizeRegistrationNumber('ka 01 ab-1234')).toBe('KA01AB1234');
    expect(normalizeRegistrationNumber('KA01AB1234')).toBe('KA01AB1234');
    expect(isPlausibleRegistration('KA01AB1234')).toBe(true);
    expect(isPlausibleRegistration('22BH1234AA')).toBe(true);
    expect(isPlausibleRegistration('12345')).toBe(false);
    expect(isPlausibleRegistration('ABCDEFGH')).toBe(false);
  });

  it('knows the fuels and transmissions, whatever the case', () => {
    expect(normalizeFuel(' petrol ')).toBe('PETROL');
    expect(normalizeFuel('steam')).toBeNull();
    expect(normalizeTransmission('Automatic')).toBe('AUTOMATIC');
    expect(normalizeTransmission('')).toBeNull();
  });

  it('lists what is wrong with an entry, and accepts a good one', () => {
    expect(openingStockProblems(car())).toEqual([]);
    const codes = openingStockProblems(car({ registrationNumber: '1', make: ' ', manufacturingYear: 1850, fuelType: 'x', transmission: 'y', odometerKm: -5, acquisitionCostPaise: 0n })).map(problem => problem.code);
    expect(codes).toEqual(['INVALID_REGISTRATION_NUMBER', 'MAKE_REQUIRED', 'INVALID_MANUFACTURING_YEAR', 'INVALID_FUEL_TYPE', 'INVALID_TRANSMISSION', 'INVALID_ODOMETER', 'ACQUISITION_COST_REQUIRED']);
  });

  it('makes readable stock codes that are different from acquisition stock', () => {
    const code = openingStockCode();
    expect(code).toMatch(/^VM-OPN-[A-HJ-NP-Z2-9]{8}$/);
    expect(code.startsWith('VM-STK-')).toBe(false);
  });
});

describe('adding one opening-stock car', () => {
  it('saves it as received opening stock with no acquisition case, tidied details and an audit record', async () => {
    const { store, created, audits } = makeStore();
    const unit: Any = await store.addOpeningStock(actor(['OPERATIONS_MANAGER']), car());
    expect(unit.stockCode).toMatch(/^VM-OPN-/);
    expect(created[0]).toMatchObject({
      source: 'OPENING_STOCK',
      status: 'RECEIVED',
      branchId: BRANCH_A,
      registrationNumber: 'KA01AB1234',
      fuelType: 'PETROL',
      transmission: 'MANUAL',
      acquisitionCostPaise: 850_000_00n,
      physicalLocation: 'Hub A',
      receivedByEmployeeId: 'emp-1',
    });
    expect(created[0].acquisitionCaseId).toBeUndefined();
    expect(created[0].openingStockDetails).toMatchObject({ documentsOnFile: ['RC', 'INSURANCE'], enteredBy: 'emp-1' });
    expect(audits[0]).toMatchObject({ action: 'OPENING_STOCK_ADDED', entityType: 'VehicleStockUnit', actorId: 'emp-1' });
  });

  it('only operations and inventory staff can add it', async () => {
    const { store } = makeStore();
    await expect(store.addOpeningStock(actor(['INSPECTOR']), car())).rejects.toMatchObject({ status: 403 });
    await expect(store.addOpeningStock(actor(['INVENTORY_MANAGER']), car())).resolves.toBeDefined();
    await expect(store.addOpeningStock(actor(['OPERATIONS_MANAGER']), car({ registrationNumber: 'MH12CD5678' }))).resolves.toBeDefined();
  });

  it('keeps a manager to their own hubs, while an admin may choose any', async () => {
    const { store } = makeStore();
    await expect(store.addOpeningStock(actor(['OPERATIONS_MANAGER'], [BRANCH_A]), { ...car(), branchId: BRANCH_B })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
    await expect(store.addOpeningStock(actor(['ADMIN'], []), { ...car(), branchId: BRANCH_B })).resolves.toMatchObject({ branchId: BRANCH_B });
    await expect(store.addOpeningStock(actor(['OPERATIONS_MANAGER'], [BRANCH_A, BRANCH_B]), car({ registrationNumber: 'TN09EF1111' }))).rejects.toMatchObject({ code: 'BRANCH_SELECTION_REQUIRED' });
  });

  it('refuses a car that is already in live stock however its plate was typed, but not one that was sold', async () => {
    const live = makeStore([{ id: 's1', stockCode: 'VM-STK-AAA', registrationNumber: 'KA-01-AB-1234', status: 'LISTED' }]);
    await expect(live.store.addOpeningStock(actor(['OPERATIONS_MANAGER']), car())).rejects.toMatchObject({ status: 409, code: 'STOCK_ALREADY_EXISTS', message: expect.stringContaining('VM-STK-AAA') });
    const sold = makeStore([{ id: 's1', stockCode: 'VM-STK-AAA', registrationNumber: 'KA01AB1234', status: 'SOLD' }]);
    await expect(sold.store.addOpeningStock(actor(['OPERATIONS_MANAGER']), car())).resolves.toBeDefined();
  });

  it('refuses incomplete details and saves nothing', async () => {
    const { store, created } = makeStore();
    await expect(store.addOpeningStock(actor(['OPERATIONS_MANAGER']), car({ acquisitionCostPaise: 0n }))).rejects.toMatchObject({ status: 400, code: 'ACQUISITION_COST_REQUIRED' });
    await expect(store.addOpeningStock(actor(['OPERATIONS_MANAGER']), car({ registrationNumber: 'x' }))).rejects.toMatchObject({ status: 400 });
    expect(created).toHaveLength(0);
  });
});

describe('adding many opening-stock cars', () => {
  const rows = () => [
    car({ registrationNumber: 'KA01AB1111' }),
    car({ registrationNumber: 'KA01AB2222', fuelType: 'steam' }), // invalid fuel
    car({ registrationNumber: 'ka 01 ab 1111' }), // the first row again
    car({ registrationNumber: 'KA01AB3333' }),
    car({ registrationNumber: 'KA01AB9999' }), // already in stock
  ];
  const existing = [{ id: 's9', stockCode: 'VM-STK-ZZZ', registrationNumber: 'KA 01 AB 9999', status: 'LISTED' }];

  it('saves each good row, reports every bad one with its reason, and never lets one bad row block the rest', async () => {
    const { store, created } = makeStore(existing);
    const result = await store.addOpeningStockBulk(actor(['OPERATIONS_MANAGER']), { items: rows() });
    expect(result).toMatchObject({ dryRun: false, total: 5, created: 2, failed: 3 });
    expect(created.map(unit => unit.registrationNumber)).toEqual(['KA01AB1111', 'KA01AB3333']);
    expect(result.items.map(item => [item.row, item.status, item.code])).toEqual([
      [1, 'CREATED', undefined],
      [2, 'FAILED', 'INVALID_FUEL_TYPE'],
      [3, 'FAILED', 'DUPLICATE_IN_FILE'],
      [4, 'CREATED', undefined],
      [5, 'FAILED', 'STOCK_ALREADY_EXISTS'],
    ]);
    expect(result.items[0]!.stockCode).toMatch(/^VM-OPN-/);
  });

  it('a dry run reports what would happen and saves nothing', async () => {
    const { store, created, audits } = makeStore(existing);
    const result = await store.addOpeningStockBulk(actor(['OPERATIONS_MANAGER']), { items: rows(), dryRun: true });
    expect(result).toMatchObject({ dryRun: true, total: 5, created: 0, wouldCreate: 2, failed: 3 });
    expect(result.items.filter(item => item.status === 'WOULD_CREATE').map(item => item.row)).toEqual([1, 4]);
    expect(created).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it('applies the same permissions as adding one car', async () => {
    const { store } = makeStore();
    await expect(store.addOpeningStockBulk(actor(['INSPECTOR']), { items: [car()] })).rejects.toMatchObject({ status: 403 });
    await expect(store.addOpeningStockBulk(actor(['OPERATIONS_MANAGER'], [BRANCH_A]), { items: [car()], branchId: BRANCH_B })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
  });
});

describe('listing opening stock', () => {
  function publishStore(source: 'OPENING_STOCK' | 'ACQUISITION', reports: Array<{ status: string }>) {
    const db: Any = {
      vehicleStockUnit: {
        findFirst: vi.fn(async () => ({
          id: 'stock-1', version: 1, source, branchId: BRANCH_A, workOrders: [], qualityControlReports: reports,
          vehicleId: null, vehicle: null, make: 'Hyundai', model: 'Creta', manufacturingYear: 2020, registrationNumber: 'KA01AB1234', branch: null,
        })),
      },
      branch: { findFirst: vi.fn(async () => ({ id: BRANCH_A, name: 'Hub A', city: 'Bengaluru' })) },
    };
    return new PrismaInspectionStore(db);
  }
  const publish = (store: PrismaInspectionStore) => store.publishListing(actor(['OPERATIONS_MANAGER']), 'stock-1', { retailPricePaise: 900_000_00n, expectedVersion: 1 });

  it('refuses to publish opening stock that has not passed inspection, even though it has no repair work', async () => {
    await expect(publish(publishStore('OPENING_STOCK', []))).rejects.toMatchObject({ status: 409, code: 'OPENING_STOCK_INSPECTION_REQUIRED' });
    await expect(publish(publishStore('OPENING_STOCK', [{ status: 'IN_PROGRESS' }]))).rejects.toMatchObject({ code: 'OPENING_STOCK_INSPECTION_REQUIRED' });
  });

  it('lets opening stock past that check once it has passed inspection', async () => {
    // it then stops at the next ordinary check (no vehicle details prepared yet), proving the inspection rule is satisfied
    await expect(publish(publishStore('OPENING_STOCK', [{ status: 'PASSED' }]))).rejects.toMatchObject({ code: 'VEHICLE_DETAILS_NOT_PREPARED' });
  });

  it('does not change the rule for stock that came through the normal acquisition flow', async () => {
    await expect(publish(publishStore('ACQUISITION', []))).rejects.toMatchObject({ code: 'VEHICLE_DETAILS_NOT_PREPARED' });
  });
});
