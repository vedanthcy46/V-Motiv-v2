import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as firebaseSignOut } from 'firebase/auth';
import { ApiError, createApiClient, resolveApiBase } from '@vmotiv/ui';
import { auth, firebaseConfigured } from '../firebase';
import { createScrapApi } from '../../../customer-mobile/src/services/scrap-endpoints';
import { TERMS_VERSION, accountErrorMessage, isSilentSignInError, shouldFallBackToRedirect, type WebProfile } from './account';

// The signed-in state for the scrapping area. Signing in is Google only, the same as the app. After Google confirms who the person is, V MOTIV's
// server creates or loads their account (POST /auth/sync). Google sign-in alone does not prove they own any vehicle; that is declared in the form.

type State = 'booting' | 'signed-out' | 'signed-in';

interface Session {
  state: State;
  profile: WebProfile | null;
  busy: boolean;
  error: string;
  unavailable: boolean;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  retry(): Promise<void>;
  saveProfile(input: { phone: string; marketingConsent: boolean }): Promise<void>;
  scrap: ReturnType<typeof createScrapApi>;
}

// In production the API is api.vmotiv.in (the website's host does not proxy /api); while developing, Vite proxies /api to the local server.
const apiBase = resolveApiBase(import.meta.env.VITE_API_BASE as string | undefined, import.meta.env.PROD ? 'https://api.vmotiv.in' : '/api/v2');

const client = createApiClient({
  base: apiBase,
  getToken: async force => {
    const user = auth?.currentUser;
    if (!user) throw new ApiError(401, 'AUTHENTICATION_REQUIRED');
    return user.getIdToken(force);
  },
  timeoutMs: 20_000,
  preferMessage: false,
});

export const scrapApi = createScrapApi((path, method, body) => client.request(path, { method, ...(body === undefined ? {} : { body }) }));

const Context = createContext<Session | null>(null);

export function useSession(): Session {
  const value = useContext(Context);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('booting');
  const [profile, setProfile] = useState<WebProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);

  // Loads (or creates) the person's V MOTIV account for the Google user. A newer sign-in or sign-out cancels an older one still running.
  const syncing = useRef<string | null>(null);
  const sync = useCallback(async (uid: string | null) => {
    if (uid && syncing.current === uid) return; // the same account is already being loaded (the sign-in listener and the sign-in button both ask)
    const turn = ++generation.current;
    syncing.current = uid;
    if (!uid) { setProfile(null); setState('signed-out'); setBusy(false); return; }
    setBusy(true);
    setError('');
    try {
      const result = await client.request<WebProfile>('/auth/sync', { method: 'POST' });
      if (turn !== generation.current) return;
      setProfile(result);
      setState('signed-in');
    } catch (syncError) {
      if (turn !== generation.current) return;
      setProfile(null);
      setError(accountErrorMessage(syncError));
      setState('signed-out'); // the Google session stays, so "Try again" can retry without another Google prompt
    } finally {
      if (turn === generation.current) { setBusy(false); syncing.current = null; }
    }
  }, []);

  useEffect(() => {
    if (!auth) { setState('signed-out'); return undefined; }
    const timeout = window.setTimeout(() => { setState(current => (current === 'booting' ? 'signed-out' : current)); }, 12_000);
    const stop = onAuthStateChanged(auth, user => { window.clearTimeout(timeout); void sync(user?.uid ?? null); }, authError => { window.clearTimeout(timeout); setError(accountErrorMessage(authError)); setState('signed-out'); });
    return () => { window.clearTimeout(timeout); stop(); generation.current += 1; };
  }, [sync]);

  const signIn = useCallback(async () => {
    if (!auth) return;
    setError('');
    setBusy(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await signInWithPopup(auth, provider);
      await sync(result.user.uid); // does nothing if the sign-in listener is already loading this account
    } catch (popupError) {
      if (shouldFallBackToRedirect(popupError)) {
        // Popups are blocked here (some in-app browsers and strict privacy modes). Go to Google in this tab; the page returns signed in.
        try { await signInWithRedirect(auth, provider); return; } catch (redirectError) { setError(accountErrorMessage(redirectError)); setBusy(false); return; }
      }
      if (!isSilentSignInError(popupError)) setError(accountErrorMessage(popupError));
      setBusy(false);
    }
  }, [sync]);

  const signOut = useCallback(async () => {
    generation.current += 1;
    syncing.current = null;
    setProfile(null);
    setState('signed-out');
    setError('');
    try { if (auth) await firebaseSignOut(auth); } catch { /* the local state is already signed out */ }
  }, []);

  const retry = useCallback(async () => { await sync(auth?.currentUser?.uid ?? null); }, [sync]);

  const saveProfile = useCallback(async (input: { phone: string; marketingConsent: boolean }) => {
    await client.request('/me', { method: 'PATCH', body: { phone: input.phone, marketingConsent: input.marketingConsent, termsVersion: TERMS_VERSION } });
    setProfile(await client.request<WebProfile>('/me'));
  }, []);

  const value = useMemo<Session>(() => ({
    state, profile, busy, error, unavailable: !firebaseConfigured, signIn, signOut, retry, saveProfile, scrap: scrapApi,
  }), [state, profile, busy, error, signIn, signOut, retry, saveProfile]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
