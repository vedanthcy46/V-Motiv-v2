# Rental free km and excess-km charge, controlled per hub

Status: implemented. API typecheck clean, 226 API tests pass (new: `test/rental-km-policy.test.ts`); mobile, Operations and Admin portals typecheck clean. Not run against a real database or the live portals.

## Before
Free km per day and the excess-km rate were stored on each vehicle (`includedKmPerDay` default 250, `extraKmRatePaise` default 1200) and typed in by Operations when onboarding a car. No administrator control, no per-location policy, and the apps carried a hardcoded `250` fallback.

## Now
- **Policy lives on the hub/location** (`ServiceHub.rentalIncludedKmPerDay`, `ServiceHub.rentalExtraKmRatePaise`, both nullable). Migration `20261105000000_hub_rental_km_policy` is additive.
- **Resolution** (`services/api/src/rental-km-policy.ts`): the hub value wins when set (each value independently); otherwise the vehicle's own value is used. Zero or invalid hub values are ignored, never treated as "unlimited".
- **Dynamic:** quotes (`calculateQuote`), search results, vehicle details, walk-in bookings and the Operations fleet list all resolve the policy at request time, so an administrator's change shows up in the next quote immediately. A booking snapshots its km terms (`includedKm`, `extraKmRatePaise`) at checkout, so existing bookings and return settlement keep the terms the customer agreed to.
- **Administrator control:** Admin portal, Settings & Branches, "Rental kilometre policy by hub". Per hub: free km per day (1-1000) and excess-km charge in rupees (1-1000 per km), Save, or "Clear (use car values)". API: `GET /admin/rental-km-policies`, `PATCH /admin/rental-km-policies/:hubId` (requires `branch.manage`; non-super admins are limited to their own branches; every change writes an audit event `RENTAL_KM_POLICY_UPDATED` with before/after).
- **Customer app:** shows "N km included (X km/day)" and "Extra km ₹Y/km" from the API; the hardcoded 250 fallbacks were removed.
- **Operations portal:** fleet list shows km/day and ₹/extra km with a "Hub policy" tag when an administrator's value is in effect; onboarding inputs say they apply only when the hub has no policy.

## Deploy notes
1. Run the migration (`npm run db:deploy` in `services/api`) before deploying the new API; the code reads the new columns.
2. Re-run `npm run db:generate` after stopping any running dev server (the Windows Prisma engine file was locked while generating here; types and client code were regenerated, the engine binary was unchanged).
3. Until an administrator sets a hub policy, every car keeps its existing values, so nothing changes silently.

## Not covered
- A per-vehicle exception to the hub policy (e.g. a premium car with a different allowance); the vehicle fields are now only a fallback.
- Excess-km billing at return uses the booking's snapshot rate as before; it was not changed.
