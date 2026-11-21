import { describe, expect, it } from 'vitest';
import { HIDE_AFTER, SHOW_AFTER, TOP_ZONE, hiddenDistance, initialScrollState, nextScrollState, type ScrollState } from './tab-bar-scroll';

const VIEW = 700;
const CONTENT = 3000;
const at = (state: ScrollState, offset: number, content = CONTENT) => nextScrollState(state, { offset, contentHeight: content, viewHeight: VIEW });
/** Scrolls through a series of offsets and returns the state after each. */
const run = (offsets: number[], start = initialScrollState(), content = CONTENT) => {
  const states: ScrollState[] = [];
  let state = start;
  for (const offset of offsets) { state = at(state, offset, content); states.push(state); }
  return states;
};

describe('hiding on the way down', () => {
  it('stays shown for the first few pixels, then hides once the scroll is clearly downward', () => {
    const states = run([10, 20, 30, 40, 48, 56, 64, 72, 80]); // a slow scroll, as the list reports it a frame at a time
    expect(states[3]!.visible).toBe(true); // 40 is past the top zone but the scroll has only just started
    expect(states.at(-1)!.visible).toBe(false);
    const hiddenAt = states.findIndex(state => !state.visible);
    expect(hiddenAt).toBeGreaterThan(0); // not on the very first movement
  });
  it('needs HIDE_AFTER pixels of continuous downward travel', () => {
    const from100: ScrollState = { lastOffset: 100, travelled: 0, visible: true };
    const a = run([100 + HIDE_AFTER - 1], from100);
    expect(a.at(-1)!.visible).toBe(true);
    const b = run([100 + HIDE_AFTER + 1], from100);
    expect(b.at(-1)!.visible).toBe(false);
  });
});

describe('showing on the way up', () => {
  const hidden = (): ScrollState => ({ lastOffset: 800, travelled: 40, visible: false });
  it('comes back after SHOW_AFTER pixels of upward scrolling', () => {
    expect(at(hidden(), 800 - SHOW_AFTER + 1).visible).toBe(false);
    expect(at(hidden(), 800 - SHOW_AFTER).visible).toBe(true);
  });
  it('a change of direction starts counting again, so down-up-down jitter does not flip it', () => {
    const states = run([300, 330, 325, 335, 333, 340], { lastOffset: 300, travelled: 0, visible: true });
    // Never 16px in one direction without a reversal in between except the net downward drift: check no flicker back to visible once hidden
    const hiddenIndex = states.findIndex(state => !state.visible);
    if (hiddenIndex >= 0) for (const state of states.slice(hiddenIndex)) expect(state.visible).toBe(false);
  });
});

describe('the top, the ends and short lists', () => {
  it('is always shown at the top, even when it was hidden', () => {
    expect(at({ lastOffset: 500, travelled: 30, visible: false }, TOP_ZONE).visible).toBe(true);
    expect(at({ lastOffset: 500, travelled: 30, visible: false }, 0).visible).toBe(true);
  });
  it('treats pulling down past the top (pull to refresh) as the top, and does not go negative', () => {
    const state = at({ lastOffset: 200, travelled: 20, visible: false }, -60);
    expect(state.visible).toBe(true);
    expect(state.lastOffset).toBe(0);
  });
  it('ignores bounce past the bottom: the position counts as the end, so the bounce back is not a scroll up', () => {
    const maxOffset = CONTENT - VIEW;
    const atEnd = at({ lastOffset: maxOffset - 10, travelled: 30, visible: false }, maxOffset + 80);
    expect(atEnd.visible).toBe(false);
    expect(atEnd.lastOffset).toBe(maxOffset);
    const bounceBack = at(atEnd, maxOffset + 20); // the spring returning is still past the end
    expect(bounceBack.visible).toBe(false);
  });
  it('never hides the bar on a list that barely scrolls', () => {
    expect(run([10, 20, 30], initialScrollState(), VIEW + 20).every(state => state.visible)).toBe(true);
    expect(run([100, 200], initialScrollState(), VIEW - 100).every(state => state.visible)).toBe(true);
  });
  it('is safe with a bad reading', () => {
    expect(at(initialScrollState(), Number.NaN).visible).toBe(true);
    expect(at(initialScrollState(), Number.POSITIVE_INFINITY).visible).toBe(true); // an unreadable position is treated as the top
  });
});

describe('how far the bar travels to hide', () => {
  it('covers its height, its gap from the bottom and its shadow', () => {
    expect(hiddenDistance(64, 24)).toBe(120);
    expect(hiddenDistance(64, 24, 50)).toBe(138);
  });
});
