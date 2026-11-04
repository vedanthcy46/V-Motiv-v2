// Pure scheduling rules for the app's soft auto-refresh (unit-tested; the hook adds AppState/focus).
export const MAX_BACKOFF_MS = 5 * 60_000;
export const FORCE_FULL_REFRESH_MS = 5 * 60_000;

/**
 * How much slower to check after N consecutive checks where nothing changed. A screen nobody is acting on costs
 * less and less: x1 for the first 2 quiet checks, x2, x4, then x8 (capped by MAX_BACKOFF_MS).
 */
export function idleMultiplier(unchangedStreak: number): number {
  if (unchangedStreak < 3) return 1;
  if (unchangedStreak < 6) return 2;
  if (unchangedStreak < 10) return 4;
  return 8;
}

/** Delay before the next attempt: the interval, slowed while nothing changes, doubled per failure, capped. */
export function nextDelayMs(intervalMs: number, failures: number, unchangedStreak = 0): number {
  return Math.min(intervalMs * idleMultiplier(unchangedStreak) * 2 ** Math.min(Math.max(failures, 0), 6), MAX_BACKOFF_MS);
}

/** With push notifications active the server tells us about changes, so the backup check can be much slower. */
export const PUSH_BACKUP_INTERVAL_MS = 5 * 60_000;
export function effectiveIntervalMs(intervalMs: number, pushActive: boolean): number {
  return pushActive ? Math.max(intervalMs, PUSH_BACKUP_INTERVAL_MS) : intervalMs;
}

export function shouldRunTick(state: { appActive: boolean; focused: boolean; paused: boolean; running: boolean }): boolean {
  return state.appActive && state.focused && !state.paused && !state.running;
}

/** What to do with a freshly fetched change token ('baseline' = first token, the screen was just loaded). */
export function decideRefresh(args: { previous: string | null; next: string; lastFullRunAt: number; now: number; forceEveryMs?: number }): 'baseline' | 'skip' | 'refresh' {
  if (args.previous === null) return 'baseline';
  if (args.next !== args.previous) return 'refresh';
  return args.now - args.lastFullRunAt >= (args.forceEveryMs ?? FORCE_FULL_REFRESH_MS) ? 'refresh' : 'skip';
}

export function joinTokens(tokens: Record<string, string>, domains: string[]): string {
  return domains.map(domain => tokens[domain] ?? '').join('|');
}
