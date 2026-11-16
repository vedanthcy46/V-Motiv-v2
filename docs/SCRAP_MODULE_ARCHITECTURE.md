# V MOTIV Vehicle Scrapping: architecture and integration report

Status: **Phases 0 (audit), 1 (schema and state machine), 2 (core request APIs) and Phase 3 (customer mobile app and website) are built. Phases 4 to 12 are not started.**
A customer can use the mobile app or the website (`/scrap`) to start, save, submit and track a scrapping request, and sales can work the lead through the API. **Neither the app nor the website has been run against the real API, Firebase or a real device** (the website was exercised in a browser against an in-memory stand-in for the API that uses the real server validators; see 3c),
and the parts of the workflow that need assessments, quotations, offers, pickups, custody, certificates and payments have no APIs yet.
Only what is marked **Implemented** exists in code.

V MOTIV coordinates scrapping between a customer and an authorised Registered Vehicle Scrapping Facility (RVSF). It is **not** the RVSF and **not** a
government service. Official certificates and registration status are *records of evidence received from the real issuer*, each with an honest
verification state. This module never generates one.

## 1. What was inspected (Phase 0)

Inspected by reading the code, not assumed:

| Area | Where | What it means for scrapping |
|---|---|---|
| Monorepo | `apps/*`, `packages/ui`, `services/api` (npm workspaces) | One API serves all apps. New domain code goes in `services/api/src/scrap/`, with a router and store like the service and rental modules. |
| Backend | Express + Prisma + PostgreSQL (Neon), deployed on Render (`render.yaml`) | Routers are created in `src/app.ts` with `verify` (Firebase) and a store. A domain is a `*-router.ts` + `*-store.ts` pair. |
| Auth | Firebase ID tokens verified in `src/auth.ts` | Reused unchanged. Google Sign-In stays the only login. Sign-in is not proof of vehicle ownership. |
| RBAC | `EmployeeRole` enum + `Role`/`Permission`/`RolePermission` rows (`src/admin-catalog.ts`) | The role enum is fixed, but **permissions are data**. Scrapping reuses existing roles and adds permission keys. No second permission system, no enum migration. |
| Audit | `AuditEvent` model | Reused for staff actions, alongside the scrapping-specific insert-only event tables. |
| Notifications | `src/notification/*` (in-app rows, Expo push tickets, `EmailOutbox` with Resend) | Reused. Domain events create backend records first. Email delivery is disabled by default and needs a verified Resend domain (see `docs/EMAIL_SYSTEM.md`). |
| Inspection | `InspectionRequest.leadId` is **required**; reports belong to a sale lead (`AcquisitionLead`) | A scrap assessment cannot reuse these rows. It gets its own tables and follows the same ideas (assignment, immutable submitted report, versioned corrections). |
| Garage | `CustomerVehicle` | A scrap request can reference a garage car (optional, `SetNull`). The garage entry is untouched by scrapping. |
| Sell flow / valuation | `AcquisitionLead`, `valuation-store.ts` | Resale pricing. **Not reused** for scrap valuation (a separate strategy is required). |
| Finance | `AcquisitionSettlement`, `finance-store.ts`, Cashfree `GatewayOrder` | Cashfree collects money *from* customers. Scrapping pays the customer, usually directly from the RVSF, so it needs its own obligation and transaction records. |
| Media | Cloudinary upload (`src/cloudinary.ts`), `InspectionMedia` | **Uploads are public URLs.** That is not acceptable for identity documents. See section 7. |
| Portals | `apps/sales-portal`, `operations-portal`, `finance-portal`, `admin-portal`, `inspection-review-portal` | Each is a single `main.tsx` plus components calling the API. Scrapping sections will be added as new components, not rewrites. |
| Customer app / web | `apps/customer-mobile` (Expo), `apps/customer-web` | The mobile app already has a "Scrap a Car" entry that opens a placeholder screen (`ScrapHomeScreen`). |
| Inspector app | `apps/inspector-mobile` has no `src/` folder (only top-level files) | **Not inspected in depth.** Phase 5 starts by reading it. |
| Deployment | Render does **not** run migrations | New tables are added with an additive migration and are unused by running code until Phase 2, so a deploy cannot break reads. Phase 2 adds the startup guarantee used elsewhere. |

Not inspected in depth yet (to be read at the start of the phase that touches them): sales-portal lead UI, finance-portal layout, admin-portal catalogue UI,
inspector-mobile structure, customer-web structure, the existing questionnaire engine (`docs/DYNAMIC_QUESTION_ENGINE.md`).

## 2. Design decisions

1. **Separate dimensions.** The case status moves on facts. Payment (`paymentState`), registration (`registrationStatus`), pickup (`ScrapPickup`), custody
   (`ScrapCustodyEvent`) and certificates (`ScrapCertificate.verificationState`) are separate records. Status is never read to answer "is it paid?".
2. **Facts, not strings.** The state machine takes *facts computed from records*. A client can ask for a move; it happens only if the evidence exists.
3. **Immutable where it matters.** Submitted assessments, sent offers, accepted offers, custody events, status events and payment transactions are never edited. A
   correction is a new version or event.
4. **No invented official data.** No certificate is generated. `VERIFIED` requires a verifier, a time and a method (database CHECK constraints). A manual
   document review is recorded as exactly that, never as a government verification.
5. **Configurable rules, not legal claims.** Required documents, eligibility, approval thresholds, SLAs and cancellation policy live in `ScrapPolicy`
   (administrator-editable, versioned). This document does **not** state what Indian law requires: the policy values need legal review before launch.
6. **V MOTIV does not hold customer funds.** An offer records the payer (`RVSF` or `VMOTIV`). The default is the facility paying the owner directly.
7. **Staff references are plain UUID columns** (no foreign key to `Employee`/`User`), so the shared models are not modified. Integrity there comes from the API and the audit trail.

## 3. Implemented in Phase 1

| Item | Location |
|---|---|
| 22 tables, 20 enums, additive migration | `services/api/prisma/schema.prisma` (Scrap section at the end), `prisma/migrations/20261116010000_scrap_module_foundation/migration.sql` |
| Database rules Prisma cannot express | same migration, "Hand-written additions": one live request per registration (partial unique index), non-negative money, hold remembers its status, verified-needs-a-verifier on identity, certificates, payment transactions and partners |
| State machine, guards, permission keys | `services/api/src/scrap/scrap-workflow.ts` |
| Tests (31) | `services/api/test/scrap-workflow.test.ts` |

**Not verified:** the migration SQL has not been run against a real PostgreSQL (none is available here). The generated part comes from `prisma migrate diff`;
the hand-written constraints and the partial index are untested. Run it on a copy of the database first.

## 3a. Implemented in Phase 2 (core request APIs)

| Item | Location |
|---|---|
| Questionnaire as data (conditional questions, EV safety flags, ownership declaration, address, vehicle validation); the API sends it to clients so mobile and web ask the same questions | `services/api/src/scrap/scrap-questionnaire.ts` |
| Scrap valuation strategy: indicative estimate from an administrator-maintained pricing policy. **No built-in prices**: with no policy, category price, weight, completeness or towing cost it says "quotation required" | `scrap-valuation.ts` |
| Facts computed from records for the state machine (documents, partner, quotation, offer, pickup, custody, certificates, disputes) | `scrap-facts.ts` |
| Store: drafts (server-side, device independent, versioned), submit (idempotent, duplicate-safe), customer list/detail, cancel, concerns, offer response, staff queue/detail/qualify/documents/flags/transition, the single transition engine | `scrap-store.ts` |
| HTTP routes, input validation with field-level errors, rate limiting on scrapping routes only | `scrap-router.ts`, mounted in `app.ts`; store created in `server.ts` |
| Permission keys registered in the existing catalogue and granted to existing roles | `admin-catalog.ts`, additive sync in `scrap-permissions-sync.ts` + `scripts/sync-scrap-permissions.ts` |
| Tests: 93 new in Phase 2 (domain 32, store 46, router 12, permission sync 3), on top of the 31 workflow tests from Phase 1. Full API suite: 599 passed | `services/api/test/scrap-*.test.ts`, `test/helpers/fake-scrap-db.ts` |

### API route inventory (all under `/api/v2`)

Customer (own requests only; someone else's request is "not found"):

| Method and path | Purpose |
|---|---|
| `GET /customer/scrap/questionnaire` | The questionnaire definition (works even before the database update is applied) |
| `POST /customer/scrap/requests` | Create a draft (optionally from a garage car; `submissionKey` makes it idempotent) |
| `GET /customer/scrap/requests` | My requests, newest first, cursor-paged (drafts included) |
| `GET /customer/scrap/requests/:id` | Details: status in plain language, timeline, documents, offer (once sent), pickup, certificates with their true verification state, payment state, concerns |
| `PATCH /customer/scrap/requests/:id` | Save draft answers (`expectedVersion` required; stale writes refused) |
| `DELETE /customer/scrap/requests/:id` | Delete an unsubmitted draft |
| `POST /customer/scrap/requests/:id/submit` | Submit (safe to repeat) |
| `POST /customer/scrap/requests/:id/cancel` | Cancel before the vehicle leaves the customer |
| `POST /customer/scrap/requests/:id/disputes` | Raise a concern (pauses a case still in progress) |
| `POST /customer/scrap/requests/:id/offer-response` | Accept or reject the current, unexpired, sent offer |

Staff (permission-based; sales sees assigned or unassigned leads up to assessment, operations and administrators see all cases; nobody sees drafts):

| Method and path | Needs |
|---|---|
| `GET /scrap/requests`, `GET /scrap/requests/:id` | `scrap.request.read` (detail includes the moves available now and what is missing for the others) |
| `POST /scrap/requests/:id/qualify` | `scrap.lead.qualify` |
| `POST /scrap/requests/:id/documents/request`, `POST /scrap/documents/:id/review` | `scrap.documents.review` |
| `POST /scrap/requests/:id/flags` | set: `scrap.lead.qualify` or `scrap.case.reject`; clear: `scrap.lead.qualify` or `scrap.case.hold`. Customer-declared concerns can be cleared, never invented |
| `POST /scrap/requests/:id/transition` | the permission the state machine requires for that move |

### What Phase 2 deliberately does not do

- **No document or photo upload.** It needs private storage (blocker 1). Staff can request documents and review ones that exist, but nothing can yet be provided. Until then the "minimum photos" submission rule (`submission_requirements` policy, default 0) cannot be met if set above 0.
- **No assessments, quotations, offer creation, pickups, custody, certificates, payment obligations or settlements.** The tables exist and the state machine already refuses the moves that need them, so those moves stay unavailable. Offer *response* exists (customers accepting a sent offer), and is tested against offers inserted as the later phases will.
- **No notifications.** No event is dispatched yet (Phase 10).
- **No admin editor** for the pricing and submission policies. They are read from `ScrapPolicy` (keys `indicative_pricing`, `submission_requirements`); until Phase 8 a developer sets them.
- The required-document list is **not automatic**: staff name the documents to request. "Documents accepted" needs at least one document and every one accepted.

### Deployment (the host does not run migrations)

1. Apply the migrations on a **copy** of the database first, then on production: `npm run db:deploy -w @vmotiv/api` (includes `20261116010000_scrap_module_foundation`). The scrapping API answers `503 SCRAP_SCHEMA_NOT_READY` with a plain message until this is done; the rest of the API is unaffected.
2. Run `npm run sync:scrap-permissions -w @vmotiv/api`. Additive only; safe to repeat. Until it runs, staff get `403 SCRAP_ACCESS_DENIED`. (Do **not** use the full role-catalogue sync for this: it deletes and rebuilds every role's permissions.)
3. Redeploy the API.
4. Nothing is user-visible until the screens exist (Phase 3 onward).

## 3b. Implemented in Phase 3 (customer mobile app)

| Item | Location |
|---|---|
| Form logic, no React: interprets the server's questionnaire, step completeness, autosave diffing, refused-field handling, error wording, status/progress/money formatting | `apps/customer-mobile/src/services/scrap-form.ts` (tests: `scrap-form.test.ts`, 25) |
| Wording for every pickup, payment, registration, document and concern state | `services/scrap-text.ts` (tests: `scrap-text.test.ts`) |
| Typed API client | `services/scrap-api.ts` |
| Copy of the draft kept on the phone | `services/scrap-draft-store.ts` |
| Shared controls (48-point touch targets, radio/checkbox roles, status pill, progress track, save indicator) | `components/scrap/ScrapUi.tsx` |
| Introduction, wizard, my requests, request details | `screens/ScrapHomeScreen.tsx`, `ScrapRequestScreen.tsx`, `MyScrapRequestsScreen.tsx`, `ScrapRequestDetailsScreen.tsx`; routes in `navigation/` |
| "Scrap this car" from My Garage (starts the wizard from that car) | `screens/MyGarageScreen.tsx` |
| Server change made for it: a draft field set to `null` is cleared (vehicle, ownership, address, like answers already were), so a stale value can never be submitted | `scrap-store.ts`, `scrap-router.ts`; test in `scrap-store.test.ts` |
| `ApiError` now carries the response body (`details`), so field-level errors reach the wizard | `apps/customer-mobile/src/api.ts` |

**Contract test:** the app's interpreter is run against the *real* server questionnaire for 540 combinations of the answers that change what is asked, and must show exactly the same questions as the server. If the server definition changes, the app follows it; if the interpreter drifts, the test fails.

**Verified:** typecheck clean; 124 mobile tests pass; full API suite 600 pass; the Android app bundles (`expo export`). **Not verified:** nothing has been run on a phone or emulator, there are no component or end-to-end tests (the app has no UI test setup), and iOS and Android layouts, keyboard behaviour and safe areas have not been looked at.

### Your 24 screens, honestly

| # | Screen | State |
|---|---|---|
| 1 | Introduction | Done |
| 2 | Select existing vehicle or add new | Done (garage picker in the wizard, and "Scrap this car" in My Garage) |
| 3 | Vehicle information | Done |
| 4, 5 | Condition and damage questionnaire (incl. electric-vehicle safety) | Done, server-driven |
| 6 | Upload photographs | **Not possible yet.** The step explains this plainly. Needs private storage (blocker 1) |
| 7 | Ownership declaration | Done |
| 8 | Document requirements | **Partly.** Staff-requested documents are listed in the request, with status and any rejection reason. Nothing can be uploaded |
| 9 | Pickup location | Done as a typed address. No map or GPS |
| 10 | Preliminary estimate | **Partly.** Shown right after submit (a range, or "Quotation required"). There is no preview before submitting; that needs a small API |
| 11, 12, 13 | Review, submit, confirmation | Done (submit cannot double-fire; the server is idempotent too) |
| 14 | My scrapping requests | Done (drafts, in progress, history; paged; pull to refresh) |
| 15 | Request details | Done (refreshes whenever shown) |
| 16 | Appointment tracking | **Partly.** The collection window and status. There is no inspection appointment yet (Phase 5) |
| 17 | Inspection result | **Not built** (Phase 5/6: there is no assessment API) |
| 18 | Customer offer | Done, shown only once sent |
| 19 | Accept / reject / request clarification | Accept and reject done. "Clarification" opens Support: there is no clarification API |
| 20 | Pickup and handover details | **Partly.** Pickup shown; handover and custody details arrive with Phase 6 |
| 21 | Payment tracking | Done for what exists (shows when an obligation has been recorded) |
| 22 | Certificates | Records and their true verification state. **Viewing the document** needs signed access (blocker 1) |
| 23 | History | Done |
| 24 | Support and dispute | Done (raise a concern; Contact support) |

Requirements met: draft autosave (server-side, plus a copy on the phone for offline); back navigation keeps answers; server validation with field-level errors that take the person to the right step; keyboard avoidance and safe areas through the app's existing form components; loading and network-error recovery; refreshable details; duplicate-submission prevention; no hard-coded amounts, statuses or dates. Not applicable yet: upload progress and retry (no upload). Optimistic updates: none, deliberately.

### The website

See 3c. It was not started in 3b because it needed decisions (a first signed-in area on the marketing site); those were made and it is built.

## 3c. Implemented in Phase 3 (website, `apps/customer-web/src/scrap/`)

**What exists.** Under `/scrap` (loaded on demand, so the landing page bundle is unchanged: its chunk has no Firebase code): introduction, Google sign-in (popup, falling back to full-page redirect where popups are blocked), a phone-and-terms step like the app's, the seven-step request form with autosave, my requests, and request details with offer accept/reject, cancel and concerns. Everything is the same API and account as the app, so a draft started on one continues on the other.

**Shared with the app, not copied.** The website imports these from `apps/customer-mobile/src/services/`: `scrap-form.ts`, `scrap-text.ts`, `scrap-types.ts`, `scrap-endpoints.ts` (the API calls, written once; the app and the site only supply how to send a request) and `scrap-sync.ts` (the autosave engine). Field refusals, version conflicts, offline retry and "one save at a time" are tested once, in `scrap-sync.test.ts` (15 tests), with fakes. The app's own request screen still has its own copy of that save logic and was not changed (it works and was verified by a bundle build, not a device); moving it onto `DraftSync` would remove the duplication and is worth doing with a device to hand.

**Behaviour.** Problems are shown for a step only after Continue; Continue and Submit move keyboard focus to the first problem; each step moves focus to its heading; questions are real fieldsets with radio buttons, so arrow keys and screen readers work; status is always words as well as colour; the save state is announced politely; a copy of the answers is kept in this browser (per person, per request) and restored if it never reached the server; leaving with unsaved changes warns and tries to send them; a second click on Submit, Accept or Cancel does nothing; a reload of a started form reopens that request; offers show the amount, who pays, and the time left.

**Deliberate limits (same as the app).** No photo or document upload and no inspection result yet; the pages say so. Estimates and offers are shown exactly as the API sends them ("quotation required" when no pricing is approved); the site has no prices of its own.

**How it was checked.** `tsc` clean; website tests (route parsing, account rules, phone numbers, local copy, error wording) 19 passed; production build succeeds (scrapping chunk about 173 kB, 52 kB gzipped; landing chunk unchanged); mobile suite 139 passed; shared ui tests 12 passed. In a browser (a throwaway harness, not committed, using an in-memory API stand-in that runs the real server validators; sign-in replaced by a fake session) the following was driven and behaved: empty Continue showing every problem and focusing the first; typing with stray characters in numeric fields; autosave sending only what changed with rising versions; a server-refused pincode being saved around, shown on Continue, and cleared once fixed; conditional questions appearing and disappearing; going offline and recovering with "Try again"; Submit offline (nothing submitted, answers kept), then online with a double click (one submit); resuming a draft from the start page; the offer dialog (labelled, modal, focus inside, Escape closes, double confirm sends once); no horizontal overflow and no tiny tap targets at 375 px on every page.

**Bugs found by that run and fixed:** numeric fields used `maxLength`, which counts stray letters and separators, so typing `20a08` or pasting `2,008` into the year lost a digit (limits are now applied after removing non-digits; the app's number fields still use `maxLength` and may have the same flaw); radio buttons and checkboxes were invisible because the shared theme defines `--border` as a colour while daisyUI uses it as a width (the pages use native controls with the theme's accent colour; other pages using daisyUI `radio`/`checkbox` classes, for example in the admin portal, may be affected); a request started at `/scrap/new` now moves to its own address so a reload reopens it instead of starting a second form.

**Not verified.** Real Google sign-in (no Firebase web config in this environment), the real API over the network and CORS from `www.vmotiv.in`, Safari and iOS, a screen reader (labels and live regions are in place but nobody has listened to them), dark/light contrast beyond what was on screen, and the redirect fallback.

**Configuration the website needs (not in code).**
1. `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` for the website build (same Firebase project as the portals). Without them `/scrap` shows "sign-in is not available on the website right now" and sends people to the app.
2. Firebase Console, Authentication, Settings, Authorised domains: add `vmotiv.in` and `www.vmotiv.in`.
3. `VITE_API_BASE` is optional; production defaults to `https://api.vmotiv.in` (the website host does not proxy `/api`). The API already allows `vmotiv.in`, `www.vmotiv.in` and `*.vmotiv.in`.
4. Sign-in by redirect (used only where popups are blocked) needs `VITE_FIREBASE_AUTH_DOMAIN` to be a domain the site controls with `/__/auth/*` proxied to Firebase; otherwise browsers that block third-party storage can fail to complete it. Popups work without this.
5. `Cross-Origin-Opener-Policy: same-origin-allow-popups` is now sent for `/scrap` by `public/_headers` (Cloudflare) and `vercel.json`; the popup sign-in needs it.
6. `public/privacy.html` now describes the scrapping data and sharing with authorised facilities. **Its wording and effective date need your or your lawyer's review before release.**

## 4. Tables

`ScrapRequest`, `ScrapVehicleSnapshot`, `ScrapConditionAnswer`, `ScrapDocument`, `ScrapEstimate`, `ScrapAssessment`, `ScrapAssessmentMedia`, `ScrapPartner`,
`ScrapPartnerContact`, `ScrapPartnerContract`, `ScrapPartnerQuote`, `ScrapOffer`, `ScrapOfferAcceptance`, `ScrapPickup`, `ScrapCustodyEvent`, `ScrapCertificate`,
`ScrapPaymentObligation`, `ScrapPaymentTransaction`, `ScrapSettlement`, `ScrapStatusEvent`, `ScrapDispute`, `ScrapPolicy`.

Money is `BigInt` paise. Every table with a state has a version or is insert-only. Idempotency: `ScrapRequest(customerId, submissionKey)` and
`ScrapPaymentTransaction.idempotencyKey` are unique.

## 5. Workflow transition matrix (as coded)

"Needs" are facts the store will compute from records. "Who": C customer, S staff with the permission, Sys system, P facility.

| From | To | Who | Needs (otherwise refused) |
|---|---|---|---|
| DRAFT | SUBMITTED | C | ownership declaration made |
| SUBMITTED | SALES_REVIEW | Sys, S `scrap.lead.qualify` | none |
| SALES_REVIEW | DOCUMENTS_REQUIRED | S `scrap.documents.review` | at least one document requested |
| DOCUMENTS_REQUIRED | SALES_REVIEW | Sys, S `scrap.documents.review` | requested documents submitted |
| SALES_REVIEW | ASSESSMENT_PENDING | S `scrap.lead.qualify` | lead qualified, declaration made, no blocking flag, no outstanding document requests |
| ASSESSMENT_PENDING | ASSESSMENT_COMPLETED | Sys, S `scrap.assessment.review` | assessment submitted |
| ASSESSMENT_COMPLETED | OPERATIONS_REVIEW | S `scrap.assessment.review` | assessment approved, no reinspection requested |
| ASSESSMENT_COMPLETED | ASSESSMENT_PENDING | S `scrap.assessment.review` | reinspection requested |
| OPERATIONS_REVIEW | PARTNER_QUOTE_PENDING | S `scrap.partner.assign` | partner ACTIVE, registration valid, covers category and area |
| PARTNER_QUOTE_PENDING | OFFER_PENDING_CUSTOMER | S `scrap.offer.send` | partner still ACTIVE, verified unexpired quotation, offer approved under policy, offer sent |
| OFFER_PENDING_CUSTOMER | OFFER_ACCEPTED | C | offer not expired, customer's acceptance recorded |
| OFFER_PENDING_CUSTOMER | PARTNER_QUOTE_PENDING | Sys, S `scrap.partner.assign` | offer expired or requote requested |
| OFFER_PENDING_CUSTOMER | REJECTED | C | customer rejection recorded |
| OFFER_ACCEPTED | COLLECTION_SCHEDULED | S `scrap.pickup.schedule` | no blocking flag, no open discrepancy or dispute, partner active, required documents **accepted**, payment obligation recorded, pickup scheduled and customer-confirmed |
| COLLECTION_SCHEDULED | COLLECTED | S `scrap.custody.record` | collection recorded with the vehicle matched to the request, no open discrepancy |
| COLLECTION_SCHEDULED | OFFER_ACCEPTED | S `scrap.pickup.schedule` | pickup failed (to reschedule) |
| COLLECTED | FACILITY_RECEIVED | S `scrap.custody.record`, P | facility receipt acknowledged; partner still active. **Pickup is not receipt.** |
| FACILITY_RECEIVED | DEPOSIT_CONFIRMED | S `scrap.certificate.verify` | Certificate of Deposit **VERIFIED** |
| DEPOSIT_CONFIRMED | SCRAPPING_IN_PROGRESS | S `scrap.custody.record`, P | facility confirmed processing started |
| SCRAPPING_IN_PROGRESS | SCRAPPING_COMPLETED | S `scrap.certificate.verify` | deposit and scrapping certificates both **VERIFIED**. **Never from a status string.** |
| SCRAPPING_COMPLETED | REGISTRATION_UPDATE_PENDING | Sys, S `scrap.registration.verify` | none |
| REGISTRATION_UPDATE_PENDING | COMPLETED | S `scrap.registration.verify` | registration update **VERIFIED** by evidence, payout `PAID_VERIFIED` or not applicable, no open dispute |
| before handover (DRAFT to COLLECTION_SCHEDULED) | CANCELLED | C, S `scrap.case.cancel` | reason. **After handover cancellation is refused**: raise a dispute or hold |
| any in-progress status | ON_HOLD | Sys, S `scrap.case.hold` | reason. Resumes only to the status it left, and not while a dispute or discrepancy is open |
| SALES_REVIEW, OPERATIONS_REVIEW | REJECTED | S `scrap.case.reject` | reason |

Terminal: COMPLETED, REJECTED, CANCELLED. Facility (P) may only confirm receipt and processing start. The system may only make the moves marked Sys, and only where
the evidence exists; it cannot approve, verify certificates, send offers or complete a case (pinned by tests).

## 6. Permission keys

Defined in `SCRAP_PERMISSIONS` and **registered in `admin-catalog.ts`** as data in the existing role system (no new role, no enum change). Granted as below; checked by tests.
`SALES_EXECUTIVE`: `request.read`, `lead.qualify`, `documents.review`, `case.cancel`. `INSPECTION_REVIEWER`: `request.read`, `assessment.review`.
`OPERATIONS_MANAGER`: read, `documents.review`, `assessment.assign`, `assessment.review`, `partner.assign`, `quote.verify`, `offer.send`, `pickup.schedule`, `custody.record`, `certificate.verify`, `registration.verify`, `case.hold`, `case.cancel`, `case.reject`.
`PRICING_APPROVER`: `request.read`, `offer.approve` (offers are approved by someone other than the person who sends them). `FINANCE`: `request.read` (payment keys arrive in Phase 7). `ADMIN`: `request.read` only (oversight; administrators do not run the workflow). `INSPECTOR`: none yet (Phase 5).
Segregation (tested): sales holds none of the verification, custody, approval, partner, pickup or payment keys.
**For review:** Operations currently holds `certificate.verify` and `registration.verify` so the workflow can complete; the guards still require verified evidence. If you want a separate, named verifier group, that is a grant change, not a code change.

## 7. Edge cases: design only

"Defined state" is what the model provides today. **Most behaviour below is designed, not built** (Phases 2 to 11).

| Case | Defined state | Customer sees | Team | Recovery / audit |
|---|---|---|---|---|
| Duplicate active request | refused by partial unique index | "A request for this vehicle is already in progress" | Sales | existing request is linked; `ScrapStatusEvent` |
| Invalid registration number | validation (normalised form) | field error | none | none |
| Missing photos / documents | DOCUMENTS_REQUIRED | list of what is missing | Sales | upload; `ScrapDocument` status |
| Customer not the registered owner / loan / dues | `blockingFlags`, ON_HOLD | "We need more information" (no accusation) | Sales, Ops | documented resolution or REJECTED with reason |
| Legal restriction / stolen-vehicle concern | `blockingFlags` (case cannot pass review) | "We cannot proceed with this vehicle" | Ops, Admin | reason in status event; escalate outside the system |
| VIN mismatch, missing engine | assessment finding, `materialDiscrepancyOpen` | "The vehicle differs from the request" | Ops | requote or customer-approved resolution; new offer version |
| Offer expired / customer rejects | offer EXPIRED / REJECTED | "Offer expired" or closed | Ops | requote; versions kept |
| Cancel before collection | CANCELLED | confirmed | any | reason; event |
| Cancel after handover | refused | "Raise a concern" | Ops | dispute + ON_HOLD |
| Pickup failure / transport breakdown | `pickupFailed`, back to OFFER_ACCEPTED | new time | Ops | reschedule; custody exception event |
| Partner suspended or cancels | partner not ACTIVE, guards refuse | "Reassigning your vehicle" | Ops | reassign; ON_HOLD if already collected |
| Facility refuses vehicle | ON_HOLD + dispute | explained | Ops | return custody event or new facility |
| Payment failure / wrong beneficiary | transaction FAILED; obligation FAILED/DISPUTED | "Payment issue" | Finance | append reversal / correction; never edit |
| Repeated payment webhook | unique `idempotencyKey` | none | none | same transaction returned |
| Delayed deposit or scrapping certificate | state stays FACILITY_RECEIVED / SCRAPPING_IN_PROGRESS | "Waiting for the facility's certificate" | Ops | SLA escalation (Phase 6) |
| Certificate mismatch | certificate DISPUTED / REJECTED | "We are checking your certificate" | Ops | re-request; evidence kept |
| Registration update pending / government portal unavailable | `registrationStatus` PENDING, REGISTRATION_UPDATE_PENDING | "Registration update in progress" | Ops | retry; completion refused without evidence |
| Concurrent staff edits | `version` on the request; refused as a conflict | "Refresh and try again" | any | re-read |
| Lost internet during inspection | offline draft (Phase 5) | n/a | Inspector | safe resync; submitted reports immutable |
| Device switched during draft | draft stored on the server (Phase 3) | draft continues | none | none |

## 7a. Bug found and fixed while testing Phase 2

A pickup address with some fields filled and others empty crashed the validator (`.trim()` on a missing field) before any message could be shown: any customer saving a half-finished address would have got a server error. Fixed in `scrap-questionnaire.ts`; covered by the draft tests.

## 8. External requirements and blockers (cannot be built here)

1. **Private document storage.** Identity and ownership documents must not use public URLs. Needs private/authenticated storage and short-lived signed URLs (for example Cloudinary authenticated delivery, or object storage) and a decision on malware scanning.
2. **Legal and policy input.** Which documents are mandatory, eligibility rules, the exact certificate and registration steps, retention periods. These are *configuration values* that must come from legal review, not from engineering.
3. **RVSF onboarding data.** Real partner records and their verification (manual until an approved official integration exists; none is assumed).
4. **Scrap material price and rate-card data.** The valuation engine needs approved inputs. With none, it must show "Quotation required". Nothing is invented.
5. **Payout rail.** If V MOTIV ever pays customers, a payout provider is required. The default model has the facility paying directly and V MOTIV only recording and verifying.
6. **Partner access.** There is no facility login or role today. Partner-scoped access needs an identity decision; until then Operations records facility actions on their behalf.
7. **Resend domain verification** for email notifications (existing requirement).
8. **Inspector app structure** must be read before Phase 5.

## 9. Phase plan and status

| Phase | Scope | Status |
|---|---|---|
| 0 | Audit and this report | **Done** |
| 1 | Schema, state machine | **Done** (migration not run on PostgreSQL) |
| 2 | Core request APIs (drafts, submit, tracking, cancel, concerns, offer response, sales lead handling, transition engine), permission registration, duplicate and idempotency protection | **Done** for the scope in 3a. Remaining backend APIs arrive with their phases (assessment 5, partners/quotes/offers/pickup/custody 6, payments 7, policies 8, certificates 9) |
| 3 | Customer intake and tracking (mobile, web) | **Built**: mobile (3b, never run on a device) and website (3c, exercised in a browser against a stand-in API, not against Firebase or the real API). Photo/document upload is not built on either |
| 4 | Sales Executive portal | Not started |
| 5 | Inspector assessment (SCRAP_ASSESSMENT) | Not started |
| 6 | Operations: review, partners, quotation, offer, pickup, custody | Not started |
| 7 | Finance | Not started |
| 8 | Admin governance and policy editor | Not started |
| 9 | Certificates and registration tracking | Not started |
| 10 | Notifications, cross-portal integration | Not started |
| 11 | Security, performance, automated end-to-end tests | Not started |
| 12 | Production-readiness review | Not started |

**Not production-ready.** The success condition (a real customer submitting a request that flows through every portal) is not met by Phase 1.
