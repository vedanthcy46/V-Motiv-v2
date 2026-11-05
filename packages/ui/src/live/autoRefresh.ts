// Soft auto-refresh for portal data. Quietly checks a tiny change-detection endpoint (GET /pulse) and only
// re-runs the real (heavy) loader when something actually changed, so an idle screen costs one cheap request per interval.
// - pauses when the tab is hidden, when a dialog/modal is open (never refresh under someone who is typing),
//   and after 20 minutes without interaction; resumes instantly when the tab becomes visible again
// - backs off (x2 up to 5 min) while the API is failing, resets after a success
// - never overlaps two runs; as a safety net the full loader still runs at least every 5 minutes
import { useEffect, useRef } from 'react';
import { subscribeLive } from './liveSignal';

export const MAX_BACKOFF_MS = 5 * 60_000;
export const IDLE_STOP_MS = 20 * 60_000;
export const FORCE_FULL_REFRESH_MS = 5 * 60_000;
/** While a realtime listener is connected, polling is only a safety net. */
export const LIVE_BACKUP_INTERVAL_MS = 5 * 60_000;

/** Polling interval to use: the slow backup while realtime signals work, unless a signal is waiting for a paused screen. */
export function effectiveIntervalMs(intervalMs: number, live: { connected: boolean; signalPending: boolean }): number {
  return live.connected && !live.signalPending ? Math.max(intervalMs, LIVE_BACKUP_INTERVAL_MS) : intervalMs;
}

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

/** True while any dialog is on screen (shared Modal, drawers, native <dialog> and legacy overlays): never refresh under someone typing. */
export function modalIsOpen(): boolean {
  return typeof document !== 'undefined' && Boolean(document.querySelector('[role="dialog"][aria-modal="true"], .modal-overlay, dialog[open]'));
}

export interface PulseOptions {
  domains: string[];
  /** `fresh` is true right after a realtime signal: the API then accepts only very recent cached data. */
  fetchTokens: (domains: string[], fresh?: boolean) => Promise<Record<string, string>>;
  /** Listen to Firebase Realtime Database for these domains and check immediately when one changes. */
  live?: boolean;
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
    let unchanged = 0; // consecutive checks where nothing changed (drives the slow-down)
    let liveConnected = false;
    let signalPending = false;
    let freshNext = false;

    const schedule = () => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void tick(), nextDelayMs(effectiveIntervalMs(intervalMs, { connected: liveConnected, signalPending }), failures, unchanged));
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
      signalPending = false;
      const fresh = freshNext;
      freshNext = false;
      try {
        const p = pulseRef.current;
        if (p) {
          const next = joinTokens(await p.fetchTokens(p.domains, fresh), p.domains);
          const changed = lastToken !== null && next !== lastToken;
          const decision = decideRefresh({ previous: lastToken, next, lastFullRunAt, now: Date.now() });
          if (decision === 'refresh') {
            await taskRef.current();
            lastFullRunAt = Date.now();
          }
          lastToken = next;
          unchanged = changed ? 0 : unchanged + 1;
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
      unchanged = 0;
      if (Date.now() - lastRun > intervalMs / 2) void tick();
    };
    const onInteract = () => {
      lastInteraction = Date.now();
      // First interaction after a quiet spell: go back to normal speed straight away.
      if (unchanged > 0) {
        unchanged = 0;
        schedule();
      }
    };

    const livePulse = pulseRef.current;
    const unsubscribeLive = livePulse?.live
      ? subscribeLive(livePulse.domains, {
          onConnected: () => { liveConnected = true; schedule(); },
          onSignal: () => {
            signalPending = true;
            freshNext = true;
            unchanged = 0;
            if (!running) void tick(); // when paused (e.g. a dialog is open) the tick re-schedules at the normal interval
          },
        })
      : null;

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pointerdown', onInteract, { passive: true });
    window.addEventListener('keydown', onInteract);
    schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      unsubscribeLive?.();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pointerdown', onInteract);
      window.removeEventListener('keydown', onInteract);
    };
  }, [enabled, intervalMs]);
}

// ---------------------------------------------------------------------------------------------------------------------
// "New activity" announcements: the floating bar (LiveChangeBar) tells staff when something changed that they did not do
// themselves - a customer booking, an enquiry, a payment. It rides on the same cheap change tokens as the auto-refresh.
// ---------------------------------------------------------------------------------------------------------------------
export interface ChangeAnnouncement {
  domains: string[];
  at: number;
}

/** A change made within this long after the signed-in person's own save is assumed to be that save, not new activity. */
export const OWN_WRITE_QUIET_MS = 5_000;

/** Domains whose token differs from the previous one. A domain seen for the first time is a baseline, not a change. */
export function changedDomains(previous: Record<string, string>, next: Record<string, string>, domains: string[]): string[] {
  return domains.filter(domain => previous[domain] !== undefined && next[domain] !== undefined && previous[domain] !== next[domain]);
}

/** Whether to announce: not for the person's own just-saved change. */
export function shouldAnnounce(args: { now: number; lastOwnWriteAt: number; quietMs?: number }): boolean {
  return args.now - args.lastOwnWriteAt >= (args.quietMs ?? OWN_WRITE_QUIET_MS);
}

let lastOwnWriteAt = 0;
let writeTrackingInstalled = false;
const changeListeners = new Set<(announcement: ChangeAnnouncement) => void>();

/** Notes the time of every save this browser tab makes (any non-GET call except the change check itself). */
function installOwnWriteTracking() {
  if (writeTrackingInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  writeTrackingInstalled = true;
  const original = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const method = (init?.method ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      if (method !== 'GET' && method !== 'HEAD' && !url.includes('/pulse')) lastOwnWriteAt = Date.now();
    } catch {
      // tracking must never break a request
    }
    return original(input, init);
  }) as typeof window.fetch;
}

export function announceChange(domains: string[], now: number = Date.now()): void {
  if (domains.length === 0 || !shouldAnnounce({ now, lastOwnWriteAt })) return;
  for (const listener of changeListeners) listener({ domains, at: now });
}

export function subscribeChanges(listener: (announcement: ChangeAnnouncement) => void): () => void {
  changeListeners.add(listener);
  return () => { changeListeners.delete(listener); };
}

/**
 * Watches the given pulse domains (all at once, whatever screen is open) and announces the ones that change.
 * Costs the same single cheap check as the auto-refresh and reacts to the realtime signal when it is available.
 */
export function useChangeWatcher(
  domains: string[],
  fetchTokens: (domains: string[], fresh?: boolean) => Promise<Record<string, string>>,
  options: { enabled?: boolean; intervalMs?: number } = {},
): void {
  const previous = useRef<Record<string, string> | null>(null);
  const latest = useRef<Record<string, string>>({});
  useEffect(() => { installOwnWriteTracking(); }, []);
  useAutoRefresh(
    () => {
      const before = previous.current;
      const after = latest.current;
      previous.current = { ...after };
      if (before) announceChange(changedDomains(before, after, domains));
    },
    {
      enabled: options.enabled,
      intervalMs: options.intervalMs ?? 45_000,
      pauseWhen: () => false,
      pulse: {
        domains,
        live: true,
        fetchTokens: async (requested, fresh) => {
          const tokens = await fetchTokens(requested, fresh);
          latest.current = tokens;
          if (previous.current === null) previous.current = { ...tokens }; // the first reading is the baseline
          return tokens;
        },
      },
    },
  );
}
