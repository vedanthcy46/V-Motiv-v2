# V MOTIV V2 — Sales Executive Portal State Machines

## 1. Seller Lead State Machine (Acquisition Lead)

```mermaid
stateDiagram-v2
    [*] --> SUBMITTED : Customer / Walk-in Submission
    SUBMITTED --> QUALIFYING : Sales Executive Claims / Starts Qualification
    SUBMITTED --> CANCELLED : Customer Withdraws / Duplicate
    QUALIFYING --> INSPECTION_SCHEDULED : Sales Requests Hub/Home Inspection
    QUALIFYING --> REJECTED : Vehicle Disqualified (Specs/Condition)
    QUALIFYING --> CANCELLED : Customer Withdraws
    INSPECTION_SCHEDULED --> OFFER_PENDING : Inspection Approved by Reviewer
    INSPECTION_SCHEDULED --> REJECTED : Inspection Findings Failed Criteria
    INSPECTION_SCHEDULED --> CANCELLED : Customer Cancels Appointment
    OFFER_PENDING --> OFFERED : Authorized Purchase Offer Generated
    OFFERED --> ACCEPTED : Customer Accepts Official Offer
    OFFERED --> REJECTED : Customer Declines / Counter Rejected
    ACCEPTED --> [*] : Handoff to Operations & Finance Payout
    REJECTED --> [*]
    CANCELLED --> [*]
```

### Transition Rules:
- **`SUBMITTED` ➔ `QUALIFYING`**: Triggered automatically on claim or explicit status progression.
- **`QUALIFYING` ➔ `INSPECTION_SCHEDULED`**: Atomically enforced when an `InspectionRequest` is created.
- **`INSPECTION_SCHEDULED` ➔ `OFFER_PENDING`**: Requires independent approved evaluation report.
- **`OFFER_PENDING` ➔ `OFFERED`**: Requires signed acquisition offer record with validity date.
- **`OFFERED` ➔ `ACCEPTED` / `REJECTED`**: Recorded via `POST /offers/:offerId/decision` with mandatory reason if declined.

---

## 2. Acquisition Offer State Machine

```mermaid
stateDiagram-v2
    [*] --> DRAFT : Valuation Calculated
    DRAFT --> APPROVED : Reviewed by Pricing Authority
    APPROVED --> OFFERED : Communicated to Customer
    OFFERED --> ACCEPTED : Customer Agrees to Terms
    OFFERED --> DECLINED : Customer Refuses Offer
    OFFERED --> EXPIRED : Valid Until Date Passes
    ACCEPTED --> [*]
    DECLINED --> [*]
    EXPIRED --> [*]
```

---

## 3. Buyer Purchase Enquiry State Machine

```mermaid
stateDiagram-v2
    [*] --> RECEIVED : Customer Inquires on Published Stock
    RECEIVED --> IN_REVIEW : Sales Reviewing Stock Availability
    RECEIVED --> CLOSED : Duplicate / Out of Stock
    IN_REVIEW --> CONTACTED : Sales Calls / Messages Customer
    IN_REVIEW --> CLOSED : Inactive / Lost
    CONTACTED --> CLOSED : Deal Completed or Lost
    CLOSED --> [*]
```

---

## 4. Test Drive Appointment State Machine

```mermaid
stateDiagram-v2
    [*] --> REQUESTED : Scheduled by Sales / Customer
    REQUESTED --> CONFIRMED : Hub Slot & Vehicle Locked
    REQUESTED --> CANCELLED : Customer Cancels Before Slot
    CONFIRMED --> COMPLETED : Customer Attended & Drove
    CONFIRMED --> NO_SHOW : Customer Did Not Arrive
    CONFIRMED --> CANCELLED : Late Cancellation
    COMPLETED --> [*]
    NO_SHOW --> [*]
    CANCELLED --> [*]
```

---

## 5. Retail Quotation State Machine

```mermaid
stateDiagram-v2
    [*] --> DRAFT : Executive Adds Vehicle & Charges
    DRAFT --> SUBMITTED : Executive Submits for Commercial Check
    SUBMITTED --> APPROVED : Manager Approves (if discount applied)
    APPROVED --> SENT : Dispatched to Customer
    SENT --> ACCEPTED : Customer Agrees to Purchase
    SENT --> DECLINED : Customer Refuses Terms
    SENT --> EXPIRED : Validity Period Lapsed
    ACCEPTED --> [*]
    DECLINED --> [*]
    EXPIRED --> [*]
```

---

## 6. Discount Exception State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING_APPROVAL : Executive Requests Margin Exception
    PENDING_APPROVAL --> APPROVED : Manager / Admin Grants Exception
    PENDING_APPROVAL --> REJECTED : Manager Rejects Exception
    APPROVED --> [*]
    REJECTED --> [*]
```

---

## 7. Vehicle Reservation State Machine (Concurrency-Safe)

```mermaid
stateDiagram-v2
    [*] --> REQUESTED : Deposit Placed / Hold Requested
    REQUESTED --> CONFIRMED : Payment & KYC Verified
    REQUESTED --> RELEASED : Released by Sales / Cancelled
    REQUESTED --> EXPIRED : Hold Time Window Lapsed (e.g. 48h)
    CONFIRMED --> CONVERTED_TO_SALE : Full Settlement & Handover
    CONFIRMED --> RELEASED : Order Cancelled with Refund
    CONVERTED_TO_SALE --> [*]
    RELEASED --> [*]
    EXPIRED --> [*]
```

### Concurrency Rules:
- A vehicle listing may have at most **one** active reservation in status `REQUESTED` or `CONFIRMED`.
- Attempting to place an overlapping reservation on the same listing triggers a `409 CONFLICT: LISTING_ALREADY_RESERVED` error.

---

## 8. CRM Sales Task State Machine

```mermaid
stateDiagram-v2
    [*] --> OPEN : Task Scheduled with Due Date
    OPEN --> IN_PROGRESS : Executive Working on Follow-up
    OPEN --> COMPLETED : Finished with Recorded Outcome
    IN_PROGRESS --> COMPLETED : Finished with Recorded Outcome
    OPEN --> CANCELLED : Cancelled
    IN_PROGRESS --> CANCELLED : Cancelled
    COMPLETED --> [*]
    CANCELLED --> [*]
```

### Validation Rules:
- Completing a task strictly requires a non-empty `actualOutcome` string describing the customer response or action taken.
