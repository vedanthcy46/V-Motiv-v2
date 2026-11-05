// Single source for the GST applied to rental fares. It used to be a literal 18 in three places in the store (customer
// quote, walk-in booking, extensions) plus a copy in the operations portal preview, so a rate change had to be made in
// four places. The default is the current Indian rate for passenger-car rental; set RENTAL_GST_PERCENT to change it.
export const DEFAULT_RENTAL_GST_PERCENT = 18;

export function rentalGstPercent(env: Record<string, string | undefined> = process.env): number {
  const raw = env.RENTAL_GST_PERCENT?.trim();
  if (!raw) return DEFAULT_RENTAL_GST_PERCENT;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 40 ? parsed : DEFAULT_RENTAL_GST_PERCENT;
}

/** GST on a fare, in paise (rounded down, as before). Works with fractional percentages such as 12.5. */
export function gstOn(farePaise: bigint, env: Record<string, string | undefined> = process.env): bigint {
  const basisPoints = BigInt(Math.round(rentalGstPercent(env) * 100));
  return (farePaise * basisPoints) / 10_000n;
}
