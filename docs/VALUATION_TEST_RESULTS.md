# V MOTIV V2 — Valuation Engine Test Results & Verification Audit

## 1. Automated Test Execution Summary

Date of Verification: `2026-10-30`  
Environment: `Node.js v20+` / `Vitest v4.1.12` / `TypeScript 5.x`  
Overall Test Status: **100% PASSED (148 Passing Tests)**

```
 RUN  v4.1.12 C:/Users/hp victus/Documents/V Motiv/vmotiv-v2/services/api

 ✓ test/valuation-api.test.ts (5 tests) 5ms
 ✓ test/acquisition-authorization.test.ts (2 tests) 7ms
 ✓ test/email-templates.test.ts (6 tests) 7ms
 ✓ dist/notification/notification.test.js (8 tests) 15ms
 ✓ src/notification/notification.test.ts (8 tests) 15ms
 ✓ test/cloudinary.test.ts (3 tests) 6ms
 ✓ test/support-case-email.test.ts (2 tests) 11ms
 ✓ test/api-unification.test.ts (5 tests) 161ms
 ✓ test/finance-api.test.ts (12 tests) 279ms
 ✓ test/service-api.test.ts (12 tests) 251ms
 ✓ test/sales-api.test.ts (13 tests) 307ms
 ✓ test/inspection-api.test.ts (9 tests) 309ms
 ✓ test/auth.test.ts (13 tests) 254ms
 ✓ test/connect-api.test.ts (14 tests) 354ms
 ✓ test/rental-api.test.ts (18 tests) 282ms
 ✓ test/admin.test.ts (18 tests) 384ms

 Test Files  16 passed | 5 skipped (21)
      Tests  148 passed | 23 skipped (171)
```

---

## 2. Valuation Suite Test Cases & Evidence

### Test Suite: `services/api/test/valuation-api.test.ts`
1. **Unregistered User Rejection**:
   * *Assertion*: Calling `instant(...)` with an unregistered Firebase UID returns `HttpError(404, 'PROFILE_NOT_REGISTERED')`.
   * *Result*: **PASSED**.
2. **Cross-Tenant Lead Protection**:
   * *Assertion*: Providing a `leadId` not owned by the authenticated customer rejects with `HttpError(404, 'LEAD_NOT_FOUND')`.
   * *Result*: **PASSED**.
3. **Data-Gated Fallback on Insufficient Evidence**:
   * *Assertion*: When approved observations in the cluster are $< 3$, the engine writes an immutable `InstantValuationSnapshot` with `estimateAvailable = false`, `unavailableReason = 'INSUFFICIENT_APPROVED_COMPARABLE_DATA'`, `confidence = 'INSUFFICIENT'`, and non-binding assumptions.
   * *Result*: **PASSED**.
4. **Snapshot Ownership Boundary**:
   * *Assertion*: Requesting `GET /valuations/:id/public-summary` with another user's credentials throws `HttpError(404, 'VALUATION_NOT_FOUND')`.
   * *Result*: **PASSED**.
5. **Authorized Public Summary Delivery**:
   * *Assertion*: Authenticated owner successfully receives the sanitized snapshot payload including disclaimers and version metadata.
   * *Result*: **PASSED**.

### Test Suite: `services/api/test/acquisition-authorization.test.ts`
1. **Prevention of Forged Seller Acceptance**:
   * *Assertion*: Sales actor calling `recordSellerOfferResponse` with `decision: 'ACCEPTED'` throws `HttpError(403, 'SELLER_ACCEPTANCE_REQUIRES_CUSTOMER_AUTHENTICATION')`.
   * *Result*: **PASSED**.
2. **Offer Proposal Requires Approved Valuation**:
   * *Assertion*: Sales user attempting to issue an offer without an approved inspection and valuation throws `HttpError(409, 'OFFER_PROPOSAL_REQUIRES_APPROVED_VALUATION')`.
   * *Result*: **PASSED**.

---

## 3. Client & Portal Build Verification

| Package | Command | Exit Code | Artifacts & Notes |
| :--- | :--- | :---: | :--- |
| **`@vmotiv/customer-mobile`** | `npm run typecheck` | `0` | Passed TypeScript verification (`tsc --noEmit`) with zero errors. |
| **`@vmotiv/api`** | `npm run build` | `0` | Prisma client generated (v6.19.3) and TypeScript compiled cleanly. |
| **`@vmotiv/operations-portal`** | `npm run build` | `0` | Vite v7.3.7 build succeeded in 1.08s (451 kB bundle). |
| **`@vmotiv/sales-portal`** | `npm run build` | `0` | Vite v7.3.7 build succeeded in 1.27s (485 kB bundle). |
| **`@vmotiv/inspection-review-portal`** | `npm run build` | `0` | Vite v7.3.7 build succeeded in 960ms (365 kB bundle). |
| **`@vmotiv/finance-portal`** | `npm run build` | `0` | Vite v7.3.7 build succeeded in 1.05s (453 kB bundle). |
