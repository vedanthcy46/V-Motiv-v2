// Pure rules for the first-login two-factor enrolment of field inspectors (no native imports, unit-tested).

/** Normalises an Indian mobile number to E.164 (+91XXXXXXXXXX). Returns null if it is not a valid 10-digit mobile. */
export function normalizeIndianMobile(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : null;
}

/** An inspector must enrol a second factor before using the app. Unknown (null) never blocks, to avoid locking people out on a read failure. */
export function inspectorNeedsMfaEnrollment(args: {
  signedIn: boolean;
  isInspector: boolean;
  enrolledFactorCount: number | null;
}): boolean {
  return args.signedIn && args.isInspector && args.enrolledFactorCount === 0;
}

export function mfaEnrollmentErrorMessage(error: unknown): string {
  const code = String((error as { code?: string })?.code ?? '');
  const map: Record<string, string> = {
    'auth/requires-recent-login': 'For security, please sign out and sign in again, then retry.',
    'auth/invalid-verification-code': 'That code is not correct. Check the SMS and try again.',
    'auth/code-expired': 'That code has expired. Request a new one.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/invalid-phone-number': 'Enter a valid 10-digit Indian mobile number.',
    'auth/unverified-email': 'Your email must be verified before two-factor can be enabled. Contact your administrator.',
    'auth/second-factor-already-in-use': 'This phone number is already used as a second factor on another account.',
    'auth/operation-not-allowed': 'Two-factor authentication is not enabled for this project yet. Contact your administrator.',
  };
  return map[code] ?? 'We could not complete two-factor setup. Check your connection and try again.';
}
