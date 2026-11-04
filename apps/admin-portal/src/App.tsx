import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  getMultiFactorResolver,
  getRedirectResult,
  multiFactor,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  type Auth,
  type MultiFactorResolver,
  type PhoneMultiFactorInfo,
  type User,
} from 'firebase/auth';
import { adminApi, ApiError } from './api.js';
import { useAutoRefresh } from './autoRefresh.js';
import { auth, firebaseConfigured } from './firebase.js';
import type {
  RentalKmPolicy,
  AdminActor,
  Approval,
  ApprovalPage,
  AuditPage,
  Branch,
  BusinessBuyingPage,
  BusinessFinance,
  BusinessInventoryPage,
  BusinessSellingPage,
  CommunicationsOutboxItem,
  CommunicationsOutboxPage,
  CommunicationsTemplate,
  Dashboard,
  EmployeePage,
  ExportJob,
  ExportJobPage,
  ManagedBranch,
  MasterDataItem,
  PolicyVersion,
  PrivacyRequest,
  PrivacyRequestPage,
  Role,
  ServiceArea,
  SupportCase,
  SupportCasePage,
  SystemHealth,
} from './types.js';

type Route = '/' | '/employees' | '/access' | '/branches' | '/approvals' | '/business' | '/support' | '/master-data' | '/communications' | '/reports' | '/audit' | '/accept-invitation' | '/not-found';
const iconPaths: Record<string, ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  employees: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  access: <><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
  branches: <><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/><path d="M9 10h.01M15 10h.01"/></>,
  approvals: <><path d="M12 3 4 7v5c0 5 3.4 8.74 8 10 4.6-1.26 8-5 8-10V7l-8-4Z"/><path d="m9 12 2 2 4-4"/></>,
  business: <><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></>,
  support: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 4.7-7.6A8.38 8.38 0 0 1 12.5 3h.5a8.48 8.48 0 0 1 8 8v.5Z"/></>,
  masterdata: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>,
  communications: <><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></>,
  reports: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
  audit: <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  close: <><path d="M18 6 6 18M6 6l12 12"/></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></>,
  refresh: <><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
};
function Icon({ name }: { name: keyof typeof iconPaths }) { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>; }

function currentRoute(): Route {
  const hasToken = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('token');
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/accept-invitation' || hasToken) return '/accept-invitation';
  return ['/', '/employees', '/access', '/branches', '/approvals', '/business', '/support', '/master-data', '/communications', '/reports', '/audit'].includes(path) ? path as Route : '/not-found';
}
function navigate(path: string) { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }
function errorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return 'The request could not be completed. Check the connection and try again.';
  const messages: Record<string, string> = {
    ADMIN_ACCESS_DENIED: 'This Google account is not an active V MOTIV administrator.',
    ADMIN_MFA_REQUIRED: 'A verified multi-factor session is required. Complete your organization’s Firebase MFA setup, then sign in again.',
    PERMISSION_DENIED: 'Your current permissions do not allow this action.',
    BRANCH_SCOPE_DENIED: 'This record is outside your assigned branch scope.',
    PRIVILEGED_ROLE_APPROVAL_REQUIRED: 'This privileged role requires authorized independent approval.',
    INVITATION_ALREADY_PENDING: 'An active invitation already exists for this work email.',
    EMPLOYEE_ALREADY_EXISTS: 'An employee account already exists for this work email.',
    INVITATION_IDENTITY_MISMATCH: 'Sign in with the exact Google work email that received this invitation.',
    INVITATION_EXPIRED: 'This invitation expired. Ask an administrator to issue a new invitation.',
    INVALID_OR_REVOKED_TOKEN: 'Your session expired or was revoked. Sign in again.',
    INVALID_INPUT: 'Review the highlighted information and try again.',
    SELF_APPROVAL_DENIED: 'Dual-control policy: you cannot approve a request you proposed yourself.',
    APPROVAL_NOT_PENDING: 'This request is no longer awaiting a decision.',
    APPROVAL_VERSION_MISMATCH: 'This request was updated by another administrator. Please refresh.',
    APPROVAL_EXPIRED: 'This approval request has expired.',
    PRIVACY_REQUEST_NOT_FOUND: 'This privacy request is no longer available. Refresh the queue and try again.',
  };
  return messages[error.code] || `The server rejected this request (${error.code}).`;
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [actor, setActor] = useState<AdminActor | null>(null);
  const [route, setRoute] = useState<Route>(currentRoute());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [enrollMfaOpen, setEnrollMfaOpen] = useState(false);
  const [sessionReload, setSessionReload] = useState(0);

  useEffect(() => { const handler = () => setRoute(currentRoute()); window.addEventListener('popstate', handler); return () => window.removeEventListener('popstate', handler); }, []);
  // Removed auto-refresh interval per user request
  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    // After a signInWithRedirect, Google returns us to the origin root.
    // We saved the pre-redirect URL in sessionStorage so we can restore it here.
    getRedirectResult(auth)
      .then(result => {
        if (result?.user) {
          const savedHref = sessionStorage.getItem('vmotiv_signin_redirect_back');
          if (savedHref) {
            sessionStorage.removeItem('vmotiv_signin_redirect_back');
            // Restore the URL (e.g. /accept-invitation?token=...) without a full reload
            window.history.replaceState({}, '', savedHref);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
        }
      })
      .catch(() => {/* no redirect pending – ignore */});
    return onAuthStateChanged(auth, next => { setUser(next); if (!next) { setActor(null); setLoading(false); } });
  }, []);
  useEffect(() => {
    if (!user) return;
    if (route === '/accept-invitation') { setLoading(false); return; }
    // If a stored invitation token exists for this user, redirect to acceptance page
    // (handles the case where signInWithRedirect returns the user to '/' not the invite URL)
    const storedToken = (() => { try { return sessionStorage.getItem('vmotiv_admin_invitation_token') || ''; } catch { return ''; } })();
    if (storedToken) {
      navigate(`/accept-invitation?token=${encodeURIComponent(storedToken)}`);
      setLoading(false);
      return;
    }
    // If actor is already verified and session is active, do not re-verify or reset loading on route changes
    if (actor && sessionReload === 0) {
      setLoading(false);
      return;
    }
    setLoading(true); setError('');
    adminApi.me(user)
      .then(setActor)
      .catch(error => {
        if (!actor) {
          setActor(null);
        }
        setError(errorMessage(error));
        if (auth && multiFactor(user).enrolledFactors.length === 0) {
          setEnrollMfaOpen(true);
        }
      })
      .finally(() => setLoading(false));
  }, [user, route, sessionReload]);

  async function googleSignIn() {
    if (!auth) return;
    setError(''); setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error?.code === 'auth/multi-factor-auth-required') {
        const resolver = getMultiFactorResolver(auth, error);
        setMfaResolver(resolver);
        setLoading(false);
        return;
      }
      // COOP blocks popup – fall back to redirect sign-in which persists across page load
      if (
        error?.code === 'auth/popup-blocked' ||
        error?.code === 'auth/popup-closed-by-user' ||
        error?.code === 'auth/cancelled-popup-request' ||
        error?.message?.includes('Cross-Origin-Opener-Policy')
      ) {
        try {
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: 'select_account' });
          // Save current URL so we can restore it after the redirect lands on '/'
          try { sessionStorage.setItem('vmotiv_signin_redirect_back', window.location.pathname + window.location.search); } catch {}
          await signInWithRedirect(auth, provider);
          return; // page will redirect; finally block runs but is harmless
        } catch (redirectError: any) {
          setError(redirectError instanceof Error ? redirectError.message : 'Sign-In failed. Please try again.');
        }
      } else {
        setError(error instanceof Error ? error.message : 'Google Sign-In failed.');
      }
      setLoading(false);
    } finally {
      setLoading(false);
    }
  }
  async function logout() {
    if (auth) await signOut(auth);
    setMfaResolver(null);
    setEnrollMfaOpen(false);
    setActor(null);
    const hasToken = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('token');
    if (route !== '/accept-invitation' && !hasToken) {
      navigate('/');
    }
  }

  if (!firebaseConfigured) return <SetupState />;
  if (loading) return <FullLoader />;
  if (route === '/accept-invitation') return <InvitationAcceptance user={user} onSignIn={googleSignIn} onSignOut={logout} />;
  if (!user || !actor) {
    return (
      <>
        <SignInState
          user={user}
          error={error}
          onSignIn={googleSignIn}
          onSignOut={logout}
          onStartEnroll={() => setEnrollMfaOpen(true)}
        />
        {mfaResolver && auth && (
          <MfaChallengeDialog
            auth={auth}
            resolver={mfaResolver}
            onClose={() => setMfaResolver(null)}
            onSuccess={() => {
              setMfaResolver(null);
              setSessionReload(v => v + 1);
            }}
          />
        )}
        {enrollMfaOpen && user && auth && (
          <MfaEnrollDialog
            auth={auth}
            user={user}
            onClose={() => setEnrollMfaOpen(false)}
            onSuccess={() => {
              setEnrollMfaOpen(false);
              setSessionReload(v => v + 1);
            }}
          />
        )}
        <div id="recaptcha-container" />
      </>
    );
  }
  return <Shell actor={actor} route={route} user={user} onLogout={logout} />;
}

function FullLoader() { return <main className="center-state" aria-busy="true"><img className="state-logo" src="/brand/vmotiv-logo.svg" alt="V MOTIV"/><div className="spinner"/><p>Verifying identity and access…</p></main>; }
function SetupState() { return <main className="center-state"><img className="state-logo" src="/brand/vmotiv-logo.svg" alt="V MOTIV"/><p className="eyebrow">Admin Control Centre</p><h1>Firebase configuration required</h1><p>Add the four <code>VITE_FIREBASE_*</code> values from <code>.env.example</code>. No administrator access is granted until the backend also verifies the employee record, permission and MFA state.</p></main>; }

function SignInState({
  user,
  error,
  onSignIn,
  onSignOut,
  onStartEnroll,
}: {
  user: User | null;
  error: string;
  onSignIn: () => void;
  onSignOut: () => void;
  onStartEnroll: () => void;
}) {
  const isMfaIssue = error.includes('multi-factor') || error.includes('Firebase MFA') || error.includes('ADMIN_MFA_REQUIRED');
  const storedToken = (() => {
    try { return sessionStorage.getItem('vmotiv_admin_invitation_token') || ''; } catch { return ''; }
  })();

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <img className="auth-logo" src="/brand/vmotiv-logo.svg" alt="V MOTIV"/>
        <p className="eyebrow">Admin Control Centre</p>
        <h1>Govern the business with accountable access.</h1>
        <p>Employee identity, branch scope, permissions and multi-factor status are verified by the V MOTIV backend on every protected request.</p>
        <div className="auth-actions">
          {!user ? (
            <button className="button primary" onClick={onSignIn}>Continue with Google</button>
          ) : isMfaIssue ? (
            <button className="button primary" onClick={onStartEnroll}>Set up Phone 2FA</button>
          ) : (
            <button className="button primary" onClick={onSignIn}>Continue with Google</button>
          )}
          {user && <button className="button secondary" onClick={onSignOut}>Use another account</button>}
        </div>
        {error && (
          <div className="alert error" role="alert">
            <strong>Access not granted</strong>
            <span>{error}</span>
          </div>
        )}
        {user && storedToken && (
          <div style={{ marginTop: '1rem', padding: '0.875rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px' }}>
            <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600, color: '#065f46', fontSize: '0.875rem' }}>
              Pending employee invitation detected
            </p>
            <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.8125rem', color: '#047857' }}>
              An invitation token was saved on this device. Click below to activate access for {user.email}:
            </p>
            <button
              type="button"
              className="button primary"
              onClick={() => navigate(`/accept-invitation?token=${encodeURIComponent(storedToken)}`)}
            >
              Accept Invitation
            </button>
          </div>
        )}
        {user && (
          <div style={{ marginTop: '1rem', padding: '0.875rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
            <p style={{ margin: '0 0 0.375rem 0', fontWeight: 600, color: '#334155', fontSize: '0.875rem' }}>
              Invited as a staff member?
            </p>
            <p style={{ margin: '0 0 0.625rem 0', fontSize: '0.8125rem', color: '#64748b' }}>
              Paste your onboarding link or token to activate your account:
            </p>
            <form
              onSubmit={e => {
                e.preventDefault();
                const form = e.currentTarget;
                const val = (form.elements.namedItem('inviteInput') as HTMLInputElement)?.value.trim();
                if (!val) return;
                const extracted = val.includes('token=') ? new URL(val, window.location.origin).searchParams.get('token') : val;
                if (extracted) {
                  try { sessionStorage.setItem('vmotiv_admin_invitation_token', extracted); } catch {}
                  navigate(`/accept-invitation?token=${encodeURIComponent(extracted)}`);
                }
              }}
              style={{ display: 'flex', gap: '0.5rem' }}
            >
              <input
                name="inviteInput"
                type="text"
                placeholder="Paste token or invitation URL"
                style={{ flex: 1, padding: '0.45rem 0.625rem', fontSize: '0.8125rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              />
              <button type="submit" className="button secondary" style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                Redeem
              </button>
            </form>
          </div>
        )}
        <p className="security-note">Google Sign-In alone never creates Admin access.</p>
      </section>
      <aside className="auth-aside" aria-label="Security controls">
        <div><span className="kicker">Identity</span><strong>Verified Google employee account</strong></div>
        <div><span className="kicker">Authorization</span><strong>Server-controlled roles and branch scope</strong></div>
        <div><span className="kicker">Assurance</span><strong>MFA required for this portal</strong></div>
        <div><span className="kicker">Accountability</span><strong>Privileged actions are audited</strong></div>
      </aside>
    </main>
  );
}

function MfaChallengeDialog({
  auth,
  resolver,
  onClose,
  onSuccess,
}: {
  auth: Auth;
  resolver: MultiFactorResolver;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const [verificationId, setVerificationId] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const phoneHint = resolver.hints.find(
    hint => hint.factorId === PhoneMultiFactorGenerator.FACTOR_ID
  ) as PhoneMultiFactorInfo | undefined;

  useEffect(() => {
    ref.current?.showModal();
    return () => {
      try {
        recaptchaVerifierRef.current?.clear();
      } catch {
        // ignore
      }
    };
  }, []);

  async function sendOtp() {
    if (!phoneHint) {
      setError('No registered phone number found on this account.');
      return;
    }
    setSending(true);
    setError('');
    try {
      if (recaptchaVerifierRef.current) {
        try { recaptchaVerifierRef.current.clear(); } catch { /* ignore */ }
        recaptchaVerifierRef.current = null;
      }
      recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
      });
      const phoneProvider = new PhoneAuthProvider(auth);
      const vId = await phoneProvider.verifyPhoneNumber(
        { multiFactorHint: phoneHint, session: resolver.session },
        recaptchaVerifierRef.current
      );
      setVerificationId(vId);
    } catch (err: any) {
      setError(err?.message || 'Failed to send SMS code. Please try again.');
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    void sendOtp();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verificationId || code.trim().length !== 6) return;
    setVerifying(true);
    setError('');
    try {
      const cred = PhoneAuthProvider.credential(verificationId, code.trim());
      const assertion = PhoneMultiFactorGenerator.assertion(cred);
      await resolver.resolveSignIn(assertion);
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired verification code.');
      setVerifying(false);
    }
  }

  const phoneDisplay = phoneHint?.phoneNumber || 'your registered mobile number';

  return (
    <dialog ref={ref} onCancel={onClose} className="dialog compact">
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">2-Step Verification</p>
            <h2>Phone Verification</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        {error && <div className="alert error" role="alert">{error}</div>}
        <p className="helper" style={{ margin: '1rem 0' }}>
          {sending
            ? `Sending 6-digit verification code to ${phoneDisplay}…`
            : `We sent a 6-digit code via SMS to ${phoneDisplay}. Enter the code below to complete sign-in.`}
        </p>
        <label>
          6-digit verification code <span aria-hidden="true">*</span>
          <input
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            required
            autoFocus
          />
        </label>
        <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="text-button"
            disabled={sending}
            onClick={sendOtp}
          >
            {sending ? 'Resending…' : 'Resend code via SMS'}
          </button>
        </div>
        <footer>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={verifying || sending || code.length !== 6}
          >
            {verifying ? 'Verifying…' : 'Verify & Sign In'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function MfaEnrollDialog({
  auth,
  user,
  onClose,
  onSuccess,
}: {
  auth: Auth;
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('+91');
  const [code, setCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    ref.current?.showModal();
    return () => {
      try {
        recaptchaVerifierRef.current?.clear();
      } catch {
        // ignore
      }
    };
  }, []);

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanPhone = phone.trim();
    if (!/^\+[1-9]\d{6,14}$/.test(cleanPhone)) {
      setError('Enter a valid phone number with country code (e.g. +91 9876543210).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (recaptchaVerifierRef.current) {
        try { recaptchaVerifierRef.current.clear(); } catch { /* ignore */ }
        recaptchaVerifierRef.current = null;
      }
      recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
      });
      const multiFactorUser = multiFactor(user);
      const session = await multiFactorUser.getSession();
      const phoneProvider = new PhoneAuthProvider(auth);
      const vId = await phoneProvider.verifyPhoneNumber(
        { phoneNumber: cleanPhone, session },
        recaptchaVerifierRef.current
      );
      setVerificationId(vId);
      setStep('otp');
    } catch (err: any) {
      setError(err?.message || 'Failed to send SMS code. Check the phone number and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verificationId || code.length !== 6) return;
    setBusy(true);
    setError('');
    try {
      const cred = PhoneAuthProvider.credential(verificationId, code.trim());
      const assertion = PhoneMultiFactorGenerator.assertion(cred);
      await multiFactor(user).enroll(assertion, 'Primary Mobile');
      await user.getIdToken(true);
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired verification code.');
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onCancel={onClose} className="dialog compact">
      {step === 'phone' ? (
        <form onSubmit={handleSendCode}>
          <header>
            <div>
              <p className="eyebrow">Multi-Factor Authentication</p>
              <h2>Set Up Phone 2FA</h2>
            </div>
            <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
              <Icon name="close" />
            </button>
          </header>
          {error && <div className="alert error" role="alert">{error}</div>}
          <p className="helper" style={{ margin: '1rem 0' }}>
            As a V MOTIV Super Administrator, your account requires 2-Step Verification. Enter your mobile phone number to receive a one-time verification code via SMS.
          </p>
          <label>
            Mobile phone number (with country code) <span aria-hidden="true">*</span>
            <input
              name="phone"
              type="tel"
              placeholder="+919876543210"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
              autoFocus
            />
          </label>
          <footer>
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="button primary" disabled={busy || phone.length < 10}>
              {busy ? 'Sending SMS…' : 'Send verification code'}
            </button>
          </footer>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp}>
          <header>
            <div>
              <p className="eyebrow">Multi-Factor Authentication</p>
              <h2>Enter SMS Code</h2>
            </div>
            <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
              <Icon name="close" />
            </button>
          </header>
          {error && <div className="alert error" role="alert">{error}</div>}
          <p className="helper" style={{ margin: '1rem 0' }}>
            We sent a 6-digit verification code to <strong>{phone}</strong>. Enter it below to complete 2FA registration.
          </p>
          <label>
            6-digit verification code <span aria-hidden="true">*</span>
            <input
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              required
              autoFocus
            />
          </label>
          <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setStep('phone');
                setCode('');
                setError('');
              }}
            >
              Change phone number
            </button>
          </div>
          <footer>
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="button primary" disabled={busy || code.length !== 6}>
              {busy ? 'Enrolling…' : 'Verify & Complete Enrollment'}
            </button>
          </footer>
        </form>
      )}
    </dialog>
  );
}

function InvitationAcceptance({ user, onSignIn, onSignOut }: { user: User | null; onSignIn: () => void; onSignOut: () => void }) {
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle');
  const [error, setError] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [destination, setDestination] = useState<{ url: string; label: string } | null>(null);

  const queryToken = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') || '' : '';
  const storedToken = (() => {
    try { return sessionStorage.getItem('vmotiv_admin_invitation_token') || ''; } catch { return ''; }
  })();
  const token = queryToken || storedToken || manualToken;

  useEffect(() => {
    if (queryToken) {
      try { sessionStorage.setItem('vmotiv_admin_invitation_token', queryToken); } catch {}
    }
    // Always save the current URL before any redirect sign-in so Google can return us here
    try {
      sessionStorage.setItem('vmotiv_signin_redirect_back', window.location.pathname + window.location.search);
    } catch {}
  }, [queryToken]);

  function handleSignIn() {
    // Persist the current URL before triggering sign-in (covers redirect fallback)
    try {
      sessionStorage.setItem('vmotiv_signin_redirect_back', window.location.pathname + window.location.search);
    } catch {}
    onSignIn();
  }

  async function accept() {
    if (!user || !token) return;
    setState('working');
    setError('');
    try {
      const activated = await adminApi.acceptInvitation(user, token);
      try { sessionStorage.removeItem('vmotiv_admin_invitation_token'); } catch {}
      setDestination({ url: activated.portalUrl || '/', label: activated.portalLabel || 'Admin Control Centre' });
      setState('done');
    } catch (err) {
      setState('idle');
      setError(errorMessage(err));
    }
  }

  return (
    <main className="center-state">
      <img className="state-logo" src="/brand/vmotiv-logo.svg" alt="V MOTIV"/>
      <p className="eyebrow">Employee onboarding</p>
      <h1>{state === 'done' ? 'Invitation Accepted' : 'Accept Your V MOTIV Invitation'}</h1>
      {!token ? (
        <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
          <div className="alert error" role="alert" style={{ marginBottom: '1rem' }}>
            This invitation link is missing the token parameter.
          </div>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.75rem' }}>
            Paste the invitation link or token from your onboarding email:
          </p>
          <form
            onSubmit={e => {
              e.preventDefault();
              const val = manualToken.trim();
              const extracted = val.includes('token=') ? new URL(val, window.location.origin).searchParams.get('token') : val;
              if (extracted) {
                try { sessionStorage.setItem('vmotiv_admin_invitation_token', extracted); } catch {}
                setManualToken(extracted);
              }
            }}
            style={{ display: 'flex', gap: '0.5rem' }}
          >
            <input
              type="text"
              placeholder="Paste token or invitation link"
              value={manualToken}
              onChange={e => setManualToken(e.target.value)}
              style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
            />
            <button type="submit" className="button secondary">Continue</button>
          </form>
        </div>
      ) : state === 'done' ? (
        <>
          <p>Your approved role and branch scope are now active. You can now open your assigned workspace.</p>
          <button className="button primary" onClick={() => { window.location.assign(destination?.url || '/'); }}>
            Open {destination?.label || 'workspace'}
          </button>
        </>
      ) : (
        <>
          <p>
            {user
              ? `Currently signed in as ${user.email}. This must match the Google work email that received the invitation.`
              : 'Sign in with the exact Google work email that received this invitation.'}
          </p>
          <div className="auth-actions">
            <button
              className="button primary"
              disabled={state === 'working'}
              onClick={user ? accept : handleSignIn}
            >
              {state === 'working' ? 'Activating…' : user ? 'Accept Invitation' : 'Continue with Google'}
            </button>
            {user && (
              <button
                type="button"
                className="button secondary"
                disabled={state === 'working'}
                onClick={onSignOut}
              >
                Switch Google Account
              </button>
            )}
          </div>
          {error && <div className="alert error" role="alert">{error}</div>}
        </>
      )}
    </main>
  );
}

const navItems = [
  { path: '/' as Route, label: 'Overview', icon: 'overview' as const, permission: 'admin.portal.access' },
  { path: '/employees' as Route, label: 'Employees', icon: 'employees' as const, permission: 'employee.read' },
  { path: '/access' as Route, label: 'Access Control', icon: 'access' as const, permission: 'role.read' },
  { path: '/approvals' as Route, label: 'Approval Centre', icon: 'approvals' as const, permission: 'approval.read' },
  { path: '/business' as Route, label: 'Business Oversight', icon: 'business' as const, permission: 'business.oversight.read' },
  { path: '/support' as Route, label: 'Support & Privacy', icon: 'support' as const, permission: 'support.read' },
  { path: '/master-data' as Route, label: 'Master Data', icon: 'masterdata' as const, permission: 'masterdata.read' },
  { path: '/communications' as Route, label: 'Communications', icon: 'communications' as const, permission: 'email.delivery.read' },
  { path: '/reports' as Route, label: 'Audit & Reports', icon: 'reports' as const, permission: 'audit.read' },
  { path: '/branches' as Route, label: 'Settings & Branches', icon: 'branches' as const, permission: 'branch.read' },
];
function NotificationBell({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<any[]>([]);
  const [notificationError, setNotificationError] = useState('');

  const loadNotifs = useCallback(() => {
    adminApi.unreadNotificationsCount(user)
      .then(res => setUnreadCount(res.count))
      .catch(error => setNotificationError(errorMessage(error)));
    if (open) {
      adminApi.notifications(user, 1)
        .then(res => { setItems(res.items); setNotificationError(''); })
        .catch(error => setNotificationError(errorMessage(error)));
    }
  }, [user, open]);

  useEffect(() => {
    loadNotifs();
  }, [loadNotifs]);
  // Poll for new notifications only while the tab is visible (and back off if the API is failing).
  useAutoRefresh(() => Promise.resolve(loadNotifs()), { intervalMs: 20_000, pauseWhen: () => false });

  const markAllRead = async () => {
    try {
      await adminApi.markAllNotificationsRead(user);
      setItems(prev => prev.map(i => ({ ...i, read: true })));
      setUnreadCount(0);
    } catch (error) {
      setNotificationError(errorMessage(error));
    }
  };

  const markRead = async (id: string) => {
    try {
      await adminApi.markNotificationRead(user, id);
      setItems(prev => prev.map(i => i.id === id ? { ...i, read: true } : i));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      setNotificationError(errorMessage(error));
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="icon-button"
        style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px' }}
        onClick={() => { setOpen(!open); }}
        title="Notifications"
      >
        <Icon name="bell" />
        {unreadCount > 0 && (
          <span style={{ position: 'absolute', top: '-2px', right: '-2px', background: 'var(--red, #EF4444)', color: '#fff', borderRadius: '10px', fontSize: '10px', fontWeight: 800, padding: '1px 5px' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, top: '36px', width: '320px', maxHeight: '420px', overflowY: 'auto', background: 'var(--navy, #061A38)', border: '1px solid var(--border, #1A3B6B)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 1000, padding: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid var(--border, #1A3B6B)', paddingBottom: '6px' }}>
            <strong style={{ fontSize: '13px' }}>Notifications</strong>
            {unreadCount > 0 && (
              <button className="text-button" style={{ fontSize: '11px', color: 'var(--yellow, #F7B503)', cursor: 'pointer' }} onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          {notificationError && (
            <div className="alert error" role="alert" style={{ marginBottom: '8px', fontSize: '12px' }}>
              {notificationError} <button type="button" className="text-button" onClick={loadNotifs}>Retry</button>
            </div>
          )}
          {items.length === 0 ? (
            <p style={{ color: 'var(--muted, #8899A6)', fontSize: '12px', textAlign: 'center', padding: '16px 0' }}>No notifications</p>
          ) : (
            items.map(item => (
              <div
                key={item.id}
                style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', opacity: item.read ? 0.7 : 1, cursor: 'pointer' }}
                onClick={() => markRead(item.id)}
              >
                <div style={{ fontWeight: item.read ? 600 : 700, fontSize: '12px', color: item.read ? 'inherit' : 'var(--yellow, #F7B503)' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted, #8899A6)', marginTop: '2px' }}>
                  {item.body}
                </div>
                <small style={{ fontSize: '10px', color: 'var(--muted, #8899A6)', marginTop: '4px', display: 'block' }}>
                  {new Date(item.createdAt).toLocaleString()}
                </small>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Shell({ actor, user, route, onLogout }: { actor: AdminActor; user: User; route: Route; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const nav = navItems.filter(item => actor.permissions.includes(item.permission));
  const title = nav.find(item => item.path === route)?.label || 'Not found';
  function go(path: Route) { navigate(path); setOpen(false); }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to main content</a>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <img src="/brand/vmotiv-logo.svg" alt="V MOTIV"/>
          <span>Admin</span>
        </div>
        <nav aria-label="Primary navigation">
          {nav.map(item => (
            <button
              key={item.path}
              className={route === item.path ? 'active' : ''}
              aria-current={route === item.path ? 'page' : undefined}
              onClick={() => go(item.path)}
            >
              <Icon name={item.icon}/>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-account">
          <span>{actor.displayName || actor.email}</span>
          <small>{actor.employeeCode || 'Employee'}</small>
          <button onClick={onLogout}><Icon name="logout"/>Sign out</button>
        </div>
      </aside>
      {open && <button className="scrim" aria-label="Close navigation" onClick={() => setOpen(false)}/>}
      <div className="app-main">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} onClick={() => setOpen(!open)}>
            <Icon name={open ? 'close' : 'menu'}/>
          </button>
          <div>
            <span className="breadcrumb">V MOTIV Admin /</span>
            <strong>{title}</strong>
          </div>
          <div className="identity" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <NotificationBell user={user} />
            <span>{user.email}</span>
            <span className="mfa-badge">MFA verified</span>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {route === '/' && <><OverviewPage user={user}/>{actor.permissions.includes('system.health.read') && <SystemHealthPanel user={user}/>}</>}
          {route === '/employees' && <EmployeesPage user={user} actor={actor}/>}
          {route === '/access' && <AccessPage user={user}/>}
          {route === '/approvals' && <ApprovalsPage user={user} actor={actor}/>}
          {route === '/business' && <BusinessPage user={user} actor={actor}/>}
          {route === '/support' && <SupportPage user={user} actor={actor}/>}
          {route === '/master-data' && <MasterDataPage user={user} actor={actor}/>}
          {route === '/communications' && <CommunicationsPage user={user} actor={actor}/>}
          {route === '/reports' && <ReportsPage user={user} actor={actor}/>}
          {route === '/branches' && <><BranchesPage user={user} actor={actor}/>{actor.permissions.includes('branch.manage') && <RentalKmPolicyPanel user={user} actor={actor}/>}<PoliciesPanel user={user} actor={actor}/></>}
          {route === '/audit' && <AuditPageView user={user}/>}
          {route === '/not-found' && <NotFound/>}
        </main>
      </div>
    </div>
  );
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
function OverviewPage({ user }: { user: User }) {
  const [data, setData] = useState<Dashboard | null>(null); const [error, setError] = useState(''); const [refresh, setRefresh] = useState(0);
  useEffect(() => { setError(''); adminApi.dashboard(user).then(setData).catch(error => setError(errorMessage(error))); }, [user, refresh]);
  return <><PageHeader eyebrow="Live governance" title="Overview" description="Permission-filtered administrative state from the shared V2 backend." action={<button className="button secondary" onClick={() => setRefresh(value => value + 1)}><Icon name="refresh"/>Refresh</button>}/>{error ? <ErrorState message={error} retry={() => setRefresh(value => value + 1)}/> : !data ? <SkeletonCards/> : <><section className="metric-grid" aria-label="Employee summary">{Object.entries(data.employees).map(([key, value]) => <article className="metric-card" key={key}><span>{key.replace(/_/g, ' ')}</span><strong>{value.toLocaleString()}</strong><small>Current records</small></article>)}{typeof data.approvals === 'number' && <article className="metric-card"><span>pending approvals</span><strong>{data.approvals.toLocaleString()}</strong><small>Independent decisions needed</small></article>}{typeof data.supportCases === 'number' && <article className="metric-card"><span>open support cases</span><strong>{data.supportCases.toLocaleString()}</strong><small>Within authorized scope</small></article>}</section><section className="panel"><div className="panel-heading"><div><h2>Pending administrative tasks</h2><p>Items awaiting an authorized administrator.</p></div><span className="count-badge">{data.pendingAdministrativeTasks}</span></div>{data.pendingAdministrativeTasks ? <p>Employee invitations and independent approvals require review.</p> : <EmptyState title="No pending tasks" text="No administrative invitations or approvals are currently awaiting action."/>}</section><section className="panel"><div className="panel-heading"><div><h2>Your recent actions</h2><p>Read-only events attributed to your employee identity.</p></div><time>{new Date(data.generatedAt).toLocaleString()}</time></div>{data.recentOwnActions.length ? <ul className="event-list">{data.recentOwnActions.map(event => <li key={event.id}><div><strong>{humanize(event.action)}</strong><span>{event.entityType} · {event.entityId}</span></div><time>{new Date(event.createdAt).toLocaleString()}</time></li>)}</ul> : <EmptyState title="No recent actions" text="Your audited actions will appear here."/>}</section></> }</>;
}

function EmployeesPage({ user, actor }: { user: User; actor: AdminActor }) {
  const [data, setData] = useState<EmployeePage | null>(null); const [roles, setRoles] = useState<Role[]>([]); const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [error, setError] = useState(''); const [reload, setReload] = useState(0); const [inviteOpen, setInviteOpen] = useState(false); const [statusTarget, setStatusTarget] = useState<AdminActor | null>(null); const [editTarget, setEditTarget] = useState<AdminActor | null>(null);
  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), limit: '25' }); if (search.trim()) value.set('search', search.trim()); if (status) value.set('status', status); return value; }, [page, search, status]);
  useEffect(() => { Promise.all([adminApi.roles(user), adminApi.branches(user)]).then(([roles, branches]) => { setRoles(roles); setBranches(branches); }).catch(error => setError(errorMessage(error))); }, [user]);
  useEffect(() => { const timer = window.setTimeout(() => { setError(''); adminApi.employees(user, params).then(setData).catch(error => setError(errorMessage(error))); }, 250); return () => clearTimeout(timer); }, [user, params, reload]);
  return <><PageHeader eyebrow="People and access" title="Employees" description="Manage approved employee identities within your role and branch scope." action={actor.permissions.includes('employee.invite') && <button className="button primary" onClick={() => setInviteOpen(true)}>Invite employee</button>}/><section className="panel filters" aria-label="Employee filters"><label>Search<input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Name, email, ID or designation"/></label><label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option>ACTIVE</option><option>SUSPENDED</option><option>DEACTIVATED</option></select></label></section>{error ? <ErrorState message={error} retry={() => setReload(value => value + 1)}/> : !data ? <TableSkeleton/> : <section className="panel table-panel"><div className="panel-heading"><div><h2>Employee directory</h2><p>{data.total.toLocaleString()} authorized record{data.total === 1 ? '' : 's'}</p></div></div>{data.items.length ? <div className="table-scroll"><table><thead><tr><th>Employee</th><th>Role</th><th>Branch</th><th>Status</th><th>MFA</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{data.items.map(employee => <tr key={employee.userId}><td><strong>{employee.displayName || 'Unnamed employee'}</strong><span>{employee.email}</span><small>{employee.employeeCode || 'ID pending'}</small></td><td>{employee.roles.map(role => humanize(role)).join(', ') || 'No role'}</td><td>{employee.branches.map(branch => branch.code).join(', ') || 'No branch'}</td><td><StatusBadge value={employee.status}/></td><td><StatusBadge value={employee.mfaStatus}/></td><td>{employee.userId !== actor.userId && actor.permissions.includes('employee.update') && <button className="text-button" onClick={() => setEditTarget(employee)}>Edit access</button>}{employee.userId !== actor.userId && actor.permissions.includes('employee.suspend') && <button className="text-button" onClick={() => setStatusTarget(employee)}>Suspend / reactivate</button>}</td></tr>)}</tbody></table></div> : <EmptyState title="No employees found" text="Adjust the filters or invite an employee into an approved role and branch."/>}<Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage}/></section>}{inviteOpen && <InviteDialog user={user} roles={roles} branches={branches} onClose={() => setInviteOpen(false)} onDone={() => { setInviteOpen(false); setReload(value => value + 1); }}/>} {statusTarget && <StatusDialog user={user} employee={statusTarget} onClose={() => setStatusTarget(null)} onDone={() => { setStatusTarget(null); setReload(value => value + 1); }}/>}{editTarget && <EditAccessDialog user={user} employee={editTarget} roles={roles} branches={branches} onClose={() => setEditTarget(null)} onDone={() => { setEditTarget(null); setReload(value => value + 1); }}/>}</>;
}

function InviteDialog({ user, roles, branches, onClose, onDone }: { user: User; roles: Role[]; branches: Branch[]; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [roleId, setRoleId] = useState(''); const [branchIds, setBranchIds] = useState<string[]>([]);
  useEffect(() => { ref.current?.showModal(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(''); try { const input = { email: String(form.get('email')), fullName: String(form.get('fullName')), designation: String(form.get('designation')) || undefined, roleId, branchIds, expiresInHours: Number(form.get('expiresInHours')) }; if (role?.privileged) await adminApi.proposePrivilegedInvitation(user, { ...input, reason: String(form.get('approvalReason')) }); else await adminApi.invite(user, input); onDone(); } catch (error) { setError(errorMessage(error)); setBusy(false); } }
  const role = roles.find(item => item.id === roleId);
  return <dialog ref={ref} onCancel={onClose} className="dialog"><form onSubmit={submit}><header><div><p className="eyebrow">Employee onboarding</p><h2>Invite employee</h2></div><button type="button" className="icon-button" aria-label="Close invitation form" onClick={onClose}><Icon name="close"/></button></header>{error && <div className="alert error" role="alert">{error}</div>}<div className="form-grid"><label>Full name <span aria-hidden="true">*</span><input name="fullName" required minLength={2} maxLength={120}/></label><label>Work email <span aria-hidden="true">*</span><input name="email" type="email" autoComplete="email" required/></label><label className="full">Designation<input name="designation" maxLength={120}/></label><label>Approved role <span aria-hidden="true">*</span><select required value={roleId} onChange={event => setRoleId(event.target.value)}><option value="">Select role</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}{role.privileged ? ' · independent approval' : ''}</option>)}</select></label><label>Expires in<select name="expiresInHours" defaultValue="48"><option value="24">24 hours</option><option value="48">48 hours</option><option value="72">72 hours</option><option value="168">7 days</option></select></label><fieldset className="full"><legend>Assigned branches <span aria-hidden="true">*</span></legend><div className="check-grid">{branches.map(branch => <label key={branch.id}><input type="checkbox" checked={branchIds.includes(branch.id)} onChange={event => setBranchIds(current => event.target.checked ? [...current, branch.id] : current.filter(id => id !== branch.id))}/><span><strong>{branch.name}</strong><small>{branch.code} · {branch.city}</small></span></label>)}</div></fieldset>{role?.privileged && <label className="full">Why is this privileged role required? <span aria-hidden="true">*</span><textarea name="approvalReason" minLength={8} maxLength={500} required placeholder="This request goes to an independent eligible approver. You cannot approve it yourself."/></label>}{role && <div className="permission-preview full"><strong>Effective permission preview</strong>{role.permissions.length ? <ul>{role.permissions.map(({ permission }) => <li key={permission.key}><code>{permission.key}</code><span>{permission.description}</span></li>)}</ul> : <p>This role has no Admin Control Centre permissions. It only enables its responsible portal workflow.</p>}</div>}</div><footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || !roleId || !branchIds.length}>{busy ? (role?.privileged ? 'Submitting request…' : 'Creating invitation…') : role?.privileged ? 'Request independent approval' : 'Send invitation'}</button></footer></form></dialog>;
}

function EditAccessDialog({ user, employee, roles, branches, onClose, onDone }: { user: User; employee: AdminActor; roles: Role[]; branches: Branch[]; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const currentRoleIds = roles.filter(role => employee.roles.includes(role.key)).map(role => role.id);
  const [roleIds, setRoleIds] = useState<string[]>(currentRoleIds);
  const [branchIds, setBranchIds] = useState<string[]>(employee.branches.map(branch => branch.id));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  // Privileged roles are changed only through the independent approval workflow.
  const locked = roles.some(role => role.privileged && employee.roles.includes(role.key));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (roleIds.length === 0) { setError('Select at least one role.'); return; }
    if (branchIds.length === 0) { setError('Select at least one branch.'); return; }
    setBusy(true);
    setError('');
    try {
      await adminApi.updateEmployeeAccess(user, employee.userId, {
        ...(roleIds.length !== currentRoleIds.length || roleIds.some(id => !currentRoleIds.includes(id)) ? { roleIds } : {}),
        branchIds,
        designation: String(form.get('designation') ?? '').trim() || null,
        reason: String(form.get('reason')),
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return <dialog ref={ref} onCancel={onClose} className="dialog"><form onSubmit={submit}>
    <header><div><p className="eyebrow">Access control</p><h2>Edit access: {employee.displayName || employee.email}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><Icon name="close"/></button></header>
    {error && <div className="alert error" role="alert">{error}</div>}
    {locked && <div className="alert" role="note">This employee holds a privileged role. Privileged roles are changed through the approval workflow, not here.</div>}
    <div className="form-grid">
      <label className="full">Designation<input name="designation" defaultValue={employee.designation ?? ''} maxLength={120} disabled={locked}/></label>
      <fieldset className="full" disabled={locked}><legend>Roles (select one or more) <span aria-hidden="true">*</span></legend><div className="check-grid">{roles.filter(role => !role.privileged).map(role => <label key={role.id}><input type="checkbox" checked={roleIds.includes(role.id)} onChange={event => setRoleIds(current => event.target.checked ? [...current, role.id] : current.filter(id => id !== role.id))}/><span><strong>{role.name}</strong><small>{role.description}</small></span></label>)}</div></fieldset>
      <fieldset className="full" disabled={locked}><legend>Branch access <span aria-hidden="true">*</span></legend><div className="check-grid">{branches.map(branch => <label key={branch.id}><input type="checkbox" checked={branchIds.includes(branch.id)} onChange={event => setBranchIds(current => event.target.checked ? [...current, branch.id] : current.filter(id => id !== branch.id))}/><span><strong>{branch.name}</strong><small>{branch.code} · {branch.city}</small></span></label>)}</div></fieldset>
      <label className="full">Reason for change <span aria-hidden="true">*</span><textarea name="reason" required minLength={8} maxLength={500} rows={3} placeholder="Recorded in the audit log" disabled={locked}/></label>
    </div>
    <footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || locked}>{busy ? 'Saving…' : 'Save access'}</button></footer>
  </form></dialog>;
}

function StatusDialog({ user, employee, onClose, onDone }: { user: User; employee: AdminActor; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); const [status, setStatus] = useState(employee.status); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); try { await adminApi.status(user, employee.userId, status, String(form.get('reason'))); onDone(); } catch (error) { setError(errorMessage(error)); setBusy(false); } }
  return <dialog ref={ref} onCancel={onClose} className="dialog compact"><form onSubmit={submit}><header><div><p className="eyebrow">Account control</p><h2>Manage {employee.displayName || employee.email}</h2></div><button type="button" className="icon-button" aria-label="Close account controls" onClick={onClose}><Icon name="close"/></button></header>{error && <div className="alert error" role="alert">{error}</div>}<label>Account status<select value={status} onChange={event => setStatus(event.target.value)}><option>ACTIVE</option><option>SUSPENDED</option><option>DEACTIVATED</option></select></label><label>Reason <span aria-hidden="true">*</span><textarea name="reason" minLength={8} maxLength={500} required placeholder="Record the business or security reason."/></label><p className="helper">Suspending or deactivating immediately blocks local access. Active Firebase refresh sessions are revoked for inactive states.</p><footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className={`button ${status === 'ACTIVE' ? 'primary' : 'danger'}`} disabled={busy || status === employee.status}>{busy ? 'Applying…' : 'Confirm status'}</button></footer></form></dialog>;
}

function AccessPage({ user }: { user: User }) {
  const [roles, setRoles] = useState<Role[] | null>(null); const [error, setError] = useState('');
  useEffect(() => { adminApi.roles(user).then(setRoles).catch(error => setError(errorMessage(error))); }, [user]);
  return <><PageHeader eyebrow="Least privilege" title="Access Control" description="Read-only visibility into the active server-controlled role catalogue and effective Admin permissions."/>{error ? <ErrorState message={error}/> : !roles ? <SkeletonCards/> : <section className="role-grid">{roles.map(role => <article className="panel role-card" key={role.id}><div><h2>{role.name}</h2>{role.privileged && <span className="privileged-badge">Privileged</span>}</div><p>{role.description}</p>{role.permissions.length ? <ul>{role.permissions.map(({ permission }) => <li key={permission.key}><code>{permission.key}</code><span>{permission.description}</span></li>)}</ul> : <EmptyState title="No Admin permissions" text="This role operates only in its responsible business portal."/>}</article>)}</section>}</>;
}

function BranchesPage({ user, actor }: { user: User; actor: AdminActor }) {
  const [branches, setBranches] = useState<ManagedBranch[] | null>(null);
  const [areas, setAreas] = useState<ServiceArea[] | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [branchOpen, setBranchOpen] = useState(false);
  const [initialAreaForBranch, setInitialAreaForBranch] = useState<string | undefined>(undefined);
  const [editBranch, setEditBranch] = useState<ManagedBranch | null>(null);
  const [areaOpen, setAreaOpen] = useState(false);
  const canManage = actor.permissions.includes('branch.manage');

  useEffect(() => {
    setError('');
    Promise.all([adminApi.managedBranches(user), adminApi.serviceAreas(user)])
      .then(([nextBranches, nextAreas]) => { setBranches(nextBranches); setAreas(nextAreas); })
      .catch(error => setError(errorMessage(error)));
  }, [user, reload]);

  async function setBranchActive(branch: ManagedBranch) {
    try {
      await adminApi.updateBranch(user, branch.id, { active: !branch.active });
      setReload(value => value + 1);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  async function setAreaActive(area: ServiceArea) {
    try {
      await adminApi.updateServiceArea(user, area.id, !area.active);
      setReload(value => value + 1);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  async function deleteArea(area: ServiceArea) {
    if (!window.confirm(`Delete service area "${area.name}"? This cannot be undone.`)) return;
    try {
      await adminApi.deleteServiceArea(user, area.id);
      setReload(value => value + 1);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  const findCoveringBranch = (areaName: string) => {
    if (!branches) return null;
    const lowerArea = areaName.toLowerCase();
    // 1. Direct match on city
    let b = branches.find(branch => branch.city.toLowerCase() === lowerArea);
    if (b) return b;
    // 2. Substring match
    b = branches.find(branch => lowerArea.includes(branch.city.toLowerCase()) || branch.city.toLowerCase().includes(lowerArea));
    if (b) return b;
    // 3. Fallback to active branch in the same metro (e.g. Bengaluru)
    if (lowerArea.includes('bengaluru') || lowerArea.includes('bangalore')) {
      return branches.find(branch => branch.city.toLowerCase().includes('bengaluru') || branch.city.toLowerCase().includes('bangalore')) || null;
    }
    return null;
  };

  return (
    <>
      <PageHeader
        eyebrow="Facilities & Coverage"
        title="Operating Hubs & Service Areas"
        description="Physical Service Hub locations (for vehicle inspections, inventory custody, refurbishment bays, and handovers) and customer-facing Service Areas (controlling where mobile selling and servicing journeys are available)."
        action={canManage ? (
          <div className="header-actions">
            <button className="button secondary" onClick={() => setAreaOpen(true)}>Add service area</button>
            <button className="button primary" onClick={() => { setInitialAreaForBranch(undefined); setBranchOpen(true); }}>+ Add Service Hub / Branch</button>
          </div>
        ) : undefined}
      />
      {error ? (
        <ErrorState message={error} retry={() => setReload(value => value + 1)}/>
      ) : !branches || !areas ? (
        <TableSkeleton/>
      ) : (
        <>
          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <h2>Operating Service Hubs & Branches</h2>
                <p>Physical facilities where vehicle custody, handovers, in-person inspections, and stock are stationed ({branches.length} location{branches.length === 1 ? '' : 's'}).</p>
              </div>
            </div>
            {branches.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Service Hub / Branch</th>
                      <th>City & Physical Address</th>
                      <th>Capabilities</th>
                      <th>Active Staff</th>
                      <th>Pending Invitations</th>
                      <th>Status</th>
                      {canManage && <th><span className="sr-only">Action</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {branches.map(branch => (
                      <tr key={branch.id}>
                        <td>
                          <strong>{branch.name}</strong>
                          <small>{branch.code}</small>
                        </td>
                        <td>
                          <strong>{branch.city}</strong>
                          <small>{branch.address || 'Physical facility address not recorded'}</small>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {branch.supportsService !== false && (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                                color: '#0284c7',
                                border: '1px solid rgba(56, 189, 248, 0.3)'
                              }}>
                                <span>🔧</span> Service
                              </span>
                            )}
                            {branch.supportsRentals !== false && (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                backgroundColor: 'rgba(247, 181, 3, 0.15)',
                                color: '#b45309',
                                border: '1px solid rgba(247, 181, 3, 0.35)'
                              }}>
                                <span>🚗</span> Rental Hub
                              </span>
                            )}
                            {branch.supportsService === false && branch.supportsRentals === false && (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                color: 'var(--muted)',
                                backgroundColor: 'var(--surface-sunken)'
                              }}>
                                No Active Services
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{branch._count.employees} staff assigned</td>
                        <td>{branch._count.invitations} pending</td>
                        <td><StatusBadge value={branch.active ? 'ACTIVE' : 'DEACTIVATED'}/></td>
                        {canManage && (
                          <td>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                              <button className="text-button" onClick={() => setEditBranch(branch)}>
                                Edit
                              </button>
                              <button className="text-button" onClick={() => setBranchActive(branch)}>
                                {branch.active ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No service hubs configured" text="Add an operating facility before assigning employee scope."/>
            )}
          </section>

          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <h2>Supported Service Areas (Customer Coverage)</h2>
                <p>These names control customer mobile app availability for valuations, doorstep inspections, and service bookings.</p>
              </div>
            </div>
            {areas.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>City or Area Name</th>
                      <th>Covering Physical Hub</th>
                      <th>Created</th>
                      <th>Status</th>
                      {canManage && <th><span className="sr-only">Action</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {areas.map(area => {
                      const coveringHub = findCoveringBranch(area.name);
                      return (
                        <tr key={area.id}>
                          <td>
                            <strong>{area.name}</strong>
                          </td>
                          <td>
                            {coveringHub ? (
                              <div>
                                <span style={{ color: '#10b981', fontWeight: 600 }}>📍 {coveringHub.name}</span>
                                <small style={{ display: 'block', color: 'var(--muted)' }}>Code: {coveringHub.code} ({coveringHub.city})</small>
                              </div>
                            ) : (
                              <div>
                                <span style={{ color: 'var(--warning)', fontSize: '0.8125rem' }}>⚠️ No dedicated physical hub</span>
                                {canManage && (
                                  <button
                                    className="text-button"
                                    style={{ display: 'block', fontSize: '0.75rem', marginTop: '2px', color: '#38bdf8' }}
                                    onClick={() => {
                                      setInitialAreaForBranch(area.name);
                                      setBranchOpen(true);
                                    }}
                                  >
                                    + Create Hub for this Area
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td><time>{new Date(area.createdAt).toLocaleDateString()}</time></td>
                          <td><StatusBadge value={area.active ? 'ACTIVE' : 'DEACTIVATED'}/></td>
                          {canManage && (
                            <td>
                              <button className="text-button" onClick={() => setAreaActive(area)}>
                                {area.active ? 'Deactivate' : 'Reactivate'}
                              </button>
                              <button className="text-button" style={{ marginLeft: 8, color: '#EF4444' }} onClick={() => deleteArea(area)}>
                                Delete
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No service areas configured" text="Add a service area to make customer coverage explicit."/>
            )}
          </section>
        </>
      )}
      {branchOpen && (
        <CreateBranchDialog
          user={user}
          areas={areas || []}
          initialArea={initialAreaForBranch}
          onClose={() => { setBranchOpen(false); setInitialAreaForBranch(undefined); }}
          onDone={() => { setBranchOpen(false); setInitialAreaForBranch(undefined); setReload(value => value + 1); }}
        />
      )}
      {editBranch && (
        <EditBranchDialog
          user={user}
          branch={editBranch}
          onClose={() => setEditBranch(null)}
          onDone={() => { setEditBranch(null); setReload(value => value + 1); }}
        />
      )}
      {areaOpen && (
        <CreateServiceAreaDialog
          user={user}
          onClose={() => setAreaOpen(false)}
          onDone={() => { setAreaOpen(false); setReload(value => value + 1); }}
        />
      )}
    </>
  );
}

function CreateBranchDialog({ user, areas, initialArea, onClose, onDone }: { user: User; areas: ServiceArea[]; initialArea?: string; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedArea, setSelectedArea] = useState(initialArea || '');
  const [code, setCode] = useState(() => initialArea ? `BLR-${Math.floor(10 + Math.random() * 89)}` : '');
  const [name, setName] = useState(() => initialArea ? `V MOTIV ${initialArea.split(' ')[0]} Hub` : '');
  const [city, setCity] = useState(initialArea || '');
  const [address, setAddress] = useState('');
  const [supportsService, setSupportsService] = useState(true);
  const [supportsRentals, setSupportsRentals] = useState(true);

  useEffect(() => { ref.current?.showModal(); }, []);

  const handleSelectArea = (areaName: string) => {
    setSelectedArea(areaName);
    if (areaName) {
      setCity(areaName);
      const short = areaName.split(' ')[0].toUpperCase();
      setName(`V MOTIV ${areaName.split(' ')[0]} Hub`);
      setCode(`BLR-${short.slice(0, 3)}`);
      setAddress(`${areaName} Facility, Karnataka`);
    }
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminApi.createBranch(user, {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        city: city.trim(),
        address: address.trim() || undefined,
        supportsService,
        supportsRentals,
      });
      onDone();
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onCancel={onClose} className="dialog compact">
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">Operating Facility</p>
            <h2>Add Service Hub / Branch</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close branch form" onClick={onClose}><Icon name="close"/></button>
        </header>
        {error && <div className="alert error" role="alert">{error}</div>}

        {areas.length > 0 && (
          <label>
            Link to Supported Service Area (Optional)
            <select value={selectedArea} onChange={e => handleSelectArea(e.target.value)}>
              <option value="">-- Custom Location / Unlinked --</option>
              {areas.map(a => (
                <option key={a.id} value={a.name}>{a.name}</option>
              ))}
            </select>
          </label>
        )}

        <label>
          Branch / Hub Code <span aria-hidden="true">*</span>
          <input
            name="code"
            required
            minLength={2}
            maxLength={24}
            pattern="[A-Za-z0-9_-]+"
            placeholder="e.g. BLR-02"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <label>
          Service Hub Name <span aria-hidden="true">*</span>
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            placeholder="e.g. V MOTIV Kengeri Hub"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </label>
        <label>
          City or Area <span aria-hidden="true">*</span>
          <input
            name="city"
            required
            minLength={2}
            maxLength={120}
            placeholder="e.g. Kengeri Mysore Road Bengaluru"
            value={city}
            onChange={e => setCity(e.target.value)}
          />
        </label>
        <label>
          Physical Address
          <textarea
            name="address"
            maxLength={500}
            placeholder="Street address, landmark, workshop and parking bays location"
            value={address}
            onChange={e => setAddress(e.target.value)}
          />
        </label>

        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', margin: '12px 0' }}>
          <legend style={{ padding: '0 6px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Supported Hub Capabilities</legend>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: '4px 0', fontSize: '0.875rem' }}>
            <input
              type="checkbox"
              checked={supportsService}
              onChange={e => setSupportsService(e.target.checked)}
              style={{ width: 'auto', margin: 0 }}
            />
            <span><strong>Supports Vehicle Service</strong> (Workshop, maintenance & inspection bays)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: '6px 0 2px 0', fontSize: '0.875rem' }}>
            <input
              type="checkbox"
              checked={supportsRentals}
              onChange={e => setSupportsRentals(e.target.checked)}
              style={{ width: 'auto', margin: 0 }}
            />
            <span><strong>Supports Car Rentals</strong> (Pickup and return fleet hub)</span>
          </label>
        </fieldset>

        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={busy}>{busy ? 'Creating Hub…' : 'Create Service Hub'}</button>
        </footer>
      </form>
    </dialog>
  );
}

function EditBranchDialog({
  user,
  branch,
  onClose,
  onDone,
}: {
  user: User;
  branch: ManagedBranch;
  onClose: () => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(branch.name);
  const [city, setCity] = useState(branch.city);
  const [address, setAddress] = useState(branch.address || '');
  const [supportsService, setSupportsService] = useState(branch.supportsService !== false);
  const [supportsRentals, setSupportsRentals] = useState(branch.supportsRentals !== false);
  const [active, setActive] = useState(branch.active);

  useEffect(() => { ref.current?.showModal(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminApi.updateBranch(user, branch.id, {
        name: name.trim(),
        city: city.trim(),
        address: address.trim() || null,
        supportsService,
        supportsRentals,
        active,
      });
      onDone();
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onCancel={onClose} className="dialog compact">
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">Operating Facility</p>
            <h2>Edit Service & Rental Hub</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close edit form" onClick={onClose}><Icon name="close"/></button>
        </header>
        {error && <div className="alert error" role="alert">{error}</div>}

        <label>
          Branch / Hub Code
          <input
            value={branch.code}
            disabled
            style={{ opacity: 0.7, cursor: 'not-allowed', backgroundColor: 'var(--surface-sunken)' }}
          />
          <small style={{ color: 'var(--muted)', display: 'block', marginTop: 2 }}>Hub codes are immutable unique identifiers.</small>
        </label>

        <label>
          Service Hub Name <span aria-hidden="true">*</span>
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </label>

        <label>
          City or Area <span aria-hidden="true">*</span>
          <input
            name="city"
            required
            minLength={2}
            maxLength={120}
            value={city}
            onChange={e => setCity(e.target.value)}
          />
        </label>

        <label>
          Physical Address
          <textarea
            name="address"
            maxLength={500}
            placeholder="Street address, landmark, workshop and parking bays location"
            value={address}
            onChange={e => setAddress(e.target.value)}
          />
        </label>

        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', margin: '12px 0' }}>
          <legend style={{ padding: '0 6px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Supported Hub Capabilities</legend>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: '4px 0', fontSize: '0.875rem' }}>
            <input
              type="checkbox"
              checked={supportsService}
              onChange={e => setSupportsService(e.target.checked)}
              style={{ width: 'auto', margin: 0 }}
            />
            <span><strong>Supports Vehicle Service</strong> (Workshop, maintenance & inspection bays)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: '6px 0 2px 0', fontSize: '0.875rem' }}>
            <input
              type="checkbox"
              checked={supportsRentals}
              onChange={e => setSupportsRentals(e.target.checked)}
              style={{ width: 'auto', margin: 0 }}
            />
            <span><strong>Supports Car Rentals</strong> (Pickup and return fleet hub)</span>
          </label>
        </fieldset>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: '8px 0', fontSize: '0.875rem' }}>
          <input
            type="checkbox"
            checked={active}
            onChange={e => setActive(e.target.checked)}
            style={{ width: 'auto', margin: 0 }}
          />
          <span><strong>Active Operating Facility</strong> (Available for operations & staff scope)</span>
        </label>

        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={busy}>{busy ? 'Saving Changes…' : 'Save Changes'}</button>
        </footer>
      </form>
    </dialog>
  );
}

function CreateServiceAreaDialog({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); useEffect(() => { ref.current?.showModal(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(''); try { await adminApi.createServiceArea(user, String(form.get('name'))); onDone(); } catch (error) { setError(errorMessage(error)); setBusy(false); } }
  return <dialog ref={ref} onCancel={onClose} className="dialog compact"><form onSubmit={submit}><header><div><p className="eyebrow">Customer coverage</p><h2>Add service area</h2></div><button type="button" className="icon-button" aria-label="Close service-area form" onClick={onClose}><Icon name="close"/></button></header>{error && <div className="alert error" role="alert">{error}</div>}<label>City or service area <span aria-hidden="true">*</span><input name="name" required minLength={2} maxLength={120} placeholder="Bengaluru"/></label><footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Creating…' : 'Create service area'}</button></footer></form></dialog>;
}

function downloadCsvFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function BusinessPage({ user, actor }: { user: User; actor: AdminActor }) {
  const [tab, setTab] = useState<'selling' | 'buying' | 'inventory' | 'finance'>('selling');

  return (
    <>
      <PageHeader
        eyebrow="Business Oversight"
        title="Business Operations"
        description="Operational oversight across vehicle acquisitions, customer purchases, showroom inventory, and financial health."
      />
      <div className="tab-row" role="tablist">
        <button className={`tab-button ${tab === 'selling' ? 'active' : ''}`} onClick={() => setTab('selling')} role="tab" aria-selected={tab === 'selling'}>
          Acquisitions & Selling
        </button>
        <button className={`tab-button ${tab === 'buying' ? 'active' : ''}`} onClick={() => setTab('buying')} role="tab" aria-selected={tab === 'buying'}>
          Customer Buying & Enquiries
        </button>
        <button className={`tab-button ${tab === 'inventory' ? 'active' : ''}`} onClick={() => setTab('inventory')} role="tab" aria-selected={tab === 'inventory'}>
          Inventory & Showroom
        </button>
        <button className={`tab-button ${tab === 'finance' ? 'active' : ''}`} onClick={() => setTab('finance')} role="tab" aria-selected={tab === 'finance'}>
          Financial Oversight
        </button>
      </div>

      {tab === 'selling' && <BusinessSellingTab user={user} />}
      {tab === 'buying' && <BusinessBuyingTab user={user} />}
      {tab === 'inventory' && <BusinessInventoryTab user={user} />}
      {tab === 'finance' && <BusinessFinanceTab user={user} />}
    </>
  );
}

function BusinessSellingTab({ user }: { user: User }) {
  const [data, setData] = useState<BusinessSellingPage | null>(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setError('');
      adminApi.businessSelling(user, page, search || undefined, status || undefined)
        .then(setData)
        .catch(err => setError(errorMessage(err)));
    }, 200);
    return () => clearTimeout(timer);
  }, [user, page, search, status, reload]);

  return (
    <>
      <section className="panel filters">
        <label>
          Search Leads
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Seller name, phone, car make or model"
          />
        </label>
        <label>
          Status
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="INITIATED">Initiated</option>
            <option value="INSPECTION_SCHEDULED">Inspection Scheduled</option>
            <option value="INSPECTED">Inspected</option>
            <option value="OFFER_ACCEPTED">Offer Accepted</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>
      </section>

      {error ? (
        <ErrorState message={error} retry={() => setReload(v => v + 1)} />
      ) : !data ? (
        <TableSkeleton />
      ) : (
        <section className="panel table-panel">
          <div className="panel-heading">
            <div>
              <h2>Acquisition Leads</h2>
              <p>{data.total.toLocaleString()} lead{data.total === 1 ? '' : 's'} recorded</p>
            </div>
            {data.counts && (
              <div className="pill-row">
                {Object.entries(data.counts).map(([st, cnt]) => (
                  <span key={st} className="pill">
                    {humanize(st)}: <strong>{cnt}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
          {data.items.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ref Code</th>
                    <th>Seller</th>
                    <th>Vehicle</th>
                    <th>Location</th>
                    <th>Latest Offer</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(lead => {
                    const latestOffer = lead.offers?.[0];
                    return (
                      <tr key={lead.id}>
                        <td>
                          <strong>{lead.referenceCode || lead.id.slice(0, 8)}</strong>
                        </td>
                        <td>
                          <strong>{lead.sellerName}</strong>
                          <small>{lead.sellerPhone}</small>
                        </td>
                        <td>
                          <strong>{lead.make} {lead.model}</strong>
                          <small>{lead.year}</small>
                        </td>
                        <td>{lead.city}</td>
                        <td>
                          {latestOffer ? (
                            <strong>₹{(Number(latestOffer.offerAmountPaise) / 100).toLocaleString('en-IN')}</strong>
                          ) : (
                            <small>No offer yet</small>
                          )}
                        </td>
                        <td>
                          <StatusBadge value={lead.status} />
                        </td>
                        <td>
                          <time>{new Date(lead.createdAt).toLocaleDateString()}</time>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No acquisition leads" text="No vehicle seller leads match this criteria." />
          )}
          <Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
        </section>
      )}
    </>
  );
}

function BusinessBuyingTab({ user }: { user: User }) {
  const [data, setData] = useState<BusinessBuyingPage | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setError('');
      adminApi.businessBuying(user, page, search || undefined)
        .then(setData)
        .catch(err => setError(errorMessage(err)));
    }, 200);
    return () => clearTimeout(timer);
  }, [user, page, search, reload]);

  return (
    <>
      <section className="panel filters">
        <label>
          Search Enquiries
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search customer, vehicle title, make or model"
          />
        </label>
      </section>

      {error ? (
        <ErrorState message={error} retry={() => setReload(v => v + 1)} />
      ) : !data ? (
        <TableSkeleton />
      ) : (
        <>
          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <h2>Test Drive Bookings</h2>
                <p>{data.testDrives.total} test drive request{data.testDrives.total === 1 ? '' : 's'}</p>
              </div>
            </div>
            {data.testDrives.items.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Vehicle</th>
                      <th>Location / Type</th>
                      <th>Scheduled Slot</th>
                      <th>Status</th>
                      <th>Booked On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.testDrives.items.map(td => (
                      <tr key={td.id}>
                        <td>
                          <strong>{td.user.displayName || td.user.email}</strong>
                          <small>{td.user.email}</small>
                        </td>
                        <td>
                          <strong>{td.listing.title}</strong>
                          <small>{td.listing.vehicle.make} {td.listing.vehicle.model} ({td.listing.vehicle.manufacturingYear})</small>
                        </td>
                        <td><span className="pill">{humanize(td.locationPreference || 'HUB')}</span></td>
                        <td>
                          <strong>{td.requestedDate ? new Date(td.requestedDate).toLocaleDateString() : '—'}</strong>
                          <small>{td.timeSlot || ''} {td.address ? `· ${td.address}` : ''}</small>
                        </td>
                        <td><StatusBadge value={td.status} /></td>
                        <td><time>{new Date(td.createdAt).toLocaleDateString()}</time></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No test drive requests" text="No active test drive bookings found." />
            )}
          </section>

          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <h2>Purchase Enquiries</h2>
                <p>{data.purchaseEnquiries.total} enquiry recorded</p>
              </div>
            </div>
            {data.purchaseEnquiries.items.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Vehicle</th>
                      <th>Message</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.purchaseEnquiries.items.map(enq => (
                      <tr key={enq.id}>
                        <td>
                          <strong>{enq.user.displayName || enq.user.email}</strong>
                          <small>{enq.user.email}</small>
                        </td>
                        <td>
                          <strong>{enq.listing.title}</strong>
                          <small>{enq.listing.vehicle.make} {enq.listing.vehicle.model}</small>
                        </td>
                        <td>{enq.message || <small>No message provided</small>}</td>
                        <td><StatusBadge value={enq.status} /></td>
                        <td><time>{new Date(enq.createdAt).toLocaleDateString()}</time></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No purchase enquiries" text="No purchase enquiries recorded yet." />
            )}
          </section>
        </>
      )}
    </>
  );
}

function BusinessInventoryTab({ user }: { user: User }) {
  const [data, setData] = useState<BusinessInventoryPage | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setError('');
      adminApi.businessInventory(user, page, search || undefined, status || undefined)
        .then(setData)
        .catch(err => setError(errorMessage(err)));
    }, 200);
    return () => clearTimeout(timer);
  }, [user, page, search, status, reload]);

  return (
    <>
      <section className="panel filters">
        <label>
          Search Inventory
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search make, model, or listing title"
          />
        </label>
        <label>
          Status
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="RESERVED">Reserved</option>
            <option value="SOLD">Sold</option>
            <option value="DELISTED">Delisted</option>
          </select>
        </label>
      </section>

      {error ? (
        <ErrorState message={error} retry={() => setReload(v => v + 1)} />
      ) : !data ? (
        <TableSkeleton />
      ) : (
        <section className="panel table-panel">
          <div className="panel-heading">
            <div>
              <h2>Showroom Inventory</h2>
              <p>{data.total.toLocaleString()} vehicle{data.total === 1 ? '' : 's'} listed</p>
            </div>
            {data.counts && (
              <div className="pill-row">
                {Object.entries(data.counts).map(([st, cnt]) => (
                  <span key={st} className="pill">
                    {humanize(st)}: <strong>{cnt}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
          {data.items.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Specs</th>
                    <th>Listed Price</th>
                    <th>Engagement</th>
                    <th>Status</th>
                    <th>Listed On</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(item => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.title}</strong>
                        <small>{item.vehicle?.make} {item.vehicle?.model} ({item.vehicle?.manufacturingYear})</small>
                      </td>
                      <td>
                        <span>{item.vehicle?.fuelType} · {item.vehicle?.transmission}</span>
                        <small>
                          {typeof item.vehicle?.odometerKm === 'number'
                            ? `${item.vehicle.odometerKm.toLocaleString()} km`
                            : 'Odometer not recorded'}
                          {item.vehicle?.city ? ` · ${item.vehicle.city}` : ''}
                        </small>
                      </td>
                      <td>
                        <strong>₹{(Number(item.pricePaise || 0) / 100).toLocaleString('en-IN')}</strong>
                      </td>
                      <td>
                        <small>
                          {item._count?.testDriveRequests ?? 0} Test Drives · {item._count?.purchaseEnquiries ?? 0} Enquiries · {item._count?.wishlist ?? 0} Wishlist
                        </small>
                      </td>
                      <td><StatusBadge value={item.status} /></td>
                      <td>
                        <time>{new Date(item.createdAt).toLocaleDateString()}</time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No vehicles found" text="No inventory items match the selected filter." />
          )}
          <Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
        </section>
      )}
    </>
  );
}

function BusinessFinanceTab({ user }: { user: User }) {
  const [data, setData] = useState<BusinessFinance | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setError('');
    adminApi.businessFinance(user)
      .then(setData)
      .catch(err => setError(errorMessage(err)));
  }, [user, reload]);

  return (
    <>
      {error ? (
        <ErrorState message={error} retry={() => setReload(v => v + 1)} />
      ) : !data ? (
        <SkeletonCards />
      ) : (
        <>
          <section className="metric-grid">
            <article className="metric-card">
              <span>Active Inventory Value</span>
              <strong>₹{(data.activeInventoryValueRupees || 0).toLocaleString('en-IN')}</strong>
              <small>{data.activeInventoryCount ?? 0} published vehicles</small>
            </article>
            <article className="metric-card">
              <span>Total Offers Issued</span>
              <strong>₹{(data.totalOffersValueRupees || 0).toLocaleString('en-IN')}</strong>
              <small>{data.totalOffersIssued ?? 0} acquisition valuation offers</small>
            </article>
            <article className="metric-card">
              <span>Acquisition Leads</span>
              <strong>{data.totalAcquisitionLeads ?? 0}</strong>
              <small>{data.pendingSettlements ?? 0} accepted awaiting settlement</small>
            </article>
            <article className="metric-card">
              <span>Reconciliation Status</span>
              <strong><StatusBadge value={data.reconciliationStatus} /></strong>
              <small>Real-time ledger audit compliant</small>
            </article>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Finance Policy & Governance</h2>
                <p>Rules enforced by the backend ledger architecture.</p>
              </div>
            </div>
            <ul className="event-list">
              <li>
                <div>
                  <strong>Maker-Checker Payment Authorization</strong>
                  <span>Payouts over ₹1,00,000 require independent approval before disbursement.</span>
                </div>
                <span className="pill">Server Enforced</span>
              </li>
              <li>
                <div>
                  <strong>No Self-Approval Rule</strong>
                  <span>Employees proposing a pricing override or payout cannot approve their own transaction.</span>
                </div>
                <span className="pill">Server Enforced</span>
              </li>
              <li>
                <div>
                  <strong>Immutable Audit Trail</strong>
                  <span>Every offer, valuation, test drive request, and inventory transition is journaled to audit logs.</span>
                </div>
                <span className="pill">Active</span>
              </li>
            </ul>
          </section>
        </>
      )}
    </>
  );
}

/** Mirrors services/api/src/master-data-rules.ts. These are the categories the customer app and portals read. */
const MASTER_DATA_CATEGORY_OPTIONS: Array<{ value: string; label: string; parent: string | null }> = [
  { value: 'MAKE', label: 'Car make', parent: null },
  { value: 'MODEL', label: 'Car model (belongs to a make)', parent: 'MAKE' },
  { value: 'VARIANT', label: 'Car variant (belongs to a model)', parent: 'MODEL' },
  { value: 'BODY_TYPE', label: 'Body type', parent: null },
  { value: 'FUEL_TYPE', label: 'Fuel type', parent: null },
  { value: 'TRANSMISSION', label: 'Transmission', parent: null },
  { value: 'COLOR', label: 'Colour', parent: null },
  { value: 'OWNERSHIP_TYPE', label: 'Ownership type', parent: null },
  { value: 'DOCUMENT_TYPE', label: 'Document type', parent: null },
];

function MasterDataPage({ user, actor }: { user: User; actor: AdminActor }) {
  const [items, setItems] = useState<MasterDataItem[] | null>(null);
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const canManage = actor.permissions.includes('masterdata.manage');

  useEffect(() => {
    setError('');
    adminApi.masterData(user, category || undefined)
      .then(setItems)
      .catch(err => setError(errorMessage(err)));
  }, [user, category, reload]);

  async function toggleActive(item: MasterDataItem) {
    try {
      await adminApi.updateMasterDataItem(user, item.id, { active: !item.active });
      setReload(v => v + 1);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Master Data Governance"
        title="Master Data Catalog"
        description="Canonical automotive taxonomy including makes, body types, fuel types, transmissions, and document categories."
        action={
          canManage && (
            <button className="button primary" onClick={() => setCreateOpen(true)}>
              Add Master Data Item
            </button>
          )
        }
      />

      <section className="panel filters">
        <label>
          Category
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">All Categories</option>
            {MASTER_DATA_CATEGORY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </section>

      {error ? (
        <ErrorState message={error} retry={() => setReload(v => v + 1)} />
      ) : !items ? (
        <TableSkeleton />
      ) : (
        <section className="panel table-panel">
          <div className="panel-heading">
            <div>
              <h2>Taxonomy Items</h2>
              <p>{items.length} canonical record{items.length === 1 ? '' : 's'}</p>
            </div>
          </div>
          {items.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Parent</th>
                    <th>Status</th>
                    {canManage && <th><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id}>
                      <td><span className="pill">{item.category}</span></td>
                      <td><code>{item.code}</code></td>
                      <td><strong>{item.name}</strong></td>
                      <td>{item.parentCode ? <code>{item.parentCode}</code> : <small>None</small>}</td>
                      <td><StatusBadge value={item.active ? 'ACTIVE' : 'DEACTIVATED'} /></td>
                      {canManage && (
                        <td>
                          <button className="text-button" onClick={() => toggleActive(item)}>
                            {item.active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No items found" text="No master data items recorded in this category." />
          )}
        </section>
      )}

      {createOpen && (
        <CreateMasterDataDialog
          user={user}
          onClose={() => setCreateOpen(false)}
          onDone={() => {
            setCreateOpen(false);
            setReload(v => v + 1);
          }}
        />
      )}
    </>
  );
}

function CreateMasterDataDialog({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: () => void }) {
  const [categoryValue, setCategoryValue] = useState('MAKE');
  const [parentCode, setParentCode] = useState('');
  const [parentOptions, setParentOptions] = useState<MasterDataItem[]>([]);
  const parentCategory = MASTER_DATA_CATEGORY_OPTIONS.find(option => option.value === categoryValue)?.parent ?? null;
  useEffect(() => {
    if (!parentCategory) { setParentOptions([]); return; }
    let active = true;
    adminApi.masterData(user, parentCategory).then(items => { if (active) setParentOptions(items.filter(item => item.active)); }).catch(() => { if (active) setParentOptions([]); });
    return () => { active = false; };
  }, [user, parentCategory]);
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { ref.current?.showModal(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await adminApi.createMasterDataItem(user, {
        category: String(form.get('category')).trim().toUpperCase(),
        code: String(form.get('code')).trim().toUpperCase(),
        name: String(form.get('name')).trim(),
        parentCode: String(form.get('parentCode') ?? '').trim().toUpperCase() || undefined,
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onCancel={onClose} className="dialog compact">
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">Taxonomy Configuration</p>
            <h2>Add Master Data Item</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        {error && <div className="alert error" role="alert">{error}</div>}
        <label>
          Category <span aria-hidden="true">*</span>
          <select name="category" required value={categoryValue} onChange={event => { setCategoryValue(event.target.value); setParentCode(''); }}>
            {MASTER_DATA_CATEGORY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Unique Code <span aria-hidden="true">*</span>
          <input name="code" required minLength={2} maxLength={80} placeholder="e.g. HYUNDAI, SUV, DIESEL" />
        </label>
        <label>
          Display Name <span aria-hidden="true">*</span>
          <input name="name" required minLength={1} maxLength={160} placeholder="e.g. Hyundai, SUV, Diesel" />
        </label>
        {parentCategory && (
          <label>
            {parentCategory === 'MAKE' ? 'Make' : 'Model'} <span aria-hidden="true">*</span>
            <select name="parentCode" required value={parentCode} onChange={event => setParentCode(event.target.value)}>
              <option value="">Select {parentCategory === 'MAKE' ? 'a make' : 'a model'}</option>
              {parentOptions.map(item => <option key={item.id} value={item.code}>{item.name}</option>)}
            </select>
          </label>
        )}
        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create Item'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function CommunicationsPage({ user }: { user: User; actor: AdminActor }) {
  const [tab, setTab] = useState<'outbox' | 'templates'>('outbox');
  const [data, setData] = useState<CommunicationsOutboxPage | null>(null);
  const [templates, setTemplates] = useState<CommunicationsTemplate[] | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<CommunicationsOutboxItem | null>(null);
  const [state, setState] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (tab === 'outbox') {
      setError('');
      adminApi.communicationsOutbox(user, page, state || undefined)
        .then(setData)
        .catch(err => setError(errorMessage(err)));
    } else {
      setError('');
      adminApi.communicationsTemplates(user)
        .then(setTemplates)
        .catch(err => setError(errorMessage(err)));
    }
  }, [user, tab, page, state, reload]);

  async function retryDelivery(id: string) {
    try {
      await adminApi.retryEmailOutbox(user, id);
      setReload(v => v + 1);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Delivery & Outreach"
        title="Email & Communications"
        description="Transactional delivery monitoring powered by Resend with recipient PII masking and automated exponential backoff."
      />
      <div className="tab-row" role="tablist">
        <button className={`tab-button ${tab === 'outbox' ? 'active' : ''}`} onClick={() => setTab('outbox')} role="tab" aria-selected={tab === 'outbox'}>
          Email Outbox
        </button>
        <button className={`tab-button ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')} role="tab" aria-selected={tab === 'templates'}>
          Transactional Templates
        </button>
      </div>

      {tab === 'outbox' && (
        <>
          <section className="panel filters">
            <label>
              Delivery State
              <select value={state} onChange={e => { setState(e.target.value); setPage(1); }}>
                <option value="">All States</option>
                <option value="PENDING">Pending</option>
                <option value="SENT">Sent</option>
                <option value="FAILED">Failed</option>
                <option value="DEAD_LETTER">Dead Letter</option>
              </select>
            </label>
          </section>

          {error ? (
            <ErrorState message={error} retry={() => setReload(v => v + 1)} />
          ) : !data ? (
            <TableSkeleton />
          ) : (
            <section className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h2>Outbox Messages</h2>
                  <p>{data.total.toLocaleString()} message{data.total === 1 ? '' : 's'}</p>
                </div>
                {data.summary && (
                  <div className="pill-row">
                    {Object.entries(data.summary).map(([st, cnt]) => (
                      <span key={st} className="pill">
                        {humanize(st)}: <strong>{cnt}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {data.items.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Event Key</th>
                        <th>Recipient (Masked)</th>
                        <th>Subject</th>
                        <th>Attempts</th>
                        <th>Status</th>
                        <th>Sent / Created</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map(item => (
                        <tr key={item.id}>
                          <td><code>{item.eventKey}</code></td>
                          <td><strong>{item.recipient}</strong></td>
                          <td>{item.subject}</td>
                          <td>{item.attempts} / {item.maxAttempts} {item.lastErrorCode ? <small>Err: {item.lastErrorCode}</small> : ''}</td>
                          <td><StatusBadge value={item.state} /></td>
                          <td>
                            <time>{new Date(item.sentAt || item.createdAt).toLocaleString()}</time>
                          </td>
                          <td>
                            <button className="text-button" onClick={() => setSelectedMessage(item)}>View</button>
                            {(item.state === 'FAILED' || item.state === 'DEAD_LETTER') && (
                              <button className="text-button" style={{ marginLeft: '8px' }} onClick={() => retryDelivery(item.id)}>
                                Retry
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No outbox records" text="No transactional email records found for this filter." />
              )}
              <Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
            </section>
          )}

          {selectedMessage && (
            <div className="dialog-scrim" onClick={() => setSelectedMessage(null)}>
              <div className="dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', width: '90%' }}>
                <div className="dialog-header">
                  <h2>Outbox Message Details</h2>
                  <button className="icon-button" onClick={() => setSelectedMessage(null)}><Icon name="close" /></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 0' }}>
                  <div><strong>Subject:</strong> {selectedMessage.subject}</div>
                  <div><strong>Recipient (Masked):</strong> <code>{selectedMessage.recipient}</code></div>
                  <div><strong>Event Key:</strong> <code>{selectedMessage.eventKey}</code></div>
                  <div><strong>Status:</strong> <StatusBadge value={selectedMessage.state} /></div>
                  {selectedMessage.templateVersion && <div><strong>Template:</strong> <code>{selectedMessage.templateVersion}</code></div>}
                  {selectedMessage.providerMessageId && <div><strong>Resend Message ID:</strong> <code>{selectedMessage.providerMessageId}</code></div>}
                  <div><strong>Attempts:</strong> {selectedMessage.attempts} / {selectedMessage.maxAttempts}</div>
                  {selectedMessage.lastErrorCode && <div><strong>Error Code:</strong> <span style={{ color: 'var(--red, #EF4444)' }}>{selectedMessage.lastErrorCode}</span></div>}
                  <div><strong>Queued At:</strong> {new Date(selectedMessage.createdAt).toLocaleString()}</div>
                  {selectedMessage.sentAt && <div><strong>Delivered At:</strong> {new Date(selectedMessage.sentAt).toLocaleString()}</div>}
                  {selectedMessage.text && (
                    <div>
                      <strong>Body:</strong>
                      <pre style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto', fontSize: '12px', marginTop: '6px' }}>
                        {selectedMessage.text}
                      </pre>
                    </div>
                  )}
                </div>
                <div className="dialog-actions">
                  <button className="button secondary" onClick={() => setSelectedMessage(null)}>Close</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'templates' && (
        <>
          {error ? (
            <ErrorState message={error} retry={() => setReload(v => v + 1)} />
          ) : !templates ? (
            <TableSkeleton />
          ) : (
            <section className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h2>Transactional Templates</h2>
                  <p>{templates.length} canonical template{templates.length === 1 ? '' : 's'}</p>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Template Key</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map(tpl => (
                      <tr key={tpl.key}>
                        <td><code>{tpl.key}</code></td>
                        <td><strong>{tpl.name}</strong></td>
                        <td><span className="pill">{tpl.type}</span></td>
                        <td>{tpl.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

function ReportsPage({ user }: { user: User; actor: AdminActor }) {
  const [tab, setTab] = useState<'exports' | 'audit'>('exports');
  const [data, setData] = useState<ExportJobPage | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (tab === 'exports') {
      setError('');
      adminApi.exportJobs(user, page)
        .then(setData)
        .catch(err => setError(errorMessage(err)));
    }
  }, [user, tab, page, reload]);

  async function handleDownload(job: ExportJob) {
    setDownloading(job.id);
    try {
      const result = await adminApi.downloadExport(user, job.id);
      const filename = `vmotiv-export-${job.resourceType.toLowerCase()}-${job.id.slice(0, 8)}.csv`;
      downloadCsvFile(result.fileContent, filename);
      setReload(v => v + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Compliance & Reporting"
        title="Audit & Controlled Reports"
        description="Immutable audit trail and controlled CSV exports with spreadsheet formula injection protection and maker-checker approval for sensitive data."
        action={
          tab === 'exports' && (
            <button className="button primary" onClick={() => setExportOpen(true)}>
              Request Export
            </button>
          )
        }
      />
      <div className="tab-row" role="tablist">
        <button className={`tab-button ${tab === 'exports' ? 'active' : ''}`} onClick={() => setTab('exports')} role="tab" aria-selected={tab === 'exports'}>
          Controlled Exports
        </button>
        <button className={`tab-button ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')} role="tab" aria-selected={tab === 'audit'}>
          Audit History
        </button>
      </div>

      {tab === 'exports' && (
        <>
          {error && <div className="alert error" role="alert">{error}</div>}
          {!data ? (
            <TableSkeleton />
          ) : (
            <section className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h2>Export Queue</h2>
                  <p>{data.total.toLocaleString()} export job{data.total === 1 ? '' : 's'}</p>
                </div>
              </div>
              {data.items.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Resource</th>
                        <th>Scope</th>
                        <th>Classification</th>
                        <th>Rows</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map(job => (
                        <tr key={job.id}>
                          <td><strong>{humanize(job.resourceType)}</strong><small>{job.format}</small></td>
                          <td><code>{job.scope}</code></td>
                          <td>
                            {job.sensitive ? (
                              <span className="privileged-badge">Sensitive (PII)</span>
                            ) : (
                              <span className="pill">Operational</span>
                            )}
                          </td>
                          <td>{typeof job.rowCount === 'number' ? job.rowCount.toLocaleString() : '—'}</td>
                          <td><StatusBadge value={job.status} /></td>
                          <td>
                            <time>{new Date(job.createdAt).toLocaleDateString()}</time>
                            {job.requester?.user && <small>{job.requester.user.displayName || job.requester.user.email}</small>}
                          </td>
                          <td>
                            {job.status === 'READY' ? (
                              <button
                                className="button secondary"
                                style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                                disabled={downloading === job.id}
                                onClick={() => handleDownload(job)}
                              >
                                <Icon name="download" />
                                {downloading === job.id ? 'Downloading…' : 'Download CSV'}
                              </button>
                            ) : job.status === 'APPROVAL_PENDING' ? (
                              <small>Pending Approval in Inbox</small>
                            ) : (
                              <small>{humanize(job.status)}</small>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No exports requested" text="Request an export above. Sensitive exports require maker-checker signoff." />
              )}
              <Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
            </section>
          )}

          {exportOpen && (
            <RequestExportDialog
              user={user}
              onClose={() => setExportOpen(false)}
              onDone={() => {
                setExportOpen(false);
                setReload(v => v + 1);
              }}
            />
          )}
        </>
      )}

      {tab === 'audit' && <AuditPageView user={user} />}
    </>
  );
}

function RequestExportDialog({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [resourceType, setResourceType] = useState('INVENTORY');
  const [sensitive, setSensitive] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { ref.current?.showModal(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminApi.createExportJob(user, {
        resourceType,
        sensitive: sensitive || resourceType === 'CUSTOMERS',
        reason: reason.trim() || undefined,
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const isSensitive = sensitive || resourceType === 'CUSTOMERS';

  return (
    <dialog ref={ref} onCancel={onClose} className="dialog compact">
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">Export Governance</p>
            <h2>Request Data Export</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        {error && <div className="alert error" role="alert">{error}</div>}
        <label>
          Resource to Export <span aria-hidden="true">*</span>
          <select value={resourceType} onChange={e => setResourceType(e.target.value)}>
            <option value="INVENTORY">Inventory & Listings (CSV)</option>
            <option value="AUDIT">Audit Event Logs (CSV)</option>
            <option value="EMPLOYEES">Employee Directory (CSV)</option>
            <option value="CUSTOMERS">Customer Records (PII - Sensitive)</option>
          </select>
        </label>
        <div style={{ margin: '1rem 0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isSensitive}
              disabled={resourceType === 'CUSTOMERS'}
              onChange={e => setSensitive(e.target.checked)}
              style={{ width: '1.1rem', minHeight: '1.1rem', margin: 0 }}
            />
            <span>Classify as Sensitive Export (contains customer/PII data)</span>
          </label>
        </div>
        {isSensitive && (
          <div className="alert" style={{ background: 'rgba(255,209,102,0.08)', borderColor: 'rgba(255,209,102,0.4)' }}>
            <strong>Maker-Checker Approval Required</strong>
            <small>Sensitive exports generate an approval request. An independent authorized administrator must approve this before the export file becomes downloadable.</small>
          </div>
        )}
        <label>
          Business & Compliance Reason {isSensitive && <span aria-hidden="true">*</span>}
          <textarea
            name="reason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            required={isSensitive}
            minLength={isSensitive ? 8 : undefined}
            maxLength={500}
            placeholder="Record the purpose and compliance justification for this export."
          />
        </label>
        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={busy || (isSensitive && reason.trim().length < 8)}>
            {busy ? 'Requesting…' : isSensitive ? 'Submit for Approval' : 'Generate Export'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function SupportPage({ user, actor }: { user: User; actor: AdminActor }) {
  const [tab, setTab] = useState<'cases' | 'privacy'>('cases');
  const [data, setData] = useState<SupportCasePage | null>(null);
  const [privacyData, setPrivacyData] = useState<PrivacyRequestPage | null>(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedCase, setSelectedCase] = useState<SupportCase | null>(null);
  const [selectedPrivacy, setSelectedPrivacy] = useState<PrivacyRequest | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setError('');
    if (tab === 'cases') {
      adminApi.supportCases(user, page, status || undefined, search.trim() || undefined)
        .then(setData)
        .catch(err => setError(errorMessage(err)));
    } else {
      adminApi.privacyRequests(user, page, status || undefined)
        .then(setPrivacyData)
        .catch(err => setError(errorMessage(err)));
    }
  }, [user, tab, page, status, search, reload]);

  return (
    <>
      <PageHeader
        eyebrow="Customer Care & Privacy"
        title="Support & Compliance"
        description="Customer issues and data privacy compliance within your authorized branch-city scope."
      />
      <div className="tab-row" role="tablist">
        <button className={`tab-button ${tab === 'cases' ? 'active' : ''}`} onClick={() => { setTab('cases'); setPage(1); setStatus(''); }} role="tab" aria-selected={tab === 'cases'}>
          Support Cases
        </button>
        <button className={`tab-button ${tab === 'privacy' ? 'active' : ''}`} onClick={() => { setTab('privacy'); setPage(1); setStatus(''); }} role="tab" aria-selected={tab === 'privacy'}>
          Privacy & Compliance Requests
        </button>
      </div>

      {tab === 'cases' && (
        <>
          <section className="panel filters">
            <label>
              Find case
              <input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Reference, subject, customer or email" maxLength={120} />
            </label>
            <label>
              Status
              <select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
                <option value="">All statuses</option>
                <option>OPEN</option>
                <option>IN_PROGRESS</option>
                <option>RESOLVED</option>
                <option>CLOSED</option>
              </select>
            </label>
          </section>
          {error ? (
            <ErrorState message={error} retry={() => setReload(v => v + 1)} />
          ) : !data ? (
            <TableSkeleton />
          ) : (
            <section className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h2>Case queue</h2>
                  <p>{data.total.toLocaleString()} authorized case{data.total === 1 ? '' : 's'}</p>
                </div>
              </div>
              {data.items.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Case</th>
                        <th>Customer</th>
                        <th>City</th>
                        <th>Updated</th>
                        <th>Status</th>
                        <th><span className="sr-only">Open</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map(item => (
                        <tr key={item.id}>
                          <td><strong>{item.subject}</strong><small>{item.referenceCode} · {humanize(item.category)}</small></td>
                          <td>{item.user.displayName || item.user.email}<small>{item.user.email}</small></td>
                          <td>{item.user.preferredCity || 'Not recorded'}</td>
                          <td><time>{new Date(item.updatedAt).toLocaleString()}</time></td>
                          <td><StatusBadge value={item.status} /></td>
                          <td><button className="text-button" onClick={() => setSelectedCase(item)}>Open</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No support cases" text="There are no cases in this filter and your authorized branch scope." />
              )}
              <Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
            </section>
          )}
          {selectedCase && (
            <SupportCaseDialog
              user={user}
              actor={actor}
              supportCase={selectedCase}
              onClose={() => setSelectedCase(null)}
              onDone={() => { setSelectedCase(null); setReload(v => v + 1); }}
            />
          )}
        </>
      )}

      {tab === 'privacy' && (
        <>
          <section className="panel filters">
            <label>
              Request Status
              <select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
                <option value="">All statuses</option>
                <option value="PENDING">Pending</option>
                <option value="PROCESSING">Processing</option>
                <option value="COMPLETED">Completed</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </label>
          </section>
          {error ? (
            <ErrorState message={error} retry={() => setReload(v => v + 1)} />
          ) : !privacyData ? (
            <TableSkeleton />
          ) : (
            <section className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h2>Privacy Requests</h2>
                  <p>{privacyData.total.toLocaleString()} customer request{privacyData.total === 1 ? '' : 's'}</p>
                </div>
              </div>
              {privacyData.items.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Request Type</th>
                        <th>Customer</th>
                        <th>Details</th>
                        <th>Resolution</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {privacyData.items.map(pr => (
                        <tr key={pr.id}>
                          <td><strong>{humanize(pr.requestType)}</strong></td>
                          <td>
                            <strong>{pr.user.displayName || pr.user.email}</strong>
                            <small>{pr.user.email} {pr.user.phone ? `· ${pr.user.phone}` : ''}</small>
                          </td>
                          <td>{pr.details || <small>Standard privacy request</small>}</td>
                          <td>{pr.resolution || <small>Awaiting resolution</small>}</td>
                          <td><StatusBadge value={pr.status} /></td>
                          <td><time>{new Date(pr.createdAt).toLocaleDateString()}</time></td>
                          <td>
                            <button className="text-button" onClick={() => setSelectedPrivacy(pr)}>
                              Update
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No privacy requests" text="No customer privacy or compliance requests match this status." />
              )}
              <Pagination page={privacyData.page} limit={privacyData.limit} total={privacyData.total} onPage={setPage} />
            </section>
          )}
          {selectedPrivacy && (
            <PrivacyRequestDialog
              user={user}
              request={selectedPrivacy}
              onClose={() => setSelectedPrivacy(null)}
              onDone={() => { setSelectedPrivacy(null); setReload(v => v + 1); }}
            />
          )}
        </>
      )}
    </>
  );
}

function PrivacyRequestDialog({ user, request, onClose, onDone }: { user: User; request: PrivacyRequest; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState(request.status);
  const [resolution, setResolution] = useState(request.resolution || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { ref.current?.showModal(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((status === 'COMPLETED' || status === 'REJECTED') && !resolution.trim()) {
      setError('Record a resolution note before completing or rejecting this privacy request.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await adminApi.updatePrivacyRequest(user, request.id, status, resolution || undefined);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onCancel={onClose} className="dialog support-dialog">
      <form onSubmit={submit} className="support-dialog-body">
        <header className="support-dialog-header">
          <div>
            <p className="eyebrow">{humanize(request.requestType)}</p>
            <h2>Customer Privacy Request</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>

        {error && <div className="alert error" role="alert">{error}</div>}

        <div className="support-case-card">
          <div className="support-case-header">
            <div>
              <strong>{request.user.displayName || request.user.email}</strong>
              <small>{request.user.email} {request.user.phone ? `· ${request.user.phone}` : ''}</small>
            </div>
            <StatusBadge value={request.status} />
          </div>
          {request.details && (
            <p className="support-case-body">{request.details}</p>
          )}
          <time className="support-case-time">Submitted {new Date(request.createdAt).toLocaleString()}</time>
        </div>

        <div className="support-action-box">
          <label>
            Request Status
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="PENDING">Pending</option>
              <option value="PROCESSING">Processing</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </label>
          <label>
            Resolution Note {(status === 'COMPLETED' || status === 'REJECTED') && <span aria-hidden="true">*</span>}
            <textarea
              name="resolution"
              value={resolution}
              onChange={e => setResolution(e.target.value)}
              maxLength={1000}
              required={status === 'COMPLETED' || status === 'REJECTED'}
              placeholder="Record the actions taken to satisfy or reject this privacy request."
            />
          </label>
        </div>

        <footer className="support-dialog-footer">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save Resolution'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function SupportCaseDialog({ user, actor, supportCase, onClose, onDone }: { user: User; actor: AdminActor; supportCase: SupportCase; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [caseStatus, setCaseStatus] = useState(supportCase.status);

  useEffect(() => { ref.current?.showModal(); }, []);

  async function changeStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      await adminApi.updateSupportCase(user, supportCase.id, caseStatus, String(form.get('note')) || undefined);
      onDone();
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      await adminApi.replySupportCase(user, supportCase.id, String(form.get('body')));
      onDone();
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onCancel={onClose} className="dialog support-dialog">
      <div className="support-dialog-body">
        <header className="support-dialog-header">
          <div>
            <p className="eyebrow">{supportCase.referenceCode}</p>
            <h2>{supportCase.subject}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close support case" onClick={onClose}>
            <Icon name="close"/>
          </button>
        </header>

        {error && <div className="alert error" role="alert">{error}</div>}

        <div className="support-case-card">
          <div className="support-case-header">
            <div>
              <strong>{supportCase.user.displayName || supportCase.user.email}</strong>
              <small>{supportCase.user.email} {supportCase.user.preferredCity ? `· ${supportCase.user.preferredCity}` : ''}</small>
            </div>
            <span className="case-category-pill">{humanize(supportCase.category)}</span>
          </div>
          <p className="support-case-body">{supportCase.description}</p>
          <time className="support-case-time">Submitted {new Date(supportCase.createdAt).toLocaleString()}</time>
        </div>

        <section className="support-thread">
          <h3 className="support-thread-title">
            <span>Conversation Thread</span>
            <span className="thread-count">{supportCase.replies.length} {supportCase.replies.length === 1 ? 'message' : 'messages'}</span>
          </h3>
          {supportCase.replies.length === 0 ? (
            <div className="support-thread-empty">
              <p>No messages exchanged yet.</p>
            </div>
          ) : (
            <div className="support-messages-list">
              {supportCase.replies.map(r => {
                const isCustomer = r.authorType === 'CUSTOMER';
                return (
                  <div key={r.id} className={`support-message-item ${isCustomer ? 'customer-message' : 'staff-message'}`}>
                    <div className="support-message-meta">
                      <span className="author-tag">{isCustomer ? 'Customer' : 'Support Team'}</span>
                      <time className="message-time">{new Date(r.createdAt).toLocaleString()}</time>
                    </div>
                    <div className="support-message-bubble">
                      <p>{r.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {actor.permissions.includes('support.respond') && (
          <form onSubmit={reply} className="support-action-box">
            <label>
              Reply to customer
              <textarea
                name="body"
                minLength={1}
                maxLength={2000}
                required
                placeholder="Write a clear customer-facing response."
              />
            </label>
            <div className="form-actions">
              <button className="button primary" disabled={busy}>
                {busy ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          </form>
        )}

        {actor.permissions.includes('support.escalate') && (
          <form onSubmit={changeStatus} className="support-action-box">
            <label>
              Case status
              <select value={caseStatus} onChange={event => setCaseStatus(event.target.value)}>
                <option>OPEN</option>
                <option>IN_PROGRESS</option>
                <option>RESOLVED</option>
                <option>CLOSED</option>
              </select>
            </label>
            <label>
              Internal note
              <textarea
                name="note"
                maxLength={2000}
                placeholder="Optional; never shown to the customer."
              />
            </label>
            <div className="form-actions">
              <button className="button secondary" disabled={busy || caseStatus === supportCase.status}>
                Save status
              </button>
            </div>
          </form>
        )}

        <footer className="support-dialog-footer">
          <button type="button" className="button secondary" onClick={onClose}>Close</button>
        </footer>
      </div>
    </dialog>
  );
}


function ApprovalsPage({ user, actor }: { user: User; actor: AdminActor }) {
  const [data, setData] = useState<ApprovalPage | null>(null); const [error, setError] = useState(''); const [page, setPage] = useState(1); const [status, setStatus] = useState('PENDING'); const [selected, setSelected] = useState<Approval | null>(null); const [reload, setReload] = useState(0);
  useEffect(() => { setError(''); adminApi.approvals(user, page, status || undefined).then(setData).catch(error => setError(errorMessage(error))); }, [user, page, status, reload]);
  return <><PageHeader eyebrow="Independent review" title="Approval Centre" description="Privileged access changes are proposed by a maker and executed once only after an eligible independent decision."/><section className="panel filters" aria-label="Approval filters"><label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option>PENDING</option><option>APPROVED</option><option>REJECTED</option><option>EXPIRED</option><option>STALE</option></select></label></section>{error ? <ErrorState message={error} retry={() => setReload(value => value + 1)}/> : !data ? <TableSkeleton/> : <section className="panel table-panel"><div className="panel-heading"><div><h2>Approval inbox</h2><p>{data.total.toLocaleString()} visible request{data.total === 1 ? '' : 's'}</p></div></div>{data.items.length ? <div className="table-scroll"><table><thead><tr><th>Request</th><th>Requester</th><th>Created</th><th>Status</th><th><span className="sr-only">Review</span></th></tr></thead><tbody>{data.items.map(item => <tr key={item.id}><td><strong>{humanize(item.requestType)}</strong><span>{item.payload.vehicleTitle ? `${item.payload.vehicleTitle} (₹${(Number(item.payload.requestedDiscountPaise || item.payload.recommendedPurchasePaise || 0) / 100).toLocaleString('en-IN')})` : (item.payload.fullName || item.payload.email || item.id)}</span></td><td>{item.requester.user.displayName || item.requester.user.email}<small>{item.requester.user.email}</small></td><td><time>{new Date(item.createdAt).toLocaleString()}</time><small>Expires {new Date(item.expiresAt).toLocaleString()}</small></td><td><StatusBadge value={item.status}/></td><td><button className="text-button" onClick={() => setSelected(item)}>{actor.permissions.includes('approval.decide') && item.status === 'PENDING' ? 'Review' : 'View'}</button></td></tr>)}</tbody></table></div> : <EmptyState title="No approval requests" text="There are no requests in this filter and within your branch scope."/>}<Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage}/></section>}{selected && <ApprovalDialog user={user} actor={actor} approval={selected} onClose={() => setSelected(null)} onDone={() => { setSelected(null); setReload(value => value + 1); }}/>}</>;
}

function ApprovalDialog({ user, actor, approval, onClose, onDone }: { user: User; actor: AdminActor; approval: Approval; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isRequester = approval.requester.user.email === actor.email;
  const isSuperAdmin = actor.roles.includes('SUPER_ADMIN');
  const canDecide = actor.permissions.includes('approval.decide') && approval.status === 'PENDING' && (!isRequester || isSuperAdmin);

  useEffect(() => { ref.current?.showModal(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      await adminApi.decideApproval(user, approval.id, { version: approval.version, decision, reason: String(form.get('reason')) });
      onDone();
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onCancel={onClose} className="dialog compact">
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">Maker-checker decision</p>
            <h2>{humanize(approval.requestType)}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close approval review" onClick={onClose}>
            <Icon name="close"/>
          </button>
        </header>
        {error && <div className="alert error" role="alert">{error}</div>}
        <dl className="review-list">
          <div>
            <dt>Requester</dt>
            <dd>{approval.requester.user.displayName || approval.requester.user.email}<small>{approval.requester.user.email}</small></dd>
          </div>
          {approval.requestType === 'OFFER_REQUEST' || approval.requestType === 'ACQUISITION_VALUATION' ? (
            <>
              <div>
                <dt>Vehicle & Opportunity</dt>
                <dd>{String(approval.payload.vehicleTitle || 'Vehicle')}<small>Ref: {String(approval.payload.referenceCode || 'N/A')} · {String(approval.payload.city || 'Hub')}</small></dd>
              </div>
              <div>
                <dt>Seller Details</dt>
                <dd>{String(approval.payload.sellerName || 'Seller')}<small>{String(approval.payload.sellerPhone || 'No phone')}</small></dd>
              </div>
              <div>
                <dt>Proposed Purchase Price</dt>
                <dd style={{ color: 'var(--color-primary, #f7b503)', fontWeight: 700, fontSize: '1.1rem' }}>
                  ₹{(Number(approval.payload.recommendedPurchasePaise || 0) / 100).toLocaleString('en-IN')}
                </dd>
              </div>
              <div>
                <dt>Seller Ask / Expected Value</dt>
                <dd style={{ fontWeight: 600 }}>
                  ₹{(Number(approval.payload.expectedResalePaise || 0) / 100).toLocaleString('en-IN')}
                </dd>
              </div>
            </>
          ) : approval.requestType === 'DISCOUNT_REQUEST' ? (
            <>
              <div>
                <dt>Vehicle</dt>
                <dd>{approval.payload.vehicleTitle || 'Vehicle'}</dd>
              </div>
              <div>
                <dt>Customer</dt>
                <dd>{approval.payload.customerName || approval.payload.customerEmail || 'Customer'}<small>{[approval.payload.customerEmail, approval.payload.customerPhone].filter(Boolean).join(' · ')}</small></dd>
              </div>
              <div>
                <dt>Requested Discount</dt>
                <dd style={{ color: 'var(--color-primary, #f7b503)', fontWeight: 700 }}>
                  ₹{(Number(approval.payload.requestedDiscountPaise || 0) / 100).toLocaleString('en-IN')}
                </dd>
              </div>
              <div>
                <dt>Proposed Final Price</dt>
                <dd style={{ fontWeight: 700 }}>
                  ₹{(Number(approval.payload.proposedPrice || 0) / 100).toLocaleString('en-IN')}
                </dd>
              </div>
            </>
          ) : (
            <div>
              <dt>Employee</dt>
              <dd>{approval.payload.fullName || 'Not supplied'}<small>{approval.payload.email}</small></dd>
            </div>
          )}
          <div>
            <dt>Business reason</dt>
            <dd>{approval.payload.reason || 'No reason recorded'}</dd>
          </div>
          <div>
            <dt>Requested at</dt>
            <dd>{new Date(approval.createdAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Expires at</dt>
            <dd>{new Date(approval.expiresAt).toLocaleString()}</dd>
          </div>
        </dl>
        {isRequester && isSuperAdmin && !approval.decision && (
          <div className="alert">
            <strong>Platform Owner Authority</strong>
            <span>You proposed this request. As Super Administrator, you may independently authorize and execute this decision.</span>
          </div>
        )}
        {isRequester && !isSuperAdmin && !approval.decision && (
          <div className="alert">
            <strong>Dual-Control Policy</strong>
            <span>You proposed this request. Another authorized administrator must independently review and decide it.</span>
          </div>
        )}
        {approval.decision ? (
          <div className="alert">
            <strong>{humanize(approval.decision.decision)}</strong>
            <span>{approval.decision.reason}</span>
            <small>{approval.decision.actor.user.displayName || approval.decision.actor.user.email} · {new Date(approval.decision.createdAt).toLocaleString()}</small>
          </div>
        ) : canDecide ? (
          <>
            <fieldset>
              <legend>Decision</legend>
              <div className="decision-row">
                <label>
                  <input type="radio" checked={decision === 'APPROVE'} onChange={() => setDecision('APPROVE')}/> Approve and execute once
                </label>
                <label>
                  <input type="radio" checked={decision === 'REJECT'} onChange={() => setDecision('REJECT')}/> Reject request
                </label>
              </div>
            </fieldset>
            <label>
              Decision reason <span aria-hidden="true">*</span>
              <textarea name="reason" minLength={8} maxLength={500} required placeholder="Record the review and authorization basis."/>
            </label>
          </>
        ) : (
          <p className="helper">This request is read-only for your current permissions or dual-control state.</p>
        )}
        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Close</button>
          {canDecide && (
            <button className={`button ${decision === 'APPROVE' ? 'primary' : 'danger'}`} disabled={busy}>
              {busy ? 'Recording decision…' : decision === 'APPROVE' ? 'Approve and execute' : 'Reject request'}
            </button>
          )}
        </footer>
      </form>
    </dialog>
  );
}

function AuditPageView({ user }: { user: User }) { const [data, setData] = useState<AuditPage | null>(null); const [error, setError] = useState(''); const [page, setPage] = useState(1); useEffect(() => { adminApi.audit(user, page).then(setData).catch(error => setError(errorMessage(error))); }, [user, page]); return <><PageHeader eyebrow="Append-only history" title="Audit" description="Authorization-filtered security and governance events. Audit records cannot be edited from this portal."/>{error ? <ErrorState message={error}/> : !data ? <TableSkeleton/> : <section className="panel table-panel">{data.items.length ? <div className="table-scroll"><table><thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Outcome</th></tr></thead><tbody>{data.items.map(event => <tr key={event.id}><td><time>{new Date(event.createdAt).toLocaleString()}</time></td><td><strong>{humanize(event.action)}</strong></td><td><span>{event.entityType}</span><small>{event.entityId}</small></td><td><StatusBadge value={event.outcome}/></td></tr>)}</tbody></table></div> : <EmptyState title="No audit events" text="No events are visible within your authorized scope."/>}<Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage}/></section>}</>; }
function SystemHealthPanel({ user }: { user: User }) { const [data, setData] = useState<SystemHealth | null>(null); const [error, setError] = useState(''); useEffect(() => { adminApi.systemHealth(user).then(setData).catch(error => setError(errorMessage(error))); }, [user]); return <section className="panel"><div className="panel-heading"><div><h2>System health</h2><p>Safe operational diagnostics; no credentials or recipient data.</p></div></div>{error ? <ErrorState message={error}/> : !data ? <TableSkeleton/> : <><ul className="event-list">{data.services.map(service => <li key={service.key}><div><strong>{humanize(service.key)}</strong><span>{service.detail}</span></div><StatusBadge value={service.status}/></li>)}</ul><p className="helper">Outbox: {Object.entries(data.emailOutbox).map(([state, count]) => `${humanize(state)} ${count}`).join(' · ') || 'No queued messages'}</p></>}</section>; }
function RentalKmPolicyPanel({ user, actor }: { user: User; actor: AdminActor }) {
  const [hubs, setHubs] = useState<RentalKmPolicy[] | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, { km: string; rate: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const canManage = actor.permissions.includes('branch.manage');

  useEffect(() => {
    adminApi.rentalKmPolicies(user)
      .then(items => {
        setHubs(items);
        setDrafts(Object.fromEntries(items.map(hub => [hub.id, {
          km: hub.includedKmPerDay === null ? '' : String(hub.includedKmPerDay),
          rate: hub.extraKmRatePaise === null ? '' : String(Number(hub.extraKmRatePaise) / 100),
        }])));
      })
      .catch(err => setError(errorMessage(err)));
  }, [user, reload]);

  async function save(hub: RentalKmPolicy, clear: boolean) {
    const draft = drafts[hub.id] ?? { km: '', rate: '' };
    const km = clear || draft.km.trim() === '' ? null : Number(draft.km);
    const rateRupees = clear || draft.rate.trim() === '' ? null : Number(draft.rate);
    if (km !== null && (!Number.isInteger(km) || km < 1 || km > 1000)) { setError('Free km per day must be a whole number between 1 and 1000.'); return; }
    if (rateRupees !== null && (!(rateRupees >= 1) || rateRupees > 1000)) { setError('Excess km charge must be between ₹1 and ₹1,000 per km.'); return; }
    setSavingId(hub.id);
    setError('');
    setMessage('');
    try {
      const result = await adminApi.updateRentalKmPolicy(user, hub.id, {
        includedKmPerDay: km,
        extraKmRatePaise: rateRupees === null ? null : Math.round(rateRupees * 100),
      });
      setMessage(`${hub.name}: saved. ${result.note}`);
      setReload(value => value + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingId(null);
    }
  }

  return <section className="panel table-panel" aria-label="Rental kilometre policy">
    <div className="panel-heading"><div><h2>Rental kilometre policy by hub</h2><p>Free kilometres per day and the charge per extra kilometre. Customers see these in the app, and quotes and return settlement use them. Existing bookings keep the terms they were booked with.</p></div></div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {message && <div className="alert success" role="status">{message}</div>}
    {!hubs ? <TableSkeleton/> : hubs.length === 0 ? <EmptyState title="No rental hubs" text="Enable rentals on a branch to set its kilometre policy."/> :
      <div className="table-scroll"><table><thead><tr><th>Hub</th><th>Cars</th><th>Free km per day</th><th>Excess km charge (₹/km)</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {hubs.map(hub => {
          const draft = drafts[hub.id] ?? { km: '', rate: '' };
          const usingHub = hub.includedKmPerDay !== null || hub.extraKmRatePaise !== null;
          return <tr key={hub.id}>
            <td><strong>{hub.name}</strong><span>{hub.city} · {hub.code}</span>{!usingHub && <small>Not set: cars use their own values</small>}</td>
            <td>{hub.vehicleCount}</td>
            <td><input type="number" min={1} max={1000} step={1} inputMode="numeric" aria-label={`Free km per day for ${hub.name}`} value={draft.km} placeholder="e.g. 250" disabled={!canManage} onChange={event => setDrafts(current => ({ ...current, [hub.id]: { ...draft, km: event.target.value } }))}/></td>
            <td><input type="number" min={1} max={1000} step="0.5" inputMode="decimal" aria-label={`Excess km charge for ${hub.name}`} value={draft.rate} placeholder="e.g. 12" disabled={!canManage} onChange={event => setDrafts(current => ({ ...current, [hub.id]: { ...draft, rate: event.target.value } }))}/></td>
            <td>{canManage && <><button className="button primary" disabled={savingId === hub.id} onClick={() => save(hub, false)}>{savingId === hub.id ? 'Saving…' : 'Save'}</button>{usingHub && <button className="text-button" disabled={savingId === hub.id} onClick={() => save(hub, true)}>Clear (use car values)</button>}</>}</td>
          </tr>;
        })}
      </tbody></table></div>}
  </section>;
}

function PoliciesPanel({ user, actor }: { user: User; actor: AdminActor }) {
  const [items, setItems] = useState<PolicyVersion[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyVersion | null>(null);
  const [editTarget, setEditTarget] = useState<PolicyVersion | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    adminApi.policies(user)
      .then(setItems)
      .catch(error => setError(errorMessage(error)));
  }, [user, reload]);

  const canPropose = actor.permissions.includes('policy.propose');

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Policy versions</h2>
          <p>Versioned governance records and pricing engine parameters. Click any policy to view, edit, or retire.</p>
        </div>
        {canPropose && (
          <button className="button primary" onClick={() => setOpen(true)}>
            Propose policy
          </button>
        )}
      </div>
      {error ? (
        <ErrorState message={error} retry={() => setReload(value => value + 1)}/>
      ) : !items ? (
        <TableSkeleton/>
      ) : items.length ? (
        <ul className="event-list">
          {items.map(policy => (
            <li
              key={policy.id}
              onClick={() => setSelectedPolicy(policy)}
              style={{ cursor: 'pointer', transition: 'background 0.15s ease' }}
              title="Click to view complete policy rules and management actions"
            >
              <div>
                <strong>{policy.title} · v{policy.version}</strong>
                <span>{policy.key} · {policy.createdBy?.displayName || policy.createdBy?.email}</span>
                {policy.reason && <small style={{ color: '#94a3b8' }}>Reason: {policy.reason}</small>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <StatusBadge value={policy.status}/>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>View details →</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No policy versions" text="Propose the first policy version for independent approval."/>
      )}
      {open && (
        <PolicyProposalDialog
          user={user}
          onClose={() => setOpen(false)}
          onDone={() => { setOpen(false); setReload(value => value + 1); }}
        />
      )}
      {selectedPolicy && (
        <ViewPolicyDialog
          user={user}
          actor={actor}
          policy={selectedPolicy}
          onClose={() => setSelectedPolicy(null)}
          onEdit={() => {
            setEditTarget(selectedPolicy);
            setSelectedPolicy(null);
          }}
          onDone={() => {
            setSelectedPolicy(null);
            setReload(value => value + 1);
          }}
        />
      )}
      {editTarget && (
        <EditPolicyDialog
          user={user}
          policy={editTarget}
          onClose={() => setEditTarget(null)}
          onDone={() => {
            setEditTarget(null);
            setReload(value => value + 1);
          }}
        />
      )}
    </section>
  );
}

const policyTemplates = {
  'ACQUISITION_PRICING_POLICY': {
    label: 'Used-car acquisition & pricing engine policy',
    title: 'V MOTIV Standard Pre-Owned Acquisition Pricing Policy',
    description: 'Economic parameters for customer estimates, refurbishment buffers, holding costs, logistics allowances, and target contribution.',
    content: {
      summary: 'Pre-owned vehicle acquisition economic valuation policy.',
      targetMarginPercent: 10,
      targetDaysToTurn: 35,
      logisticsPaise: 120000,
      riskAllowancePercent: 2.0,
      mechanicalRefurbBufferPaise: 500000,
      requiresIndependentApproval: true,
      appliesTo: ['used-car-acquisition', 'post-inspection-valuation']
    },
  },
  'quotation-discount': {
    label: 'Quotation discount controls',
    title: 'Quotation Discount Policy',
    description: 'Requires an independent approval before a retail quotation receives a discount.',
    content: { summary: 'Retail quotation discount controls.', maximumDiscountPercent: 5, maximumDiscountRupees: 50000, requiresApproval: true, approvalPermission: 'commercial.discount.approve', appliesTo: ['retail-quotation'] },
  },
  'test-drive-service': {
    label: 'Test-drive service standard',
    title: 'Test Drive Service Standard',
    description: 'Sets the service expectation for customer test-drive requests.',
    content: { summary: 'Test-drive service standard.', confirmationTargetHours: 4, cancellationWindowHours: 2, appliesTo: ['test-drive'] },
  },
  'customer-communication': {
    label: 'Customer communications',
    title: 'Customer Communication Standard',
    description: 'Defines approved customer-update expectations and ownership.',
    content: { summary: 'Customer communication standard.', requiresApprovedTemplate: true, responseTargetHours: 24, appliesTo: ['email', 'support-case'] },
  },
} as const;

type PolicyTemplateKey = keyof typeof policyTemplates;

function ViewPolicyDialog({
  user,
  actor,
  policy,
  onClose,
  onEdit,
  onDone,
}: {
  user: User;
  actor: AdminActor;
  policy: PolicyVersion;
  onClose: () => void;
  onEdit: () => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { ref.current?.showModal(); }, []);

  const canApprove = actor.permissions.includes('policy.approve');
  const canPropose = actor.permissions.includes('policy.propose');

  const handleApprove = async () => {
    if (!policy.approvalRequestId) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.decideApproval(user, policy.approvalRequestId, {
        version: policy.version,
        decision: 'APPROVE',
        reason: 'Authorized and approved by policy administration.',
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!policy.approvalRequestId) return;
    const reason = prompt('Reason for rejecting proposed policy revision:');
    if (!reason) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.decideApproval(user, policy.approvalRequestId, {
        version: policy.version,
        decision: 'REJECT',
        reason,
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const handleRetire = async () => {
    if (!confirm(`Are you sure you want to retire / delete policy "${policy.title}"?`)) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.deletePolicy(user, policy.id);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} onCancel={onClose} className="dialog">
      <header>
        <div>
          <p className="eyebrow">Governance Policy Details</p>
          <h2>{policy.title} · v{policy.version}</h2>
        </div>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><Icon name="close"/></button>
      </header>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
        <StatusBadge value={policy.status}/>
        <code style={{ fontSize: '0.85rem', padding: '2px 8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px' }}>
          {policy.key}
        </code>
        <span style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginLeft: 'auto' }}>
          Created {new Date(policy.createdAt).toLocaleDateString()} by {policy.createdBy?.displayName || policy.createdBy?.email}
        </span>
      </div>

      {policy.reason && (
        <div style={{ padding: '10px 12px', background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '6px', marginBottom: '14px', fontSize: '0.875rem' }}>
          <strong>Proposal Rationale:</strong> {policy.reason}
        </div>
      )}

      <label>
        Policy Rules & Economics Parameters (JSON)
        <pre style={{
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          padding: '12px',
          maxHeight: '280px',
          overflow: 'auto',
          fontSize: '0.8125rem',
          fontFamily: 'monospace',
          color: '#38bdf8',
          margin: '6px 0 0 0',
        }}>
          {JSON.stringify(policy.content || {}, null, 2)}
        </pre>
      </label>

      <footer>
        {policy.status === 'PROPOSED' && canApprove && (
          <div style={{ display: 'flex', gap: '8px', marginRight: 'auto' }}>
            <button type="button" className="button primary" onClick={handleApprove} disabled={busy}>
              {busy ? 'Approving…' : '✓ Approve Policy'}
            </button>
            <button type="button" className="button secondary" style={{ color: '#ef4444' }} onClick={handleReject} disabled={busy}>
              ✕ Reject
            </button>
          </div>
        )}
        {policy.status !== 'RETIRED' && canPropose && (
          <button type="button" className="button secondary" onClick={onEdit} style={{ marginRight: 'auto' }}>
            Edit Policy
          </button>
        )}
        {policy.status !== 'RETIRED' && canPropose && (
          <button type="button" className="button secondary" style={{ color: '#ef4444' }} onClick={handleRetire} disabled={busy}>
            {policy.status === 'PROPOSED' ? 'Cancel / Delete' : 'Retire / Delete'}
          </button>
        )}
        <button type="button" className="button secondary" onClick={onClose}>Close</button>
      </footer>
    </dialog>
  );
}

function EditPolicyDialog({
  user,
  policy,
  onClose,
  onDone,
}: {
  user: User;
  policy: PolicyVersion;
  onClose: () => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(policy.title);
  const [contentStr, setContentStr] = useState(() => JSON.stringify(policy.content || {}, null, 2));

  useEffect(() => { ref.current?.showModal(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const parsedContent = JSON.parse(contentStr);
      if (!parsedContent || typeof parsedContent !== 'object' || Array.isArray(parsedContent)) {
        throw new Error('Policy rules must be a valid JSON object.');
      }
      await adminApi.updatePolicy(user, policy.id, {
        title: title.trim(),
        content: parsedContent,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onCancel={onClose} className="dialog compact">
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">Governance Policy Update</p>
            <h2>Edit Policy: {policy.key}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><Icon name="close"/></button>
        </header>
        {error && <div className="alert error" role="alert">{error}</div>}
        <label>
          Policy Title <span aria-hidden="true">*</span>
          <input value={title} onChange={e => setTitle(e.target.value)} required minLength={3} maxLength={160}/>
        </label>
        <label>
          Policy Rules & Parameters (JSON) <span aria-hidden="true">*</span>
          <textarea
            value={contentStr}
            onChange={e => setContentStr(e.target.value)}
            required
            rows={10}
            style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
          />
        </label>
        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={busy}>{busy ? 'Saving Changes…' : 'Save Changes'}</button>
        </footer>
      </form>
    </dialog>
  );
}

function PolicyProposalDialog({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [templateKey, setTemplateKey] = useState<PolicyTemplateKey>('quotation-discount');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const template = policyTemplates[templateKey];

  useEffect(() => { ref.current?.showModal(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const content = JSON.parse(String(form.get('content')));
      if (!content || Array.isArray(content) || typeof content !== 'object') throw new Error('Policy rules must be a JSON object.');
      const effectiveAt = String(form.get('effectiveAt') || '');
      await adminApi.proposePolicy(user, {
        key: templateKey,
        title: String(form.get('title')).trim(),
        content,
        effectiveAt: effectiveAt ? new Date(effectiveAt).toISOString() : undefined,
        reason: String(form.get('reason')).trim(),
      });
      onDone();
    } catch (error) {
      setError(error instanceof Error ? error.message : errorMessage(error));
      setBusy(false);
    }
  }

  return <dialog ref={ref} onCancel={onClose} className="dialog compact"><form onSubmit={submit}>
    <header><div><p className="eyebrow">Governance change</p><h2>Propose policy version</h2></div><button type="button" className="icon-button" aria-label="Close policy form" onClick={onClose}><Icon name="close"/></button></header>
    {error && <div className="alert error" role="alert">{error}</div>}
    <label>What do you want to govern? <span aria-hidden="true">*</span>
      <select value={templateKey} onChange={event => setTemplateKey(event.target.value as PolicyTemplateKey)}>{Object.entries(policyTemplates).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select>
    </label>
    <p className="helper">{template.description} The system key is set automatically: <strong>{templateKey}</strong>.</p>
    <label>Policy title <span aria-hidden="true">*</span><input name="title" required minLength={3} maxLength={160} defaultValue={template.title} key={templateKey}/></label>
    <label>Policy rules <span aria-hidden="true">*</span><textarea name="content" required key={templateKey} defaultValue={JSON.stringify(template.content, null, 2)}/></label>
    <p className="helper">The rules are prefilled. You only need to change a number if your approved business rule differs; do not remove the approval requirement for quotation discounts.</p>
    <label>Effective at (optional)<input name="effectiveAt" type="datetime-local"/></label>
    <label>Reason for change <span aria-hidden="true">*</span><textarea name="reason" required minLength={8} maxLength={500} placeholder="Why is this policy required now?"/></label>
    <footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit for approval'}</button></footer>
  </form></dialog>;
}
function StatusBadge({ value }: { value: string }) { const tone = ['ACTIVE', 'COMPLIANT', 'SUCCEEDED', 'ACCEPTED'].includes(value) ? 'success' : ['SUSPENDED', 'REQUIRED', 'PENDING'].includes(value) ? 'warning' : ['DEACTIVATED', 'FAILED', 'RECOVERY_REQUIRED'].includes(value) ? 'danger' : 'neutral'; return <span className={`status ${tone}`}><span aria-hidden="true"/>{humanize(value)}</span>; }
function Pagination({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (page: number) => void }) { const pages = Math.max(1, Math.ceil(total / limit)); return <div className="pagination"><span>Page {page} of {pages}</span><div><button className="button secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button><button className="button secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button></div></div>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="empty-state"><strong>{title}</strong><p>{text}</p></div>; }
function ErrorState({ message, retry }: { message: string; retry?: () => void }) { return <div className="alert error page-error" role="alert"><strong>Unable to load this view</strong><span>{message}</span>{retry && <button className="button secondary" onClick={retry}>Try again</button>}</div>; }
function SkeletonCards() { return <div className="metric-grid" aria-label="Loading" aria-busy="true">{[1, 2, 3, 4].map(item => <div className="skeleton card" key={item}/>)}</div>; }
function TableSkeleton() { return <div className="panel" aria-label="Loading" aria-busy="true"><div className="skeleton line"/><div className="skeleton row"/><div className="skeleton row"/><div className="skeleton row"/></div>; }
function NotFound() { return <div className="empty-state page-empty"><strong>Page not found</strong><p>The requested Admin route does not exist or is not enabled.</p><button className="button primary" onClick={() => navigate('/')}>Return to overview</button></div>; }
function humanize(value?: string | null): string {
  if (!value) return '';
  return String(value).toLowerCase().replace(/[._-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}
