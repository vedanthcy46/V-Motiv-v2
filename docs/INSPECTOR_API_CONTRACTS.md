# V MOTIV V2 — Inspector & Review API Contracts

All endpoints are hosted on `https://api.vmotiv.in/api/v2` and require an authenticated Firebase Bearer Token.

## 1. Inspector Endpoints (`/api/v2/inspector`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/me` | Returns current inspector identity, employee roles, and branch assignments. |
| `GET` | `/assignments` | Lists active, confirmed, or draft inspections assigned to the current inspector. |
| `GET` | `/assignments/:id` | Returns single assignment details with customer and vehicle declarations. |
| `POST` | `/assignments/:id/start` | Starts inspection session, locks approved template version, and creates draft report. |
| `GET` | `/templates/:key/:version` | Returns approved inspection checklist template definition. |
| `GET` | `/reports/:id` | Returns report draft including answers, defects, media, and review feedback. |
| `PUT` | `/reports/:id/draft` | Updates draft answers, identity, and defects with optimistic concurrency (`recordVersion`). |
| `POST` | `/reports/:id/submit` | Atomically validates and seals completed report revision. |
| `POST` | `/reports/:id/media/initiate` | Validates assignment and returns media upload authorization. |
| `POST` | `/reports/:id/media/:mediaId/upload`| Uploads photo evidence with SHA-256 verification and private storage. |
| `GET` | `/reports/:id/media/:mediaId/content`| Streams private authenticated image to assigned inspector. |

## 2. Reviewer Endpoints (`/api/v2/inspection-review`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/queue` | Lists submitted reports awaiting review within reviewer's branch scope. |
| `GET` | `/reports/:id` | Returns full sealed report, evidence media, parent revision, and defect register. |
| `GET` | `/reports/:id/diff` | Returns calculated side-by-side differences from parent revision. |
| `POST` | `/reports/:id/decision` | Records `APPROVE`, `REQUEST_CORRECTION`, or `REJECT` decision with reason. |
| `GET` | `/reports/:id/media/:mediaId/content` | Streams private authenticated image to authorized reviewer. |

## 3. Operations Endpoints (`/api/v2/operations`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/inspection-requests` | Lists all evaluation requests with lead details and assignment status. |
| `GET` | `/inspectors` | Lists active inspectors in branch with current active workload count. |
| `POST` | `/inspection-requests/:id/assign` | Assigns an eligible inspector, appointment datetime, and instructions. |
| `POST` | `/inspection-requests/:id/reschedule` | Reschedules appointment with mandatory coordinator reason. |
| `POST` | `/inspection-requests/:id/cancel` | Cancels evaluation appointment with mandatory coordinator reason. |
