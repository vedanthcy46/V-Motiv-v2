import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { api, hasNativeFirebase as linkedFirebase, setDevSessionToken } from '../api';
import { withDeadline } from '../api-network';
import { friendlyError } from '../format';
import type { Profile } from '../types';

const isExpoGo =
  Constants.appOwnership === 'expo' ||
  (Constants.executionEnvironment as string) === 'storeClient';
const hasNativeFirebase = !isExpoGo && linkedFirebase;
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const firebaseConfigured = Boolean(webClientId) && hasNativeFirebase;

// Native Firebase must never evaluate in Expo Go.
let cachedAuth: any = null;
function getFirebaseAuth() {
  if (!hasNativeFirebase) return null;
  if (!cachedAuth) {
    try { cachedAuth = require('@react-native-firebase/auth'); } catch { cachedAuth = null; }
  }
  return cachedAuth;
}

let cachedGoogleSignin: any = null;
function getGoogleSignin() {
  if (!hasNativeFirebase) return null;
  if (!cachedGoogleSignin) {
    try { cachedGoogleSignin = require('@react-native-google-signin/google-signin'); } catch { cachedGoogleSignin = null; }
  }
  return cachedGoogleSignin;
}

type AuthContextValue = {
  state: 'booting' | 'signed-out' | 'signed-in';
  profile: Profile | null;
  user: Profile | null;
  configured: boolean;
  busy: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function useFirebaseSessionBase() {
  const [state, setState] = useState<AuthContextValue['state']>('booting');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const authModule = getFirebaseAuth();

  const syncSession = useCallback(async (user: any) => {
    const revision = ++generation.current;
    if (!user) {
      setProfile(null);
      setState('signed-out');
      setSyncing(false);
      return;
    }
    setError(null);
    setSyncing(true);
    const current = () => mounted.current && revision === generation.current && authModule?.getAuth().currentUser?.uid === user.uid;
    try {
      const result = await api<Profile>('/auth/sync', { method: 'POST' });
      if (current()) { setProfile(result); setState('signed-in'); }
    } catch (syncError) {
      if (current()) {
        setProfile(null);
        setError(friendlyError(syncError));
        setState('signed-out');
      }
      // Keep Google's verified session available to retry a temporary API outage.
    } finally {
      if (current()) setSyncing(false);
    }
  }, [authModule]);

  const retrySession = useCallback(async () => {
    await syncSession(authModule?.getAuth().currentUser);
  }, [authModule, syncSession]);

  const refreshProfile = useCallback(async () => {
    const uid = authModule?.getAuth().currentUser?.uid;
    if (!uid) return;
    try {
      const result = await api<Profile>('/me');
      if (mounted.current && authModule.getAuth().currentUser?.uid === uid) {
        setProfile(result);
        setError(null);
      }
    } catch (refreshError) {
      if (mounted.current) setError(friendlyError(refreshError));
      throw refreshError;
    }
  }, [authModule]);

  useEffect(() => {
    mounted.current = true;
    if (!authModule) { setState('signed-out'); return; }
    const bootGeneration = generation.current;
    const bootTimeout = setTimeout(() => {
      if (generation.current === bootGeneration) {
        setError(friendlyError(new Error('SESSION_TIMEOUT')));
        setState('signed-out');
      }
    }, 18_000);
    let unsubscribe: (() => void) | undefined;
    try {
      // Token refresh inside an API retry must not recursively start another sync.
      unsubscribe = authModule.onAuthStateChanged(authModule.getAuth(), (user: any) => {
        clearTimeout(bootTimeout);
        void syncSession(user);
      });
    } catch (restoreError) {
      clearTimeout(bootTimeout);
      setError(friendlyError(restoreError));
      setState('signed-out');
    }
    return () => {
      mounted.current = false;
      generation.current++;
      clearTimeout(bootTimeout);
      unsubscribe?.();
    };
  }, [authModule, syncSession]);

  const signOut = useCallback(async () => {
    if (!authModule) return;
    generation.current++;
    setBusy(true);
    setSyncing(false);
    setProfile(null);
    setState('signed-out');
    setError(null);
    try {
      await withDeadline(authModule.signOut(authModule.getAuth()), 8_000, 'SESSION_TIMEOUT');
    } catch (signOutError) {
      setError(friendlyError(signOutError));
    } finally { setBusy(false); }
  }, [authModule]);

  return { state, profile, busy: busy || syncing, setBusy, error, setError, signOut, refreshProfile, retrySession };
}

function ConfiguredProvider({ children }: React.PropsWithChildren) {
  const session = useFirebaseSessionBase();
  const authModule = getFirebaseAuth();
  const googleSigninModule = getGoogleSignin();

  useEffect(() => {
    if (webClientId && googleSigninModule) {
      try {
        googleSigninModule.GoogleSignin.configure({ webClientId, offlineAccess: false });
      } catch { session.setError('Google sign-in could not initialize. Reopen the V MOTIV development build.'); }
    }
  }, [googleSigninModule]);

  const signIn = useCallback(async () => {
    if (!authModule || !googleSigninModule) {
      session.setError('Native Google Sign-In is not available in this build.');
      return;
    }
    session.setError(null);
    session.setBusy(true);
    try {
      if (authModule.getAuth().currentUser) {
        await session.retrySession();
        return;
      }
      await withDeadline(googleSigninModule.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true }), 12_000, 'SESSION_TIMEOUT');
      const result: any = await withDeadline(googleSigninModule.GoogleSignin.signIn(), 120_000, 'GOOGLE_SIGN_IN_TIMEOUT');
      if (!googleSigninModule.isSuccessResponse(result) || !result.data.idToken) {
        session.setError('Google sign-in was cancelled.');
        return;
      }
      const credential = authModule.GoogleAuthProvider.credential(result.data.idToken);
      await withDeadline(authModule.signInWithCredential(authModule.getAuth(), credential), 15_000, 'SESSION_TIMEOUT');
    } catch (signInError) {
      session.setError(friendlyError(signInError));
    } finally { session.setBusy(false); }
  }, [session, authModule, googleSigninModule]);

  const value = useMemo<AuthContextValue>(() => ({
    state: session.state, profile: session.profile, user: session.profile,
    configured: true, busy: session.busy, error: session.error,
    signIn, signOut: session.signOut, refreshProfile: session.refreshProfile,
  }), [session.state, session.profile, session.busy, session.error, signIn, session.signOut, session.refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function ExpoGoProvider({ children }: React.PropsWithChildren) {
  const [state, setState] = useState<AuthContextValue['state']>('signed-out');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setDevSessionToken('dev-preview-token');
      const res = await api<Profile>('/auth/sync', { method: 'POST' });
      setProfile(res);
      setState('signed-in');
    } catch (e: any) {
      setDevSessionToken(undefined);
      setError(friendlyError(e));
      setState('signed-out');
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setDevSessionToken(undefined);
    setProfile(null);
    setState('signed-out');
    setError(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await api<Profile>('/me');
      setProfile(res);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    state,
    profile,
    user: profile,
    configured: true,
    busy,
    error,
    signIn,
    signOut,
    refreshProfile,
  }), [state, profile, busy, error, signIn, signOut, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function UnconfiguredProvider({ children }: React.PropsWithChildren) {
  return <ExpoGoProvider>{children}</ExpoGoProvider>;
}

export function AuthProvider({ children }: React.PropsWithChildren) {
  if (isExpoGo || !hasNativeFirebase) return <ExpoGoProvider>{children}</ExpoGoProvider>;
  return firebaseConfigured ? <ConfiguredProvider>{children}</ConfiguredProvider> : <UnconfiguredProvider>{children}</UnconfiguredProvider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider missing');
  return value;
}
