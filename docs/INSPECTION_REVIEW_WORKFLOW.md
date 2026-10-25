# V MOTIV V2 — Independent Inspection Review Workflow

## 1. Review Authority & Independence

Inspection Reviewers hold independent authority over report validity and acquisition readiness.

**Governance Rules**:
1. Reviewers must have the `INSPECTION_REVIEWER`, `ADMIN`, or `SUPER_ADMIN` role.
2. An inspector cannot review or approve their own report. The system enforces `report.inspectorId !== actor.userId`, returning HTTP 403 `INSPECTION_SELF_APPROVAL_DENIED`.
3. Review decisions are immutable once recorded.

## 2. Reviewer Interface (`apps/inspection-review-portal`)

Available at `https://ops.vmotiv.in/inspections/review` or locally at `http://localhost:3400`:
- **Review Queue**:
  - Lists pending reports awaiting review.
  - Displays car model, seller name, revision number, submission age, defect count, and photo count.
- **Detailed Evaluation Workspace**:
  - **Identity Verification**: Cross-references physical registration and odometer against customer enquiry.
  - **Full Checklist Audit**: Color-coded badges (`PASS`, `ISSUE`, `NOT_TESTED`, `NOT_APPLICABLE`), observed values, and inspector remarks.
  - **Defect Register**: Categorized defects with severity indicators (`CRITICAL`, `MAJOR`, `MODERATE`, `MINOR`).
  - **Private Evidence Gallery**: Authenticated streaming of full-resolution original photographs with zoom/enlarge viewer.
  - **Revision Comparison / Diff**: For rework reports, computes and highlights exact differences between current revision and parent revision.
- **Decision Controls**:
  - `Approve Report`: Marks report `APPROVED`. Generates audit trail. Approved findings become available to Pricing and Sales.
  - `Request Correction`: Requires documented reason. Transitions current report to `REWORK_REQUIRED`, creates prefilled `Revision N+1`, and returns assignment to inspector.
  - `Reject Report`: Requires documented reason. Marks report `REJECTED`.
