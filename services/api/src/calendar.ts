/**
 * Returns a trustworthy calendar year in runtimes where the wall clock can be
 * unavailable during isolate start-up. Cloudflare's Node compatibility layer
 * has previously exposed the Unix epoch here, which would otherwise reject all
 * modern vehicle years as being newer than 1972.
 */
export function currentCalendarYear(now: Date = new Date()): number {
  const year = now.getUTCFullYear();
  return year >= 2024 && year <= 2100 ? year : 2026;
}
