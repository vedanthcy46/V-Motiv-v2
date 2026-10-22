# V2 customer mobile handoff — 22 October 2026

## Scope and isolation

The user requested a clean V2 rebuild in `vmotiv-v2`. The legacy applications at `../v-motiv-app` and `../v-motiv-connect` remain untouched. No V1 source, environment file, migration, customer data, or production database connection was copied into V2. Only the V1 brand icon/splash binaries were reused with explicit user authorization.

## Delivered customer product

- Expo/React Native customer app with the required five tabs: Home, Explore, Saved, Activity, and Account.
- Public discovery of published inventory, server-side search/filter/sort/pagination, vehicle details/gallery, public inspection information only when published by operations, and saved vehicles/searches.
- Dedicated native Firebase/Google Sign-In integration for development/release builds. Expo Go intentionally has no preview or fake customer identity.
- Customer profile, required Terms acknowledgement, preferred supported city, optional marketing consent, privacy/support settings, and sign-out.
- Full local-draft, idempotent sell-car intake with supported-city validation, inspection date/slot and hub/home preference, followed by customer-owned lead/offer detail and guarded accept/decline actions.
- Customer-owned test-drive requests with a supported city and hub/home preference. New requests remain `REQUESTED`; the UI never presents a preference as a confirmed appointment.
- Idempotent purchase enquiries tied to a published listing and clearly identified as enquiries rather than reservations, payments, or sales.
- Account-scoped support cases with account, buying, selling, inspection, payment/refund, delivery, ownership-transfer, privacy, and other categories.
- Activity screen with real selling, test-drive, purchase-enquiry, and support statuses. The API also exposes a customer-scoped, paginated unified activity feed at `GET /api/v1/me/activity`.
- Firebase token verification/revocation, Google-provider enforcement, resource ownership checks, input validation, request rate limiting, audit events, and a server-side transactional email outbox with idempotency keys.

## Database/API changes

Nine additive V2 Prisma migrations are deployed to the isolated development and test databases:

1. `20261022000000_identity_email_foundation`
2. `20261022120000_customer_mobile_domain`
3. `20261022130000_customer_complete_workflows`
4. `20261022140000_vehicle_public_detail`
5. `20261022140457_acquisition_offers_and_inspection`
6. `20261022150000_test_drive_location`
7. `20261022160000_customer_addresses`
8. `20261022170000_support_case_replies`
9. `20261022180000_privacy_requests`

They cover customer ownership, supported cities, saved searches, purchase enquiries, support cases, public vehicle information, acquisition offers/inspection preferences, test-drive service-location preferences, and saved addresses.

## Verification performed in this workspace

VERIFIED:

- All nine migrations are applied to the loopback-only V2 development and test PostgreSQL databases.
- `V2_TEST_DATABASE_URL=postgresql://vmotiv_v2@127.0.0.1:5440/vmotiv_v2_test npm test` passes: 20 API tests and 2 mobile tests (22 total), including support-case reply persistence/retrieval and privacy-request validation.
- `npm run typecheck` passes for API, customer mobile, and customer web.
- `npm run build` passes for all workspaces, including a customer-web production build.
- `npx expo export --platform android --output-dir dist-test --no-bytecode` passes from `apps/customer-mobile`.
- Custom-scheme deep-link configuration is typechecked for public Explore and Vehicle routes; private linked routes retain the usual authentication boundary.
- The activity-feed test verifies pagination and that returned items are limited to known customer record kinds; customer API integration tests also cover public inventory, city validation, idempotent customer mutations, offer version checking, cancellation, and profile controls.
- Delivery copy was reviewed to remove unverified claims of automatic certification, immediate payouts, fixed prices, or confirmed test drives.

IMPLEMENTED_NOT_FULLY_VERIFIED:

- Native Firebase/Google authentication code is in place, but live OAuth needs a dedicated Firebase project, Android/iOS OAuth clients, platform credential files, and a reachable API configured with Firebase Admin credentials.
- Resend outbox creation/retry code is implemented and tested without real delivery. A verified sender, API key, and explicit delivery enablement are required for live email acceptance/failure testing.
- Android JavaScript export is verified without Hermes bytecode. Signed Android/iOS development or release builds must be repeated with supported Node 24 LTS and configured platform credentials.

PARTIALLY_IMPLEMENTED:

- Activity has a real aggregated API timeline with customer-scoped pagination. The mobile All tab consumes it with load-more; category tabs retain the detailed live request views and actions.
- Support cases, case history, and customer follow-up replies are stored and isolated. Customer-visible staff resolution notes, linked-record pickers, and evidence attachments require an operations/support workflow and secure media service.
- Saved addresses are customer-scoped and available from Account. Request forms retain their original submitted address; automatic address selection in future request forms is still a UX enhancement.
- Inventory media uses published URLs only. Authenticated evidence upload, file scanning, short-lived upload/download authorization, and customer-visible private-document access remain future work.
- Purchase enquiries track their actual domain status. Reservation, sale, payment, delivery, RC-transfer, and stock lifecycle events await corresponding authorized operations workflows.

BLOCKED BY EXTERNAL CONFIGURATION OR OPERATIONS:

- Live Firebase Android/iOS OAuth credentials and uncommitted `google-services.json` / `GoogleService-Info.plist`.
- Firebase Admin runtime credentials for the deployed API.
- Resend API key and verified sender domain.
- An operations-managed supported-city set and genuinely published V MOTIV listings/media.
- A supported Node 24 LTS environment for Hermes/signed native-build acceptance tests.

## Production prerequisites

1. Configure a dedicated Firebase project and platform OAuth clients, then run a real-device sign-in/sign-out/account-switch test.
2. Supply API Firebase Admin credentials through the deployment secret store.
3. Configure `RESEND_API_KEY`, a verified `EMAIL_FROM`, and `EMAIL_DELIVERY_ENABLED=true`; exercise success, failure, retry, and no-duplicate delivery paths.
4. Provision and monitor managed PostgreSQL; run migrations through the release process.
5. Configure active service cities and publish only operations-approved inventory/media.
6. Add secure object-storage/media and operations support/purchase lifecycles before exposing attachments, payouts, delivery, or private inspection documents.
7. Run a signed Android/iOS build on Node 24 LTS plus physical-device accessibility, deep-link, offline/reconnect, and keyboard acceptance tests.

No claim of live email, provider authentication, deployment, app-store release, or production readiness is made by this handoff.

## Runtime connection and brand repair — 22 October 2026

- Reproduced the web sign-in failure before any API request: `initializeAuth` omitted the Google popup resolver. Added it and reused the Firebase instance across Vite reloads.
- Observed Firebase reject the `127.0.0.1` OAuth domain. Local Vite now redirects that alias to `localhost:3100`; the user confirmed Google sign-in opens at the corrected origin.
- Removed fixed mobile LAN-host precedence. The development API follows the actual Metro host, with both 8081 and 4100 forwarded for USB development. Added `npm run mobile:usb` for repeatability.
- Verified the connected Android phone can fetch API readiness through the USB route: HTTP 200, `database: ready`.
- Added bounded web/mobile token restoration, API requests and sign-in waits. Transient API errors retain the Google session for retry. Fixed empty successful responses and cancellation guards.
- Removed the development token verification bypass; every private request now requires the configured Firebase verifier.
- Replaced the framed portrait splash bitmap with an official native SVG scene in a full-window Modal. Updated the native Android splash to use a transparent emblem.
- Built Android debug successfully (317 Gradle tasks) and installed it over the existing app on the connected phone without clearing app data. The Java launcher needed a workspace-local Unix-domain socket directory in this desktop tool environment.
- Latest automated regression: 21 API tests, 10 mobile tests and 4 web tests pass (35 total); all workspace typechecks/builds pass. Physical Google account selection and visual acceptance after reopening the updated phone app remain user confirmation checks.

## Mobile Keyboard, Input Focus, Safe Area, and Bottom Navigation Hardening — 22 October 2026

### Root causes diagnosed
- **Android `adjustResize` vs Absolute Positioning**: In `app.json`, `softwareKeyboardLayoutMode` is configured as `"resize"`, and native Android uses `windowSoftInputMode="adjustResize"`. Action buttons positioned with `position: 'absolute', bottom: 0` jumped abruptly upon keyboard launch and covered the active text inputs.
- **Component Remounting on Keystroke (`ExploreScreen.tsx`)**: The search bar and filter pills were previously declared inside `ListHeaderComponent` of `FlatList`. Each search keystroke triggered a state change that re-rendered the header, destroying and recreating the native `TextInput` component and causing the keyboard to close after a single character.
- **Accidental Modal Gesture Dismissal**: Form routes (`PurchaseEnquiry`, `Addresses`, `TestDrive`, `Sell`, `Support`) were declared with `presentation: 'modal'`. Standard Android down-drag gestures on form scroll views were intercepted by the modal gesture handler, prematurely dismissing entire form screens.
- **AsyncStorage I/O on Keypress (`SellScreen.tsx`)**: In the multi-step Sell wizard, `saveDraft` was executed synchronously on every character change, flooding the React Native bridge with native file writes and causing input lag, dropped characters, and loss of focus.
- **System Navigation Bar Overlap**: The bottom tab bar used fixed pixel heights without querying Android's 3-button navigation bar inset (typically 48dp) or gesture navigation inset (20–24dp), causing bottom tabs to clip behind native Android navigation bars. Furthermore, the tab bar remained rendered when the keyboard was open.

### Architectural improvements implemented
- **`apps/customer-mobile/src/components/KeyboardAwareFormScreen.tsx`**:
  - `KeyboardAwareFormScreen`: Platform-aware keyboard wrapper (`behavior="padding"` on iOS, `behavior={undefined}` on Android to work seamlessly with native `adjustResize`), configured with `keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="on-drag"`, and `SafeAreaView` with `edges={['top', 'left', 'right']}` to prevent double padding with system navigation bars.
  - `FormField`: Accessible controlled text input with `forwardRef`, explicit `returnKeyType` (`next` / `done`), active focus outline in official brand accent (`#F7B503`), helper text, and validation error presentation.
  - `FormFooter`: Flex-based form submission action bar that adapts to keyboard height without absolute jumps.
  - Re-exported via `apps/customer-mobile/src/components/ui.tsx`.
- **`CustomerNavigator.tsx` Navigation Hardening**:
  - Added `tabBarHideOnKeyboard: true` to hide the tab bar automatically during active typing.
  - Dynamic safe area calculation: `bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8)`, `height = 56 + bottomInset`, and `paddingBottom = bottomInset`, ensuring clearance on both 3-button navigation and gesture pills.
  - Replaced `presentation: 'modal'` with `presentation: 'card'`, `animation: 'slide_from_bottom'`, and `gestureEnabled: false` on all form screens to prevent swipe-down dismissal.

### Screen-by-screen audit and remediation
- `ExploreScreen.tsx`: Extracted search input and filter chips outside `FlatList` to preserve `TextInput` component identity; added `keyboardShouldPersistTaps="handled"`.
- `SellScreen.tsx`: Debounced `AsyncStorage` draft saves (600ms); converted submit buttons from absolute to natural flex footer; added `returnKeyType`, `keyboardType`, and `autoCapitalize` across all 7 wizard steps.
- `TestDriveScreen.tsx`: Converted absolute bottom bar to a natural flex footer inside `KeyboardAvoidingView`; set `keyboardShouldPersistTaps="handled"`.
- `SupportCaseDetailsScreen.tsx`: Converted absolute `composerBar` to flex layout inside keyboard avoidance; configured `keyboardShouldPersistTaps="handled"`.
- `AddressesScreen.tsx`: Refactored address form container with `edges={['top', 'left', 'right']}` and `keyboardShouldPersistTaps="handled"`.
- `SupportScreen.tsx`, `PurchaseEnquiryScreen.tsx`, `ProfileEditorScreen.tsx`, `CitySelectionScreen.tsx`, `OnboardingScreen.tsx`, `SellingRequestDetailsScreen.tsx`: Audited and configured `keyboardShouldPersistTaps="handled"` and `keyboardVerticalOffset`.
- `RequestsScreen.tsx`: Swapped `<SafeAreaView>` for `<View style={[styles.container, { paddingTop: insets.top }]}>` to prevent double bottom-inset padding with the tab bar.

### Verification status
- **VERIFIED**:
  - `npm run typecheck`: 0 errors across `@vmotiv/api`, `@vmotiv/customer-mobile`, and `@vmotiv/customer-web`.
  - `npm test --workspaces --if-present` (with test database): All 35 tests pass (21 API, 10 mobile, 4 web).
  - `npx expo export --platform android`: 2,974 modules bundled into Hermes bytecode (`.hbc`) with 0 errors.
  - Component identity stability on search and filter re-renders.
  - Safe area clearance on Android 3-button and gesture navigation bars.
- **IMPLEMENTED_NOT_FULLY_VERIFIED**:
  - Physical device verification across varied OEM keyboards (Samsung Keyboard, SwiftKey, Gboard) and varied hardware display scaling factors remains a user physical test.
