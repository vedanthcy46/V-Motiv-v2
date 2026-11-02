# V MOTIV V2 — Authoritative Rental Pickup Readiness Gate

## 1. Overview & Security Mandate

To safeguard company fleet assets, prevent unauthorized key release, and guarantee zero bad-debt write-offs, the V MOTIV V2 platform enforces an **authoritative, multi-point Pickup Readiness Gate**.

Neither customer mobile UI nor operations portal frontend controls can independently authorize vehicle dispatch. Physical vehicle dispatch is protected by server-side verification within `recordPickupHandover()`.

---

## 2. The 4-Point Authoritative Readiness Checklist

Before any rental vehicle may be physically handed over to a customer at a rental hub, all 4 of the following conditions must evaluate to `true`:

| Gate Item | Condition | Authoritative Source | Failure Outcome |
|---|---|---|---|
| **1. Booking Confirmed** | `booking.status !== 'CANCELLED' && booking.status !== 'PENDING_PAYMENT'` | `RentalBooking.status` | Handover rejected with `400 INVALID_BOOKING_STATUS` |
| **2. Rental Charges Paid in Full** | `outstandingBalancePaise === 0n && (rentalPaymentStatus === 'PAID_IN_FULL' || verifiedPaidPaise >= totalRentalPaise)` | `RentalBooking.outstandingBalancePaise` | Handover rejected with `403 RENTAL_BALANCE_PENDING_CANNOT_HANDOVER_VEHICLE` |
| **3. Driver KYC Verified** | `booking.kycStatus === 'VERIFIED'` | `RentalBooking.kycStatus` | Handover rejected with `400 DRIVER_KYC_NOT_VERIFIED` |
| **4. Vehicle Ready & Assigned** | `vehicle.isEligibleForRental && vehicle.status === 'AVAILABLE'` | `RentalFleet.status` | Handover rejected with `400 VEHICLE_NOT_AVAILABLE` |

---

## 3. Server-Side Enforcement (`services/api/src/rental-store.ts`)

In `recordPickupHandover`:
```typescript
const readiness = computePickupReadiness(booking, vehicle);
if (!readiness.checklist.rentalPaymentComplete) {
  const err = new Error(
    `Cannot handover vehicle ${booking.vehicleId} for booking ${booking.bookingNumber}. Outstanding rental balance of ₹${Math.round(Number(booking.outstandingBalancePaise) / 100).toLocaleString('en-IN')} must be fully settled prior to vehicle release.`
  );
  (err as any).statusCode = 403;
  (err as any).code = 'RENTAL_BALANCE_PENDING_CANNOT_HANDOVER_VEHICLE';
  throw err;
}
```

---

## 4. User Experience & UI Gates

### Customer Mobile App (`apps/customer-mobile`)
- **Rental Cards (`RequestsScreen.tsx`)**:
  - Displays `⊘ PICKUP BLOCKED` badge in red when rental balance is outstanding or KYC is pending.
  - Displays `✓ PICKUP READY` in emerald green when rental charges are paid in full and KYC is approved.
- **Booking Details (`RentalBookingDetailsScreen.tsx`)**:
  - Displays an interactive **Pickup Readiness Checklist Card** showing the status of each requirement.
  - Shows an on-demand **Pay Remaining Balance** button that opens a keyboard-aware sheet to settle the balance via UPI, Card, Net Banking, or Demo Gateway.

### Operations Portal (`apps/operations-portal`)
- **Fleet Table**:
  - Features dedicated **Pickup Gate** badge (`✓ READY` vs `⊘ BLOCKED`) with hover tooltip detailing specific blocking reasons.
- **Trip Management Drawer**:
  - Dedicated **Pickup Readiness Gate Checklist** in the Overview tab.
  - In the Handover tab, a prominent warning alert is displayed, and the "Confirm Handover & Start Trip" button is completely disabled if `outstandingBalancePaise > 0`.
