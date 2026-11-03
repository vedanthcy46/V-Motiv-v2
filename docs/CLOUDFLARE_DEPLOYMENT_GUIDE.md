# Cloudflare Deployment Guide — V MOTIV V2
## Cloudflare Pages (Web Portals) & Cloudflare Workers (Backend API) Architecture

This guide provides end-to-end instructions for deploying all V MOTIV V2 web portals and the backend API onto Cloudflare's global edge network.

---

## 1. Architectural Topology

```
                                  CLOUDFLARE EDGE NETWORK
                                             │
      ┌──────────────────────────────────────┴──────────────────────────────────────┐
      │                                                                            │
  CLOUDFLARE PAGES                                                        CLOUDFLARE WORKERS
  (Vite 7 + React 19 SPAs)                                                (Node.js Compat + Express 5)
      │                                                                            │
      ├─ vmotiv.in        ─── apps/customer-web                                    └─ api.vmotiv.in
      ├─ ops.vmotiv.in    ─── apps/operations-portal                                  │
      ├─ finance.vmotiv.in─── apps/finance-portal                                     ├── Neon PostgreSQL Pooler
      ├─ admin.vmotiv.in  ─── apps/admin-portal                                       ├── Firebase Admin Auth
      ├─ sales.vmotiv.in  ─── apps/sales-portal                                       ├── Razorpay Gateway
      └─ review.vmotiv.in ─── apps/inspection-review-portal                           └── Resend Outbox Delivery
```

---

## 2. Web Portals Deployment (Cloudflare Pages)

All 6 web portals are Single Page Applications (SPAs) built with Vite and React 19.

### Key SPA Requirements (Configured)
1. **`_redirects` (`dist/_redirects`)**:
   Enables seamless client-side routing (React Router). Without this file, reloading deep paths such as `/service`, `/rentals`, or `/finance/dashboard` returns 404 from Cloudflare Pages.
   ```
   /*    /index.html   200
   ```
2. **`_headers` (`dist/_headers`)**:
   Provides security headers (`X-Frame-Options`, `X-Content-Type-Options`) and year-long immutable caching for bundled assets under `/assets/*`.

### Web Portal Worker/Pages Assets Configuration (`wrangler.jsonc`)

Each web portal utilizes Cloudflare's unified **Workers Static Assets** with built-in Single Page Application routing:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "vmotiv-customer-web",
  "compatibility_date": "2024-11-01",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```

This configuration enables:
1. Direct deployment via `npx wrangler deploy` without needing an auxiliary Worker script.
2. Built-in edge SPA fallback: any subroute (e.g. `/service`, `/rentals`, `/finance/dashboard`) automatically serves `/index.html` with status 200.
3. Compatibility with both Cloudflare Workers Static Assets (`wrangler deploy`) and Cloudflare Pages (`wrangler pages deploy dist`).

| Portal | Source Directory | Project Name (`wrangler.jsonc`) | Production Domain | Build Command | Output Directory |
|---|---|---|---|---|---|
| **Customer Web** | `apps/customer-web` | `vmotiv-customer-web` | `vmotiv.in`, `www.vmotiv.in` | `npm run build` | `dist` |
| **Operations Portal** | `apps/operations-portal` | `vmotiv-operations-portal` | `ops.vmotiv.in` | `npm run build` | `dist` |
| **Finance Portal** | `apps/finance-portal` | `vmotiv-finance-portal` | `finance.vmotiv.in` | `npm run build` | `dist` |
| **Admin Portal** | `apps/admin-portal` | `vmotiv-admin-portal` | `admin.vmotiv.in` | `npm run build` | `dist` |
| **Sales Portal** | `apps/sales-portal` | `vmotiv-sales-portal` | `sales.vmotiv.in` | `npm run build` | `dist` |
| **Inspection Review** | `apps/inspection-review-portal` | `vmotiv-inspection-review-portal` | `review.vmotiv.in` | `npm run build` | `dist` |

---

### Method A: Automated Git CI/CD via Cloudflare Dashboard

1. In the **Cloudflare Dashboard**, navigate to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
2. Select your repository (`vmotiv-v2`).
3. For each application, configure:
   - **Root directory**: `apps/<portal-name>` (e.g. `apps/customer-web`)
   - **Framework preset**: `Vite` (or `None`)
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Set the Environment Variable:
   - Variable Name: `VITE_API_BASE`
   - Value: `https://api.vmotiv.in/api/v2`
5. Click **Save and Deploy**.
6. Under **Custom Domains**, bind your production subdomain (e.g., `ops.vmotiv.in`).

---

### Method B: Direct CLI Deployment via Wrangler

You can build and deploy directly from your local terminal using Wrangler:

```bash
# Example: Deploying Operations Portal
cd apps/operations-portal
npm run build
npx wrangler pages deploy dist --project-name=vmotiv-operations-portal

# Example: Deploying Customer Web
cd apps/customer-web
npm run build
npx wrangler pages deploy dist --project-name=vmotiv-customer-web
```

---

## 3. Backend API Deployment (Cloudflare Workers)

The backend API (`services/api`) runs on Cloudflare Workers utilizing Cloudflare's **`nodejs_compat`** edge runtime with the specialized `worker-cf.ts` high-performance bridge.

### Worker Configuration (`services/api/wrangler.jsonc`)

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "vmotiv-api",
  "main": "src/worker-cf.ts",
  "compatibility_date": "2024-11-01",
  "compatibility_flags": [
    "nodejs_compat"
  ],
  "vars": {
    "NODE_ENV": "production",
    "WEB_ORIGIN": "https://vmotiv.in",
    "ADMIN_WEB_ORIGIN": "https://admin.vmotiv.in",
    "SALES_WEB_ORIGIN": "https://sales.vmotiv.in",
    "INSPECTION_REVIEW_WEB_ORIGIN": "https://review.vmotiv.in",
    "OPERATIONS_WEB_ORIGIN": "https://ops.vmotiv.in",
    "FINANCE_WEB_ORIGIN": "https://finance.vmotiv.in",
    "FIREBASE_PROJECT_ID": "vmotiv-2a0dc",
    "EMAIL_DELIVERY_ENABLED": "true"
  }
}
```

---

### Setting Cloudflare Worker Secrets

Sensitive credentials must be stored securely using `wrangler secret put`:

```bash
cd services/api

# 1. Neon Database URL (Pooled connection)
npx wrangler secret put DATABASE_URL
# Paste: postgresql://neondb_owner:npg_ZbytqXH2UKp8@ep-green-band-b52uqy11-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require

# 2. Firebase Admin Credentials
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
# Paste the single-line JSON of your Firebase Admin Service Account

# 3. Razorpay Payment Gateway Keys
npx wrangler secret put RAZORPAY_KEY_ID
npx wrangler secret put RAZORPAY_KEY_SECRET

# 4. Resend Email Dispatcher
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
```

---

### Deploying the Backend API

```bash
cd services/api

# Deploy directly to Cloudflare Workers
npm run cf:deploy
```

To bind a custom domain (`api.vmotiv.in`):
1. In **Cloudflare Dashboard** > **Workers & Pages** > `vmotiv-api` > **Settings** > **Triggers** > **Custom Domains**.
2. Add `api.vmotiv.in`.
3. Cloudflare will automatically provision edge SSL and route all traffic to the Worker.

---

## 4. Verification & Testing

Verify that all deployed services are operating correctly:

1. **Backend Health Check**:
   ```bash
   curl -I https://api.vmotiv.in/api/v2/health
   # Expected: HTTP/2 200 OK
   ```

2. **CORS Verification**:
   Ensure preflight `OPTIONS` requests from `https://vmotiv.in` and `https://ops.vmotiv.in` receive status 204 with authorized CORS headers.

3. **SPA Subroute Routing**:
   Load a direct deep link in the browser, e.g. `https://ops.vmotiv.in/service`. Ensure the page loads without 404 errors.
