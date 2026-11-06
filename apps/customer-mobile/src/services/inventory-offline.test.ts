import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => { storage.set(key, value); },
  },
}));

import {
  describeAge, isUnreachable, mergeCars, queryCars, rememberCars, resetInventoryOffline, savedInventory, savedVehicle, syncInventory,
} from './inventory-offline';
import type { VehicleSummary } from '../types';

function car(id: string, over: Partial<VehicleSummary['vehicle']> & { price?: number; published?: string; title?: string } = {}): VehicleSummary {
  const { price = 500_000_00, published = '2026-11-01T00:00:00Z', title, ...vehicle } = over;
  return {
    id, title: title ?? `${id} car`, pricePaise: String(price), currency: 'INR', publishedAt: published, isWishlisted: false,
    vehicle: { id: `v-${id}`, make: 'Hyundai', model: 'Creta', variant: 'SX', manufacturingYear: 2021, fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: 40_000, color: 'White', ownershipCount: 1, city: 'Bengaluru', registrationYear: 2021, bodyType: 'SUV', engineCapacityCc: null, conditionSummary: null, inspectionSummary: null, inspectionReportUrl: null, features: ['Sunroof', 'ABS'], verifiedTags: [], ...vehicle },
    media: [],
  } as VehicleSummary;
}

const fleet = [
  car('a', { make: 'Hyundai', model: 'Creta', price: 900_000_00, published: '2026-11-05T00:00:00Z' }),
  car('b', { make: 'Maruti Suzuki', model: 'Swift', fuelType: 'DIESEL', manufacturingYear: 2018, odometerKm: 90_000, price: 400_000_00, published: '2026-11-03T00:00:00Z', city: 'Mysuru', features: ['ABS'] }),
  car('c', { make: 'Honda', model: 'City', transmission: 'AUTOMATIC', manufacturingYear: 2023, price: 1_200_000_00, published: '2026-11-04T00:00:00Z', bodyType: 'Sedan' }),
];

describe('saved inventory answers like the server', () => {
  it('sorts newest first by default and by price or year on request', () => {
    expect(queryCars(fleet, {}).items.map(x => x.id)).toEqual(['a', 'c', 'b']);
    expect(queryCars(fleet, { sort: 'price_asc' }).items.map(x => x.id)).toEqual(['b', 'a', 'c']);
    expect(queryCars(fleet, { sort: 'price_desc' }).items.map(x => x.id)).toEqual(['c', 'a', 'b']);
    expect(queryCars(fleet, { sort: 'year_desc' }).items.map(x => x.id)).toEqual(['c', 'a', 'b']);
  });

  it('applies the same filters as the Explore screen', () => {
    expect(queryCars(fleet, { fuelType: 'diesel' }).items.map(x => x.id)).toEqual(['b']);
    expect(queryCars(fleet, { make: 'Hyundai,Honda' }).items.map(x => x.id)).toEqual(['a', 'c']);
    expect(queryCars(fleet, { model: 'swift' }).items.map(x => x.id)).toEqual(['b']);
    expect(queryCars(fleet, { transmission: 'AUTOMATIC' }).items.map(x => x.id)).toEqual(['c']);
    expect(queryCars(fleet, { city: 'mysuru' }).items.map(x => x.id)).toEqual(['b']);
    expect(queryCars(fleet, { bodyType: 'Sedan' }).items.map(x => x.id)).toEqual(['c']);
    expect(queryCars(fleet, { minYear: 2020 }).items.map(x => x.id)).toEqual(['a', 'c']);
    expect(queryCars(fleet, { maxOdometerKm: 50_000 }).items.map(x => x.id)).toEqual(['a', 'c']);
    expect(queryCars(fleet, { minPricePaise: 500_000_00, maxPricePaise: 1_000_000_00 }).items.map(x => x.id)).toEqual(['a']);
    expect(queryCars(fleet, { features: 'Sunroof|ABS' }).items.map(x => x.id)).toEqual(['a', 'c']);
    expect(queryCars(fleet, { search: 'honda city' }).items.map(x => x.id)).toEqual(['c']);
    expect(queryCars(fleet, { search: 'nothing like this' }).items).toEqual([]);
  });

  it('pages the way the server does', () => {
    const many = Array.from({ length: 45 }, (_, i) => car(`m${i}`, { published: new Date(2026, 9, 1 + (i % 28)).toISOString() }));
    const first = queryCars(many, { limit: 20, page: 1 });
    expect(first).toMatchObject({ total: 45, page: 1, limit: 20, totalPages: 3 });
    expect(first.items).toHaveLength(20);
    expect(queryCars(many, { limit: 20, page: 3 }).items).toHaveLength(5);
  });

  it('merges fresh cars over saved ones: new cars appear, changed prices win, nothing is duplicated', () => {
    const saved = [car('a', { price: 900_000_00 }), car('b')];
    const merged = mergeCars(saved, [car('a', { price: 850_000_00 }), car('z', { published: '2026-11-06T00:00:00Z' })]);
    expect(merged.map(x => x.id)).toEqual(['z', 'b', 'a'].sort((x, y) => merged.findIndex(m => m.id === x) - merged.findIndex(m => m.id === y)));
    expect(merged).toHaveLength(3);
    expect(merged.find(x => x.id === 'a')!.pricePaise).toBe(String(850_000_00));
  });
});

describe('the saved copy on the device', () => {
  beforeEach(() => { storage.clear(); resetInventoryOffline(); vi.useRealTimers(); });

  it('has nothing to offer before anything was saved, so the screens show their normal error', async () => {
    expect(await savedInventory({})).toBeNull();
    expect(await savedVehicle('a')).toBeNull();
  });

  it('keeps every car the server sent and serves filtered answers from them offline', async () => {
    await rememberCars(fleet);
    const answer = await savedInventory({ fuelType: 'DIESEL' });
    expect(answer!.items.map(x => x.id)).toEqual(['b']);
    expect(answer!.syncedAt).toBeGreaterThan(0);
    expect((await savedVehicle('c'))!.vehicle.model).toBe('City');
  });

  it('survives an app restart (written to storage and read back)', async () => {
    await rememberCars(fleet);
    await new Promise(resolve => setTimeout(resolve, 450)); // the write is batched
    resetInventoryOffline(); // a new app session: nothing in memory
    expect((await savedInventory({}))!.items).toHaveLength(3);
  });

  it('a later refresh brings in newly added cars alongside the saved ones', async () => {
    await rememberCars(fleet);
    await rememberCars([car('new', { published: '2026-11-06T00:00:00Z' })]);
    expect((await savedInventory({}))!.items.map(x => x.id)).toEqual(['new', 'a', 'c', 'b']);
  });
});

describe('full sync', () => {
  beforeEach(() => { storage.clear(); resetInventoryOffline(); });

  const pagesOf = (cars: VehicleSummary[], size: number) => vi.fn(async (query: { page?: number; limit?: number }) => queryCars(cars, { ...query, limit: size }));

  it('downloads every page and replaces the copy, so sold or unpublished cars disappear', async () => {
    await rememberCars([car('sold')]);
    const fetchPage = pagesOf(fleet, 2);
    await syncInventory(fetchPage, { force: true });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect((await savedInventory({}))!.items.map(x => x.id)).toEqual(['a', 'c', 'b']);
  });

  it('does not repeat itself within 15 minutes unless forced', async () => {
    const fetchPage = pagesOf(fleet, 50);
    await syncInventory(fetchPage, { force: true });
    await syncInventory(fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('leaves the saved copy alone when the server cannot be reached', async () => {
    await rememberCars(fleet);
    await syncInventory(async () => { throw Object.assign(new Error('NETWORK_UNREACHABLE'), { status: 0 }); }, { force: true });
    expect((await savedInventory({}))!.items).toHaveLength(3);
  });
});

describe('what counts as "offline"', () => {
  it('treats no network, timeouts and server errors as unreachable, but not a refusal or a cancel', () => {
    expect(isUnreachable(Object.assign(new Error('NETWORK_UNREACHABLE'), { status: 0 }))).toBe(true);
    expect(isUnreachable(new Error('REQUEST_TIMEOUT'))).toBe(true);
    expect(isUnreachable(Object.assign(new Error('INTERNAL_ERROR'), { status: 503 }))).toBe(true);
    expect(isUnreachable(Object.assign(new Error('REQUEST_CANCELLED'), { status: 0 }))).toBe(false);
    expect(isUnreachable(Object.assign(new Error('FORBIDDEN'), { status: 403 }))).toBe(false);
    expect(isUnreachable(Object.assign(new Error('NOT_FOUND'), { status: 404 }))).toBe(false);
    expect(isUnreachable(null)).toBe(false);
  });

  it('describes how old the saved copy is', () => {
    const now = Date.parse('2026-11-06T12:00:00Z');
    expect(describeAge(now - 20_000, now)).toBe('just now');
    expect(describeAge(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(describeAge(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(describeAge(now - 72 * 3_600_000, now)).toBe('3 days ago');
    expect(describeAge(0, now)).toBe('earlier');
  });
});
