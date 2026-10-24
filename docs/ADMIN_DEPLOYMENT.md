# Admin Deployment

## Shared API

Apply migrations as a controlled release step before deploying code:

```powershell
npm run db:deploy
```

Required API variables include `NODE_ENV=production`, the dedicated V2 `DATABASE_URL`, `WEB_ORIGIN=https://www.vmotiv.in`, `ADMIN_WEB_ORIGIN=https://admin.vmotiv.in`, `FIREBASE_PROJECT_ID` and the complete protected `FIREBASE_SERVICE_ACCOUNT_JSON`. Enable email only after rotating the exposed historic key and configuring verified `RESEND_API_KEY`, `EMAIL_FROM` and `EMAIL_DELIVERY_ENABLED=true`.

Never place `FIREBASE_SERVICE_ACCOUNT_JSON`, database credentials or Resend keys in a `VITE_*` variable.

## Admin frontend project

Deploy `apps/admin-portal` as a separate Vercel project for `admin.vmotiv.in`:

- Framework: Vite
- Root directory: `apps/admin-portal`
- Install command: `npm ci --include=dev`
- Build command: `npm run build`
- Output directory: `dist`
- Node: 24 LTS

Set the four public Firebase web values from `.env.example`. Set `VITE_API_BASE=https://www.vmotiv.in/api/v2` when the Admin frontend is deployed on its separate domain. Add `admin.vmotiv.in` to Firebase Authentication authorized domains.

The public customer-web Vercel project remains rooted at the repository and continues to use the root `vercel.json`; the Admin deployment must not replace its output directory.

## One-time bootstrap

Run from a controlled operator environment with protected database/Firebase credentials. Supply `BOOTSTRAP_CONFIRM=CREATE_FIRST_SUPER_ADMIN`, the exact verified UID/email/name and the first branch code/name/city, then run:

```powershell
npm run bootstrap:admin -w @vmotiv/api
```

Unset every `BOOTSTRAP_*` value afterward. Re-running is refused after the first Super Admin exists.
