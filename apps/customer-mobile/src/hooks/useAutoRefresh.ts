import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { decideRefresh, joinTokens, nextDelayMs, shouldRunTick } from '../services/auto-refresh';

export interface PulseOptions {
  domains: string[];
  fetchTokens: (domains: string[]) => Promise<Record<string, string>>;
}

/**
 * Quietly keeps a screen current while it is focused and the app is in the foreground.
 * With `pulse`, each tick is ONE tiny request (GET /pulse); the real (heavy) loader runs only when the server says
 * something changed (plus a safety full reload every 5 minutes). No spinners (the task must load "silently"),
 * pauses in the background and while `paused` is true (e.g. a sheet with a form is open), backs off while the API
 * fails, and never overlaps runs. Throw from the task on failure so the back-off can kick in.
 */
export function useAutoRefresh(
  task: () => Promise<unknown> | unknown,
  options: { intervalMs?: number; enabled?: boolean; paused?: boolean; pulse?: PulseOptions } = {},
): void {
  const { intervalMs = 45_000, enabled = true, paused = false, pulse } = options;
  const focused = useIsFocused();
  const taskRef = useRef(task);
  taskRef.current = task;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const pulseRef = useRef(pulse);
  pulseRef.current = pulse;

  useEffect(() => {
    if (!enabled || !focused) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let running = false;
    let stopped = false;
    let lastRun = Date.now();
    let lastFullRunAt = Date.now();
    let lastToken: string | null = null;

    const schedule = () => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void tick(), nextDelayMs(intervalMs, failures));
    };

    const first = pulseRef.current;
    if (first) {
      first.fetchTokens(first.domains).then(tokens => { if (lastToken === null) lastToken = joinTokens(tokens, first.domains); }).catch(() => undefined);
    }

    const tick = async () => {
      if (stopped) return;
      if (!shouldRunTick({ appActive: AppState.currentState === 'active', focused: true, paused: pausedRef.current, running })) {
        schedule();
        return;
      }
      running = true;
      try {
        const p = pulseRef.current;
        if (p) {
          const next = joinTokens(await p.fetchTokens(p.domains), p.domains);
          if (decideRefresh({ previous: lastToken, next, lastFullRunAt, now: Date.now() }) === 'refresh') {
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
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && Date.now() - lastRun > intervalMs / 2) void tick();
    });
    schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [enabled, focused, intervalMs]);
}
