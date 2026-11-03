# V MOTIV V2 — Service Operations Payment Tracking & Workflow

## 1. Operations Queue Table Columns

The Operations Manager Portal table (`apps/operations-portal/src/components/ServiceOperationsPanel.tsx`) provides complete financial tracking across all jobs:

| Column | Data Rendered |
| :--- | :--- |
| **JOB # & DATE** | `SR-20261102-4498`, Creation Date |
| **CUSTOMER** | Display Name, Phone / Email |
| **VEHICLE** | Make, Model, Year, Registration Plate Pill |
| **CATEGORY & FULFILLMENT** | Service Category, Fulfillment Mode, **Customer Requirement Badge** (`Req: AC cooling feels low...`) |
| **SCHEDULED SLOT** | Appointment Date & Bay Time Window |
| **ESTIMATE** | Approved / Pending Estimate Amount (₹) |
| **PAYMENT STATE** | **Payment Status Badge** (`PAID IN FULL`, `PARTIAL`, `UNPAID`), **Verified Paid (₹)**, **Balance Due (₹)** |
| **STATUS** | Operational State Badge (`CHECKED_IN`, `WORK_IN_PROGRESS`, `QC_PENDING`, `PAYMENT_PENDING`, `COMPLETED`) |
| **ACTIONS** | `Manage Job` button |

---

## 2. Manage Job Modal Financial Controls

Clicking `Manage Job` on any request displays structured operational and financial tabs:
1. **Details Tab**: Displays vehicle specs, custody odometer, customer symptoms, diagnostic questionnaires, and the **Selected Booking Plan** (`ZERO_UPFRONT` / `PARTIAL_ADVANCE_25` / `FULL_PAYMENT_100`).
2. **Tab 4 (Estimate & Approval)**: Line-item editor for parts and labor, version increments, and customer approval status.
3. **Tab 5 (Quality Control)**: QC checklist and road-test sign-off (`PASS` vs `REWORK_REQUIRED`).
4. **Tab 6 (Billing & Ledger)**:
   - Financial KPI Summary: Approved Estimate / Total Collected / Balance Due.
   - **Official Tax Invoice Card**: Shows invoice number, gross subtotal, 18% GST (CGST + SGST), prepayment deductions, and a one-click button `+ Generate Final Tax Invoice`.
   - **Transaction Records History Table**: Complete chronological list of payments (Date, Type, Amount, Gateway, Transaction ID, Verification Status).
   - **Record Payment Form**: Counter payment recorder for UPI QR, POS Card terminal, Cash, or NEFT transfers with instant counter verification.
5. **Tab 7 (Release & Handover)**: Authoritative release readiness gate.
