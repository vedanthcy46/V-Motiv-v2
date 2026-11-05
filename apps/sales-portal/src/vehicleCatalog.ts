// Make / model lists from the administrator-managed master data (GET /master-data, public).
// Pure helpers (tested) + a small cached loader. Forms offer these lists and fall back to typing a name by hand, so a
// car that is not in the catalogue yet never blocks a booking, and a catalogue car always uses its canonical spelling.
export interface MasterItem {
  category: string;
  code: string;
  name: string;
  parentCode: string | null;
}

export interface MakeModelCatalog {
  makes: string[];
  modelsByMake: Record<string, string[]>;
}

export const OTHER_OPTION = '__OTHER__';

const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' });

export function buildMakeModelCatalog(items: MasterItem[]): MakeModelCatalog {
  const makeItems = items.filter(item => item.category === 'MAKE');
  const makeNameByCode = new Map(makeItems.map(item => [item.code, item.name]));
  const modelsByMake: Record<string, string[]> = {};
  for (const item of items) {
    if (item.category !== 'MODEL' || !item.parentCode) continue;
    const makeName = makeNameByCode.get(item.parentCode);
    if (!makeName) continue;
    (modelsByMake[makeName] ||= []).push(item.name);
  }
  for (const key of Object.keys(modelsByMake)) modelsByMake[key]!.sort(byName);
  return { makes: makeItems.map(item => item.name).sort(byName), modelsByMake };
}

/** Case/space-insensitive lookup that returns the canonical (catalogue) spelling, or undefined when not in the list. */
export function matchName(list: string[], value: string): string | undefined {
  const wanted = value.trim().toLowerCase();
  if (!wanted) return undefined;
  return list.find(name => name.toLowerCase() === wanted);
}

/** True when a value is filled in but is not a catalogue entry, so the form should show a free-text box for it. */
export function isManualEntry(list: string[], value: string): boolean {
  return value.trim().length > 0 && matchName(list, value) === undefined;
}

let cache: { at: number; promise: Promise<MakeModelCatalog> } | null = null;

/** Loads the catalogue at most once every 10 minutes per page; resolves to an empty catalogue if the API is unreachable. */
export function loadMakeModelCatalog(loadItems: () => Promise<MasterItem[]>): Promise<MakeModelCatalog> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.promise;
  const promise = loadItems()
    .then(buildMakeModelCatalog)
    .catch(() => {
      cache = null; // try again next time
      return { makes: [], modelsByMake: {} } as MakeModelCatalog;
    });
  cache = { at: Date.now(), promise };
  return promise;
}
