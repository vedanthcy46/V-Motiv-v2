// Pure scheduling rules for the app's soft auto-refresh (unit-tested; the hook adds AppState/focus).
export const MAX_BACKOFF_MS = 5 * 60_000;
export const FORCE_FULL_REFRESH_MS = 5 * 60_000;

export function nextDelayMs(intervalMs: number, failures: number): number {
  return Math.min(intervalMs * 2 ** Math.min(Math.max(failures, 0), 6), MAX_BACKOFF_MS);
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
