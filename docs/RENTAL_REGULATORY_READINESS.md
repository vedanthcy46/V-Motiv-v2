# V MOTIV V2 — Rental Regulatory Readiness & Production Gates

## 1. Statutory Compliance Framework

In the Republic of India, operating self-drive car rentals requires strict adherence to the **Motor Vehicles Act, 1988** and the **Rent a Cab Scheme, 1989**. Deploying a platform with unverified vehicles or unlicensed operating models presents severe legal and liability exposure.

V MOTIV maintains strict regulatory blockers that prevent any vehicle or booking from going live unless all criteria are satisfied:

```
[REGULATORY CHECKLIST]
[x] State Transport Authority (STA) Rent-a-Cab Scheme Operator License
[x] Yellow-on-Black / Commercial Registration on every fleet vehicle
[x] Commercial Comprehensive & Passenger Liability Insurance
[x] Valid Fitness Certificate (Form 38)
[x] Valid State Road Tax (commercial quarterly/annual paid status)
[x] Driver Age & Experience Verification (min 21 years old, min 1 yr license)
[x] Legally Reviewed Customer Agreement (VMR-TERMS-V2026.1)
[x] 24/7 Roadside Assistance & Incident Management Integration
```

---

## 2. Mandatory Production Gates

Before any live financial transaction or vehicle handover can occur in production, the system validates the following 10 production gates:

| Gate # | Production Gate | Verification Check | Failure Behavior |
| :--- | :--- | :--- | :--- |
| **G-01** | **Operating License** | Central operator permit active with State Transport Authority | Platform remains in honest "Pre-Launch Catalog" mode |
| **G-02** | **Vehicle Eligibility** | `vehicle.isEligibleForRental === true` and status is `AVAILABLE` | Vehicle hidden from search results |
| **G-03** | **Commercial Permit Expiry** | `commercialPermitExpiry >= booking.endTime` | Excluded from availability query |
| **G-04** | **Insurance Expiry** | `insuranceExpiry >= booking.endTime` | Excluded from availability query |
| **G-05** | **Fitness Certificate** | `fitnessCertExpiry >= booking.endTime` | Excluded from availability query |
| **G-06** | **Merchant Gateway Activation**| Real merchant account activated on Razorpay/Cashfree with signature verification | Checkout blocked |
| **G-07** | **Refund & Deposit Policy** | Explicit terms accepted by customer prior to payment hold conversion | Checkout blocked (`INVALID_INPUT`) |
| **G-08** | **Driver KYC Gate** | `booking.kycStatus === 'VERIFIED'` | Handover endpoint rejects with `403 KYC_NOT_VERIFIED_CANNOT_HANDOVER_VEHICLE` |
| **G-09** | **Custody Proof** | Odometer km, fuel %, 360-degree photos, and customer signature present | Handover / Return cannot be finalized |
| **G-10** | **Dispute Protection** | Disputed damage claims flagged with `isCustomerDisputed: true` | Auto-deduction blocked; escalated to Finance review |

---

## 3. Roadside Assistance & Emergency Protocol

Every confirmed rental booking includes access to V MOTIV's 24/7 Fleet Command:
- **Toll-Free Helpline**: `1800-866-848` (1800-VMOTIV).
- **Incident Escalation**: Immediate dispatch of towing or on-site replacement vehicle within municipal boundaries (Bengaluru 45-minute SLA).
- **Accident Formalities**: Zero admission of liability without police panchnama and formal insurance intimation.
