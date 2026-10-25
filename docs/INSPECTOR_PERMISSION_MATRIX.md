# V MOTIV V2 — Inspector & Quality Review Permission Matrix

## Role-Based Access Control (RBAC)

Permissions are defined in `admin-catalog.ts` and managed through PostgreSQL employee records:

| Permission Key | Description | Inspector | Reviewer | Operations | Admin / Super Admin |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `inspection.assignment.read_own` | Read assignments belonging to current inspector | ✓ | — | — | ✓ |
| `inspection.assignment.read_branch` | Read assignments within authorized branch | — | ✓ | ✓ | ✓ |
| `inspection.assignment.assign` | Assign inspector and schedule appointment | — | — | ✓ | ✓ |
| `inspection.start` | Start assigned physical inspection session | ✓ | — | — | — |
| `inspection.answer.write` | Create and update draft checklist answers | ✓ | — | — | — |
| `inspection.defect.write` | Create and update defect records | ✓ | — | — | — |
| `inspection.media.capture` | Capture inspection evidence | ✓ | — | — | — |
| `inspection.media.upload` | Upload private inspection photos with SHA-256 | ✓ | — | — | — |
| `inspection.report.submit` | Submit completed report for review | ✓ | — | — | — |
| `inspection.report.read_own` | Read inspector's own report history | ✓ | — | — | ✓ |
| `inspection.report.revise` | Revise report returned for rework | ✓ | — | — | — |
| `inspection.review.queue.read` | View reports awaiting quality review | — | ✓ | — | ✓ |
| `inspection.review.report.read` | Inspect evidence and findings of submitted reports | — | ✓ | — | ✓ |
| `inspection.review.approve` | Approve independently authored inspection report | — | ✓ | — | ✓* |
| `inspection.review.request_correction`| Return report for documented correction | — | ✓ | — | ✓ |
| `inspection.review.reject` | Reject report with documented reason | — | ✓ | — | ✓ |
| `inspection.template.read` | Read approved checklist template definitions | ✓ | ✓ | ✓ | ✓ |

*\*Note: An Admin or Reviewer who authored an inspection as the field inspector is strictly blocked by code from approving their own report (`INSPECTION_SELF_APPROVAL_DENIED`).*
