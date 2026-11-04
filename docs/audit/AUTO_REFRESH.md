# Soft auto-refresh (near real time without a manual refresh)

Status: implemented; all apps typecheck; unit tests for the scheduling rules pass (admin portal and mobile). Not exercised on a device or against the live API; measure request volume for a week after release (Cloudflare analytics, Neon usage).

## How it works
- **Web portals** (`src/autoRefresh.ts`, one identical copy per portal because the repo has no shared package) and **mobile** (`src/hooks/useAutoRefresh.ts`): re-run a loader on a timer in *silent* mode (no spinner, current data stays on screen, no error banner flashing).
- Runs only while the page/tab is visible (mobile: app in foreground and the screen focused), never while a dialog/sheet is open (so a form is never refreshed under someone), never overlaps itself, and on the web stops after 20 min without interaction. It refreshes immediately when the tab/app comes back.
- Backs off (x2 per consecutive failure, max 5 min) while the API is failing and resets after one success.

## Where
| Surface | Refresh | Notes |
|---|---|---|
| Operations: dispatch/acquisitions/inventory | 30 s | pauses when a modal is open |
| Operations: Rentals | 30 s | pauses on booking drawer / walk-in / onboarding |
| Operations: Service | 30 s | pauses while a job drawer is open |
| Finance | 45 s | pauses while a finance dialog is open |
| Inspection review | 30 s | |
| Sales | 30 s (current page) | previously only the Inspections page, without visibility pause |
| Admin notifications | 20 s | was a fixed 15 s timer that kept running in hidden tabs |
| App: Activity tab | 45 s | |
| App: Service request details | 30 s | pauses while an estimate/cancel/pay sheet is open |
| App: Rental booking details | 30 s | pauses while a pay/extension sheet is open |

## Cost
Roughly: extra requests per day = people with the screen open x open minutes x (60 / interval). Hidden tabs, backgrounded apps, idle sessions and open dialogs cost nothing. Each refresh re-runs the screen's normal queries (the Finance refresh runs 16 requests), so the Finance interval is the longest.

## Not built (next, if volume matters)
- Server change detection (ETag / `updatedAt` marker so unchanged polls return an empty reply) on the list endpoints; today every refresh runs the full queries.
- Push-triggered refresh for customer status changes, and Durable Objects/SSE for true real time on a live Operations board.
- Home, My Garage and Explore do not auto-refresh (Explore would reshuffle a list the customer is browsing).

## Second pass: change detection so an idle screen is almost free
Problem with the first pass: every refresh re-ran the screen's heavy queries (7 requests for Operations, 16 for Finance), even when nothing had changed.

Now each refresh is **one tiny request** to `GET /pulse?domains=...` (`services/api/src/pulse.ts`), and the heavy loader runs **only when that domain's token changed**.
- **Token** = a short hash of (row count, newest `updatedAt`) per table for the domain, so any insert, update or delete changes it. Domains: `dispatch`, `review`, `rentals`, `service`, `sales`, `finance` (staff) and `me` (the signed-in customer's own records).
- **Server cost:** a handful of count/max aggregates, cached in memory for 8 seconds with in-flight de-duplication, so any number of clients polling the same domain share one database round per 8 s per Worker instance. Authorization (active account, active employee) is checked on every call and never cached, so suspended staff stop receiving signals immediately. Customers can read only `me`, scoped to their own rows.
- **Client:** first token is recorded without reloading (the data was just loaded); a different token triggers one silent reload; an unchanged token costs nothing further. A full reload still happens at least every 5 minutes as a safety net for anything the token does not cover.
- **Wired:** Operations (dispatch, rentals, service), Finance, Inspection review, Sales, and the app's Activity, Service details and Rental details screens. Admin notifications keep their own light 20 s poll (hidden tabs paused).

### Effect (before to after, per open screen, per interval)
| Screen | Before | After (nothing changed) |
|---|---|---|
| Operations dispatch | 7 list requests | 1 tiny request |
| Finance | 16 list requests | 1 tiny request |
| App Activity | 8 requests | 1 tiny request |
Heavy reloads happen only after a real change.

### Caveats
- Staff tokens are global, not per branch: a change in another branch causes one extra (harmless) reload.
- The 8 s cache means a change can take up to ~8 s plus one poll interval to appear.
- Counts are over whole tables; if a table becomes very large, add an index on its `updatedAt` or switch that probe to a maintained "last change" row.
- Not built: push-triggered refresh and Durable Objects/SSE for true real time.
