/**
 * Returns a trustworthy calendar year.
 *
 * React Native / Expo apps run in a JS engine where `new Date().getFullYear()`
 * is reliable, but we guard it defensively so this helper can be used
 * symmetrically with the server-side helper in services/api/src/calendar.ts.
 *
 * The fallback of 2026 matches the server-side default and prevents the
 * "expected number to be <=1972" error that occurs when the runtime returns
 * the Unix epoch instead of the real wall-clock year.
 */
export function currentCalendarYear(now: Date = new Date()): number {
  const year = now.getFullYear();
  return year >= 2024 && year <= 2100 ? year : 2026;
}

/** Convenience constant — evaluates once at module load time. */
export const CURRENT_YEAR: number = currentCalendarYear();
