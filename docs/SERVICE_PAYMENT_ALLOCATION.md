# V MOTIV V2 — Service Payment Allocation & Prepayment Crediting

## 1. Prepayment Allocation Hierarchy

V MOTIV V2 enforces a strict payment allocation hierarchy when reconciling customer service transactions:

$$\text{Final Outstanding Due} = \text{Invoice Total (with GST)} - \left( \sum \text{Booking Advances} + \sum \text{Diagnostic Fees} + \sum \text{Intermediate Advances} \right)$$

### Allocation Priority
1. **Diagnostic Fee Credit**: Diagnostic or inspection fees paid upfront (e.g. ₹500) are automatically credited against the final bill when repairs are authorized and performed.
2. **Booking Prepayments**: 25% or 50% partial advances paid during booking creation are applied directly to reduce the gross payable amount.
3. **Parts Advances**: High-value spare parts orders requiring 50% upfront deposit are credited prior to tax calculation.
4. **Remaining Balance**: Settled either via Customer Mobile (Razorpay UPI/Card) or Operations Counter POS (UPI QR, Card, Cash).

---

## 2. Real-Time Balance Recomputation

Whenever any payment is verified by the backend (`services/api/src/service-store.ts`), the following state reconciliation executes in a database transaction:

```ts
const totalVerifiedPaidPaise = verifiedPayments.reduce(
  (sum, p) => sum + p.amountPaise,
  0n
);

const effectiveBillPaise = finalInvoice
  ? finalInvoice.totalAmountPaise
  : (approvedEstimate ? approvedEstimate.totalAmountPaise : packagePricePaise);

const outstandingPaise = effectiveBillPaise > totalVerifiedPaidPaise
  ? effectiveBillPaise - totalVerifiedPaidPaise
  : 0n;

const newStatus = outstandingPaise === 0n && totalVerifiedPaidPaise > 0n
  ? 'PAID_IN_FULL'
  : (totalVerifiedPaidPaise > 0n ? 'PARTIALLY_PAID' : 'UNPAID');
```

---

## 3. Idempotent Payment Recording

To prevent double-counting of counter receipts or multiple webhook callbacks:
- Every `ServicePaymentRecord` requires a unique `idempotencyKey`.
- Attempting to record the same transaction returns the existing record rather than duplicating credits.
- All balance deductions update both `ServiceRequest.outstandingBalancePaise` and the corresponding `ServiceInvoice.outstandingPaise`.
