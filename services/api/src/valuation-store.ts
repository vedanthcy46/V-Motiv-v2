import { PrismaClient } from '@prisma/client';
import { HttpError } from './errors.js';

export type InstantValuationInput = {
  leadId?: string;
  make: string;
  model: string;
  variant?: string;
  manufacturingYear: number;
  registrationYear?: number;
  fuelType: string;
  transmission: string;
  odometerKm: number;
  city: string;
  ownershipCount?: number;
  accidentHistory?: 'YES' | 'NO' | 'NOT_SURE';
  serviceHistory?: 'COMPLETE' | 'PARTIAL' | 'NOT_SURE';
  loanOutstanding?: boolean;
};

const valuationVersion = 'comparable-v1-data-gated';

/**
 * Public valuation is deliberately data-gated. Until an approved, contractually
 * permitted source and an approved pricing policy are configured, it persists an
 * explainable unavailable result instead of inventing a market or payout value.
 */
export class PrismaValuationStore {
  constructor(private readonly db: PrismaClient) {}

  async instant(uid: string, input: InstantValuationInput) {
    const user = await this.db.user.findUnique({ where: { firebaseUid: uid }, select: { id: true } });
    if (!user) throw new HttpError(404, 'PROFILE_NOT_REGISTERED');

    if (input.leadId) {
      const lead = await this.db.acquisitionLead.findFirst({ where: { id: input.leadId, userId: user.id }, select: { id: true } });
      if (!lead) throw new HttpError(404, 'LEAD_NOT_FOUND');
    }

    const comparableCount = await this.db.vehicleMarketObservation.count({
      where: {
        make: { equals: input.make, mode: 'insensitive' },
        model: { equals: input.model, mode: 'insensitive' },
        city: { equals: input.city, mode: 'insensitive' },
        fuelType: { equals: input.fuelType, mode: 'insensitive' },
        transmission: { equals: input.transmission, mode: 'insensitive' },
        qualityStatus: 'APPROVED',
        source: { active: true, permittedForValuation: true },
      },
    });

    // A numeric seller payout requires a separately approved, versioned cost and
    // margin policy. There is intentionally no frontend or hidden default policy.
    const unavailableReason = comparableCount < 3
      ? 'INSUFFICIENT_APPROVED_COMPARABLE_DATA'
      : 'PRICING_POLICY_NOT_CONFIGURED';
    const snapshot = await this.db.instantValuationSnapshot.create({
      data: {
        userId: user.id,
        leadId: input.leadId,
        // Prisma JSON fields must not receive JavaScript `undefined`; preserve a
        // stable, immutable copy of only the customer-supplied values.
        inputSnapshot: JSON.parse(JSON.stringify(input)),
        estimateAvailable: false,
        unavailableReason,
        confidence: 'INSUFFICIENT',
        comparableCount,
        valuationVersion,
        assumptions: [
          'This result is non-binding and does not use seller-declared details as verified facts.',
          'No numerical payout is shown until approved market data and a versioned pricing policy are available.',
        ],
      },
    });
    return this.publicSummary(snapshot);
  }

  async publicSummaryForUser(uid: string, id: string) {
    const snapshot = await this.db.instantValuationSnapshot.findFirst({
      where: { id, user: { firebaseUid: uid } },
    });
    if (!snapshot) throw new HttpError(404, 'VALUATION_NOT_FOUND');
    return this.publicSummary(snapshot);
  }

  private publicSummary(snapshot: {
    id: string; estimateAvailable: boolean; unavailableReason: string | null;
    sellerEstimateLowPaise: bigint | null; sellerEstimateHighPaise: bigint | null;
    confidence: string; comparableCount: number; dataAsOf: Date | null;
    valuationVersion: string; assumptions: unknown; createdAt: Date;
  }) {
    return {
      id: snapshot.id,
      estimateAvailable: snapshot.estimateAvailable,
      unavailableReason: snapshot.unavailableReason,
      sellerEstimateLowPaise: snapshot.sellerEstimateLowPaise?.toString() ?? null,
      sellerEstimateHighPaise: snapshot.sellerEstimateHighPaise?.toString() ?? null,
      confidenceCategory: snapshot.confidence,
      comparableCount: snapshot.comparableCount,
      dataAsOf: snapshot.dataAsOf?.toISOString() ?? null,
      valuationVersion: snapshot.valuationVersion,
      estimateDate: snapshot.createdAt.toISOString(),
      assumptions: snapshot.assumptions,
      disclaimer: 'This is an indicative estimate based on the details you provide and approved market information. It is not a purchase offer. The amount V MOTIV may offer can change after vehicle inspection, document checks and market review.',
    };
  }
}
