// Client side of the inventory facets: types, plus pure helpers that turn the REAL price / year / odometer
// ranges of the stock into filter options (instead of fixed buckets such as "Under 3 lakh").

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

export interface RangeOption { key: string; label: string; minPricePaise?: number; maxPricePaise?: number }

const LAKH = 100_000 * 100; // paise
const STEPS_LAKH = [1, 2, 3, 5, 10, 15, 20, 25, 50, 100, 200];

const lakhText = (paise: number) => {
  const lakh = paise / LAKH;
  return Number.isInteger(lakh) ? String(lakh) : lakh.toFixed(1);
};

/** Encodes a price bucket as the filter key 'P:<minPaise>:<maxPaise>' (empty bound = open). */
export function priceKey(min?: number, max?: number): string {
  return `P:${min ?? ''}:${max ?? ''}`;
}

export function priceBoundsFromKey(key: string): { minPricePaise?: number; maxPricePaise?: number } {
  const m = /^P:(\d*):(\d*)$/.exec(key);
  if (!m) return {};
  return {
    ...(m[1] ? { minPricePaise: Number(m[1]) } : {}),
    ...(m[2] ? { maxPricePaise: Number(m[2]) } : {}),
  };
}

/** Up to ~5 price buckets that exactly cover the stock's real price range, on round lakh boundaries. */
export function buildPriceOptions(range: { min: number; max: number } | null): RangeOption[] {
  if (!range) return [];
  const spanLakh = (range.max - range.min) / LAKH;
  if (spanLakh <= 0.5) return [{ key: priceKey(undefined, undefined), label: `₹${lakhText(range.min)} L` }];
  const step = STEPS_LAKH.find(s => spanLakh / s <= 4.5) ?? STEPS_LAKH[STEPS_LAKH.length - 1]!;
  const stepPaise = step * LAKH;
  const start = Math.floor(range.min / stepPaise) * stepPaise;
  const bounds: number[] = [];
  for (let edge = start + stepPaise; edge < range.max; edge += stepPaise) bounds.push(edge);
  const options: RangeOption[] = [];
  if (bounds.length === 0) return [{ key: priceKey(undefined, undefined), label: `Up to ₹${lakhText(Math.ceil(range.max / LAKH) * LAKH)} L` }];
  options.push({ key: priceKey(undefined, bounds[0]), label: `Under ₹${lakhText(bounds[0]!)} L`, maxPricePaise: bounds[0] });
  for (let i = 0; i < bounds.length - 1; i++) {
    options.push({ key: priceKey(bounds[i], bounds[i + 1]), label: `₹${lakhText(bounds[i]!)} - ${lakhText(bounds[i + 1]!)} L`, minPricePaise: bounds[i], maxPricePaise: bounds[i + 1] });
  }
  const last = bounds[bounds.length - 1]!;
  options.push({ key: priceKey(last, undefined), label: `Above ₹${lakhText(last)} L`, minPricePaise: last });
  return options;
}

/** 'YYYY & newer' options between the oldest and newest car in stock (at most 5, newest first). */
export function buildYearOptions(range: { min: number; max: number } | null): Array<{ value: number; label: string }> {
  if (!range) return [];
  const span = range.max - range.min;
  const step = span <= 4 ? 1 : span <= 10 ? 2 : 3;
  const years: number[] = [];
  for (let y = range.max; y >= range.min && years.length < 5; y -= step) years.push(y);
  return years.map(value => ({ value, label: `${value} & newer` }));
}

const KM_STEPS = [10_000, 25_000, 50_000, 75_000, 100_000, 150_000, 200_000];

/** 'Up to N km' options up to the highest odometer reading in stock. */
export function buildKmOptions(range: { min: number; max: number } | null): Array<{ value: number; label: string }> {
  if (!range) return [];
  const caps = KM_STEPS.filter(step => step >= range.min);
  const firstOver = caps.findIndex(step => step >= range.max);
  const used = firstOver === -1 ? caps.slice(-4) : caps.slice(Math.max(0, firstOver - 3), firstOver + 1);
  return used.map(value => ({ value, label: `Up to ${value.toLocaleString('en-IN')} km` }));
}
