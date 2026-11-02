# V MOTIV V2 — Rental Installment Ledger & Financial Accounting

## 1. Overview

The V MOTIV V2 Rental Installment Ledger maintains an immutable, double-entry style audit log of every monetary transaction and balance obligation associated with car rental bookings.

---

## 2. Installment Structure

Each rental booking configured under a partial advance plan maintains two distinct financial installments:

### Installment 1: Initial Advance (`installmentType: "ADVANCE"`)
- **Purpose**: Secures the vehicle reservation hold and transitions booking status from `PENDING_PAYMENT` to `CONFIRMED`.
- **Amount**: Calculated based on policy percentage (e.g. 25% or 50% of `baseFarePaise + taxPaise`).
- **Due Date**: Immediate at booking checkout (within 15-minute hold TTL).
- **Status Progression**: `PENDING` $\rightarrow$ `PAID` (upon server-side webhook/verification).

### Installment 2: Remaining Balance (`installmentType: "BALANCE"`)
- **Purpose**: Settle the remaining rental charges prior to vehicle dispatch.
- **Amount**: Exactly $\text{Total Rental} - \text{Advance Paid}$.
- **Due Date**: 24 hours prior to scheduled trip start time (`balanceDueAt`).
- **Status Progression**:
  - `PENDING` (initial confirmed state)
  - `OVERDUE` (if clock crosses `balanceDueAt` and balance $> 0$)
  - `PAID` (upon successful balance payment verification)

---

## 3. Transaction Records (`RentalPaymentRecord`)

Every payment attempt that reaches a verified outcome creates an immutable entry in the `RentalPaymentRecord` table:

| Column | Type | Description |
|---|---|---|
| `id` | `String (UUID)` | Unique transaction identifier. |
| `bookingId` | `String (UUID)` | Foreign key reference to `RentalBooking`. |
| `amountPaise` | `BigInt` | Exact amount paid in paise. |
| `status` | `String` | Transaction status (`SUCCESS`, `SETTLED`). |
| `provider` | `String` | Payment gateway adapter (`RAZORPAY`, `STRIPE`, `CASH`, `DEMO_GATEWAY`). |
| `reference` | `String` | Gateway order ID, payment ID, or bank reference. |
| `installmentType` | `String` | `ADVANCE`, `BALANCE`, `SECURITY_DEPOSIT`, or `FULL`. |
| `createdAt` | `DateTime` | Authoritative server timestamp. |

---

## 4. State Transition Matrix

```
                     ┌───────────────────┐
                     │  PENDING_PAYMENT  │
                     └─────────┬─────────┘
                               │
               Advance Payment Verified (25% or 50%)
                               │
                               ▼
    ┌─────────────────────────────────────────────────────┐
    │                  CONFIRMED                          │
    │  rentalPaymentStatus: PARTIALLY_PAID               │
    │  verifiedPaidPaise: 200000 | outstanding: 600000   │
    │  pickupReadiness: BLOCKED (Rental Balance Pending)  │
    └──────────────────────────┬──────────────────────────┘
                               │
               Balance Payment Verified (₹6,000)
                               │
                               ▼
    ┌─────────────────────────────────────────────────────┐
    │                  CONFIRMED                          │
    │  rentalPaymentStatus: PAID_IN_FULL                 │
    │  verifiedPaidPaise: 800000 | outstanding: 0        │
    │  pickupReadiness: READY (if KYC is VERIFIED)        │
    └──────────────────────────┬──────────────────────────┘
                               │
               Handover Verification (Hub Pickup)
                               │
                               ▼
    ┌─────────────────────────────────────────────────────┐
    │               VEHICLE_COLLECTED / TRIP_ACTIVE       │
    └──────────────────────────┬──────────────────────────┘
                               │
               Return Inspection & Deposit Settlement
                               │
                               ▼
    ┌─────────────────────────────────────────────────────┐
    │                      SETTLED                        │
    └─────────────────────────────────────────────────────┘
```
