import { describe, expect, it, vi } from 'vitest';
import { resolveKmPolicy } from '../src/rental-km-policy.js';
import { PrismaRentalStore } from '../src/rental-store.js';
import { PrismaAdminStore } from '../src/admin-store.js';

type Any = any;
const vehicle = { includedKmPerDay: 250, extraKmRatePaise: 1200n };

describe('rental km policy resolution', () => {
  it('falls back to the vehicle values when the hub has no policy', () => {
    const p = resolveKmPolicy(vehicle, { rentalIncludedKmPerDay: null, rentalExtraKmRatePaise: null });
    expect(p).toMatchObject({ includedKmPerDay: 250, extraKmRatePaise: 1200n, source: { includedKm: 'VEHICLE', extraKmRate: 'VEHICLE' } });
  });

  it('the hub policy set by an administrator wins, and each value resolves independently', () => {
    const p = resolveKmPolicy(vehicle, { rentalIncludedKmPerDay: 300, rentalExtraKmRatePaise: 1500n });
    expect(p).toMatchObject({ includedKmPerDay: 300, extraKmRatePaise: 1500n, source: { includedKm: 'HUB', extraKmRate: 'HUB' } });
    const partial = resolveKmPolicy(vehicle, { rentalIncludedKmPerDay: 180, rentalExtraKmRatePaise: null });
    expect(partial).toMatchObject({ includedKmPerDay: 180, extraKmRatePaise: 1200n });
  });

  it('ignores zero or invalid hub values instead of granting unlimited/free km', () => {
    const p = resolveKmPolicy(vehicle, { rentalIncludedKmPerDay: 0, rentalExtraKmRatePaise: 0n });
    expect(p.includedKmPerDay).toBe(250);
    expect(p.extraKmRatePaise).toBe(1200n);
  });
});

describe('quotes follow the hub policy dynamically', () => {
  const store = new PrismaRentalStore({} as Any);
  const base = {
    id: 'v1',
    baseDailyRatePaise: 300000n,
    baseHourlyRatePaise: 15000n,
    securityDepositPaise: 500000n,
    includedKmPerDay: 250,
    extraKmRatePaise: 1200n,
  };
  const start = new Date('2026-11-06T09:00:00Z');
  const threeDays = new Date('2026-11-09T09:00:00Z');

  it('3 days at a hub with 300 km/day and Rs 15/km', () => {
    const q = store.calculateQuote({ ...base, hub: { rentalIncludedKmPerDay: 300, rentalExtraKmRatePaise: 1500n } }, start, threeDays);
    expect(q.includedKm).toBe(900);
    expect(q.extraKmRatePaise).toBe(1500n);
  });

  it('changing the hub policy changes the next quote; clearing it restores vehicle values', () => {
    expect(store.calculateQuote({ ...base, hub: { rentalIncludedKmPerDay: 200, rentalExtraKmRatePaise: 2000n } }, start, threeDays).includedKm).toBe(600);
    const cleared = store.calculateQuote({ ...base, hub: { rentalIncludedKmPerDay: null, rentalExtraKmRatePaise: null } }, start, threeDays);
    expect(cleared.includedKm).toBe(750);
    expect(cleared.extraKmRatePaise).toBe(1200n);
  });
});

describe('admin km policy endpoint rules', () => {
  const superAdmin: Any = { userId: 'u1', roles: ['SUPER_ADMIN'], permissions: ['branch.manage'], branches: [] };
  const branchAdmin: Any = { userId: 'u2', roles: ['BRANCH_ADMIN'], permissions: ['branch.manage'], branches: [{ id: 'b-1' }] };
  const noPerm: Any = { userId: 'u3', roles: ['SALES'], permissions: [], branches: [] };

  function makeAdmin(hub: Any) {
    const tx: Any = {
      serviceHub: {
        findUnique: vi.fn().mockResolvedValue(hub),
        update: vi.fn().mockImplementation(async ({ data }: Any) => ({ ...hub, rentalIncludedKmPerDay: data.rentalIncludedKmPerDay ?? hub.rentalIncludedKmPerDay, rentalExtraKmRatePaise: data.rentalExtraKmRatePaise ?? hub.rentalExtraKmRatePaise })),
      },
      auditEvent: { create: vi.fn() },
    };
    const db: Any = { $transaction: vi.fn(async (fn: Any) => fn(tx)) };
    return { store: new PrismaAdminStore(db), tx };
  }
  const hub = { id: 'h1', branchId: 'b-1', code: 'BLR', name: 'Bengaluru', city: 'Bengaluru', rentalIncludedKmPerDay: null, rentalExtraKmRatePaise: null };

  it('requires the branch.manage permission', async () => {
    const { store } = makeAdmin(hub);
    await expect(store.updateRentalKmPolicy(noPerm, 'h1', { includedKmPerDay: 300 })).rejects.toThrow();
  });

  it('a branch admin cannot change another branch hub', async () => {
    const { store } = makeAdmin({ ...hub, branchId: 'b-other' });
    await expect(store.updateRentalKmPolicy(branchAdmin, 'h1', { includedKmPerDay: 300 })).rejects.toThrow(/BRANCH_SCOPE_DENIED/);
  });

  it('stores the policy in paise and writes an audit event with before/after', async () => {
    const { store, tx } = makeAdmin(hub);
    const out: Any = await store.updateRentalKmPolicy(superAdmin, 'h1', { includedKmPerDay: 300, extraKmRatePaise: 1500 });
    expect(tx.serviceHub.update.mock.calls[0][0].data).toEqual({ rentalIncludedKmPerDay: 300, rentalExtraKmRatePaise: 1500n });
    expect(out.extraKmRatePaise).toBe('1500');
    expect(tx.auditEvent.create.mock.calls[0][0].data.action).toBe('RENTAL_KM_POLICY_UPDATED');
  });
});
