# V MOTIV V2 — Inspector Assignment & Inspection Notification Flow

## 1. Sequence Overview

```mermaid
sequenceDiagram
    actor Sales as Sales Executive
    actor Ops as Operations Manager
    actor Inspector as Inspector A
    participant Backend as Express API + PostgreSQL
    participant Worker as Notification Worker
    participant Expo as Expo Push Service
    participant Resend as Resend Email Service

    Note over Sales,Backend: Step 1: Inspection Requested
    Sales->>Backend: Request Inspection for Lead
    Backend->>Backend: Create InspectionRequest (REQUESTED)
    Backend->>Backend: Emit INSPECTION_REQUESTED
    Backend-->>Ops: In-App Notification in Operations Portal
    Backend->>Worker: Enqueue Transactional Email (EmailOutbox)
    Worker->>Resend: Dispatch inspection-requested-v1 Email

    Note over Ops,Backend: Step 2: Operations Assigns Inspector
    Ops->>Backend: Assign Inspector A to Request
    Backend->>Backend: Upsert InspectionAssignment (ASSIGNED)
    Backend->>Backend: Emit INSPECTION_ASSIGNED (inspectorId: A)
    Backend->>Backend: Persist In-App Notification (Notification)
    Backend->>Worker: Enqueue PushTicket & EmailOutbox

    par Push Channel
        Worker->>Expo: Batch Send (High Priority)
        Expo-->>Inspector: Lock Screen: "New Inspection Assigned"
    and Email Channel
        Worker->>Resend: Dispatch inspection-assigned-v1
        Resend-->>Inspector: Work Email with Appointment Details
    and In-App Inbox
        Backend-->>Inspector: Unread Notification Badge in Inspector App
    end

    Note over Inspector,Backend: Step 3: Inspector Opens Job
    Inspector->>Backend: Tap Notification -> Deep link vmotiv://inspections/:id
    Backend->>Backend: Authenticate & Verify Role Assignment
    Backend-->>Inspector: Render 180-Point Inspection Form
```

---

## 2. Reassignment Workflow
If Operations reassigns a job from **Inspector A** to **Inspector B**:
1. `INSPECTION_REASSIGNED` is dispatched to **Inspector A**:
   - In-App: `Inspection Assignment Reassigned: [Vehicle Title]`
   - Push: `Assignment reassigned to another inspector`
   - Email: `Inspection Assignment Update`
2. `INSPECTION_ASSIGNED` is dispatched to **Inspector B**:
   - In-App, Push, and Email with complete job details and assignment schedule.

---

## 3. Rescheduling Workflow
When an appointment date or time window changes:
- `INSPECTION_APPOINTMENT_CHANGED` is emitted.
- Inspector, customer, and sales executive receive coordinated in-app, push, and email confirmations.
