# Walk-in readings, service fulfilment and make/model consistency

## Found and fixed
| Area | Gap | Fix |
|---|---|---|
| Rental walk-in | Hand-over odometer could be lower than the vehicle's record; fuel defaulted to an invented 100% (`\|\| 100`, 0 impossible) | API rejects `ODOMETER_BELOW_RECORDED`; fuel defaults to the vehicle's recorded level; portal pre-fills both from the vehicle, shows the record and the km package (km/day, extra-km rate) |
| Service walk-in | Existing vehicle's odometer never updated at intake; lower readings accepted; fuel 0 became 50; vehicle matched case-sensitively | Rejects lower readings, syncs the vehicle odometer up, fuel 0 allowed, case-insensitive match |
| Service release | Portal sent a hard-coded 50% fuel and always "customer signed"; no check against check-in odometer | Fuel is entered (required), customer acknowledgement is an explicit tick, API rejects `ODOMETER_BELOW_CHECK_IN` |
| Service fulfilment | Ops portal compared against `DOORSTEP_PICKUP`/`HUB_DROP`, but the database values are `PICKUP_AND_RETURN`/`SELF_DROP_AT_HUB`: every doorstep job showed as a hub drop. Dispatch tab (driver form) was shown for hub-drop and walk-in jobs | Same values as the database; hub-drop jobs show "no driver dispatch needed" and a shortcut to Intake |
| Mobile service booking | Made-up pincode fallback (600032 / 560103) | Removed (pincode is already required) |
| Make / model | Free-text boxes in ops rental onboarding, ops service walk-in, sales walk-in seller lead | Shared picker fed by `GET /master-data` with "Other, type manually"; works with no catalogue. Mobile Add Vehicle / Sell already had custom brand + model |
| Search / inventory filters | Spellings varied by entry point ("maruti", "MARUTI SUZUKI") | `vehicle-names.ts` stores the catalogue spelling (case, spacing, short names) at every write site: app seller lead, walk-in seller lead, rental fleet onboarding, customer vehicles, service walk-in. Names not in the catalogue are kept as typed |

## Follow-up round (previously listed as not changed)
| Item | Fix |
|---|---|
| GST in four places | `rental-pricing.ts` is the single source (default 18%, `RENTAL_GST_PERCENT` to change). Customer quote, walk-in booking and extensions use it |
| Counter vs app price | Walk-in booking now uses the customer quote function (it ignored the hourly part before). New `POST /operations/rentals/walkin-quote`; the portal preview shows the API's numbers incl. GST rate and km package |
| Invented rental fleet data | Onboarding no longer fabricates a permit/policy number, "valid for a year" expiries, a VIN, a stock photo, or 250 km / ₹12 (API: `KM_POLICY_REQUIRED` unless the hub has a policy). Expiry fields no longer pre-fill. The VIN / permit / insurance / fitness details were first made mandatory here; they are optional again, see "Optional compliance details and reading sync" below |
| Walk-in driver licence | Expiry no longer pre-fills; the API rejects a licence that expires before the return date (`LICENSE_EXPIRES_BEFORE_RETURN`) |
| Mobile licence upload | "Use Sample Document" (a stock photo) now exists in development builds only |
| Service next-due | Not written when a vehicle is added; after a job only for periodic service (`service-intervals.ts`; `SERVICE_INTERVAL_KM`, `SERVICE_INTERVAL_DAYS`, `SERVICE_PERIODIC_CATEGORIES`) |
| Service walk-in doorstep | Counter form can book Doorstep pickup & return with an address (booked as an appointment, no check-in) |
| Facet / search aliases | Built from master data (names, built-in short names, `metadata.aliases` on a MAKE item); built-in defaults only if master data is unavailable |
| Existing spellings | `npm run db:normalize-names` in services/api (dry run by default; add `-- --apply` to write) |
| Tests | Service walk-in intake, doorstep, pricing, next-due, aliases, licence rule |

## Optional compliance details and reading sync (operations portal)
Reported: onboarding a rental car failed with "VIN, commercial permit, insurance policy and fitness certificate details ... are required" although the VIN field itself said "Optional", and the rental / service screens did not carry the fuel and odometer from one step to the next.

| Item | Cause | Fix |
|---|---|---|
| Compliance details required | The form and the API both insisted on all of them, and the database columns were NOT NULL | VIN, permit number / expiry, insurance policy / expiry and fitness expiry are optional. Migration `20261105030000_rental_fleet_compliance_optional` relaxes the six columns (additive; existing rows unchanged). Blank means "not on file" (NULL), never a made-up value; a date that is not a real date is still refused (`INVALID_COMPLIANCE_DATE`) |
| Availability with missing dates | The search required every expiry to be on or after the trip end, so a car with no date would have vanished | A date that is on file must cover the trip; a date that is not on file does not hide the car. The fleet list shows "Not on file: ..." (amber) or "Expired: ..." (red) so gaps and lapses are visible |
| Customer app | "Verified Commercial Compliance" showed a permit number and an insurance line for every car | Only the lines that are on file are shown; the card disappears when neither is |
| Onboarding readings | The odometer typed at onboarding was never sent (a made-up 12,000 sat in the field) | Current odometer and fuel level are optional inputs, saved with the car; blank leaves the car "not recorded". Stock photos are no longer attached to a new car |
| Service: custody never shown | The job API returns `custodyRecords` (text such as "75%") but the portal reads `custodyRecord.fuelPercent`, which did not exist. After check-in the Custody tab showed the intake form again, the odometer / fuel never appeared, and a cancelled job with the car in the workshop lost its "vehicle return required" warning | The API now adds `custodyRecord` (latest check-in) and `releaseRecord` (latest release) with numeric fuel (`custody-readings.ts`); the raw rows stay in `custodyRecords` |
| Service: release form not synced | Departure odometer / fuel started from the vehicle's old odometer / empty, so a release below the check-in reading failed on the server | Release odometer and fuel start from what the car arrived with (fuel can be changed if it was refuelled); the form shows "Checked in at ..." / "Arrived with ..." and warns before a too-low reading is sent |
| Rental: hand-over / return readings | Forms started from invented numbers (12,500 km / 100 % at hand-over, 12,850 km / 90 % at return) and notes ("Clean car, full tank fuel verified", "returned in good condition") | Hand-over starts from the car's recorded odometer / fuel ("Last recorded on this car: ..."), warns if lower; return readings start empty and show the start readings; notes start empty. The fleet list shows each car's recorded km and fuel, so the figures entered at return are what the next hand-over starts from |
| Rental: return charges | The portal's "Excess km" and "Damage charge" fields were sent as `excessKm` / `damageChargePaise`, which the API ignores - a damage charge entered at the counter was silently not applied | Excess km is worked out by the system and previewed from the readings; a damage charge now goes in as a damage claim (description required, optional "customer disputes" which holds it for finance review instead of deducting it) |
| Photos as evidence | Hand-over / return with no photos had a stock picture of another car attached by both the portal and the API | No photos attached means none recorded; the label is no longer marked required |
| Invented statements | Service check-in saved "Visual inspection complete. No major dents observed." and release "Vehicle delivered with invoice and warranty booklet" when the advisor wrote nothing; the history said "returned in spotless condition"; walk-in intake assumed 50 % fuel | Nothing is recorded that staff did not write; the history event states the odometer and fuel; no fuel reading is stored as "Not recorded" |
| Lag | An open booking / job never refreshed (a customer paying in the app left the hand-over blocked until the drawer was closed and re-opened); opening a job re-used the previous job's readiness and notes; details and release-readiness were fetched one after the other; photos uploaded one at a time | An open booking / job refreshes itself on the same change signal as the lists (no polling added while nothing changes; paused while a save is running); "Manage Trip" fetches the live booking immediately; opening a job clears the previous one's state; fetches run in parallel; photos upload in parallel. If an upload fails the photo is still saved inline as before, but staff are now told |
| Tests | `fleet-compliance-and-custody.test.ts` (optional details, availability query, custody readings, job payload, walk-in without a reading), three cases in `rental-api.test.ts` (no photos, damage claim, blank compliance), `readings.test.ts` in the portal |

Deploy: run `npm run db:deploy` (new migration) and `npm run db:generate` in `services/api`, then redeploy the Worker and the operations portal.

## Still open
- The onboarding form still derives a blank hourly rate as daily rate / 10.
- The website's service booking is intentionally disabled (no endpoint).
- A scheduled hand-over still records the reading entered even when it is lower than the car's recorded one (the form warns). Walk-in bookings refuse it. Rolling back needs the audited "Readings" correction, so this could be tightened to refuse as well.
- Photo upload failures are reported but the photo is still stored inline; the real fix is configuring the image service wherever uploads fail.
- The customer app's rental checkout still runs on demo payment identifiers (`pay_demo_...`) and ignores a failed licence submission; that is a separate piece of work.

## Driver details and reading corrections (follow-up)
| Item | Cause | Fix |
|---|---|---|
| Walk-in: made-up driver details | Missing licence number became "DL-WALKIN", missing expiry became "one year from now", missing photos became a stock picture of a car, experience became 3 years (also when 0 was entered), and the date of birth was always stored as 1990-01-01 - so the age check could never fail | Licence number, expiry, date of birth, years of experience (0 is valid) and both photos are required by the API and the counter form; the form gains a Date of Birth field. A driver under 18 is refused. Nothing is created (no customer, no booking) when one is missing |
| Hub licence upload | Expiry pre-filled with "one year from now", date of birth fixed at 1990-01-01, experience fixed at 5 | The form starts from the details already on file for the booking (or empty), asks for date of birth and experience, and the API requires them and checks the licence outlives the trip |
| KYC approval with nothing submitted | Approving (or rejecting) a booking with no licence on file created a placeholder licence ("PHYSICAL_VERIFIED_AT_HUB", 1990, a stock photo), and approving one with a missing photo filled in the stock picture - passing the KYC gate that guards the hand-over | Review refuses with `DRIVER_DOCUMENTS_MISSING` when nothing was submitted, and with `MANDATORY_LICENSE_DOCUMENTS_MISSING` / `DRIVING_LICENSE_EXPIRED_OR_EXPIRES_BEFORE_TRIP_END` on approval; no record is invented |
| Customer app checkout | The licence form came pre-filled with a licence number, a 2032 expiry, a 1998 birth date and 5 years' experience, and a blank experience became 3 | The fields start empty; date format, birth date, expiry and experience are checked before payment |
| No way to fix a wrong car reading | The recorded odometer / fuel of a rental car changed only through a hand-over, a return or onboarding | New `POST /operations/rentals/fleet/:id/readings` (rental manager, hub manager, operations manager, admin) and a "Readings" button on each fleet row. A reason is required, it is refused while the car is on a trip, and the previous and new values are kept as a `RENTAL_VEHICLE_READINGS_CORRECTED` audit event. Lowering the odometer shows a warning first |
| Tests | `walk-in-kyc-and-readings.test.ts` (driver rules, walk-in refusals, hub upload, KYC review, readings correction) and five router cases in `rental-api.test.ts` |

Existing bookings keep the details already stored. Any that carry the old stand-in values were never checked against a real licence and are worth re-checking at the counter. This read-only query lists them (a 1 Jan 1990 date of birth on its own is not proof, so it is not part of the filter):

```sql
SELECT "bookingId", "licenseNumber", "dateOfBirth", "status", "verifiedAt", "createdAt"
FROM "RentalDriverVerification"
WHERE "licenseNumber" IN ('DL-WALKIN', 'PHYSICAL_VERIFIED_AT_HUB')
   OR "licenseFrontUrl" LIKE 'https://images.unsplash.com/%'
   OR "licenseBackUrl" LIKE 'https://images.unsplash.com/%'
ORDER BY "createdAt" DESC;
```
