# V MOTIV V2 — Rental Advance Payment & Balance Tracking Test Results

## 1. Test Execution Summary

- **Test Suite**: Vitest v4.1.12
- **Command**: `npm test -w @vmotiv/api`
- **Result**: **16 Passed, 0 Failed, 5 Skipped (21 Test Files)**
- **Total Test Cases**: **167 Passed, 0 Failed, 23 Skipped (190 Total)**
- **Typecheck Status**:
  - `@vmotiv/api`: **Clean (0 errors)**
  - `@vmotiv/customer-mobile`: **Clean (0 errors)**
  - `@vmotiv/operations-portal`: **Clean (0 errors)**
  - Operations Portal Build (`vite build`): **Production artifact generated successfully**

---

## 2. Rental Payment Specific Test Cases (`services/api/test/rental-api.test.ts`)

| # | Test Description | Status | Verification Detail |
|---|---|---|---|
| 1 | Rental hold pricing computation | Passed | Accurate base daily fare + 18% GST calculation |
| 2 | Rental payment policy defaults & plan evaluation | Passed | Policy `VMR-POL-2026.1` correctly offers `ADVANCE_25` and `FULL_100` for trips >72h |
| 3 | Exact integer paise breakdown | Passed | Verifies $\text{advancePaise} + \text{balancePaise} \equiv \text{totalRentalPaise}$ |
| 4 | Security deposit separation | Passed | Verifies security deposit is stored separately and not deducted from rental fare |
| 5 | Booking checkout with 25% advance plan | Passed | Correctly creates advance payment order and records plan snapshot |
| 6 | Server-side payment verification | Passed | Transitions booking to `CONFIRMED`, `PARTIALLY_PAID`, and tracks balance |
| 7 | Payment summary & schedule endpoints | Passed | Exposes accurate remaining balance, balance due date, and installment rows |
| 8 | Authoritative Pickup Readiness Gate | Passed | Correctly reports `isReady: false` with reason `Rental balance is unpaid` |
| 9 | Vehicle handover rejection on unpaid balance | Passed | Calling `recordPickupHandover` throws `403 RENTAL_BALANCE_PENDING_CANNOT_HANDOVER_VEHICLE` |
| 10 | On-demand balance payment order creation | Passed | Generates exact balance payment order with idempotency key |
| 11 | Balance verification & status transition | Passed | Transitions status to `PAID_IN_FULL` and sets `outstandingBalancePaise: 0n` |
| 12 | Vehicle handover success post balance settlement | Passed | Dispatches vehicle and transitions booking to `VEHICLE_COLLECTED` |
| 13 | Operations payment dashboard metrics | Passed | Correctly calculates partially paid, fully paid, and blocked pickup counts |

---

## 3. UI/UX Verification Across Frontends

### Customer Mobile App (`apps/customer-mobile`)
1. **Rental Checkout Screen**:
   - Radio buttons for payment options (25% Advance vs 100% Full Payment) dynamically populated from backend policy.
   - Fare summary reflects actual advance payable now, remaining balance, and balance deadline (24 hours before pickup).
2. **Rental Details Screen**:
   - Comprehensive **Financial Summary & Obligations** card.
   - Live **Authoritative Pickup Readiness Gate** checklist.
   - **Payment Installment Schedule** timeline.
   - Interactive **Pay Remaining Balance** modal sheet supporting UPI, Card, Net Banking, and Demo sandbox.
3. **Requests Screen**:
   - Rental cards in the 'RENTAL' tab render payment plan badges (`25% ADVANCE`), payment status badges (`PARTIALLY PAID`, `PAID IN FULL`), paid vs pending amounts, and pickup readiness status (`✓ PICKUP READY` vs `⊘ PICKUP BLOCKED`).

### Operations Portal (`apps/operations-portal`)
1. **Summary KPI Widgets**:
   - 5 KPI widgets displayed above bookings table: Partially Paid, Paid in Full, Overdue Payments, Pickups Blocked, Pending Reconciliation.
2. **Bookings Table**:
   - Columns: Booking # & Date, Customer, Car Booked, Trip Dates, Payment Plan, Rental Total & Paid, Balance Due, Payment Status, Pickup Gate, Actions.
   - Filter tabs: `ALL`, `PARTIALLY_PAID`, `PAID_IN_FULL`, `OVERDUE`, `CONFIRMED`, `TRIP_ACTIVE`, `RETURN_INSPECTED`, `SETTLED`, `CANCELLED`.
3. **Trip Management Drawer**:
   - **Overview Tab**: Shows Payment & Financial Obligations card and Pickup Readiness Gate checklist.
   - **Billing & Ledger Tab**: Full installment schedule and transaction history ledger.
   - **Handover Tab**: Strictly blocks handover and disables dispatch button if outstanding balance $> 0$.
