export function formatPrice(paise: string | number) {
  const rupees = Math.round(Number(paise) / 100);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(rupees);
}

export const formatPaise = formatPrice;

export function friendlyError(error: unknown) {
  let code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code : error instanceof Error ? error.message : '';

  // Extract common Android Google Sign-In error patterns
  if (code.includes('12500') || code.includes('SIGN_IN_FAILED')) {
    code = '12500';
  } else if (code.includes('12501') || code.includes('SIGN_IN_CANCELLED') || code === 'auth_cancelled') {
    code = 'SIGN_IN_CANCELLED';
  } else if (code.includes('12502')) {
    code = '12502';
  } else if (code.includes('DEVELOPER_ERROR') || code === '10') {
    code = 'DEVELOPER_ERROR';
  } else if (code.includes('Network request failed') || code.includes('fetch failed')) {
    code = 'NETWORK_UNREACHABLE';
  }

  const known: Record<string, string> = {
    ACCOUNT_INACTIVE: 'This account is unavailable. Please contact support.',
    LISTING_NOT_AVAILABLE: 'This vehicle is no longer available.',
    INVALID_OR_REVOKED_TOKEN: 'Your Google session could not be verified. Sign in again and try once more.',
    VERIFIED_GOOGLE_IDENTITY_REQUIRED: 'V MOTIV requires a verified Google email address.',
    AUTHENTICATION_REQUIRED: 'Sign in with Google before continuing.',
    NETWORK_UNREACHABLE: 'Cannot reach V MOTIV. Reconnect to the development computer over Wi-Fi or USB, then try again.',
    REQUEST_TIMEOUT: 'V MOTIV did not respond in time. Check your connection and try again.',
    SESSION_TIMEOUT: 'Your Google session took too long to respond. Check your internet connection and try again.',
    GOOGLE_SIGN_IN_TIMEOUT: 'Google sign-in timed out. Close the sign-in window and try again.',
    API_CONFIGURATION_REQUIRED: 'The V MOTIV server address is missing or invalid in this build.',
    INVALID_API_RESPONSE: 'The server address did not return a V MOTIV API response. Reopen the app and try again.',
    BACKEND_UNAVAILABLE: 'V MOTIV is temporarily unavailable. Please try again shortly.',
    'auth/network-request-failed': 'Google could not connect. Check the phone’s internet connection and try again.',
    'auth/invalid-credential': 'Your Google sign-in could not be verified. Sign in again.',
    'auth/operation-not-allowed': 'Google sign-in is not enabled for this V MOTIV build.',
    'auth/invalid-api-key': 'Firebase configuration is invalid in this V MOTIV build.',
    'auth/app-not-authorized': 'This Android build is not authorized for Google sign-in. Contact V MOTIV support.',
    'auth/internal-error': 'Google authentication service error. Please try again.',
    'auth/user-disabled': 'This Google account is disabled. Please contact V MOTIV support.',
    'auth/user-not-found': 'No account found matching this Google identity.',
    SIGN_IN_CANCELLED: 'Google sign-in was cancelled.',
    '12500': 'Google sign-in failed (Code 12500). Verify that the build SHA-1 fingerprint is added in Firebase Console and a project support email is set.',
    '12501': 'Google sign-in was cancelled.',
    '12502': 'Google sign-in is already in progress. Complete or close that window first.',
    '7': 'Network error during Google sign-in. Check your connection and try again.',
    '8': 'Google Play Services internal error. Please restart the app and try again.',
    '16': 'Google sign-in was cancelled.',
    INTERNAL_ERROR: 'V MOTIV service encountered a temporary error. Please try again shortly.',
    REQUEST_FAILED: 'Could not communicate with V MOTIV server. Please verify your connection.',
    IN_PROGRESS: 'Google sign-in is already open. Complete or close that window first.',
    PLAY_SERVICES_NOT_AVAILABLE: 'Google Play services must be updated before signing in.',
    DEVELOPER_ERROR: 'Google sign-in is not configured for this Android build (Code 10). Check SHA-1 fingerprint in Firebase Console.',
    '10': 'Google sign-in is not configured for this Android build (Code 10). Check SHA-1 fingerprint in Firebase Console.',
    REQUEST_CONFLICT: 'This request was already submitted.',
    auth_cancelled: 'Google sign-in was cancelled.',
    CITY_NOT_SUPPORTED: 'The selected city is not currently supported. Please choose a city from the list.',
    PROFILE_NOT_REGISTERED: 'Your account could not be found. Please sign out and sign in again.',
    INVALID_INPUT: 'Some details are invalid. Please review your entries and try again.',
    LEAD_NOT_FOUND: 'This selling request could not be found.',
    LEAD_NOT_CANCELLABLE: 'This selling request can no longer be cancelled.',
    REQUEST_NOT_CANCELLABLE: 'This request can no longer be cancelled.',
  };
  return known[code] ?? 'We could not complete that request. Check your connection and try again.';
}
