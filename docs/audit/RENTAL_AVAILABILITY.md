# Rental availability by requested dates

Status: IMPLEMENTED, unit-tested (pure logic), typecheck clean in API, mobile and Operations portal. NOT run against a real database, device or the live portal.

## Gaps found (code inspection)
1. **Unpaid bookings did not reserve the car.** `checkoutHold` marks the hold `CONVERTED` and creates the booking as `PENDING_PAYMENT`, but search, `createHold` and the payment-late check only looked at `CONFIRMED`/`VEHICLE_COLLECTED`/`TRIP_ACTIVE` bookings and `ACTIVE` holds. Between checkout and payment a second customer could hold and book the same car for overlapping dates.
2. **Busy cars were hidden, not explained.** `searchVehicles` filtered on `status = AVAILABLE` and dropped conflicting cars, so Person B never saw that the car was booked/on hold/in trip. The same filter also hid a car that is out on a trip today but free on the dates searched.
3. **Operations walk-in booking had no date-overlap check** (`createWalkInBooking` only checked the current dispatch status), so counter staff could double-book a car that already had a confirmed future booking.
4. **Operations fleet page** showed only the dispatch status (and raw `ON_TRIP`), with no per-date view; the walk-in car list offered every `AVAILABLE` car regardless of the dates chosen.
5. `createHold` claimed transaction locking but took no lock.
6. An overdue trip (`endTime` in the past, still `TRIP_ACTIVE`) did not occupy the car.

## What changed
- `services/api/src/rental-availability.ts`: one pure function, `computeAvailability`, returns `AVAILABLE | ON_HOLD | BOOKED | IN_TRIP | MAINTENANCE | CLEANING | UNAVAILABLE`, `bookable`, `availableFrom` (conflict end + turnaround buffer) and `holdExpiresAt`. Priority: IN_TRIP > BOOKED > ON_HOLD > blocks. A `PENDING_PAYMENT` booking blocks only while its checkout hold has not lapsed.
- `rental-store.ts`: `searchVehicles` (new `includeUnavailable` flag; default behaviour unchanged for old clients), `getVehicleDetails` (busy cars viewable, returns `availability`), `createHold` (same rules, `SELECT ... FOR UPDATE` on the vehicle row, best effort), `createWalkInBooking` (rejects overlapping dates), `getFleet` (optional `startTime`/`endTime` returns `availability` per car using three bounded queries).
- Mobile: search sends `includeUnavailable=true`; busy cars show a status pill (On hold / Booked / In trip / Maintenance), dimmed card, reason and "free again from"; the details screen disables Reserve with the same explanation; a lost race shows a clear message.
- Operations portal (Rental fleet): "Check availability from/to" with per-car badges (On hold / Booked / In trip, free-from time, hold expiry), "only bookable" filter and a bookable count; walk-in form disables cars that are not free for the chosen dates and blocks submit; vehicle status text now shows ON TRIP.
- Tests: `services/api/test/rental-availability.test.ts` (includes Person A Nov 6-9 vs Person B Nov 6-8) and `apps/customer-mobile/src/services/rental-availability.test.ts`.

## Not verified / follow-ups
- Run against a staging DB: concurrent `createHold` for the same car and dates. The row lock may not take effect with the Neon HTTP adapter used on Cloudflare Workers; the pending-payment rule above is the main protection, and a database-level exclusion constraint on (vehicle, time range) would be the strict fix.
- The customer website rental modal has no backend (see VM-AUDIT-003) and was not changed.
- Pending-payment bookings are not cancelled by a job when the hold lapses; they simply stop blocking.
