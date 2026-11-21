// Opening stock: cars a hub already owned before the app existed. They have no lead, inspection or purchase case, so they are entered by
// hand, once, by operations or the hub's inventory manager. An opening-stock car is NOT listed automatically: it arrives as received
// stock and has to pass inspection (the same quality check as any other car) before it can be prepared and published.

export const OPENING_STOCK_SOURCE = 'OPENING_STOCK';

/** Documents a hub may already hold for such a car. They are recorded as "on file"; the originals stay with the hub. */
export const OPENING_STOCK_DOCUMENTS = ['RC', 'INSURANCE', 'PUC', 'SERVICE_HISTORY', 'LOAN_NOC', 'FORM_29_30', 'OTHER'] as const;
export type OpeningStockDocument = (typeof OPENING_STOCK_DOCUMENTS)[number];

export interface OpeningStockItem {
  registrationNumber: string;
  make: string;
  model: string;
  variant?: string;
  manufacturingYear: number;
  fuelType: string;
  transmission: string;
  odometerKm: number;
  /** What the hub paid for the car. Needed for margins and reports. */
  acquisitionCostPaise: bigint;
  physicalLocation?: string;
  notes?: string;
  documentsOnFile?: OpeningStockDocument[];
}

/** "ka 01 ab-1234" -> "KA01AB1234": the form used to tell whether two entries are the same car. */
export function normalizeRegistrationNumber(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** A registration number has letters and digits and a plausible length (it covers state series and Bharat series plates). */
export function isPlausibleRegistration(normalized: string): boolean {
  return normalized.length >= 6 && normalized.length <= 12 && /[A-Z]/.test(normalized) && /\d/.test(normalized);
}

const FUELS = ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID', 'LPG'];
const TRANSMISSIONS = ['MANUAL', 'AUTOMATIC', 'AMT', 'CVT', 'DCT', 'IMT'];

/** Upper-cases and tidies fuel / transmission so "petrol" and "Petrol " are one value. Returns null when it is not a known one. */
export function normalizeFuel(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  return FUELS.includes(value) ? value : null;
}
export function normalizeTransmission(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  return TRANSMISSIONS.includes(value) ? value : null;
}

/** Why an item cannot be entered, in the order a person would fix it. An empty list means it can. */
export function openingStockProblems(item: OpeningStockItem, now = new Date()): Array<{ code: string; message: string }> {
  const problems: Array<{ code: string; message: string }> = [];
  const registration = normalizeRegistrationNumber(item.registrationNumber || '');
  if (!isPlausibleRegistration(registration)) problems.push({ code: 'INVALID_REGISTRATION_NUMBER', message: 'Enter the registration number as it is on the plate.' });
  if (!item.make?.trim()) problems.push({ code: 'MAKE_REQUIRED', message: 'Make is required.' });
  if (!item.model?.trim()) problems.push({ code: 'MODEL_REQUIRED', message: 'Model is required.' });
  if (!Number.isInteger(item.manufacturingYear) || item.manufacturingYear < 1990 || item.manufacturingYear > now.getFullYear() + 1) {
    problems.push({ code: 'INVALID_MANUFACTURING_YEAR', message: `Year must be between 1990 and ${now.getFullYear() + 1}.` });
  }
  if (!normalizeFuel(item.fuelType || '')) problems.push({ code: 'INVALID_FUEL_TYPE', message: `Fuel must be one of ${FUELS.join(', ')}.` });
  if (!normalizeTransmission(item.transmission || '')) problems.push({ code: 'INVALID_TRANSMISSION', message: `Transmission must be one of ${TRANSMISSIONS.join(', ')}.` });
  if (!Number.isInteger(item.odometerKm) || item.odometerKm < 0 || item.odometerKm > 2_000_000) problems.push({ code: 'INVALID_ODOMETER', message: 'Odometer must be between 0 and 2,000,000 km.' });
  if (typeof item.acquisitionCostPaise !== 'bigint' || item.acquisitionCostPaise <= 0n) problems.push({ code: 'ACQUISITION_COST_REQUIRED', message: 'What the hub paid for the car is required.' });
  return problems;
}

/** A stock code that is easy to read out and tell apart from acquisition stock (VM-STK-...): VM-OPN-XXXXXXXX. */
export function openingStockCode(random: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alike characters
  let suffix = '';
  for (let index = 0; index < 8; index += 1) suffix += alphabet[Math.floor(random() * alphabet.length)];
  return `VM-OPN-${suffix}`;
}
