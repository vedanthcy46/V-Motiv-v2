import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { HttpError } from '../src/errors.js';
import { PrismaValuationStore, type InstantValuationInput } from '../src/valuation-store.js';

describe('V MOTIV V2 — Intelligent Valuation Engine Unit & Security Suite', () => {
  const customerUid = 'firebase-customer-uid-123';
  const customerDbId = '11111111-2222-3333-4444-555555555555';

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
      vehicleMarketObservation: {
        count: async () => 0, // Zero approved licensed market observations
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

    // Verify snapshot persistence details
    expect(capturedCreateData).toBeDefined();
    expect(capturedCreateData.estimateAvailable).toBe(false);
    expect(capturedCreateData.unavailableReason).toBe('INSUFFICIENT_APPROVED_COMPARABLE_DATA');
    expect(capturedCreateData.confidence).toBe('INSUFFICIENT');
    expect(capturedCreateData.comparableCount).toBe(0);
    expect(capturedCreateData.inputSnapshot.make).toBe('Maruti Suzuki');
    expect(capturedCreateData.inputSnapshot.odometerKm).toBe(28000);

    // Verify customer public summary fields
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
        findFirst: async () => null, // Snapshot not owned by this Firebase UID
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
          valuationVersion: 'comparable-v1-data-gated',
          assumptions: ['Non-binding indicative estimate'],
          createdAt: new Date('2026-10-30T12:00:00Z'),
        }),
      },
    } as unknown as PrismaClient;

    const store = new PrismaValuationStore(mockDb);
    const summary = await store.publicSummaryForUser(customerUid, 'val-snap-uuid-1');

    expect(summary.id).toBe('val-snap-uuid-1');
    expect(summary.estimateAvailable).toBe(false);
    expect(summary.valuationVersion).toBe('comparable-v1-data-gated');
    expect(summary.disclaimer).toContain('not a purchase offer');
  });
});
