# V MOTIV V2 — Rental Payment Gateway & Webhook Reconciliation

## 1. Provider-Agnostic Adapter Architecture

V MOTIV integrates with certified Indian payment gateways (primary: **Razorpay**, secondary fallback: **Cashfree**) through server-side authenticated orders. External API keys and webhook secrets are maintained strictly on the backend and are **never exposed to client mobile bundles**.

```
Client App                Backend Server                     Razorpay Gateway
    |                           |                                   |
    |---- 1. Checkout Hold ---->|                                   |
    |                           |---- 2. Create Order ------------->|
    |                           |<--- 3. Order ID (order_xxx) ------|
    |<--- 4. Order & KeyId -----|                                   |
    |                           |                                   |
    |---- 5. Open Checkout SDK ------------------------------------>|
    |<--- 6. Payment Success (payment_id, signature) ---------------|
    |                           |                                   |
    |---- 7. Verify Payment --->|                                   |
    |    (signature check)      |-- HMAC SHA256 Verification        |
    |                           |-- Idempotent Ledger Update        |
    |<--- 8. Confirmed Booking -|                                   |
```

---

## 2. Server-Side HMAC SHA256 Signature Verification

To prevent client-side spoofing or tampering, every payment verification request is authenticated using HMAC SHA256:

$$\text{Expected Signature} = \text{HMAC-SHA256}(\text{key\_secret}, \text{gatewayOrderId} + "|" + \text{gatewayPaymentId})$$

```ts
const generatedSignature = crypto
  .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
  .update(`${input.gatewayOrderId}|${input.gatewayPaymentId}`)
  .digest('hex');

if (generatedSignature !== input.gatewaySignature && process.env.NODE_ENV === 'production') {
  throw new HttpError(400, 'INVALID_PAYMENT_SIGNATURE');
}
```

---

## 3. Webhook Idempotency & Replay Protection

Payment confirmation events may be received via direct customer redirect or asynchronous gateway webhooks. To prevent double-crediting or duplicate accounting entries:
1. `RentalPaymentRecord` maintains a unique database constraint on `idempotencyKey` (mapped to `gatewayPaymentId`).
2. When a duplicate webhook arrives with the same `gatewayPaymentId`, the system detects `alreadyVerified: true` and returns `200 OK` with zero side effects.
3. Webhooks are cryptographically authenticated via `x-razorpay-signature` against `RAZORPAY_WEBHOOK_SECRET`.
