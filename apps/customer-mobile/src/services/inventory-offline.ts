// Offline copy of the car inventory.
// Every inventory response from the server is merged into a copy kept on the device, and a full sync keeps that copy
// complete (and drops cars that were sold or unpublished). When the server cannot be reached, the screens get the same
// answer from the copy - search, filters and sorting included - so browsing keeps working. The next successful refresh
// brings in any newly added cars and updates prices, and those are saved for offline use from then on.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { InventoryPage, VehicleSummary } from '../types';

export type InventoryQuery = {
  search?: string;
  city?: string;
  fuelType?: string;
  transmission?: string;
  make?: string;
  model?: string;
  bodyType?: string;
  color?: string;
  minYear?: number;
  maxYear?: number;
  maxOdometerKm?: number;
  minPricePaise?: number;
  maxPricePaise?: number;
  features?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'year_desc';
  page?: number;
  limit?: number;
};

const STORE_KEY = 'vmotiv.inventory.v1';
/** Enough for the whole showroom; the oldest are dropped first if the catalogue ever grows past this. */
export const MAX_SAVED_CARS = 400;
/** A full sync is started in the background when the last one is older than this. */
export const FULL_SYNC_AFTER_MS = 15 * 60 * 1000;

const lower = (value: unknown) => String(value ?? '').trim().toLowerCase();
const list = (value?: string, separator = ',') => (value ?? '').split(separator).map(lower).filter(Boolean);

/** Whether a saved car matches the filters the screens send to the server. */
export function matchesQuery(car: VehicleSummary, query: InventoryQuery): boolean {
  const v = car.vehicle;
  const price = Number(car.pricePaise);
  if (query.search) {
    const haystack = lower([car.title, v.make, v.model, v.variant, v.city, v.registrationNumber, v.manufacturingYear].join(' '));
    if (!list(query.search, ' ').every(term => haystack.includes(term))) return false;
  }
  if (query.city && lower(v.city) !== lower(query.city)) return false;
  if (query.fuelType && lower(v.fuelType) !== lower(query.fuelType)) return false;
  if (query.transmission && lower(v.transmission) !== lower(query.transmission)) return false;
  if (query.bodyType && lower(v.bodyType) !== lower(query.bodyType)) return false;
  if (query.color && lower(v.color) !== lower(query.color)) return false;
  const makes = list(query.make);
  if (makes.length > 0 && !makes.includes(lower(v.make))) return false;
  const models = list(query.model);
  if (models.length > 0 && !models.includes(lower(v.model))) return false;
  if (query.minYear && v.manufacturingYear < query.minYear) return false;
  if (query.maxYear && v.manufacturingYear > query.maxYear) return false;
  if (query.maxOdometerKm && v.odometerKm > query.maxOdometerKm) return false;
  if (query.minPricePaise && price < query.minPricePaise) return false;
  if (query.maxPricePaise && price > query.maxPricePaise) return false;
  const wanted = list(query.features, '|');
  if (wanted.length > 0) {
    const have = (v.features ?? []).map(lower);
    if (!wanted.every(feature => have.includes(feature))) return false;
  }
  return true;
}

function compare(sort: InventoryQuery['sort']): (a: VehicleSummary, b: VehicleSummary) => number {
  const published = (car: VehicleSummary) => Date.parse(car.publishedAt) || 0;
  switch (sort) {
    case 'price_asc': return (a, b) => Number(a.pricePaise) - Number(b.pricePaise) || published(b) - published(a);
    case 'price_desc': return (a, b) => Number(b.pricePaise) - Number(a.pricePaise) || published(b) - published(a);
    case 'year_desc': return (a, b) => b.vehicle.manufacturingYear - a.vehicle.manufacturingYear || published(b) - published(a);
    default: return (a, b) => published(b) - published(a);
  }
}

/** The page the server would have returned, worked out from the saved cars. */
export function queryCars(cars: VehicleSummary[], query: InventoryQuery): InventoryPage {
  const limit = Math.max(1, query.limit ?? 20);
  const page = Math.max(1, query.page ?? 1);
  const matching = cars.filter(car => matchesQuery(car, query)).sort(compare(query.sort));
  return {
    items: matching.slice((page - 1) * limit, page * limit),
    total: matching.length,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(matching.length / limit)),
  };
}

/** Merges fresh cars into the saved ones (fresh wins), newest first, within the size cap. */
export function mergeCars(saved: VehicleSummary[], fresh: VehicleSummary[]): VehicleSummary[] {
  const byId = new Map<string, VehicleSummary>();
  for (const car of saved) byId.set(car.id, car);
  for (const car of fresh) byId.set(car.id, car);
  return [...byId.values()].sort(compare('newest')).slice(0, MAX_SAVED_CARS);
}

type Saved = { cars: VehicleSummary[]; syncedAt: number; fullSyncAt: number };

let memory: Saved | null = null;
let loading: Promise<Saved> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

async function load(): Promise<Saved> {
  if (memory) return memory;
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        const parsed = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
        memory = { cars: Array.isArray(parsed?.cars) ? parsed!.cars! : [], syncedAt: parsed?.syncedAt ?? 0, fullSyncAt: parsed?.fullSyncAt ?? 0 };
      } catch {
        memory = { cars: [], syncedAt: 0, fullSyncAt: 0 }; // an unreadable copy is simply ignored
      }
      return memory;
    })().finally(() => { loading = null; });
  }
  return loading;
}

function persistSoon() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    if (memory) void AsyncStorage.setItem(STORE_KEY, JSON.stringify(memory)).catch(() => undefined);
  }, 400);
  listeners.forEach(listener => listener());
}

/** Every successful server answer goes through here. */
export async function rememberCars(fresh: VehicleSummary[]): Promise<void> {
  if (fresh.length === 0) return;
  const saved = await load();
  memory = { ...saved, cars: mergeCars(saved.cars, fresh), syncedAt: Date.now() };
  persistSoon();
}

/** The answer to an inventory query from the saved cars, or null when nothing has been saved yet. */
export async function savedInventory(query: InventoryQuery): Promise<(InventoryPage & { syncedAt: number }) | null> {
  const saved = await load();
  if (saved.cars.length === 0) return null;
  return { ...queryCars(saved.cars, query), syncedAt: saved.syncedAt };
}

export async function savedVehicle(id: string): Promise<VehicleSummary | null> {
  return (await load()).cars.find(car => car.id === id) ?? null;
}

/** When the saved copy was last updated from the server (0 = never). */
export async function lastSyncedAt(): Promise<number> {
  return (await load()).syncedAt;
}

export function subscribeSaved(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let syncing: Promise<void> | null = null;

/**
 * Downloads the whole showroom (newest first) and makes it the saved copy, so cars that were sold or unpublished disappear
 * and new ones are there offline. `fetchPage` is the app's own inventory call. Never throws: offline, the old copy stays.
 */
export function syncInventory(fetchPage: (query: InventoryQuery) => Promise<InventoryPage>, options: { force?: boolean } = {}): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    const saved = await load();
    if (!options.force && Date.now() - saved.fullSyncAt < FULL_SYNC_AFTER_MS) return;
    try {
      const everything: VehicleSummary[] = [];
      for (let page = 1; page <= 20; page += 1) {
        const result = await fetchPage({ sort: 'newest', page, limit: 50 });
        everything.push(...result.items);
        if (page >= result.totalPages) break;
      }
      const now = Date.now();
      memory = { cars: mergeCars([], everything), syncedAt: now, fullSyncAt: now };
      persistSoon();
    } catch {
      /* offline or API error: keep the copy we have */
    }
  })().finally(() => { syncing = null; });
  return syncing;
}

/** For tests. */
export function resetInventoryOffline(): void {
  memory = null;
  loading = null;
  syncing = null;
  if (writeTimer) clearTimeout(writeTimer);
}

/** Whether a failed request means "the server cannot be reached right now" (no signal, timeout, server down) - not a refusal. */
export function isUnreachable(error: unknown): boolean {
  const e = error as { status?: unknown; message?: unknown; code?: unknown } | null;
  if (!e) return false;
  const message = String(e.message ?? '');
  if (message === 'REQUEST_CANCELLED') return false;
  if (e.status === 0) return true;
  if (typeof e.status === 'number' && e.status >= 500) return true;
  return message === 'REQUEST_TIMEOUT' || message === 'SESSION_TIMEOUT' || message === 'NETWORK_UNREACHABLE' || /network request failed/i.test(message);
}

/** "just now", "5 min ago", "3 h ago", "2 days ago" for the notice shown above saved cars. */
export function describeAge(syncedAt: number | undefined, now: number = Date.now()): string {
  if (!syncedAt) return 'earlier';
  const minutes = Math.max(0, Math.round((now - syncedAt) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
