// Pure layout maths (no react-native imports so it is unit-testable).
export const TAB_BAR_HEIGHT = 64;
export const CONTENT_GAP = 16;
const ANDROID_MIN_BOTTOM_OFFSET = 48; // 3-button nav can report a 0 inset under edge-to-edge
const IOS_MIN_BOTTOM_OFFSET = 12;

export type Os = 'ios' | 'android' | string;

/** Distance from the screen bottom to the bottom edge of the floating tab bar. */
export function tabBarBottomOffset(insetBottom: number, os: Os): number {
  const floor = os === 'android' ? ANDROID_MIN_BOTTOM_OFFSET : IOS_MIN_BOTTOM_OFFSET;
  return Math.max(Math.round(insetBottom) + 8, floor);
}

/** Bottom padding for scrollable content on screens that sit above the tab bar. */
export function tabScreenBottomPadding(insetBottom: number, os: Os): number {
  return tabBarBottomOffset(insetBottom, os) + TAB_BAR_HEIGHT + CONTENT_GAP;
}

/** Bottom padding for stack screens (no tab bar) so content clears the system nav area. */
export function stackScreenBottomPadding(insetBottom: number, os: Os): number {
  const floor = os === 'android' ? ANDROID_MIN_BOTTOM_OFFSET : 0;
  return Math.max(Math.round(insetBottom), floor) + CONTENT_GAP;
}
