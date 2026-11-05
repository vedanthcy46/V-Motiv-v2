import {
  ApiError, AuthLayout, Button, CenterState, EmptyState, Alert, Modal, MfaChallengeModal, NotificationBell, PageLoader, SimpleShell, StatusBadge, TableSkeleton,
  createApiClient, describeApiError, initTheme, mountLiveChangeBar, resolveApiBase, toast, useAutoRefresh, useChangeWatcher, type ApiClient,
} from '@vmotiv/ui';
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

initTheme();

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
const base = resolveApiBase(import.meta.env.VITE_API_BASE);
const clients = new WeakMap<User, ApiClient>();

/** One shared client per signed-in user: request de-duplication, token refresh, retry and the global progress bar. */
function api<T>(user: User, path: string, init: RequestInit = {}) {
  let client = clients.get(user);
  if (!client) {
    client = createApiClient({ base, getToken: force => user.getIdToken(force) });
    clients.set(user, client);
  }
  return client.request<T>(path, init as never);
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
      <div style={{ width: '100%', height: '100%', background: 'var(--color-base-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--muted)' }}>
        Loading evidence...
      </div>
    );
  }

  if (!src) {
    return (
      <div style={{ width: '100%', height: '100%', background: 'var(--color-base-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--muted)' }}>
        Unavailable
      </div>
    );
  }

  return <img src={src} alt={alt} />;
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
  const [authReady, setAuthReady] = useState<boolean>(!auth);
  const [queueLoading, setQueueLoading] = useState<boolean>(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<string>('');
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [error, setError] = useState<string>('');
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);

  const loadQueue = async (activeUser = user, sort = sortOrder, status = statusFilter, query = search, opts: { silent?: boolean } = {}) => {
    if (!activeUser) return;
    const silent = opts.silent === true;
    if (!silent) {
      setQueueLoading(true);
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
        setError(describeApiError(e));
      }
    } finally {
      if (!silent) setQueueLoading(false);
    }
  };

  /** Typing in the search box filters the list instantly in the browser; the server is asked once typing pauses. */
  const scheduleQueueReload = (activeUser: User | null, sort: typeof sortOrder, status: typeof statusFilter, query: string) => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => { void loadQueue(activeUser, sort, status, query); }, 350);
  };

  // New submitted reports reach the review queue without a manual refresh.
  useAutoRefresh(() => loadQueue(user, sortOrder, statusFilter, search, { silent: true }), {
    enabled: Boolean(user),
    intervalMs: 30_000,
    pulse: user ? { domains: ['review'], live: true, fetchTokens: async (domains, fresh) => (await api<{ tokens: Record<string, string> }>(user, `/pulse?domains=${domains.join(',')}${fresh ? '&fresh=1' : ''}`)).tokens } : undefined,
  });

  // Floating "New activity" bar when a new inspection report arrives for review.
  useChangeWatcher(
    ['review'],
    async (domains, fresh) => (await api<{ tokens: Record<string, string> }>(user as User, `/pulse?domains=${domains.join(',')}${fresh ? '&fresh=1' : ''}`)).tokens,
    { enabled: Boolean(user) },
  );

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
      setAuthReady(true);
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
    if (!user || opening) return;
    setOpening(item.id);
    setError('');
    try {
      // The report and its revision diff are independent: fetch them together.
      const [rep, d] = await Promise.all([
        api<Report>(user, `/inspection-review/reports/${item.id}`),
        api<RevisionDiff>(user, `/inspection-review/reports/${item.id}/diff`).catch(() => null),
      ]);
      setReport(rep);
      setReason('');
      setActiveTab('checklist');
      setDiff(rep.parentReport ? d : null);
    } catch (e) {
      toast.error('Could not open this report', { description: describeApiError(e) });
    } finally {
      setOpening(null);
    }
  }

  async function recordDecision(decision: 'APPROVE' | 'REQUEST_CORRECTION' | 'REJECT') {
    if (!user || !report || busy) return;

    if (decision !== 'APPROVE' && !reason.trim()) {
      toast.warning('A reason is required', { description: 'Document why you are requesting a correction or rejecting this report.' });
      return;
    }

    setBusy(true);
    try {
      await api(user, `/inspection-review/reports/${report.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, reason: reason.trim() || undefined }),
      });
      toast.success(decision === 'APPROVE' ? 'Report approved' : decision === 'REJECT' ? 'Report rejected' : 'Correction requested');
      // The decision is saved; take the report out of the queue immediately and refresh the list in the background.
      setItems(current => current.filter(item => item.id !== report.id));
      setReport(null);
      setDiff(null);
      void loadQueue(user, sortOrder, statusFilter, search, { silent: true }).catch(() => undefined);
    } catch (e) {
      toast.error('Decision could not be recorded', { description: describeApiError(e) });
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
      <CenterState eyebrow="Configuration required" title="Environment missing">
        <p>Firebase public environment variables are required. Set <code>VITE_FIREBASE_API_KEY</code> and <code>VITE_FIREBASE_PROJECT_ID</code> in <code>.env</code>.</p>
      </CenterState>
    );
  }

  if (!authReady) return <PageLoader label="Checking your session" />;

  if (!user) {
    return (
      <>
        <AuthLayout
          portalName="Inspection Review"
          eyebrow="Quality control and governance"
          title="Independent inspection review"
          description="Sign in with your authorised Quality Reviewer, Operations Manager or Administrator account. Field inspectors cannot approve their own submissions."
          points={[
            { title: 'Evidence audit', text: '16-section checklist review, odometer corroboration and stamped VIN cross-referencing.' },
            { title: 'Accountable verdict', text: 'Approve, request rework or reject. Sealed approvals feed pricing and acquisition without silent changes.' },
            { title: 'Separation of duties', text: 'Self-approval is blocked and every historical revision is preserved.' },
          ]}
        >
          <Button size="lg" block loading={busy} onClick={login}>{busy ? 'Connecting to Google…' : 'Continue with Google'}</Button>
          {error ? <Alert tone="error">{error}</Alert> : null}
        </AuthLayout>
        {mfaResolver && auth && (
          <MfaChallengeModal auth={auth} resolver={mfaResolver} onClose={() => setMfaResolver(null)} onSuccess={() => setMfaResolver(null)} />
        )}
      </>
    );
  }

  return (
    <SimpleShell
      portalName="Inspection Review"
      wide
      toolbar={
        <>
          <NotificationBell
            title="Review notifications"
            items={notifications}
            unread={unreadNotifsCount}
            onMarkAllRead={markAllRead}
            onOpenItem={async n => {
              if (!n.read) {
                await api(user, `/api/v2/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => undefined);
                setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, read: true } : item));
                setUnreadNotifsCount(prev => Math.max(0, prev - 1));
              }
              const entityId = (n as { entityId?: string }).entityId;
              const target = entityId ? items.find(i => i.id === entityId) : undefined;
              if (target) void openReport(target);
            }}
          />
          <span className="vm-user hidden sm:inline">Reviewer: <strong>{user.email}</strong></span>
          <Button variant="ghost" size="sm" onClick={() => signOut(auth!)}>Sign out</Button>
        </>
      }
    >
      <div>
        {error && <Alert tone="error" className="mb-4" onDismiss={() => setError('')}>{error}</Alert>}

        <div className="layout-grid">
          {/* Left Panel: Review Queue */}
          <aside className="panel">
            <div className="panel-header">
              <h2>Review queue</h2>
              <span className="badge badge-amber">{filteredItems.length} awaiting</span>
            </div>

            <input
              type="search"
              aria-label="Search the review queue"
              placeholder="Search by car, lead code or seller"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                scheduleQueueReload(user, sortOrder, statusFilter, e.target.value);
              }}
            />

            <div className="queue-filters">
              <div className="flex w-full gap-1" role="group" aria-label="Filter by status">
                {(['ALL', 'SUBMITTED', 'UNDER_REVIEW', 'REWORK_REQUIRED', 'APPROVED'] as const).map(st => (
                  <button
                    key={st}
                    type="button"
                    aria-pressed={statusFilter === st}
                    className={`btn btn-xs flex-1 ${statusFilter === st ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => {
                      setStatusFilter(st);
                      void loadQueue(user, sortOrder, st, search);
                    }}
                  >
                    {st === 'ALL' ? 'All' : st === 'SUBMITTED' ? 'New' : st === 'UNDER_REVIEW' ? 'Review' : st === 'REWORK_REQUIRED' ? 'Rework' : 'Done'}
                  </button>
                ))}
              </div>
              <label className="queue-sort">
                <span>Sort by</span>
                <select
                  className="select select-sm"
                  value={sortOrder}
                  onChange={e => {
                    const next = e.target.value as typeof sortOrder;
                    setSortOrder(next);
                    void loadQueue(user, next, statusFilter, search);
                  }}
                >
                  <option value="submitted_desc">Newest first</option>
                  <option value="submitted_asc">Oldest first</option>
                </select>
              </label>
            </div>

            <div className="queue-scroll" aria-busy={queueLoading}>
              {queueLoading && items.length === 0 ? (
                <TableSkeleton rows={5} columns={1} />
              ) : filteredItems.length ? (
                filteredItems.map(item => (
                  <button
                    type="button"
                    key={item.id}
                    className={`queue-item ${report?.id === item.id ? 'active' : ''}`}
                    aria-current={report?.id === item.id ? 'true' : undefined}
                    onClick={() => openReport(item)}
                  >
                    <span className="queue-item-top">
                      <span className="queue-item-vehicle">{item.request.lead.manufacturingYear} {item.request.lead.make} {item.request.lead.model}</span>
                      <span className="badge badge-blue">Rev {item.revision}</span>
                    </span>
                    <span className="queue-item-seller">{item.request.lead.sellerName} · {item.request.lead.city}</span>
                    <span className="queue-item-meta">
                      <span>{item.request.lead.referenceCode}</span>
                      <span>{item._count.defects} defects · {item._count.media} photos</span>
                    </span>
                    <span className="mt-1"><StatusBadge status={item.status} size="sm" /></span>
                  </button>
                ))
              ) : (
                <EmptyState title="Nothing waiting for review" description="New inspection reports appear here as soon as inspectors submit them." />
              )}
            </div>
          </aside>

          {/* Right Panel: Detailed Inspection Report */}
          <section className="panel" aria-live="polite">
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
                      <p className="muted">No defects recorded for this vehicle.</p>
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
                      <p className="muted">No evidence photos submitted with this report.</p>
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

                    <h4 className="section-label">Checklist Changes</h4>
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

                    <h4 className="section-label">Defect Changes</h4>
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
                  <h3>
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
                    <Button variant="success" disabled={busy} loading={busy && pendingDecision === 'APPROVE'} onClick={() => { setPendingDecision('APPROVE'); void recordDecision('APPROVE'); }}>
                      Approve report
                    </Button>
                    <Button variant="secondary" disabled={busy} loading={busy && pendingDecision === 'REQUEST_CORRECTION'} onClick={() => { setPendingDecision('REQUEST_CORRECTION'); void recordDecision('REQUEST_CORRECTION'); }}>
                      Return for rework
                    </Button>
                    <Button variant="danger" disabled={busy} loading={busy && pendingDecision === 'REJECT'} onClick={() => { setPendingDecision('REJECT'); void recordDecision('REJECT'); }}>
                      Reject report
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                title="Select an inspection from the queue"
                description="Review vehicle identity, checklist results, defects and evidence photos before recording a decision."
              />
            )}
          </section>
        </div>
      </div>

      {/* Photo zoom */}
      {selectedPhoto && report && (
        <Modal
          size="xl"
          title={report.media.find(m => m.id === selectedPhoto)?.logicalMediaId ?? 'Evidence photo'}
          onClose={() => setSelectedPhoto(null)}
          footer={<Button variant="secondary" onClick={() => setSelectedPhoto(null)}>Close</Button>}
        >
          <div className="modal-img-container">
            <AuthenticatedImage user={user} reportId={report.id} mediaId={selectedPhoto} alt="Zoomed evidence" />
          </div>
        </Modal>
      )}
    </SimpleShell>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
mountLiveChangeBar({ review: 'Inspection reports awaiting review' });
