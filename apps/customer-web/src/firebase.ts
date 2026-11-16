import { getApp, getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, browserPopupRedirectResolver, getAuth, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';

// Firebase for the website's scrapping area only. This file is imported only from the lazily loaded scrapping code, so the landing page
// never downloads it. Set VITE_FIREBASE_AUTH_DOMAIN to vmotiv.in (with /__/auth/* proxied to Firebase) so sign-in by redirect keeps working in
// browsers that block third-party storage; otherwise the default <project>.firebaseapp.com is used.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(config).every(value => typeof value === 'string' && value.trim());

export const auth = !firebaseConfigured
  ? null
  : getApps().length
    ? getAuth(getApp())
    : initializeAuth(initializeApp(config), {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence],
        popupRedirectResolver: browserPopupRedirectResolver,
      });
