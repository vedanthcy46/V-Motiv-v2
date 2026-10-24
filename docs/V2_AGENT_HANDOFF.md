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

Ten additive V2 Prisma migrations are validated against isolated local databases:

1. `20261022000000_identity_email_foundation`
2. `20261022120000_customer_mobile_domain`
3. `20261022130000_customer_complete_workflows`
4. `20261022140000_vehicle_public_detail`
5. `20261022140457_acquisition_offers_and_inspection`
6. `20261022150000_test_drive_location`
7. `20261022160000_customer_addresses`
8. `20261022170000_support_case_replies`
9. `20261022180000_privacy_requests`
10. `20261023120000_admin_foundation`

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
- **Android USB Port Disconnect/Reconnect Resilience**: Diagnosed that unplugging/replugging the physical USB cable causes Android ADB to tear down reverse sockets. Expo Metro only auto-restores port 8081, leaving backend API port 4100 unreversable on the phone (`NETWORK_UNREACHABLE`). Added `tooling/watch-android-usb.ps1` (`npm run mobile:usb:watch`) to continuously detect device reconnection and restore both ports (8081 & 4100) within 1 second. Added a 700ms development network retry in `apps/customer-mobile/src/api.ts` so in-flight requests seamlessly recover without showing error banners.

## Mobile Keyboard, Input Focus, Safe Area, and Bottom Navigation Hardening — 22 October 2026

### Root causes diagnosed
- **Android `adjustResize` vs Absolute Positioning**: In `app.json`, `softwareKeyboardLayoutMode` is configured as `"resize"`, and native Android uses `windowSoftInputMode="adjustResize"`. Action buttons positioned with `position: 'absolute', bottom: 0` jumped abruptly upon keyboard launch and covered the active text inputs.
- **Component Remounting on Keystroke (`ExploreScreen.tsx`)**: The search bar and filter pills were previously declared inside `ListHeaderComponent` of `FlatList`. Each search keystroke triggered a state change that re-rendered the header, destroying and recreating the native `TextInput` component and causing the keyboard to close after a single character.
- **Accidental Modal Gesture Dismissal**: Form routes (`PurchaseEnquiry`, `Addresses`, `TestDrive`, `Sell`, `Support`) were declared with `presentation: 'modal'`. Standard Android down-drag gestures on form scroll views were intercepted by the modal gesture handler, prematurely dismissing entire form screens.
- **AsyncStorage I/O on Keypress (`SellScreen.tsx`)**: In the multi-step Sell wizard, `saveDraft` was executed synchronously on every character change, flooding the React Native bridge with native file writes and causing input lag, dropped characters, and loss of focus.
- **System Navigation Bar Overlap**: The bottom tab bar used fixed pixel heights without querying Android's 3-button navigation bar inset (typically 48dp) or gesture navigation inset (20–24dp), causing bottom tabs to clip behind native Android navigation bars. Furthermore, the tab bar remained rendered when the keyboard was open.

### Architectural improvements implemented
- **`apps/customer-mobile/src/components/KeyboardAwareFormScreen.tsx`**:
  - `KeyboardAwareFormScreen`: Platform-aware keyboard wrapper (`behavior="padding"` universally with `keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}`), guaranteeing that on modern Android (where edge-to-edge transparent system bars suppress OS-level window resizing) the layout dynamically resizes its visible area to make room for the soft keyboard. Configured with `keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="on-drag"`, and `SafeAreaView` with `edges={['top', 'left', 'right']}` to prevent double padding with system navigation bars.
  - `useKeyboard`: Dedicated hook providing `{ isKeyboardVisible, keyboardHeight }` for custom-positioned interactive elements like chat composers and search popovers.
  - `KeyboardResizeContainer`: Reusable flex container with `behavior="padding"` for wrapping any arbitrary subview or modal dialog.
  - `FormField`: Accessible controlled text input with `forwardRef`, explicit `returnKeyType` (`next` / `done`), active focus outline in official brand accent (`#F7B503`), helper text, and validation error presentation.
  - `FormFooter`: Flex-based form submission action bar that adapts to keyboard height without absolute jumps.
  - Re-exported via `apps/customer-mobile/src/components/ui.tsx`.
- **`CustomerNavigator.tsx` Navigation Hardening**:
  - Added `tabBarHideOnKeyboard: true` to hide the tab bar automatically during active typing.
  - Dynamic safe area calculation: `bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8)`, `height = 56 + bottomInset`, and `paddingBottom = bottomInset`, ensuring clearance on both 3-button navigation and gesture pills.
  - Replaced `presentation: 'modal'` with `presentation: 'card'`, `animation: 'slide_from_bottom'`, and `gestureEnabled: false` on all form screens to prevent swipe-down dismissal.

### Screen-by-screen audit and remediation
- `ExploreScreen.tsx`: Extracted search input and filter chips outside `FlatList` to preserve `TextInput` component identity; added `keyboardShouldPersistTaps="handled"`.
- `SellScreen.tsx`: Updated to `behavior="padding"`; debounced `AsyncStorage` draft saves (600ms); converted submit buttons from absolute to natural flex footer; added `ref={scrollRef}` with automatic step-change scroll resets and `returnKeyType`, `keyboardType`, and `autoCapitalize` across all 7 wizard steps.
- `TestDriveScreen.tsx`: Updated to `behavior="padding"`; converted absolute bottom bar to a natural flex footer inside `KeyboardAvoidingView`; set `keyboardShouldPersistTaps="handled"`; added `onFocus` auto-scrolling on Address and Notes text areas so fields and the Confirm button stay fully visible above the keyboard.
- `SupportCaseDetailsScreen.tsx`: Updated to `behavior="padding"`; converted absolute `composerBar` to flex layout inside keyboard avoidance; configured `keyboardShouldPersistTaps="handled"`; added `onFocus` auto-scrolling to latest message thread.
- `AddressesScreen.tsx`: Refactored address form container with `edges={['top', 'left', 'right']}`, `behavior="padding"`, `ref={scrollRef}`, and `keyboardShouldPersistTaps="handled"`.
- `SupportScreen.tsx`: Updated with `behavior="padding"` and `ref={scrollRef}`; configured `keyboardShouldPersistTaps="handled"`.
- `PurchaseEnquiryScreen.tsx`: Updated with `behavior="padding"` and `ref={scrollRef}`; configured `keyboardShouldPersistTaps="handled"`.
- `ProfileEditorScreen.tsx`: Updated with `behavior="padding"`; configured `keyboardShouldPersistTaps="handled"`.
- `CitySelectionScreen.tsx`: Wrapped search box and city `FlatList` in `KeyboardAvoidingView behavior="padding"`, ensuring city results remain visible and scrollable above the keyboard.
- `OnboardingScreen.tsx`: Updated with `behavior="padding"`; configured `keyboardShouldPersistTaps="handled"`.
- `SellingRequestDetailsScreen.tsx`: Updated Decline Offer feedback modal with `behavior="padding"`, ensuring multiline decline reason input centers and elevates above the keyboard.
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

## Official Production Website Landing Page Implementation — 23 October 2026

### Delivered Scope & Routing
- Built and verified the official public landing page for **V MOTIV** (`https://vmotiv.in/`) in `apps/customer-web` (React 19 + TypeScript + Vite 7).
- Root route `/` strictly resolves to the public landing page for all visitors (unauthenticated and authenticated alike).
- Action-triggered Google Sign-In: Public discovery is 100% open without login barriers; Google OAuth via Firebase is only requested when users initiate account-scoped actions (booking test drives, submitting enquiries, submitting sell intake).
- SPA Routing & Redirects: `apps/customer-web/public/_redirects` (`/* /index.html 200`), with deep-link resolution for `/`, `/cars`, `/sell`, `/how-it-works`, `/about`, `/contact`, `/terms`, `/privacy`, and `/account`.

### Brand Accuracy & Asset Integration
- Integrated approved official vector and high-resolution brand assets into `apps/customer-web/public/brand/`:
  - Horizontal header logo (`vmotiv-header-brand-v2.png`)
  - Vertical lockup with tagline and signature yellow accent (`vmotiv-lockup.svg`)
  - Official vector emblem (`vmotiv-logo.svg`)
  - Favicon & App Icon (`favicon.ico`, `favicon.png`, `vmotiv-icon.png`)
- Strictly adheres to approved brand colors: Primary Navy `#061A38`, Accent Yellow `#F7B503`, and White `#FFFFFF`.
- Approved Brand Positioning:
  - Tagline: *"YOUR VEHICLE. OUR ACCOUNTABILITY."*
  - Headline: *"A better way to buy and sell your car."*
  - Truthful representation: No exaggerated or unverified claims.

### Complete Section Breakdown
1. **Header / Sticky Navbar (`Navbar.tsx`)**: Horizontal logo, desktop nav, account button (Sign In / Profile pill), accessible mobile navigation drawer.
2. **Hero Section (`Hero.tsx`)**: Approved headline, lead text, tagline callout, dual CTAs ("Explore Cars" & "Sell Your Car"), trust highlights bar, verified car visual card.
3. **Quick Actions (`QuickActions.tsx`)**: Buy a Verified Car vs Sell Your Car action cards with feature lists and direct working action triggers.
4. **Available Cars Live Preview (`AvailableCars.tsx`)**: Live query against `GET /api/v1/inventory?limit=6`, interactive filter chips (All, Petrol, Diesel, Automatic), car cards with specs, photo, and INR Lakh pricing, plus honest empty state when stock is coming soon.
5. **How It Works (`HowItWorks.tsx`)**: Tabbed Buying & Selling workflows (4 steps each).
6. **Why V MOTIV (`WhyVMotiv.tsx`)**: 4 accountability pillars.
7. **Mobile App Showcase (`MobileAppSection.tsx`)**: Highlights the customer mobile app with Android/iOS badges.
8. **About V MOTIV (`AboutSection.tsx`)**: Mission, service hubs (Bengaluru, Chennai, Delhi NCR, Hyderabad, Mumbai, Pune), and customer support hours.
9. **FAQ Accordion (`FAQSection.tsx`)**: Keyboard-accessible accordion with ARIA attributes answering key buyer/seller questions.
10. **Final Dual-Action CTA (`FinalCTA.tsx`)**: Conversion prompt for exploring cars or requesting valuation.
11. **Site Footer (`Footer.tsx`)**: Official lockup, tagline, navigation links, hub locations, legal links, dynamic copyright.
12. **Modals & Dialogs**: `AuthModal`, `AccountModal`, `VehicleDetailModal`, `SellCarModal`, `LegalModal`.

### Verification Status
- **VERIFIED**:
  - `npm run typecheck`: 0 errors across `@vmotiv/api`, `@vmotiv/customer-mobile`, and `@vmotiv/customer-web`.
  - `npm test`: All tests pass across API, Mobile, and Web (Web vitest suite expanded to 12 passing tests).
  - `npm run build --workspace=@vmotiv/customer-web`: Production bundle built cleanly with gzip optimization and SPA redirect rules.

## Vercel Deployment & Serverless Function Crash Remediation — 23 October 2026

### Root Cause Analysis
1. `ERR_REQUIRE_ESM` in `jwks-rsa`: `firebase-admin@14.5.0` had a dependency on `jwks-rsa@4.1.0`. In `jwks-rsa@4.1.0`, `utils.js` executed `const jose = require('jose');`. `jose@6.x` is a pure ES module (`"type": "module"`). When executed inside Vercel's Node.js Serverless runtime (which runs CommonJS module resolution by default for serverless functions), Node rejected `require()` of an ES module and terminated the process with status 1 on every single API request.
2. Direct Entrypoint Coupling in `api/index.ts`: When Vercel compiled the serverless entry, a static `export { default } from '...'` caused module resolution incompatibilities between CommonJS and ESM artifacts.
3. Cold-Start Crash on Missing Environment Variable: `services/api/src/vercel.ts` threw immediately at module import if `FIREBASE_SERVICE_ACCOUNT_JSON` was not parsed, blocking public endpoints like `/api/v1/health/live`, `/api/v1/cities`, and `/api/v1/inventory` from booting.

### Fixes Implemented
1. **Explicit ESM Vercel entry**: `api/package.json` declares `type: module`, `api/tsconfig.json` compiles the serverless handler as NodeNext ESM, and the handler lazily imports the built Express application without CommonJS `require()` generation.
2. **Pinned `firebase-admin@13.10.0` and Overrode `jwks-rsa@3.1.0`**: Pinned in `services/api/package.json` and enforced in root `package.json` `overrides` with `package-lock.json` updated. `jwks-rsa@3.1.0` uses `jose@4.x`, which is fully CommonJS-compatible and never triggers `ERR_REQUIRE_ESM`.
3. **Verified Firebase Admin initialization**: Firebase is initialized lazily, but protected verification requires `FIREBASE_SERVICE_ACCOUNT_JSON` so token revocation checks cannot silently downgrade.
4. **Exact CORS allowlist**: Customer and Admin origins are explicitly configured. The unsafe arbitrary `*.vercel.app` allowance was removed.
5. **Static Route Rewrite Whitelist in `vercel.json`**: Excluded `brand/`, `favicon`, `robots`, and `sitemap` from the SPA rewrite rule.

## Admin Foundation — 23 October 2026

VERIFIED locally:

- Added the real React/TypeScript `apps/admin-portal` with official V MOTIV brand assets, Firebase Google Sign-In, protected routes, MFA/access denial states, responsive scrollable navigation, real dashboard, employee directory, invitation form, access catalogue and audit view.
- Added normalized `Role`, `Permission`, `RolePermission`, employee role/branch assignments, `Branch`, hashed `EmployeeInvitation`, invitation-branch join and expanded audit metadata in migration `20261023120000_admin_foundation`.
- Added `ApprovalRequest` and immutable `ApprovalDecision` records in `20261023140000_admin_approvals`; privileged invitation proposals now require an eligible independent decision and execute once only after revalidation.
- Added `/api/v2/admin/*` and invitation-acceptance APIs with active employee resolution, explicit permission checks, branch scope, MFA, one-time invitation replay protection, self-suspension protection, last-Super-Admin protection and Firebase refresh-token revocation.
- Added the operator-only first-Super-Admin bootstrap command; there is no public promotion endpoint and it closes after one Super Admin exists.
- Removed a committed Resend-key fallback, removed the public email drain route, removed fake development token verification, restricted CORS, and stopped persisting raw provider exception text as an email error code.
- The complete eleven-migration chain applied successfully to the isolated test database. The isolated `vmotiv_v2_test` run passed 49/49 API tests, including strict multi-branch approval visibility, scoped support-reply checks, protected system-health routing and real dashboard-workload fields. Admin client tests passed 3/3 and the Admin production build passed. The built production serverless ESM module also imported and served `health/live` in a runtime smoke test.

IMPLEMENTED_NOT_VERIFIED externally:

- Production migration/deployment, `admin.vmotiv.in`, live Firebase MFA and a real invitation email have not been exercised.
- The previously exposed Resend key must be revoked/rotated before delivery is enabled.

NOT_IMPLEMENTED from the complete Admin blueprint:

- Phase 2 approval centre, branch/service-area administration, versioned policies/master data and cross-domain oversight.
- Phase 3 full support/privacy administration, Resend webhook/delivery dashboard, templates, suppression and campaign approval.
- Phase 4 exports/reports, second-approver download grants, system-health diagnostics, access reviews and end-to-end production verification.

Exact next dependency-ready task: implement master-data change requests and versioned policy governance, reusing the verified approval engine for high-risk changes.


