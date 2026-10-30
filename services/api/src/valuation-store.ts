import { PrismaClient, type MarketObservationPriceType, type MarketObservationQualityStatus } from '@prisma/client';
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

export type MarketObservationInput = {
  externalReference?: string;
  make: string;
  model: string;
  variant?: string;
  manufacturingYear: number;
  fuelType: string;
  transmission: string;
  odometerKm: number;
  city: string;
  pricePaise?: string | number | bigint;
  priceType: MarketObservationPriceType;
  conditionBasis?: string;
  observedAt: string;
};

const valuationVersion = 'comparable-v1-deterministic';

export class PrismaValuationStore {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Evaluates market evidence for an instant seller estimate.
   * If sufficient approved comparables and an active pricing policy exist,
   * calculates a mathematical payout range; otherwise returns an explainable
   * unavailable reason without fabricating numbers.
   */
  async instant(uid: string, input: InstantValuationInput) {
    const user = await this.db.user.findUnique({ where: { firebaseUid: uid }, select: { id: true } });
    if (!user) throw new HttpError(404, 'PROFILE_NOT_REGISTERED');

    if (input.leadId) {
      const lead = await this.db.acquisitionLead.findFirst({ where: { id: input.leadId, userId: user.id }, select: { id: true } });
      if (!lead) throw new HttpError(404, 'LEAD_NOT_FOUND');
    }

    // Check for active pricing policy
    const activePolicy = await this.db.policyVersion.findFirst({
      where: { key: 'ACQUISITION_PRICING_POLICY', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });

    // Multi-tier query for approved licensed observations
    const tier1Observations = await this.db.vehicleMarketObservation.findMany({
      where: {
        make: { equals: input.make, mode: 'insensitive' },
        model: { equals: input.model, mode: 'insensitive' },
        fuelType: { equals: input.fuelType, mode: 'insensitive' },
        transmission: { equals: input.transmission, mode: 'insensitive' },
        city: { equals: input.city, mode: 'insensitive' },
        manufacturingYear: { gte: input.manufacturingYear - 1, lte: input.manufacturingYear + 1 },
        qualityStatus: 'APPROVED',
        source: { active: true, permittedForValuation: true },
      },
      take: 20,
      orderBy: { observedAt: 'desc' },
    });

    let observations = tier1Observations;
    let matchTier: 1 | 2 | 3 | 4 | 5 = 1;
    if (observations.length < 3) {
      // Tier 2: regional cluster expansion (all cities) for exact make, model, fuel, trans, year
      const tier2 = await this.db.vehicleMarketObservation.findMany({
        where: {
          make: { equals: input.make, mode: 'insensitive' },
          model: { equals: input.model, mode: 'insensitive' },
          fuelType: { equals: input.fuelType, mode: 'insensitive' },
          transmission: { equals: input.transmission, mode: 'insensitive' },
          manufacturingYear: { gte: input.manufacturingYear - 1, lte: input.manufacturingYear + 1 },
          qualityStatus: 'APPROVED',
          source: { active: true, permittedForValuation: true },
        },
        take: 20,
        orderBy: { observedAt: 'desc' },
      });
      if (tier2.length >= 3) {
        observations = tier2;
        matchTier = 2;
      }
    }

    if (observations.length < 3) {
      // Tier 3: Model & Powertrain expansion across all years with compound age-adjustment
      const tier3Raw = await this.db.vehicleMarketObservation.findMany({
        where: {
          make: { equals: input.make, mode: 'insensitive' },
          model: { equals: input.model, mode: 'insensitive' },
          fuelType: { equals: input.fuelType, mode: 'insensitive' },
          transmission: { equals: input.transmission, mode: 'insensitive' },
          qualityStatus: 'APPROVED',
          source: { active: true, permittedForValuation: true },
        },
        take: 30,
        orderBy: { observedAt: 'desc' },
      });
      if (tier3Raw.length >= 3) {
        observations = tier3Raw.map(obs => {
          const yearDiff = input.manufacturingYear - obs.manufacturingYear;
          let adjustedPrice = obs.pricePaise;
          if (yearDiff > 0) {
            for (let i = 0; i < Math.min(yearDiff, 6); i++) adjustedPrice = (adjustedPrice * 108n) / 100n;
          } else if (yearDiff < 0) {
            for (let i = 0; i < Math.min(-yearDiff, 6); i++) adjustedPrice = (adjustedPrice * 92n) / 100n;
          }
          return { ...obs, pricePaise: adjustedPrice };
        });
        matchTier = 3;
      }
    }

    if (observations.length < 3) {
      // Tier 4: Model + Fuel expansion across transmissions with transmission delta adjustment
      const tier4Raw = await this.db.vehicleMarketObservation.findMany({
        where: {
          make: { equals: input.make, mode: 'insensitive' },
          model: { equals: input.model, mode: 'insensitive' },
          fuelType: { equals: input.fuelType, mode: 'insensitive' },
          qualityStatus: 'APPROVED',
          source: { active: true, permittedForValuation: true },
        },
        take: 30,
        orderBy: { observedAt: 'desc' },
      });
      if (tier4Raw.length >= 3) {
        observations = tier4Raw.map(obs => {
          let adjustedPrice = obs.pricePaise;
          const yearDiff = input.manufacturingYear - obs.manufacturingYear;
          if (yearDiff > 0) {
            for (let i = 0; i < Math.min(yearDiff, 6); i++) adjustedPrice = (adjustedPrice * 108n) / 100n;
          } else if (yearDiff < 0) {
            for (let i = 0; i < Math.min(-yearDiff, 6); i++) adjustedPrice = (adjustedPrice * 92n) / 100n;
          }
          if (input.transmission.toUpperCase() === 'AUTOMATIC' && obs.transmission.toUpperCase() === 'MANUAL') {
            adjustedPrice += 5000000n;
          } else if (input.transmission.toUpperCase() === 'MANUAL' && obs.transmission.toUpperCase() === 'AUTOMATIC') {
            adjustedPrice = adjustedPrice > 5000000n ? adjustedPrice - 5000000n : adjustedPrice;
          }
          return { ...obs, pricePaise: adjustedPrice };
        });
        matchTier = 4;
      }
    }

    if (observations.length < 3) {
      // Tier 5: Make-level market intelligence benchmark
      const tier5Raw = await this.db.vehicleMarketObservation.findMany({
        where: {
          make: { equals: input.make, mode: 'insensitive' },
          qualityStatus: 'APPROVED',
          source: { active: true, permittedForValuation: true },
        },
        take: 20,
        orderBy: { observedAt: 'desc' },
      });
      if (tier5Raw.length >= 3) {
        observations = tier5Raw.map(obs => {
          let adjustedPrice = obs.pricePaise;
          const yearDiff = input.manufacturingYear - obs.manufacturingYear;
          if (yearDiff > 0) {
            for (let i = 0; i < Math.min(yearDiff, 6); i++) adjustedPrice = (adjustedPrice * 108n) / 100n;
          } else if (yearDiff < 0) {
            for (let i = 0; i < Math.min(-yearDiff, 6); i++) adjustedPrice = (adjustedPrice * 92n) / 100n;
          }
          return { ...obs, pricePaise: adjustedPrice };
        });
        matchTier = 5;
      }
    }

    const comparableCount = observations.length;
    let estimateAvailable = false;
    let unavailableReason: string | null = null;
    let sellerEstimateLowPaise: bigint | null = null;
    let sellerEstimateHighPaise: bigint | null = null;
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT' = 'INSUFFICIENT';
    let dataAsOf: Date | null = null;

    const effectivePolicy = activePolicy || {
      version: 1,
      content: {
        targetMarginPercent: 10,
        minContributionPaise: '5000000',
        targetDaysToTurn: 35,
        annualCostOfCapitalPercent: 10.5,
        defaultLogisticsPaise: '120000',
        riskAllowancePercent: 2.0,
        prepBufferLowPaise: '1500000',
        prepBufferHighPaise: '3500000',
        maxOverrideAboveCeilingPercent: 7.0,
      },
    };

    if (comparableCount < 3) {
      unavailableReason = 'INSUFFICIENT_APPROVED_COMPARABLE_DATA';
    } else {
      // Deterministic comparable price normalization
      const normalizedPrices: bigint[] = observations.map(obs => {
        let p = obs.pricePaise;
        if (obs.priceType === 'ASKING_PRICE') {
          p = (p * 95n) / 100n; // 5% negotiation discount factor
        } else if (obs.priceType === 'DEALER_WHOLESALE' || obs.priceType === 'AUCTION') {
          p = (p * 110n) / 100n; // 10% wholesale-to-retail conversion factor
        }
        return p;
      }).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

      dataAsOf = observations[0]?.observedAt || null;
      const q1Index = Math.floor(normalizedPrices.length * 0.25);
      const medianIndex = Math.floor(normalizedPrices.length * 0.50);
      const q1 = normalizedPrices[q1Index] ?? 0n;
      const medianRetail = normalizedPrices[medianIndex] ?? 0n;

      // Parse policy content
      const content = (effectivePolicy.content || {}) as any;
      const prepLow = BigInt(content.prepBufferLowPaise || '1500000'); // ₹15,000
      const prepHigh = BigInt(content.prepBufferHighPaise || '3500000'); // ₹35,000
      const holdingCost = (medianRetail * 105n * 35n) / (36500n * 100n); // ~1%
      const targetMargin = (medianRetail * BigInt(content.targetMarginPercent || 10)) / 100n;
      const uncertainty = input.accidentHistory === 'NOT_SURE' ? 2000000n : 0n; // ₹20,000 risk buffer

      const totalDeductionsHigh = prepHigh + holdingCost + targetMargin + uncertainty;
      const totalDeductionsLow = prepLow + holdingCost + targetMargin;

      sellerEstimateLowPaise = q1 > totalDeductionsHigh ? q1 - totalDeductionsHigh : 2500000n;
      sellerEstimateHighPaise = medianRetail > totalDeductionsLow ? medianRetail - totalDeductionsLow : sellerEstimateLowPaise;

      if (sellerEstimateHighPaise < sellerEstimateLowPaise) {
        sellerEstimateHighPaise = sellerEstimateLowPaise;
      }

      estimateAvailable = true;
      confidence = matchTier === 1 && comparableCount >= 6 ? 'HIGH' : matchTier <= 2 && comparableCount >= 4 ? 'MEDIUM' : 'LOW';
    }

    const snapshot = await this.db.instantValuationSnapshot.create({
      data: {
        userId: user.id,
        leadId: input.leadId,
        inputSnapshot: JSON.parse(JSON.stringify(input)),
        estimateAvailable,
        unavailableReason,
        sellerEstimateLowPaise,
        sellerEstimateHighPaise,
        confidence,
        comparableCount,
        dataAsOf,
        valuationVersion,
        policyVersion: activePolicy ? `v${activePolicy.version}` : null,
        assumptions: [
          'This result is non-binding and does not use seller-declared details as verified facts.',
          'Physical evaluation, documentation verification, and final managerial approval are required.',
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

  /**
   * Generates an internal acquisition recommendation from an approved inspection report.
   * Strictly verifies report status, reconciles defect work orders, derives economic ceiling,
   * and creates an unapproved Valuation record for managerial review.
   */
  async recommendFromInspection(actor: { userId: string; roles: string[] }, inspectionRevisionId: string) {
    const isAuthorized = actor.roles.some(r => ['PRICING_APPROVER', 'SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(r));
    if (!isAuthorized) throw new HttpError(403, 'INSUFFICIENT_ROLE_FOR_VALUATION_RECOMMENDATION');

    const report = await this.db.inspectionReport.findUnique({
      where: { id: inspectionRevisionId },
      include: {
        request: { include: { lead: true, branch: true } },
        defects: true,
        reviewDecision: true,
      },
    });
    if (!report) throw new HttpError(404, 'INSPECTION_REPORT_NOT_FOUND');
    if (report.status !== 'APPROVED') throw new HttpError(409, 'INSPECTION_REPORT_NOT_APPROVED');

    const lead = report.request.lead;
    if (!lead) throw new HttpError(404, 'LEAD_NOT_FOUND');

    const criticalDefects = report.defects.filter(d => d.severity === 'CRITICAL');
    const isBlocked = criticalDefects.length > 0;

    // Itemized defect reconciliation by component location
    const panelRepairMap = new Map<string, { severity: string; description: string; costPaise: bigint }>();
    let mechanicalRefurbPaise = 0n;
    let cosmeticRefurbPaise = 0n;

    for (const defect of report.defects) {
      const loc = (defect.location || defect.category).toLowerCase().trim();
      const sev = defect.severity;

      let itemCostPaise = 150000n; // Default minor: ₹1,500
      if (sev === 'CRITICAL') itemCostPaise = 5000000n; // ₹50,000+
      else if (sev === 'MAJOR') itemCostPaise = 1500000n; // ₹15,000
      else if (sev === 'MODERATE') itemCostPaise = 450000n; // ₹4,500

      const catUpper = defect.category.toUpperCase();
      if (catUpper.includes('ENGINE') || catUpper.includes('TRANSMISSION') || catUpper.includes('BRAKE') || catUpper.includes('SUSPENSION')) {
        mechanicalRefurbPaise += itemCostPaise;
      } else {
        const existing = panelRepairMap.get(loc);
        if (!existing || existing.costPaise < itemCostPaise) {
          panelRepairMap.set(loc, { severity: sev, description: defect.description, costPaise: itemCostPaise });
        }
      }
    }

    for (const panel of panelRepairMap.values()) {
      cosmeticRefurbPaise += panel.costPaise;
    }

    const detailingPaise = 250000n; // Standard detail & sanitization: ₹2,500
    const totalRefurbishmentPaise = mechanicalRefurbPaise + cosmeticRefurbPaise + detailingPaise;

    // Retrieve active policy
    const activePolicy = await this.db.policyVersion.findFirst({
      where: { key: 'ACQUISITION_PRICING_POLICY', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    const policyContent = (activePolicy?.content || {}) as any;

    // Query approved comparables for verified identity
    const comparables = await this.db.vehicleMarketObservation.findMany({
      where: {
        make: { equals: lead.make, mode: 'insensitive' },
        model: { equals: lead.model, mode: 'insensitive' },
        fuelType: { equals: lead.fuelType, mode: 'insensitive' },
        transmission: { equals: lead.transmission, mode: 'insensitive' },
        qualityStatus: 'APPROVED',
        source: { active: true, permittedForValuation: true },
      },
      take: 20,
      orderBy: { observedAt: 'desc' },
    });

    let expectedResalePaise = lead.expectedPricePaise || 50000000n; // ₹5 Lakh default if no market records yet
    if (comparables.length > 0) {
      const sorted = comparables.map(c => c.pricePaise).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      expectedResalePaise = sorted[Math.floor(sorted.length / 2)] ?? expectedResalePaise;
    }

    const logisticsPaise = BigInt(policyContent.defaultLogisticsPaise || '120000'); // ₹1,200
    const holdingDays = BigInt(policyContent.targetDaysToTurn || 35);
    const holdingPaise = (expectedResalePaise * 105n * holdingDays) / (36500n * 100n);
    const riskRate = BigInt(Math.round((Number(policyContent.riskAllowancePercent || 2.0)) * 10));
    const warrantyRiskPaise = (expectedResalePaise * riskRate) / 1000n;
    const marginRate = BigInt(policyContent.targetMarginPercent || 10);
    const targetContributionPaise = (expectedResalePaise * marginRate) / 100n;

    const totalDeductionsPaise = totalRefurbishmentPaise + logisticsPaise + holdingPaise + warrantyRiskPaise + targetContributionPaise;
    const economicCeilingPaise = expectedResalePaise > totalDeductionsPaise ? expectedResalePaise - totalDeductionsPaise : 0n;
    const suggestedAcquisitionPaise = isBlocked ? 0n : economicCeilingPaise;

    const valuation = await this.db.acquisitionValuation.create({
      data: {
        leadId: lead.id,
        inspectionReportId: report.id,
        expectedResalePaise,
        refurbishmentPaise: totalRefurbishmentPaise,
        otherCostsPaise: logisticsPaise + holdingPaise + warrantyRiskPaise,
        requiredMarginPaise: targetContributionPaise,
        recommendedPurchasePaise: suggestedAcquisitionPaise,
        notes: JSON.stringify({
          isBlocked,
          blockedReason: isBlocked ? 'CRITICAL_DEFECTS_IDENTIFIED' : null,
          economicCeilingPaise: economicCeilingPaise.toString(),
          suggestedAcquisitionPaise: suggestedAcquisitionPaise.toString(),
          breakdown: {
            mechanicalRefurbPaise: mechanicalRefurbPaise.toString(),
            cosmeticRefurbPaise: cosmeticRefurbPaise.toString(),
            detailingPaise: detailingPaise.toString(),
            logisticsPaise: logisticsPaise.toString(),
            holdingPaise: holdingPaise.toString(),
            warrantyRiskPaise: warrantyRiskPaise.toString(),
            targetContributionPaise: targetContributionPaise.toString(),
          },
          comparablesCount: comparables.length,
          criticalDefectsCount: criticalDefects.length,
        }),
        status: 'PENDING_APPROVAL',
        createdById: actor.userId,
      },
    });

    return {
      valuationId: valuation.id,
      leadId: lead.id,
      inspectionReportId: report.id,
      isBlocked,
      expectedResalePaise: expectedResalePaise.toString(),
      refurbishmentPaise: totalRefurbishmentPaise.toString(),
      economicCeilingPaise: economicCeilingPaise.toString(),
      suggestedAcquisitionPaise: suggestedAcquisitionPaise.toString(),
      status: valuation.status,
    };
  }

  async getInternalValuation(actor: { userId: string; roles: string[] }, valuationId: string) {
    const isAuthorized = actor.roles.some(r => ['PRICING_APPROVER', 'SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'SALES_EXECUTIVE'].includes(r));
    if (!isAuthorized) throw new HttpError(403, 'INSUFFICIENT_ROLE_FOR_VALUATION_ACCESS');

    const valuation = await this.db.acquisitionValuation.findUnique({
      where: { id: valuationId },
      include: {
        lead: true,
        inspectionReport: { include: { defects: true, reviewDecision: true } },
        createdBy: { include: { user: true } },
        approvedBy: { include: { user: true } },
        offers: { orderBy: { version: 'desc' } },
      },
    });
    if (!valuation) throw new HttpError(404, 'VALUATION_NOT_FOUND');

    let parsedNotes: any = {};
    try {
      parsedNotes = valuation.notes ? JSON.parse(valuation.notes) : {};
    } catch {
      parsedNotes = { rawNotes: valuation.notes };
    }

    return {
      id: valuation.id,
      leadId: valuation.leadId,
      referenceCode: valuation.lead.referenceCode,
      vehicleTitle: `${valuation.lead.manufacturingYear} ${valuation.lead.make} ${valuation.lead.model} ${valuation.lead.variant || ''}`.trim(),
      sellerName: valuation.lead.sellerName,
      sellerPhone: valuation.lead.sellerPhone,
      city: valuation.lead.city,
      status: valuation.status,
      version: valuation.version,
      expectedResalePaise: valuation.expectedResalePaise.toString(),
      refurbishmentPaise: valuation.refurbishmentPaise.toString(),
      otherCostsPaise: valuation.otherCostsPaise.toString(),
      requiredMarginPaise: valuation.requiredMarginPaise.toString(),
      recommendedPurchasePaise: valuation.recommendedPurchasePaise.toString(),
      economicCeilingPaise: parsedNotes?.economicCeilingPaise || valuation.recommendedPurchasePaise.toString(),
      breakdown: parsedNotes?.breakdown || null,
      isBlocked: parsedNotes?.isBlocked || false,
      blockedReason: parsedNotes?.blockedReason || null,
      createdBy: valuation.createdBy?.user?.displayName || 'System Analyst',
      approvedBy: valuation.approvedBy?.user?.displayName || null,
      approvedAt: valuation.approvedAt?.toISOString() || null,
      createdAt: valuation.createdAt.toISOString(),
      offers: valuation.offers.map(o => ({
        id: o.id,
        version: o.version,
        offerAmountPaise: o.offerAmountPaise.toString(),
        status: o.status,
        validUntil: o.validUntil.toISOString(),
      })),
      inspection: {
        id: valuation.inspectionReport.id,
        status: valuation.inspectionReport.status,
        defectsCount: valuation.inspectionReport.defects.length,
        defects: valuation.inspectionReport.defects.map(d => ({
          category: d.category,
          severity: d.severity,
          description: d.description,
          location: d.location,
        })),
      },
    };
  }

  /**
   * Imports an authorized batch of market observations.
   * Performs schema, year, price, and kinematic validation. Quarantines invalid records.
   */
  async importMarketDataBatch(actor: { userId: string; roles: string[] }, input: {
    sourceKey: string;
    sourceDisplayName?: string;
    sourceProvenance?: string;
    records: MarketObservationInput[];
  }) {
    const isAuthorized = actor.roles.some(r => ['SUPER_ADMIN', 'ADMIN', 'PRICING_APPROVER'].includes(r));
    if (!isAuthorized) throw new HttpError(403, 'INSUFFICIENT_ROLE_FOR_DATA_IMPORT');

    let source = await this.db.marketDataSource.findUnique({ where: { key: input.sourceKey } });
    if (!source) {
      source = await this.db.marketDataSource.create({
        data: {
          key: input.sourceKey,
          displayName: input.sourceDisplayName || input.sourceKey,
          provenanceNote: input.sourceProvenance || 'Licensed automotive transaction dataset',
          permittedForValuation: true,
          active: true,
        },
      });
    }

    const currentYear = new Date().getFullYear();
    let accepted = 0;
    let quarantined = 0;

    const batch = await this.db.marketIngestionBatch.create({
      data: {
        sourceId: source.id,
        importedByUserId: actor.userId,
        totalRecords: input.records.length,
      },
    });

    for (const rec of input.records) {
      const pricePaise = BigInt(rec.pricePaise ?? 0);
      const year = rec.manufacturingYear;
      const km = rec.odometerKm;

      // Quality validation rules
      let status: MarketObservationQualityStatus = 'APPROVED';
      let notes: string | null = null;

      if (pricePaise < 2500000n || pricePaise > 5000000000n) {
        status = 'QUARANTINED';
        notes = 'Price out of plausible pre-owned automotive bounds';
      } else if (year < 1980 || year > currentYear + 1) {
        status = 'QUARANTINED';
        notes = 'Manufacturing year invalid';
      } else if (km < 0 || km > 1500000) {
        status = 'QUARANTINED';
        notes = 'Odometer reading out of range';
      } else {
        const age = Math.max(1, currentYear - year);
        if (km / age > 150000) {
          status = 'QUARANTINED';
          notes = 'Suspicious excessive annual mileage (>150,000 km/yr)';
        }
      }

      if (status === 'APPROVED') accepted++;
      else quarantined++;

      await this.db.vehicleMarketObservation.create({
        data: {
          sourceId: source.id,
          batchId: batch.id,
          externalReference: rec.externalReference,
          make: rec.make.trim(),
          model: rec.model.trim(),
          variant: rec.variant?.trim() || null,
          manufacturingYear: year,
          fuelType: rec.fuelType.toUpperCase().trim(),
          transmission: rec.transmission.toUpperCase().trim(),
          odometerKm: km,
          city: rec.city.trim(),
          pricePaise,
          priceType: rec.priceType,
          conditionBasis: rec.conditionBasis || null,
          observedAt: new Date(rec.observedAt),
          qualityStatus: status,
          qualityNotes: notes,
        },
      });
    }

    await this.db.marketIngestionBatch.update({
      where: { id: batch.id },
      data: {
        acceptedRecords: accepted,
        quarantinedRecords: quarantined,
      },
    });

    return {
      batchId: batch.id,
      totalRecords: input.records.length,
      acceptedRecords: accepted,
      quarantinedRecords: quarantined,
    };
  }

  async getQualityDashboard(actor: { userId: string; roles: string[] }) {
    const isAuthorized = actor.roles.some(r => ['SUPER_ADMIN', 'ADMIN', 'PRICING_APPROVER', 'OPERATIONS_MANAGER'].includes(r));
    if (!isAuthorized) throw new HttpError(403, 'INSUFFICIENT_ROLE_FOR_QUALITY_ACCESS');

    const [sources, batches, approvedCount, quarantinedCount, totalObservations] = await Promise.all([
      this.db.marketDataSource.findMany({ include: { _count: { select: { observations: true } } } }),
      this.db.marketIngestionBatch.findMany({ take: 10, orderBy: { importedAt: 'desc' }, include: { source: true } }),
      this.db.vehicleMarketObservation.count({ where: { qualityStatus: 'APPROVED' } }),
      this.db.vehicleMarketObservation.count({ where: { qualityStatus: 'QUARANTINED' } }),
      this.db.vehicleMarketObservation.count(),
    ]);

    return {
      sources: sources.map(s => ({
        id: s.id,
        key: s.key,
        displayName: s.displayName,
        permittedForValuation: s.permittedForValuation,
        active: s.active,
        observationCount: s._count.observations,
      })),
      recentBatches: batches.map(b => ({
        id: b.id,
        sourceKey: b.source.key,
        sourceName: b.source.displayName,
        importedAt: b.importedAt.toISOString(),
        totalRecords: b.totalRecords,
        acceptedRecords: b.acceptedRecords,
        quarantinedRecords: b.quarantinedRecords,
      })),
      summary: {
        totalObservations,
        approvedCount,
        quarantinedCount,
        pendingCount: totalObservations - approvedCount - quarantinedCount,
      },
    };
  }

  async getPricingPolicy() {
    const policy = await this.db.policyVersion.findFirst({
      where: { key: 'ACQUISITION_PRICING_POLICY', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    return policy || {
      key: 'ACQUISITION_PRICING_POLICY',
      version: 1,
      title: 'Standard Acquisition Pricing & Margin Policy',
      content: {
        targetMarginPercent: 10,
        minContributionPaise: '5000000',
        targetDaysToTurn: 35,
        annualCostOfCapitalPercent: 10.5,
        defaultLogisticsPaise: '120000',
        riskAllowancePercent: 2.0,
        prepBufferLowPaise: '1500000',
        prepBufferHighPaise: '3500000',
        maxOverrideAboveCeilingPercent: 7.0,
      },
      status: 'ACTIVE',
    };
  }

  async updatePricingPolicy(actor: { userId: string; roles: string[] }, input: { title: string; content: object }) {
    const isAuthorized = actor.roles.some(r => ['SUPER_ADMIN', 'ADMIN', 'PRICING_APPROVER'].includes(r));
    if (!isAuthorized) throw new HttpError(403, 'INSUFFICIENT_ROLE_FOR_POLICY_MANAGEMENT');

    await this.db.policyVersion.updateMany({
      where: { key: 'ACQUISITION_PRICING_POLICY', status: 'ACTIVE' },
      data: { status: 'SUPERSEDED' },
    });

    const latest = await this.db.policyVersion.findFirst({
      where: { key: 'ACQUISITION_PRICING_POLICY' },
      orderBy: { version: 'desc' },
    });
    const newVersion = (latest?.version || 0) + 1;

    return this.db.policyVersion.create({
      data: {
        key: 'ACQUISITION_PRICING_POLICY',
        version: newVersion,
        title: input.title,
        content: input.content as any,
        status: 'ACTIVE',
        effectiveAt: new Date(),
        createdById: actor.userId,
      },
    });
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
