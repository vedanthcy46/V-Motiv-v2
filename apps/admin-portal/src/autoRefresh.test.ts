import { describe, expect, it } from 'vitest';
import { effectiveIntervalMs, IDLE_STOP_MS, MAX_BACKOFF_MS, decideRefresh, idleMultiplier, joinTokens, nextDelayMs, shouldRunTick } from './autoRefresh';

describe('auto refresh scheduling', () => {
  it('uses the normal interval, backs off per failure and caps the delay', () => {
    expect(nextDelayMs(30_000, 0)).toBe(30_000);
    expect(nextDelayMs(30_000, 1)).toBe(60_000);
    expect(nextDelayMs(30_000, 2)).toBe(120_000);
    expect(nextDelayMs(30_000, 20)).toBe(MAX_BACKOFF_MS);
    expect(nextDelayMs(30_000, -3)).toBe(30_000);
  });

  it('only calls the API when visible, not paused by an open dialog, not idle and not already running', () => {
    const base = { hidden: false, paused: false, idle: false, running: false };
    expect(shouldRunTick(base)).toBe(true);
    expect(shouldRunTick({ ...base, hidden: true })).toBe(false);
    expect(shouldRunTick({ ...base, paused: true })).toBe(false);
    expect(shouldRunTick({ ...base, idle: true })).toBe(false);
    expect(shouldRunTick({ ...base, running: true })).toBe(false);
    expect(IDLE_STOP_MS).toBeGreaterThan(60_000);
  });
});

describe('change detection', () => {
  const base = { lastFullRunAt: 0, now: 1_000, forceEveryMs: 300_000 };
  it('records the first token without reloading (the data was just loaded)', () => {
    expect(decideRefresh({ ...base, previous: null, next: 'a' })).toBe('baseline');
  });
  it('skips the heavy reload when nothing changed and refreshes as soon as a token differs', () => {
    expect(decideRefresh({ ...base, previous: 'a', next: 'a' })).toBe('skip');
    expect(decideRefresh({ ...base, previous: 'a', next: 'b' })).toBe('refresh');
  });
  it('still does a full reload every few minutes as a safety net', () => {
    expect(decideRefresh({ previous: 'a', next: 'a', lastFullRunAt: 0, now: 300_001, forceEveryMs: 300_000 })).toBe('refresh');
  });
  it('joins per-domain tokens in a stable order', () => {
    expect(joinTokens({ b: '2', a: '1' }, ['a', 'b', 'c'])).toBe('1|2|');
  });
});

describe('adaptive slow-down', () => {
  it('checks less and less often while nothing changes, and is capped', () => {
    expect([0, 2, 3, 5, 6, 9, 10, 50].map(idleMultiplier)).toEqual([1, 1, 2, 2, 4, 4, 8, 8]);
    expect(nextDelayMs(30_000, 0, 0)).toBe(30_000);
    expect(nextDelayMs(30_000, 0, 6)).toBe(120_000);
    expect(nextDelayMs(30_000, 0, 20)).toBe(240_000);
    expect(nextDelayMs(60_000, 0, 20)).toBe(MAX_BACKOFF_MS);
  });
  it('failure back-off still stacks on top and stays capped', () => {
    expect(nextDelayMs(30_000, 2, 0)).toBe(120_000);
    expect(nextDelayMs(30_000, 5, 20)).toBe(MAX_BACKOFF_MS);
  });
});

describe('realtime backup polling', () => {
  it('slows polling to a safety net only while the realtime listener is connected', () => {
    expect(effectiveIntervalMs(30_000, { connected: false, signalPending: false })).toBe(30_000);
    expect(effectiveIntervalMs(30_000, { connected: true, signalPending: false })).toBe(300_000);
    expect(effectiveIntervalMs(30_000, { connected: true, signalPending: true })).toBe(30_000);
  });
});
