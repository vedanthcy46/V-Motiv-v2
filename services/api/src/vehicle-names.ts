import { DEFAULT_MAKE_ALIAS_GROUPS, type MakeAliasGroup } from './inventory-facets.js';
// One spelling per make/model everywhere a car is entered (walk-in forms, seller leads, rental fleet, service vehicles).
// Staff and customers may pick from the administrator-managed master data OR type a brand that is not there yet.
// Anything that matches the catalogue (ignoring case, spacing and the usual short names) is stored with the catalogue's
// own spelling, so inventory filters, search and facets see "Maruti Suzuki" and never "maruti" / "MARUTI SUZUKI".
// Names that are not in the catalogue are kept exactly as typed (trimmed).
export interface MasterNameItem {
  category: string;
  code: string;
  name: string;
  parentCode: string | null;
  /** Optional administrator-entered extras; `aliases` (array of strings) lists other spellings of a make. */
  metadata?: Record<string, unknown> | null;
}

/** Short / alternative names people type for a make (lower-case -> lower-case catalogue name). */
const MAKE_ALIASES: Record<string, string> = {
  maruti: 'maruti suzuki',
  suzuki: 'maruti suzuki',
  mercedes: 'mercedes-benz',
  'mercedes benz': 'mercedes-benz',
  'land-rover': 'land rover',
  landrover: 'land rover',
  'rolls royce': 'rolls-royce',
  vw: 'volkswagen',
};

const clean = (value: string) => value.trim().replace(/\s+/g, ' ');
const key = (value: string) => clean(value).toLowerCase();

export function canonicalizeMakeModel(items: MasterNameItem[], make: string, model: string): { make: string; model: string } {
  const typedMake = clean(make);
  const typedModel = clean(model);
  const makes = items.filter(item => item.category === 'MAKE');
  const wanted = MAKE_ALIASES[key(typedMake)] ?? key(typedMake);
  const makeItem = makes.find(item => key(item.name) === wanted)
    ?? makes.find(item => Array.isArray(item.metadata?.aliases) && (item.metadata!.aliases as unknown[]).some(alias => typeof alias === 'string' && key(alias) === key(typedMake)));
  if (!makeItem) return { make: typedMake, model: typedModel };
  const models = items.filter(item => item.category === 'MODEL' && item.parentCode === makeItem.code);
  const modelItem = models.find(item => key(item.name) === key(typedModel));
  return { make: makeItem.name, model: modelItem ? modelItem.name : typedModel };
}

/** Alias groups for inventory search/facets, built from the master data (names, built-in short names, metadata.aliases). */
export function buildMakeAliasGroups(items: MasterNameItem[]): MakeAliasGroup[] {
  const groups = new Map<string, MakeAliasGroup>();
  for (const item of items) {
    if (item.category !== 'MAKE') continue;
    groups.set(key(item.name), { canonical: item.name, names: [key(item.name)] });
  }
  const add = (alias: string, canonicalLower: string) => {
    const group = groups.get(canonicalLower);
    const name = key(alias);
    if (group && name && !group.names.includes(name)) group.names.push(name);
  };
  for (const [alias, canonicalLower] of Object.entries(MAKE_ALIASES)) add(alias, canonicalLower);
  for (const item of items) {
    if (item.category !== 'MAKE') continue;
    const extra = item.metadata?.aliases;
    if (Array.isArray(extra)) for (const alias of extra) if (typeof alias === 'string') add(alias, key(item.name));
  }
  return [...groups.values()].filter(group => group.names.length > 1);
}

let cache: { at: number; items: MasterNameItem[] } | null = null;
const CACHE_MS = 60_000;

type NameDb = { masterDataItem?: { findMany: (args: unknown) => Promise<MasterNameItem[]> } };

/** Looks the catalogue up (cached for a minute) and normalises the spelling. Never throws: on any problem the input is kept. */
export async function canonicalMakeModel(db: NameDb, make: string, model: string): Promise<{ make: string; model: string }> {
  try {
    if (!db.masterDataItem) return { make: clean(make), model: clean(model) };
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      const items = await db.masterDataItem.findMany({
        where: { active: true, category: { in: ['MAKE', 'MODEL'] } },
        select: { category: true, code: true, name: true, parentCode: true, metadata: true },
      });
      cache = { at: Date.now(), items };
    }
    return canonicalizeMakeModel(cache.items, make, model);
  } catch {
    return { make: clean(make), model: clean(model) };
  }
}

/** Alias groups from the (cached) master data, or the built-in defaults when it is unavailable or has no makes. */
export async function loadMakeAliasGroups(db: NameDb): Promise<MakeAliasGroup[]> {
  try {
    await canonicalMakeModel(db, '', ''); // fills the cache
    const groups = cache ? buildMakeAliasGroups(cache.items) : [];
    return groups.length ? groups : DEFAULT_MAKE_ALIAS_GROUPS;
  } catch {
    return DEFAULT_MAKE_ALIAS_GROUPS;
  }
}

/** For tests. */
export function resetVehicleNameCache() {
  cache = null;
}
