# V MOTIV V2 — Rental Advance Payment, Full Payment & Balance Tracking Architecture

## 1. Overview & Architecture Philosophy

The V MOTIV V2 Car Rental Advance Payment Platform introduces a production-grade, authoritative partial and full payment workflow for car rentals across:
- **Shared Backend Service (`services/api`)**: Express router, Prisma ORM on PostgreSQL, payment gateway webhooks, and ledger engine.
- **Customer Mobile App (`apps/customer-mobile`)**: React Native / Expo booking checkout, flexible payment plan selection, live payment schedule timeline, and on-demand balance settlement sheet.
- **Operations Portal (`apps/operations-portal`)**: Real-time KPI summary widgets, payment status filters, enriched bookings table, authoritative pickup readiness gate, and financial transaction ledger in the trip management drawer.

### Architectural Principles
1. **Single Source of Truth**: All booking, schedule, and transaction calculations occur on the authoritative backend. Frontend clients never compute financial obligations or simulate payment outcomes.
2. **Integer Arithmetic (Paise Precision)**: All monetary figures are stored and processed in 64-bit integer paise (BigInt). Base rental charges, GST (18%), advance amounts, and remaining balances satisfy `advancePaise + balancePaise === totalRentalPaise` without rounding drift.
3. **Strict Separation of Security Deposits**: Refundable security deposits are tracked separately (`depositStatus: 'NOT_COLLECTED' | 'COLLECTED' | 'REFUND_QUEUED' | 'REFUNDED' | 'RETAINED'`). They are NEVER counted as rental revenue and NEVER deducted from rental balance obligations.
4. **Authoritative Pickup Readiness Gate**: Physical release of vehicles is governed by a 4-point server-side checklist. Vehicles can **never** be handed over if `outstandingBalancePaise > 0` or driver KYC is unverified.
5. **No Separate Payment Databases**: All payment orders and verified transactions leverage the existing `RentalBooking` and `RentalPaymentRecord` schemas, ensuring transactional integrity.

---

## 2. Data Model Extensions (`services/api/prisma/schema.prisma`)

```prisma
model RentalBooking {
  id                      String   @id @default(uuid())
  bookingNumber           String   @unique
  customerId              String
  vehicleId               String
  pickupHubId             String
  returnHubId             String
  startTime               DateTime
  endTime                 DateTime
  status                  String   @default("CONFIRMED")
  kycStatus               String   @default("PENDING_REVIEW")
  
  // Financial obligations (in paise)
  baseFarePaise           BigInt   @default(0)
  taxPaise                BigInt   @default(0)
  securityDepositPaise    BigInt   @default(0)
  totalPayablePaise       BigInt   @default(0)
  
  // Advance Payment & Balance Tracking
  paymentPlanSnapshot     Json?
  rentalPaymentStatus     String?  @default("NOT_PAID")
  depositStatus           String?  @default("NOT_COLLECTED")
  balanceDueAt            DateTime?
  verifiedPaidPaise       BigInt   @default(0)
  outstandingBalancePaise BigInt   @default(0)

  paymentRecords          RentalPaymentRecord[]
  trip                    RentalTrip?
  tripEvidence            RentalTripEvidence?
}

model RentalPaymentRecord {
  id              String   @id @default(uuid())
  bookingId       String
  amountPaise     BigInt
  status          String
  provider        String
  reference       String?
  installmentType String?  // "ADVANCE" | "BALANCE" | "SECURITY_DEPOSIT" | "FULL"
  createdAt       DateTime @default(now())

  booking         RentalBooking @relation(fields: [bookingId], references: [id])
}

model RentalPaymentPolicy {
  id                    String   @id @default(uuid())
  version               String   @unique
  name                  String
  advancePercentage     Int      @default(25)
  fullPaymentWindowHours Int     @default(24)
  balanceDueHoursBeforePickup Int @default(24)
  isActive              Boolean  @default(true)
  config                Json?
  createdAt             DateTime @default(now())
}
```

---

## 3. End-to-End Workflow

```
   [ Customer Mobile ]                             [ Shared API ]                       [ Ops Portal ]
          │                                              │                                    │
1. Select Dates & Vehicle                                │                                    │
          │ ─── GET /api/v2/rentals/holds/:id/payment-options ───>                            │
          │ <── Available Plans (25%, 50%, 100%) + Due Dates ───│                             │
          │                                              │                                    │
2. Choose Plan & Pay Advance                             │                                    │
          │ ─── POST /api/v2/rentals/holds/:id/checkout ─>                                    │
          │     (paymentPlanId: "ADVANCE_25")            │                                    │
          │ <── Payment Order (advancePaise) ────────────│                                    │
          │                                              │                                    │
3. Complete Gateway Payment                              │                                    │
          │ ─── POST /api/v2/rentals/payments/verify ────>                                    │
          │     (status: "CONFIRMED",                    │                                    │
          │      rentalPaymentStatus: "PARTIALLY_PAID",  │                                    │
          │      verifiedPaidPaise: 200000,              │                                    │
          │      outstandingBalancePaise: 600000)        │                                    │
          │ <── Booking Confirmed ───────────────────────│ ── Live Dashboard Sync ──────────> │
          │                                              │    (Partially Paid Widget +1)      │
          │                                              │    (Pickup Gate: BLOCKED)          │
4. View My Rentals / Trip Details                        │                                    │
          │ ─── GET /api/v2/rentals/bookings/:id/summary >                                    │
          │ <── Financial breakdown & Due Date ──────────│                                    │
          │                                              │                                    │
5. Pay Remaining Balance Before Due Date                 │                                    │
          │ ─── POST .../balance-order & verify ─────────>                                    │
          │     (rentalPaymentStatus: "PAID_IN_FULL",    │                                    │
          │      outstandingBalancePaise: 0)             │                                    │
          │ <── Balance Settled ─────────────────────────│ ── Authoritative Gate Update ────> │
          │                                              │    (Pickup Gate: READY)            │
          │                                              │                                    │
6. Customer Arrives at Hub for Pickup                    │                                    │
                                                         │ <── POST .../handover ──────────── │
                                                         │     (Validates balance == 0 & KYC) │
                                                         │ ─── Vehicle Dispatched ──────────> │
```

---

## 4. API Specification

| Endpoint | Method | Role | Description |
|---|---|---|---|
| `/api/v2/rentals/holds/:id/payment-options` | `GET` | Customer | Evaluates notice window against `VMR-POL-2026.1` and returns available plans (25%, 50%, 100%) with exact rupee calculations and deadlines. |
| `/api/v2/rentals/holds/:id/checkout` | `POST` | Customer | Reserves booking hold, snapshots selected payment plan, generates payment order for advance or full amount. |
| `/api/v2/rentals/bookings/:id/payment-summary` | `GET` | Customer / Ops | Returns authoritative rental obligations, verified paid, outstanding balance, deposit, and readiness gate. |
| `/api/v2/rentals/bookings/:id/payment-schedule` | `GET` | Customer / Ops | Returns installment schedule (advance and balance amounts, status, due dates). |
| `/api/v2/rentals/bookings/:id/payment-history` | `GET` | Customer / Ops | Returns full payment transaction audit trail from `RentalPaymentRecord`. |
| `/api/v2/rentals/bookings/:id/balance-order` | `POST` | Customer | Generates idempotent payment order for outstanding rental balance. |
| `/api/v2/rentals/bookings/:id/verify-balance-payment` | `POST` | Customer | Verifies balance payment server-side and marks booking `PAID_IN_FULL`. |
| `/api/v2/rentals/bookings/:id/pickup-readiness` | `GET` | Customer / Ops | Evaluates authoritative 4-point gate checklist. |
| `/api/v2/operations/rentals/dashboard/payments` | `GET` | Ops | Returns fleet-wide payment KPIs (partially paid, fully paid, overdue, blocked pickups, pending reconciliations). |
| `/api/v2/operations/rentals/bookings/:id/handover` | `POST` | Ops | Dispatches vehicle; strictly rejects handover if rental balance is unpaid or KYC unverified. |
