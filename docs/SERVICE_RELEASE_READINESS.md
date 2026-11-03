# V MOTIV V2 — Authoritative Vehicle Release Readiness Gate

## 1. Release Gate Criteria

Vehicle release is governed by an authoritative four-point readiness gate enforced simultaneously by the backend domain logic (`services/api/src/service-store.ts`) and rendered as a visual checklist in the Operations Portal (Tab 7):

```
+-------------------------------------------------------------------------------+
|             VEHICLE RELEASE READINESS CHECKLIST (AUTHORITATIVE GATE)          |
+-------------------------------------------------------------------------------+
|  [✅ / ❌]  1. Quality Control Inspection  --> Must be PASS                   |
|  [✅ / ❌]  2. Customer Estimate Approval  --> Must be APPROVED               |
|  [✅ / ❌]  3. Statutory Tax Invoice       --> Must be ISSUED (18% GST)       |
|  [✅ / ❌]  4. Payment Settlement          --> Must be FULLY SETTLED (₹0 Due) |
+-------------------------------------------------------------------------------+
```

---

## 2. Server-Side Mechanical Enforcement

Vehicle release cannot be bypassed or overridden by client state manipulation. In `services/api/src/service-store.ts`, `recordCustodyReturn` strictly calls `computeServiceReleaseReadiness(requestId)`:

```ts
const readiness = await this.computeServiceReleaseReadiness(requestId);
if (!readiness.canRelease) {
  throw new HttpError(
    400,
    `RELEASE_BLOCKED: ${readiness.reasons.join('; ')}`
  );
}
```

### Blocking Reasons Handled
1. **QC Pending**: `"Quality control inspection has not passed."`
2. **Estimate Pending**: `"Customer has not approved the service estimate."`
3. **Invoice Missing**: `"Final tax invoice has not been generated."`
4. **Unpaid Balance**: `"Outstanding balance of ₹X must be paid in full prior to release."`

---

## 3. Operations Handover UX

In Tab 7 of the Manage Job modal:
- If all four conditions are met:
  - Checkmarks appear green (`✅`).
  - Departure odometer and handover recipient are documented.
  - Button `Release Vehicle & Conclude Handover` is enabled.
- If any condition is unmet:
  - Unmet conditions display red cross icons (`❌`).
  - A high-visibility warning banner specifies the exact blocking reason.
  - The submit button is disabled with explanatory tooltip.
