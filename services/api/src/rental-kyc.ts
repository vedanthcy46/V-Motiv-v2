// Driver details taken by hub staff (walk-in bookings, licence upload at the counter).
// They come from the licence in front of the staff member and are never filled in on their behalf: a made-up date of birth
// would pass the age check, a made-up licence number or a stock photo would pass the KYC gate for a driver nobody checked.
import { HttpError } from './errors.js';

export const MIN_DRIVER_AGE_YEARS = 18;

/** The driver's date of birth as entered; must be a real date in the past and at least 18 years ago. */
export function requireAdultDateOfBirth(value: Date | string | null | undefined, now: Date = new Date()): Date {
  if (value === null || value === undefined || value === '') {
    throw new HttpError(400, 'DATE_OF_BIRTH_REQUIRED', "Enter the driver's date of birth as printed on the licence.");
  }
  const dob = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dob.getTime()) || dob.getTime() > now.getTime()) {
    throw new HttpError(400, 'INVALID_DATE_OF_BIRTH', "The driver's date of birth is not a valid date.");
  }
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthGap = now.getUTCMonth() - dob.getUTCMonth();
  if (monthGap < 0 || (monthGap === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  if (age < MIN_DRIVER_AGE_YEARS) {
    throw new HttpError(400, 'DRIVER_MUST_BE_AT_LEAST_18_YEARS_OLD');
  }
  return dob;
}

/** Years of driving experience as stated by the driver. 0 is a real answer; missing is not. */
export function requireDrivingExperience(value: number | string | null | undefined): number {
  const years = typeof value === 'string' ? (value.trim() === '' ? NaN : Number(value)) : value;
  if (typeof years !== 'number' || !Number.isInteger(years) || years < 0 || years > 80) {
    throw new HttpError(400, 'DRIVING_EXPERIENCE_REQUIRED', "Enter the driver's years of driving experience (0 or more).");
  }
  return years;
}

/** The licence number as printed; never a placeholder. */
export function requireLicenseNumber(value: string | null | undefined): string {
  const number = (value ?? '').trim().toUpperCase();
  if (number.length < 3) {
    throw new HttpError(400, 'LICENSE_NUMBER_REQUIRED', 'Enter the driving licence number as printed on the licence.');
  }
  return number;
}

/** Both licence photos must be real uploads; a missing one is an error, not something to substitute. */
export function requireLicensePhotos(front: string | null | undefined, back: string | null | undefined): { front: string; back: string } {
  const frontUrl = (front ?? '').trim();
  const backUrl = (back ?? '').trim();
  if (!frontUrl || !backUrl) {
    throw new HttpError(400, 'MANDATORY_LICENSE_DOCUMENTS_MISSING', 'Both the front and the back photo of the driving licence are required.');
  }
  return { front: frontUrl, back: backUrl };
}
