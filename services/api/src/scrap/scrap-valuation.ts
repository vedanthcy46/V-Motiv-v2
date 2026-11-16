// Scrap valuation. This is NOT used-car resale pricing: a scrapped vehicle is worth its recoverable material, less the cost of moving and
// processing it. There are three different things, kept apart:
//
//   INDICATIVE_ESTIMATE      a rough range shown early (this file). Never a promise.
//   PARTNER_QUOTATION        what a facility actually offers (ScrapPartnerQuote, a real record entered by a person)
//   APPROVED_CUSTOMER_OFFER  what the customer is offered after verification and approval (ScrapOffer)
//
// Every price used here comes from a policy an administrator maintains (ScrapPolicy "indicative_pricing"). Nothing is built in. When the policy,
// a price for the vehicle's category, a weight, or a needed cost is missing, the answer is QUOTATION_REQUIRED, not an invented number.
// Money is whole paise (BigInt): no floating point anywhere.

export const SCRAP_CALCULATION_VERSION = 'scrap-indicative-v1';
export const PRICING_POLICY_KEY = 'indicative_pricing';

/** What an administrator maintains. Prices are paise per kilogram; factors are in parts per thousand (1000 = 100%). */
export interface ScrapPricingPolicy {
  /** Where the prices came from and when they were set, shown in the estimate's source data. */
  source: string;
  effectiveFrom: string;
  /** Approved price per kg of recoverable material, by vehicle category. A category with no price cannot be estimated. */
  materialPricePerKgPaise: Record<string, number>;
  /** A typical kerb weight by category, used only when neither the customer nor an assessor gave one. Optional. */
  defaultWeightKg?: Record<string, number>;
  /** How much of the value remains for each completeness answer (COMPLETE, MOSTLY, PARTIAL). All three are required. */
  completenessPermille: Record<'COMPLETE' | 'MOSTLY' | 'PARTIAL', number>;
  towingCostPaise?: number;
  processingCostPaise?: number;
  /** The range shown is the central value plus or minus this many parts per thousand. */
  rangeSpreadPermille: number;
  /** How long an indicative estimate stays shown as current. */
  validDays: number;
}

export interface EstimateInput {
  vehicleCategory: string;
  measuredWeightKg?: number | null;
  estimatedWeightKg?: number | null;
  completeness?: string | null;
  towingRequired: boolean;
}

export interface EstimateResult {
  status: 'ESTIMATED' | 'QUOTATION_REQUIRED';
  calculationVersion: string;
  /** Why no figure was given. Shown to staff; the customer just sees "quotation required". */
  reason?: string;
  sourceData: Record<string, unknown>;
  adjustments: Array<{ label: string; paise: string }>;
  minPaise?: bigint;
  maxPaise?: bigint;
  expiresAt?: Date;
}

const isNonNegativeInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** Reads the stored policy defensively. Anything unreadable is "no policy", never a guess. */
export function parsePricingPolicy(raw: unknown): ScrapPricingPolicy | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const prices = value.materialPricePerKgPaise;
  const completeness = value.completenessPermille as Record<string, unknown> | undefined;
  if (typeof value.source !== 'string' || typeof value.effectiveFrom !== 'string') return null;
  if (!prices || typeof prices !== 'object' || !Object.values(prices).every(isNonNegativeInt) || Object.keys(prices).length === 0) return null;
  if (!completeness || !(['COMPLETE', 'MOSTLY', 'PARTIAL'] as const).every(key => isNonNegativeInt(completeness[key]) && (completeness[key] as number) <= 1000)) return null;
  if (!isNonNegativeInt(value.rangeSpreadPermille) || (value.rangeSpreadPermille as number) > 1000) return null;
  if (!isNonNegativeInt(value.validDays) || (value.validDays as number) < 1) return null;
  for (const optional of ['towingCostPaise', 'processingCostPaise'] as const) {
    if (value[optional] !== undefined && !isNonNegativeInt(value[optional])) return null;
  }
  const defaults = value.defaultWeightKg;
  if (defaults !== undefined && (typeof defaults !== 'object' || defaults === null || !Object.values(defaults).every(isNonNegativeInt))) return null;
  return value as unknown as ScrapPricingPolicy;
}

const required = (reason: string, sourceData: Record<string, unknown>): EstimateResult =>
  ({ status: 'QUOTATION_REQUIRED', calculationVersion: SCRAP_CALCULATION_VERSION, reason, sourceData, adjustments: [] });

export function computeIndicativeEstimate(input: EstimateInput, policy: ScrapPricingPolicy | null, now = new Date()): EstimateResult {
  if (!policy) return required('No approved scrap pricing is configured.', { policy: null });

  const price = policy.materialPricePerKgPaise[input.vehicleCategory];
  const policyRef = { source: policy.source, effectiveFrom: policy.effectiveFrom };
  if (price === undefined) return required(`There is no approved price for the "${input.vehicleCategory}" category.`, { policy: policyRef });

  // The most reliable weight wins: measured by an assessor, then the customer's estimate, then the category default.
  const weight =
    isNonNegativeInt(input.measuredWeightKg) && input.measuredWeightKg > 0 ? { kg: input.measuredWeightKg, basis: 'MEASURED' }
      : isNonNegativeInt(input.estimatedWeightKg) && input.estimatedWeightKg > 0 ? { kg: input.estimatedWeightKg, basis: 'CUSTOMER_ESTIMATE' }
        : (policy.defaultWeightKg?.[input.vehicleCategory] ?? 0) > 0 ? { kg: policy.defaultWeightKg![input.vehicleCategory]!, basis: 'CATEGORY_DEFAULT' }
          : null;
  if (!weight) return required('The vehicle weight is not known.', { policy: policyRef });

  const permille = input.completeness ? (policy.completenessPermille as Record<string, number>)[input.completeness] : undefined;
  if (permille === undefined) return required('How complete the vehicle is has not been recorded.', { policy: policyRef });

  if (input.towingRequired && policy.towingCostPaise === undefined) return required('Towing is needed but no towing cost is configured.', { policy: policyRef });

  const material = BigInt(weight.kg) * BigInt(price);
  const afterCompleteness = (material * BigInt(permille)) / 1000n;
  const adjustments: EstimateResult['adjustments'] = [
    { label: `Material value (${weight.kg} kg at ${weight.basis.toLowerCase().replace('_', ' ')})`, paise: material.toString() },
    { label: `Completeness (${permille / 10}%)`, paise: (afterCompleteness - material).toString() },
  ];
  let centre = afterCompleteness;
  if (input.towingRequired) {
    const towing = BigInt(policy.towingCostPaise!);
    centre -= towing;
    adjustments.push({ label: 'Towing', paise: (-towing).toString() });
  }
  if (policy.processingCostPaise) {
    const processing = BigInt(policy.processingCostPaise);
    centre -= processing;
    adjustments.push({ label: 'Processing', paise: (-processing).toString() });
  }
  if (centre < 0n) centre = 0n;

  const spread = BigInt(policy.rangeSpreadPermille);
  const expiresAt = new Date(now.getTime() + policy.validDays * 24 * 60 * 60 * 1000);
  return {
    status: 'ESTIMATED',
    calculationVersion: SCRAP_CALCULATION_VERSION,
    sourceData: { policy: policyRef, vehicleCategory: input.vehicleCategory, weightKg: weight.kg, weightBasis: weight.basis, pricePerKgPaise: price, completeness: input.completeness, towingRequired: input.towingRequired, computedAt: now.toISOString() },
    adjustments,
    minPaise: (centre * (1000n - spread)) / 1000n,
    maxPaise: (centre * (1000n + spread)) / 1000n,
    expiresAt,
  };
}
