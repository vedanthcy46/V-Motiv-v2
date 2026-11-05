// How the workshop's vehicle custody records (stored as free text such as "75%") are shown to staff.
// The operations portal needs the check-in reading (what the car arrived with) and the release reading (what it left with)
// as numbers it can compare, pre-fill and display; the raw rows stay available as `custodyRecords`.

/** "75%" -> 75. Anything that is not a plain 0-100 percentage (for example "Half tank") has no number: null. */
export function fuelPercentFromLabel(label: string | null | undefined): number | null {
  const match = /^\s*(\d{1,3})(?:\.\d+)?\s*%?\s*$/.exec(label ?? '');
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 0 && value <= 100 ? value : null;
}

export interface CustodyRowLike {
  id: string;
  type: string;
  odometerKm: number;
  fuelChargeLevel: string;
  keyCount?: number | null;
  preExistingDamageNotes?: string | null;
  handoverByPerson?: string | null;
  customerAcknowledged?: boolean | null;
  recordedAt: Date;
}

export interface StaffCustodyView {
  id: string;
  type: string;
  odometerKm: number;
  /** Numeric fuel / charge level, or null when the record holds a description instead of a percentage. */
  fuelPercent: number | null;
  /** The level exactly as recorded. */
  fuelLabel: string;
  keyCount: number | null;
  exteriorNotes: string | null;
  handoverByPerson: string | null;
  customerAcknowledged: boolean | null;
  recordedAt: string;
}

export function staffCustodyView(row: CustodyRowLike): StaffCustodyView {
  return {
    id: row.id,
    type: row.type,
    odometerKm: row.odometerKm,
    fuelPercent: fuelPercentFromLabel(row.fuelChargeLevel),
    fuelLabel: row.fuelChargeLevel,
    keyCount: row.keyCount ?? null,
    exteriorNotes: row.preExistingDamageNotes?.trim() || null,
    handoverByPerson: row.handoverByPerson ?? null,
    customerAcknowledged: row.customerAcknowledged ?? null,
    recordedAt: row.recordedAt.toISOString(),
  };
}

/** The latest check-in (arrival) and the latest check-out (release) among a job's custody records. */
export function pickCustodyRecords(rows: CustodyRowLike[]): { checkIn: StaffCustodyView | null; checkOut: StaffCustodyView | null } {
  const latest = (type: string) =>
    rows.filter(row => row.type === type).sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
  const checkIn = latest('CHECK_IN');
  const checkOut = latest('CHECK_OUT');
  return { checkIn: checkIn ? staffCustodyView(checkIn) : null, checkOut: checkOut ? staffCustodyView(checkOut) : null };
}
