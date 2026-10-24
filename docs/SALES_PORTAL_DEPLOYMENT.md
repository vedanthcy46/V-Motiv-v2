# V MOTIV V2 — Sales Executive Portal Deployment Guide

## 1. Domain & Environment Summary

| Component | Target URL | Local Port | Platform |
|---|---|---|---|
| **Sales Executive Portal** | `https://sales.vmotiv.in` | `3300` | Vercel (SPA) |
| **Admin Control Centre** | `https://admin.vmotiv.in` | `3200` | Vercel (SPA) |
| **Customer Web Application** | `https://www.vmotiv.in` | `3100` | Vercel / Next.js |
| **Unified V2 API** | `https://www.vmotiv.in/api/v2/*` | `4100` | Node.js Express / Docker |
| **PostgreSQL Database** | `ep-green-band-b52uqy11...neon.tech` | `5432` | Neon Serverless PostgreSQL |

---

## 2. Vercel Project Configuration (`apps/sales-portal`)

### Root Directory & Build Settings:
- **Framework Preset**: `Vite`
- **Root Directory**: `apps/sales-portal`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### `vercel.json` Specification:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "unsafe-none"
        }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://www.vmotiv.in/api/:path*"
    },
    {
      "source": "/:path*",
      "destination": "/index.html"
    }
  ]
}
```

> **Why `Cross-Origin-Opener-Policy: unsafe-none`?**
> Standard `same-origin` COOP headers block window messaging between the main SPA window and the Google OAuth popup window spawned by `firebase/auth` (`signInWithPopup`), causing `window.closed` and `auth/popup-closed-by-user` errors. `unsafe-none` ensures immediate token acquisition.

---

## 3. Environment Variables

### Frontend (`apps/sales-portal`):
```env
VITE_API_BASE=/api/v2
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=vmotiv-prod.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=vmotiv-prod
VITE_FIREBASE_STORAGE_BUCKET=vmotiv-prod.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### Backend (`services/api`):
```env
DATABASE_URL=postgresql://neondb_owner:...@ep-green-band-b52uqy11...neon.tech/neondb?sslmode=require
FIREBASE_PROJECT_ID=vmotiv-prod
SALES_WEB_ORIGIN=https://sales.vmotiv.in
ADMIN_WEB_ORIGIN=https://admin.vmotiv.in
WEB_ORIGIN=https://www.vmotiv.in
RESEND_API_KEY=re_...
```

---

## 4. Post-Deployment Verification Checklist
1. **Google Sign-In**: Navigate to `https://sales.vmotiv.in`, click "Sign In with Google", verify popup signs in without COOP errors.
2. **Access Control**: Attempt login with a non-employee Google account; verify `403 SALES_ACCESS_REQUIRED` screen appears.
3. **Branch Scope**: Log in with an active Sales Executive; verify branch badge displays the assigned city.
4. **Seller Workflows**: Submit a walk-in lead, claim it, log an interaction, and schedule an evaluation.
5. **Buyer Workflows**: Review inbound buyer enquiry, book a test drive, and prepare a retail quotation.
