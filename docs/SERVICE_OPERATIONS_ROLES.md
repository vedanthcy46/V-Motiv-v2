# V MOTIV V2 — Service Operations RBAC & Role Authorization

## 1. Overview
Automotive service operations inside `ops.vmotiv.in/service` are strictly governed by backend Role-Based Access Control (RBAC). A common operations login does not authorize universal actions. Each endpoint enforces granular role checks.

---

## 2. Service Roles & Authorization Matrix

| Role | Description | Key Authorized Operations Endpoints |
| :--- | :--- | :--- |
| `SERVICE_ADVISOR` | Customer intake, estimate generation, schedule confirmation, and delivery coordination. | `GET /queue`, `GET /jobs/:id`, `POST /jobs/:id/schedule`, `POST /jobs/:id/custody`, `POST /jobs/:id/estimates`, `POST /jobs/:id/work-order`, `POST /jobs/:id/return`, `POST /jobs/:id/payments` |
| `SERVICE_DISPATCH` | Logistics coordination and driver dispatch. | `GET /queue`, `GET /jobs/:id`, `POST /jobs/:id/dispatch` |
| `PICKUP_DRIVER` | Physical doorstep vehicle pickup and return delivery transit. | `GET /jobs/:id`, `POST /jobs/:id/custody`, `POST /jobs/:id/return` |
| `HUB_MANAGER` | Multi-bay workshop workflow, bay capacity, advisor oversight. | Full access to service scheduling, dispatch, custody, estimates, and work orders. Cannot verify finance payments. |
| `TECHNICIAN` | Mechanical / electrical diagnosis and work order execution. | `GET /jobs/:id`, `POST /jobs/:id/diagnosis`, `PATCH /work-orders/:id` |
| `SERVICE_QC` | Independent quality control inspection, road testing, and sign-off. | `GET /jobs/:id`, `POST /jobs/:id/qc` (Pass / Rework decisions) |
| `SERVICE_MANAGER` | Service governance, exception handling, and operational metrics. | Full service workflow authority (except finance payment verification). |
| `FINANCE` | Accounting, settlement ledger, and bank receipt verification. | `POST /payments/:id/verify`, settlement audits. |
| `SUPER_ADMIN` | Platform administration and privileged access. | All endpoints. |

---

## 3. Independent Quality Control (QC) Isolation
To guarantee automotive safety and avoid conflicts of interest:
- **Technicians who perform the mechanical repairs cannot sign off on the QC inspection.**
- Only an employee with the `SERVICE_QC` or `SERVICE_MANAGER` role can submit a `POST /jobs/:id/qc` request.
- If a QC decision is `REWORK_REQUIRED`:
  - `ServiceQCRecord` is created documenting specific defects or torque failures.
  - The `ServiceRequest` status reverts to `WORK_IN_PROGRESS`.
  - Notification `SERVICE_QC_REWORK` is dispatched to the assigned technician.
- If a QC decision is `PASS`:
  - `ServiceQCRecord` documents verification of road test, fluid levels, fastener torque, clean interior, and exterior foam wash.
  - The request progresses to `INVOICE_GENERATED` and `PAYMENT_PENDING`.
