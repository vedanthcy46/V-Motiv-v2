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
| Invented rental fleet data | Onboarding no longer fabricates a permit/policy number, "valid for a year" expiries, a VIN, a stock photo, or 250 km / ₹12 (API: `COMPLIANCE_DETAILS_REQUIRED`, `KM_POLICY_REQUIRED` unless the hub has a policy). Expiry fields no longer pre-fill |
| Walk-in driver licence | Expiry no longer pre-fills; the API rejects a licence that expires before the return date (`LICENSE_EXPIRES_BEFORE_RETURN`) |
| Mobile licence upload | "Use Sample Document" (a stock photo) now exists in development builds only |
| Service next-due | Not written when a vehicle is added; after a job only for periodic service (`service-intervals.ts`; `SERVICE_INTERVAL_KM`, `SERVICE_INTERVAL_DAYS`, `SERVICE_PERIODIC_CATEGORIES`) |
| Service walk-in doorstep | Counter form can book Doorstep pickup & return with an address (booked as an appointment, no check-in) |
| Facet / search aliases | Built from master data (names, built-in short names, `metadata.aliases` on a MAKE item); built-in defaults only if master data is unavailable |
| Existing spellings | `npm run db:normalize-names` in services/api (dry run by default; add `-- --apply` to write) |
| Tests | Service walk-in intake, doorstep, pricing, next-due, aliases, licence rule |

## Still open
- The onboarding form still derives a blank hourly rate as daily rate / 10.
- The website's service booking is intentionally disabled (no endpoint).
