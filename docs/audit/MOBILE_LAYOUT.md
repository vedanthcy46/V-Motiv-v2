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

## Second pass (stack screens)
- `safeBottom(insets.bottom, min)` (in `safe-layout.ts`, maths in `insets-math.ts`) replaced every `Math.max(insets.bottom, N)` and `insets.bottom + N` in 27 screens/components (sticky footers, scroll content, modals). On Android a reported inset of 0 now falls back to 48 (3-button height); other insets and each site's existing minimum are unchanged. The only remaining raw use is arithmetic for the sidebar trigger position (`AppSidebar.tsx`).
- CitySelection, MarketingPreferences, PrivacySettings and ProfileEditor scrolled to the screen bottom with no bottom inset (their `SafeAreaView` excludes the bottom edge), so the last item could sit under the navigation buttons. They now use `useStackScreenBottomPadding()`.
- `keyboardVerticalOffset`: no change needed. React Native's `KeyboardAvoidingView` computes overlap as `frame.y + frame.height - (keyboard.screenY - offset)` with `frame.y` relative to its parent; every screen here has `headerShown: false` and a parent at the screen top, so the offset is not a header compensation. The existing 12pt on iOS only adds a small gap above the keyboard.
- Tests: 15 mobile tests pass (5 layout tests), typecheck clean.

## Remaining
- Verify on: iPhone with home indicator, Android gesture nav, Android 3-button nav, small phone (iPhone SE class), large font scale, landscape locked off (`orientation: portrait`).

## Third pass: Service Request Details and shared keyboard/sheet primitives
Root causes found in `ServiceRequestDetailsScreen.tsx` (code inspection, not device-measured):
- The main scroll view had no bottom padding, so the last action (Cancel Service Request) sat under the navigation buttons.
- Its three modals were bottom sheets anchored under the keyboard with no `KeyboardAvoidingView`; they only added padding inside the scroll area (`sheetBottomInset + keyboardHeight`) and a `scrollToEnd` hack, so the sheet kept its full height and its actions stayed covered; `automaticallyAdjustKeyboardInsets` is iOS only.

Fixes:
- `components/KeyboardAwareSheet.tsx`: one sheet for all such modals. Lifts above the keyboard, `maxHeight` shrinks with the keyboard (`sheetMaxHeight`), header and action footer pinned, body scrolls, footer clears the nav buttons via `safeBottom`. The three Service Request modals (estimate review, cancel, pay balance) use it; the main scroll has dynamic bottom padding.
- `components/KeyboardAvoider.tsx`: the single keyboard container for all 21 screens/components that used `KeyboardAvoidingView` (iOS: RN `padding`; Android edge-to-edge: measures the real overlap with the keyboard and pads by exactly that, 0 if the window already resized, so no double lift).
- Removed five manual Android `marginBottom/paddingBottom: keyboardHeight` hacks (MyGarage x2, SellingRequestDetails x2, Inspector) that would have doubled the shared lift. Their sheet-height calculations (which shrink with the keyboard) were kept.
- Tests: 17 pass (new: `sheetMaxHeight`, `keyboardOverlap`). Typecheck clean.

Rule for every screen: root inside `KeyboardAvoider`; scroll content `keyboardShouldPersistTaps="handled"`; bottom padding from `safeBottom` / `useTabScreenBottomPadding` / `useStackScreenBottomPadding`; modals with inputs use `KeyboardAwareSheet` (existing hand-built sheets in MyGarage, RentalBookingDetails, SellingRequestDetails, Inspector keep their own layout but now share the same keyboard container).

Not verified on a device. The Android overlap path is the riskiest change: if a keyboard still covers an input on a real Android device, capture the device, OS version and navigation mode.
