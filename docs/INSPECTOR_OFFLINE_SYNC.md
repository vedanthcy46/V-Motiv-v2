# V MOTIV V2 — Inspector Mobile Offline Synchronization

## 1. Offline Architectural Design

Field inspectors frequently work in underground basements, remote dealer yards, or locations with fluctuating mobile connectivity.

The mobile app implements a durable offline-first strategy:
- **Local Persistence**: Draft answers, observed identity, recorded defects, and captured photo evidence are saved immediately to local persistent storage before attempting cloud transmission.
- **Durable Operation Queues**:
  - `Draft Queue`: Enqueues uncommitted report revisions.
  - `Media Queue`: Enqueues full-resolution captured photo evidence with cryptographic checksums.
- **Cache Isolation**: Cached jobs, drafts, and media are scoped per Firebase user ID (`vmotiv-inspector/draft-queue/<uid>`).

## 2. Queue State Machine

```
LOCAL_DRAFT
    ↓
QUEUED (Network down or save rejected)
    ↓
UPLOADING (Network restored / user initiates sync)
    ↓
SYNCED (Server acknowledges recordVersion increment & media upsert)
    ├── Success: Cleared from pending queue
    └── Failure: Retained in queue for retry without silent data loss
```

## 3. Reconciliation & Concurrency

When reconnecting to the network:
1. `flushDrafts` uploads uncommitted draft state. If the server version has advanced (`INSPECTION_REPORT_VERSION_CONFLICT`), the inspector is prompted to resolve conflicts.
2. `flushMedia` streams pending evidence photos with SHA-256 validation.
3. Once all mandatory photos and required checklist items have been synchronized, final submission is permitted.
