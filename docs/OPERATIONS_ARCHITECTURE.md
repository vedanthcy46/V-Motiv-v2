# Operations Manager Portal

`apps/operations-portal` is the Operations workspace. It authenticates with Firebase and uses the shared V2 API; it never decides pricing or financial payment outcomes in browser state.

Implemented operations capabilities:

- Branch-scoped inspection dispatch dashboard: `GET /api/v2/operations/dashboard`
- Inspection request queue: `GET /api/v2/operations/inspection-requests`
- Inspector discovery, assignment, rescheduling and cancellation through the Operations API.

Run locally with `npm run dev:operations`. Configure `VITE_API_BASE` and the standard `VITE_FIREBASE_*` values.

Not implemented: acquisition documents, settlement, handover/custody, stock inward, refurbishment, QC, listing readiness, delivery and legal transfer tracking. Those remain backend domain milestones and must not be represented as complete UI workflows until the authoritative transitions exist.
