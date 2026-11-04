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

## Third pass: keep Cloudflare requests low (free plan: 100,000 requests/day for the whole API)
- **Adaptive slow-down** (all portals and the app): after 3 checks with no change the check interval doubles, after 6 it quadruples, after 10 it is x8 (capped at 5 min). The first interaction (click, key press, returning to the tab/app) snaps it back to normal. A portal left open on a quiet screen therefore drops from about 2 requests/min to about 0.25/min.
- **Push first for customers:** the API already pushes customer-facing service and rental events. The app now reloads the visible screen as soon as a notification arrives (`services/refresh-bus.ts`, debounced 0.8 s), and once push is registered the backup change-check on those screens only runs every 5 minutes instead of every 30-45 s. Without push (permission denied, no EAS project id, simulators) the normal intervals still apply.
- Admin notification badge poll: 20 s -> 60 s.
- Estimated steady load (30 staff, 6 h open, mostly quiet): about 3-5k requests/day instead of about 22k; customers with push: about 1 request per 5 min per open screen.
- Limits: push covers events the server already notifies about; anything else is picked up by the 5-minute backup check or a pull-to-refresh. Staff portals still poll (Firebase Realtime Database signals would remove that, see earlier option 3; needs Realtime Database enabled in the Firebase console).

## Realtime Database signals (staff portals) — optional, off until configured

**What it does.** When rows in a watched table change, the API writes a timestamp to
`/pulse/<domain>` in Firebase Realtime Database (REST, from the Worker via `ctx.waitUntil`, coalesced to one write per
domain per 1.5 s). Portals listen to that path over Firebase's own connection (no Cloudflare requests), and on a change
do **one** `GET /pulse?...&fresh=1` and reload only if the token differs. While the listener is connected the normal
polling drops to a 5-minute safety net. The signal carries no data; permissions still come from the API.

**Not configured → nothing changes.** Without `FIREBASE_DATABASE_URL` the API installs no hook; without
`VITE_FIREBASE_DATABASE_URL` the portals keep the adaptive polling described above.

**Code:** `services/api/src/rtdb-signal.ts` (signaler, model→domain map from `STAFF_DOMAINS`), the Prisma `$extends`
hook in `services/api/src/worker-cf.ts`, `apps/*/src/liveSignal.ts` + `live` option in each `autoRefresh.ts`,
`database.rules.json` (read: signed-in users only; write: nobody from clients), `firebase.json`.
Tests: `services/api/test/rtdb-signal.test.ts`, `PulseCache fresh reads` in `pulse.test.ts`, `effectiveIntervalMs`.

**Limits to know:** writes made outside the Worker (scripts, migrations, another service) do not signal; the 5-minute
backup poll still catches them. Customer mobile uses push notifications instead (no RTDB listener).

### Turning it on (console actions only you can do)
1. Firebase console → project **v-motiv** → Build → **Realtime Database** → Create database (pick a region; it shows a URL like
   `https://v-motiv-default-rtdb.<region>.firebasedatabase.app`).
2. Deploy the rules: `firebase deploy --only database` (uses `database.rules.json`).
3. Worker secrets: `FIREBASE_DATABASE_URL` = that URL and `FIREBASE_SERVICE_ACCOUNT_JSON` = the service-account JSON
   (the same one the API already uses for Firebase Admin, if it is provided as a secret). The service account needs the
   *Firebase Realtime Database Admin* / Editor role.
4. Portals: set `VITE_FIREBASE_DATABASE_URL` to the same URL in each portal's environment and rebuild/redeploy.
5. Check: change a rental in the ops portal; another open ops tab should refresh within ~2–3 s.
