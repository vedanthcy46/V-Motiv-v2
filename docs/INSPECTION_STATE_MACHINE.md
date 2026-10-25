# V MOTIV V2 — Inspection State Machines

The inspection process spans three distinct but connected lifecycle dimensions:

## 1. Appointment Lifecycle (`InspectionAppointmentStatus`)

```
ASSIGNED (Operations creates assignment for an eligible inspector)
    ↓
CONFIRMED (Inspector starts inspection or schedule confirmed)
    ↓
COMPLETED (Report submitted and verified)

Alternative paths:
RESCHEDULED (Operations changes appointment time/location with mandatory reason)
CANCELLED (Operations cancels request with documented reason)
```

## 2. Inspection Request Lifecycle (`InspectionRequestStatus`)

```
REQUESTED (Sales creates evaluation request)
    ↓
SCHEDULED (Operations assigns inspector and time)
    ↓
IN_PROGRESS (Inspector begins evaluation on site)
    ↓
COMPLETED (Report successfully submitted for review)

Alternative:
CANCELLED (Cancelled by coordinator or customer)
```

## 3. Inspection Report Lifecycle (`InspectionReportStatus`)

```
DRAFT (Editable by assigned inspector only)
    ↓
SUBMITTED (Immutable sealed revision; enters Reviewer queue)
    ↓
UNDER_REVIEW (Reviewer opens report)
    ├── APPROVED (Final immutable verdict; findings available to Pricing & Sales)
    ├── REWORK_REQUIRED (Creates Revision N+1 prefilled with prior findings; returns to Inspector)
    └── REJECTED (Report rejected; terminal state)
```

### Transition Integrity Rules:
- An inspector cannot submit without required identity fields (`registrationNumber`, positive `odometerKm`), answers to all applicable template checks, and confirmed declaration.
- An inspector cannot review or approve their own report.
- Rework preserves the parent report revision immutably and logs prior reviewer remarks.
