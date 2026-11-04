// One definition of the master-data categories shared by the Admin portal, the seed and the public
// /master-data endpoint, so the three can never drift apart again (the Admin portal used to write
// CAR_MAKE while the app read MAKE, so nothing an administrator added ever reached the app).

export const MASTER_DATA_CATEGORIES = {
  MAKE: { label: 'Car make', parent: null },
  MODEL: { label: 'Car model', parent: 'MAKE' },
  VARIANT: { label: 'Car variant', parent: 'MODEL' },
  BODY_TYPE: { label: 'Body type', parent: null },
  FUEL_TYPE: { label: 'Fuel type', parent: null },
  TRANSMISSION: { label: 'Transmission', parent: null },
  COLOR: { label: 'Colour', parent: null },
  OWNERSHIP_TYPE: { label: 'Ownership type', parent: null },
  DOCUMENT_TYPE: { label: 'Document type', parent: null },
} as const;

export type MasterDataCategory = keyof typeof MASTER_DATA_CATEGORIES;

/** Names an older Admin portal build wrote; they map onto the canonical categories. */
const LEGACY_CATEGORY_ALIASES: Record<string, MasterDataCategory> = {
  CAR_MAKE: 'MAKE',
  CAR_MODEL: 'MODEL',
  CAR_VARIANT: 'VARIANT',
  CAR_BODY_TYPE: 'BODY_TYPE',
  TRANSMISSION_TYPE: 'TRANSMISSION',
  CAR_COLOR: 'COLOR',
  CAR_COLOUR: 'COLOR',
};

export function normalizeMasterDataCategory(input: string): MasterDataCategory | null {
  const key = input.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (key in MASTER_DATA_CATEGORIES) return key as MasterDataCategory;
  return LEGACY_CATEGORY_ALIASES[key] ?? null;
}

export function normalizeMasterDataCode(input: string): string {
  return input.trim().toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

export type MasterDataValidation =
  | { ok: true; category: MasterDataCategory; code: string; parentCategory: MasterDataCategory | null }
  | { ok: false; error: 'UNKNOWN_MASTER_DATA_CATEGORY' | 'INVALID_MASTER_DATA_CODE' | 'PARENT_REQUIRED' | 'PARENT_NOT_ALLOWED' };

/** Structural validation only; the caller still checks that the parent item exists and is active. */
export function validateMasterDataShape(input: { category: string; code: string; parentCode?: string | null }): MasterDataValidation {
  const category = normalizeMasterDataCategory(input.category);
  if (!category) return { ok: false, error: 'UNKNOWN_MASTER_DATA_CATEGORY' };
  const code = normalizeMasterDataCode(input.code);
  if (code.length < 2) return { ok: false, error: 'INVALID_MASTER_DATA_CODE' };
  const parentCategory = MASTER_DATA_CATEGORIES[category].parent;
  if (parentCategory && !input.parentCode) return { ok: false, error: 'PARENT_REQUIRED' };
  if (!parentCategory && input.parentCode) return { ok: false, error: 'PARENT_NOT_ALLOWED' };
  return { ok: true, category, code, parentCategory };
}

/**
 * Items whose parent (or grandparent) is deactivated must disappear from new entry forms too:
 * deactivating a make hides its models and variants.
 */
export function dropOrphanedChildren<T extends { category: string; code: string; parentCode: string | null; active?: boolean }>(
  items: T[],
): T[] {
  const depth = (category: string): number => {
    let d = 0;
    let current = MASTER_DATA_CATEGORIES[category as MasterDataCategory]?.parent as string | null | undefined;
    while (current) {
      d += 1;
      current = MASTER_DATA_CATEGORIES[current as MasterDataCategory]?.parent as string | null | undefined;
    }
    return d;
  };
  // Resolve level by level (makes, then models, then variants) so a child is visible only if its parent is.
  const visible = new Set<string>();
  const result = new Set<T>();
  for (const item of [...items].sort((x, y) => depth(x.category) - depth(y.category))) {
    if (item.active === false) continue;
    const parentCategory = MASTER_DATA_CATEGORIES[item.category as MasterDataCategory]?.parent;
    if (parentCategory && !(item.parentCode && visible.has(`${parentCategory}:${item.parentCode}`))) continue;
    visible.add(`${item.category}:${item.code}`);
    result.add(item);
  }
  return items.filter(item => result.has(item));
}
