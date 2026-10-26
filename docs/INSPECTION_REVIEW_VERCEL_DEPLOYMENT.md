# Inspection Review Portal — Vercel Deployment Guide

Deploying the **Inspection Review Portal** to Vercel with the custom domain **`review.vmotiv.in`**.

---

## 1. Vercel Project Settings

In your Vercel Dashboard ([vercel.com](https://vercel.com)):

1. Click **Add New…** → **Project**.
2. Select your repository: `vmotiv-v2`.
3. Configure the Project Settings:
   - **Project Name**: `vmotiv-review` (or `review-vmotiv`)
   - **Framework Preset**: `Vite`
   - **Root Directory**: `apps/inspection-review-portal` (Click *Edit* next to Root Directory and select `apps/inspection-review-portal`)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install` (or leave default)

---

## 2. Environment Variables in Vercel

Under **Project Settings** → **Environment Variables**, add the following:

| Variable Key | Recommended Value | Notes |
| :--- | :--- | :--- |
| `VITE_API_BASE` | `https://api.vmotiv.in/api/v2` | Production API endpoint |
| `VITE_FIREBASE_API_KEY` | `AIzaSyCA2EI0NpFKUvnlBSpZ-TscP_1tcTKgt70` | Firebase Web API Key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `v-motiv.firebaseapp.com` | Firebase Auth Domain |
| `VITE_FIREBASE_PROJECT_ID` | `v-motiv` | Firebase Project ID |
| `VITE_FIREBASE_APP_ID` | `1:717469798962:web:37989b8349c619a51aa22b` | Firebase Web App ID |

> [!NOTE]
> `vercel.json` already proxies `/api/*` rewrites to `https://api.vmotiv.in/api/*` as well, so both direct and relative API paths work seamlessly.

---

## 3. Custom Domain Configuration (`review.vmotiv.in`)

1. In the Vercel project, go to **Settings** → **Domains**.
2. Enter `review.vmotiv.in` and click **Add**.
3. Vercel will prompt for DNS verification.

### DNS Records to add at your DNS Registrar / Cloudflare:

| Type | Name / Host | Target / Value | TTL | Proxy status (Cloudflare) |
| :--- | :--- | :--- | :--- | :--- |
| **CNAME** | `review` | `cname.vercel-dns.com` | Auto (or 3600) | DNS Only (or Proxied) |

---

## 4. Firebase Authentication Authorization

To allow Google Sign-in popups on `review.vmotiv.in`:

1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select project **v-motiv**.
3. Go to **Authentication** → **Settings** tab → **Authorized domains**.
4. Click **Add domain** and enter:
   ```
   review.vmotiv.in
   ```
5. Click **Save**.

---

## 5. Backend CORS Verification

The backend API (`services/api/src/app.ts`) is already configured with CORS permissions for:
- `https://review.vmotiv.in`
- `https://vmotiv-review.vercel.app`
