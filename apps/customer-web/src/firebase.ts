import { getApp, getApps, initializeApp } from 'firebase/app';
import { browserPopupRedirectResolver, browserSessionPersistence, getAuth, initializeAuth } from 'firebase/auth';
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const configured = Object.values(config).every(value => typeof value === 'string' && value.trim());
// Vite re-evaluates this module during HMR. Reuse the SDK instance so an edit
// cannot strand the page with auth/already-initialized.
export const auth = !configured ? null : getApps().length ? getAuth(getApp()) : initializeAuth(initializeApp(config), {
  persistence: browserSessionPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});

