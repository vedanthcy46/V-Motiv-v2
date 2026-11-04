// Soft auto-refresh for portal data. Quietly checks a tiny change-detection endpoint (GET /pulse) and only
// re-runs the real (heavy) loader when something actually changed, so an idle screen costs one cheap request per interval.
// - pauses when the tab is hidden, when a dialog/modal is open (never refresh under someone who is typing),
//   and after 20 minutes without interaction; resumes instantly when the tab becomes visible again
// - backs off (x2 up to 5 min) while the API is failing, resets after a success
// - never overlaps two runs; as a safety net the full loader still runs at least every 5 minutes
import { useEffect, useRef } from 'react';

export const MAX_BACKOFF_MS = 5 * 60_000;
export const IDLE_STOP_MS = 20 * 60_000;
export const FORCE_FULL_REFRESH_MS = 5 * 60_000;

/** Delay before the next attempt: the normal interval, doubled per consecutive failure, capped. */
export function nextDelayMs(intervalMs: number, failures: number): number {
  return Math.min(intervalMs * 2 ** Math.min(Math.max(failures, 0), 6), MAX_BACKOFF_MS);
}

/** Whether a scheduled tick should actually call the API. */
export function shouldRunTick(state: { hidden: boolean; paused: boolean; idle: boolean; running: boolean }): boolean {
  return !state.hidden && !state.paused && !state.idle && !state.running;
}

/** What to do with a freshly fetched change token. 'baseline' = first token seen (data was just loaded), nothing to refresh. */
export function decideRefresh(args: { previous: string | null; next: string; lastFullRunAt: number; now: number; forceEveryMs?: number }): 'baseline' | 'skip' | 'refresh' {
  if (args.previous === null) return 'baseline';
  if (args.next !== args.previous) return 'refresh';
  return args.now - args.lastFullRunAt >= (args.forceEveryMs ?? FORCE_FULL_REFRESH_MS) ? 'refresh' : 'skip';
}

export function joinTokens(tokens: Record<string, string>, domains: string[]): string {
  return domains.map(domain => tokens[domain] ?? '').join('|');
}

export function modalIsOpen(): boolean {
  return typeof document !== 'undefined' && Boolean(document.querySelector('.modal-overlay, dialog[open]'));
}

export interface PulseOptions {
  domains: string[];
  fetchTokens: (domains: string[]) => Promise<Record<string, string>>;
}

export function useAutoRefresh(
  task: () => Promise<unknown> | unknown,
  options: { intervalMs?: number; enabled?: boolean; pauseWhen?: () => boolean; pulse?: PulseOptions } = {},
): void {
  const { intervalMs = 30_000, enabled = true, pauseWhen = modalIsOpen, pulse } = options;
  const taskRef = useRef(task);
  taskRef.current = task;
  const pauseRef = useRef(pauseWhen);
  pauseRef.current = pauseWhen;
  const pulseRef = useRef(pulse);
  pulseRef.current = pulse;

  useEffect(() => {
    if (!enabled) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let running = false;
    let stopped = false;
    let lastRun = Date.now();
    let lastFullRunAt = Date.now();
    let lastInteraction = Date.now();
    let lastToken: string | null = null;

    const schedule = () => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void tick(), nextDelayMs(intervalMs, failures));
    };

    // Record the current token right away so the first real change is detected on the first poll.
    const current = pulseRef.current;
    if (current) {
      current.fetchTokens(current.domains).then(tokens => { if (lastToken === null) lastToken = joinTokens(tokens, current.domains); }).catch(() => undefined);
    }

    const tick = async () => {
      if (stopped) return;
      const run = shouldRunTick({
        hidden: typeof document !== 'undefined' && document.hidden,
        paused: Boolean(pauseRef.current()),
        idle: Date.now() - lastInteraction > IDLE_STOP_MS,
        running,
      });
      if (!run) { schedule(); return; }
      running = true;
      try {
        const p = pulseRef.current;
        if (p) {
          const next = joinTokens(await p.fetchTokens(p.domains), p.domains);
          const decision = decideRefresh({ previous: lastToken, next, lastFullRunAt, now: Date.now() });
          if (decision === 'refresh') {
            await taskRef.current();
            lastFullRunAt = Date.now();
          }
          lastToken = next;
        } else {
          await taskRef.current();
        }
        failures = 0;
      } catch {
        failures += 1;
      } finally {
        running = false;
        lastRun = Date.now();
        schedule();
      }
    };

    const onVisible = () => {
      if (document.hidden) return;
      lastInteraction = Date.now();
      if (Date.now() - lastRun > intervalMs / 2) void tick();
    };
    const onInteract = () => { lastInteraction = Date.now(); };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pointerdown', onInteract, { passive: true });
    window.addEventListener('keydown', onInteract);
    schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pointerdown', onInteract);
      window.removeEventListener('keydown', onInteract);
    };
  }, [enabled, intervalMs]);
}
