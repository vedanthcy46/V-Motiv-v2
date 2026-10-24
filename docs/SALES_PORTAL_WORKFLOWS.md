# V MOTIV V2 — Sales Executive Portal Workflows

## Workflow A — V MOTIV Buys a Car from a Customer

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    actor Sales as Sales Executive
    actor Ops as Operations / Inspector
    actor Pricing as Pricing / Management
    actor Finance as Finance Team
    participant System as Sales Portal & Database

    Customer->>System: Submits "Sell Your Car" enquiry (App/Web/Manual)
    System->>System: Creates AcquisitionLead (Status: SUBMITTED)
    Sales->>System: Claims lead or assigned by Manager (Status: QUALIFYING)
    Sales->>Customer: Contacts customer, verifies vehicle & records Interaction
    Sales->>System: Requests vehicle evaluation appointment (Status: INSPECTION_SCHEDULED)
    Ops->>System: Conducts inspection & submits approved evaluation report
    System->>System: Lead transitions to OFFER_PENDING
    Pricing->>System: Generates versioned purchase offer (Status: OFFERED)
    Sales->>Customer: Communicates approved purchase offer
    alt Customer Accepts Offer
        Customer->>Sales: Agrees to offer
        Sales->>System: Records decision = ACCEPTED (Status: ACCEPTED)
        Finance->>Customer: Executes approved payout upon handover
    else Customer Declines Offer
        Customer->>Sales: Declines valuation
        Sales->>System: Records decision = DECLINED with reason (Status: REJECTED)
    end
```

### Detailed Steps:
1. **Enquiry Creation**: Customer submits details (Make, Model, Year, Fuel, Odo, Expected Price). System assigns a unique reference code (`VM-ACQ-XXXX`).
2. **First Response & Claiming**: The sales executive in the relevant branch claims the lead. This atomic operation sets `assignments: { create: { employeeId, assignedAt } }` and transitions status to `QUALIFYING`.
3. **Qualification & Interactions**: The executive calls or messages the seller. Details are recorded in `LeadInteraction`. If vehicle criteria are met, qualification is confirmed.
4. **Inspection Request**: Executive specifies location (Hub/Home), date, and slot. Operations assigns an inspector.
5. **Findings Approval**: The inspector verifies physical condition, chassis/engine numbers, and service history. An independent reviewer approves the valuation findings.
6. **Offer Generation & Decision**: An authoritative acquisition offer is published. When communicated, the seller either accepts (triggering procurement payout coordination) or declines.

---

## Workflow B — V MOTIV Sells a Car to a Customer

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    actor Sales as Sales Executive
    actor Manager as Operations Manager
    actor Finance as Finance Team
    participant System as Sales Portal & Database

    Customer->>System: Browses inventory & submits purchase enquiry (Status: RECEIVED)
    Sales->>System: Reviews enquiry & checks stock availability (Status: IN_REVIEW)
    Sales->>Customer: Contacts customer & records Interaction (Status: CONTACTED)
    Sales->>System: Schedules Test Drive (Status: REQUESTED -> CONFIRMED)
    Customer->>Sales: Completes Test Drive (Status: COMPLETED)
    Sales->>System: Prepares itemized Retail Quotation (Status: DRAFT)
    opt Manager Discount Requested
        Sales->>System: Requests discount exception
        Manager->>System: Reviews justification & approves discount
    end
    Sales->>System: Submits & sends quotation to customer (Status: SENT)
    Sales->>System: Places concurrency-safe Reservation on Vehicle (Status: REQUESTED)
    Customer->>Finance: Pays token deposit / balance payment
    System->>System: Vehicle marked RESERVED -> CONVERTED_TO_SALE
    Sales->>System: Closes enquiry (Status: CLOSED)
```

### Detailed Steps:
1. **Stock Enquiry**: Customer browses published listings and expresses interest. A `PurchaseEnquiry` record is linked directly to the `VehicleListing`.
2. **Review & Contact**: Sales executive verifies inventory availability in the branch and contacts the buyer.
3. **Test Drive Appointment**: If the customer desires a trial, a `TestDriveRequest` is scheduled with designated time slot. The executive records completion notes.
4. **Quotation Generation**: Sales creates a versioned `BuyerQuotation` with itemized charges (Base vehicle price, RTO, Insurance, Fastag, Warranty, Accessories).
5. **Discount Approval**: If the buyer requests pricing adjustments exceeding executive limits, a `DiscountRequest` is routed to the Operations Manager for formal approval.
6. **Vehicle Reservation**: To protect customer commitment, an atomic reservation is placed on the vehicle with a 48-hour hold window. Overlapping reservations on the same vehicle listing are prevented by database constraints.
7. **Settlement & Delivery**: Upon payment verification by Finance, the vehicle is prepared for customer delivery, and the lead is marked `CLOSED`.
