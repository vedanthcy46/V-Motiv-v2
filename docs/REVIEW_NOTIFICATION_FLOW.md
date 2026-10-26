# V MOTIV V2 — Inspection Review & Quality Gate Notification Flow

## 1. Sequence Overview

```mermaid
sequenceDiagram
    actor Inspector as Inspector A
    participant Backend as Express API + PostgreSQL
    actor Reviewer as Reviewer B
    actor Sales as Sales Advisor
    actor Pricing as Pricing Approver
    participant Worker as Notification Worker

    Note over Inspector,Backend: Step 1: Report Submitted
    Inspector->>Backend: Submit Report Revision v1 (All photos verified)
    Backend->>Backend: Update Report (SUBMITTED)
    Backend->>Backend: Emit INSPECTION_REPORT_SUBMITTED
    Backend-->>Reviewer: In-App Notification in Review Portal
    Backend->>Worker: Enqueue Transactional Email (EmailOutbox)

    alt Scenario A: Corrections Required (Rework)
        Reviewer->>Backend: Decide: REQUEST_CORRECTION (Reason: "Engine bay photo blurry")
        Backend->>Backend: Create Decision (REQUEST_CORRECTION)
        Backend->>Backend: Clone Report to Revision v2 (REWORK_REQUIRED)
        Backend->>Backend: Emit INSPECTION_REWORK_REQUIRED (inspectorId: A)
        
        par Push to Inspector
            Worker->>Inspector: Push: "Corrections Requested: Reviewer feedback requires attention"
        and Email to Inspector
            Worker->>Inspector: Email inspection-rework-v1 with safe summary
        and In-App Inbox
            Backend-->>Inspector: In-App notification with tap-to-open
        end

        Inspector->>Backend: Open App, retake photo, and resubmit (v2)
        Backend->>Backend: Emit INSPECTION_REPORT_RESUBMITTED
        Backend-->>Reviewer: In-App notification: "Corrected Report Resubmitted"

    else Scenario B: Approved
        Reviewer->>Backend: Decide: APPROVE
        Backend->>Backend: Create Decision (APPROVE)
        Backend->>Backend: Update Report (APPROVED)
        Backend->>Backend: Emit INSPECTION_REVIEW_APPROVED
        
        par Sales & Pricing Notifications
            Backend-->>Sales: In-App: "Inspection Approved: Ready for Offer"
            Backend-->>Pricing: In-App: "Valuation Ready for Review"
            Worker->>Sales: Email: inspection-approved-v1
        end
    end
```

---

## 2. Review Portal Queue Controls

The Review Queue (`/inspection-review/queue`) features:
1. **Default Ordering**: Newest submitted first (`submitted_desc`) to ensure rapid turnaround on incoming reports.
2. **Stable Pagination**: Secondary sort on `id DESC`.
3. **Status Filtering**: `ALL`, `SUBMITTED`, `UNDER_REVIEW`.
4. **Server-Side Text Search**: Search across vehicle make, model, reference code, and seller name.
5. **Real-Time Notification Bell**: Unread indicator and quick dropdown displaying recent review events.
