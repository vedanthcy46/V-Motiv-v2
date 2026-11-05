// Real, filter-aware option lists and counts for the inventory search screens.
// The app used to derive brand counts and ranges from the first page of results and offer fixed price /
// year / km buckets, so counts were wrong once stock grew past one page. These facets are computed from
// the whole published inventory with the same matching rules as the search itself.

export interface FacetRow {
  title: string;
  pricePaise: number;
  make: string;
  model: string;
  fuelType: string | null;
  transmission: string | null;
  bodyType: string | null;
  color: string | null;
  city: string | null;
  year: number | null;
  odometerKm: number | null;
  features: string[];
}

export interface FacetFilters {
  search?: string;
  city?: string;
  fuelType?: string;
  transmission?: string;
  makes?: string[];
  models?: string[];
  bodyType?: string;
  color?: string;
  features?: string[];
  minYear?: number;
  maxYear?: number;
  maxOdometerKm?: number;
  minPricePaise?: number;
  maxPricePaise?: number;
}

type Dimension = 'city' | 'fuelType' | 'transmission' | 'make' | 'model' | 'bodyType' | 'color' | 'features' | 'year' | 'odometerKm' | 'price';

/** A make and the other spellings that mean it (all lower-case in `names`, which includes the canonical name). */
export interface MakeAliasGroup {
  canonical: string;
  names: string[];
}

/**
 * Fallback when the master data is unavailable. Normally the groups are built from the administrator-managed master data
 * (see buildMakeAliasGroups in vehicle-names.ts), so a make added or renamed in Admin is grouped without a code change.
 */
export const DEFAULT_MAKE_ALIAS_GROUPS: MakeAliasGroup[] = [
  { canonical: 'Maruti Suzuki', names: ['maruti suzuki', 'maruti', 'suzuki'] },
  { canonical: 'Mercedes-Benz', names: ['mercedes-benz', 'mercedes'] },
  { canonical: 'Land Rover', names: ['land rover', 'land-rover'] },
];

import { normalizeBodyType } from './body-types.js';

const lower = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/** All spellings that should match when a customer picks a make (lower-cased). */
export function makeMatchSet(names: string[], groups: MakeAliasGroup[] = DEFAULT_MAKE_ALIAS_GROUPS): Set<string> {
  const out = new Set<string>();
  for (const name of names) {
    const key = lower(name);
    if (!key) continue;
    out.add(key);
    const group = groups.find(g => g.names.includes(key));
    group?.names.forEach(alias => out.add(alias));
  }
  return out;
}

/** Mixed-case spellings to hand to a case-insensitive database filter. */
export function makeSpellings(names: string[], groups: MakeAliasGroup[] = DEFAULT_MAKE_ALIAS_GROUPS): string[] {
  return [...makeMatchSet(names, groups)];
}

/** 'Hatchback', 'HATCHBACK' and 'hatch back' are the same body type; an unknown spelling still compares as plain text. */
function sameBodyType(rowValue: string | null | undefined, wanted: string): boolean {
  const a = normalizeBodyType(rowValue);
  const b = normalizeBodyType(wanted);
  return a && b ? a === b : lower(rowValue) === lower(wanted);
}

function matches(row: FacetRow, f: FacetFilters, skip?: Dimension, groups: MakeAliasGroup[] = DEFAULT_MAKE_ALIAS_GROUPS): boolean {
  if (f.search) {
    const q = lower(f.search);
    if (![row.title, row.make, row.model].some(text => lower(text).includes(q))) return false;
  }
  if (skip !== 'city' && f.city && lower(row.city) !== lower(f.city)) return false;
  if (skip !== 'fuelType' && f.fuelType && lower(row.fuelType) !== lower(f.fuelType)) return false;
  if (skip !== 'transmission' && f.transmission && lower(row.transmission) !== lower(f.transmission)) return false;
  if (skip !== 'bodyType' && f.bodyType && !sameBodyType(row.bodyType, f.bodyType)) return false;
  if (skip !== 'color' && f.color && lower(row.color) !== lower(f.color)) return false;
  if (skip !== 'make' && f.makes?.length && !makeMatchSet(f.makes, groups).has(lower(row.make))) return false;
  if (skip !== 'model' && f.models?.length && !f.models.some(model => lower(model) === lower(row.model))) return false;
  if (skip !== 'features' && f.features?.length && !f.features.every(feature => row.features.some(have => lower(have) === lower(feature)))) return false;
  if (skip !== 'year') {
    if (f.minYear && (row.year ?? 0) < f.minYear) return false;
    if (f.maxYear && (row.year ?? 0) > f.maxYear) return false;
  }
  if (skip !== 'odometerKm' && f.maxOdometerKm && (row.odometerKm ?? 0) > f.maxOdometerKm) return false;
  if (skip !== 'price') {
    if (f.minPricePaise && row.pricePaise < f.minPricePaise) return false;
    if (f.maxPricePaise && row.pricePaise > f.maxPricePaise) return false;
  }
  return true;
}

export interface FacetCount { value: string; count: number }
export interface InventoryFacets {
  total: number;
  makes: FacetCount[];
  models: Array<FacetCount & { make: string }>;
  fuelTypes: FacetCount[];
  transmissions: FacetCount[];
  bodyTypes: FacetCount[];
  colors: FacetCount[];
  cities: FacetCount[];
  features: FacetCount[];
  ranges: {
    price: { min: number; max: number } | null;
    year: { min: number; max: number } | null;
    odometerKm: { min: number; max: number } | null;
  };
}

function tally(values: Iterable<string | null | undefined>, canonical?: (v: string) => string): FacetCount[] {
  const counts = new Map<string, { value: string; count: number }>();
  for (const raw of values) {
    const value = (raw ?? '').trim();
    if (!value) continue;
    const display = canonical ? canonical(value) : value;
    const key = display.toLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { value: display, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function range(values: Array<number | null>): { min: number; max: number } | null {
  const nums = values.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  return nums.length ? { min: Math.min(...nums), max: Math.max(...nums) } : null;
}

/**
 * Standard faceted-search semantics: each option list is counted over the rows that match every OTHER filter,
 * so picking "Hyundai" does not make the other brands disappear, and counts stay truthful.
 */
export function computeInventoryFacets(rows: FacetRow[], filters: FacetFilters, groups: MakeAliasGroup[] = DEFAULT_MAKE_ALIAS_GROUPS): InventoryFacets {
  const forDim = (dim: Dimension) => rows.filter(row => matches(row, filters, dim, groups));
  // Fold alias spellings (Maruti / Suzuki) into one make so counts are not split.
  const canonicalMake = (value: string) => groups.find(g => g.names.includes(value.trim().toLowerCase()))?.canonical ?? value;
  const modelRows = forDim('model');
  return {
    total: rows.filter(row => matches(row, filters, undefined, groups)).length,
    makes: tally(forDim('make').map(r => r.make), canonicalMake),
    models: (() => {
      const byKey = new Map<string, { value: string; make: string; count: number }>();
      for (const row of modelRows) {
        const model = row.model.trim();
        if (!model) continue;
        const key = `${lower(canonicalMake(row.make))}|${lower(model)}`;
        const entry = byKey.get(key);
        if (entry) entry.count += 1;
        else byKey.set(key, { value: model, make: canonicalMake(row.make.trim()), count: 1 });
      }
      return [...byKey.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    })(),
    fuelTypes: tally(forDim('fuelType').map(r => r.fuelType)),
    transmissions: tally(forDim('transmission').map(r => r.transmission)),
    bodyTypes: tally(forDim('bodyType').map(r => normalizeBodyType(r.bodyType) ?? r.bodyType)),
    colors: tally(forDim('color').map(r => r.color)),
    cities: tally(forDim('city').map(r => r.city)),
    features: tally(forDim('features').flatMap(r => r.features)),
    ranges: {
      price: range(forDim('price').map(r => r.pricePaise)),
      year: range(forDim('year').map(r => r.year)),
      odometerKm: range(forDim('odometerKm').map(r => r.odometerKm)),
    },
  };
}
