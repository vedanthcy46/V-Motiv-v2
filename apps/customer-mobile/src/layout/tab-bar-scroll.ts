// When the bottom tab bar hides and shows as a list scrolls. Pure (no react-native imports), so it is tested alone.
//
// Scroll down and the bar slides away to give the content room; scroll up and it comes back. It never reacts to the first few pixels of a
// scroll (so a small nudge does not make it flicker), it is always shown at the top of a list, and the springy overscroll at either end of a
// list is ignored so it cannot trigger a change.

/** Within this many pixels of the top the bar is always shown. */
export const TOP_ZONE = 32;
/** The bar hides after this much continuous downward scrolling. */
export const HIDE_AFTER = 16;
/** The bar returns after this much continuous upward scrolling (a little less: coming back should feel quick). */
export const SHOW_AFTER = 10;

export interface ScrollState {
  lastOffset: number;
  /** Scrolling since the direction last changed: positive going down, negative going up. */
  travelled: number;
  visible: boolean;
}

export interface ScrollMetrics {
  /** How far the content has scrolled from the top. */
  offset: number;
  contentHeight: number;
  viewHeight: number;
}

export const initialScrollState = (): ScrollState => ({ lastOffset: 0, travelled: 0, visible: true });

/** The state after the list reports a new scroll position. */
export function nextScrollState(state: ScrollState, metrics: ScrollMetrics): ScrollState {
  const maxOffset = Math.max(0, metrics.contentHeight - metrics.viewHeight);
  // Ignore bounce: pulling down past the top (pull to refresh) counts as the top; bouncing past the end counts as the end.
  const offset = Math.min(Math.max(0, Number.isFinite(metrics.offset) ? metrics.offset : 0), maxOffset);

  // A list too short to scroll, or the top of any list, always shows the bar.
  if (maxOffset <= TOP_ZONE || offset <= TOP_ZONE) return { lastOffset: offset, travelled: 0, visible: true };

  const delta = offset - state.lastOffset;
  if (delta === 0) return { ...state, lastOffset: offset };

  // Distance builds up in one direction; a change of direction starts again from zero.
  const travelled = delta > 0 ? Math.max(0, state.travelled) + delta : Math.min(0, state.travelled) + delta;
  let visible = state.visible;
  if (travelled >= HIDE_AFTER) visible = false;
  else if (-travelled >= SHOW_AFTER) visible = true;
  return { lastOffset: offset, travelled, visible };
}

/** How far the bar must travel down to be completely off screen: its height, its distance from the bottom, and room for its shadow. */
export const hiddenDistance = (barHeight: number, bottomOffset: number, shadow = 32) => Math.round(barHeight + bottomOffset + shadow);
