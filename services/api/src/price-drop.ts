// "Was / now" pricing for car listings. The original price is what customers first saw; a drop below it is shown
// as a percentage in the apps. A price rise starts a new original (so an increase followed by a cut never looks like a discount).

/** The original price to store after a price change. */
export function nextOriginalPrice(previous: { pricePaise?: bigint | null; originalPricePaise?: bigint | null } | null | undefined, newPricePaise: bigint): bigint {
  const base = previous?.originalPricePaise ?? previous?.pricePaise ?? null;
  if (base === null || base <= 0n) return newPricePaise;
  return newPricePaise >= base ? newPricePaise : base;
}

export interface PriceDrop { originalPricePaise: string; discountPercent: number; savingsPaise: string }

/** The drop to show customers, or null when the price has not fallen by at least 1%. */
export function priceDrop(pricePaise: bigint | number | string, originalPricePaise?: bigint | number | string | null): PriceDrop | null {
  if (originalPricePaise === null || originalPricePaise === undefined) return null;
  const now = BigInt(pricePaise);
  const was = BigInt(originalPricePaise);
  if (now <= 0n || was <= now) return null;
  const percent = Number(((was - now) * 100n) / was);
  if (percent < 1) return null;
  return { originalPricePaise: was.toString(), discountPercent: percent, savingsPaise: (was - now).toString() };
}
