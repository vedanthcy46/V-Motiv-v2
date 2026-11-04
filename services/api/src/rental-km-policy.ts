// Rental km policy: free kilometres per day and the excess-km charge are set by an administrator
// per hub/location. A vehicle only falls back to its own stored values when its hub has no policy.

export interface KmPolicyHub {
  rentalIncludedKmPerDay?: number | null;
  rentalExtraKmRatePaise?: bigint | number | string | null;
}

export interface KmPolicyVehicle {
  includedKmPerDay: number;
  extraKmRatePaise: bigint | number | string;
}

export interface EffectiveKmPolicy {
  includedKmPerDay: number;
  extraKmRatePaise: bigint;
  /** Where each value came from, so staff can see why a car shows a given allowance. */
  source: { includedKm: 'HUB' | 'VEHICLE'; extraKmRate: 'HUB' | 'VEHICLE' };
}

export function resolveKmPolicy(vehicle: KmPolicyVehicle, hub?: KmPolicyHub | null): EffectiveKmPolicy {
  const hubIncluded = hub?.rentalIncludedKmPerDay;
  const hubRate = hub?.rentalExtraKmRatePaise;
  const useHubIncluded = typeof hubIncluded === 'number' && hubIncluded > 0;
  const useHubRate = hubRate !== null && hubRate !== undefined && BigInt(hubRate) > 0n;
  return {
    includedKmPerDay: useHubIncluded ? (hubIncluded as number) : vehicle.includedKmPerDay,
    extraKmRatePaise: useHubRate ? BigInt(hubRate as bigint | number | string) : BigInt(vehicle.extraKmRatePaise),
    source: { includedKm: useHubIncluded ? 'HUB' : 'VEHICLE', extraKmRate: useHubRate ? 'HUB' : 'VEHICLE' },
  };
}

/** Km allowed for a trip: whole free-km days times the per-day allowance (minimum one day). */
export function includedKmForDays(daysCount: number, includedKmPerDay: number): number {
  return Math.max(1, daysCount) * includedKmPerDay;
}
