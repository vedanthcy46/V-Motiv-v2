import { describe, expect, it } from 'vitest';
import { MAX_BACKOFF_MS, PUSH_BACKUP_INTERVAL_MS, decideRefresh, effectiveIntervalMs, idleMultiplier, joinTokens, nextDelayMs, shouldRunTick } from './auto-refresh';

describe('app auto refresh', () => {
  it('backs off while the API is failing and caps the delay', () => {
    expect(nextDelayMs(45_000, 0)).toBe(45_000);
    expect(nextDelayMs(45_000, 1)).toBe(90_000);
    expect(nextDelayMs(45_000, 30)).toBe(MAX_BACKOFF_MS);
  });
  it('only refreshes when the app is in the foreground, the screen is focused and nothing blocks it', () => {
    const base = { appActive: true, focused: true, paused: false, running: false };
    expect(shouldRunTick(base)).toBe(true);
    expect(shouldRunTick({ ...base, appActive: false })).toBe(false);
    expect(shouldRunTick({ ...base, focused: false })).toBe(false);
    expect(shouldRunTick({ ...base, paused: true })).toBe(false);
    expect(shouldRunTick({ ...base, running: true })).toBe(false);
  });
});

describe('app change detection', () => {
  const base = { lastFullRunAt: 0, now: 1_000 };
  it('does not reload the screen while the server says nothing changed', () => {
    expect(decideRefresh({ ...base, previous: null, next: 'a' })).toBe('baseline');
    expect(decideRefresh({ ...base, previous: 'a', next: 'a' })).toBe('skip');
    expect(decideRefresh({ ...base, previous: 'a', next: 'b' })).toBe('refresh');
    expect(decideRefresh({ previous: 'a', next: 'a', lastFullRunAt: 0, now: 300_001 })).toBe('refresh');
    expect(joinTokens({ me: 'x' }, ['me'])).toBe('x');
  });
});

describe('adaptive slow-down and push', () => {
  it('slows down while nothing changes', () => {
    expect([0, 2, 3, 6, 10].map(idleMultiplier)).toEqual([1, 1, 2, 4, 8]);
    expect(nextDelayMs(45_000, 0, 6)).toBe(180_000);
    expect(nextDelayMs(45_000, 0, 30)).toBe(MAX_BACKOFF_MS);
  });
  it('uses a slow backup check when push notifications deliver the changes', () => {
    expect(effectiveIntervalMs(30_000, true)).toBe(PUSH_BACKUP_INTERVAL_MS);
    expect(effectiveIntervalMs(30_000, false)).toBe(30_000);
    expect(effectiveIntervalMs(10 * 60_000, true)).toBe(10 * 60_000);
  });
});
