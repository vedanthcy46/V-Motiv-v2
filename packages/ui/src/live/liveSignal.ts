// Realtime "something changed" signal from Firebase Realtime Database (path /pulse/<domain>, written by the API).
// It travels over Firebase's own connection, not through Cloudflare, so listening costs the API nothing.
// Returns an unsubscribe function, or null when Realtime Database is not configured (the caller then keeps polling).
import { getApps } from 'firebase/app';

export interface LiveHandlers {
  /** Called once per path when the listener is established (so the caller can slow its backup polling). */
  onConnected: () => void;
  /** Called when a path changes after the first value. */
  onSignal: () => void;
}

export function liveConfigured(): boolean {
  return Boolean((import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined)?.trim()) && getApps().length > 0;
}

export function subscribeLive(domains: string[], handlers: LiveHandlers): (() => void) | null {
  const url = (import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined)?.trim();
  if (!url || getApps().length === 0) return null;
  let cancelled = false;
  const unsubscribers: Array<() => void> = [];
  void import('firebase/database')
    .then(({ getDatabase, ref, onValue }) => {
      if (cancelled) return;
      const database = getDatabase(getApps()[0], url);
      for (const domain of domains) {
        let first = true;
        const off = onValue(
          ref(database, `pulse/${domain}`),
          () => {
            if (first) { first = false; handlers.onConnected(); return; }
            handlers.onSignal();
          },
          () => undefined, // permission or network error: silently fall back to polling
        );
        unsubscribers.push(off);
      }
    })
    .catch(() => undefined);
  return () => {
    cancelled = true;
    unsubscribers.forEach(off => off());
  };
}
