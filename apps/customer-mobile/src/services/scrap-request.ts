// Asking V MOTIV to scrap a vehicle. Deliberately small: the customer tells us about the vehicle and where it is, our team is notified and
// phones them, and everything after that is done outside the app. This file is only the form's rules and the one API call; it has no
// prices, statuses or official-document logic. The server checks every field again.

export const FUEL_TYPES = ['Petrol', 'Diesel', 'CNG', 'Electric', 'Other'] as const;

export interface ScrapFormValues {
  registrationNumber: string;
  make: string;
  model: string;
  year: string;
  fuelType: string;
  odometerKm: string;
  condition: string;
  city: string;
  pickupAddress: string;
  /** Ten digits, without +91. */
  phone: string;
}

export const emptyForm = (phone = ''): ScrapFormValues => ({ registrationNumber: '', make: '', model: '', year: '', fuelType: '', odometerKm: '', condition: '', city: '', pickupAddress: '', phone });

export const digitsOnly = (text: string, max = 12) => text.replace(/\D/g, '').slice(0, max);

/** The number as ten digits from what is stored or typed ("+91 98765 43210", "09876543210"), or '' when it is not one. */
export function tenDigitMobile(input: string | null | undefined): string {
  let digits = (input ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : '';
}

export type FormErrors = Partial<Record<keyof ScrapFormValues, string>>;

/** What is missing or clearly wrong, before anything is sent. */
export function validateForm(values: ScrapFormValues, thisYear = new Date().getFullYear()): FormErrors {
  const errors: FormErrors = {};
  if (values.registrationNumber.replace(/[^A-Za-z0-9]/g, '').length < 4) errors.registrationNumber = 'Enter the registration number, for example KA01AB1234.';
  if (!values.make.trim()) errors.make = 'Enter the make, for example Hyundai.';
  if (!values.model.trim()) errors.model = 'Enter the model, for example i10.';
  const year = Number(values.year);
  if (!/^\d{4}$/.test(values.year) || year < 1950 || year > thisYear + 1) errors.year = 'Enter the four-digit year the vehicle was made.';
  if (!values.city.trim()) errors.city = 'Enter the city where the vehicle is.';
  if (!tenDigitMobile(values.phone)) errors.phone = 'Enter a 10-digit mobile number starting with 6, 7, 8 or 9, so our team can call you.';
  return errors;
}

export function toPayload(values: ScrapFormValues, submissionKey: string) {
  return {
    registrationNumber: values.registrationNumber.trim(),
    make: values.make.trim(),
    model: values.model.trim(),
    manufacturingYear: Number(values.year),
    ...(values.fuelType ? { fuelType: values.fuelType } : {}),
    ...(values.odometerKm ? { odometerKm: Number(values.odometerKm) } : {}),
    ...(values.condition.trim() ? { condition: values.condition.trim() } : {}),
    city: values.city.trim(),
    ...(values.pickupAddress.trim() ? { pickupAddress: values.pickupAddress.trim() } : {}),
    contactPhone: `+91${tenDigitMobile(values.phone)}`,
    submissionKey,
  };
}

/** One key per opened form, so a double tap or a retry after a lost reply returns the same request instead of creating another. */
export function newSubmissionKey(random: () => number = Math.random, now: number = Date.now()): string {
  return `scrap-${now.toString(36)}-${Math.floor(random() * 1e12).toString(36)}`;
}

const FIELD_OF_API_PATH: Record<string, keyof ScrapFormValues> = {
  registrationNumber: 'registrationNumber', make: 'make', model: 'model', manufacturingYear: 'year', fuelType: 'fuelType', odometerKm: 'odometerKm',
  condition: 'condition', city: 'city', pickupAddress: 'pickupAddress', contactPhone: 'phone',
};

/** Problems the server found with specific fields, so they can be shown next to those fields. */
export function serverFieldErrors(error: unknown): FormErrors {
  const issues = (error as { details?: { issues?: unknown } } | null)?.details?.issues;
  const out: FormErrors = {};
  if (Array.isArray(issues)) {
    for (const issue of issues) {
      const field = FIELD_OF_API_PATH[String(Array.isArray(issue?.path) ? issue.path[0] : '')];
      if (field && !out[field]) out[field] = 'Please check this.';
    }
  }
  return out;
}

/** Wording for a failed submission. The server's own sentence is used for the cases it words itself (already requested, no phone number). */
export function submitErrorMessage(error: unknown): string {
  const e = error as { status?: number; code?: string; message?: string } | null;
  if (e?.code === 'SCRAP_REQUEST_ALREADY_OPEN' || e?.code === 'PHONE_REQUIRED') return e.message || 'This request could not be saved.';
  if (e?.status === 0 || e?.code === 'NETWORK_UNREACHABLE' || e?.code === 'REQUEST_TIMEOUT') return 'We could not reach V MOTIV. Check your connection and try again. Nothing was sent.';
  if (e?.status === 429) return 'Too many tries. Please wait a minute and try again.';
  if (e?.status && e.status >= 500) return 'V MOTIV had a problem. Please try again in a moment.';
  return 'We could not send your request. Please check the details and try again.';
}
