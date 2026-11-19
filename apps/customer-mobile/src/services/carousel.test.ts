import { describe, expect, it } from 'vitest';
import { PAUSE_AFTER_TOUCH_MS, clampIndex, isTileActive, indexFromOffset, nextIndex, offsetForIndex, peekItemWidth, shouldAutoAdvance, spanOf } from './carousel';

describe('where a carousel is', () => {
  it('maps a scroll position to the item it settled on, and never outside the list', () => {
    expect(indexFromOffset(0, 360, 5)).toBe(0);
    expect(indexFromOffset(350, 360, 5)).toBe(1); // nearly there counts
    expect(indexFromOffset(720, 360, 5)).toBe(2);
    expect(indexFromOffset(99999, 360, 5)).toBe(4);
    expect(indexFromOffset(-40, 360, 5)).toBe(0);
  });
  it('is safe with nothing to show or a bad width', () => {
    expect(indexFromOffset(100, 360, 0)).toBe(0);
    expect(indexFromOffset(100, 0, 5)).toBe(0);
    expect(indexFromOffset(Number.NaN, 360, 5)).toBe(0);
    expect(clampIndex(3, 0)).toBe(0);
  });
  it('item i sits at i spans from the start, where a span is the item and the gap after it', () => {
    expect(spanOf(300, 12)).toBe(312);
    expect(offsetForIndex(3, spanOf(300, 12))).toBe(936);
    expect(indexFromOffset(offsetForIndex(3, 312), 312, 6)).toBe(3);
  });
});

describe('moving on', () => {
  it('goes to the next item and wraps to the first after the last', () => {
    expect(nextIndex(0, 4)).toBe(1);
    expect(nextIndex(3, 4)).toBe(0);
    expect(nextIndex(9, 4)).toBe(0); // a stale index from before the list shrank
  });
  it('stays put with zero or one item', () => {
    expect(nextIndex(0, 1)).toBe(0);
    expect(nextIndex(0, 0)).toBe(0);
  });
});

describe('a sliver of the next item', () => {
  it('is as wide as the screen less the inset, the gap and the sliver, with a sensible minimum', () => {
    expect(peekItemWidth(390)).toBe(332);
    expect(peekItemWidth(360)).toBe(302);
    expect(peekItemWidth(100)).toBe(200);
  });
});

describe('when it moves by itself', () => {
  const base = { count: 3, intervalMs: 5000, pausedUntil: 0, now: 1000, focused: true, appActive: true };
  it('moves when there is more than one item, it is on screen, the app is open, and nobody just touched it', () => {
    expect(shouldAutoAdvance(base)).toBe(true);
  });
  it('does not move with one item, with automatic movement off, on another tab, or in the background', () => {
    expect(shouldAutoAdvance({ ...base, count: 1 })).toBe(false);
    expect(shouldAutoAdvance({ ...base, count: 0 })).toBe(false);
    expect(shouldAutoAdvance({ ...base, intervalMs: 0 })).toBe(false);
    expect(shouldAutoAdvance({ ...base, intervalMs: undefined })).toBe(false);
    expect(shouldAutoAdvance({ ...base, focused: false })).toBe(false);
    expect(shouldAutoAdvance({ ...base, appActive: false })).toBe(false);
  });
  it('waits after a touch, then carries on', () => {
    const touchedAt = 1000;
    const pausedUntil = touchedAt + PAUSE_AFTER_TOUCH_MS;
    expect(shouldAutoAdvance({ ...base, pausedUntil, now: touchedAt + 1000 })).toBe(false);
    expect(shouldAutoAdvance({ ...base, pausedUntil, now: pausedUntil })).toBe(true);
  });
});

describe('which item is playing', () => {
  it('is only the one in view, and only while Home is on screen and the app is open', () => {
    expect(isTileActive(2, 2, true, true)).toBe(true);
    expect(isTileActive(1, 2, true, true)).toBe(false);
    expect(isTileActive(2, 2, false, true)).toBe(false);
    expect(isTileActive(2, 2, true, false)).toBe(false);
  });
});
