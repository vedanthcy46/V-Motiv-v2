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
- `FIREBASE_PROJECT_ID`: Firebase project ID
- `FIREBASE_SERVICE_ACCOUNT_JSON`: complete Firebase Admin service-account JSON stored as a secret, never a `VITE_` variable
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`: Firebase public web configuration
- `EMAIL_DELIVERY_ENABLED=false` for the HTTP function until a separate email worker is configured

Add the deployed website domain to Firebase Authentication's authorized domains. Local credentials file paths do not work in Vercel.

Keep development dependencies installed during the build, even with `NODE_ENV=production`. TypeScript and the Express/CORS/React declaration packages are build tools in devDependencies. If the Vercel dashboard has an Install Command override, change it to `npm ci --include=dev` or disable the override so this repository configuration applies.

## Database and email

Apply migrations separately before releasing against a new database: `npm run db:deploy`. Use the deployment database URL and optionally `DIRECT_DATABASE_URL`. Migrations intentionally do not run during every preview build. Preview deployments should use a separate Neon branch and matching Firebase/environment settings.

The API persists transactional emails to the outbox. Run `npm run email:worker` on a persistent worker host with the same database, `RESEND_API_KEY`, verified `EMAIL_FROM`, and `EMAIL_DELIVERY_ENABLED=true`. Vercel request functions do not run the local interval worker. Email delivery is incomplete until that worker is provisioned.

After deployment check `/api/v1/health/ready`, public inventory and Google sign-in. Set the mobile `EXPO_PUBLIC_API_URL` to `https://YOUR_DOMAIN/api/v1` and rebuild the mobile app to use the deployed backend.
