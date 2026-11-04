import { useAutoRefresh } from './autoRefresh';
import { useEffect, useState, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  getAuth,
  getMultiFactorResolver,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type MultiFactorResolver,
  type PhoneMultiFactorInfo,
  type User,
} from 'firebase/auth';
import './styles.css';

function isInvalidRegNumberOrUuid(val: unknown): boolean {
  if (!val || typeof val !== 'string') return true;
  const s = val.trim();
  if (!s) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  if (/^[0-9a-f]{32}$/i.test(s)) return true;
  if (/^(SL-|VM-|REF-|LEAD-)/i.test(s)) return true;
  if (s.length > 14 || (s.match(/-/g) || []).length >= 3) return true;
  return false;
}

type QueueItem = {
  id: string;
  revision: number;
  status: string;
  submittedAt: string;
  inspectorId: string;
  identity: Record<string, unknown>;
  inspector?: { user: { displayName: string | null; email: string } };
  request: {
    lead: {
      referenceCode: string;
      sellerName: string;
      sellerPhone: string;
      city: string;
      make: string;
      model: string;
      variant?: string | null;
      manufacturingYear: number;
    };
  };
  _count: { defects: number; media: number; answers: number };
};

type Report = QueueItem & {
  answers: Array<{
    id: string;
    itemKey: string;
    status: string;
    value: unknown;
    notes?: string | null;
  }>;
  defects: Array<{
    id: string;
    category: string;
    severity: string;
    description: string;
    location?: string | null;
  }>;
  media: Array<{
    id: string;
    logicalMediaId: string;
    mimeType: string;
    byteSize: number;
    capturedAt?: string | null;
  }>;
  parentReport?: {
    id: string;
    revision: number;
    status: string;
    identity: Record<string, unknown>;
    answers: Array<{ itemKey: string; status: string; value: unknown; notes?: string | null }>;
    defects: Array<{ category: string; severity: string; description: string; location?: string | null }>;
    reviewDecision?: { decision: string; reason?: string | null; createdAt: string } | null;
  } | null;
  revisions: Array<{ id: string; revision: number; status: string; submittedAt?: string | null; reviewedAt?: string | null }>;
};

type RevisionDiff = {
  hasParent: boolean;
  parentRevision?: number;
  currentRevision?: number;
  priorReviewerReason?: string | null;
  answerDiffs?: Array<{ itemKey: string; oldStatus?: string; newStatus?: string; oldNotes?: string | null; newNotes?: string | null }>;
  defectDiffs?: {
    added: Array<{ category: string; severity: string; description: string; location?: string | null }>;
    resolved: Array<{ category: string; severity: string; description: string; location?: string | null }>;
  };
};

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const configured = Object.values(config).every(val => typeof val === 'string' && val.trim());
const auth = configured ? (getApps().length ? getAuth(getApp()) : getAuth(initializeApp(config))) : null;
function resolveApiBase(): string {
  const env = (import.meta.env.VITE_API_BASE || '').trim();
  const raw = (env || 'http://localhost:4100/api/v2')
    .replace('https://vmotiv.in', 'https://api.vmotiv.in')
    .replace('https://www.vmotiv.in', 'https://api.vmotiv.in')
    .replace(/\/$/, '');
  if (raw.endsWith('/api/v2') || raw.endsWith('/api/v1')) {
    return raw;
  }
  return `${raw}/api/v2`;
}
const base = resolveApiBase();

async function api<T>(user: User, path: string, init: RequestInit = {}) {
  const token = await user.getIdToken();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
    const err = new Error(body.code || body.message || `HTTP_${response.status}`);
    (err as any).status = response.status;
    (err as any).code = body.code;
    throw err;
  }
  return response.json() as Promise<T>;
}

function AuthenticatedImage({ user, reportId, mediaId, alt }: { user: User; reportId: string; mediaId: string; alt: string }) {
  const [src, setSrc] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    async function loadImg() {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${base}/inspection-review/reports/${reportId}/media/${mediaId}/content`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('IMG_FETCH_FAILED');
        const blob = await res.blob();
        if (active) {
          setSrc(URL.createObjectURL(blob));
          setLoading(false);
        }
      } catch {
        if (active) setLoading(false);
      }
    }
    void loadImg();
    return () => {
      active = false;
      if (src) URL.revokeObjectURL(src);
    };
  }, [user, reportId, mediaId]);

  if (loading) {
    return (
      <div style={{ width: '100%', height: '100%', background: '#07182f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--muted)' }}>
        Loading evidence...
      </div>
    );
  }

  if (!src) {
    return (
      <div style={{ width: '100%', height: '100%', background: '#07182f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--muted)' }}>
        Unavailable
      </div>
    );
  }

  return <img src={src} alt={alt} />;
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
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const [verificationId, setVerificationId] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const phoneHint = resolver.hints.find(
    hint => hint.factorId === PhoneMultiFactorGenerator.FACTOR_ID
  ) as PhoneMultiFactorInfo | undefined;

  const sendOtp = async () => {
    if (!phoneHint) {
      setError('No registered phone number found for 2-step verification.');
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
  };

  useEffect(() => {
    void sendOtp();
    return () => {
      try {
        recaptchaVerifierRef.current?.clear();
      } catch {
        // ignore
      }
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationId || code.trim().length !== 6) return;
    setVerifying(true);
    setError('');
    try {
      const cred = PhoneAuthProvider.credential(verificationId, code.trim());
      const assertion = PhoneMultiFactorGenerator.assertion(cred);
      await resolver.resolveSignIn(assertion);
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired 6-digit verification code.');
      setVerifying(false);
    }
  };

  const phoneDisplay = phoneHint?.phoneNumber || 'your registered mobile number';

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-dialog" style={{ maxWidth: '440px', width: '92%' }}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">2-STEP VERIFICATION</span>
            <h3 style={{ margin: 0 }}>Two-Factor Security</h3>
          </div>
          <button
            type="button"
            className="btn-outline"
            style={{ minHeight: '30px', padding: '2px 8px' }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body" style={{ padding: '1.25rem' }}>
            {error && <div className="error-banner" style={{ marginBottom: '12px' }}>{error}</div>}
            <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.5, marginBottom: '16px' }}>
              {sending
                ? `Sending 6-digit verification code to ${phoneDisplay}…`
                : `A 6-digit verification code was sent via SMS to ${phoneDisplay}. Enter the code below to complete sign-in.`}
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                }}
              >
                6-DIGIT VERIFICATION CODE *
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="123456"
                autoFocus
                required
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                style={{
                  width: '100%',
                  background: '#07182f',
                  border: '1.5px solid var(--border)',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '24px',
                  letterSpacing: '8px',
                  textAlign: 'center',
                  color: '#fff',
                  fontWeight: 700,
                  outline: 'none',
                }}
              />
            </div>
            {phoneHint && (
              <div style={{ textAlign: 'center', marginTop: '10px' }}>
                <button
                  type="button"
                  disabled={sending || verifying}
                  onClick={sendOtp}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--yellow)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {sending ? 'Sending new code…' : "Didn't receive SMS? Resend code"}
                </button>
              </div>
            )}
          </div>
          <div
            className="modal-footer"
            style={{
              padding: '1rem 1.25rem',
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end',
              borderTop: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              className="button btn-secondary"
              onClick={onClose}
              disabled={verifying}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button btn-primary"
              disabled={verifying || sending || code.trim().length !== 6}
            >
              {verifying ? 'Verifying…' : 'Verify & Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [diff, setDiff] = useState<RevisionDiff | null>(null);
  const [activeTab, setActiveTab] = useState<'checklist' | 'defects' | 'gallery' | 'diff'>('checklist');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [reason, setReason] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'submitted_desc' | 'submitted_asc'>('submitted_desc');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUBMITTED' | 'UNDER_REVIEW' | 'REWORK_REQUIRED' | 'APPROVED'>('ALL');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);

  const loadQueue = async (activeUser = user, sort = sortOrder, status = statusFilter, query = search, opts: { silent?: boolean } = {}) => {
    if (!activeUser) return;
    const silent = opts.silent === true;
    if (!silent) {
      setBusy(true);
      setError('');
    }
    try {
      const params = new URLSearchParams();
      if (sort) params.set('sort', sort);
      if (status && status !== 'ALL') params.set('status', status);
      if (query.trim()) params.set('search', query.trim());
      const qs = params.toString() ? `?${params.toString()}` : '';
      const queue = await api<QueueItem[]>(activeUser, `/inspection-review/queue${qs}`);
      setItems(queue);
    } catch (e: any) {
      if (silent) throw e;
      const code = e?.code || e?.message || '';
      if (code === 'INSPECTION_ACCESS_DENIED' || e?.status === 403) {
        setError('Access Restricted: Your account does not have Inspection Reviewer privileges. Please sign in with an authorized Reviewer or Administrator account (e.g. vmotiv.v@gmail.com).');
      } else {
        setError(e instanceof Error ? e.message : 'Unable to load review queue.');
      }
    } finally {
      if (!silent) setBusy(false);
    }
  };

  // New submitted reports reach the review queue without a manual refresh.
  useAutoRefresh(() => loadQueue(user, sortOrder, statusFilter, search, { silent: true }), {
    enabled: Boolean(user),
    intervalMs: 30_000,
    pulse: user ? { domains: ['review'], fetchTokens: async domains => (await api<{ tokens: Record<string, string> }>(user, `/pulse?domains=${domains.join(',')}`)).tokens } : undefined,
  });

  const loadNotifications = async (activeUser = user) => {
    if (!activeUser) return;
    try {
      const res = await api<{ items: any[]; unreadCount: number }>(activeUser, '/api/v2/notifications?limit=25');
      setNotifications(res.items || []);
      setUnreadNotifsCount(res.unreadCount || 0);
    } catch {
      // ignore
    }
  };

  const markAllRead = async () => {
    if (!user) return;
    try {
      await api(user, '/api/v2/notifications/read-all', { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadNotifsCount(0);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!auth) return;
    getRedirectResult(auth)
      .then(result => {
        if (result?.user) {
          // Redirect login succeeded
        }
      })
      .catch((err: any) => {
        if (auth && err?.code === 'auth/multi-factor-auth-required') {
          const resolver = getMultiFactorResolver(auth, err);
          setMfaResolver(resolver);
        } else {
          setError(err?.message || 'Google sign-in could not be completed.');
        }
      });

    return onAuthStateChanged(auth, nextUser => {
      setUser(nextUser);
      if (nextUser) {
        void loadQueue(nextUser);
        void loadNotifications(nextUser);
      }
    });
  }, []);

  async function login() {
    if (!auth) return;
    const currentAuth = auth;
    setError('');
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(currentAuth, provider);
    } catch (e: any) {
      if (e?.code === 'auth/multi-factor-auth-required') {
        const resolver = getMultiFactorResolver(currentAuth, e);
        setMfaResolver(resolver);
        setBusy(false);
        return;
      }
      if (
        e?.code === 'auth/popup-blocked' ||
        e?.code === 'auth/popup-closed-by-user' ||
        e?.code === 'auth/cancelled-popup-request' ||
        e?.message?.includes('Cross-Origin-Opener-Policy')
      ) {
        try {
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: 'select_account' });
          await signInWithRedirect(currentAuth, provider);
          return;
        } catch (redirectError: any) {
          setError(redirectError?.message || 'Redirect sign-in failed. Please try again.');
        }
      } else {
        setError(e instanceof Error ? e.message : 'Google sign-in failed.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function openReport(item: QueueItem) {
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      const rep = await api<Report>(user, `/inspection-review/reports/${item.id}`);
      setReport(rep);
      setReason('');
      setActiveTab('checklist');

      if (rep.parentReport) {
        const d = await api<RevisionDiff>(user, `/inspection-review/reports/${item.id}/diff`);
        setDiff(d);
      } else {
        setDiff(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load report.');
    } finally {
      setBusy(false);
    }
  }

  async function recordDecision(decision: 'APPROVE' | 'REQUEST_CORRECTION' | 'REJECT') {
    if (!user || !report) return;

    if (decision !== 'APPROVE' && !reason.trim()) {
      setError('A documented reason is required when requesting a correction or rejecting a report.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await api(user, `/inspection-review/reports/${report.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          reason: reason.trim() || undefined,
        }),
      });
      setReport(null);
      setDiff(null);
      await loadQueue();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decision could not be recorded.');
    } finally {
      setBusy(false);
    }
  }

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      item =>
        item.request.lead.make.toLowerCase().includes(q) ||
        item.request.lead.model.toLowerCase().includes(q) ||
        item.request.lead.referenceCode.toLowerCase().includes(q) ||
        item.request.lead.sellerName.toLowerCase().includes(q)
    );
  }, [items, search]);

  if (!configured) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <img className="auth-logo" src="/brand/vmotiv-logo.svg" alt="V MOTIV" />
          <p className="eyebrow">CONFIGURATION REQUIRED</p>
          <h1>Environment Missing</h1>
          <p>
            Firebase public environment variables are required. Set <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_PROJECT_ID</code> in <code>.env</code>.
          </p>
        </section>
      </main>
    );
  }

  // --- Sign-in Screen (Identical to Admin & Sales Portals) ---
  if (!user) {
    return (
      <>
        <main className="auth-shell">
          <section className="auth-panel">
            <img className="auth-logo" src="/brand/vmotiv-logo.svg" alt="V MOTIV" />
            <p className="eyebrow">QUALITY CONTROL & GOVERNANCE</p>
            <h1>Independent Inspection Review</h1>
            <p>
              Sign in with your authorized Quality Reviewer, Operations Manager, or Administrator credentials. Field inspectors are prohibited from approving their own submissions.
            </p>
            <div className="auth-actions">
              <button className="button btn-primary" onClick={login} disabled={busy}>
                {busy ? 'Connecting to Google…' : 'Continue with Google'}
              </button>
            </div>
            {error && <div className="error-banner">{error}</div>}
          </section>

          <aside className="auth-aside">
            <div>
              <span className="kicker">Stage 1 · Evidence Audit</span>
              <strong>Full Physical & Photo Evidence</strong>
              <span>16-section checklist audit, odometer corroboration, and stamped VIN cross-referencing.</span>
            </div>
            <div>
              <span className="kicker">Stage 2 · Accountable Verdict</span>
              <strong>Approve, Rework, or Reject</strong>
              <span>Sealed approvals feed pricing and acquisition workflows without allowing silent changes.</span>
            </div>
            <div>
              <span className="kicker">Governance Boundary</span>
              <strong>Separation of Responsibilities</strong>
              <span>Systematically prevents self-approval and preserves immutable historical revisions.</span>
            </div>
          </aside>
        </main>

        {mfaResolver && auth && (
          <MfaChallengeDialog
            auth={auth}
            resolver={mfaResolver}
            onClose={() => setMfaResolver(null)}
            onSuccess={() => setMfaResolver(null)}
          />
        )}
        <div id="recaptcha-container" />
      </>
    );
  }

  // --- Authenticated Workspace View ---
  return (
    <>
      {/* Topbar (Matching Admin and Sales) */}
      <header className="topbar">
        <div className="brand-lockup">
          <img src="/brand/vmotiv-header-brand.png" alt="V MOTIV" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
          <span className="brand-pill">INSPECTION REVIEW</span>
        </div>
        <div className="topbar-user" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Notification Bell */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn-outline"
              style={{ padding: '6px 10px', position: 'relative', cursor: 'pointer' }}
              onClick={() => setNotifsOpen(!notifsOpen)}
              title="Notifications"
            >
              🔔
              {unreadNotifsCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    background: '#EF4444',
                    color: '#fff',
                    borderRadius: '10px',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 5px',
                  }}
                >
                  {unreadNotifsCount}
                </span>
              )}
            </button>

            {notifsOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '42px',
                  width: '320px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  background: '#07162C',
                  border: '1px solid #1A3B6B',
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  zIndex: 9999,
                  padding: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #1A3B6B', paddingBottom: '6px' }}>
                  <strong style={{ fontSize: '13px' }}>Review Notifications</strong>
                  {unreadNotifsCount > 0 && (
                    <button className="text-button" style={{ fontSize: '11px', color: '#F7B503', cursor: 'pointer' }} onClick={markAllRead}>
                      Mark all read
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <p style={{ color: '#8899A6', fontSize: '12px', textAlign: 'center', padding: '16px 0' }}>No notifications</p>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      style={{
                        padding: '8px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        opacity: n.read ? 0.7 : 1,
                        cursor: 'pointer',
                      }}
                      onClick={async () => {
                        if (!n.read) {
                          await api(user, `/api/v2/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => {});
                          setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, read: true } : item));
                          setUnreadNotifsCount(prev => Math.max(0, prev - 1));
                        }
                        if (n.entityId) {
                          const target = items.find(i => i.id === n.entityId);
                          if (target) openReport(target);
                        }
                      }}
                    >
                      <div style={{ fontWeight: n.read ? 600 : 700, fontSize: '12px', color: n.read ? '#fff' : '#F7B503' }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: '11px', color: '#8899A6', marginTop: '2px' }}>{n.body}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <span>Reviewer: <strong>{user.email}</strong></span>
          <button className="btn-outline" style={{ minHeight: '34px', padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => signOut(auth!)}>
            Sign out
          </button>
        </div>
      </header>

      <div className="workspace-container">
        {error && <div className="error-banner">{error}</div>}

        <div className="layout-grid">
          {/* Left Panel: Review Queue */}
          <aside className="panel">
            <div className="panel-header">
              <h2>Review Queue</h2>
              <span className="badge badge-amber">{filteredItems.length} Awaiting</span>
            </div>

            <input
              type="text"
              className="search-input"
              placeholder="Search by car, lead code, seller..."
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                void loadQueue(user, sortOrder, statusFilter, e.target.value);
              }}
            />

            {/* Filter pills and Sort order */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '8px 0' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {(['ALL', 'SUBMITTED', 'UNDER_REVIEW', 'REWORK_REQUIRED', 'APPROVED'] as const).map(st => (
                  <button
                    key={st}
                    className={`btn-outline ${statusFilter === st ? 'active' : ''}`}
                    style={{
                      flex: '1 1 auto',
                      minWidth: '70px',
                      padding: '4px 6px',
                      fontSize: '11px',
                      background: statusFilter === st ? 'rgba(247, 181, 3, 0.15)' : 'transparent',
                      borderColor: statusFilter === st ? '#F7B503' : '#1A3B6B',
                      color: statusFilter === st ? '#F7B503' : '#8899A6',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      setStatusFilter(st);
                      void loadQueue(user, sortOrder, st, search);
                    }}
                  >
                    {st === 'ALL'
                      ? 'All'
                      : st === 'SUBMITTED'
                      ? 'Submitted'
                      : st === 'UNDER_REVIEW'
                      ? 'Under Review'
                      : st === 'REWORK_REQUIRED'
                      ? 'Rework'
                      : 'Approved'}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#8899A6' }}>
                <span>Sort order:</span>
                <select
                  value={sortOrder}
                  onChange={e => {
                    const next = e.target.value as any;
                    setSortOrder(next);
                    void loadQueue(user, next, statusFilter, search);
                  }}
                  style={{
                    background: '#07162C',
                    color: '#fff',
                    border: '1px solid #1A3B6B',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '11px',
                  }}
                >
                  <option value="submitted_desc">Newest submitted first</option>
                  <option value="submitted_asc">Oldest submitted first</option>
                </select>
              </div>
            </div>

            <div className="queue-scroll">
              {filteredItems.length ? (
                filteredItems.map(item => (
                  <div
                    key={item.id}
                    className={`queue-item ${report?.id === item.id ? 'active' : ''}`}
                    onClick={() => openReport(item)}
                  >
                    <div className="queue-item-top">
                      <span className="queue-item-vehicle">
                        {item.request.lead.manufacturingYear} {item.request.lead.make} {item.request.lead.model}
                      </span>
                      <span className="badge badge-blue">REV {item.revision}</span>
                    </div>
                    <div className="queue-item-seller">
                      {item.request.lead.sellerName} · {item.request.lead.city}
                    </div>
                    <div className="queue-item-meta">
                      <span>{item.request.lead.referenceCode}</span>
                      <span>{item._count.defects} Defects · {item._count.media} Photos</span>
                    </div>
                    <div style={{ marginTop: '4px' }}>
                      <span
                        className={`badge ${
                          item.status === 'APPROVED'
                            ? 'badge-success'
                            : item.status === 'REWORK_REQUIRED'
                            ? 'badge-danger'
                            : item.status === 'UNDER_REVIEW'
                            ? 'badge-amber'
                            : 'badge-blue'
                        }`}
                        style={{ fontSize: '10px' }}
                      >
                        {item.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--muted)', fontSize: '0.88rem' }}>
                  No inspection reports currently awaiting review.
                </div>
              )}
            </div>
          </aside>

          {/* Right Panel: Detailed Inspection Report */}
          <main className="panel">
            {report ? (
              <div className="detail-box">
                <div className="detail-head-card">
                  <p className="eyebrow">
                    {report.request.lead.referenceCode} · REPORT REVISION {report.revision}
                  </p>
                  <h1 className="detail-title">
                    {report.request.lead.manufacturingYear} {report.request.lead.make} {report.request.lead.model} {report.request.lead.variant || ''}
                  </h1>
                  <div className="meta-tags-row">
                    <span>Seller: <strong>{report.request.lead.sellerName}</strong> ({report.request.lead.sellerPhone})</span>
                    <span>City: <strong>{report.request.lead.city}</strong></span>
                    <span>Inspector: <strong>{report.inspector?.user.displayName || report.inspector?.user.email || 'Field Staff'}</strong></span>
                    <span>Submitted: <strong>{new Date(report.submittedAt).toLocaleString()}</strong></span>
                  </div>
                </div>

                {report.parentReport && (
                  <div className="badge badge-warning" style={{ width: '100%', padding: '10px 14px', borderRadius: '6px', textAlign: 'left', lineHeight: 1.5 }}>
                    <strong>Revision {report.revision} (Resubmitted Rework):</strong> Previous revision {report.parentReport.revision} feedback: "{report.parentReport.reviewDecision?.reason || 'Correction requested'}".
                  </div>
                )}

                {/* Navigation Tabs */}
                <div className="tab-row">
                  <button
                    className={`tab-button ${activeTab === 'checklist' ? 'active' : ''}`}
                    onClick={() => setActiveTab('checklist')}
                  >
                    Checklist ({report.answers.length})
                  </button>
                  <button
                    className={`tab-button ${activeTab === 'defects' ? 'active' : ''}`}
                    onClick={() => setActiveTab('defects')}
                  >
                    Defects ({report.defects.length})
                  </button>
                  <button
                    className={`tab-button ${activeTab === 'gallery' ? 'active' : ''}`}
                    onClick={() => setActiveTab('gallery')}
                  >
                    Evidence Photos ({report.media.length})
                  </button>
                  {report.parentReport && (
                    <button
                      className={`tab-button ${activeTab === 'diff' ? 'active' : ''}`}
                      onClick={() => setActiveTab('diff')}
                    >
                      Revision Diff
                    </button>
                  )}
                </div>

                {/* TAB 1: Checklist & Identity */}
                {activeTab === 'checklist' && (
                  <div>
                    <div className="subpanel">
                      <h3 className="subpanel-title">Vehicle Identity Verification</h3>
                      <div className="grid-3">
                        <div className="info-block">
                          <span className="info-label">Observed Registration</span>
                          <span className="info-value">
                            {report.identity.registrationNumber && !isInvalidRegNumberOrUuid(report.identity.registrationNumber)
                              ? String(report.identity.registrationNumber)
                              : 'Not recorded'}
                          </span>
                        </div>
                        <div className="info-block">
                          <span className="info-label">Observed Odometer</span>
                          <span className="info-value">{String(report.identity.odometerKm || '0')} km</span>
                        </div>
                        <div className="info-block">
                          <span className="info-label">VIN / Chassis Marking</span>
                          <span className="info-value">{String(report.identity.vinChassis || 'Inspected on vehicle')}</span>
                        </div>
                        <div className="info-block">
                          <span className="info-label">RC Verification</span>
                          <span className="info-value">{String(report.identity.rcVerified ? 'Verified' : 'Document Checked')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="subpanel">
                      <h3 className="subpanel-title">Physical Checklist Findings</h3>
                      <div>
                        {report.answers.map(ans => (
                          <div key={ans.id} className="check-row">
                            <div style={{ flex: 1 }}>
                              <div className="check-key">{ans.itemKey}</div>
                              {ans.notes ? <div className="check-notes">Inspector notes: {ans.notes}</div> : null}
                              {ans.value !== undefined && ans.value !== null ? (
                                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '2px' }}>Observed: {String(ans.value)}</div>
                              ) : null}
                            </div>
                            <div>
                              <span
                                className={`badge ${
                                  ans.status === 'PASS'
                                    ? 'badge-green'
                                    : ans.status === 'ISSUE'
                                    ? 'badge-red'
                                    : ans.status === 'NOT_TESTED'
                                    ? 'badge-amber'
                                    : 'badge-gray'
                                }`}
                              >
                                {ans.status.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: Defects */}
                {activeTab === 'defects' && (
                  <div className="subpanel">
                    <h3 className="subpanel-title">Identified Defects ({report.defects.length})</h3>
                    {report.defects.length ? (
                      report.defects.map(d => (
                        <div key={d.id} className="defect-card">
                          <div className="defect-top">
                            <span className="defect-title">{d.category} {d.location ? `· ${d.location}` : ''}</span>
                            <span
                              className={`badge ${
                                d.severity === 'CRITICAL' || d.severity === 'MAJOR'
                                  ? 'badge-red'
                                  : d.severity === 'MODERATE'
                                  ? 'badge-amber'
                                  : 'badge-blue'
                              }`}
                            >
                              {d.severity}
                            </span>
                          </div>
                          <p className="defect-desc">{d.description}</p>
                        </div>
                      ))
                    ) : (
                      <p style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '0.88rem' }}>No defects recorded for this vehicle.</p>
                    )}
                  </div>
                )}

                {/* TAB 3: Evidence Gallery */}
                {activeTab === 'gallery' && (
                  <div className="subpanel">
                    <h3 className="subpanel-title">Private Evidence Media ({report.media.length})</h3>
                    {report.media.length ? (
                      <div className="gallery-grid">
                        {report.media.map(m => (
                          <div key={m.id} className="gallery-card" onClick={() => setSelectedPhoto(m.id)}>
                            <AuthenticatedImage user={user} reportId={report.id} mediaId={m.id} alt={m.logicalMediaId} />
                            <div className="gallery-tag">{m.logicalMediaId}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '0.88rem' }}>No evidence photos submitted with this report.</p>
                    )}
                  </div>
                )}

                {/* TAB 4: Revision Diff */}
                {activeTab === 'diff' && diff && (
                  <div className="subpanel">
                    <h3 className="subpanel-title">Comparison with Revision {diff.parentRevision}</h3>
                    {diff.priorReviewerReason && (
                      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                        Prior Reviewer Feedback: <em>"{diff.priorReviewerReason}"</em>
                      </p>
                    )}

                    <h4 style={{ fontSize: '0.9rem', color: 'var(--yellow)', margin: '1rem 0 0.5rem', fontFamily: 'var(--font-heading)' }}>Checklist Changes</h4>
                    {diff.answerDiffs && diff.answerDiffs.length ? (
                      diff.answerDiffs.map(ad => (
                        <div key={ad.itemKey} className="diff-card">
                          <div>
                            <span className="info-label">{ad.itemKey} (Rev {diff.parentRevision})</span>
                            <div style={{ marginTop: '4px' }}>
                              <span className={`badge ${ad.oldStatus === 'PASS' ? 'badge-green' : 'badge-red'}`}>{ad.oldStatus || 'Not recorded'}</span>
                            </div>
                            {ad.oldNotes ? <small style={{ color: 'var(--muted)', display: 'block', marginTop: '4px' }}>{ad.oldNotes}</small> : null}
                          </div>
                          <div>
                            <span className="info-label">Current (Rev {diff.currentRevision})</span>
                            <div style={{ marginTop: '4px' }}>
                              <span className={`badge ${ad.newStatus === 'PASS' ? 'badge-green' : 'badge-red'}`}>{ad.newStatus}</span>
                            </div>
                            {ad.newNotes ? <small style={{ color: 'var(--muted)', display: 'block', marginTop: '4px' }}>{ad.newNotes}</small> : null}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>No checklist differences detected.</p>
                    )}

                    <h4 style={{ fontSize: '0.9rem', color: 'var(--yellow)', margin: '1.2rem 0 0.5rem', fontFamily: 'var(--font-heading)' }}>Defect Changes</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <span className="info-label">New Defects</span>
                        {diff.defectDiffs?.added.length ? (
                          diff.defectDiffs.added.map(d => (
                            <div key={d.description} className="defect-card">
                              <span className="defect-title">{d.severity} · {d.category}</span>
                              <span className="defect-desc">{d.description}</span>
                            </div>
                          ))
                        ) : (
                          <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>None</p>
                        )}
                      </div>
                      <div>
                        <span className="info-label">Resolved / Removed</span>
                        {diff.defectDiffs?.resolved.length ? (
                          diff.defectDiffs.resolved.map(d => (
                            <div key={d.description} className="defect-card" style={{ borderLeftColor: 'var(--success)' }}>
                              <span className="defect-title">{d.severity} · {d.category}</span>
                              <span className="defect-desc">{d.description}</span>
                            </div>
                          ))
                        ) : (
                          <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>None</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Independent Review Decision Box */}
                <div className="decision-panel">
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', marginBottom: '0.5rem' }}>
                    Accountable Review Decision
                  </h3>
                  <p style={{ fontSize: '0.84rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                    Decisions are permanently logged with your employee identity. Rejection or correction requests mandate actionable feedback for the field inspector.
                  </p>

                  <textarea
                    className="decision-textarea"
                    placeholder="Document specific reviewer observations, discrepancies, or rework instructions..."
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                  />

                  <div className="decision-actions">
                    <button className="btn-approve" disabled={busy} onClick={() => recordDecision('APPROVE')}>
                      ✓ Approve Inspection Report
                    </button>
                    <button className="btn-secondary" disabled={busy} onClick={() => recordDecision('REQUEST_CORRECTION')}>
                      ↩ Return for Rework
                    </button>
                    <button className="btn-danger" disabled={busy} onClick={() => recordDecision('REJECT')}>
                      ✕ Reject Report
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--muted)' }}>
                <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>Select an inspection from the queue</h3>
                <p style={{ fontSize: '0.88rem', maxWidth: '30rem', margin: '0 auto' }}>
                  Review vehicle identity verification, physical checklist checks, defects, and evidence photos before recording an authorized decision.
                </p>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Modal Photo Zoom */}
      {selectedPhoto && report && (
        <div className="modal-overlay" onClick={() => setSelectedPhoto(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-img-container">
              <AuthenticatedImage user={user} reportId={report.id} mediaId={selectedPhoto} alt="Zoomed Evidence" />
            </div>
            <div className="modal-footer">
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff', fontFamily: 'var(--font-heading)' }}>
                {report.media.find(m => m.id === selectedPhoto)?.logicalMediaId}
              </span>
              <button className="btn-outline" style={{ minHeight: '34px', padding: '4px 14px' }} onClick={() => setSelectedPhoto(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
