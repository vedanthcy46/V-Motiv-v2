// Odometer / fuel readings in the rental and service forms.
// Forms start from what is actually on record (the car's last recorded reading, what the trip started with, what the
// workshop checked the car in with) - never from a made-up number - and a field left empty stays empty until staff read the dash.

/** A form field's text as a whole non-negative number, or null when it is empty or not a number. */
export function parseReading(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === '') return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** A recorded number as form text; nothing recorded stays an empty field. */
export function readingText(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

/** Whether the entered reading is below the one on record (a likely typo; the form warns, the person decides). */
export function isBelowRecorded(entered: string, recorded: number | null | undefined): boolean {
  const value = parseReading(entered);
  return value !== null && typeof recorded === 'number' && recorded > 0 && value < recorded;
}

export interface TripKmPreview {
  drivenKm: number;
  includedKm: number | null;
  excessKm: number;
  /** Null when the booking's per-km rate is unknown. */
  excessChargePaise: bigint | null;
}

/** Kilometres driven and the part beyond the included allowance, from the readings entered at the counter. */
export function tripKmPreview(args: {
  pickupKm: number | null | undefined;
  returnKm: number | null;
  includedKm: number | null | undefined;
  extraKmRatePaise: string | number | null | undefined;
}): TripKmPreview | null {
  if (args.returnKm === null || typeof args.pickupKm !== 'number' || args.returnKm < args.pickupKm) return null;
  const drivenKm = args.returnKm - args.pickupKm;
  const includedKm = typeof args.includedKm === 'number' ? args.includedKm : null;
  const excessKm = includedKm === null ? 0 : Math.max(0, drivenKm - includedKm);
  let excessChargePaise: bigint | null = null;
  try {
    if (args.extraKmRatePaise !== null && args.extraKmRatePaise !== undefined && args.extraKmRatePaise !== '') {
      excessChargePaise = BigInt(excessKm) * BigInt(args.extraKmRatePaise);
    }
  } catch {
    excessChargePaise = null;
  }
  return { drivenKm, includedKm, excessKm, excessChargePaise };
}
