# V MOTIV V2 — Service Booking Payment Options & Policies

## 1. Configured Payment Options

Under active policy `VMS-POL-2026.1`, the backend dynamically generates customer payment options based on the chosen category's pricing type (`FIXED` vs `ESTIMATE_REQUIRED`):

| Plan ID | Title | Upfront Payable | Remaining Balance | Eligibility |
| :--- | :--- | :--- | :--- | :--- |
| `ZERO_UPFRONT` | Zero Upfront Booking | **₹0** | 100% of Package / Estimate | Universal |
| `PARTIAL_ADVANCE_25` | Priority Advance (25%) | **25%** of Package Fee | 75% due on completion | Fixed Packages |
| `FULL_PAYMENT_100` | Full Advance (100%) | **100%** of Package Fee | ₹0 due | Fixed Packages |
| `DIAGNOSTIC_FEE` | Diagnostic Inspection Fee | Diagnostic Fee (e.g. **₹500**) | Post-check estimate | Diagnostic / Quote categories |

---

## 2. Dynamic Package Pricing & Feature Management

Operations Managers, Service Advisors, and Admins can adjust category pricing, diagnostic fees, and deliverables at any time via:
- **Operations Portal UI**: `⚙️ Service Pricing & Packages` button in the top bar.
- **REST Endpoint**: `PUT /api/v2/operations/service/categories/:key/pricing`

### Request Payload Example
```json
{
  "pricingType": "FIXED",
  "fixedPackageAvailable": true,
  "packagePriceRupees": 5499,
  "diagnosticFeeRupees": 500,
  "packageFeatures": [
    "Comprehensive 50-point Vehicle Health Checklist",
    "Fully Synthetic Engine Oil & OEM Filter Replacement",
    "Brake System Inspection & Caliper Cleaning",
    "Air & Cabin Pollen Filter Service",
    "Complimentary Foam Wash & Interior Sanitization"
  ]
}
```

### Immediate Propagation
Changes made in the Operations Portal update the Neon PostgreSQL `ServiceIssueTemplate` records and immediately reflect across:
- `apps/customer-mobile` Step 2 (Category Selection) & Step 6 (Review & Payment Options).
- `apps/customer-web` Service Modal package cards.
- API calculation endpoints (`/api/v2/service/categories/:key/payment-options`).

---

## 3. Customer Mobile Booking UX (Step 6)

In Step 6 of the Service Booking wizard (`ServiceHomeScreen.tsx`):
1. The app fetches authorized options via `fetchCategoryPaymentOptions(selectedCategory.categoryKey)`.
2. Interactive radio cards present the exact upfront amount and remaining balance for each plan.
3. If an advance option is selected, the secure payment gateway (Razorpay) is triggered, generating order and payment IDs.
4. On verification, the service request is created with `servicePaymentStatus: 'PARTIALLY_PAID'` or `'PAID_IN_FULL'`, locking workshop priority and bay allocation.
