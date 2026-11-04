// Customer-facing wording for the rental km allowance. Numbers come from the API (administrator-set
// hub policy, or the car's own value on result cards); nothing is hardcoded here.

export interface HubKmPolicy {
  includedKmPerDay: number | null;
  extraKmRatePaise: string | null;
}

/** Summary line under the rental-days stepper for the selected hub. */
export function kmPackageSummary(policy: HubKmPolicy | null | undefined, days: number): string {
  if (!policy || !policy.includedKmPerDay) {
    return 'Free km per day varies by car and is shown on each car';
  }
  const days1 = Math.max(1, days);
  const total = days1 * policy.includedKmPerDay;
  const rate = policy.extraKmRatePaise ? Math.round(Number(policy.extraKmRatePaise) / 100) : null;
  return `Includes ${total.toLocaleString('en-IN')} km (${policy.includedKmPerDay} km/day)${rate ? ` · Extra km ₹${rate}/km` : ''}`;
}
