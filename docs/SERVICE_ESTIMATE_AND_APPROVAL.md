# V MOTIV V2 — Service Estimate & Customer Approval Workflow

## 1. Technical Diagnosis & Estimate Creation

When a vehicle arrives at the service hub:
1. Operations checks in the vehicle (odometer, fuel, exterior condition) in Tab 3 (Custody).
2. The technician records diagnostic observations and scan results.
3. The Service Advisor creates an itemized digital estimate in Tab 4 (Estimate & Approval):
   - **Item Types**: `LABOUR`, `PART`, `CONSUMABLE`, `EXTERNAL_SERVICE`.
   - **Line Breakdown**: Description, Quantity, Unit Rate (₹), and Subtotal.
   - **Taxes & Logistics**: Optional doorstep pickup/return logistics fee.
   - **Version Number**: Initial estimate is Version 1 (`v1`). Supplemental work discovered during repairs increments the version (`v2`, `v3`).

---

## 2. Customer Estimate Review & Version Approval

Once the Service Advisor submits the estimate, its status transitions to `SENT_TO_CUSTOMER`.

### Mobile Notification & Review Screen
- In `ServiceRequestDetailsScreen.tsx`, the customer receives an interactive estimate card.
- Clicking **"Review & Approve Estimate"** opens a modal displaying:
  - Line-by-line item descriptions, quantities, and rates.
  - Subtotals for parts vs. labour.
  - Estimated tax calculation.
  - Service advisor notes and technician diagnostic findings.
- **Customer Decision**:
  - **Approve**: Customer enters optional notes and taps `Approve & Proceed`. The estimate status updates to `APPROVED`, automatically transitioning the job status to `WORK_IN_PROGRESS`.
  - **Decline**: Customer provides rejection reasons. The service advisor is notified to revise the scope or hold work.

---

## 3. Version Immutability & Audit Trail

Estimates in V MOTIV V2 are version-bound:
- Previous versions are never overwritten; they remain archived under `ServiceEstimate` with their original response timestamps.
- Every approval or decline generates an immutable event in `ServiceHistoryEvent` containing:
  - `actorId`: Customer's unique user ID.
  - `actorRole`: `CUSTOMER`.
  - `title`: `Service Estimate vX Approved by Customer`.
  - `description`: Approved amount in paise and customer feedback notes.
