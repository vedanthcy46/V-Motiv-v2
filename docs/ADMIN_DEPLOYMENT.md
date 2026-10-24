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

Deploy as a dedicated Vercel project mapped to `admin.vmotiv.in`:
- Framework: Vite
- Root directory: `apps/admin-portal`
- Build command: `npm run build`
- Output directory: `dist`
- Node: 22 LTS or 24 LTS

Environment variables:
- `VITE_FIREBASE_API_KEY`: Firebase web API key
- `VITE_FIREBASE_AUTH_DOMAIN`: Firebase auth domain
- `VITE_FIREBASE_PROJECT_ID`: Firebase project ID
- `VITE_FIREBASE_APP_ID`: Firebase web app ID
- `VITE_API_BASE`: `https://www.vmotiv.in/api/v2`

## 4. Multi-Factor Authentication Verification

To register an SMS 2FA phone number on an employee account for local testing:

```powershell
npm run mfa:enroll -w @vmotiv/api -- +919876543210
```
