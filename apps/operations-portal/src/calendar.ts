/**
 * Returns a trustworthy calendar year for the operations portal.
 * Guards against JS runtimes that return the Unix epoch (year 1970) for
 * new Date().getFullYear(), which would corrupt vehicle-year validation.
 */
export function currentCalendarYear(now: Date = new Date()): number {
  const year = now.getFullYear();
  return year >= 2024 && year <= 2100 ? year : 2026;
}

export const CURRENT_YEAR: number = currentCalendarYear();
