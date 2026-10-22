export function formatPrice(paise: string | number) {
  const rupees = Math.round(Number(paise) / 100);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(rupees);
}

export const formatPaise = formatPrice;

export function friendlyError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code : error instanceof Error ? error.message : '';
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
    SIGN_IN_CANCELLED: 'Google sign-in was cancelled.',
    '12501': 'Google sign-in was cancelled.',
    IN_PROGRESS: 'Google sign-in is already open. Complete or close that window first.',
    PLAY_SERVICES_NOT_AVAILABLE: 'Google Play services must be updated before signing in.',
    DEVELOPER_ERROR: 'Google sign-in is not configured for this Android build. Contact V MOTIV support.',
    '10': 'Google sign-in is not configured for this Android build. Contact V MOTIV support.',
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
