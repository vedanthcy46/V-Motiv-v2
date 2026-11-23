# V MOTIV V2 — Operations API Contracts

All operations endpoints are mounted at `/api/v2/operations` and `/api/v2/finance` with Firebase Bearer Token authentication.

## 1. Dashboard & Dispatch

### `GET /api/v2/operations/dashboard`
Returns live operational metrics:
```json
{
  "unassigned": 2,
  "scheduled": 5,
  "inProgress": 3,
  "completed": 12,
  "acquisitions": {
    "documentationRequired": 3,
    "settlementReady": 2,
    "handoverReady": 1,
    "completed": 8,
    "onHold": 0
  },
  "stock": {
    "received": 2,
    "refurbishmentPending": 1,
    "inRefurbishment": 2,
    "qcPending": 1,
    "listingPreparation": 1,
    "listingReady": 1,
    "listed": 5,
    "reserved": 1,
    "sold": 4
  },
  "refurbishment": {
    "pendingCostApprovals": 1
  },
  "recentEvents": [],
  "generatedAt": "2026-10-26T06:00:00.000Z"
}
```

### `GET /api/v2/operations/inspection-requests`
Lists all inspection requests in the actor's branch scope.

### `GET /api/v2/operations/inspectors`
Lists active inspectors with their branch coverage and `activeLoadCount`.

### `POST /api/v2/operations/inspection-requests/:id/assign`
Assigns an inspector to an evaluation request:
```json
{
  "inspectorId": "uuid",
  "scheduledAt": "2026-10-27T10:00:00.000Z",
  "locationType": "HUB | HOME",
  "address": "string (required if HOME)",
  "instructions": "string (optional)"
}
```

## 2. Acquisitions & Custody

### `GET /api/v2/operations/acquisitions`
Lists all active acquisition cases with embedded lead, offer, documents, settlement, handover, and stockUnit records.

### `POST /api/v2/operations/acquisitions/:id/documents`
Updates document review status:
```json
{
  "documentType": "SELLER_IDENTITY | VEHICLE_REGISTRATION | SELLER_AUTHORITY | LIEN_OR_HYPOTHECATION | PURCHASE_AGREEMENT",
  "status": "REQUESTED | RECEIVED | UNDER_REVIEW | VERIFIED | REJECTED | WAIVED_BY_AUTHORIZED_POLICY",
  "notes": "string",
  "expectedVersion": 1
}
```

### `POST /api/v2/finance/acquisitions/:id/settlement`
(Finance role only) Updates payout settlement:
```json
{
  "status": "READY_FOR_PAYMENT | PAYMENT_PENDING | PAYMENT_VERIFIED | PAYMENT_FAILED | CANCELLED",
  "transactionReference": "string (mandatory when PAYMENT_VERIFIED)",
  "notes": "string",
  "expectedVersion": 1
}
```

### `POST /api/v2/operations/acquisitions/:id/handover`
Records physical vehicle & key custody:
```json
{
  "status": "SCHEDULED | RECEIVED | DISPUTED | REJECTED",
  "location": "Bengaluru Central Hub",
  "observedAt": "2026-10-26T10:00:00.000Z",
  "odometerKm": 34500,
  "mainKeysReceived": 1,
  "spareKeysReceived": 1,
  "documentsReceived": true,
  "conditionNotes": "string",
  "expectedVersion": 1
}
```

### `POST /api/v2/operations/acquisitions/:id/complete`
Validates completion gates and completes acquisition case:
```json
{
  "expectedVersion": 2,
  "completionNotes": "All gates passed"
}
```

### `POST /api/v2/operations/acquisitions/:id/stock-inward`
Inwards completed acquisition to canonical vehicle stock:
```json
{
  "physicalLocation": "Bengaluru Central Hub - Bay 4",
  "notes": "string"
}
```

## 3. Inventory, Refurbishment & QC

### `GET /api/v2/operations/inventory`
Returns all stock units with their work orders, quality control reports, vehicle details, and acquisition case source.

### `POST /api/v2/operations/inventory/:id/work-orders`
Creates a refurbishment work order:
```json
{
  "category": "MECHANICAL | BODY_PAINT | INTERIOR_DETAILING | ELECTRICAL | TIRES",
  "requiredAction": "string",
  "assignedProvider": "string",
  "estimatedCostPaise": 500000
}
```

### `POST /api/v2/operations/work-orders/:id/cost-approval`
Submits work order for independent cost decision:
```json
{
  "expectedVersion": 1,
  "estimatedCostPaise": 500000,
  "reason": "Detailed quotation received from vendor"
}
```

### `POST /api/v2/operations/work-orders/:id/cost-decision`
(Independent Pricing Approver only):
```json
{
  "expectedVersion": 1,
  "decision": "APPROVE | REJECT",
  "reason": "string"
}
```

### `POST /api/v2/operations/work-orders/:id/start`
Starts an approved work order (stock status becomes `IN_REFURBISHMENT`).

### `POST /api/v2/operations/work-orders/:id/complete`
Completes repair work (stock status advances to `QC_PENDING`):
```json
{
  "expectedVersion": 2,
  "actualCostPaise": 485000,
  "notes": "string"
}
```

### `POST /api/v2/operations/inventory/:id/qc`
Starts an independent QC review.

### `POST /api/v2/operations/quality-control/:id/decision`
Records independent QC decision:
```json
{
  "expectedVersion": 1,
  "decision": "PASS | REWORK_REQUIRED | FAIL",
  "findings": "All paint thickness and mechanical checks within spec",
  "evidenceNotes": "string"
}
```
- `PASS` -> Stock status advances to `LISTING_PREPARATION`.
- `REWORK_REQUIRED` -> Stock status returns to `REFURBISHMENT_PENDING`.
- `FAIL` -> Stock status becomes `ON_HOLD`.

## 4. Listing Studio, Publication & Delivery

### `POST /api/v2/operations/inventory/:id/prepare-listing`
Curates public specifications, photos and tags (stock status advances to `LISTING_READY`):
```json
{
  "title": "2022 Hyundai Creta 1.5 SX",
  "color": "Polar White",
  "conditionSummary": "Flawless condition, verified 200-point inspection",
  "features": ["Sunroof", "Wireless Charger", "Ventilated Seats"],
  "mediaUrls": ["https://res.cloudinary.com/..."],
  "expectedVersion": 1
}
```

### `POST /api/v2/operations/inventory/:id/publish-listing`
Validates commercial readiness gates and publishes vehicle to live marketplace:
```json
{
  "retailPricePaise": 125000000,
  "expectedVersion": 2
}
```

### `POST /api/v2/operations/inventory/:id/deliver`
Completes delivery to purchasing customer:
```json
{
  "buyerName": "Anand Sharma",
  "buyerPhone": "+919876543210",
  "odometerKm": 34800,
  "deliveryNotes": "Keys and delivery certificate signed",
  "expectedVersion": 3
}
```
Stock and listing statuses advance to `SOLD`.
