# Customer Mobile: keyboard and navigation-aware layout

Status: IMPLEMENTED_NOT_VERIFIED on a device. Typecheck clean, 13 mobile unit tests pass (3 new for the layout maths). No emulator/device run was done.

## Evidence (before)
- Android is edge-to-edge (`android/gradle.properties: edgeToEdgeEnabled=true`), where the window is not resized for the keyboard, yet 21 files used `KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'position' | 'height'}`. `position`/`height` shift or clip layouts on Android.
- The floating tab bar (`CustomerNavigator.tsx`) sits at `max(inset + 8, android ? 48 : 12)` with height 64, but tab screens used unrelated literals: Home/Garage `110`, Explore `inset + 84`, Activity/Account `inset + 96`. On a 34pt-inset iPhone the bar top is 106pt up (Home clearance only 4pt); on Android 3-button navigation it is 112pt up (Home/Garage covered by ~2pt).
- `RentalCheckoutScreen` had text inputs in a ScrollView without `keyboardShouldPersistTaps`, so a tap while the keyboard was open only dismissed it.

## Changes
- `src/layout/insets-math.ts`: pure functions `tabBarBottomOffset`, `tabScreenBottomPadding`, `stackScreenBottomPadding` (unit-tested in `insets-math`/`safe-layout.test.ts`).
- `src/layout/safe-layout.ts`: `KEYBOARD_AVOIDING_BEHAVIOR = 'padding'`, hooks `useTabBarBottomOffset`, `useTabScreenBottomPadding`, `useStackScreenBottomPadding`.
- `CustomerNavigator.tsx` positions the tab bar with `useTabBarBottomOffset()`, the same source the screens use, so they cannot drift apart.
- All 21 `KeyboardAvoidingView` sites now use `KEYBOARD_AVOIDING_BEHAVIOR`.
- Home, Garage, Explore, Activity, Account scroll content uses `useTabScreenBottomPadding()` (bar offset + 64 + 16pt gap).
- `RentalCheckoutScreen` ScrollView: `keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="on-drag"`.

## Not changed / follow-ups
- Stack screens with their own sticky footers and `insets.bottom + N` literals (Rental*, Service*, VehicleScreen `100`, InspectorScreen) were left as is; migrate to `useStackScreenBottomPadding()` after device checks.
- `keyboardVerticalOffset` values (12 on iOS) were not re-derived per screen; verify on devices where a header sits above the KeyboardAvoidingView.
- Verify on: iPhone with home indicator, Android gesture nav, Android 3-button nav, small phone (iPhone SE class), large font scale, landscape locked off (`orientation: portrait`).
