// Pure logic that turns the administrator-managed master data into the lists the app's forms need.
// The bundled car-catalog is only a first-run / offline fallback; once the API has returned data for a
// category, that data is the single source of truth (so deactivating a make in Admin really removes it).

export interface MasterItem {
  id?: string;
  category: string;
  code: string;
  name: string;
  parentCode: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CatalogFallback {
  makes: Array<{ name: string; category?: string }>;
  modelsByMake: Record<string, string[]>;
  fuelTypes: ReadonlyArray<{ value: string; label: string }>;
  transmissions: ReadonlyArray<{ value: string; label: string }>;
  ownershipTypes: ReadonlyArray<{ value: string; label: string }>;
  colours: ReadonlyArray<{ name: string; hex: string; borderOnly?: boolean }>;
}

export interface Catalog {
  makes: Array<{ name: string; category?: string }>;
  modelsByMake: Record<string, string[]>;
  fuelTypes: Array<{ value: string; label: string }>;
  transmissions: Array<{ value: string; label: string }>;
  ownershipTypes: Array<{ value: string; label: string }>;
  colours: Array<{ name: string; hex: string; borderOnly?: boolean }>;
  /** true when the lists come from the API (administrator-managed) rather than the bundled fallback. */
  fromServer: boolean;
}

const inCategory = (items: MasterItem[], category: string) => items.filter(item => item.category === category);

/** Common alternative spellings that appear on inventory or older requests. */
const MAKE_ALIASES: Record<string, string> = { maruti: 'maruti suzuki', suzuki: 'maruti suzuki', mercedes: 'mercedes-benz', 'land-rover': 'land rover' };

export function canonicalMakeName(input: string, knownMakes: string[]): string {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  const direct = knownMakes.find(name => name.toLowerCase() === lower);
  if (direct) return direct;
  const alias = MAKE_ALIASES[lower];
  return (alias && knownMakes.find(name => name.toLowerCase() === alias)) || trimmed;
}

/** Models for a make (case-insensitive, alias aware). */
export function modelsForMake(modelsByMake: Record<string, string[]>, make: string): string[] {
  if (!make) return [];
  const key = canonicalMakeName(make, Object.keys(modelsByMake));
  return modelsByMake[key] ?? [];
}

export function buildCatalog(items: MasterItem[], fallback: CatalogFallback): Catalog {
  const makeItems = inCategory(items, 'MAKE');
  const modelItems = inCategory(items, 'MODEL');
  const fuel = inCategory(items, 'FUEL_TYPE');
  const transmission = inCategory(items, 'TRANSMISSION');
  const ownership = inCategory(items, 'OWNERSHIP_TYPE');
  const colour = inCategory(items, 'COLOR');

  const makes = makeItems.length
    ? makeItems.map(item => ({ name: item.name, category: typeof item.metadata?.segment === 'string' ? (item.metadata.segment as string) : undefined }))
    : fallback.makes;

  let modelsByMake: Record<string, string[]>;
  if (makeItems.length) {
    modelsByMake = {};
    const makeNameByCode = new Map(makeItems.map(item => [item.code, item.name]));
    for (const model of modelItems) {
      const makeName = model.parentCode ? makeNameByCode.get(model.parentCode) : undefined;
      if (!makeName) continue;
      (modelsByMake[makeName] ||= []).push(model.name);
    }
  } else {
    modelsByMake = fallback.modelsByMake;
  }

  const pairs = (list: MasterItem[], fb: ReadonlyArray<{ value: string; label: string }>) =>
    list.length ? list.map(item => ({ value: item.code, label: item.name })) : [...fb];

  return {
    makes,
    modelsByMake,
    fuelTypes: pairs(fuel, fallback.fuelTypes),
    transmissions: pairs(transmission, fallback.transmissions),
    ownershipTypes: pairs(ownership, fallback.ownershipTypes),
    colours: colour.length
      ? colour.map(item => ({ name: item.name, hex: typeof item.metadata?.hex === 'string' ? (item.metadata.hex as string) : '#9CA3AF', borderOnly: item.metadata?.hex === '#FFFFFF' || undefined }))
      : [...fallback.colours],
    fromServer: makeItems.length > 0,
  };
}
