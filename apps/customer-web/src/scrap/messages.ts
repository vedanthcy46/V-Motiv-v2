import { scrapErrorMessage } from '../../../customer-mobile/src/services/scrap-form';

/**
 * What to tell a person on the website. Scrapping errors share their wording with the app; connection problems are worded for a browser
 * (the shared text says "this phone"), and raw codes are never shown.
 */
export function webErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const status = error && typeof error === 'object' && 'status' in error ? Number((error as { status: unknown }).status) : -1;
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  if (status === 0) return code === 'REQUEST_TIMED_OUT' ? 'V MOTIV did not respond in time. Please try again.' : 'We could not reach V MOTIV. Check your internet connection and try again. Your answers are kept in this browser.';
  if (status === 401) return 'Your sign-in has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to do this.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status >= 500 && !/^SCRAP_SCHEMA_NOT_READY$/.test(code)) return 'V MOTIV had a problem. Please try again in a moment.';
  const text = scrapErrorMessage(error, fallback);
  // A code that nobody has given wording to must not reach the page.
  return /^[A-Z0-9_]{4,}$/.test(text) ? fallback : text;
}
