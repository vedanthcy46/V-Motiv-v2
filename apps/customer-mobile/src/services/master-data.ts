// Loads the administrator-managed master data once, caches it on the device, and exposes it to forms.
import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { customer } from './customer';
import { buildCatalog, type Catalog, type CatalogFallback, type MasterItem } from './master-data-model';
import { CAR_COLOURS, CAR_MAKES, FUEL_TYPES, MODELS_BY_MAKE, OWNERSHIP_TYPES, TRANSMISSIONS } from '../constants/car-catalog';

const CACHE_KEY = 'vmotiv.masterData.v1';
const REFRESH_AFTER_MS = 10 * 60 * 1000;

/** First-run / offline fallback only. The API data wins as soon as it is available. */
const BUNDLED_FALLBACK: CatalogFallback = {
  makes: CAR_MAKES,
  modelsByMake: MODELS_BY_MAKE,
  fuelTypes: FUEL_TYPES,
  transmissions: TRANSMISSIONS,
  ownershipTypes: OWNERSHIP_TYPES,
  colours: CAR_COLOURS,
};

let memory: { items: MasterItem[]; fetchedAt: number } | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

async function readCache(): Promise<void> {
  if (memory) return;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { items: MasterItem[]; fetchedAt: number };
      if (Array.isArray(parsed.items)) memory = { items: parsed.items, fetchedAt: parsed.fetchedAt || 0 };
    }
  } catch {
    /* an unreadable cache is simply ignored */
  }
}

/** Fetches fresh master data (at most every 10 minutes) and keeps the last good copy for offline use. */
export function refreshMasterData(force = false): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    await readCache();
    if (!force && memory && Date.now() - memory.fetchedAt < REFRESH_AFTER_MS) return;
    try {
      const items = (await customer.masterData()) as MasterItem[];
      if (Array.isArray(items)) {
        memory = { items, fetchedAt: Date.now() };
        notify();
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(memory)).catch(() => undefined);
      }
    } catch {
      /* offline or API error: keep whatever we already have */
    }
  })().finally(() => {
    inflight = null;
    notify();
  });
  return inflight;
}

/** The make/model/fuel/transmission/ownership/colour lists for forms, backed by the Admin portal's master data. */
export function useCatalog(): Catalog {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion(value => value + 1);
    listeners.add(listener);
    void refreshMasterData().then(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const items = memory?.items;
  return useMemo(() => buildCatalog(items ?? [], BUNDLED_FALLBACK), [items]);
}

/** Raw master data items (for screens that need categories the catalogue does not cover). */
export function useMasterItems(): MasterItem[] {
  useCatalog();
  return memory?.items ?? [];
}
