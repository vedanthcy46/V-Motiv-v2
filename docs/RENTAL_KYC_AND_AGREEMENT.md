# V MOTIV V2 — Driver KYC & Rental Agreement Governance

## 1. Statutory Driver Eligibility Criteria

Under the Indian Motor Vehicles Act and V MOTIV Fleet Safety Policy, all drivers operating self-drive vehicles must satisfy the following minimum legal criteria:

| Eligibility Criterion | Statutory / Business Rule | Validation Check |
| :--- | :--- | :--- |
| **Minimum Driver Age** | **21 Years** as of booking start date | Calculated from date of birth (`dateOfBirth`) |
| **Driving Experience** | Minimum **1 Year** since license issue | Verified against driving license issue date |
| **Vehicle Class** | **LMV (Light Motor Vehicle - Transport or Non-Transport)** | Checked from physical license photo |
| **License Validity** | License expiry date must exceed booking return date | `licenseExpiry > booking.endTime` |
| **Document Privacy** | Front & Back photo scans stored in secure private S3 bucket | Never exposed in public endpoints or client logs |

---

## 2. Strict KYC Handover Gate

A core production security gate prevents staff from releasing keys if the primary driver has not been verified:

```ts
// Handover Endpoint Gate Check
if (booking.kycStatus !== 'VERIFIED') {
  throw new HttpError(403, 'KYC_NOT_VERIFIED_CANNOT_HANDOVER_VEHICLE');
}
```

1. **Submission**: Customer uploads license number and front/back photos during or immediately after checkout (`status: PENDING_REVIEW`).
2. **Review**: Operations dispatch staff inspects the license details (`status: VERIFIED` or `status: REJECTED`).
3. **Rejection Handling**: If rejected, customer receives an instant notification detailing the reason (e.g. Expired License, Below 21 Years), and vehicle release remains strictly locked.

---

## 3. Versioned Rental Contract (`VMR-TERMS-V2026.1`)

Before payment execution, customers must digitally accept the rental agreement. Acceptance is cryptographically recorded in `RentalAgreementAcceptance`:
- `bookingId`: Unique reservation identifier.
- `customerId`: Customer account UUID.
- `termsVersion`: `VMR-TERMS-V2026.1`.
- `acceptedAt`: Authoritative UTC timestamp.
- `ipAddress`: Client IP address for legal enforceability.
- `userAgent`: Client device identification.
