# Finance Portal — Vercel Deployment Guide

Deploying the **Finance Portal** to Vercel with the custom domain **`finance.vmotiv.in`**.

---

## 1. Why the Previous Build Failed

The error:
```
npm error workspace @vmotiv/finance-portal@0.1.0
npm error location /vercel/path0/apps/finance-portal
npm error Missing script: "db:generate"
Error: [BUILD_UTILS_SPAWN_1] Command "npm run db:generate && npm run build -w @vmotiv/api" exited with 1
```
occurred because:
1. `apps/finance-portal` previously lacked its own `vercel.json`, causing Vercel to inherit the repository root `vercel.json`'s backend build command (`npm run db:generate && npm run build -w @vmotiv/api`).
2. OR in the Vercel Dashboard project settings, the **Build Command** override was set to the API build command instead of the frontend Vite build command.

---

## 2. Vercel Project Settings for Finance Portal

In your Vercel Dashboard ([vercel.com](https://vercel.com)):

1. Open your **Finance Portal** project (or create a new one: **Add New…** → **Project** → `V-Motiv-v2`).
2. Go to **Settings** → **General**:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `apps/finance-portal` (Click *Edit* and select `apps/finance-portal`)
   - **Build Command**: Toggle **OFF** the override (or set to `npm run build`)
   - **Output Directory**: Toggle **OFF** the override (or set to `dist`)
   - **Install Command**: Toggle **OFF** the override (or leave default `npm install`)

---

## 3. Environment Variables in Vercel

Under **Project Settings** → **Environment Variables**, configure:

| Variable Key | Recommended Value | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE` | `https://api.vmotiv.in/api/v2` | Production API Base URL |
| `VITE_FIREBASE_API_KEY` | `AIzaSyCA2EI0NpFKUvnlBSpZ-TscP_1tcTKgt70` | Firebase Web API Key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `v-motiv.firebaseapp.com` | Firebase Auth Domain |
| `VITE_FIREBASE_PROJECT_ID` | `v-motiv` | Firebase Project ID |
| `VITE_FIREBASE_APP_ID` | `1:717469798962:web:37989b8349c619a51aa22b` | Firebase Web App ID |

> [!NOTE]
> `apps/finance-portal/vercel.json` proxies all `/api/*` requests to `https://api.vmotiv.in/api/*` with `Cross-Origin-Opener-Policy: unsafe-none` so Google Sign-In popups work seamlessly.

---

## 4. Custom Domain (`finance.vmotiv.in`)

1. In the Vercel project, go to **Settings** → **Domains**.
2. Add `finance.vmotiv.in`.
3. In your DNS manager (Cloudflare or Domain Registrar), add:
   - **Type**: `CNAME`
   - **Name**: `finance`
   - **Target**: `cname.vercel-dns.com`

---

## 5. Firebase Authentication Authorized Domains

To allow Google Sign-in on `finance.vmotiv.in`:

1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select project **v-motiv**.
3. Go to **Authentication** → **Settings** → **Authorized domains**.
4. Click **Add domain** and enter:
   ```
   finance.vmotiv.in
   ```
5. Click **Save**.
