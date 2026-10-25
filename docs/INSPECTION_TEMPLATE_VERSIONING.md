# V MOTIV V2 — Inspection Template Versioning & Concurrency

## 1. Immutability Guarantee

Once an inspection session starts, its report record is permanently tied to the exact `templateKey` and `templateVersion` assigned at initialization.

```
Report Creation
  → Reads current approved template (e.g. key: "vehicle-standard", version: 2)
  → Stores templateKey="vehicle-standard", templateVersion=2 on InspectionReport
  → Subsequent global template changes NEVER alter or invalidate active reports
```

## 2. Template Lifecycle & Evolution

- **Version 1 (Legacy Standard)**: 6 baseline sections with 15 essential checks. Preserved in `legacyStandardTemplate` for backward compatibility.
- **Version 2 (Comprehensive Production Template)**: 16 sections, 50+ itemized checks, conditional fuel evaluation (ICE vs EV/Hybrid), mandatory photo requirements, and inspector declaration.

### API Contract
```http
GET /api/v2/inspector/templates/:key/:version
Authorization: Bearer <FirebaseIdToken>
```
Returns:
```json
{
  "key": "vehicle-standard",
  "version": 2,
  "title": "V MOTIV Comprehensive Vehicle Inspection Template",
  "sections": [ ... ],
  "items": [ ... ]
}
```

## 3. Concurrency & Optimistic Locking

Every `InspectionReport` maintains a `recordVersion` integer (initialized to 1).

### Saving Drafts:
```http
PUT /api/v2/inspector/reports/:id/draft
Content-Type: application/json

{
  "recordVersion": 1,
  "identity": { ... },
  "answers": [ ... ],
  "defects": [ ... ]
}
```

- If `dbReport.recordVersion !== client.recordVersion`:
  - Throws HTTP 409 `INSPECTION_REPORT_VERSION_CONFLICT`.
  - Prevents accidental overwrites when multiple devices or offline sync retries collide.
- On success:
  - Updates report answers and defects in an atomic transaction.
  - Increments `recordVersion` to `recordVersion + 1`.
  - Records an `INSPECTION_DRAFT_SAVED` audit event.
