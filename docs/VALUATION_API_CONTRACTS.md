# V MOTIV V2 — Valuation Engine API Contracts & Specifications

## 1. Authentication & Security Middleware

All valuation endpoints adhere to the unified V MOTIV API design standards:
* **Protocol**: HTTPS / REST JSON over `/api/v2/*`.
* **Authentication**: Bearer Firebase ID token resolved via `auth` middleware.
* **Rate Limiting**: Protected by dedicated express rate limiters (e.g. 12 requests / minute on `/valuations/instant`).
* **Validation**: Strict Zod schema parsing. Extraneous fields are rejected.

---

## 2. Customer Public Endpoints

### A. POST `/api/v2/valuations/instant`
Creates an immutable snapshot of customer-declared vehicle parameters and evaluates market evidence.

* **Headers**: `Authorization: Bearer <CustomerToken>`
* **Request Body**:
  ```json
  {
    "leadId": "UUID (optional, must belong to customer if provided)",
    "make": "Hyundai",
    "model": "Creta",
    "variant": "SX (O)",
    "manufacturingYear": 2021,
    "registrationYear": 2021,
    "fuelType": "DIESEL",
    "transmission": "AUTOMATIC",
    "odometerKm": 38000,
    "city": "Bengaluru",
    "ownershipCount": 1,
    "accidentHistory": "NO",
    "serviceHistory": "COMPLETE",
    "loanOutstanding": false
  }
  ```
* **Success Response (`201 Created`)**:
  ```json
  {
    "id": "c1f7a0b2-3c4d-4e5f-6a7b-8c9d0e1f2a3b",
    "estimateAvailable": false,
    "unavailableReason": "INSUFFICIENT_APPROVED_COMPARABLE_DATA",
    "sellerEstimateLowPaise": null,
    "sellerEstimateHighPaise": null,
    "confidenceCategory": "INSUFFICIENT",
    "comparableCount": 0,
    "dataAsOf": null,
    "valuationVersion": "comparable-v1-data-gated",
    "estimateDate": "2026-10-30T12:00:00.000Z",
    "assumptions": [
      "This result is non-binding and does not use seller-declared details as verified facts.",
      "No numerical payout is shown until approved market data and a versioned pricing policy are available."
    ],
    "disclaimer": "This is an indicative estimate based on the details you provide and approved market information. It is not a purchase offer. The amount V MOTIV may offer can change after vehicle inspection, document checks and market review."
  }
  ```

### B. GET `/api/v2/valuations/:id/public-summary`
Fetches a previously created instant estimate snapshot. Only accessible by the creator.
* **Response (`200 OK`)**: Identical schema to the instant valuation response body.

---

## 3. Staff & Pricing Endpoints

### A. POST `/api/v2/valuations/inspection/:inspectionRevisionId/recommend`
Generates an internal post-inspection acquisition recommendation based on approved findings.
* **Access**: Staff with `valuation.recommend.create` permission (`PRICING_ANALYST`, `PRICING_MANAGER`).
* **Prerequisite**: Inspection revision must be `APPROVED`.

### B. GET `/api/v2/valuations/:id/internal`
Returns complete internal valuation breakdown including retail realization, defect deductions, and economic ceiling.
* **Access**: Staff with `valuation.internal.read` permission.
* **Response**:
  ```json
  {
    "valuationId": "UUID",
    "leadId": "UUID",
    "approvedInspectionRevisionId": "UUID",
    "expectedRetailRealizationPaise": "95000000",
    "itemizedRefurbishmentPaise": "3850000",
    "logisticsAndRtoPaise": "1200000",
    "holdingCostPaise": "1500000",
    "warrantyRiskPaise": "1900000",
    "targetContributionPaise": "6500000",
    "economicAcquisitionCeilingPaise": "80050000",
    "suggestedAcquisitionPaise": "79000000",
    "confidenceCategory": "HIGH",
    "comparableCount": 8,
    "requiresHumanApproval": true
  }
  ```

### C. POST `/api/v2/valuations/:id/offer-proposals`
Submits a proposed purchase price for approval under the maker-checker workflow.
* **Access**: Staff with `valuation.offer.propose` permission.

### D. POST `/api/v2/offer-proposals/:id/decision`
Records managerial approval or rejection of a proposed acquisition offer.
* **Access**: Staff with `valuation.offer.approve` or `valuation.offer.exception_approve`.
* **Guard**: Rejects if `approverId == proposerId`.

---

## 4. Admin & Data Pipeline Endpoints

* `POST /api/v2/valuation-data/imports`: Ingests a new batch of licensed observations (`valuation.market_data.import`).
* `GET /api/v2/valuation-data/quality`: Lists quarantined observations and batch quality summaries.
* `POST /api/v2/valuation-policies/changes`: Deploys a new versioned pricing policy document.
