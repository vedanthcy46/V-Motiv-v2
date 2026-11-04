// Pure layout maths (no react-native imports so it is unit-testable).
export const TAB_BAR_HEIGHT = 64;
export const CONTENT_GAP = 16;
/** Android 3-button navigation height; used when edge-to-edge wrongly reports a 0 inset. */
const ANDROID_ZERO_INSET_FALLBACK = 48;
const IOS_MIN_BOTTOM_OFFSET = 12;

export type Os = 'ios' | 'android' | string;

/**
 * Bottom system inset to trust. Some Android devices report 0 under edge-to-edge even
 * though the navigation buttons are drawn over the app; fall back to the 3-button height.
 */
export function effectiveBottomInset(insetBottom: number, os: Os): number {
  const inset = Math.max(0, Math.round(insetBottom));
  return os === 'android' && inset === 0 ? ANDROID_ZERO_INSET_FALLBACK : inset;
}

/** Bottom padding for sticky footers/content: the effective inset, never below `min`. */
export function safeBottomInset(insetBottom: number, os: Os, min = 0): number {
  return Math.max(effectiveBottomInset(insetBottom, os), min);
}

/** Distance from the screen bottom to the bottom edge of the floating tab bar. */
export function tabBarBottomOffset(insetBottom: number, os: Os): number {
  const floor = os === 'android' ? ANDROID_ZERO_INSET_FALLBACK : IOS_MIN_BOTTOM_OFFSET;
  return Math.max(Math.round(insetBottom) + 8, floor);
}

/** Bottom padding for scrollable content on screens that sit above the tab bar. */
export function tabScreenBottomPadding(insetBottom: number, os: Os): number {
  return tabBarBottomOffset(insetBottom, os) + TAB_BAR_HEIGHT + CONTENT_GAP;
}

/** Bottom padding for stack screens (no tab bar) so content clears the system nav area. */
export function stackScreenBottomPadding(insetBottom: number, os: Os): number {
  return effectiveBottomInset(insetBottom, os) + CONTENT_GAP;
}

/**
 * Maximum height of a bottom sheet: whatever is visible below the status area and above
 * the soft keyboard (0 when hidden), minus a small top gap so the sheet never touches it.
 */
export function sheetMaxHeight(windowHeight: number, insetTop: number, keyboardHeight: number, topGap = 12): number {
  return Math.max(200, Math.round(windowHeight - Math.max(0, insetTop) - Math.max(0, keyboardHeight) - topGap));
}

/**
 * How far a container must be lifted so its bottom edge sits above the keyboard.
 * Both values are in window coordinates. Returns 0 when the window already resized
 * (container bottom is above the keyboard), so the lift can never be applied twice.
 */
export function keyboardOverlap(containerBottom: number, keyboardTop: number): number {
  return Math.max(0, Math.round(containerBottom - keyboardTop));
}

/**
 * Scroll distance (positive = scroll down) needed so a focused input is fully visible
 * above the keyboard. All values are window coordinates. Inputs taller than the visible
 * area are aligned to the top so the caret line stays reachable.
 */
export function scrollDeltaForInput(args: {
  viewTop: number;
  viewBottom: number;
  inputTop: number;
  inputBottom: number;
  margin?: number;
}): number {
  const margin = args.margin ?? 16;
  const visibleHeight = args.viewBottom - args.viewTop;
  const inputHeight = args.inputBottom - args.inputTop;
  if (inputHeight + margin * 2 > visibleHeight) return Math.round(args.inputTop - margin - args.viewTop);
  if (args.inputBottom + margin > args.viewBottom) return Math.round(args.inputBottom + margin - args.viewBottom);
  if (args.inputTop - margin < args.viewTop) return Math.round(args.inputTop - margin - args.viewTop);
  return 0;
}
