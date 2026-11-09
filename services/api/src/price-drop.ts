// "Was / now" pricing for car listings. The original price is what customers first saw; a drop below it is shown
// as a percentage in the apps. A price rise starts a new original (so an increase followed by a cut never looks like a discount).

/** The original price to store after a price change. */
export function nextOriginalPrice(previous: { pricePaise?: bigint | null; originalPricePaise?: bigint | null } | null | undefined, newPricePaise: bigint): bigint {
  const base = previous?.originalPricePaise ?? previous?.pricePaise ?? null;
  if (base === null || base <= 0n) return newPricePaise;
  return newPricePaise >= base ? newPricePaise : base;
}

export interface PriceDrop { originalPricePaise: string; discountPercent: number; savingsPaise: string }

/** The drop to show customers (percent to one decimal, rounded down), or null when the price has not fallen by at least 0.1%. */
export function priceDrop(pricePaise: bigint | number | string, originalPricePaise?: bigint | number | string | null): PriceDrop | null {
  if (originalPricePaise === null || originalPricePaise === undefined) return null;
  const now = BigInt(pricePaise);
  const was = BigInt(originalPricePaise);
  if (now <= 0n || was <= now) return null;
  const percent = Number(((was - now) * 1000n) / was) / 10;
  if (percent < 0.1) return null;
  return { originalPricePaise: was.toString(), discountPercent: percent, savingsPaise: (was - now).toString() };
}

/**
 * The original ("was") price to store when a listing's price is saved or published.
 * Only a listing that is already live (published or reserved) can have a price DROP: while it is a draft, or when it is
 * published for the first time, the price being set is simply the starting price. Once live, a cut keeps the original,
 * and re-publishing or re-saving never wipes it.
 */
export function originalPriceAfterChange(
  previous: { pricePaise?: bigint | null; originalPricePaise?: bigint | null; status?: string | null } | null | undefined,
  newPricePaise: bigint,
): bigint {
  const live = previous?.status === 'PUBLISHED' || previous?.status === 'RESERVED';
  return live ? nextOriginalPrice(previous, newPricePaise) : newPricePaise;
}
