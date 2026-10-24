import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  getMultiFactorResolver,
  multiFactor,
  onAuthStateChanged,
  signInWithPopup,
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
import { auth, firebaseConfigured } from './firebase.js';
import type { AdminActor, Approval, ApprovalPage, AuditPage, Branch, Dashboard, EmployeePage, ManagedBranch, Role, ServiceArea, SupportCase, SupportCasePage, SystemHealth, PolicyVersion } from './types.js';

type Route = '/' | '/employees' | '/access' | '/branches' | '/approvals' | '/support' | '/audit' | '/accept-invitation' | '/not-found';
const iconPaths: Record<string, ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  employees: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  access: <><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
  branches: <><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/><path d="M9 10h.01M15 10h.01"/></>,
  approvals: <><path d="M12 3 4 7v5c0 5 3.4 8.74 8 10 4.6-1.26 8-5 8-10V7l-8-4Z"/><path d="m9 12 2 2 4-4"/></>,
  support: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 4.7-7.6A8.38 8.38 0 0 1 12.5 3h.5a8.48 8.48 0 0 1 8 8v.5Z"/></>,
  audit: <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  close: <><path d="M18 6 6 18M6 6l12 12"/></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></>,
  refresh: <><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
};
function Icon({ name }: { name: keyof typeof iconPaths }) { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>; }

function currentRoute(): Route {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return ['/', '/employees', '/access', '/branches', '/approvals', '/support', '/audit', '/accept-invitation'].includes(path) ? path as Route : '/not-found';
}
function navigate(path: Route) { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }
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
  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    return onAuthStateChanged(auth, next => { setUser(next); if (!next) { setActor(null); setLoading(false); } });
  }, []);
  useEffect(() => {
    if (!user) return;
    if (route === '/accept-invitation') { setLoading(false); return; }
    setLoading(true); setError('');
    adminApi.me(user)
      .then(setActor)
      .catch(error => {
        setActor(null);
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
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error: any) {
      if (error?.code === 'auth/multi-factor-auth-required') {
        const resolver = getMultiFactorResolver(auth, error);
        setMfaResolver(resolver);
        setLoading(false);
        return;
      }
      setError(error instanceof Error ? error.message : 'Google Sign-In failed.');
      setLoading(false);
    }
  }
  async function logout() {
    if (auth) await signOut(auth);
    setMfaResolver(null);
    setEnrollMfaOpen(false);
    navigate('/');
  }

  if (!firebaseConfigured) return <SetupState />;
  if (loading) return <FullLoader />;
  if (route === '/accept-invitation') return <InvitationAcceptance user={user} onSignIn={googleSignIn} />;
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
      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
        });
      }
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
      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
        });
      }
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

function InvitationAcceptance({ user, onSignIn }: { user: User | null; onSignIn: () => void }) {
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle'); const [error, setError] = useState('');
  const token = new URLSearchParams(window.location.search).get('token') || '';
  async function accept() {
    if (!user || !token) return;
    setState('working'); setError('');
    try { await adminApi.acceptInvitation(user, token); setState('done'); window.history.replaceState({}, '', '/'); }
    catch (error) { setState('idle'); setError(errorMessage(error)); }
  }
  return <main className="center-state"><img className="state-logo" src="/brand/vmotiv-logo.svg" alt="V MOTIV"/><p className="eyebrow">Employee onboarding</p><h1>{state === 'done' ? 'Invitation accepted' : 'Accept your V MOTIV invitation'}</h1>{!token ? <div className="alert error" role="alert">This invitation link is incomplete.</div> : state === 'done' ? <><p>Your approved role and branch scope are now active. Portal access remains subject to its permissions and MFA policy.</p><button className="button primary" onClick={() => navigate('/')}>Continue</button></> : <><p>{user ? `Signed in as ${user.email}. The invitation will only work when this exactly matches the approved work email.` : 'Sign in with the exact Google work email that received this invitation.'}</p><button className="button primary" disabled={state === 'working'} onClick={user ? accept : onSignIn}>{state === 'working' ? 'Activating…' : user ? 'Accept invitation' : 'Continue with Google'}</button>{error && <div className="alert error" role="alert">{error}</div>}</>}</main>;
}

const navItems = [
  { path: '/' as Route, label: 'Overview', icon: 'overview' as const, permission: 'admin.portal.access' },
  { path: '/employees' as Route, label: 'Employees', icon: 'employees' as const, permission: 'employee.read' },
  { path: '/access' as Route, label: 'Access Control', icon: 'access' as const, permission: 'role.read' },
  { path: '/branches' as Route, label: 'Branches', icon: 'branches' as const, permission: 'branch.read' },
  { path: '/approvals' as Route, label: 'Approval Centre', icon: 'approvals' as const, permission: 'approval.read' },
  { path: '/support' as Route, label: 'Support', icon: 'support' as const, permission: 'support.read' },
  { path: '/audit' as Route, label: 'Audit', icon: 'audit' as const, permission: 'audit.read' },
];
function Shell({ actor, user, route, onLogout }: { actor: AdminActor; user: User; route: Route; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const nav = navItems.filter(item => actor.permissions.includes(item.permission));
  const title = nav.find(item => item.path === route)?.label || 'Not found';
  function go(path: Route) { navigate(path); setOpen(false); }
  return <div className="app-shell"><a className="skip-link" href="#main">Skip to main content</a><aside className={`sidebar ${open ? 'open' : ''}`}><div className="brand"><img src="/brand/vmotiv-logo.svg" alt="V MOTIV"/><span>Admin</span></div><nav aria-label="Primary navigation">{nav.map(item => <button key={item.path} className={route === item.path ? 'active' : ''} aria-current={route === item.path ? 'page' : undefined} onClick={() => go(item.path)}><Icon name={item.icon}/><span>{item.label}</span></button>)}</nav><div className="sidebar-account"><span>{actor.displayName || actor.email}</span><small>{actor.employeeCode || 'Employee'}</small><button onClick={onLogout}><Icon name="logout"/>Sign out</button></div></aside>{open && <button className="scrim" aria-label="Close navigation" onClick={() => setOpen(false)}/>}<div className="app-main"><header className="topbar"><button className="icon-button mobile-menu" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'close' : 'menu'}/></button><div><span className="breadcrumb">V MOTIV Admin /</span><strong>{title}</strong></div><div className="identity"><span>{user.email}</span><span className="mfa-badge">MFA verified</span></div></header><main id="main" tabIndex={-1}>{route === '/' && <><OverviewPage user={user}/>{actor.permissions.includes('system.health.read') && <SystemHealthPanel user={user}/>}</>} {route === '/employees' && <EmployeesPage user={user} actor={actor}/>} {route === '/access' && <AccessPage user={user}/>} {route === '/branches' && <BranchesPage user={user} actor={actor}/>} {route === '/approvals' && <ApprovalsPage user={user} actor={actor}/>} {route === '/support' && <SupportPage user={user} actor={actor}/>} {route === '/audit' && <AuditPageView user={user}/>} {route === '/not-found' && <NotFound/>}</main></div></div>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
function OverviewPage({ user }: { user: User }) {
  const [data, setData] = useState<Dashboard | null>(null); const [error, setError] = useState(''); const [refresh, setRefresh] = useState(0);
  useEffect(() => { setError(''); adminApi.dashboard(user).then(setData).catch(error => setError(errorMessage(error))); }, [user, refresh]);
  return <><PageHeader eyebrow="Live governance" title="Overview" description="Permission-filtered administrative state from the shared V2 backend." action={<button className="button secondary" onClick={() => setRefresh(value => value + 1)}><Icon name="refresh"/>Refresh</button>}/>{error ? <ErrorState message={error} retry={() => setRefresh(value => value + 1)}/> : !data ? <SkeletonCards/> : <><section className="metric-grid" aria-label="Employee summary">{Object.entries(data.employees).map(([key, value]) => <article className="metric-card" key={key}><span>{key.replace(/_/g, ' ')}</span><strong>{value.toLocaleString()}</strong><small>Current records</small></article>)}{typeof data.approvals === 'number' && <article className="metric-card"><span>pending approvals</span><strong>{data.approvals.toLocaleString()}</strong><small>Independent decisions needed</small></article>}{typeof data.supportCases === 'number' && <article className="metric-card"><span>open support cases</span><strong>{data.supportCases.toLocaleString()}</strong><small>Within authorized scope</small></article>}</section><section className="panel"><div className="panel-heading"><div><h2>Pending administrative tasks</h2><p>Items awaiting an authorized administrator.</p></div><span className="count-badge">{data.pendingAdministrativeTasks}</span></div>{data.pendingAdministrativeTasks ? <p>Employee invitations and independent approvals require review.</p> : <EmptyState title="No pending tasks" text="No administrative invitations or approvals are currently awaiting action."/>}</section><section className="panel"><div className="panel-heading"><div><h2>Your recent actions</h2><p>Read-only events attributed to your employee identity.</p></div><time>{new Date(data.generatedAt).toLocaleString()}</time></div>{data.recentOwnActions.length ? <ul className="event-list">{data.recentOwnActions.map(event => <li key={event.id}><div><strong>{humanize(event.action)}</strong><span>{event.entityType} · {event.entityId}</span></div><time>{new Date(event.createdAt).toLocaleString()}</time></li>)}</ul> : <EmptyState title="No recent actions" text="Your audited actions will appear here."/>}</section></> }</>;
}

function EmployeesPage({ user, actor }: { user: User; actor: AdminActor }) {
  const [data, setData] = useState<EmployeePage | null>(null); const [roles, setRoles] = useState<Role[]>([]); const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [error, setError] = useState(''); const [reload, setReload] = useState(0); const [inviteOpen, setInviteOpen] = useState(false); const [statusTarget, setStatusTarget] = useState<AdminActor | null>(null);
  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), limit: '25' }); if (search.trim()) value.set('search', search.trim()); if (status) value.set('status', status); return value; }, [page, search, status]);
  useEffect(() => { Promise.all([adminApi.roles(user), adminApi.branches(user)]).then(([roles, branches]) => { setRoles(roles); setBranches(branches); }).catch(error => setError(errorMessage(error))); }, [user]);
  useEffect(() => { const timer = window.setTimeout(() => { setError(''); adminApi.employees(user, params).then(setData).catch(error => setError(errorMessage(error))); }, 250); return () => clearTimeout(timer); }, [user, params, reload]);
  return <><PageHeader eyebrow="People and access" title="Employees" description="Manage approved employee identities within your role and branch scope." action={actor.permissions.includes('employee.invite') && <button className="button primary" onClick={() => setInviteOpen(true)}>Invite employee</button>}/><section className="panel filters" aria-label="Employee filters"><label>Search<input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Name, email, ID or designation"/></label><label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option>ACTIVE</option><option>SUSPENDED</option><option>DEACTIVATED</option></select></label></section>{error ? <ErrorState message={error} retry={() => setReload(value => value + 1)}/> : !data ? <TableSkeleton/> : <section className="panel table-panel"><div className="panel-heading"><div><h2>Employee directory</h2><p>{data.total.toLocaleString()} authorized record{data.total === 1 ? '' : 's'}</p></div></div>{data.items.length ? <div className="table-scroll"><table><thead><tr><th>Employee</th><th>Role</th><th>Branch</th><th>Status</th><th>MFA</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{data.items.map(employee => <tr key={employee.userId}><td><strong>{employee.displayName || 'Unnamed employee'}</strong><span>{employee.email}</span><small>{employee.employeeCode || 'ID pending'}</small></td><td>{employee.roles.map(role => humanize(role)).join(', ') || 'No role'}</td><td>{employee.branches.map(branch => branch.code).join(', ') || 'No branch'}</td><td><StatusBadge value={employee.status}/></td><td><StatusBadge value={employee.mfaStatus}/></td><td>{employee.userId !== actor.userId && actor.permissions.includes('employee.suspend') && <button className="text-button" onClick={() => setStatusTarget(employee)}>Manage access</button>}</td></tr>)}</tbody></table></div> : <EmptyState title="No employees found" text="Adjust the filters or invite an employee into an approved role and branch."/>}<Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage}/></section>}{inviteOpen && <InviteDialog user={user} roles={roles} branches={branches} onClose={() => setInviteOpen(false)} onDone={() => { setInviteOpen(false); setReload(value => value + 1); }}/>} {statusTarget && <StatusDialog user={user} employee={statusTarget} onClose={() => setStatusTarget(null)} onDone={() => { setStatusTarget(null); setReload(value => value + 1); }}/>}</>;
}

function InviteDialog({ user, roles, branches, onClose, onDone }: { user: User; roles: Role[]; branches: Branch[]; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [roleId, setRoleId] = useState(''); const [branchIds, setBranchIds] = useState<string[]>([]);
  useEffect(() => { ref.current?.showModal(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(''); try { const input = { email: String(form.get('email')), fullName: String(form.get('fullName')), designation: String(form.get('designation')) || undefined, roleId, branchIds, expiresInHours: Number(form.get('expiresInHours')) }; if (role?.privileged) await adminApi.proposePrivilegedInvitation(user, { ...input, reason: String(form.get('approvalReason')) }); else await adminApi.invite(user, input); onDone(); } catch (error) { setError(errorMessage(error)); setBusy(false); } }
  const role = roles.find(item => item.id === roleId);
  return <dialog ref={ref} onCancel={onClose} className="dialog"><form onSubmit={submit}><header><div><p className="eyebrow">Employee onboarding</p><h2>Invite employee</h2></div><button type="button" className="icon-button" aria-label="Close invitation form" onClick={onClose}><Icon name="close"/></button></header>{error && <div className="alert error" role="alert">{error}</div>}<div className="form-grid"><label>Full name <span aria-hidden="true">*</span><input name="fullName" required minLength={2} maxLength={120}/></label><label>Work email <span aria-hidden="true">*</span><input name="email" type="email" autoComplete="email" required/></label><label className="full">Designation<input name="designation" maxLength={120}/></label><label>Approved role <span aria-hidden="true">*</span><select required value={roleId} onChange={event => setRoleId(event.target.value)}><option value="">Select role</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}{role.privileged ? ' · independent approval' : ''}</option>)}</select></label><label>Expires in<select name="expiresInHours" defaultValue="48"><option value="24">24 hours</option><option value="48">48 hours</option><option value="72">72 hours</option><option value="168">7 days</option></select></label><fieldset className="full"><legend>Assigned branches <span aria-hidden="true">*</span></legend><div className="check-grid">{branches.map(branch => <label key={branch.id}><input type="checkbox" checked={branchIds.includes(branch.id)} onChange={event => setBranchIds(current => event.target.checked ? [...current, branch.id] : current.filter(id => id !== branch.id))}/><span><strong>{branch.name}</strong><small>{branch.code} · {branch.city}</small></span></label>)}</div></fieldset>{role?.privileged && <label className="full">Why is this privileged role required? <span aria-hidden="true">*</span><textarea name="approvalReason" minLength={8} maxLength={500} required placeholder="This request goes to an independent eligible approver. You cannot approve it yourself."/></label>}{role && <div className="permission-preview full"><strong>Effective permission preview</strong>{role.permissions.length ? <ul>{role.permissions.map(({ permission }) => <li key={permission.key}><code>{permission.key}</code><span>{permission.description}</span></li>)}</ul> : <p>This role has no Admin Control Centre permissions. It only enables its responsible portal workflow.</p>}</div>}</div><footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || !roleId || !branchIds.length}>{busy ? (role?.privileged ? 'Submitting request…' : 'Creating invitation…') : role?.privileged ? 'Request independent approval' : 'Send invitation'}</button></footer></form></dialog>;
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
  const [branches, setBranches] = useState<ManagedBranch[] | null>(null); const [areas, setAreas] = useState<ServiceArea[] | null>(null); const [error, setError] = useState(''); const [reload, setReload] = useState(0); const [branchOpen, setBranchOpen] = useState(false); const [areaOpen, setAreaOpen] = useState(false); const canManage = actor.permissions.includes('branch.manage');
  useEffect(() => { setError(''); Promise.all([adminApi.managedBranches(user), adminApi.serviceAreas(user)]).then(([nextBranches, nextAreas]) => { setBranches(nextBranches); setAreas(nextAreas); }).catch(error => setError(errorMessage(error))); }, [user, reload]);
  async function setBranchActive(branch: ManagedBranch) { try { await adminApi.updateBranch(user, branch.id, { active: !branch.active }); setReload(value => value + 1); } catch (error) { setError(errorMessage(error)); } }
  async function setAreaActive(area: ServiceArea) { try { await adminApi.updateServiceArea(user, area.id, !area.active); setReload(value => value + 1); } catch (error) { setError(errorMessage(error)); } }
  return <><PageHeader eyebrow="Locations and coverage" title="Branches & Service Areas" description="Real branch and customer service-area configuration. Deactivation preserves historical records and is blocked while active staff remain assigned." action={canManage ? <div className="header-actions"><button className="button secondary" onClick={() => setAreaOpen(true)}>Add service area</button><button className="button primary" onClick={() => setBranchOpen(true)}>Add branch</button></div> : undefined}/>{error ? <ErrorState message={error} retry={() => setReload(value => value + 1)}/> : !branches || !areas ? <TableSkeleton/> : <><section className="panel table-panel"><div className="panel-heading"><div><h2>Branches</h2><p>{branches.length} location{branches.length === 1 ? '' : 's'} within your authorized scope.</p></div></div>{branches.length ? <div className="table-scroll"><table><thead><tr><th>Branch</th><th>Location</th><th>Active staff</th><th>Pending invitations</th><th>Status</th>{canManage && <th><span className="sr-only">Action</span></th>}</tr></thead><tbody>{branches.map(branch => <tr key={branch.id}><td><strong>{branch.name}</strong><small>{branch.code}</small></td><td>{branch.city}<small>{branch.address || 'Address not recorded'}</small></td><td>{branch._count.employees}</td><td>{branch._count.invitations}</td><td><StatusBadge value={branch.active ? 'ACTIVE' : 'DEACTIVATED'}/></td>{canManage && <td><button className="text-button" onClick={() => setBranchActive(branch)}>{branch.active ? 'Deactivate' : 'Reactivate'}</button></td>}</tr>)}</tbody></table></div> : <EmptyState title="No branches configured" text="Add an operating branch before assigning employee scope."/>}</section><section className="panel table-panel"><div className="panel-heading"><div><h2>Supported service areas</h2><p>These names control where customer journeys can be offered.</p></div></div>{areas.length ? <div className="table-scroll"><table><thead><tr><th>City or area</th><th>Created</th><th>Status</th>{canManage && <th><span className="sr-only">Action</span></th>}</tr></thead><tbody>{areas.map(area => <tr key={area.id}><td><strong>{area.name}</strong></td><td><time>{new Date(area.createdAt).toLocaleDateString()}</time></td><td><StatusBadge value={area.active ? 'ACTIVE' : 'DEACTIVATED'}/></td>{canManage && <td><button className="text-button" onClick={() => setAreaActive(area)}>{area.active ? 'Deactivate' : 'Reactivate'}</button></td>}</tr>)}</tbody></table></div> : <EmptyState title="No service areas configured" text="Add a service area to make coverage explicit."/>}</section></>}{branchOpen && <CreateBranchDialog user={user} onClose={() => setBranchOpen(false)} onDone={() => { setBranchOpen(false); setReload(value => value + 1); }}/>} {areaOpen && <CreateServiceAreaDialog user={user} onClose={() => setAreaOpen(false)} onDone={() => { setAreaOpen(false); setReload(value => value + 1); }}/>}</>;
}

function CreateBranchDialog({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); useEffect(() => { ref.current?.showModal(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(''); try { await adminApi.createBranch(user, { code: String(form.get('code')), name: String(form.get('name')), city: String(form.get('city')), address: String(form.get('address')) || undefined }); onDone(); } catch (error) { setError(errorMessage(error)); setBusy(false); } }
  return <dialog ref={ref} onCancel={onClose} className="dialog compact"><form onSubmit={submit}><header><div><p className="eyebrow">Operating location</p><h2>Add branch</h2></div><button type="button" className="icon-button" aria-label="Close branch form" onClick={onClose}><Icon name="close"/></button></header>{error && <div className="alert error" role="alert">{error}</div>}<label>Branch code <span aria-hidden="true">*</span><input name="code" required minLength={2} maxLength={24} pattern="[A-Za-z0-9_-]+" placeholder="BLR-01"/></label><label>Branch name <span aria-hidden="true">*</span><input name="name" required minLength={2} maxLength={120}/></label><label>City <span aria-hidden="true">*</span><input name="city" required minLength={2} maxLength={120}/></label><label>Address<textarea name="address" maxLength={500}/></label><footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Creating…' : 'Create branch'}</button></footer></form></dialog>;
}

function CreateServiceAreaDialog({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); useEffect(() => { ref.current?.showModal(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(''); try { await adminApi.createServiceArea(user, String(form.get('name'))); onDone(); } catch (error) { setError(errorMessage(error)); setBusy(false); } }
  return <dialog ref={ref} onCancel={onClose} className="dialog compact"><form onSubmit={submit}><header><div><p className="eyebrow">Customer coverage</p><h2>Add service area</h2></div><button type="button" className="icon-button" aria-label="Close service-area form" onClick={onClose}><Icon name="close"/></button></header>{error && <div className="alert error" role="alert">{error}</div>}<label>City or service area <span aria-hidden="true">*</span><input name="name" required minLength={2} maxLength={120} placeholder="Bengaluru"/></label><footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Creating…' : 'Create service area'}</button></footer></form></dialog>;
}

function SupportPage({ user, actor }: { user: User; actor: AdminActor }) {
  const [data, setData] = useState<SupportCasePage | null>(null); const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [selected, setSelected] = useState<SupportCase | null>(null); const [error, setError] = useState(''); const [reload, setReload] = useState(0);
  useEffect(() => { setError(''); adminApi.supportCases(user, page, status || undefined).then(setData).catch(error => setError(errorMessage(error))); }, [user, page, status, reload]);
  return <><PageHeader eyebrow="Customer care" title="Support cases" description="Customer issues within your authorized branch-city scope. Replies are delivered through the transactional outbox; internal notes remain internal."/><section className="panel filters"><label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option>OPEN</option><option>IN_PROGRESS</option><option>RESOLVED</option><option>CLOSED</option></select></label></section>{error ? <ErrorState message={error} retry={() => setReload(value => value + 1)}/> : !data ? <TableSkeleton/> : <section className="panel table-panel"><div className="panel-heading"><div><h2>Case queue</h2><p>{data.total.toLocaleString()} authorized case{data.total === 1 ? '' : 's'}</p></div></div>{data.items.length ? <div className="table-scroll"><table><thead><tr><th>Case</th><th>Customer</th><th>City</th><th>Updated</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{data.items.map(item => <tr key={item.id}><td><strong>{item.subject}</strong><small>{item.referenceCode} · {humanize(item.category)}</small></td><td>{item.user.displayName || item.user.email}<small>{item.user.email}</small></td><td>{item.user.preferredCity || 'Not recorded'}</td><td><time>{new Date(item.updatedAt).toLocaleString()}</time></td><td><StatusBadge value={item.status}/></td><td><button className="text-button" onClick={() => setSelected(item)}>Open</button></td></tr>)}</tbody></table></div> : <EmptyState title="No support cases" text="There are no cases in this filter and your authorized branch scope."/>}<Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage}/></section>}{selected && <SupportCaseDialog user={user} actor={actor} supportCase={selected} onClose={() => setSelected(null)} onDone={() => { setSelected(null); setReload(value => value + 1); }}/>}</>;
}

function SupportCaseDialog({ user, actor, supportCase, onClose, onDone }: { user: User; actor: AdminActor; supportCase: SupportCase; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [caseStatus, setCaseStatus] = useState(supportCase.status); useEffect(() => { ref.current?.showModal(); }, []);
  async function changeStatus(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); try { const form = new FormData(event.currentTarget); await adminApi.updateSupportCase(user, supportCase.id, caseStatus, String(form.get('note')) || undefined); onDone(); } catch (error) { setError(errorMessage(error)); setBusy(false); } }
  async function reply(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); try { const form = new FormData(event.currentTarget); await adminApi.replySupportCase(user, supportCase.id, String(form.get('body'))); onDone(); } catch (error) { setError(errorMessage(error)); setBusy(false); } }
  return (
    <dialog ref={ref} onCancel={onClose} className="dialog">
      <header>
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
      <div className="review-list">
        {supportCase.replies.map(reply => (
          <div key={reply.id}>
            <strong>{humanize(reply.authorType)}</strong>
            <span>{reply.body}</span>
            <small>{new Date(reply.createdAt).toLocaleString()}</small>
          </div>
        ))}
      </div>
      {actor.permissions.includes('support.respond') && (
        <form onSubmit={reply}>
          <label>Reply to customer<textarea name="body" minLength={1} maxLength={2000} required placeholder="Write a clear customer-facing response."/></label>
          <button className="button primary" disabled={busy}>{busy ? 'Sending…' : 'Send reply'}</button>
        </form>
      )}
      {actor.permissions.includes('support.escalate') && (
        <form onSubmit={changeStatus}>
          <label>Case status<select value={caseStatus} onChange={event => setCaseStatus(event.target.value)}><option>OPEN</option><option>IN_PROGRESS</option><option>RESOLVED</option><option>CLOSED</option></select></label>
          <label>Internal note<textarea name="note" maxLength={2000} placeholder="Optional; never shown to the customer."/></label>
          <button className="button secondary" disabled={busy || caseStatus === supportCase.status}>Save status</button>
        </form>
      )}
      <footer>
        <button type="button" className="button secondary" onClick={onClose}>Close</button>
      </footer>
    </dialog>
  );
}

function ApprovalsPage({ user, actor }: { user: User; actor: AdminActor }) {
  const [data, setData] = useState<ApprovalPage | null>(null); const [error, setError] = useState(''); const [page, setPage] = useState(1); const [status, setStatus] = useState('PENDING'); const [selected, setSelected] = useState<Approval | null>(null); const [reload, setReload] = useState(0);
  useEffect(() => { setError(''); adminApi.approvals(user, page, status || undefined).then(setData).catch(error => setError(errorMessage(error))); }, [user, page, status, reload]);
  return <><PageHeader eyebrow="Independent review" title="Approval Centre" description="Privileged access changes are proposed by a maker and executed once only after an eligible independent decision."/><section className="panel filters" aria-label="Approval filters"><label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option>PENDING</option><option>APPROVED</option><option>REJECTED</option><option>EXPIRED</option><option>STALE</option></select></label></section>{error ? <ErrorState message={error} retry={() => setReload(value => value + 1)}/> : !data ? <TableSkeleton/> : <section className="panel table-panel"><div className="panel-heading"><div><h2>Approval inbox</h2><p>{data.total.toLocaleString()} visible request{data.total === 1 ? '' : 's'}</p></div></div>{data.items.length ? <div className="table-scroll"><table><thead><tr><th>Request</th><th>Requester</th><th>Created</th><th>Status</th><th><span className="sr-only">Review</span></th></tr></thead><tbody>{data.items.map(item => <tr key={item.id}><td><strong>{humanize(item.requestType)}</strong><span>{item.payload.fullName || item.payload.email || item.id}</span></td><td>{item.requester.user.displayName || item.requester.user.email}<small>{item.requester.user.email}</small></td><td><time>{new Date(item.createdAt).toLocaleString()}</time><small>Expires {new Date(item.expiresAt).toLocaleString()}</small></td><td><StatusBadge value={item.status}/></td><td><button className="text-button" onClick={() => setSelected(item)}>{actor.permissions.includes('approval.decide') && item.status === 'PENDING' ? 'Review' : 'View'}</button></td></tr>)}</tbody></table></div> : <EmptyState title="No approval requests" text="There are no requests in this filter and within your branch scope."/>}<Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage}/></section>}{selected && <ApprovalDialog user={user} actor={actor} approval={selected} onClose={() => setSelected(null)} onDone={() => { setSelected(null); setReload(value => value + 1); }}/>}</>;
}

function ApprovalDialog({ user, actor, approval, onClose, onDone }: { user: User; actor: AdminActor; approval: Approval; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const canDecide = actor.permissions.includes('approval.decide') && approval.status === 'PENDING';
  useEffect(() => { ref.current?.showModal(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); try { const form = new FormData(event.currentTarget); await adminApi.decideApproval(user, approval.id, { version: approval.version, decision, reason: String(form.get('reason')) }); onDone(); } catch (error) { setError(errorMessage(error)); setBusy(false); } }
  return <dialog ref={ref} onCancel={onClose} className="dialog compact"><form onSubmit={submit}><header><div><p className="eyebrow">Maker-checker decision</p><h2>{humanize(approval.requestType)}</h2></div><button type="button" className="icon-button" aria-label="Close approval review" onClick={onClose}><Icon name="close"/></button></header>{error && <div className="alert error" role="alert">{error}</div>}<dl className="review-list"><div><dt>Requester</dt><dd>{approval.requester.user.displayName || approval.requester.user.email}<small>{approval.requester.user.email}</small></dd></div><div><dt>Employee</dt><dd>{approval.payload.fullName || 'Not supplied'}<small>{approval.payload.email}</small></dd></div><div><dt>Business reason</dt><dd>{approval.payload.reason || 'No reason recorded'}</dd></div><div><dt>Requested at</dt><dd>{new Date(approval.createdAt).toLocaleString()}</dd></div><div><dt>Expires at</dt><dd>{new Date(approval.expiresAt).toLocaleString()}</dd></div></dl>{approval.decision ? <div className="alert"><strong>{humanize(approval.decision.decision)}</strong><span>{approval.decision.reason}</span><small>{approval.decision.actor.user.displayName || approval.decision.actor.user.email} · {new Date(approval.decision.createdAt).toLocaleString()}</small></div> : canDecide ? <><fieldset><legend>Decision</legend><div className="decision-row"><label><input type="radio" checked={decision === 'APPROVE'} onChange={() => setDecision('APPROVE')}/> Approve and execute once</label><label><input type="radio" checked={decision === 'REJECT'} onChange={() => setDecision('REJECT')}/> Reject request</label></div></fieldset><label>Decision reason <span aria-hidden="true">*</span><textarea name="reason" minLength={8} maxLength={500} required placeholder="Record the independent review basis."/></label></> : <p className="helper">This request is read-only for your current permissions or state.</p>}<footer><button type="button" className="button secondary" onClick={onClose}>Close</button>{canDecide && <button className={`button ${decision === 'APPROVE' ? 'primary' : 'danger'}`} disabled={busy}>{busy ? 'Recording decision…' : decision === 'APPROVE' ? 'Approve and execute' : 'Reject request'}</button>}</footer></form></dialog>;
}

function AuditPageView({ user }: { user: User }) { const [data, setData] = useState<AuditPage | null>(null); const [error, setError] = useState(''); const [page, setPage] = useState(1); useEffect(() => { adminApi.audit(user, page).then(setData).catch(error => setError(errorMessage(error))); }, [user, page]); return <><PageHeader eyebrow="Append-only history" title="Audit" description="Authorization-filtered security and governance events. Audit records cannot be edited from this portal."/>{error ? <ErrorState message={error}/> : !data ? <TableSkeleton/> : <section className="panel table-panel">{data.items.length ? <div className="table-scroll"><table><thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Outcome</th></tr></thead><tbody>{data.items.map(event => <tr key={event.id}><td><time>{new Date(event.createdAt).toLocaleString()}</time></td><td><strong>{humanize(event.action)}</strong></td><td><span>{event.entityType}</span><small>{event.entityId}</small></td><td><StatusBadge value={event.outcome}/></td></tr>)}</tbody></table></div> : <EmptyState title="No audit events" text="No events are visible within your authorized scope."/>}<Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage}/></section>}</>; }
function SystemHealthPanel({ user }: { user: User }) { const [data, setData] = useState<SystemHealth | null>(null); const [error, setError] = useState(''); useEffect(() => { adminApi.systemHealth(user).then(setData).catch(error => setError(errorMessage(error))); }, [user]); return <section className="panel"><div className="panel-heading"><div><h2>System health</h2><p>Safe operational diagnostics; no credentials or recipient data.</p></div></div>{error ? <ErrorState message={error}/> : !data ? <TableSkeleton/> : <><ul className="event-list">{data.services.map(service => <li key={service.key}><div><strong>{humanize(service.key)}</strong><span>{service.detail}</span></div><StatusBadge value={service.status}/></li>)}</ul><p className="helper">Outbox: {Object.entries(data.emailOutbox).map(([state, count]) => `${humanize(state)} ${count}`).join(' · ') || 'No queued messages'}</p></>}</section>; }
function PoliciesPanel({ user }: { user: User }) { const [items, setItems] = useState<PolicyVersion[] | null>(null); const [error, setError] = useState(''); useEffect(() => { adminApi.policies(user).then(setItems).catch(error => setError(errorMessage(error))); }, [user]); return <section className="panel"><div className="panel-heading"><div><h2>Policy versions</h2><p>Approved, versioned governance records.</p></div></div>{error ? <ErrorState message={error}/> : !items ? <TableSkeleton/> : items.length ? <ul className="event-list">{items.map(policy => <li key={policy.id}><div><strong>{policy.title} · v{policy.version}</strong><span>{policy.key} · {policy.createdBy.displayName || policy.createdBy.email}</span></div><StatusBadge value={policy.status}/></li>)}</ul> : <EmptyState title="No policy versions" text="Proposed policies appear here only after independent approval."/>}</section>; }
function StatusBadge({ value }: { value: string }) { const tone = ['ACTIVE', 'COMPLIANT', 'SUCCEEDED', 'ACCEPTED'].includes(value) ? 'success' : ['SUSPENDED', 'REQUIRED', 'PENDING'].includes(value) ? 'warning' : ['DEACTIVATED', 'FAILED', 'RECOVERY_REQUIRED'].includes(value) ? 'danger' : 'neutral'; return <span className={`status ${tone}`}><span aria-hidden="true"/>{humanize(value)}</span>; }
function Pagination({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (page: number) => void }) { const pages = Math.max(1, Math.ceil(total / limit)); return <div className="pagination"><span>Page {page} of {pages}</span><div><button className="button secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button><button className="button secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button></div></div>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="empty-state"><strong>{title}</strong><p>{text}</p></div>; }
function ErrorState({ message, retry }: { message: string; retry?: () => void }) { return <div className="alert error page-error" role="alert"><strong>Unable to load this view</strong><span>{message}</span>{retry && <button className="button secondary" onClick={retry}>Try again</button>}</div>; }
function SkeletonCards() { return <div className="metric-grid" aria-label="Loading" aria-busy="true">{[1, 2, 3, 4].map(item => <div className="skeleton card" key={item}/>)}</div>; }
function TableSkeleton() { return <div className="panel" aria-label="Loading" aria-busy="true"><div className="skeleton line"/><div className="skeleton row"/><div className="skeleton row"/><div className="skeleton row"/></div>; }
function NotFound() { return <div className="empty-state page-empty"><strong>Page not found</strong><p>The requested Admin route does not exist or is not enabled.</p><button className="button primary" onClick={() => navigate('/')}>Return to overview</button></div>; }
function humanize(value: string) { return value.toLowerCase().replace(/[._-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()); }
