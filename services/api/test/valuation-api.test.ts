import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { HttpError } from '../src/errors.js';
import { PrismaValuationStore, type InstantValuationInput } from '../src/valuation-store.js';

describe('V MOTIV V2 — Intelligent Valuation Engine Unit & Security Suite', () => {
  const customerUid = 'firebase-customer-uid-123';
  const customerDbId = '11111111-2222-3333-4444-555555555555';
  const staffActor = {
    userId: '99999999-1111-2222-3333-444444444444',
    roles: ['PRICING_APPROVER'],
  };

  it('rejects unauthenticated or unprofiled instant valuation requests', async () => {
    const mockDb = {
      user: {
        findUnique: async () => null,
      },
    } as unknown as PrismaClient;

    const store = new PrismaValuationStore(mockDb);
    const input: InstantValuationInput = {
      make: 'Hyundai',
      model: 'Creta',
      variant: 'SX (O)',
      manufacturingYear: 2021,
      fuelType: 'DIESEL',
      transmission: 'AUTOMATIC',
      odometerKm: 35000,
      city: 'Bengaluru',
    };

    await expect(store.instant('unknown-firebase-uid', input)).rejects.toEqual(
      new HttpError(404, 'PROFILE_NOT_REGISTERED'),
    );
  });

  it('prevents linking an instant valuation snapshot to a lead owned by another user', async () => {
    const mockDb = {
      user: {
        findUnique: async () => ({ id: customerDbId }),
      },
      acquisitionLead: {
        findFirst: async () => null, // Lead not found or not owned by user
      },
    } as unknown as PrismaClient;

    const store = new PrismaValuationStore(mockDb);
    const input: InstantValuationInput = {
      leadId: '99999999-9999-9999-9999-999999999999',
      make: 'Honda',
      model: 'City',
      manufacturingYear: 2019,
      fuelType: 'PETROL',
      transmission: 'MANUAL',
      odometerKm: 42000,
      city: 'Bengaluru',
    };

    await expect(store.instant(customerUid, input)).rejects.toEqual(
      new HttpError(404, 'LEAD_NOT_FOUND'),
    );
  });

  it('creates an explainable data-gated snapshot when approved market comparables are insufficient', async () => {
    let capturedCreateData: any = null;
    const mockDb = {
      user: {
        findUnique: async () => ({ id: customerDbId }),
      },
      policyVersion: {
        findFirst: async () => null,
      },
      vehicleMarketObservation: {
        findMany: async () => [], // Zero approved licensed market observations
      },
      instantValuationSnapshot: {
        create: async ({ data }: { data: any }) => {
          capturedCreateData = data;
          return {
            id: 'val-snap-uuid-1',
            ...data,
            createdAt: new Date('2026-10-30T12:00:00Z'),
            dataAsOf: null,
            sellerEstimateLowPaise: null,
            sellerEstimateHighPaise: null,
          };
        },
      },
    } as unknown as PrismaClient;

    const store = new PrismaValuationStore(mockDb);
    const input: InstantValuationInput = {
      make: 'Maruti Suzuki',
      model: 'Swift',
      variant: 'ZXi',
      manufacturingYear: 2020,
      registrationYear: 2020,
      fuelType: 'PETROL',
      transmission: 'MANUAL',
      odometerKm: 28000,
      city: 'Bengaluru',
      ownershipCount: 1,
      accidentHistory: 'NO',
      serviceHistory: 'COMPLETE',
      loanOutstanding: false,
    };

    const summary = await store.instant(customerUid, input);

    expect(capturedCreateData).toBeDefined();
    expect(capturedCreateData.estimateAvailable).toBe(false);
    expect(capturedCreateData.unavailableReason).toBe('INSUFFICIENT_APPROVED_COMPARABLE_DATA');
    expect(capturedCreateData.confidence).toBe('INSUFFICIENT');
    expect(capturedCreateData.comparableCount).toBe(0);
    expect(capturedCreateData.inputSnapshot.make).toBe('Maruti Suzuki');
    expect(capturedCreateData.inputSnapshot.odometerKm).toBe(28000);

    expect(summary.estimateAvailable).toBe(false);
    expect(summary.sellerEstimateLowPaise).toBeNull();
    expect(summary.sellerEstimateHighPaise).toBeNull();
    expect(summary.confidenceCategory).toBe('INSUFFICIENT');
    expect(summary.comparableCount).toBe(0);
    expect(summary.disclaimer).toContain('This is an indicative estimate');
    expect(summary.disclaimer).toContain('It is not a purchase offer');
  });

  it('prevents arbitrary retrieval of other users private valuation snapshots', async () => {
    const mockDb = {
      instantValuationSnapshot: {
        findFirst: async () => null,
      },
    } as unknown as PrismaClient;

    const store = new PrismaValuationStore(mockDb);
    await expect(
      store.publicSummaryForUser('other-customer-uid', 'val-snap-uuid-1'),
    ).rejects.toEqual(new HttpError(404, 'VALUATION_NOT_FOUND'));
  });

  it('returns public summary for the authorized snapshot owner', async () => {
    const mockDb = {
      instantValuationSnapshot: {
        findFirst: async () => ({
          id: 'val-snap-uuid-1',
          userId: customerDbId,
          estimateAvailable: false,
          unavailableReason: 'INSUFFICIENT_APPROVED_COMPARABLE_DATA',
          sellerEstimateLowPaise: null,
          sellerEstimateHighPaise: null,
          confidence: 'INSUFFICIENT',
          comparableCount: 0,
          dataAsOf: null,
          valuationVersion: 'comparable-v1-deterministic',
          assumptions: ['Non-binding indicative estimate'],
          createdAt: new Date('2026-10-30T12:00:00Z'),
        }),
      },
    } as unknown as PrismaClient;

    const store = new PrismaValuationStore(mockDb);
    const summary = await store.publicSummaryForUser(customerUid, 'val-snap-uuid-1');

    expect(summary.id).toBe('val-snap-uuid-1');
    expect(summary.estimateAvailable).toBe(false);
    expect(summary.valuationVersion).toBe('comparable-v1-deterministic');
    expect(summary.disclaimer).toContain('not a purchase offer');
  });

  it('rejects post-inspection recommendation if inspection report is unapproved or draft', async () => {
    const mockDb = {
      inspectionReport: {
        findUnique: async () => ({
          id: 'report-draft-1',
          status: 'DRAFT', // Unapproved
          request: { lead: { id: 'lead-1' } },
          defects: [],
        }),
      },
    } as unknown as PrismaClient;

    const store = new PrismaValuationStore(mockDb);
    await expect(
      store.recommendFromInspection(staffActor, 'report-draft-1'),
    ).rejects.toEqual(new HttpError(409, 'INSPECTION_REPORT_NOT_APPROVED'));
  });

  it('generates itemized post-inspection recommendation and economic ceiling from approved report', async () => {
    let createdValuation: any = null;
    const mockDb = {
      inspectionReport: {
        findUnique: async () => ({
          id: 'report-approved-1',
          status: 'APPROVED',
          identity: { manufacturingYear: 2021, odometerKm: 32000, variant: 'SX' },
          request: {
            lead: {
              id: 'lead-1',
              referenceCode: 'VM-LEAD-1234',
              make: 'Hyundai',
              model: 'Creta',
              variant: 'SX',
              manufacturingYear: 2021,
              fuelType: 'DIESEL',
              transmission: 'MANUAL',
              odometerKm: 32000,
              expectedPricePaise: 95000000n, // ₹9,50,000
            },
            branch: { name: 'Bengaluru Hub' },
          },
          defects: [
            { id: 'd-1', category: 'EXTERIOR_BODY', severity: 'MODERATE', location: 'FRONT_BUMPER', description: 'Scrape and dent' },
            { id: 'd-2', category: 'BRAKE_SYSTEM', severity: 'MODERATE', location: 'FRONT_BRAKES', description: 'Worn pads' },
          ],
        }),
      },
      policyVersion: {
        findFirst: async () => ({
          key: 'ACQUISITION_PRICING_POLICY',
          version: 1,
          content: {
            targetMarginPercent: 10,
            defaultLogisticsPaise: '120000',
            targetDaysToTurn: 35,
            riskAllowancePercent: 2.0,
          },
        }),
      },
      vehicleMarketObservation: {
        findMany: async () => [
          { pricePaise: 95000000n, priceType: 'COMPLETED_TRANSACTION', observedAt: new Date() },
          { pricePaise: 97000000n, priceType: 'COMPLETED_TRANSACTION', observedAt: new Date() },
          { pricePaise: 93000000n, priceType: 'COMPLETED_TRANSACTION', observedAt: new Date() },
        ],
      },
      acquisitionValuation: {
        create: async ({ data }: { data: any }) => {
          createdValuation = data;
          return {
            id: 'val-rec-uuid-1',
            ...data,
          };
        },
      },
    } as unknown as PrismaClient;

    const store = new PrismaValuationStore(mockDb);
    const rec = await store.recommendFromInspection(staffActor, 'report-approved-1');

    expect(rec.isBlocked).toBe(false);
    expect(rec.status).toBe('PENDING_APPROVAL');
    expect(createdValuation).toBeDefined();
    expect(createdValuation.status).toBe('PENDING_APPROVAL');
    expect(createdValuation.refurbishmentPaise).toBeGreaterThan(0n);
    expect(createdValuation.recommendedPurchasePaise).toBeGreaterThan(0n);
  });

  it('flags post-inspection recommendation as blocked when critical structural/flood defects exist', async () => {
    let createdValuation: any = null;
    const mockDb = {
      inspectionReport: {
        findUnique: async () => ({
          id: 'report-critical-1',
          status: 'APPROVED',
          identity: { manufacturingYear: 2020, odometerKm: 50000 },
          request: {
            lead: {
              id: 'lead-2',
              referenceCode: 'VM-LEAD-5678',
              make: 'Maruti Suzuki',
              model: 'Swift',
              fuelType: 'PETROL',
              transmission: 'MANUAL',
              manufacturingYear: 2020,
              odometerKm: 50000,
            },
          },
          defects: [
            { id: 'd-crit-1', category: 'STRUCTURE_CHASSIS', severity: 'CRITICAL', location: 'MAIN_APRON', description: 'Structural welding repair detected' },
          ],
        }),
      },
      policyVersion: {
        findFirst: async () => null,
      },
      vehicleMarketObservation: {
        findMany: async () => [],
      },
      acquisitionValuation: {
        create: async ({ data }: { data: any }) => {
          createdValuation = data;
          return { id: 'val-crit-1', ...data };
        },
      },
    } as unknown as PrismaClient;

    const store = new PrismaValuationStore(mockDb);
    const rec = await store.recommendFromInspection(staffActor, 'report-critical-1');

    expect(rec.isBlocked).toBe(true);
    expect(rec.suggestedAcquisitionPaise).toBe('0');
  });

  it('imports market observation batches, quarantining invalid records and accepting valid ones', async () => {
    const createdObs: any[] = [];
    const mockDb = {
      marketDataSource: {
        findUnique: async () => ({ id: 'source-1', key: 'INSTITUTIONAL_PARTNER_DATA' }),
      },
      marketIngestionBatch: {
        create: async () => ({ id: 'batch-uuid-1' }),
        update: async () => ({}),
      },
      vehicleMarketObservation: {
        create: async ({ data }: { data: any }) => {
          createdObs.push(data);
          return { id: `obs-${createdObs.length}`, ...data };
        },
      },
    } as unknown as PrismaClient;

    const store = new PrismaValuationStore(mockDb);
    const res = await store.importMarketDataBatch(staffActor, {
      sourceKey: 'INSTITUTIONAL_PARTNER_DATA',
      records: [
        {
          make: 'Toyota',
          model: 'Innova Crysta',
          variant: '2.4 GX',
          manufacturingYear: 2020,
          fuelType: 'DIESEL',
          transmission: 'MANUAL',
          odometerKm: 60000,
          city: 'Bengaluru',
          pricePaise: 165000000n, // ₹16.5 Lakhs (valid)
          priceType: 'COMPLETED_TRANSACTION',
          observedAt: new Date().toISOString(),
        },
        {
          make: 'Toyota',
          model: 'Innova Crysta',
          manufacturingYear: 2020,
          fuelType: 'DIESEL',
          transmission: 'MANUAL',
          odometerKm: 9999999, // Impossible mileage -> Quarantined
          city: 'Bengaluru',
          pricePaise: 165000000n,
          priceType: 'COMPLETED_TRANSACTION',
          observedAt: new Date().toISOString(),
        },
      ],
    });

    expect(res.totalRecords).toBe(2);
    expect(res.acceptedRecords).toBe(1);
    expect(res.quarantinedRecords).toBe(1);
    expect(createdObs[0].qualityStatus).toBe('APPROVED');
    expect(createdObs[1].qualityStatus).toBe('QUARANTINED');
  });

  it('manages pricing policy versioning, superseding previous active versions', async () => {
    let superseded = false;
    let createdPolicy: any = null;

    const mockDb = {
      policyVersion: {
        updateMany: async () => {
          superseded = true;
          return { count: 1 };
        },
        findFirst: async () => ({ version: 2 }),
        create: async ({ data }: { data: any }) => {
          createdPolicy = data;
          return { id: 'pol-3', ...data };
        },
      },
    } as unknown as PrismaClient;

    const store = new PrismaValuationStore(mockDb);
    const pol = await store.updatePricingPolicy(staffActor, {
      title: 'Q4 2026 Festive Season Margin Policy',
      content: {
        targetMarginPercent: 8,
        minContributionPaise: '4500000',
        targetDaysToTurn: 28,
      },
    });

    expect(superseded).toBe(true);
    expect(createdPolicy.version).toBe(3);
    expect(createdPolicy.status).toBe('ACTIVE');
    expect(createdPolicy.title).toBe('Q4 2026 Festive Season Margin Policy');
  });
});
