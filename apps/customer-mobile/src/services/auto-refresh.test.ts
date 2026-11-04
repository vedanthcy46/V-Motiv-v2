import { describe, expect, it } from 'vitest';
import { MAX_BACKOFF_MS, decideRefresh, joinTokens, nextDelayMs, shouldRunTick } from './auto-refresh';

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
