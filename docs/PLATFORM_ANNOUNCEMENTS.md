# Platform announcements (promotional push)

Admin or Operations can tell customers about something new or changed ("new cars in Bengaluru", "service bookings now open") as an in-app notification plus a push on their phone.

## Who receives one

An announcement goes to a customer only if **all** of these are true:

- the account is `ACTIVE`;
- **Promotional & Inventory Updates is on** in the app (`User.marketingConsent`, the same switch as promotional email; the app's screen now says it covers notifications too);
- they are not staff (staff have their own inbox);
- if the announcement names a city, their preferred city matches.

Everyone who matches gets the in-app notification (category `PROMOTION`). A **push** is also queued if their push preference is not turned off and the customer app has registered a device for them. People who turned promotions off, suspended accounts and staff are never included. Transactional messages (offers, receipts, calls) are unaffected.

## Controls (who and how)

- Permission **`announcement.manage`**: held by Administrator, Super Admin and Operations Manager. Checked on every request.
- Admin portal → **Announcements**; Operations portal → **Customer announcements**. Both use the same screen.
- **Master switch** and **max per day** (default 2; 1 to 5). Switched off = nothing is sent and anything in progress pauses.
- Flow: write it → live preview and audience count → **send a test to yourself** → **review and send** (confirmation shows the exact count) or **send later**.
- **Send window: 9 am to 9 pm India time.** A "send now" at night waits for 9 am; a scheduled time outside the window is refused.
- If the audience changes by more than 10% (or 5 people) between review and confirm, the send is refused and you confirm again.
- **Cancel / stop sending** at any time; people already notified keep it.
- Tapping opens a fixed destination: just the message, Home, Buy, Sell, Rentals, Service, or one published car. No free-form links.
- Every create, edit, schedule, send, cancel and settings change is written to the audit log with who did it.

## How delivery works

`PlatformAnnouncement` (draft, scheduled, sending, sent, cancelled). The notification worker (`runNotificationCycle`) starts due announcements and delivers batches of 200 people in id order. Each batch saves its notifications, push tickets and progress in **one transaction**, and `Notification` has a unique `(announcementId, userId)` key, so a retry or a crashed worker never notifies anyone twice. Push tickets go through the existing Expo sender (`PushTicket`).

## API (`/api/v2/staff/announcements`, needs `announcement.manage`)

`GET /` list + settings · `GET /audience?city=` · `POST /` create · `GET|PATCH /:id` · `POST /:id/test` · `POST /:id/send {expectedRecipients, scheduledFor?}` · `POST /:id/cancel` · `GET|PUT /settings`.

## Deploying

Apply BOTH migrations: `20261122000000_platform_announcements` (tables) and `20261122010000_announcement_permission` (creates the `announcement.manage` permission and gives it to Super Admin, Administrator and Operations Manager). Without the second one every request is refused with `PERMISSION_DENIED`, because roles in an existing database are only changed by the seed script. After applying, staff must reload or sign in again so their permissions refresh. The worker or the cron trigger must be running, as for employee notifications. Customer apps need a new build to open announcement links from a tap (older builds still show the notification and open the Activity tab).

## Not verified

No real Expo push was sent from the build environment. The queue rows and tap routing are tested; delivery to a physical phone needs checking after deploy.
