# V MOTIV V2 — Service Final Tax Invoice & GST Architecture

## 1. Statutory Invoice Generation

Upon completion of repairs and successful Quality Control sign-off, Operations generates an authoritative statutory tax invoice via:
- **Operations Portal UI**: `+ Generate Final Tax Invoice` in Tab 6 (Billing & Ledger).
- **REST Endpoint**: `POST /api/v2/operations/service/jobs/:id/invoices/generate`

### Invoice Numbering Convention
Official service invoices follow the standard format:
$$\text{INV-SR-YYYYMMDD-XXXX}$$
*(e.g., `INV-SR-20261103-4498`)*

---

## 2. Tax Computation & GST Math

Statutory tax calculations are executed with integer paise arithmetic:
- **Tax Rate**: 18% GST (Intrastate: 9% CGST + 9% SGST).
- **Gross Subtotal**: Sum of approved parts and labor lines.
- **Prepayment Credits**: Deducted from payable amount.

$$\text{CGST Paise} = \left\lfloor \frac{\text{Subtotal Paise} \times 9}{100} \right\rfloor$$
$$\text{SGST Paise} = \left\lfloor \frac{\text{Subtotal Paise} \times 9}{100} \right\rfloor$$
$$\text{Total Invoice Amount} = \text{Subtotal Paise} + \text{CGST Paise} + \text{SGST Paise}$$
$$\text{Outstanding Payable} = \max\left(0, \text{Total Invoice Amount} - \text{Prior Payments Credited}\right)$$

---

## 3. Invoice Breakdown Sample

```
========================================================================
                      V MOTIV AUTOMOTIVE CARE
                 GSTIN: 29AABCV1234F1Z8 · BENGALURU
========================================================================
Invoice Number : INV-SR-20261103-4498        Date : 03 Nov 2026
Service Job    : SR-20261102-4498            Status: ISSUED
Customer       : Denarius Lurten (+91 98469 48464)
Vehicle        : 2023 Ford Mustang [KA01MG2026]
------------------------------------------------------------------------
Description                              Qty    Unit Rate       Total
------------------------------------------------------------------------
1. Synthetic Engine Oil (3.5L)            1     ₹ 2,800.00   ₹ 2,800.00
2. OEM Oil Filter Cartridge               1       ₹ 450.00     ₹ 450.00
3. Periodic Inspection & Labor            1     ₹ 1,500.00   ₹ 1,500.00
------------------------------------------------------------------------
Gross Subtotal                                               ₹ 4,750.00
Less: Diagnostic Upfront Fee Credit                           -₹ 500.00
Less: Booking Advance Received (25%)                        -₹ 1,250.00
------------------------------------------------------------------------
Taxable Net Subtotal                                         ₹ 3,000.00
Central GST (CGST @ 9%)                                        ₹ 270.00
State GST (SGST @ 9%)                                          ₹ 270.00
------------------------------------------------------------------------
TOTAL INVOICE PAYABLE                                        ₹ 3,540.00
OUTSTANDING BALANCE DUE                                      ₹ 3,540.00
========================================================================
```

---

## 4. Multi-App Invoice Visibility

- **Customer Mobile**: Renders the complete invoice breakdown in `ServiceRequestDetailsScreen.tsx` with a single tap to pay the remaining ₹3,540 balance.
- **Operations Portal**: Tab 6 displays gross subtotal, CGST/SGST breakdown, prepayment credits, net total, and balance due.
- **Finance Portal**: Appears under `/finance/service/invoices` for automated reconciliation and quarterly GST filings.
