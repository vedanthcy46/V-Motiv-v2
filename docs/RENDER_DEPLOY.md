# Deploying the API on Render

The API is a normal Node service (`services/api/src/server.ts`): Express, Prisma, background email / push workers and the
realtime chat socket. `render.yaml` at the repository root describes it.

## Steps
1. Push the repository to GitHub.
2. Render dashboard -> **New -> Blueprint** -> choose this repository. Render reads `render.yaml`.
3. Fill in the values it asks for (everything marked `sync: false`): `DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_JSON`,
   the Cloudinary keys, `CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY`, `RESEND_API_KEY`, the SMS keys and `API_PUBLIC_URL`.
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: paste the whole service-account JSON (or its base64).
   - `API_PUBLIC_URL`: the service's address once Render shows it, e.g. `https://vmotiv-api.onrender.com`. Cashfree uses it for the
     payment return and webhook links.
4. Deploy. When it is live, `https://<service>.onrender.com/health/live` answers `{"status":"alive"}` and
   `/health/ready` also checks the database.
5. Apply database migrations from your machine (the build does not touch the database): `npm run db:deploy`.
6. Point the apps at the new address: set `EXPO_PUBLIC_API_URL` (mobile) and each portal's API URL to the Render address, and set
   the Cashfree webhook to `<API_PUBLIC_URL>/api/v2/payments/cashfree/webhook`.

## Keeping the free plan awake
Render sleeps a free service after about 15 minutes without incoming traffic, and the first request afterwards waits ~30-60 s.
- The API **calls its own `/health/live` every 5 minutes** (`src/keep-alive.ts`). It starts automatically on Render
  (it uses `RENDER_EXTERNAL_URL`, which Render sets) and logs `[KEEP-ALIVE] pinging ...` at start-up.
  Set `KEEP_ALIVE=false` to turn it off, or `KEEP_ALIVE_URL` to ping a different public address (for example a custom domain).
- A service that is already asleep cannot wake itself. Add an **external monitor** (UptimeRobot / cron-job.org, 5-minute
  interval) on the same health URL as a backstop - it also wakes the service after a restart or a deploy.
- A free service is limited to about 750 running hours a month, which just covers one always-awake service. For a production
  app, the `starter` plan removes sleeping altogether (then set `KEEP_ALIVE=false`).

## Environment variables
Every variable is listed with its purpose in `render.yaml` and `services/api/.env.example`. `PORT` is set by Render.
