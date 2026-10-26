# Operations API contracts

All routes require a verified Firebase identity and an active employee. Branch-scoped Operations and Finance actors can access only cases connected to an inspection request in one of their assigned branches. `ADMIN` and `SUPER_ADMIN` retain their existing global scope.

## Operations

- `GET /api/v2/operations/acquisitions` — acquisition cases with seller-safe operational details, document state, settlement state, and handover state.
- `POST /api/v2/operations/acquisitions/:caseId/documents` — Operations-only document transition. Body: `documentType`, `status`, optional `notes`, optional `expectedVersion`.
- `POST /api/v2/operations/acquisitions/:caseId/handover` — Operations-only custody record. A `RECEIVED` handover enforces document and Finance gates.
- `POST /api/v2/operations/acquisitions/:caseId/complete` — Operations-only completion. Body includes mandatory `expectedVersion` for optimistic concurrency.
- `POST /api/v2/operations/acquisitions/:caseId/stock-inward` — creates the single canonical stock unit after completion. Body: optional assigned `branchId`, required `physicalLocation`, optional notes.
- `GET /api/v2/operations/inventory` — operational stock queue. It intentionally excludes acquisition cost and other Finance-only details.
- `POST /api/v2/operations/inventory/:stockId/work-orders` — creates an internal refurbishment work order.
- `POST /api/v2/operations/work-orders/:workOrderId/cost-approval` and `/cost-decision` — request and independently decide cost approval.
- `POST /api/v2/operations/work-orders/:workOrderId/start` and `/complete` — controlled workshop lifecycle transitions.
- `POST /api/v2/operations/inventory/:stockId/qc` and `POST /api/v2/operations/quality-control/:reportId/decision` — independent post-repair QC.

## Finance

- `POST /api/v2/finance/acquisitions/:caseId/settlement` — Finance-only settlement transition. Body: `status`, optional `transactionReference`, optional `notes`, optional `expectedVersion`. A verified payment requires `transactionReference`.

The Finance endpoint is separate from the Operations route group. It does not expose banking credentials or initiate bank transfers.
