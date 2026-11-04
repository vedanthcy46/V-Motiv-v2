// Single source of truth for how screen content clears the floating tab bar,
// the system navigation area and the soft keyboard.
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { stackScreenBottomPadding, tabBarBottomOffset, tabScreenBottomPadding } from './insets-math';

export { TAB_BAR_HEIGHT, CONTENT_GAP } from './insets-math';

/**
 * KeyboardAvoidingView behaviour for every screen. The app is edge-to-edge on Android
 * (`edgeToEdgeEnabled=true`), where the window does not resize for the keyboard, so
 * 'padding' is required on both platforms. 'position' and 'height' shift or clip layouts.
 */
export const KEYBOARD_AVOIDING_BEHAVIOR = 'padding' as const;

/** Bottom offset of the floating tab bar for the current device insets. */
export function useTabBarBottomOffset(): number {
  return tabBarBottomOffset(useSafeAreaInsets().bottom, Platform.OS);
}

/** Dynamic bottom padding for scroll content inside a tab screen. */
export function useTabScreenBottomPadding(): number {
  return tabScreenBottomPadding(useSafeAreaInsets().bottom, Platform.OS);
}

/** Dynamic bottom padding for scroll content inside a stack screen (no tab bar). */
export function useStackScreenBottomPadding(): number {
  return stackScreenBottomPadding(useSafeAreaInsets().bottom, Platform.OS);
}
