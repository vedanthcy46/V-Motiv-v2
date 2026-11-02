# V MOTIV V2 — Verified Agent Handoff

> Valuation-engine update (2026-10-30): the platform now has a data-gated valuation foundation and safe offer boundary. It does **not** yet have an approved market dataset or pricing policy, so no live numeric seller estimate is enabled. See `VALUATION_ENGINE_ARCHITECTURE.md` for the verified gap matrix and next implementation order.

Date: `2026-10-28`  
Branch: `master`  
Platform Status: **ALL 3 CORE MODULES COMPLETE & PRODUCTION READY**  
1. **Part 1**: Car Service & My Garage Expansion  
2. **Part 2**: Complete Advance Car Rental Platform  
3. **Part 3**: V MOTIV Connect™ Zero-Knowledge QR Integration & Complete Platform Hardening  

---

## 1. VERIFIED & COMPLETE

### A. Inspector Mobile App (`apps/inspector-mobile`)
- Dedicated Android-first mobile application (Package: `in.vmotiv.inspector`).
- Utilitarian, high-contrast, official V MOTIV Navy `#061A38` and Yellow `#F7B503` branding.
- Admin-managed Firebase Google Sign-In with employee role (`INSPECTOR`) and branch access validation.
- Full inspection workspace:
  1. **Assignments View**: Today's jobs, schedule dates, location, instructions, and unread badges.
  2. **Vehicle Identity**: Registration plate, VIN/chassis, odometer (km), RC verification, insurance verification, loan declaration.
  3. **Guided Photo Evidence**: 14 structured photo slots with preview and local caching.
  4. **16-Section Checklist Engine**: 50+ itemized checks, conditional fuel evaluation (ICE vs EV/Hybrid).
  5. **Defect Register**: Category, severity (`MINOR`, `MODERATE`, `MAJOR`, `CRITICAL`), description, and component location.
  6. **Road Test**: Performed yes/no, observations, or mandatory documented reason when not performed.
  7. **Review & Declaration**: Completeness audit, declaration confirmation, offline draft saving, and sealed submission.
- Durable offline sync in `offline-sync.ts`: Local draft queue and media queue in AsyncStorage with automatic flushing on reconnect.
- Typecheck: Passed with 0 errors (`tsc --noEmit`).

### B. Independent Inspection Review Portal (`apps/inspection-review-portal`)
- Web review workspace (`https://ops.vmotiv.in/inspections/review` or `http://localhost:3400`).
- Review Queue with search, urgency badges, defect and photo counts.
- Detailed Evaluation Workspace with identity comparison, checklist verification, defect register, authenticated photo streaming (`/reports/:id/media/:mediaId/content`), and revision comparison diffs.
- Code-enforced prevention of self-approval.
- Build: Passed with 0 errors (`vite build` in 1.39s).

### C. Shared Backend API (`services/api`)
- Full REST endpoints in `services/api/src/inspection-router.ts`:
  - `/api/v2/inspector/*`
  - `/api/v2/inspection-review/*`
  - `/api/v2/operations/*`
- `InspectionMediaService` in `services/api/src/inspection-media.ts` with SHA-256 hash calculation and authenticated streaming.
- Operations scheduling & assignment APIs.
- Sales portal integration (`inspectionSummary` returns latest approved evaluation summary).
- Automated tests: Passing across full lifecycle.

### D. Customer Mobile App Light & Dark Theme System (`apps/customer-mobile`)
- **Package**: `in.vmotiv.customer`
- **Unified Design Tokens**: Full semantic palette in `src/theme.ts` supporting `lightColors`, `darkColors`, and dynamic system appearance via `useColorScheme()`.
- **Preference Persistence**: User selection stored under `vmotiv.v2.theme-preference` in `AsyncStorage` (`SYSTEM`, `LIGHT`, `DARK`) in `AccountScreen`.
- **Adaptive Vector Brand Logo**: `BrandLogo.tsx` dynamically applies `#FFFFFF` body in dark mode and `#061A38` (V MOTIV Navy) in light mode.
- **Top Bar & Status Bar Light-Friendly Refactor**: Eliminated hardcoded navy backgrounds in Light Mode across all screens.
- **Accessibility & Contrast**: Verified WCAG 2.1 AA (4.5:1 text, 3:1 UI controls), 48dp minimum touch targets.

### E. Google Sign-In Multi-Factor Authentication & Inspector Mobile Theming
- **Firebase Google Sign-In MFA Handling** (`apps/customer-mobile/src/auth/AuthProvider.tsx`): Automated transition to OTP challenge verification modal (`session.setMfaChallenge`).
- **Inspector Mobile Light & Dark Theme Overhaul** (`apps/customer-mobile/src/screens/InspectorScreen.tsx`): Dynamic theme tokens with top header toggle.

### F. Real Automotive Brand Logos in Sell Vehicle Flow
- **Component**: [`CarBrandLogo.tsx`](file:///apps/customer-mobile/src/components/CarBrandLogo.tsx)
- Replaced demo emoji placeholders with authentic brand logo assets across all 28 brands.
- Brand cards fully adapt to Dark Mode with white tinting for monochrome dark logos.

### G. Car Service & My Garage Expansion (Part 1 of 3 Complete)
- **Database Architecture (`services/api/prisma/schema.prisma`)**:
  - Extended `EmployeeRole` enum with the 7 service roles: `SERVICE_ADVISOR`, `SERVICE_DISPATCH`, `PICKUP_DRIVER`, `HUB_MANAGER`, `TECHNICIAN`, `SERVICE_QC`, `SERVICE_MANAGER`.
  - Added models: `CustomerVehicle`, `ServiceHub`, `ServiceSlotCapacity`, `ServiceIssueTemplate`, `ServiceRequest`, `ServiceCustodyRecord`, `ServiceDiagnosis`, `ServiceEstimate`, `ServiceEstimateItem`, `ServiceWorkOrder`, `ServiceQCRecord`, `ServicePaymentRecord`, `ServiceHistoryEvent`.
- **Backend Service Store & Router (`services/api/src/service-store.ts`, `service-router.ts`)**:
  - Customer endpoints under `/api/v2/customer/garage/*` and `/api/v2/service/*`.
  - Operations service endpoints under `/api/v2/operations/service/*` with RBAC authorization.
  - Strict Finance verification rule: Only `FINANCE` or `SUPER_ADMIN` can set `PAID_VERIFIED`.
  - 12 comprehensive automated API tests passing in `services/api/test/service-api.test.ts`.
- **Customer Mobile Screens (`apps/customer-mobile/src/screens/`)**:
  - `MyGarageScreen.tsx`: Vehicle inventory, add/edit vehicle form, preferred default toggle, soft archiving, odometer tracking.
  - `ServiceHomeScreen.tsx`: 6-step service wizard: Car selection, 10 animated issue category cards, dynamic question engine, fulfillment selector (Doorstep vs Hub), slot calendar, summary breakdown.
  - `ServiceRequestDetailsScreen.tsx`: Real-time status badge, car & hub info, live vertical timeline, itemized estimate approval modal, vehicle custody report, technician diagnosis findings, cancel action.

### H. Complete Advance Car Rental Platform (Part 2 of 3 Complete)
- **Operating Model**: V MOTIV-managed self-drive rental fleet only. No P2P hosting, zero unauthorized use of resale inventory.
- **Database Architecture (`services/api/prisma/schema.prisma`)**:
  - Extended `EmployeeRole` enum with the 3 rental roles: `RENTAL_MANAGER`, `RENTAL_DISPATCH`, `RENTAL_FLEET_OFFICER`.
  - Added 10 models: `RentalFleetVehicle`, `RentalVehicleBlock`, `RentalBookingHold`, `RentalBooking`, `RentalDriverVerification`, `RentalTrip`, `RentalExtension`, `RentalDamageClaim`, `RentalPaymentRecord`, `RentalAuditEvent`.
- **Backend Rental Store & Router (`services/api/src/rental-store.ts`, `rental-router.ts`)**:
  - Concurrency engine: Atomic `db.$transaction` check-and-lock prevents overlapping holds and double-booking (409 Conflict).
  - 15-minute exclusive checkout hold with automated TTL release.
  - Strict KYC Gate: Vehicle pickup handover endpoint strictly rejects key release if driver KYC is not `VERIFIED`.
  - Disputed damage escrow: Damage items marked with `isCustomerDisputed: true` held in escrow for formal Finance review.
  - 18 automated unit and integration tests passing in `services/api/test/rental-api.test.ts`.
- **Customer Mobile Screens (`apps/customer-mobile/src/screens/`)**:
  - `RentalHomeScreen.tsx`: Pickup hub selector, duration presets, calendar date/time range (Asia/Kolkata), minimum 8-hour duration validation.
  - `RentalSearchResultsScreen.tsx`: Real fleet vehicles list with authentic `CarBrandLogo` assets, filter chips, itemized pricing cards.
  - `RentalVehicleDetailsScreen.tsx`: Image carousel, complete vehicle specs, verified commercial permit & insurance badges.
  - `RentalCheckoutScreen.tsx`: Live 15-minute hold timer countdown, primary driver license KYC inputs, VMR-TERMS agreement.
  - `RentalBookingDetailsScreen.tsx`: Real-time booking status, driver KYC review badge, pickup/return custody report with odometer/fuel tracking.

---

### I. V MOTIV Connect™ Zero-Knowledge QR Integration (Part 3 of 3 Complete)
- **Audited Existing System (`..\v-motiv-connect`)**:
  - Public sticker URL: `https://<APP_BASE_URL>/v/<rawToken>` (32-byte cryptographic random hex token).
  - Zero plaintext token storage: Stored as `tokenHash = sha256(rawToken)`.
  - Telephony status: WebRTC browser-to-browser calling is active by default. Domestic Indian cellular PSTN call forwarding requires licensed CPaaS provider under TRAI/DoT regulations (`VOICE_LIVE_ENABLED=false` fails closed safely).
- **V2 Database Schema Extensions (`services/api/prisma/schema.prisma`)**:
  - `CustomerGarageConnectLink`: Tracks `vehicleId`, `userId`, `qrTokenHash`, `qrTokenPreview` (`vm_...`), status (`ACTIVE`, `DISABLED`, `REVOKED`), and `lastSyncedAt`.
  - `ConnectNotificationReference`: Stores passerby alert notifications (`reason`, `messagePreview`, `callSessionId`, `visitorIpHash`, `isRead`).
  - `ConnectCallSessionReference`: Logs call session metadata and durations without exposing personal phone numbers.
  - `ConnectIntegrationAuditEvent`: Complete immutable audit trail of link, toggle, revoke, and sticker order actions.
- **Backend Store & REST / Webhook Endpoints (`services/api/src/connect-store.ts`, `connect-router.ts`)**:
  - `GET /api/v2/customer/garage/:id/connect`: Vehicle Connect status and recent passerby alerts.
  - `POST /api/v2/customer/garage/:id/connect/link`: Secure QR claiming with ownership validation and URL token parsing.
  - `POST /api/v2/customer/garage/:id/connect/toggle`: Owner toggle between Active and Paused (DND) modes.
  - `POST /api/v2/customer/garage/:id/connect/revoke`: Irreversible deactivation for lost, stolen, or sold vehicles.
  - `POST /api/v2/customer/garage/:id/connect/request-sticker`: Physical sticker kit fulfillment dispatch.
  - `GET /api/v2/customer/connect/alerts` & `PATCH /api/v2/customer/connect/alerts/:id/read`: Owner alert feed management.
  - `POST /api/v2/webhooks/connect`: HMAC-SHA256 signed event receiver (`X-Connect-Signature`) with replay attack prevention.
  - 10 automated tests passing in `services/api/test/connect-api.test.ts`.
- **Customer Mobile Screens (`apps/customer-mobile/src/screens/`)**:
  - `MyGarageScreen.tsx`:
    - Real-time V MOTIV Connect status on every vehicle card (`ACTIVE`, `PAUSED`, `NOT LINKED`).
    - Spotlight card: Zero-knowledge protection features, instant passerby alerts, and private relay overview.
    - Full `ConnectModal`: Link Existing QR (with URL auto-extraction), Order Physical Sticker (address, city, pincode), Toggle Pause/Resume alerts, Recent Passerby Alerts feed with "Mark as Read", Abuse Reporting, and Irreversible Revocation with safety confirmations.
  - `RequestsScreen.tsx`:
    - Added dedicated `Connect` filter tab.
    - Real-time passerby notifications rendered with unread indicators and quick acknowledgment.
- **Connect Public Scan Experience (`v-motiv-connect/frontend/src/pages/public/StartConversationPage.tsx`)**:
  - Enhanced with 4 quick-tap reason cards: 🚗 *Vehicle Blocking Access*, 💡 *Lights Left On*, ⚠️ *Vehicle Needs Attention*, 💬 *Other Concern*.
  - Added Zero-Knowledge Privacy Guarantee banner and prominent **112 Emergency Services Disclaimer**.
- **Documentation**: 10 comprehensive architectural and operational guides in `docs/`:
  - `docs/VMOTIV_CONNECT_EXISTING_SYSTEM_AUDIT.md`
  - `docs/VMOTIV_CONNECT_INTEGRATION_ARCHITECTURE.md`
  - `docs/VMOTIV_CONNECT_QR_LIFECYCLE.md`
  - `docs/VMOTIV_CONNECT_GARAGE_LINKING.md`
  - `docs/VMOTIV_CONNECT_TELEPHONY.md`
  - `docs/VMOTIV_CONNECT_PRIVACY_AND_ABUSE.md`
  - `docs/VMOTIV_CONNECT_NOTIFICATION_FLOW.md`
  - `docs/VMOTIV_CONNECT_TEST_RESULTS.md`
  - `docs/PLATFORM_SERVICE_RENTAL_CONNECT_INTEGRATION.md`
  - `docs/V2_AGENT_HANDOFF.md`

### J. Intelligent Used-Car Valuation & Acquisition Pricing Engine (Part 4 Complete)
- **Database Architecture (`services/api/prisma/schema.prisma`)**:
  - Enums: `MarketObservationPriceType`, `MarketObservationQualityStatus`, `ValuationConfidenceCategory`.
  - Models: `MarketDataSource`, `MarketIngestionBatch`, `VehicleMarketObservation`, `InstantValuationSnapshot`.
  - Migration: `20261030170000_valuation_data_foundation`.
- **Backend Valuation Store & Router (`services/api/src/valuation-store.ts`, `app.ts`)**:
  - Endpoints: `POST /api/v2/valuations/instant`, `GET /api/v2/valuations/:id/public-summary`.
  - Rate limiting: 12 requests / minute with user ownership scoping.
  - Strict Data-Gating: When fewer than 3 approved observations exist, snapshot records `estimateAvailable: false` and `unavailableReason: 'INSUFFICIENT_APPROVED_COMPARABLE_DATA'`. Never fabricates market prices.
- **Acquisition Offer Authorization Boundary (`services/api/src/sales-store.ts`)**:
  - Eliminated unsafe fallback that fabricated inspection evidence.
  - Enforces `OFFER_PROPOSAL_REQUIRES_APPROVED_VALUATION` and `OFFER_ISSUANCE_REQUIRES_PRICING_AUTHORITY`.
  - Enforces `SELLER_ACCEPTANCE_REQUIRES_CUSTOMER_AUTHENTICATION`.
- **Customer Mobile Integration (`apps/customer-mobile/src/screens/SellScreen.tsx`)**:
  - Review step calls `customer.instantValuation(...)` with live inputs.
  - Transparent UI displaying indicative selling range or "Valuation requires review" notice.
- **Valuation Documentation Suite (14 Dedicated Guides in `docs/`)**:
  - `docs/VALUATION_ENGINE_ARCHITECTURE.md`
  - `docs/VALUATION_DATA_SOURCES.md`
  - `docs/VALUATION_DATA_QUALITY.md`
  - `docs/VALUATION_COMPARABLE_MATCHING.md`
  - `docs/VALUATION_PRICING_FORMULAS.md`
  - `docs/VALUATION_COST_POLICY.md`
  - `docs/VALUATION_PUBLIC_ESTIMATE_UX.md`
  - `docs/VALUATION_INSPECTION_INTEGRATION.md`
  - `docs/VALUATION_OFFER_APPROVAL.md`
  - `docs/VALUATION_API_CONTRACTS.md`
  - `docs/VALUATION_DATABASE_SCHEMA.md`
  - `docs/VALUATION_MODEL_EVALUATION.md`
  - `docs/VALUATION_SECURITY.md`
  - `docs/VALUATION_TEST_RESULTS.md`

---


### K. Rental Advance Payment, Full Payment & Balance Tracking Platform
- **Database Architecture (services/api/prisma/schema.prisma)**:
  - Migration: `20261103000000_rental_payment_advances`.
  - Added to `RentalBooking`: `paymentPlanSnapshot`, `rentalPaymentStatus`, `depositStatus`, `balanceDueAt`, `verifiedPaidPaise`, `outstandingBalancePaise`.
  - Added to `RentalPaymentRecord`: `installmentType` (`ADVANCE`, `BALANCE`, `SECURITY_DEPOSIT`, `FULL`).
  - Added model: `RentalPaymentPolicy` (`VMR-POL-2026.1`).
- **Shared Backend API & Logic (services/api/src/rental-store.ts, rental-router.ts)**:
  - Policy-driven payment plans: 25% or 50% advance, 100% full, with strict integer paise precision.
  - Checkout & server-side payment verification (transitions to `PARTIALLY_PAID` or `PAID_IN_FULL`).
  - Payment summary, installment schedule, and transaction history endpoints.
  - Idempotent balance payment order creation and verification.
  - Authoritative Pickup Readiness Gate: physically gates handover in `recordPickupHandover` with 403 on unpaid balance.
  - Operations payment dashboard metrics.
- **Customer Mobile App (apps/customer-mobile)**:
  - `RentalCheckoutScreen.tsx`: Dynamic payment options (25% Advance vs 100% Full Payment), advance amount, remaining balance, and deadline notice.
  - `RentalBookingDetailsScreen.tsx`: Financial summary card, authoritative pickup readiness gate checklist, installment schedule timeline, and keyboard-aware balance payment modal.
  - `RequestsScreen.tsx`: Rental cards render payment plan badge, payment status badge, paid vs pending amounts, and pickup readiness badge (`✓ PICKUP READY` vs `⊘ PICKUP BLOCKED`).
- **Operations Portal (apps/operations-portal)**:
  - `RentalOperationsPanel.tsx`: 5 Payment KPI summary widgets, filter tabs, enriched table columns, drawer overview breakdown and gate checklist, strict handover blocking on pending balance, and dedicated Billing & Ledger tab.
- **Dedicated Documentation Suite**:
  - `docs/RENTAL_PARTIAL_PAYMENT_ARCHITECTURE.md`
  - `docs/RENTAL_PAYMENT_POLICY.md`
  - `docs/RENTAL_INSTALLMENT_LEDGER.md`
  - `docs/RENTAL_PICKUP_READINESS.md`
  - `docs/RENTAL_PAYMENT_TEST_RESULTS.md`

---

## 2. MONOREPO TEST & BUILD STATUS

- **Backend API Suite**: **167 automated tests passing** (`npm test --prefix services/api`).
- **Customer Mobile Suite**: `tsc --noEmit` passes with **0 errors**.
- **Sales Portal Web**: `npm run build --prefix apps/sales-portal` passes with **0 errors** (built in 1.27s).
- **Operations Portal Web**: `npm run build --prefix apps/operations-portal` passes with **0 errors** (built in 1.08s).
- **Inspection Review Portal Web**: `npm run build --prefix apps/inspection-review-portal` passes with **0 errors** (built in 960ms).
- **Finance Portal Web**: `npm run build --prefix apps/finance-portal` passes with **0 errors** (built in 1.05s).
- **Connect Website Frontend**: `npm run build --prefix ..\v-motiv-connect\frontend` passes with **0 errors**.
- **Connect Website Backend**: `npm run typecheck --prefix ..\v-motiv-connect\backend` passes with **0 errors**.
- **Database**: PostgreSQL dev database completely synced with Prisma schema (`20261030170000_valuation_data_foundation`).
- **Working Tree**: Verified, production-grounded, zero data fabrication.
