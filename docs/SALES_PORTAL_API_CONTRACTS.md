# V MOTIV V2 — Sales Executive Portal API Contracts

All endpoints are hosted on the single authoritative backend (`services/api`) under `/api/v2/sales/*`.
All requests require an `Authorization: Bearer <firebase_id_token>` header.
The server automatically resolves employee identity, active status, role, and branch scope from PostgreSQL.
Mutations record an immutable `AuditEvent`.

---

## 1. Core Identity & Governance

### `GET /api/v2/sales/me`
- **Description**: Returns the verified sales employee identity, employee code, active roles, and branch assignments.
- **Response `200 OK`**:
  ```json
  {
    "userId": "uuid",
    "email": "employee@vmotiv.in",
    "displayName": "Vikram Sales",
    "employeeCode": "VM-SALES-101",
    "roles": ["SALES_EXECUTIVE"],
    "branches": [{ "id": "uuid", "code": "BLR-01", "name": "Bengaluru Central", "city": "Bengaluru" }],
    "globalScope": false
  }
  ```

### `GET /api/v2/sales/dashboard`
- **Description**: Real-time KPI counts and funnel statistics calculated from PostgreSQL.
- **Response `200 OK`**:
  ```json
  {
    "sellerFunnel": { "SUBMITTED": 5, "QUALIFYING": 2, "INSPECTION_SCHEDULED": 1 },
    "buyerFunnel": { "RECEIVED": 8, "IN_REVIEW": 3, "CONTACTED": 4 },
    "tasksDueToday": 3,
    "upcomingTestDrives": 2,
    "unassignedCount": 5,
    "openOffersCount": 2,
    "generatedAt": "2026-10-24T21:00:00.000Z"
  }
  ```

### `GET /api/v2/sales/notifications`
- **Description**: Authoritative action items including unassigned leads in branch scope, overdue tasks, and pending appointments.
- **Response `200 OK`**:
  ```json
  {
    "unassignedLeads": [{ "id": "uuid", "referenceCode": "VM-ACQ-1001", "make": "Honda", "model": "City", "city": "Bengaluru", "createdAt": "..." }],
    "overdueTasks": [{ "id": "uuid", "type": "CALL", "details": "Call customer", "dueAt": "..." }],
    "pendingTestDrives": [],
    "totalUnread": 1
  }
  ```

### `GET /api/v2/sales/reports`
- **Description**: Comprehensive funnel and performance metrics.
- **Response `200 OK`**:
  ```json
  {
    "sellerFunnel": { "SUBMITTED": 12, "QUALIFYING": 8, "ACCEPTED": 3 },
    "buyerFunnel": { "RECEIVED": 15, "CONTACTED": 10, "CLOSED": 4 },
    "inspectionsTotal": 9,
    "offersTotal": 6,
    "testDriveFunnel": { "CONFIRMED": 8, "COMPLETED": 7 },
    "generatedAt": "2026-10-24T21:00:00.000Z"
  }
  ```

---

## 2. Seller Leads & Acquisition (Workflow A)

### `GET /api/v2/sales/seller-leads`
- **Query Params**: `page`, `limit`, `search`, `status`, `city`, `unassigned` (boolean).
- **Response `200 OK`**: Paginated seller leads within the actor's branch city scope.

### `POST /api/v2/sales/seller-leads`
- **Description**: Create a manual walk-in or phone seller lead.
- **Request Body**:
  ```json
  {
    "sellerName": "Ramesh Rao",
    "sellerPhone": "+919876543219",
    "city": "Bengaluru",
    "pincode": "560002",
    "make": "Maruti",
    "model": "Swift",
    "variant": "ZXi",
    "manufacturingYear": 2022,
    "fuelType": "PETROL",
    "transmission": "MANUAL",
    "odometerKm": 18000,
    "expectedPricePaise": 75000000,
    "sellerNotes": "Walk-in inquiry"
  }
  ```
- **Response `201 Created`**: Returns the created lead with generated reference code.

### `GET /api/v2/sales/seller-leads/:id`
- **Description**: Full detail for a single scoped seller lead.

### `POST /api/v2/sales/seller-leads/:id/claim`
- **Description**: Atomically claim an unassigned seller lead in branch scope.
- **Response `201 Created`**: `{ "id": "uuid", "leadId": "uuid" }`. Returns `409 Conflict` if already claimed.

### `POST /api/v2/sales/seller-leads/:id/assign`
- **Description**: Manager/Admin assignment of lead to specific employee.
- **Request Body**: `{ "employeeId": "uuid", "reason": "Workload balance" }`.

### `PATCH /api/v2/sales/seller-leads/:id/status`
- **Description**: State machine status transition.
- **Request Body**: `{ "status": "QUALIFYING", "note": "Customer contacted" }`.

### `POST /api/v2/sales/seller-leads/:id/qualify`
- **Description**: Record qualification decision.
- **Request Body**: `{ "qualified": true, "reasonCode": "MEETS_CRITERIA", "notes": "Clear inspection candidate" }`.

### `GET/POST /api/v2/sales/seller-leads/:id/interactions`
- **POST Body**: `{ "channel": "CALL", "outcome": "CONNECTED", "notes": "Details confirmed" }`.

### `GET/POST /api/v2/sales/seller-leads/:id/tasks`
- **POST Body**: `{ "type": "CALL", "priority": "NORMAL", "dueAt": "2026-10-25T10:00:00.000Z", "details": "Confirm inspection" }`.

### `PATCH /api/v2/sales/tasks/:id/complete`
- **PATCH Body**: `{ "actualOutcome": "Call completed, valuation accepted" }`.

### `POST /api/v2/sales/seller-leads/:id/inspection-requests`
- **Description**: Schedule evaluation appointment.
- **Request Body**:
  ```json
  {
    "locationType": "HUB",
    "requestedDate": "2026-10-26T00:00:00.000Z",
    "timeSlot": "11:00 AM - 01:00 PM",
    "address": "V MOTIV Hub Bengaluru"
  }
  ```

### `GET /api/v2/sales/seller-leads/:id/inspection-summary`
- **Description**: Read-only summary of approved evaluation findings.

### `GET/POST /api/v2/sales/seller-leads/:id/offers`
- **POST Body**: `{ "offerAmountPaise": 72000000, "validUntil": "2026-11-01T00:00:00.000Z", "terms": "Valid for 7 days" }`.

### `POST /api/v2/sales/seller-leads/:id/offers/:offerId/decision`
- **POST Body**: `{ "decision": "ACCEPTED" }` or `{ "decision": "DECLINED", "declineReason": "Low valuation" }`.

---

## 3. Buyer Leads & Retail Enquiries (Workflow B)

### `GET /api/v2/sales/buyer-leads`
- **Query Params**: `page`, `limit`, `search`, `status`.

### `GET /api/v2/sales/buyer-leads/:id`
- **Description**: Single buyer purchase enquiry details.

### `PATCH /api/v2/sales/buyer-leads/:id/status`
- **PATCH Body**: `{ "status": "IN_REVIEW" | "CONTACTED" | "CLOSED" }`.

---

## 4. Inventory Stock & Test Drives

### `GET /api/v2/sales/inventory`
- **Query Params**: `page`, `limit`, `search`, `city`.
- **Response**: Read-only published vehicle inventory without cost disclosures.

### `GET /api/v2/sales/inventory/:id`
- **Description**: Detailed vehicle listing specs.

### `GET /api/v2/sales/test-drives`
- **Query Params**: `page`, `limit`, `search`, `status`.

### `POST /api/v2/sales/test-drives`
- **Request Body**:
  ```json
  {
    "listingId": "uuid",
    "customerId": "uuid",
    "requestedDate": "2026-10-27T00:00:00.000Z",
    "timeSlot": "02:00 PM - 04:00 PM",
    "customerNotes": "Prefers showroom test drive"
  }
  ```

### `PATCH /api/v2/sales/test-drives/:id/status`
- **PATCH Body**: `{ "status": "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW" }`.

---

## 5. Retail Quotations, Discounts & Reservations

### `GET /api/v2/sales/quotations`
- **Query Params**: `page`, `limit`, `search`, `status`, `customerId`, `listingId`.

### `POST /api/v2/sales/quotations`
- **Request Body**:
  ```json
  {
    "listingId": "uuid",
    "customerId": "uuid",
    "chargesPaise": 1500000,
    "discountPaise": 500000,
    "validUntil": "2026-11-01T00:00:00.000Z",
    "terms": "Standard retail warranty included"
  }
  ```

### `POST /api/v2/sales/quotations/:id/submit`
- **Description**: Submits quotation for manager/commercial review.

### `POST /api/v2/sales/quotations/:id/discount-requests`
- **Request Body**: `{ "requestedDiscountPaise": 1500000, "reason": "Customer booking on condition of ₹15,000 waiver" }`.

### `POST /api/v2/sales/quotations/discount-requests/:id/decision`
- **Permissions**: Requires `OPERATIONS_MANAGER`, `ADMIN`, or `SUPER_ADMIN`.
- **Request Body**: `{ "decision": "APPROVE" | "REJECT", "decisionNotes": "Approved for month-end target" }`.

### `GET /api/v2/sales/reservations`
- **Description**: View active vehicle stock reservations.

### `POST /api/v2/sales/reservations`
- **Description**: Atomic, concurrency-safe reservation against vehicle listing.
- **Request Body**:
  ```json
  {
    "listingId": "uuid",
    "customerId": "uuid",
    "quotationId": "uuid",
    "expiresAt": "2026-10-28T00:00:00.000Z",
    "notes": "Token deposit confirmed"
  }
  ```

### `POST /api/v2/sales/reservations/:id/release`
- **Request Body**: `{ "reason": "Customer withdrew interest" }`.

---

## 6. Customers & Communications

### `GET /api/v2/sales/customers`
- **Query Params**: `page`, `limit`, `search`.

### `GET /api/v2/sales/customers/:id`
- **Description**: Customer 360 profile with all associated buying, selling, and test-drive activities.

### `POST /api/v2/sales/communications/email`
- **Description**: Queue an approved transactional email into `EmailOutbox`.
- **Request Body**:
  ```json
  {
    "customerId": "uuid",
    "template": "ENQUIRY_ACK" | "ADDITIONAL_DETAILS_REQUESTED" | "INSPECTION_CONFIRMED" | "OFFER_COMMUNICATED" | "QUOTATION_SENT" | "TEST_DRIVE_CONFIRMED",
    "variables": { "car": "Honda City" }
  }
  ```
