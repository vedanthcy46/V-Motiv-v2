# Vercel deployment

Import the V2 repository and set Root Directory to the folder containing this `vercel.json` (`vmotiv-v2` if importing its parent). Do not select the mobile workspace.

- Framework preset: Other
- Install command: `npm ci --include=dev`
- Build command: `npm run db:generate && npm run build -w @vmotiv/api && npm run build -w @vmotiv/customer-web`
- Output directory: `apps/customer-web/dist`
- Node.js: 24.x

The website and `/api/v1` API share one domain. The mobile app itself is distributed through Android/iOS builds, not Vercel.

## CommonJS / ESM Resolution & jwks-rsa Fix (23 October 2026)

1. **Dynamic Import in `api/index.ts`**:
   Vercel wraps serverless function entries in an asynchronous runtime handler. `api/index.ts` uses dynamic `await import('../services/api/dist/vercel.js')` so that regardless of whether Vercel processes the entry as CommonJS or ESM, it resolves cleanly without `ERR_REQUIRE_ESM`.

2. **`jwks-rsa` / `jose` Dependency Pinning**:
   `firebase-admin@14.x` pulled in `jwks-rsa@4.1.0`, which had an unhandled synchronous `require('jose')` of a pure ESM package (`jose@6.x`). This caused Node.js inside Vercel serverless functions to crash on cold start with `ERR_REQUIRE_ESM: require() of ES Module ... jose/dist/webapi/index.js from jwks-rsa/src/utils.js not supported`.
   We pinned `firebase-admin@13.10.0` and enforced `"jwks-rsa": "3.1.0"` in `package.json` overrides. `jwks-rsa@3.1.0` uses `jose@4.x`, which is fully CommonJS compatible.

3. **Lazy Firebase Admin Initialization in `services/api/src/vercel.ts`**:
   Firebase Admin credentials check is now evaluated lazily inside token verification. This guarantees that public endpoints (`/api/v1/health/live`, `/api/v1/cities`, `/api/v1/inventory`) boot instantly without crashing if `FIREBASE_SERVICE_ACCOUNT_JSON` is temporarily absent in a preview branch.

4. **CORS Allowlist for Vercel Domains**:
   `services/api/src/app.ts` permits requests from `*.vercel.app`, `vmotiv.in`, and `www.vmotiv.in`.

## Environment variables

Set these in Vercel before building:

- `NODE_ENV=production`
- `DATABASE_URL`: dedicated V2 Neon pooled PostgreSQL URL with SSL
- `WEB_ORIGIN`: exact HTTPS website origin, without trailing slash (e.g. `https://www.vmotiv.in`)
- `CONNECT_PUBLIC_WEB_URL=https://www.vmotiv.in`: canonical public origin encoded in newly issued V MOTIV Connect stickers. This value can be omitted only when the default is correct.
- `FIREBASE_PROJECT_ID`: Firebase project ID
- `FIREBASE_SERVICE_ACCOUNT_JSON`: complete Firebase Admin service-account JSON stored as a secret, never a `VITE_` variable
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`: Firebase public web configuration
- `VITE_API_BASE=https://api.vmotiv.in/api/v1`: customer-web API origin when the web frontend and API are deployed separately.
- `VITE_ANDROID_APP_URL` and `VITE_IOS_APP_URL`: optional public store URLs. Connect QR pages first attempt `vmotiv://connect/scan`; these values provide the platform-specific store fallback once the listings are live.
- `RESEND_API_KEY`: Resend API key (`re_...`) for transactional customer emails
- `EMAIL_FROM`: Verified sender address (`noreply@vmotiv.in`)
- `EMAIL_DELIVERY_ENABLED=true`: Enables transactional email delivery. Vercel serverless requests automatically drain the transactional outbox inline upon customer actions (test drive booking, enquiries, sell car, support tickets, and welcome onboarding).

Add the deployed website domain to Firebase Authentication's authorized domains. Local credentials file paths do not work in Vercel.

Keep development dependencies installed during the build, even with `NODE_ENV=production`. TypeScript and the Express/CORS/React declaration packages are build tools in devDependencies. If the Vercel dashboard has an Install Command override, change it to `npm ci --include=dev` or disable the override so this repository configuration applies.

## Database and email

Apply migrations separately before releasing against a new database: `npm run db:deploy`. Use the deployment database URL and optionally `DIRECT_DATABASE_URL`. Migrations intentionally do not run during every preview build. Preview deployments should use a separate Neon branch and matching Firebase/environment settings.

If an already-deployed database is missing the V MOTIV Connect tables and Prisma is blocked by an unrelated historical failed migration, run `npm run db:repair-connect` once using that deployment database's `DATABASE_URL` / `DIRECT_DATABASE_URL`. It is idempotent and creates only the `CustomerVehicle` Connect columns and V MOTIV Connect persistence tables; it does not reset or delete data. Resolve the historical Prisma migration afterwards and run `npm run db:deploy` normally.

If production logs report missing `ServiceRequest`, `Notification`, `PushDevice`, or `VehicleListing.customerProfile`, run `npm run db:repair-platform` once with that production database's `DATABASE_URL` / `DIRECT_DATABASE_URL`, then redeploy the API. This repair is idempotent and creates the missing service, in-app notification, push-notification, and retail-listing profile persistence without deleting existing records. Follow it by resolving any historical failed migration and running `npm run db:deploy` normally.

The API persists transactional emails to the PostgreSQL `EmailOutbox` table. In the Vercel serverless deployment, mutation requests immediately drain and deliver pending emails via Resend before returning the HTTP response, guaranteeing instant delivery to the customer's inbox. Additionally, `/api/v1/health/drain-emails` is available for manual or cron triggers to flush any retryable emails. For standalone worker deployments outside Vercel, `npm run email:worker` remains available.

After deployment check `/api/v1/health/ready`, public inventory and Google sign-in. Set the mobile `EXPO_PUBLIC_API_URL` to `https://YOUR_DOMAIN/api/v1` and rebuild the mobile app to use the deployed backend.
