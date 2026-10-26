# Post-inspection acquisition case

## Implemented slice

An accepted, current `AcquisitionOffer` now creates exactly one `AcquisitionCase` in the same database transaction. The case is keyed uniquely by `offerId`; retries or a competing acceptance cannot create a second case.

The acceptance path creates five explicitly requested checks: seller identity, vehicle registration, seller authority, lien/hypothecation, and purchase agreement. Uploading media is deliberately not treated as verification.

## Separate workflow states

`AcquisitionCase.status`, `settlementStatus`, and `custodyStatus` are separate state machines. Neither an Operations action nor a document update can represent a verified payment. The settlement record retains the approved consideration from the accepted offer, a Finance-owned status, an optional transaction reference, verifier identity, and verification timestamp.

Document progression is server-enforced:

`REQUESTED -> RECEIVED -> UNDER_REVIEW -> VERIFIED`

Exception outcomes are `REJECTED`, `EXPIRED`, `MISMATCH`, and `WAIVED_BY_AUTHORIZED_POLICY`. A case moves to `SETTLEMENT_READY` only when every requested document is verified or explicitly waived.

Finance progression is server-enforced:

`NOT_READY -> READY_FOR_PAYMENT -> PAYMENT_PENDING -> PAYMENT_VERIFIED | PAYMENT_FAILED`

`PAYMENT_VERIFIED` requires a transaction reference and the Finance role. This is an authoritative workflow record, not a bank-integration claim.

Vehicle custody can be scheduled, received, disputed, or rejected. A received handover requires completed document readiness, a Finance-verified settlement, and received documents. Operations may complete acquisition only after all three gates pass; completion still does not create inventory automatically.

Stock inward is a separate Operations action after acquisition completion. It produces one canonical `VehicleStockUnit` per acquisition case (`VM-STK-…`), with a database uniqueness constraint on the acquisition case. New stock enters `RECEIVED` and has no public listing or public vehicle relation, so it cannot be advertised before refurbishment, QC, listing preparation, retail pricing, and publication are implemented.

## Ownership and audit

- Customer self-service acceptance records the seller identity as the accepting party.
- Sales cannot record an accepted offer. Seller acceptance must use the authenticated customer endpoint, preventing a Sales status dropdown from forging acceptance.
- Operations owns document coordination, handover, and completion.
- Finance owns settlement transitions at the distinct Finance route.
- Each consequential change writes an `AuditEvent`.

The current implementation does not simulate bank transfers. Production verification must be supplied by the future finance provider/reconciliation integration.
