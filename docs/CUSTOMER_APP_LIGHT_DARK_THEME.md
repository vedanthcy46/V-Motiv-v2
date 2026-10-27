# V MOTIV V2 — Customer Mobile App Light & Dark Mode Implementation Guide

## 1. Executive Summary
This document outlines the complete Light Mode and Dark Mode implementation for the V MOTIV V2 Customer Mobile App. The entire application now supports full theme switching, from root navigation and system overlays to individual buttons and form inputs.

---

## 2. Setting User Appearance

Appearance preferences are exposed in [`apps/customer-mobile/src/screens/AccountScreen.tsx`](file:///apps/customer-mobile/src/screens/AccountScreen.tsx) under the **Appearance & Display** preference section.

### 2.1 Available Options
1. **System Default**: Automatically tracks iOS or Android system light/dark mode changes in real time.
2. **Light Mode**: Forces crisp light appearance across all screens.
3. **Dark Mode**: Forces immersive automotive dark appearance across all screens.

### 2.2 Storage & Hydration
- **Storage Layer**: `AsyncStorage.getItem('vmotiv.v2.theme-preference')`
- **Default Value**: `'system'`
- **Hydration Flow**:
  1. App initializes with system color scheme (`useColorScheme()`).
  2. Stored user selection hydrates within milliseconds.
  3. No screen flash or blank unstyled content occurs.

---

## 3. Brand Identity & Logo Adaptation

The V MOTIV logo is governed by the vector curves extracted from official vector source files (`official-logo-paths.ts`).

### 3.1 Adaptive Vector Behavior
In [`apps/customer-mobile/src/components/BrandLogo.tsx`](file:///apps/customer-mobile/src/components/BrandLogo.tsx):
- **Yellow Accent Arm (`PATH_YELLOW_ARM`)**: Constant `#F7B503` across both Light and Dark modes.
- **Main Body & Roof (`PATH_WHITE_BODY`, `PATH_CAR_ROOF`)**:
  - In **Dark Mode**: Fills with crisp `#FFFFFF` against dark background canvas.
  - In **Light Mode**: Fills with official `#061A38` (V MOTIV Navy) against white/light canvas.
- **Wordmark (`PATH_EXACT_WORDMARK`)**:
  - In **Dark Mode**: Crisp `#FFFFFF`.
  - In **Light Mode**: Deep `#061A38`.

---

## 4. Screen-by-Screen Implementation Checklist

All 19 customer screens have been refactored to consume dynamic theme tokens:

| Screen Name | File Path | Theming Completed | Dynamic Elements |
| :--- | :--- | :---: | :--- |
| **Home** | `src/screens/HomeScreen.tsx` | ✓ | Greeting banner, quick action tiles, brand badges, car showcase cards |
| **Explore** | `src/screens/ExploreScreen.tsx` | ✓ | Search bar, filter chips, active price chips, vehicle list |
| **Sell Car** | `src/screens/SellScreen.tsx` | ✓ | 7-step wizard, make logos, year scroller, fuel/transmission chips, colour swatches, quote cards |
| **Requests / Activity** | `src/screens/RequestsScreen.tsx`| ✓ | Segment tabs, test-drive cards, selling request tracking, enquiry list |
| **Account** | `src/screens/AccountScreen.tsx` | ✓ | User identity card, appearance selector (System/Light/Dark), menu rows |
| **Wishlist** | `src/screens/WishlistScreen.tsx` | ✓ | Empty states, saved vehicles, quick remove buttons |
| **Vehicle Details** | `src/screens/VehicleScreen.tsx` | ✓ | Gallery trigger, specs grid, 180-pt inspection banner, enquiry & test drive CTAs |
| **Selling Request Details** | `src/screens/SellingRequestDetailsScreen.tsx` | ✓ | Status timeline dots, active offer highlight banner, cancellation modals |
| **Support / Concierge** | `src/screens/SupportScreen.tsx` | ✓ | Case tabs, category selection pills, input textareas, history cards |
| **Support Case Details** | `src/screens/SupportCaseDetailsScreen.tsx`| ✓ | Conversation chat bubbles (user vs agent), status pill, message composer |
| **Book Test Drive** | `src/screens/TestDriveScreen.tsx`| ✓ | 7-day date selector, time slot chips, hub/doorstep selector, address card |
| **Purchase Enquiry** | `src/screens/PurchaseEnquiryScreen.tsx`| ✓ | Quick topic suggestion chips, enquiry textarea, vehicle summary card |
| **Profile Editor** | `src/screens/ProfileEditorScreen.tsx` | ✓ | Disabled Google email field, editable phone & name, save action |
| **Addresses** | `src/screens/AddressesScreen.tsx` | ✓ | Preset label chips (Home/Office/Other), address creation form, saved cards |
| **City Selection** | `src/screens/CitySelectionScreen.tsx` | ✓ | City search input, supported location rows, active checkmark |
| **Marketing Preferences**| `src/screens/MarketingPreferencesScreen.tsx`| ✓ | Consent toggle switch, transactional notification disclaimer card |
| **Privacy & Terms** | `src/screens/PrivacySettingsScreen.tsx`| ✓ | Data access & deletion review triggers, Terms version card |
| **Inspection Highlights**| `src/screens/InspectionHighlightsScreen.tsx`| ✓ | 180-pt inspection checklist, condition summary, tags |
| **Auth Screen** | `src/screens/AuthScreen.tsx` | ✓ | Brand lockup, Google sign-in button, MFA OTP input, checkpoints list |

---

## 5. Header, Top Bar & Status Bar Light Friendly Audit

All top navigation bars and status bars throughout the application have been audited and updated to respect the active color scheme:

1. **Light Friendly Surfaces**: In Light Mode, all top bars (`HomeScreen`, `AccountScreen`, `RequestsScreen`, `WishlistScreen`, `SellScreen`, `KeyboardAwareFormScreen`) utilize `theme.colors.surface` (`#FFFFFF`) with a subtle `borderBottomColor: theme.colors.border`. They no longer render in dark navy in light mode.
2. **Safe Area Inset Handling**: All top bars incorporate `paddingTop: insets.top + space.sm`, preventing content from attaching directly to the physical status bar or notch. When rendered inside tab screens, `AuthScreen` accepts `includeTopInset={false}` to avoid double-inset padding.
3. **Adaptive Brand Logos & Controls**: In Light Mode, header BrandLogos dynamically use `bodyColor: theme.colors.brandNavy`, while navigation icons and action buttons adapt to `theme.colors.textPrimary` and `theme.colors.textMuted`.
4. **Native Status Bar**: Configured with dual support:
   - `expo-status-bar` style sets `light` (white icons on dark surface) or `dark` (dark icons on light surface).
   - React Native `NativeStatusBar` manages `backgroundColor={theme.colors.surface}` and `translucent={Platform.OS === 'android'}` so that Android window chrome renders seamlessly in light mode.

---

## 6. Inspector Mobile App Theming & Google MFA Support

### 6.1 Inspector Mobile Theming Refactor (`InspectorScreen.tsx`)
The Inspector workspace (`apps/customer-mobile/src/screens/InspectorScreen.tsx`) has been refactored to align with the Customer Mobile design system:
1. **Dynamic Style Adapter**: Replaced static module-level theme imports with `createStyles(color, isDark)` memoized via `useMemo`.
2. **Dynamic Top Headers**: `mainHeader`, `workspaceHeader`, and `tabsContainer` now render dynamically using `color.headerBg` (`#FFFFFF` in light mode, `#112744` in dark mode).
3. **One-Touch Theme Toggle**: An interactive Sun/Moon theme toggle button is included directly in the inspector top action bar beside notifications and mode switcher, allowing inspectors to switch between Light and Dark mode seamlessly in high-sunlight or low-light environments.
4. **Adaptive Evaluation Workspace**: All 16 inspection sections, defect registers, photo slots, dynamic road-test questionnaires, and modal sheets adapt their surface cards, inputs, borders, and text contrasts according to the current theme.

### 6.2 Firebase Google Sign-In Multi-Factor Authentication (MFA)
In `apps/customer-mobile/src/auth/AuthProvider.tsx`:
1. **Error Interception**: Caught `auth/multi-factor-auth-required` before treating it as an unhandled Google Sign-In failure.
2. **Resolver Extraction**: Added `extractResolver(authModule, error)` to safely extract multi-factor resolvers and enrolled hints from `@react-native-firebase/auth` or fallback session tokens across CommonJS/ESM interop.
3. **Smooth Challenge Transition**: Users with MFA enabled on their Google/Firebase accounts are automatically guided into the two-factor phone/SMS OTP verification prompt without getting stranded.
