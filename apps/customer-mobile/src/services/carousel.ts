// The arithmetic behind the Home screen's carousels (banners, hub photos, hub videos). Pure, so it is tested alone.
//
// A carousel is a row of items, each `itemWidth` wide with `gap` between them. It snaps so that one item sits at the left edge (after an inset),
// which means item i is at scroll offset i * span, where span = itemWidth + gap.

export const spanOf = (itemWidth: number, gap: number) => itemWidth + gap;

export const clampIndex = (index: number, count: number) => (count <= 0 ? 0 : Math.max(0, Math.min(count - 1, index)));

/** Which item a scroll position has settled on. */
export function indexFromOffset(offset: number, span: number, count: number): number {
  if (count <= 0 || span <= 0 || !Number.isFinite(offset)) return 0;
  return clampIndex(Math.round(offset / span), count);
}

export const offsetForIndex = (index: number, span: number) => index * span;

/** The item after this one, wrapping to the first after the last. */
export const nextIndex = (current: number, count: number) => (count < 2 ? 0 : (clampIndex(current, count) + 1) % count);

/**
 * Width of an item that leaves a sliver of the next one showing (the cue that the row can be swiped). `inset` is the space to the left of the
 * first item, `gap` the space between items, `peek` how much of the next item shows.
 */
export function peekItemWidth(screenWidth: number, inset = 20, gap = 12, peek = 26, minimum = 200): number {
  return Math.max(minimum, Math.round(screenWidth - inset - gap - peek));
}

export interface AutoAdvanceState {
  count: number;
  /** Milliseconds between moves; 0 or undefined turns automatic movement off. */
  intervalMs?: number;
  /** Time until which the person has just touched the carousel and it must not move on by itself. */
  pausedUntil: number;
  now: number;
  /** The Home screen is the one being looked at (not another tab, not behind another screen). */
  focused: boolean;
  /** The app is in the foreground. */
  appActive: boolean;
}

/** Whether the carousel should move on by itself right now. */
export function shouldAutoAdvance(state: AutoAdvanceState): boolean {
  return Boolean(state.intervalMs && state.intervalMs > 0) && state.count > 1 && state.focused && state.appActive && state.now >= state.pausedUntil;
}

/** How long automatic movement stays off after a touch: long enough to finish reading, then it carries on. */
export const PAUSE_AFTER_TOUCH_MS = 9000;

/** Whether an item is the one in view and the screen is being looked at. A video plays only then, so nothing off screen uses data or battery. */
export const isTileActive = (tileIndex: number, currentIndex: number, focused: boolean, appActive: boolean) => tileIndex === currentIndex && focused && appActive;
