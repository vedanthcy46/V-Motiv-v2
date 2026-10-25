import { useEffect, useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import './styles.css';

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
const base = (import.meta.env.VITE_API_BASE || 'http://localhost:4100/api/v2').replace(/\/$/, '');

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
    throw new Error(body.code || body.message || 'REQUEST_FAILED');
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
    return <div style={{ width: '100%', height: '100%', background: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#64748B' }}>Loading...</div>;
  }

  if (!src) {
    return <div style={{ width: '100%', height: '100%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#94A3B8' }}>No Image</div>;
  }

  return <img src={src} alt={alt} className="gallery-img" />;
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
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const loadQueue = async (activeUser = user) => {
    if (!activeUser) return;
    setBusy(true);
    setError('');
    try {
      const queue = await api<QueueItem[]>(activeUser, '/inspection-review/queue');
      setItems(queue);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load review queue.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, nextUser => {
      setUser(nextUser);
      if (nextUser) void loadQueue(nextUser);
    });
  }, []);

  async function login() {
    if (!auth) return;
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed.');
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
      <div className="auth-center">
        <div className="auth-card">
          <span className="brand-badge">CONFIGURATION</span>
          <h2>V MOTIV REVIEW</h2>
          <p style={{ color: '#64748B', fontSize: '14px' }}>
            Firebase environment variables are required. Set <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_PROJECT_ID</code> in <code>.env</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-center">
        <div className="auth-card">
          <span className="brand-badge">V MOTIV QUALITY CONTROL</span>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-navy)' }}>Inspection Review Portal</h1>
          <p style={{ color: '#64748B', fontSize: '14px', lineHeight: 1.5 }}>
            Authorized Reviewers, Operations Managers, and Quality Assurance personnel only. Inspectors cannot evaluate their own submissions.
          </p>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={login}>
            Sign in with Google
          </button>
          {error && <div className="alert-box alert-danger">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="portal-container">
      {/* Header */}
      <header className="portal-header">
        <div className="header-brand">
          <span className="brand-badge">QC REVIEW</span>
          <span className="brand-title">V MOTIV Inspection Review System</span>
        </div>
        <div className="header-user">
          <span className="user-email">{user.email}</span>
          <button className="btn btn-outline" style={{ minHeight: '36px', padding: '6px 14px' }} onClick={() => signOut(auth!)}>
            Sign out
          </button>
        </div>
      </header>

      {error && <div className="alert-box alert-danger">{error}</div>}

      <div className="portal-layout">
        {/* Left: Queue Panel */}
        <aside className="queue-panel">
          <div className="queue-title-row">
            <h2 className="queue-title">Review Queue</h2>
            <span className="queue-badge">{filteredItems.length} Pending</span>
          </div>

          <input
            type="text"
            className="queue-search"
            placeholder="Search by car, lead code, seller..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <div className="queue-list">
            {filteredItems.length ? (
              filteredItems.map(item => (
                <div
                  key={item.id}
                  className={`queue-card ${report?.id === item.id ? 'active' : ''}`}
                  onClick={() => openReport(item)}
                >
                  <div className="card-top">
                    <span className="card-vehicle">
                      {item.request.lead.manufacturingYear} {item.request.lead.make} {item.request.lead.model}
                    </span>
                    <span className="card-rev">REV {item.revision}</span>
                  </div>
                  <div className="card-seller">{item.request.lead.sellerName} · {item.request.lead.city}</div>
                  <div className="card-meta">
                    <span>{item.request.lead.referenceCode}</span>
                    <span>{item._count.defects} Defects · {item._count.media} Photos</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>No reports currently awaiting review.</p>
              </div>
            )}
          </div>
        </aside>

        {/* Right: Inspection Detailed View */}
        <main className="detail-panel">
          {report ? (
            <div>
              <div className="detail-header">
                <div className="detail-kicker">
                  {report.request.lead.referenceCode} · REVISION {report.revision}
                </div>
                <h1 className="detail-title">
                  {report.request.lead.manufacturingYear} {report.request.lead.make} {report.request.lead.model} {report.request.lead.variant || ''}
                </h1>
                <div className="detail-meta-row">
                  <span><strong>Seller:</strong> {report.request.lead.sellerName} ({report.request.lead.sellerPhone})</span>
                  <span><strong>City:</strong> {report.request.lead.city}</span>
                  <span><strong>Inspector:</strong> {report.inspector?.user.displayName || report.inspector?.user.email || 'Assigned Staff'}</span>
                  <span><strong>Submitted:</strong> {new Date(report.submittedAt).toLocaleString()}</span>
                </div>
              </div>

              {/* Rework Alert if Applicable */}
              {report.parentReport && (
                <div className="alert-box alert-warning">
                  <strong>Revision {report.revision} (Resubmitted Rework):</strong> Previous revision {report.parentReport.revision} feedback: "{report.parentReport.reviewDecision?.reason || 'Correction requested'}".
                </div>
              )}

              {/* Tabs */}
              <div className="tab-row">
                <button
                  className={`tab-btn ${activeTab === 'checklist' ? 'active' : ''}`}
                  onClick={() => setActiveTab('checklist')}
                >
                  Checklist ({report.answers.length})
                </button>
                <button
                  className={`tab-btn ${activeTab === 'defects' ? 'active' : ''}`}
                  onClick={() => setActiveTab('defects')}
                >
                  Defects ({report.defects.length})
                </button>
                <button
                  className={`tab-btn ${activeTab === 'gallery' ? 'active' : ''}`}
                  onClick={() => setActiveTab('gallery')}
                >
                  Evidence Photos ({report.media.length})
                </button>
                {report.parentReport && (
                  <button
                    className={`tab-btn ${activeTab === 'diff' ? 'active' : ''}`}
                    onClick={() => setActiveTab('diff')}
                  >
                    Revision Diff
                  </button>
                )}
              </div>

              {/* TAB 1: Checklist & Identity */}
              {activeTab === 'checklist' && (
                <div>
                  <div className="section-box">
                    <h3 className="section-box-title">Vehicle Identity Verification</h3>
                    <div className="grid-3">
                      <div className="info-item">
                        <span className="info-label">Observed Registration</span>
                        <span className="info-val">{String(report.identity.registrationNumber || 'Not recorded')}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Observed Odometer</span>
                        <span className="info-val">{String(report.identity.odometerKm || '0')} km</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">VIN / Chassis Marking</span>
                        <span className="info-val">{String(report.identity.vinChassis || 'Inspected on vehicle')}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">RC Status</span>
                        <span className="info-val">{String(report.identity.rcVerified ? 'Verified' : 'Document Checked')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="section-box">
                    <h3 className="section-box-title">Physical Checklist Findings</h3>
                    <div>
                      {report.answers.map(ans => (
                        <div key={ans.id} className="check-item">
                          <div className="check-desc">
                            <div className="check-key">{ans.itemKey}</div>
                            {ans.notes ? <div className="check-notes">Inspector notes: {ans.notes}</div> : null}
                            {ans.value !== undefined && ans.value !== null ? (
                              <div style={{ fontSize: '12px', color: '#64748B' }}>Observed value: {String(ans.value)}</div>
                            ) : null}
                          </div>
                          <div>
                            <span
                              className={`badge ${
                                ans.status === 'PASS'
                                  ? 'badge-pass'
                                  : ans.status === 'ISSUE'
                                  ? 'badge-issue'
                                  : ans.status === 'NOT_TESTED'
                                  ? 'badge-untested'
                                  : 'badge-na'
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
                <div className="section-box">
                  <h3 className="section-box-title">Identified Defects ({report.defects.length})</h3>
                  {report.defects.length ? (
                    report.defects.map(d => (
                      <div key={d.id} className="defect-card">
                        <div className="defect-top">
                          <span className="defect-cat">{d.category} {d.location ? `· ${d.location}` : ''}</span>
                          <span
                            className={`badge ${
                              d.severity === 'CRITICAL' || d.severity === 'MAJOR'
                                ? 'badge-issue'
                                : d.severity === 'MODERATE'
                                ? 'badge-untested'
                                : 'badge-na'
                            }`}
                          >
                            {d.severity}
                          </span>
                        </div>
                        <p className="defect-desc">{d.description}</p>
                      </div>
                    ))
                  ) : (
                    <p style={{ color: '#64748B', fontStyle: 'italic' }}>No defects recorded for this vehicle.</p>
                  )}
                </div>
              )}

              {/* TAB 3: Evidence Gallery */}
              {activeTab === 'gallery' && (
                <div className="section-box">
                  <h3 className="section-box-title">Private Evidence Media ({report.media.length})</h3>
                  {report.media.length ? (
                    <div className="gallery-grid">
                      {report.media.map(m => (
                        <div key={m.id} className="gallery-thumb" onClick={() => setSelectedPhoto(m.id)}>
                          <AuthenticatedImage user={user} reportId={report.id} mediaId={m.id} alt={m.logicalMediaId} />
                          <div className="gallery-tag">{m.logicalMediaId}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: '#64748B', fontStyle: 'italic' }}>No private evidence photos submitted with this report.</p>
                  )}
                </div>
              )}

              {/* TAB 4: Revision Diff */}
              {activeTab === 'diff' && diff && (
                <div className="section-box">
                  <h3 className="section-box-title">Comparison with Revision {diff.parentRevision}</h3>
                  {diff.priorReviewerReason && (
                    <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px' }}>
                      Prior Reviewer Comment: <em>"{diff.priorReviewerReason}"</em>
                    </p>
                  )}

                  <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '14px 0 8px' }}>Checklist Changes</h4>
                  {diff.answerDiffs && diff.answerDiffs.length ? (
                    diff.answerDiffs.map(ad => (
                      <div key={ad.itemKey} className="diff-row">
                        <div className="diff-col">
                          <span className="info-label">{ad.itemKey} (Rev {diff.parentRevision})</span>
                          <span className={`badge ${ad.oldStatus === 'PASS' ? 'badge-pass' : 'badge-issue'}`}>{ad.oldStatus || 'Not recorded'}</span>
                          {ad.oldNotes ? <small style={{ color: '#64748B' }}>{ad.oldNotes}</small> : null}
                        </div>
                        <div className="diff-col">
                          <span className="info-label">Current (Rev {diff.currentRevision})</span>
                          <span className={`badge ${ad.newStatus === 'PASS' ? 'badge-pass' : 'badge-issue'}`}>{ad.newStatus}</span>
                          {ad.newNotes ? <small style={{ color: '#64748B' }}>{ad.newNotes}</small> : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: '13px', color: '#64748B' }}>No checklist differences detected.</p>
                  )}

                  <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '16px 0 8px' }}>Defect Changes</h4>
                  <div className="grid-2">
                    <div>
                      <span className="info-label">New Defects</span>
                      {diff.defectDiffs?.added.length ? (
                        diff.defectDiffs.added.map(d => (
                          <div key={d.description} className="defect-card">
                            <strong>{d.severity} · {d.category}</strong>
                            <span>{d.description}</span>
                          </div>
                        ))
                      ) : (
                        <p style={{ fontSize: '13px', color: '#64748B' }}>None</p>
                      )}
                    </div>
                    <div>
                      <span className="info-label">Resolved / Removed Defects</span>
                      {diff.defectDiffs?.resolved.length ? (
                        diff.defectDiffs.resolved.map(d => (
                          <div key={d.description} className="defect-card" style={{ borderLeftColor: 'var(--color-success)' }}>
                            <strong>{d.severity} · {d.category}</strong>
                            <span>{d.description}</span>
                          </div>
                        ))
                      ) : (
                        <p style={{ fontSize: '13px', color: '#64748B' }}>None</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Decision Section */}
              <div className="decision-card">
                <h3 className="decision-title">Independent Review Decision</h3>
                <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '12px' }}>
                  Decisions are immutable and logged with your employee credentials. A rejection or correction request requires a clear reason for the inspector.
                </p>

                <textarea
                  className="decision-textarea"
                  placeholder="Enter specific reviewer feedback or reasons (required for correction or rejection)..."
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                />

                <div className="decision-actions">
                  <button className="btn btn-approve" disabled={busy} onClick={() => recordDecision('APPROVE')}>
                    ✓ Approve Report
                  </button>
                  <button className="btn btn-rework" disabled={busy} onClick={() => recordDecision('REQUEST_CORRECTION')}>
                    ↩ Request Correction
                  </button>
                  <button className="btn btn-danger" disabled={busy} onClick={() => recordDecision('REJECT')}>
                    ✕ Reject Report
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <h3>Select an inspection from the queue</h3>
              <p>Review the vehicle's identity, physical checks, defects, and photos before issuing an authoritative decision.</p>
            </div>
          )}
        </main>
      </div>

      {/* Modal Photo Zoom */}
      {selectedPhoto && report && (
        <div className="modal-overlay" onClick={() => setSelectedPhoto(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <AuthenticatedImage user={user} reportId={report.id} mediaId={selectedPhoto} alt="Zoomed Evidence" />
            <div className="modal-bar">
              <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-navy)' }}>
                {report.media.find(m => m.id === selectedPhoto)?.logicalMediaId}
              </span>
              <button className="btn btn-outline" style={{ minHeight: '36px' }} onClick={() => setSelectedPhoto(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
