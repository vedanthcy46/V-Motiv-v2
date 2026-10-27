# V MOTIV V2 — Service Estimates, Invoicing & Payments

## 1. Separation of Financial Components
V MOTIV strictly segregates automotive billing components to avoid fabricated repair estimates and obscure billing:

1. **Fixed Package Price**: Configured catalog price for standard maintenance (e.g. Regular Service: ₹4,999; AC Service: ₹2,499; Tyres: ₹1,499).
2. **Diagnostic Fee**: Fixed technical scanning and mechanical inspection fee (₹799) when a repair requires root-cause investigation. Waived or credited when extensive repairs are approved.
3. **Pickup & Return Logistics Fee**: ₹499 for doorstep transport.
4. **Approved Itemized Repairs**: Line items for replacement parts, workshop labour, and specialized consumables.
5. **Government Taxes (GST)**: Exact 18% GST (9% CGST + 9% SGST) calculated on the taxable base (subtotal + logistics + diagnosis - discounts).

---

## 2. Estimate Approval Lifecycle

```mermaid
sequenceDiagram
    participant Tech as Technician
    participant Adv as Service Advisor
    participant Cust as Customer Mobile
    participant Fin as Finance Department

    Tech->>Adv: Submits Diagnosis & recommended parts
    Adv->>Cust: Issues Itemized Estimate v1 (Status: SENT_TO_CUSTOMER)
    Cust->>Cust: Reviews itemized breakdown in modal
    alt Customer Approves
        Cust->>Adv: POST /estimates/:id/respond (decision: APPROVE)
        Note over Adv,Cust: Estimate becomes APPROVED; Status: ESTIMATE_APPROVED
        Adv->>Tech: Issues Work Order
    else Customer Declines
        Cust->>Adv: POST /estimates/:id/respond (decision: DECLINE, reason)
        Note over Adv,Cust: Status: ESTIMATE_REJECTED
        Adv->>Cust: Advisor contacts customer to revise scope
    end
```

### Versioning & Integrity:
- If a customer requests adjustments or revised parts, the advisor generates a new estimate version (e.g., `v2`).
- Previous estimates for that service request are automatically marked `SUPERSEDED`.
- Customer approval applies strictly to the specific version ID reviewed.

---

## 3. Strict Finance Payment Verification Rule

> **CRITICAL SECURITY REQUIREMENT**: Service Advisors, Technicians, and Hub Managers **CANNOT** set a payment to `PAID_VERIFIED`.

- Service Advisors can generate invoices and initiate payment records (Razorpay order ID, POS transaction ID, NEFT reference).
- Only an employee with the `FINANCE` or `SUPER_ADMIN` role can execute `POST /api/v2/operations/service/payments/:id/verify`.
- The backend verifies:
  1. The actor holds the `FINANCE` or `SUPER_ADMIN` role.
  2. The payment record exists and is in `PENDING` state.
  3. Transitions status to `PAID_VERIFIED` and marks the overall `ServiceRequest` as `PAID`.
- Attempts by non-finance staff return `403 INSUFFICIENT_ROLE_PERMISSIONS`.
