# Admin Deployment

## 1. Database Migrations

Apply Prisma database migrations as a controlled release step before deploying code. The migration runner (`deploy-database.mjs`) automatically targets the configured `DATABASE_URL` (both local PostgreSQL and Neon AWS production PostgreSQL):

```powershell
npm run db:deploy
```

Active migrations in V2:
- `20261023164000_initial_customer_schema`
- `20261023190000_email_outbox_queue`
- `20261023223000_admin_control_centre_foundation`
- `20261024090000_admin_governance_expansion`
- `20261024160000_admin_operations_governance` (adds `ExportJob`, `MasterDataItem`, updates `PrivacyRequest`)

## 2. Admin Seeding & Bootstrapping

To seed or refresh the canonical role-permissions, branches, and master data taxonomy idempotently:

```powershell
npm run seed:admin -w @vmotiv/api
```

This verifies the Super Administrator (`vmotiv.v@gmail.com`), seeds the 13 canonical system roles, assigns all 27 granular permissions, and ensures master automotive taxonomy is present.

For one-time initial Super Admin creation in a brand new environment:

```powershell
npm run bootstrap:admin -w @vmotiv/api
```

## 3. Environment Configuration

### Shared API (`services/api`)

| Variable | Description |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon PostgreSQL pooled/direct connection string |
| `WEB_ORIGIN` | `https://www.vmotiv.in` |
| `ADMIN_WEB_ORIGIN` | `https://admin.vmotiv.in` |
| `FIREBASE_PROJECT_ID` | `v-motiv-v2` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full Firebase Admin JSON service credentials |
| `ENFORCE_ADMIN_MFA` | `true` in production; can be set to `false` for local offline dev |
| `RESEND_API_KEY` | Transactional email provider key |
| `EMAIL_FROM` | `V MOTIV <concierge@vmotiv.in>` |
| `EMAIL_DELIVERY_ENABLED` | `true` |

### Admin Frontend (`apps/admin-portal`)

Deploy as a second Vercel project connected to the same GitHub repository (`vmotiv-v2`):
1. In Vercel Dashboard, click **Add New...** -> **Project**.
2. Select your `vmotiv-v2` repository.
3. Name the project `vmotiv-admin` (or `admin-vmotiv`).
4. **Root Directory**: Click "Edit" and select `apps/admin-portal`.
5. Framework Preset: **Vite** (auto-detected).
6. Build and Output Settings:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install` (or default)
7. Configure Environment Variables in Vercel:
   - `VITE_FIREBASE_API_KEY`: `AIzaSyCA2EI0NpFKUvnlBSpZ-TscP_1tcTKgt70`
   - `VITE_FIREBASE_AUTH_DOMAIN`: `v-motiv.firebaseapp.com`
   - `VITE_FIREBASE_PROJECT_ID`: `v-motiv`
   - `VITE_FIREBASE_APP_ID`: `1:717469798962:web:37989b8349c619a51aa22b`
   - `VITE_API_BASE`: `https://vmotiv.in/api/v2` (or `https://www.vmotiv.in/api/v2`)
8. Click **Deploy**.

### Custom Domain (`admin.vmotiv.in`) & DNS

1. In your new Vercel project (`vmotiv-admin`), navigate to **Settings** -> **Domains**.
2. Enter `admin.vmotiv.in` and click **Add**.
3. In your DNS provider (e.g., Cloudflare, GoDaddy, Namecheap):
   - Type: `CNAME`
   - Name / Host: `admin`
   - Target / Value: `cname.vercel-dns.com`
   - TTL: Auto / 1 hour
4. Vercel will automatically provision a free SSL certificate.

### Firebase Authorized Domains

1. Open **Firebase Console** -> **Authentication** -> **Settings** tab.
2. Under **Authorized domains**, click **Add domain**.
3. Add `admin.vmotiv.in`.
4. (Optional) Also add any Vercel preview domain (e.g. `vmotiv-admin.vercel.app`) if testing branch deployments.

### Existing API Project Environment Check

In your existing Vercel project serving the API and main website (`vmotiv.in`):
1. Verify Environment Variables:
   - `ADMIN_WEB_ORIGIN`: `https://admin.vmotiv.in`
   - `NODE_ENV`: `production`
2. If `ADMIN_WEB_ORIGIN` was not set, add it and redeploy the API so that CORS and invitation links target `https://admin.vmotiv.in`.

## 4. Multi-Factor Authentication Verification

To register an SMS 2FA phone number on an employee account for local testing:

```powershell
npm run mfa:enroll -w @vmotiv/api -- +919876543210
```
