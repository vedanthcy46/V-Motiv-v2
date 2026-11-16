// Account rules for the scrapping area of the website. Pure (no browser, no Firebase) so they are tested directly. They match the mobile app:
// an account is usable once it has a phone number and has accepted the terms.

export const TERMS_VERSION = 'customer-v2-2026-10';

export interface WebProfile {
  id: string;
  email: string;
  displayName: string | null;
  phone: string | null;
  termsAcceptedAt: string | null;
  preferredCity?: string | null;
  employee?: { active: boolean } | null;
}

export const profileIsComplete = (profile: WebProfile | null | undefined) => Boolean(profile?.phone && profile?.termsAcceptedAt);

/** Accepts what people type ("98765 43210", "+91 98765-43210", "098765 43210") and returns +91XXXXXXXXXX, or null if it is not a valid Indian mobile. */
export function normalizeIndianMobile(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

export function validateProfileForm(input: { phone: string; accepted: boolean }): { phone?: string; terms?: string; value?: { phone: string } } {
  const errors: { phone?: string; terms?: string } = {};
  const phone = normalizeIndianMobile(input.phone);
  if (!input.phone.trim()) errors.phone = 'Enter your mobile number.';
  else if (!phone) errors.phone = 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9.';
  if (!input.accepted) errors.terms = 'Please accept the Terms of Service and Privacy Notice to continue.';
  return errors.phone || errors.terms || !phone ? errors : { value: { phone } };
}

const SIGN_IN_MESSAGES: Record<string, string> = {
  'auth/popup-closed-by-user': 'The Google window was closed before sign-in finished. Please try again.',
  'auth/cancelled-popup-request': 'Another sign-in window was already open. Please try again.',
  'auth/network-request-failed': 'Cannot reach Google. Check your internet connection and try again.',
  'auth/unauthorized-domain': 'Sign-in is not enabled for this website address yet. Please use the V MOTIV app, or contact support.',
  'auth/operation-not-allowed': 'Google sign-in is not enabled yet. Please use the V MOTIV app, or contact support.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/user-disabled': 'This account is unavailable. Please contact support.',
  'auth/web-storage-unsupported': 'Your browser is blocking the storage that sign-in needs. Allow cookies and site data for this site, or turn off private browsing, then try again.',
  ACCOUNT_INACTIVE: 'This account is unavailable. Please contact support.',
  VERIFIED_GOOGLE_IDENTITY_REQUIRED: 'V MOTIV needs a Google account with a verified email address.',
  INVALID_OR_REVOKED_TOKEN: 'Your Google session could not be verified. Sign in again.',
  NETWORK_UNAVAILABLE: 'Cannot reach V MOTIV. Check your internet connection and try again.',
  REQUEST_TIMED_OUT: 'V MOTIV did not respond in time. Please try again.',
  SERVICE_UNAVAILABLE: 'V MOTIV is temporarily unavailable. Please try again shortly.',
};

const SILENT = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

/** Code from a Firebase or API error, whichever it is. */
export function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string') return (error as { code: string }).code;
  return '';
}

/** Wording for a sign-in or account error. Never shows raw codes or technical text. */
export function accountErrorMessage(error: unknown): string {
  const code = errorCode(error);
  const status = error && typeof error === 'object' && 'status' in error ? Number((error as { status: unknown }).status) : 0;
  if (SIGN_IN_MESSAGES[code]) return SIGN_IN_MESSAGES[code]!;
  if (status === 0 && code) return SIGN_IN_MESSAGES.NETWORK_UNAVAILABLE!;
  if (status >= 500) return SIGN_IN_MESSAGES.SERVICE_UNAVAILABLE!;
  return 'Sign-in could not be completed. Please try again.';
}

/** Closing the Google window is a choice, not a failure: nothing is shown. */
export const isSilentSignInError = (error: unknown) => SILENT.has(errorCode(error));

/** Popups are blocked or unavailable in some browsers (in-app browsers, strict privacy modes): those fall back to a full-page redirect. */
export const shouldFallBackToRedirect = (error: unknown) =>
  ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(errorCode(error));
