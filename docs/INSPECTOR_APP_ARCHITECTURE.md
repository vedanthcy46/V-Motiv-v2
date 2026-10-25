# V MOTIV V2 — Inspector Mobile App & Inspection Review Architecture

## 1. System Overview

The V MOTIV V2 Inspection System connects field vehicle evaluations to company acquisition decisions and inventory valuation. It enforces strict separation of responsibilities:
- **Sales Executive**: Initiates evaluation requests based on genuine customer acquisition enquiries.
- **Operations Manager**: Coordinates inspector assignments, scheduling, rescheduling, and cancellation.
- **Field Inspector**: Executes physical checks on the car, verifies identity, captures guided photo evidence, logs defects, and submits an immutable report revision.
- **Independent Quality Reviewer**: Evaluates submitted reports, reviews evidence photos, inspects discrepancies, and approves, returns for rework, or rejects findings.
- **Pricing & Acquisition Approver**: Consumes approved, immutable inspection revisions to formulate authorized vehicle valuation and purchase offers.

## 2. Technology Stack & Packages

| Layer | Component | Details |
| :--- | :--- | :--- |
| **Field Mobile** | `apps/inspector-mobile` | Android-first React Native + Expo SDK 57 + TypeScript (Package: `in.vmotiv.inspector`) |
| **Review Web** | `apps/inspection-review-portal` | React 19 + TypeScript + Vite (`https://ops.vmotiv.in/inspections/review` or port 3400) |
| **Authentication** | Firebase Google Sign-In | Firebase ID Token verification with PostgreSQL employee RBAC resolution |
| **Shared API** | `services/api` | Express 5 + TypeScript + Helmet + CORS + Rate Limiting (`https://api.vmotiv.in`) |
| **Database** | PostgreSQL + Prisma ORM | Relational models for Requests, Assignments, Reports, Answers, Defects, Media, and Decisions |
| **Evidence Storage**| Private Object Storage | Local secure disk store / S3 abstraction with SHA-256 checksum verification and private streaming |
| **Offline Persistence**| Durable Local Queues | Multi-tier persistence: cached jobs, active drafts, pending media queue in AsyncStorage |
| **Branding** | Official V MOTIV | Navy `#061A38`, Yellow `#F7B503`, White `#FFFFFF` |

## 3. End-to-End Workflow & Boundary Rules

```
Sales Enquiry (Customer Sell Request)
    ↓
Sales Requests Inspection (/api/v2/sales/seller-leads/:id/request-inspection)
    ↓
Operations Schedules & Assigns Inspector (/api/v2/operations/inspection-requests/:id/assign)
    ↓
Inspector Starts Physical Evaluation (/api/v2/inspector/assignments/:id/start)
    ↓
Inspector Records Identity, Checks, Defects & Photos (Offline-First Drafts)
    ↓
Inspector Submits Sealed Report (/api/v2/inspector/reports/:id/submit)
    ↓
Independent Reviewer Evaluates Report (/api/v2/inspection-review/queue & /reports/:id)
    ├── APPROVE → Approved revision available to Pricing & Sales
    ├── REQUEST_CORRECTION → Creates prefilled Revision N+1, returns to Inspector queue
    └── REJECT → Terminal rejection with documented reason
```

### Critical Boundaries
1. **No Self-Approval**: An inspector cannot approve their own submitted report, even if they hold dual roles (`INSPECTION_SELF_APPROVAL_DENIED`).
2. **Immutable Revisions**: Submitted and approved reports cannot be modified in place. Rework creates an explicitly linked revision (`parentReportId`).
3. **Private Media Only**: Evidence photographs are never public. Access requires authenticated employee ID token with assignment or reviewer scope.
4. **No Stock Inward from Inspection**: Inspection of a customer's car does not grant ownership or create stock records.
