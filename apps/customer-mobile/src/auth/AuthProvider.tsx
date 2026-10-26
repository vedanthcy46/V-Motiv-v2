import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, hasNativeFirebase as linkedFirebase } from '../api';
import { withDeadline } from '../api-network';
import { friendlyError } from '../format';
import type { Profile } from '../types';
import { registerForPushNotificationsAsync } from '../services/notifications';

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

export type MfaFactorHint = {
  uid: string;
  factorId: string;
  displayName?: string;
  phoneNumber?: string;
};

export type MfaChallenge = {
  resolver: any;
  hints: MfaFactorHint[];
  selectedHint: MfaFactorHint | null;
  verificationId: string | null;
  codeSent: boolean;
};

type AuthContextValue = {
  state: 'booting' | 'signed-out' | 'signed-in';
  profile: Profile | null;
  user: Profile | null;
  configured: boolean;
  busy: boolean;
  error: string | null;
  isInspector: boolean;
  activeMode: 'customer' | 'inspector';
  setActiveMode: (mode: 'customer' | 'inspector') => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearSessionData: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  mfaChallenge: MfaChallenge | null;
  confirmMfaCode: (code: string) => Promise<void>;
  sendMfaCode: (hintUid?: string) => Promise<void>;
  cancelMfa: () => void;
};

function extractResolver(authModule: any, error: any) {
  if (!error) return null;
  const auth = authModule?.getAuth?.();
  if (typeof authModule?.getMultiFactorResolver === 'function' && auth) {
    try {
      const res = authModule.getMultiFactorResolver(auth, error);
      if (res?.hints) return res;
    } catch {}
  }
  if (typeof auth?.getMultiFactorResolver === 'function') {
    try {
      const res = auth.getMultiFactorResolver(error);
      if (res?.hints) return res;
    } catch {}
  }
  if (error.resolver?.hints) {
    return error.resolver;
  }
  const rawResolver = error.userInfo?.resolver || error.userInfo;
  if (rawResolver && Array.isArray(rawResolver.hints) && rawResolver.session && auth) {
    if (typeof authModule?.MultiFactorResolver === 'function') {
      try {
        return new authModule.MultiFactorResolver(auth, rawResolver);
      } catch {}
    }
    return {
      hints: rawResolver.hints,
      session: rawResolver.session,
      resolveSignIn: async (assertion: any) => {
        if (assertion.token && assertion.secret) {
          return auth.resolveMultiFactorSignIn(rawResolver.session, assertion.token, assertion.secret);
        }
        if (assertion.uid && assertion.verificationCode) {
          return auth.resolveTotpSignIn(rawResolver.session, assertion.uid, assertion.verificationCode);
        }
        throw new Error('Invalid multi-factor assertion');
      },
    };
  }
  return null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function useFirebaseSessionBase() {
  const [state, setState] = useState<AuthContextValue['state']>('booting');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isInspector, setIsInspector] = useState(false);
  const [activeMode, setActiveMode] = useState<'customer' | 'inspector'>('customer');
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const authModule = getFirebaseAuth();

  const syncSession = useCallback(async (user: any) => {
    const revision = ++generation.current;
    if (!user) {
      setProfile(null);
      setIsInspector(false);
      setActiveMode('customer');
      setState('signed-out');
      setSyncing(false);
      return;
    }
    setError(null);
    setMfaChallenge(null);
    setSyncing(true);
    const current = () => mounted.current && revision === generation.current && authModule?.getAuth().currentUser?.uid === user.uid;
    try {
      const result = await api<Profile>('/auth/sync', { method: 'POST' });
      if (current()) {
        setProfile(result);
        setState('signed-in');

        // Check whether this authenticated user has Inspector privileges
        let inspectorEligible = Boolean(
          result?.employee?.active &&
          (result.employee.role === 'INSPECTOR' || result.employee.role === 'ADMIN' || result.employee.role === 'SUPER_ADMIN')
        );

        if (!inspectorEligible) {
          try {
            const actor = await api<{ roles?: string[]; role?: string }>('/api/v2/inspector/me');
            if (actor?.roles?.includes('INSPECTOR') || actor?.role === 'INSPECTOR') {
              inspectorEligible = true;
            }
          } catch {
            inspectorEligible = false;
          }
        }

        if (current()) {
          setIsInspector(inspectorEligible);
          if (inspectorEligible) {
            setActiveMode('inspector');
            void registerForPushNotificationsAsync('INSPECTOR');
          } else {
            void registerForPushNotificationsAsync('CUSTOMER');
          }
        }
      }
    } catch (syncError: any) {
      console.error('[AUTH_SYNC_ERROR]', syncError?.code || syncError?.message || syncError);
      if (current()) {
        setProfile(null);
        setIsInspector(false);
        setActiveMode('customer');
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
    setIsInspector(false);
    setActiveMode('customer');
    setMfaChallenge(null);
    setState('signed-out');
    setError(null);
    try {
      await withDeadline(authModule.signOut(authModule.getAuth()), 8_000, 'SESSION_TIMEOUT');
    } catch (signOutError) {
      setError(friendlyError(signOutError));
    } finally { setBusy(false); }
  }, [authModule]);

  return {
    state,
    profile,
    isInspector,
    activeMode,
    setActiveMode,
    busy: busy || syncing,
    setBusy,
    error,
    setError,
    mfaChallenge,
    setMfaChallenge,
    signOut,
    refreshProfile,
    retrySession,
  };
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
    session.setMfaChallenge(null);
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
    } catch (signInError: any) {
      console.error('[GOOGLE_SIGN_IN_ERROR]', signInError?.code || signInError?.message || signInError);

      const isMfa =
        signInError?.code === 'auth/multi-factor-auth-required' ||
        String(signInError?.message).includes('multi-factor-auth-required');

      if (isMfa) {
        const resolver = extractResolver(authModule, signInError);
        if (resolver && Array.isArray(resolver.hints) && resolver.hints.length > 0) {
          const hints: MfaFactorHint[] = resolver.hints.map((h: any) => ({
            uid: String(h.uid || ''),
            factorId: String(h.factorId || 'phone'),
            displayName: h.displayName ? String(h.displayName) : undefined,
            phoneNumber: h.phoneNumber ? String(h.phoneNumber) : undefined,
          }));
          const phoneHint = hints.find(h => h.factorId === 'phone');
          const targetHint = phoneHint || hints[0];

          let verificationId: string | null = null;
          let codeSent = false;
          if (targetHint?.factorId === 'phone') {
            try {
              const auth = authModule.getAuth();
              verificationId = await withDeadline(
                auth.verifyPhoneNumberWithMultiFactorInfo(targetHint, resolver.session),
                30_000,
                'REQUEST_TIMEOUT'
              );
              codeSent = true;
            } catch (sendErr: any) {
              console.warn('[MFA_AUTO_SEND_SMS_FAILED]', sendErr?.code || sendErr?.message || sendErr);
            }
          } else {
            codeSent = true;
          }

          session.setMfaChallenge({
            resolver,
            hints,
            selectedHint: targetHint || null,
            verificationId: verificationId ? String(verificationId) : null,
            codeSent,
          });
          session.setError(null);
          return;
        }
      }

      session.setError(friendlyError(signInError));
    } finally { session.setBusy(false); }
  }, [session, authModule, googleSigninModule]);

  const sendMfaCode = useCallback(async (hintUid?: string) => {
    if (!session.mfaChallenge || !authModule) return;
    session.setError(null);
    session.setBusy(true);
    try {
      const challenge = session.mfaChallenge;
      const hint = hintUid
        ? challenge.hints.find(h => h.uid === hintUid) || challenge.selectedHint
        : challenge.selectedHint;
      if (!hint || hint.factorId !== 'phone') {
        session.setBusy(false);
        return;
      }
      const auth = authModule.getAuth();
      const vid = await withDeadline(
        auth.verifyPhoneNumberWithMultiFactorInfo(hint, challenge.resolver.session),
        30_000,
        'REQUEST_TIMEOUT'
      );
      session.setMfaChallenge(prev => prev ? {
        ...prev,
        selectedHint: hint,
        verificationId: vid ? String(vid) : null,
        codeSent: true,
      } : null);
    } catch (err: any) {
      console.error('[MFA_SEND_CODE_ERROR]', err?.code || err?.message || err);
      session.setError(friendlyError(err));
    } finally {
      session.setBusy(false);
    }
  }, [session, authModule]);

  const confirmMfaCode = useCallback(async (code: string) => {
    if (!session.mfaChallenge || !authModule) return;
    const trimmed = code.trim().replace(/\s+/g, '');
    if (!trimmed || trimmed.length < 6) {
      session.setError('Please enter a valid 6-digit verification code.');
      return;
    }
    session.setError(null);
    session.setBusy(true);
    try {
      const challenge = session.mfaChallenge;
      const hint = challenge.selectedHint;
      let assertion: any;
      if (hint?.factorId === 'totp') {
        if (typeof authModule.TotpMultiFactorGenerator?.assertionForSignIn === 'function') {
          assertion = authModule.TotpMultiFactorGenerator.assertionForSignIn(hint.uid, trimmed);
        } else {
          assertion = { uid: hint.uid, verificationCode: trimmed, factorId: 'totp' };
        }
      } else {
        if (!challenge.verificationId) {
          throw new Error('auth/missing-verification-id');
        }
        if (authModule.PhoneAuthProvider?.credential && authModule.PhoneMultiFactorGenerator?.assertion) {
          const credential = authModule.PhoneAuthProvider.credential(challenge.verificationId, trimmed);
          assertion = authModule.PhoneMultiFactorGenerator.assertion(credential);
        } else {
          assertion = { token: challenge.verificationId, secret: trimmed, factorId: 'phone' };
        }
      }

      await withDeadline(challenge.resolver.resolveSignIn(assertion), 25_000, 'SESSION_TIMEOUT');
      session.setMfaChallenge(null);
    } catch (err: any) {
      console.error('[MFA_CONFIRM_ERROR]', err?.code || err?.message || err);
      session.setError(friendlyError(err));
    } finally {
      session.setBusy(false);
    }
  }, [session, authModule]);

  const cancelMfa = useCallback(() => {
    session.setMfaChallenge(null);
    session.setError(null);
    session.setBusy(false);
  }, [session]);

  const signOut = useCallback(async () => {
    session.setBusy(true);
    try {
      if (googleSigninModule?.GoogleSignin) {
        try {
          await googleSigninModule.GoogleSignin.signOut();
        } catch (err) {
          console.warn('[GOOGLE_SIGNOUT_WARN]', err);
        }
      }
      await session.signOut();
    } finally {
      session.setBusy(false);
    }
  }, [session, googleSigninModule]);

  const clearSessionData = useCallback(async () => {
    session.setBusy(true);
    try {
      if (googleSigninModule?.GoogleSignin) {
        try {
          await googleSigninModule.GoogleSignin.signOut();
        } catch (err) {
          console.warn('[GOOGLE_SIGNOUT_WARN]', err);
        }
        try {
          await googleSigninModule.GoogleSignin.revokeAccess();
        } catch (err) {
          console.warn('[GOOGLE_REVOKE_WARN]', err);
        }
      }
      try {
        await AsyncStorage.clear();
      } catch (err) {
        console.warn('[ASYNC_STORAGE_CLEAR_WARN]', err);
      }
      await session.signOut();
    } finally {
      session.setBusy(false);
    }
  }, [session, googleSigninModule]);

  const value = useMemo<AuthContextValue>(() => ({
    state: session.state,
    profile: session.profile,
    user: session.profile,
    configured: true,
    busy: session.busy,
    error: session.error,
    isInspector: session.isInspector,
    activeMode: session.activeMode,
    setActiveMode: session.setActiveMode,
    signIn,
    signOut,
    clearSessionData,
    refreshProfile: session.refreshProfile,
    mfaChallenge: session.mfaChallenge,
    confirmMfaCode,
    sendMfaCode,
    cancelMfa,
  }), [
    session.state,
    session.profile,
    session.busy,
    session.error,
    session.isInspector,
    session.activeMode,
    session.setActiveMode,
    signIn,
    signOut,
    clearSessionData,
    session.refreshProfile,
    session.mfaChallenge,
    confirmMfaCode,
    sendMfaCode,
    cancelMfa,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function ExpoGoProvider({ children }: React.PropsWithChildren) {
  const [error, setError] = useState<string | null>('Google sign-in opens in the installed V MOTIV development app. Expo Go cannot load native Google authentication.');
  const signIn = useCallback(async () => {
    try { await Linking.openURL('vmotiv://account'); }
    catch { setError('Install the V MOTIV development app first: run npm run mobile:android from the project folder, then reopen it for Google sign-in.'); }
  }, []);
  const clearSessionData = useCallback(async () => {
    try {
      await AsyncStorage.clear();
    } catch (err) {
      console.warn('[ASYNC_STORAGE_CLEAR_WARN]', err);
    }
  }, []);
  const value = useMemo<AuthContextValue>(() => ({
    state: 'signed-out', profile: null, user: null, configured: true, busy: false,
    error, isInspector: false, activeMode: 'customer', setActiveMode: () => undefined, signIn, signOut: async () => undefined, clearSessionData, refreshProfile: async () => undefined,
    mfaChallenge: null, confirmMfaCode: async () => undefined, sendMfaCode: async () => undefined, cancelMfa: () => undefined,
  }), [error, signIn, clearSessionData]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function UnconfiguredProvider({ children }: React.PropsWithChildren) {
  return <AuthContext.Provider value={{
    state: 'signed-out', profile: null, user: null, configured: false, busy: false,
    error: 'Google OAuth credentials are missing from this build.', isInspector: false, activeMode: 'customer',
    setActiveMode: () => undefined, signIn: async () => undefined, signOut: async () => undefined, clearSessionData: async () => undefined, refreshProfile: async () => undefined,
    mfaChallenge: null, confirmMfaCode: async () => undefined, sendMfaCode: async () => undefined, cancelMfa: () => undefined,
  }}>{children}</AuthContext.Provider>;
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
