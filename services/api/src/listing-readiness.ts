// What a car listing must have before customers see it, and while it is live. One definition used by Publish, by editing a
// live listing, and by the Operations screens (which show the missing items instead of letting someone press a button that fails).

export const MIN_LISTING_PHOTOS = 3;

export interface ListingFacts {
  title?: string | null;
  pricePaise?: bigint | number | null;
  photoCount: number;
  color?: string | null;
  registrationNumber?: string | null;
  conditionSummary?: string | null;
  branchId?: string | null;
}

export interface ListingGap { key: 'title' | 'price' | 'photos' | 'color' | 'registrationNumber' | 'conditionSummary' | 'branch'; label: string }

/** What is still missing. `price` is only checked when `requirePrice` is true (the price is set at the publish step). */
export function listingGaps(facts: ListingFacts, options: { requirePrice?: boolean } = {}): ListingGap[] {
  const gaps: ListingGap[] = [];
  const filled = (value?: string | null) => Boolean(value && value.trim().length > 0);
  if (!filled(facts.title) || (facts.title ?? '').trim().length < 3) gaps.push({ key: 'title', label: 'a listing title' });
  if (options.requirePrice && !(facts.pricePaise !== null && facts.pricePaise !== undefined && BigInt(facts.pricePaise) > 0n)) gaps.push({ key: 'price', label: 'a retail price' });
  if (facts.photoCount < MIN_LISTING_PHOTOS) gaps.push({ key: 'photos', label: `at least ${MIN_LISTING_PHOTOS} photos (has ${facts.photoCount})` });
  if (!filled(facts.color)) gaps.push({ key: 'color', label: 'the exterior colour' });
  if (!filled(facts.registrationNumber)) gaps.push({ key: 'registrationNumber', label: 'the registration number' });
  if (!filled(facts.conditionSummary)) gaps.push({ key: 'conditionSummary', label: 'a condition summary for customers' });
  if (!facts.branchId) gaps.push({ key: 'branch', label: 'the branch where the car is kept' });
  return gaps;
}

export function listingGapMessage(gaps: ListingGap[]): string {
  return `The listing is not complete yet. Still needed: ${gaps.map(gap => gap.label).join(', ')}.`;
}
