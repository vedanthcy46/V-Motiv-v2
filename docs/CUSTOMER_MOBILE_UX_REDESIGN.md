# Customer mobile redesign — working handoff

Updated: 2026-10-27. Status: IN PROGRESS; not a production completion certificate.

## Scope and decisions

Implement the attached customer-mobile redesign brief in the existing V2 application. Retain Google authentication, published inventory, seller enquiries, Activity and the inspector experience. Preserve the official vector logo. No fabricated catalogue, logos, stock photos or operational claims. Keep the existing dark screens compatible while introducing spacious light customer surfaces.

## Audit / gap matrix

| Area | Actual source | Finding / required work |
|---|---|---|
| Home | apps/customer-mobile/src/screens/HomeScreen.tsx | Crowded small controls; only Buy/Sell, unsupported universal inspection/instant-offer claims, silent network failures; replace with five readable actions, real inventory and honest unavailable states. |
| Selling | apps/customer-mobile/src/screens/SellScreen.tsx | Seven manual steps, anonymous global draft, save can race restore, idempotency key not persisted, default condition declarations; needs nine-step identity flow and account-safe draft recovery. |
| Navigation | apps/customer-mobile/src/navigation/CustomerNavigator.tsx | Five tabs already exist; tiny 11sp labels and fixed height; retain routes and improve sizing/reduced motion. |
| Vehicle cards | apps/customer-mobile/src/components/VehicleCard.tsx | Universal 180-point badge, clipped title, small metadata; derive claims from listing data and improve reading/touch targets. |
| Catalogue | services/api/prisma/schema.prisma | MasterDataItem exists; no canonical make/model/generation/variant/year provenance schema found. Must not reinterpret inventory or generic master data as verified catalogue. |
| Submission | services/api/src/customer-store.ts and app.ts | Existing authenticated seller creation and idempotency exist. Preserve; add validated catalogue IDs/provenance only with actual canonical catalogue. |
| Inspector | apps/customer-mobile/src/screens/InspectorScreen.tsx | Role-based screen inside shared app; avoid a global colour rewrite that breaks it. |
| Earlier handoff | docs/V2_AGENT_HANDOFF.md | Historical claims include a separate inspector app; current code uses shared customer app. Treat source as authoritative. |

## Execution tracker

- [x] Read brief and audit current Home, selling, navigation, shared UI, authentication, API client and schema.
- [ ] Spacious Home, five categories, honest unavailable states, real stock and resume entry.
- [ ] Accessible customer design components and vehicle cards.
- [ ] Resumable nine-step selling fallback with real submission and review/edit.
- [ ] Provider evaluation and contractual approval of Indian vehicle data/logo rights.
- [ ] Canonical catalogue schema, migrations, backend adapter, sync, public read endpoints and integration tests.
- [ ] Canonical model/year/variant picker with approved source data and cache.
- [ ] Sales/Inspector original declaration vs observed identity and admin correction workflow.
- [ ] Android installed-build visual tests, TalkBack, large fonts, reduced motion and full lifecycle tests.

## Rental audit — 27 October 2026

Completed in the current workspace:

- Rental discovery now queries only active hubs that have at least one currently eligible, available and compliance-valid fleet vehicle.
- Date searches and reservation holds now reject vehicles that are on trip, in maintenance, inactive at their hub, or selected with a mismatched hub id.
- The customer app no longer substitutes unrelated stock imagery when a fleet photo is missing, and no longer advertises fixed inclusion/deposit/insurance claims that the selected vehicle did not prove.
- Simulated KYC document URLs and simulated payment confirmations were removed from the mobile checkout. The customer sees an explicit availability message instead of a false paid booking.
- Added `npm run seed:rental-demo -w @vmotiv/api`, a development-only demo vehicle seeder. It requires an existing active ServiceHub and will not create a fake hub or run in production.

Still required before enabling customer booking:

1. Add and deploy a Prisma migration for the new ServiceHub and rental tables. The schema currently contains the models but the tracked migration history does not.
2. Configure real fleet photos, compliance records, operating terms, a secure document-upload flow, and live Razorpay (or another gateway) order creation/webhook verification.
3. Run the demo seeder only against a local/dev database after an administrator has created an actual active ServiceHub.

## Continuation instructions

1. Read this document and `git diff` before editing; do not overwrite parallel user changes.
2. Keep all public exploration accessible without sign-in. Request Google authentication at final submission and retain draft through auth/onboarding.
3. Do not seed guessed variants or download arbitrary brand logos. If no licensed provider is available, clearly label manual declarations and document missing coverage.
4. Build catalogue schema and adapter as a separate tested vertical slice. Public catalogue must mount before broad authenticated `/api/v2` middleware. Validate all make/model/year/variant relationships server-side.
5. Add provenance/version snapshots to the existing AcquisitionLead rather than creating duplicate seller records. Never overwrite the customer's declaration with inspector corrections.
6. Run customer-mobile typecheck/tests; verify API contracts when changing backend. Record commands and actual results below. Do not claim device tests based on TypeScript success.
7. Keep this checklist and test results updated during work, especially before context/usage limits. Remaining work must be explicit.

## Verification

Not yet run for this redesign. No database migrations or deployments performed.
