# V MOTIV V2 — Rental Payment Policy (`VMR-POL-2026.1`)

## 1. Executive Summary

This document governs the rental payment terms, installment configurations, deadlines, and balance obligations for self-drive car rentals within the V MOTIV V2 platform.

- **Current Active Policy Version**: `VMR-POL-2026.1`
- **Effective Date**: 2026-11-03
- **Applicability**: All customer-facing and offline hub rental reservations.

---

## 2. Configurable Payment Tiers & Notice Windows

| Notice Window Before Pickup | Eligible Payment Plans | Default Plan | Balance Payment Due Date |
|---|---|---|---|
| **> 72 Hours** | • `ADVANCE_25` (25% Advance)<br>• `FULL_100` (100% Full Payment) | `ADVANCE_25` | 24 Hours prior to scheduled pickup time |
| **24 to 72 Hours** | • `ADVANCE_50` (50% Advance)<br>• `FULL_100` (100% Full Payment) | `ADVANCE_50` | 24 Hours prior to scheduled pickup time |
| **< 24 Hours** | • `FULL_100` (100% Full Payment only) | `FULL_100` | Immediate (at checkout) |

### Business Rules & Safeguards
1. **Notice Window Evaluation**: Notice is computed as `startTime - currentTime` at the moment quote payment options are fetched.
2. **Partial Eligibility Restriction**: An advance plan is only presented if the resulting balance payment due date is in the future.
3. **Exact Integer Arithmetic**:
   $$\text{Advance Paise} = \left\lfloor \frac{\text{Total Rental Paise} \times \text{Advance Percentage}}{100} \right\rfloor$$
   $$\text{Balance Paise} = \text{Total Rental Paise} - \text{Advance Paise}$$
   This guarantees $\text{Advance Paise} + \text{Balance Paise} \equiv \text{Total Rental Paise}$.

---

## 3. Security Deposit Governance

1. **Separation from Rental Fare**:
   - The security deposit is a refundable guarantee held against excess kilometers, fuel refilling deficits, and vehicle damages.
   - It is **never** counted as rental revenue.
   - It is **never** deducted from rental balance obligations.
2. **Collection Policy**:
   - Security deposit may be authorized at booking checkout or collected during hub pickup check-in.
   - It is held in escrow until trip completion and physical return inspection.
3. **Reconciliation & Refund**:
   - Upon return inspection and odometer/fuel verification, final settlement is computed:
     $$\text{Deposit Refund} = \max(0, \text{Deposit} - (\text{Excess Km Charges} + \text{Fuel Refill Charges} + \text{Damage Deductions}))$$
   - Any approved refund is queued for automatic reversal to the customer's source account within 24-48 hours.

---

## 4. Policy Versioning & Immutability

1. **Policy Snapshots**: When a customer confirms a booking hold, a snapshot of the payment policy and plan is permanently recorded on the `RentalBooking.paymentPlanSnapshot` column.
2. **Active Reservation Stability**: Even if admin administrators update default payment percentages or grace periods in `RentalPaymentPolicy`, existing confirmed reservations retain their original agreed-upon terms, percentages, and deadlines.
3. **Grace Period & Cancellation Handling**:
   - If remaining balance is unpaid past the 24h deadline, the reservation is flagged as `OVERDUE`.
   - Operations staff receive automated alerts, and customer notifications are triggered.
   - Physical vehicle release is strictly gated until balance is cleared.
