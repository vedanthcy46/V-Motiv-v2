import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  GoogleAuthProvider,
  getMultiFactorResolver,
  getRedirectResult,
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
import { auth, firebaseConfigured } from './firebase.js';
import {
  ApiError,
  salesApi,
  type AcquisitionOfferItem,
  type Actor,
  type BuyerLead,
  type Customer,
  type DashboardData,
  type InspectionRequestItem,
  type InventoryItem,
  type NotificationData,
  type Quotation,
  type ReportsData,
  type Reservation,
  type ReviewItem,
  type ReviewRequestsData,
  type SellerLead,
  type Task,
  type TestDrive,
  type ValuationItem,
} from './api.js';
import { Icons } from './icons.js';
import './styles.css';

type PageKey =
  | 'overview'
  | 'seller'
  | 'buyer'
  | 'customers'
  | 'inspections'
  | 'offers'
  | 'inventory'
  | 'testdrives'
  | 'pipeline'
  | 'tasks'
  | 'communications'
  | 'reports';

const formatCurrency = (paise: string | number | null | undefined): string => {
  if (paise === null || paise === undefined || paise === '') return '₹0';
  const val = typeof paise === 'string' ? Number(paise) : paise;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val / 100);
};

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
};

const statusBadgeClass = (status: string): string => {
  const s = status.toUpperCase();
  if (['SUBMITTED', 'RECEIVED', 'DRAFT', 'OPEN'].includes(s)) return 'badge-blue';
  if (['QUALIFYING', 'IN_REVIEW', 'IN_PROGRESS', 'REQUESTED', 'PENDING_APPROVAL', 'PENDING', 'OFFER_PENDING'].includes(s)) return 'badge-amber';
  if (['INSPECTION_SCHEDULED', 'CONFIRMED', 'RESERVED'].includes(s)) return 'badge-purple';
  if (['ACCEPTED', 'COMPLETED', 'PUBLISHED', 'APPROVED', 'CONVERTED_TO_SALE'].includes(s)) return 'badge-green';
  if (['REJECTED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'NO_SHOW', 'RELEASED'].includes(s)) return 'badge-red';
  return 'badge-gray';
};

// ==========================================
// 2-STEP VERIFICATION (MFA CHALLENGE DIALOG)
// ==========================================
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
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="modal-header">
          <div>
            <span className="eyebrow">2-STEP VERIFICATION</span>
            <h3>Phone Verification</h3>
          </div>
          <button type="button" onClick={onClose}><Icons.Close size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '14px' }}>
              {sending
                ? `Sending 6-digit verification code to ${phoneDisplay}…`
                : `A 6-digit verification code was sent via SMS to ${phoneDisplay}. Enter the code below to complete sign-in.`}
            </p>
            <div className="form-group">
              <label className="form-label">6-digit Verification Code *</label>
              <input
                autoFocus
                required
                className="form-input font-mono"
                style={{ fontSize: '1.25rem', letterSpacing: '0.25em', textAlign: 'center' }}
                placeholder="123456"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={sending}
                onClick={sendOtp}
              >
                {sending ? 'Resending…' : 'Resend Code via SMS'}
              </button>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={verifying || sending || code.length !== 6}
            >
              {verifying ? 'Verifying…' : 'Verify & Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// AUTH SCREEN (IDENTICAL ADMIN THEME)
// ==========================================
function SignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);

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
  }, []);

  const login = async () => {
    if (!auth) return;
    const currentAuth = auth;
    setBusy(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(currentAuth, provider);
    } catch (err: any) {
      if (err?.code === 'auth/multi-factor-auth-required') {
        const resolver = getMultiFactorResolver(currentAuth, err);
        setMfaResolver(resolver);
        setBusy(false);
        return;
      }
      if (
        err?.code === 'auth/popup-blocked' ||
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.message?.includes('Cross-Origin-Opener-Policy')
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
        setError(err?.message || `Sign-in error: ${err?.code || 'UNKNOWN'}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <main className="auth-shell">
        <section className="auth-panel">
          <img className="auth-logo" src="/brand/vmotiv-logo.svg" alt="V MOTIV" />
          <p className="eyebrow">SALES EXECUTIVE PORTAL</p>
          <h1>Authorized Sales Workspace</h1>
          <p>Sign in with your authorized V MOTIV corporate Google account to manage buyer & seller opportunities.</p>
          <div className="auth-actions">
            {firebaseConfigured ? (
              <button className="button btn-primary" onClick={login} disabled={busy}>
                {busy ? 'Connecting to Google…' : 'Continue with Google'}
              </button>
            ) : (
              <div className="error-banner">Firebase configuration is missing for this environment.</div>
            )}
          </div>
          {error && <div className="error-banner">{error}</div>}
        </section>
        <aside className="auth-aside">
          <div>
            <span className="kicker">Workflow A · Buy</span>
            <strong>Vehicle Acquisition & Valuation</strong>
            <span>Seller lead qualification, physical inspections, and approved offers.</span>
          </div>
          <div>
            <span className="kicker">Workflow B · Sell</span>
            <strong>Inventory & Retail Fulfillment</strong>
            <span>Inbound buyer enquiries, showroom test drives, and quotations.</span>
          </div>
          <div>
            <span className="kicker">Security & Governance</span>
            <strong>Role & Branch Scoped</strong>
            <span>Strict server-side enforcement backed by PostgreSQL transactional audit checks.</span>
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

// ==========================================
// MAIN SALES APPLICATION
// ==========================================
function App() {
  const [user, setUser] = useState<User | null>(null);
  const [actor, setActor] = useState<Actor | null>(null);
  const [page, setPage] = useState<PageKey>('overview');
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState('');

  // Notifications dropdown state
  const [notifications, setNotifications] = useState<NotificationData | null>(null);
  const [showNotifs, setShowNotifs] = useState(false);

  // Data states
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [reports, setReports] = useState<ReportsData | null>(null);
  const [sellerLeads, setSellerLeads] = useState<SellerLead[]>([]);
  const [buyerLeads, setBuyerLeads] = useState<BuyerLead[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [testDrives, setTestDrives] = useState<TestDrive[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inspectionRequests, setInspectionRequests] = useState<InspectionRequestItem[]>([]);
  const [acquisitionOffers, setAcquisitionOffers] = useState<AcquisitionOfferItem[]>([]);
  const [valuations, setValuations] = useState<ValuationItem[]>([]);
  const [reviewRequests, setReviewRequests] = useState<ReviewRequestsData | null>(null);
  const [reviewTab, setReviewTab] = useState<'pending' | 'decided'>('pending');
  const [discountStatusFilter, setDiscountStatusFilter] = useState('');

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [unassignedFilter, setUnassignedFilter] = useState(false);

  // Modals & Drawers state
  const [selectedSellerLead, setSelectedSellerLead] = useState<SellerLead | null>(null);
  const [selectedBuyerLead, setSelectedBuyerLead] = useState<BuyerLead | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [prefilledCustomerId, setPrefilledCustomerId] = useState<string>('');
  const [targetListingId, setTargetListingId] = useState<string>('');
  const [showManualLeadModal, setShowManualLeadModal] = useState(false);
  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [targetReleaseListing, setTargetReleaseListing] = useState<InventoryItem | null>(null);
  const [targetReleaseReservation, setTargetReleaseReservation] = useState<Reservation | { id: string; reservationNumber?: string; status: string; expiresAt: string; notes?: string | null; customer?: { id?: string; displayName?: string | null; email?: string } } | null>(null);
  const [showTestDriveModal, setShowTestDriveModal] = useState(false);
  const [showCompleteTaskModal, setShowCompleteTaskModal] = useState<string | null>(null);
  const [showDiscountModal, setShowDiscountModal] = useState<string | null>(null); // quotationId

  // Auth subscriber
  useEffect(() => {
    if (!auth) {
      setDenied(true);
      setLoading(false);
      return;
    }
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Main data loader
  const loadData = async (currentUser = user) => {
    if (!currentUser) return;
    setError('');
    try {
      const [actorData, dashData, notifData] = await Promise.all([
        salesApi.me(currentUser),
        salesApi.dashboard(currentUser),
        salesApi.notifications(currentUser),
      ]);
      setActor(actorData);
      setDashboard(dashData);
      setNotifications(notifData);
      setDenied(false);

      // Load data based on current page
      if (page === 'overview') {
        const [sellersRes, tasksRes, testDrivesRes, reviewsRes] = await Promise.all([
          salesApi.sellerLeads(currentUser, { limit: 10 }),
          salesApi.tasks(currentUser, { overdue: true }),
          salesApi.testDrives(currentUser, { status: 'REQUESTED' }),
          salesApi.reviewRequests(currentUser).catch(() => null),
        ]);
        setSellerLeads(sellersRes.items);
        setTasks(tasksRes);
        setTestDrives(testDrivesRes.items);
        setReviewRequests(reviewsRes);
      } else if (page === 'seller') {
        const res = await salesApi.sellerLeads(currentUser, {
          search,
          status: statusFilter || undefined,
          unassigned: unassignedFilter ? true : undefined,
        });
        setSellerLeads(res.items);
      } else if (page === 'buyer') {
        const res = await salesApi.buyerLeads(currentUser, {
          search,
          status: statusFilter || undefined,
        });
        setBuyerLeads(res.items);
      } else if (page === 'inspections') {
        const res = await salesApi.allInspectionRequests(currentUser, { status: statusFilter || undefined });
        setInspectionRequests(res.items);
      } else if (page === 'offers') {
        const [offersRes, valuationsRes] = await Promise.all([
          salesApi.allAcquisitionOffers(currentUser, { status: statusFilter || undefined }),
          salesApi.allValuations(currentUser, { status: statusFilter || undefined }),
        ]);
        setAcquisitionOffers(offersRes.items);
        setValuations(valuationsRes.items);
      } else if (page === 'inventory') {
        const [invRes, custRes] = await Promise.all([
          salesApi.inventory(currentUser, { search }),
          salesApi.customers(currentUser, { limit: 100 }).catch(() => ({ items: [] })),
        ]);
        setInventory(invRes.items);
        if (custRes?.items) setCustomers(custRes.items);
      } else if (page === 'testdrives') {
        const [tdRes, invRes, custRes] = await Promise.all([
          salesApi.testDrives(currentUser, { search, status: statusFilter || undefined }),
          salesApi.inventory(currentUser, {}),
          salesApi.customers(currentUser, { limit: 100 }).catch(() => ({ items: [] })),
        ]);
        setTestDrives(tdRes.items);
        setInventory(invRes.items);
        if (custRes?.items) setCustomers(custRes.items);
      } else if (page === 'pipeline') {
        const [quotesRes, reserveRes, invRes, custRes] = await Promise.all([
          salesApi.quotations(currentUser, { search, status: statusFilter || undefined }),
          salesApi.reservations(currentUser, {}),
          salesApi.inventory(currentUser, {}),
          salesApi.customers(currentUser, { limit: 100 }).catch(() => ({ items: [] })),
        ]);
        setQuotations(quotesRes.items);
        setReservations(reserveRes.items);
        setInventory(invRes.items);
        if (custRes?.items) setCustomers(custRes.items);
      } else if (page === 'tasks') {
        const res = await salesApi.tasks(currentUser, { status: statusFilter || undefined });
        setTasks(res);
      } else if (page === 'customers' || page === 'communications') {
        const res = await salesApi.customers(currentUser, { search: page === 'customers' ? search : undefined });
        setCustomers(res.items);
      } else if (page === 'reports') {
        const rep = await salesApi.reports(currentUser);
        setReports(rep);
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403) {
        setDenied(true);
      } else {
        const msg = err instanceof ApiError ? `Error: ${err.code} (${err.status})` : (err?.message || 'Unable to connect to the V MOTIV Sales service.');
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) void loadData(user);
  }, [user, page, statusFilter, unassignedFilter]);

  if (!user) return <SignIn />;
  if (loading) return <div className="auth-screen"><p className="eyebrow">INITIALIZING WORKSPACE…</p></div>;

  if (denied) {
    return (
      <main className="center-state">
        <img className="auth-logo" src="/brand/vmotiv-logo.svg" alt="V MOTIV" style={{ margin: '0 auto 1.5rem' }} />
        <p className="eyebrow">ACCESS NOT GRANTED</p>
        <h1>Sales Access Required</h1>
        <p>Your signed-in Google account ({user.email}) does not have an active Sales Executive role and branch assignment. Please contact an administrator to activate your employee account.</p>
        <button className="button btn-primary" onClick={() => auth && signOut(auth)}>
          Use another account
        </button>
      </main>
    );
  }

  if (!actor && error) {
    return (
      <main className="center-state">
        <img className="auth-logo" src="/brand/vmotiv-logo.svg" alt="V MOTIV" style={{ margin: '0 auto 1.5rem' }} />
        <p className="eyebrow">SERVICE CONNECTION ISSUE</p>
        <h1>Unable to Connect</h1>
        <p style={{ maxWidth: '480px', margin: '0 auto 1.5rem' }}>{error}</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button className="button btn-primary" onClick={() => void loadData(user)}>
            Retry Connection
          </button>
          <button className="button btn-secondary" onClick={() => auth && signOut(auth)}>
            Sign Out
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div className="brand">
          <img src="/brand/vmotiv-logo.svg" alt="V MOTIV" />
          <span>Sales</span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">Core Operations</div>
          <button className={`nav-item ${page === 'overview' ? 'active' : ''}`} onClick={() => setPage('overview')}>
            <Icons.Overview size={17} /> Overview
          </button>
          <button className={`nav-item ${page === 'seller' ? 'active' : ''}`} onClick={() => setPage('seller')}>
            <Icons.SellerLeads size={17} /> Seller Leads
          </button>
          <button className={`nav-item ${page === 'buyer' ? 'active' : ''}`} onClick={() => setPage('buyer')}>
            <Icons.BuyerLeads size={17} /> Buyer Leads
          </button>

          <div className="nav-section-title">Acquisition (Buy Car)</div>
          <button className={`nav-item ${page === 'inspections' ? 'active' : ''}`} onClick={() => setPage('inspections')}>
            <Icons.Inspections size={17} /> Inspection Requests
          </button>
          <button className={`nav-item ${page === 'offers' ? 'active' : ''}`} onClick={() => setPage('offers')}>
            <Icons.Offers size={17} /> Acquisition Offers
          </button>

          <div className="nav-section-title">Deal Execution (Sell Car)</div>
          <button className={`nav-item ${page === 'inventory' ? 'active' : ''}`} onClick={() => setPage('inventory')}>
            <Icons.Inventory size={17} /> Inventory Stock
          </button>
          <button className={`nav-item ${page === 'testdrives' ? 'active' : ''}`} onClick={() => setPage('testdrives')}>
            <Icons.TestDrives size={17} /> Test Drives
          </button>
          <button className={`nav-item ${page === 'pipeline' ? 'active' : ''}`} onClick={() => setPage('pipeline')}>
            <Icons.Pipeline size={17} /> Pipeline & Quotes
          </button>

          <div className="nav-section-title">Client & Follow-ups</div>
          <button className={`nav-item ${page === 'tasks' ? 'active' : ''}`} onClick={() => setPage('tasks')}>
            <Icons.Tasks size={17} /> Tasks & Follow-ups
          </button>
          <button className={`nav-item ${page === 'customers' ? 'active' : ''}`} onClick={() => setPage('customers')}>
            <Icons.Customers size={17} /> Customers CRM
          </button>
          <button className={`nav-item ${page === 'communications' ? 'active' : ''}`} onClick={() => setPage('communications')}>
            <Icons.Communications size={17} /> Communications
          </button>
          <button className={`nav-item ${page === 'reports' ? 'active' : ''}`} onClick={() => setPage('reports')}>
            <Icons.Reports size={17} /> Funnel & Reports
          </button>
        </nav>

        <div className="sidebar-account">
          <span>{actor?.displayName || actor?.email}</span>
          <small>{actor?.roles[0]?.replace('_', ' ') || 'SALES EXECUTIVE'}</small>
          <button className="btn-signout" onClick={() => auth && signOut(auth)}>
            <Icons.Logout size={15} /> Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="main-wrapper">
        {/* TOPBAR */}
        <header className="topbar">
          <div className="topbar-left">
            <div className="branch-badge">
              <Icons.MapPin size={13} />
              <span>{actor?.globalScope ? 'All Branches (HQ)' : actor?.branches.map(b => b.city).join(', ') || 'Branch'}</span>
            </div>
          </div>

          <div className="topbar-right">
            {/* Notification Pill */}
            <div className="notif-wrapper">
              <button className="notif-button" onClick={() => setShowNotifs(!showNotifs)} aria-label="Notifications">
                <Icons.Bell size={18} />
                {(notifications?.totalUnread ?? 0) > 0 && (
                  <span className="notif-badge">{notifications?.totalUnread}</span>
                )}
              </button>

              {showNotifs && notifications && (
                <div className="notif-dropdown">
                  <div className="notif-dropdown-head">
                    <h4>Action Items</h4>
                    <span className="font-mono text-xs">{notifications.totalUnread} pending</span>
                  </div>
                  <div className="notif-list">
                    {notifications.pendingOfferReviews?.map(o => (
                      <div
                        key={o.id}
                        className="notif-item"
                        style={{ cursor: 'pointer' }}
                        onClick={async () => {
                          if (!user) return;
                          setShowNotifs(false);
                          const leadDetails = await salesApi.sellerLead(user, o.leadId);
                          setSelectedSellerLead(leadDetails);
                        }}
                      >
                        <div className="notif-item-title" style={{ color: 'var(--warning)' }}>
                          Offer Review Pending: {formatCurrency(o.recommendedPurchasePaise)}
                        </div>
                        <div className="notif-item-sub">{o.vehicleTitle} · {o.sellerName} ({o.referenceCode})</div>
                      </div>
                    ))}
                    {notifications.pendingDiscounts?.map(d => (
                      <div
                        key={d.id}
                        className="notif-item"
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          setShowNotifs(false);
                          setPage('pipeline');
                        }}
                      >
                        <div className="notif-item-title" style={{ color: 'var(--color-primary)' }}>
                          Discount Pending: {formatCurrency(d.requestedDiscountPaise)}
                        </div>
                        <div className="notif-item-sub">{d.vehicleTitle} · {d.customerName}</div>
                      </div>
                    ))}
                    {notifications.sentQuotations?.map(s => (
                      <div key={s.id} className="notif-item">
                        <div className="notif-item-title">
                          Quote Sent: {s.quotationNumber}
                        </div>
                        <div className="notif-item-sub">{s.vehicleTitle} · {s.customerName} · {formatCurrency(s.finalPricePaise)}</div>
                      </div>
                    ))}
                    {notifications.pendingTestDrives?.map(td => (
                      <div key={td.id} className="notif-item">
                        <div className="notif-item-title">Test Drive: {td.listing.title}</div>
                        <div className="notif-item-sub">{td.user?.displayName || 'Customer'} · {td.requestedDate} ({td.timeSlot})</div>
                      </div>
                    ))}
                    {notifications.unassignedLeads.map(l => (
                      <div key={l.id} className="notif-item">
                        <div className="notif-item-title">Unassigned: {l.make} {l.model}</div>
                        <div className="notif-item-sub">{l.city} · Ref: {l.referenceCode}</div>
                      </div>
                    ))}
                    {notifications.overdueTasks.map(t => (
                      <div key={t.id} className="notif-item">
                        <div className="notif-item-title" style={{ color: 'var(--color-destructive)' }}>Overdue: {t.type}</div>
                        <div className="notif-item-sub">{t.details}</div>
                      </div>
                    ))}
                    {notifications.totalUnread === 0 && (
                      <p className="empty-state" style={{ padding: '12px' }}>All caught up!</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button className="btn-secondary btn-sm" onClick={() => void loadData()}>
              <Icons.Refresh size={14} /> Refresh
            </button>
          </div>
        </header>

        {/* CONTENT AREA */}
        <main className="content-area">
          {error && <div className="error-banner">{error}</div>}

          {/* ==================================================== */}
          {/* VIEW: OVERVIEW */}
          {/* ==================================================== */}
          {page === 'overview' && (
            <div>
              <div className="page-header">
                <div>
                  <p className="eyebrow">SALES DASHBOARD</p>
                  <h1>Today's Activity & Queue</h1>
                </div>
                <div className="page-header-actions">
                  <button className="btn-primary" onClick={() => setShowManualLeadModal(true)}>
                    <Icons.Plus size={15} /> Record Walk-in Seller
                  </button>
                </div>
              </div>

              {/* KPI Metrics */}
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-label">Seller Leads To Qualify</div>
                  <div className="metric-value">{dashboard?.unassignedCount ?? 0}</div>
                  <div className="metric-sub">Inbound awaiting first call</div>
                </div>
                <div className="metric-card" style={dashboard?.pendingValuationsCount ? { border: '1px solid rgba(255, 209, 102, 0.5)', background: 'rgba(255, 209, 102, 0.05)' } : {}}>
                  <div className="metric-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Offers Pending Review</span>
                    {Boolean(dashboard?.pendingValuationsCount) && (
                      <span className="badge badge-amber">🟡 Pending</span>
                    )}
                  </div>
                  <div className="metric-value" style={{ color: dashboard?.pendingValuationsCount ? 'var(--warning)' : undefined }}>
                    {dashboard?.pendingValuationsCount ?? 0}
                  </div>
                  <div className="metric-sub">Awaiting Admin/Manager Decision</div>
                </div>
                <div className="metric-card" style={dashboard?.pendingDiscountsCount ? { border: '1px solid rgba(255, 209, 102, 0.5)', background: 'rgba(255, 209, 102, 0.05)' } : {}}>
                  <div className="metric-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Discount Approvals</span>
                    {Boolean(dashboard?.pendingDiscountsCount) && (
                      <span className="badge badge-amber">🟡 Pending</span>
                    )}
                  </div>
                  <div className="metric-value" style={{ color: dashboard?.pendingDiscountsCount ? 'var(--warning)' : undefined }}>
                    {dashboard?.pendingDiscountsCount ?? 0}
                  </div>
                  <div className="metric-sub">Quotation discount reviews</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Follow-ups Due Today</div>
                  <div className="metric-value">{dashboard?.tasksDueToday ?? 0}</div>
                  <div className="metric-sub">Scheduled customer tasks</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Upcoming Test Drives</div>
                  <div className="metric-value">{dashboard?.upcomingTestDrives ?? 0}</div>
                  <div className="metric-sub">Awaiting confirmation</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Active Purchase Offers</div>
                  <div className="metric-value">{dashboard?.openOffersCount ?? 0}</div>
                  <div className="metric-sub">Communicated to sellers</div>
                </div>
              </div>

              {/* Dedicated Panel: Review & Approval Requests */}
              <div className="panel" style={{ marginBottom: '24px' }}>
                <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icons.Offers size={18} />
                      Commercial Approval & Review Queue
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                      Track status of acquisition purchase offers and retail discount requests under management review
                    </p>
                  </div>
                  <div className="tabs-nav" style={{ margin: 0 }}>
                    <button
                      className={`tab-btn ${reviewTab === 'pending' ? 'active' : ''}`}
                      onClick={() => setReviewTab('pending')}
                    >
                      Pending Admin Decision ({((reviewRequests?.pendingValuations?.length ?? 0) + (reviewRequests?.pendingDiscounts?.length ?? 0))})
                    </button>
                    <button
                      className={`tab-btn ${reviewTab === 'decided' ? 'active' : ''}`}
                      onClick={() => setReviewTab('decided')}
                    >
                      Recent Decisions (Approved / Rejected) ({reviewRequests?.recentDecisions?.length ?? 0})
                    </button>
                  </div>
                </div>

                {reviewTab === 'pending' && (
                  <div className="table-responsive">
                    <table>
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Reference & Party</th>
                          <th>Vehicle</th>
                          <th>Proposed Amount</th>
                          <th>Submitted By</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reviewRequests?.pendingValuations?.map(pv => (
                          <tr key={`val-${pv.id}`}>
                            <td>
                              <span className="badge badge-purple">Acquisition Offer</span>
                            </td>
                            <td>
                              <div className="table-title font-mono text-xs">{pv.referenceCode}</div>
                              <div className="table-sub">{pv.sellerName} · {pv.sellerPhone}</div>
                            </td>
                            <td>
                              <div className="table-title">{pv.vehicleTitle}</div>
                              {pv.expectedResalePaise && (
                                <div className="table-sub">Target Resale: {formatCurrency(pv.expectedResalePaise)}</div>
                              )}
                            </td>
                            <td className="font-mono" style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                              {formatCurrency(pv.recommendedPurchasePaise)}
                            </td>
                            <td>
                              <div style={{ fontSize: '0.85rem' }}>{pv.requestedBy}</div>
                              <div className="table-sub">{formatDate(pv.createdAt)}</div>
                            </td>
                            <td>
                              <span className="badge badge-amber" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span>🟡</span> Awaiting Admin Review
                              </span>
                            </td>
                            <td>
                              <button
                                className="btn-secondary btn-sm"
                                onClick={async () => {
                                  if (!user) return;
                                  const leadDetails = await salesApi.sellerLead(user, pv.leadId);
                                  setSelectedSellerLead(leadDetails);
                                }}
                              >
                                Manage Lead
                              </button>
                            </td>
                          </tr>
                        ))}

                        {reviewRequests?.pendingDiscounts?.map(pd => (
                          <tr key={`disc-${pd.id}`}>
                            <td>
                              <span className="badge badge-blue">Quotation Discount</span>
                            </td>
                            <td>
                              <div className="table-title font-mono text-xs">{pd.quotationNumber}</div>
                              <div className="table-sub">{pd.customerName}</div>
                            </td>
                            <td>
                              <div className="table-title">{pd.vehicleTitle}</div>
                              <div className="table-sub" title={pd.reason}>Reason: {pd.reason}</div>
                            </td>
                            <td className="font-mono" style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                              Discount: {formatCurrency(pd.requestedDiscountPaise)}
                              <div className="table-sub">Final: {formatCurrency(pd.proposedPricePaise)}</div>
                            </td>
                            <td>
                              <div style={{ fontSize: '0.85rem' }}>{pd.requestedBy}</div>
                              <div className="table-sub">{formatDate(pd.createdAt)}</div>
                            </td>
                            <td>
                              <span className="badge badge-amber" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span>🟡</span> Awaiting Admin Review
                              </span>
                            </td>
                            <td>
                              <button
                                className="btn-secondary btn-sm"
                                onClick={() => setPage('pipeline')}
                              >
                                View Pipeline
                              </button>
                            </td>
                          </tr>
                        ))}

                        {(!reviewRequests?.pendingValuations?.length && !reviewRequests?.pendingDiscounts?.length) && (
                          <tr>
                            <td colSpan={7} className="empty-state">
                              No review requests currently awaiting Admin approval.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {reviewTab === 'decided' && (
                  <div className="table-responsive">
                    <table>
                      <thead>
                        <tr>
                          <th>Decision</th>
                          <th>Type</th>
                          <th>Reference & Party</th>
                          <th>Vehicle</th>
                          <th>Amount</th>
                          <th>Decided By & When</th>
                          <th>Admin Notes / Reason</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reviewRequests?.recentDecisions?.map(rd => {
                          const isApproved = rd.status === 'APPROVED';
                          return (
                            <tr key={`dec-${rd.id}-${rd.type}`}>
                              <td>
                                <span className={`badge ${isApproved ? 'badge-green' : 'badge-red'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <span>{isApproved ? '🟢' : '🔴'}</span>
                                  {isApproved ? 'Approved' : 'Rejected'}
                                </span>
                              </td>
                              <td>
                                <span className={`badge ${rd.type === 'VALUATION_OFFER' ? 'badge-purple' : 'badge-blue'}`}>
                                  {rd.type === 'VALUATION_OFFER' ? 'Acquisition Offer' : 'Quotation Discount'}
                                </span>
                              </td>
                              <td>
                                <div className="table-title font-mono text-xs">{rd.referenceCode}</div>
                                <div className="table-sub">{rd.partyName}</div>
                              </td>
                              <td>{rd.title}</td>
                              <td className="font-mono" style={{ fontWeight: 700 }}>
                                {formatCurrency(rd.amountPaise)}
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{rd.decidedBy || 'Admin'}</div>
                                <div className="table-sub">{formatDate(rd.decidedAt)}</div>
                              </td>
                              <td style={{ maxWidth: '280px' }}>
                                {rd.decisionNotes ? (
                                  <div style={{
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    lineHeight: 1.4,
                                    background: isApproved ? 'rgba(97, 217, 154, 0.1)' : 'rgba(255, 124, 134, 0.1)',
                                    color: isApproved ? 'var(--success)' : 'var(--danger)',
                                    border: `1px solid ${isApproved ? 'rgba(97, 217, 154, 0.3)' : 'rgba(255, 124, 134, 0.3)'}`
                                  }}>
                                    {rd.decisionNotes}
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>None provided</span>
                                )}
                              </td>
                              <td>
                                {rd.type === 'VALUATION_OFFER' ? (
                                  <button
                                    className="btn-secondary btn-sm"
                                    onClick={async () => {
                                      if (!user) return;
                                      const leadDetails = await salesApi.sellerLead(user, rd.referenceId);
                                      setSelectedSellerLead(leadDetails);
                                    }}
                                  >
                                    Manage Lead
                                  </button>
                                ) : (
                                  <button
                                    className="btn-secondary btn-sm"
                                    onClick={() => setPage('pipeline')}
                                  >
                                    View Quote
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}

                        {(!reviewRequests?.recentDecisions?.length) && (
                          <tr>
                            <td colSpan={8} className="empty-state">
                              No recent review decisions recorded.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Work Queue & Recent Activity */}
              <div className="panel">
                <div className="panel-header">
                  <h3>Seller Enquiries Needing Action</h3>
                  <button className="btn-outline btn-sm" onClick={() => setPage('seller')}>View All Seller Leads</button>
                </div>
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Vehicle & Seller</th>
                        <th>City</th>
                        <th>Expected Price</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sellerLeads.slice(0, 5).map(lead => (
                        <tr key={lead.id}>
                          <td>
                            <div className="table-title">{lead.manufacturingYear} {lead.make} {lead.model}</div>
                            <div className="table-sub">{lead.sellerName} · {lead.sellerPhone}</div>
                          </td>
                          <td>{lead.city}</td>
                          <td className="font-mono">{formatCurrency(lead.expectedPricePaise)}</td>
                          <td><span className={`badge ${statusBadgeClass(lead.status)}`}>{lead.status}</span></td>
                          <td>
                            <button className="btn-secondary btn-sm" onClick={() => setSelectedSellerLead(lead)}>
                              Manage Lead
                            </button>
                          </td>
                        </tr>
                      ))}
                      {sellerLeads.length === 0 && (
                        <tr><td colSpan={5} className="empty-state">No active seller enquiries in queue.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW: SELLER LEADS (WORKFLOW A) */}
          {/* ==================================================== */}
          {page === 'seller' && (
            <div>
              <div className="page-header">
                <div>
                  <p className="eyebrow">WORKFLOW A · VEHICLE ACQUISITION</p>
                  <h1>Seller Leads Management</h1>
                </div>
                <div className="page-header-actions">
                  <button className="btn-primary" onClick={() => setShowManualLeadModal(true)}>
                    <Icons.Plus size={15} /> New Walk-in / Phone Lead
                  </button>
                </div>
              </div>

              <div className="panel">
                <div className="filters-bar">
                  <div className="search-input-box">
                    <Icons.Search size={15} />
                    <input
                      placeholder="Search seller name, phone, make, model..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && void loadData()}
                    />
                  </div>

                  <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">All Statuses</option>
                    <option value="SUBMITTED">Submitted (New)</option>
                    <option value="QUALIFYING">Qualifying</option>
                    <option value="INSPECTION_SCHEDULED">Inspection Scheduled</option>
                    <option value="OFFER_PENDING">Offer Pending</option>
                    <option value="OFFERED">Offer Communicated</option>
                    <option value="ACCEPTED">Offer Accepted</option>
                    <option value="REJECTED">Rejected / Cancelled</option>
                  </select>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={unassignedFilter}
                      onChange={e => setUnassignedFilter(e.target.checked)}
                    />
                    <span>Unassigned Only</span>
                  </label>

                  <button className="btn-secondary btn-sm" onClick={() => void loadData()}>Filter</button>
                </div>

                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Ref Code</th>
                        <th>Seller & Vehicle</th>
                        <th>Location</th>
                        <th>Odometer</th>
                        <th>Expected</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sellerLeads.map(lead => (
                        <tr key={lead.id}>
                          <td className="font-mono text-xs">{lead.referenceCode}</td>
                          <td>
                            <div className="table-title">{lead.manufacturingYear} {lead.make} {lead.model} {lead.variant || ''}</div>
                            <div className="table-sub">{lead.sellerName} · {lead.sellerPhone}</div>
                          </td>
                          <td>{lead.city} ({lead.pincode})</td>
                          <td className="font-mono">{lead.odometerKm.toLocaleString('en-IN')} km</td>
                          <td className="font-mono">{formatCurrency(lead.expectedPricePaise)}</td>
                          <td><span className={`badge ${statusBadgeClass(lead.status)}`}>{lead.status}</span></td>
                          <td>
                            <button className="btn-secondary btn-sm" onClick={() => setSelectedSellerLead(lead)}>
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                      {sellerLeads.length === 0 && (
                        <tr><td colSpan={7} className="empty-state">No seller leads found matching the filters.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW: BUYER LEADS (WORKFLOW B) */}
          {/* ==================================================== */}
          {page === 'buyer' && (
            <div>
              <div className="page-header">
                <div>
                  <p className="eyebrow">WORKFLOW B · RETAIL SALES</p>
                  <h1>Inbound Buyer Enquiries</h1>
                </div>
              </div>

              <div className="panel">
                <div className="filters-bar">
                  <div className="search-input-box">
                    <Icons.Search size={15} />
                    <input
                      placeholder="Search buyer name, email, vehicle title..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && void loadData()}
                    />
                  </div>
                  <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">All Statuses</option>
                    <option value="RECEIVED">Received</option>
                    <option value="IN_REVIEW">In Review</option>
                    <option value="CONTACTED">Contacted</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                  <button className="btn-secondary btn-sm" onClick={() => void loadData()}>Filter</button>
                </div>

                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Interested In (Vehicle)</th>
                        <th>Listing Price</th>
                        <th>Availability</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buyerLeads.map(lead => (
                        <tr key={lead.id}>
                          <td>
                            <div className="table-title">{lead.user.displayName || lead.user.email}</div>
                            <div className="table-sub">{lead.user.phone || 'No phone'} · {lead.user.preferredCity || 'Any'}</div>
                          </td>
                          <td>
                            <div className="table-title">{lead.listing.title}</div>
                            <div className="table-sub">{lead.listing.vehicle.make} {lead.listing.vehicle.model} ({lead.listing.vehicle.city})</div>
                          </td>
                          <td className="font-mono">{formatCurrency(lead.listing.pricePaise)}</td>
                          <td><span className={`badge ${statusBadgeClass(lead.listing.status)}`}>{lead.listing.status}</span></td>
                          <td><span className={`badge ${statusBadgeClass(lead.status)}`}>{lead.status}</span></td>
                          <td>
                            <button className="btn-secondary btn-sm" onClick={() => setSelectedBuyerLead(lead)}>
                              Manage
                            </button>
                          </td>
                        </tr>
                      ))}
                      {buyerLeads.length === 0 && (
                        <tr><td colSpan={6} className="empty-state">No buyer enquiries found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW: INSPECTION REQUESTS */}
          {/* ==================================================== */}
          {page === 'inspections' && (
            <div>
              <div className="page-header">
                <div>
                  <p className="eyebrow">VEHICLE EVALUATION WORKFLOW</p>
                  <h1>Inspection Requests & Progress</h1>
                </div>
              </div>

              <div className="panel">
                <div className="filters-bar">
                  <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">All Statuses</option>
                    <option value="REQUESTED">Requested</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                  <button className="btn-secondary btn-sm" onClick={() => void loadData()}>Filter</button>
                </div>

                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Lead Ref</th>
                        <th>Seller & Vehicle</th>
                        <th>Location Type</th>
                        <th>Requested Date / Slot</th>
                        <th>Address</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspectionRequests.map(req => (
                        <tr key={req.id}>
                          <td className="font-mono text-xs">{req.lead.referenceCode}</td>
                          <td>
                            <div className="table-title">{req.lead.make} {req.lead.model}</div>
                            <div className="table-sub">{req.lead.sellerName} · {req.lead.sellerPhone}</div>
                          </td>
                          <td><span className="badge badge-gray">{req.locationType}</span></td>
                          <td>
                            <div>{formatDate(req.requestedDate)}</div>
                            <div className="table-sub font-mono">{req.timeSlot || '—'}</div>
                          </td>
                          <td>{req.address || req.lead.city}</td>
                          <td><span className={`badge ${statusBadgeClass(req.status)}`}>{req.status}</span></td>
                          <td>
                            <button
                              className="btn-secondary btn-sm"
                              onClick={async () => {
                                if (!user) return;
                                const leadDetails = await salesApi.sellerLead(user, req.leadId);
                                setSelectedSellerLead(leadDetails);
                              }}
                            >
                              Manage Lead
                            </button>
                          </td>
                        </tr>
                      ))}
                      {inspectionRequests.length === 0 && (
                        <tr><td colSpan={7} className="empty-state">No inspection requests found matching current filter.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW: ACQUISITION OFFERS & VALUATION REVIEWS */}
          {/* ==================================================== */}
          {page === 'offers' && (
            <div>
              <div className="page-header">
                <div>
                  <p className="eyebrow">COMMERCIAL VALUATIONS & ACQUISITION OFFERS</p>
                  <h1>Authorized Valuations & Offer Lifecycle</h1>
                </div>
              </div>

              <div className="panel">
                <div className="filters-bar">
                  <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">All Offers & Valuations</option>
                    <option value="PENDING_APPROVAL">Pending Admin Review (Offer Requested)</option>
                    <option value="APPROVED">Admin Approved Valuations</option>
                    <option value="REJECTED">Admin Rejected Valuations</option>
                    <option value="OFFERED">Communicated / Offered to Seller</option>
                    <option value="ACCEPTED">Accepted by Seller</option>
                    <option value="DECLINED">Declined by Seller</option>
                    <option value="EXPIRED">Expired</option>
                  </select>
                  <button className="btn-secondary btn-sm" onClick={() => void loadData()}>Filter</button>
                </div>

                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Lead Ref</th>
                        <th>Seller & Vehicle</th>
                        <th>Amount</th>
                        <th>Type / Version</th>
                        <th>Review / Offer Status</th>
                        <th>Decider & Notes</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Valuations (Pending, Approved, Rejected) */}
                      {valuations
                        .filter(v => !statusFilter || v.status === statusFilter)
                        .map(val => (
                          <tr key={`val-row-${val.id}`}>
                            <td className="font-mono text-xs">{val.lead?.referenceCode || val.leadId.slice(0, 8)}</td>
                            <td>
                              <div className="table-title">{val.lead ? `${val.lead.manufacturingYear} ${val.lead.make} ${val.lead.model}` : 'Vehicle'}</div>
                              <div className="table-sub">{val.lead ? `${val.lead.sellerName} · ${val.lead.sellerPhone} (${val.lead.city})` : 'Seller'}</div>
                            </td>
                            <td className="font-mono" style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                              {formatCurrency(val.recommendedPurchasePaise)}
                              {val.expectedResalePaise && (
                                <div className="table-sub">Target Resale: {formatCurrency(val.expectedResalePaise)}</div>
                              )}
                            </td>
                            <td>
                              <span className="badge badge-purple">Valuation v{val.version}</span>
                            </td>
                            <td>
                              {val.status === 'PENDING_APPROVAL' && (
                                <span className="badge badge-amber" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <span>🟡</span> Requested for Review
                                </span>
                              )}
                              {val.status === 'APPROVED' && (
                                <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <span>🟢</span> Approved by Admin
                                </span>
                              )}
                              {val.status === 'REJECTED' && (
                                <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <span>🔴</span> Rejected by Admin
                                </span>
                              )}
                              {!['PENDING_APPROVAL', 'APPROVED', 'REJECTED'].includes(val.status) && (
                                <span className={`badge ${statusBadgeClass(val.status)}`}>{val.status}</span>
                              )}
                            </td>
                            <td style={{ maxWidth: '280px' }}>
                              {val.approvedBy?.user?.displayName ? (
                                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>By: {val.approvedBy.user.displayName}</div>
                              ) : (
                                <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>By: {val.createdBy?.user?.displayName || 'Sales Executive'}</div>
                              )}
                              {val.notes ? (
                                <div style={{
                                  marginTop: '4px',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '0.78rem',
                                  lineHeight: 1.3,
                                  background: val.status === 'REJECTED' ? 'rgba(255, 124, 134, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                                  color: val.status === 'REJECTED' ? 'var(--danger)' : 'var(--text)',
                                }}>
                                  {val.notes}
                                </div>
                              ) : null}
                            </td>
                            <td>
                              <button
                                className="btn-secondary btn-sm"
                                onClick={async () => {
                                  if (!user) return;
                                  const leadDetails = await salesApi.sellerLead(user, val.leadId);
                                  setSelectedSellerLead(leadDetails);
                                }}
                              >
                                Manage Lead
                              </button>
                            </td>
                          </tr>
                        ))}

                      {/* Issued Acquisition Offers */}
                      {acquisitionOffers
                        .filter(off => !statusFilter || off.status === statusFilter)
                        .map(off => (
                          <tr key={`off-row-${off.id}`}>
                            <td className="font-mono text-xs">{off.lead.referenceCode}</td>
                            <td>
                              <div className="table-title">{off.lead.make} {off.lead.model}</div>
                              <div className="table-sub">{off.lead.sellerName} · {off.lead.sellerPhone}</div>
                            </td>
                            <td className="font-mono" style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                              {formatCurrency(off.offerAmountPaise)}
                            </td>
                            <td>
                              <span className="badge badge-blue">Official Offer v{off.version}</span>
                            </td>
                            <td>
                              <span className={`badge ${statusBadgeClass(off.status)}`}>{off.status}</span>
                              <div className="table-sub">Valid: {formatDate(off.validUntil)}</div>
                            </td>
                            <td style={{ maxWidth: '280px' }}>
                              {off.declineReason ? (
                                <div style={{
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '0.78rem',
                                  background: 'rgba(255, 124, 134, 0.12)',
                                  color: 'var(--danger)',
                                }}>
                                  Declined: {off.declineReason}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Issued to Seller</span>
                              )}
                            </td>
                            <td>
                              <button
                                className="btn-secondary btn-sm"
                                onClick={async () => {
                                  if (!user) return;
                                  const leadDetails = await salesApi.sellerLead(user, off.leadId);
                                  setSelectedSellerLead(leadDetails);
                                }}
                              >
                                Manage Offer
                              </button>
                            </td>
                          </tr>
                        ))}

                      {valuations.length === 0 && acquisitionOffers.length === 0 && (
                        <tr><td colSpan={7} className="empty-state">No commercial valuations or acquisition offers recorded yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW: INVENTORY CATALOGUE */}
          {/* ==================================================== */}
          {page === 'inventory' && (
            <div>
              <div className="page-header">
                <div>
                  <p className="eyebrow">READ-ONLY CATALOGUE</p>
                  <h1>Authorized Vehicle Stock</h1>
                </div>
              </div>

              <div className="panel">
                <div className="filters-bar">
                  <div className="search-input-box">
                    <Icons.Search size={15} />
                    <input
                      placeholder="Search make, model, registration..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && void loadData()}
                    />
                  </div>
                  <button className="btn-secondary btn-sm" onClick={() => void loadData()}>Search Stock</button>
                </div>

                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Vehicle & Specs</th>
                        <th>Listing ID (UUID)</th>
                        <th>City</th>
                        <th>Odometer</th>
                        <th>Fuel & Trans</th>
                        <th>Authorized Price</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.map(item => (
                        <tr key={item.id}>
                          <td>
                            <div className="table-title">{item.title}</div>
                            <div className="table-sub">{item.vehicle.make} {item.vehicle.model} {item.vehicle.variant || ''}</div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className="font-mono" style={{ fontSize: '12px', color: 'var(--yellow)' }}>
                                {item.id.slice(0, 8)}…{item.id.slice(-4)}
                              </span>
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'unset' }}
                                onClick={() => navigator.clipboard.writeText(item.id)}
                                title={`Copy full Listing ID: ${item.id}`}
                              >
                                Copy
                              </button>
                            </div>
                          </td>
                          <td>{item.vehicle.city || '—'}</td>
                          <td className="font-mono">{item.vehicle.odometerKm.toLocaleString('en-IN')} km</td>
                          <td>{item.vehicle.fuelType} · {item.vehicle.transmission}</td>
                          <td className="font-mono" style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                            {formatCurrency(item.pricePaise)}
                          </td>
                          <td><span className={`badge ${statusBadgeClass(item.status)}`}>{item.status}</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                className="btn-secondary btn-sm"
                                onClick={() => {
                                  setTargetListingId(item.id);
                                  setShowQuotationModal(true);
                                }}
                                title="Prepare Quotation"
                              >
                                Quote
                              </button>
                              <button
                                className="btn-outline btn-sm"
                                onClick={() => {
                                  setTargetListingId(item.id);
                                  setShowTestDriveModal(true);
                                }}
                                title="Book Test Drive"
                              >
                                Test Drive
                              </button>
                              {item.status === 'RESERVED' ? (
                                <button
                                  className="btn-danger btn-sm"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  onClick={() => {
                                    setTargetReleaseListing(item);
                                    setTargetReleaseReservation(item.reservations?.[0] || null);
                                    setShowReleaseModal(true);
                                  }}
                                  title="Unreserve / Release Stock"
                                >
                                  <Icons.Close size={13} /> Unreserve
                                </button>
                              ) : (
                                <button
                                  className="btn-outline btn-sm"
                                  onClick={() => {
                                    setTargetListingId(item.id);
                                    setShowReservationModal(true);
                                  }}
                                  title="Reserve Stock"
                                >
                                  Reserve
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {inventory.length === 0 && (
                        <tr><td colSpan={8} className="empty-state">No available vehicles in branch scope.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW: TEST DRIVES */}
          {/* ==================================================== */}
          {page === 'testdrives' && (
            <div>
              <div className="page-header">
                <div>
                  <p className="eyebrow">CUSTOMER EXPERIENCE</p>
                  <h1>Test Drive Appointments</h1>
                </div>
                <div className="page-header-actions">
                  <button className="btn-primary" onClick={() => setShowTestDriveModal(true)}>
                    <Icons.Plus size={15} /> Book Test Drive
                  </button>
                </div>
              </div>

              <div className="panel">
                <div className="filters-bar">
                  <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">All Appointments</option>
                    <option value="REQUESTED">Requested</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                    <option value="NO_SHOW">No Show</option>
                  </select>
                </div>

                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Date & Time Slot</th>
                        <th>Customer</th>
                        <th>Vehicle</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Update Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testDrives.map(td => (
                        <tr key={td.id}>
                          <td>
                            <div className="table-title">{formatDate(td.requestedDate)}</div>
                            <div className="table-sub font-mono">{td.timeSlot}</div>
                          </td>
                          <td>
                            <div className="table-title">{td.user.displayName || td.user.email}</div>
                            <div className="table-sub">{td.user.phone || 'No phone'}</div>
                          </td>
                          <td>{td.listing.title}</td>
                          <td>{td.serviceCity || td.branch?.city || 'Hub'}</td>
                          <td><span className={`badge ${statusBadgeClass(td.status)}`}>{td.status}</span></td>
                          <td>
                            {td.status === 'REQUESTED' && (
                              <button
                                className="btn-secondary btn-sm"
                                onClick={async () => {
                                  if (!user) return;
                                  await salesApi.updateTestDriveStatus(user, td.id, { status: 'CONFIRMED' });
                                  void loadData();
                                }}
                              >
                                Confirm
                              </button>
                            )}
                            {td.status === 'CONFIRMED' && (
                              <button
                                className="btn-primary btn-sm"
                                onClick={async () => {
                                  if (!user) return;
                                  await salesApi.updateTestDriveStatus(user, td.id, { status: 'COMPLETED' });
                                  void loadData();
                                }}
                              >
                                Complete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {testDrives.length === 0 && (
                        <tr><td colSpan={6} className="empty-state">No test drives scheduled.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW: SALES PIPELINE (QUOTES & RESERVATIONS) */}
          {/* ==================================================== */}
          {page === 'pipeline' && (
            <div>
              <div className="page-header">
                <div>
                  <p className="eyebrow">COMMERCIAL COORDINATION</p>
                  <h1>Quotations & Vehicle Reservations</h1>
                </div>
                <div className="page-header-actions">
                  <button className="btn-secondary" onClick={() => setShowReservationModal(true)}>
                    <Icons.Tag size={15} /> Reserve Stock
                  </button>
                  <button className="btn-primary" onClick={() => setShowQuotationModal(true)}>
                    <Icons.Plus size={15} /> Create Quotation
                  </button>
                </div>
              </div>

              {/* Quotations Panel */}
              <div className="panel">
                <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <h3>Authorized Retail Quotations</h3>
                  <select
                    className="filter-select"
                    style={{ width: 'auto', minWidth: '220px' }}
                    value={discountStatusFilter}
                    onChange={e => setDiscountStatusFilter(e.target.value)}
                  >
                    <option value="">All Discount Statuses</option>
                    <option value="PENDING">🟡 Discount Pending Review</option>
                    <option value="APPROVED">🟢 Discount Approved</option>
                    <option value="REJECTED">🔴 Discount Rejected</option>
                    <option value="NONE">No Discount Requested</option>
                  </select>
                </div>
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Quote #</th>
                        <th>Customer</th>
                        <th>Vehicle</th>
                        <th>Final Price</th>
                        <th>Valid Until</th>
                        <th>Status & Discount Review</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotations
                        .filter(q => {
                          if (!discountStatusFilter) return true;
                          if (discountStatusFilter === 'NONE') return !q.latestDiscountRequest;
                          return q.latestDiscountRequest?.status === discountStatusFilter;
                        })
                        .map(q => (
                        <tr key={q.id}>
                          <td className="font-mono text-xs">{q.quotationNumber || `VM-QT-${q.id.slice(0, 8).toUpperCase()}`}</td>
                          <td>
                            <div className="table-title">{q.customer.displayName || q.customer.email}</div>
                            <div className="table-sub">{q.customer.phone || (q.customer.email ? q.customer.email : 'No phone')}</div>
                          </td>
                          <td>{q.listing.title}</td>
                          <td className="font-mono" style={{ fontWeight: 700 }}>{formatCurrency(q.totalPricePaise ?? (q as any).finalAmountPaise)}</td>
                          <td>{formatDate(q.validUntil)}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span className={`badge ${statusBadgeClass(q.status)}`}>{q.status}</span>
                              {q.latestDiscountRequest && (
                                q.latestDiscountRequest.status === 'PENDING' ? (
                                  <span
                                    className="badge badge-amber"
                                    style={{ fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    title={`Reason: ${q.latestDiscountRequest.reason}`}
                                  >
                                    <span>🟡</span> Discount Pending ({formatCurrency(q.latestDiscountRequest.requestedDiscountPaise)})
                                  </span>
                                ) : q.latestDiscountRequest.status === 'APPROVED' ? (
                                  <span
                                    className="badge badge-green"
                                    style={{ fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    <span>🟢</span> Discount Approved (-{formatCurrency(q.latestDiscountRequest.requestedDiscountPaise)})
                                  </span>
                                ) : (
                                  <span
                                    className="badge badge-red"
                                    style={{ fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    title={q.latestDiscountRequest.decisionNotes || q.latestDiscountRequest.reason}
                                  >
                                    <span>🔴</span> Discount Rejected
                                  </span>
                                )
                              )}
                            </div>
                            {q.latestDiscountRequest?.status === 'REJECTED' && q.latestDiscountRequest.decisionNotes && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '2px', maxWidth: '200px' }}>
                                Admin: {q.latestDiscountRequest.decisionNotes}
                              </div>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {q.status === 'DRAFT' && (
                                <button
                                  className="btn-primary btn-sm"
                                  onClick={async () => {
                                    if (!user) return;
                                    await salesApi.submitQuotation(user, q.id);
                                    void loadData();
                                  }}
                                >
                                  Submit
                                </button>
                              )}
                              <button
                                className="btn-secondary btn-sm"
                                onClick={() => setShowDiscountModal(q.id)}
                              >
                                {q.latestDiscountRequest?.status === 'PENDING' ? 'Discount (Pending)' : 'Discount'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {quotations.length === 0 && (
                        <tr><td colSpan={7} className="empty-state">No retail quotations prepared yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Reservations Panel */}
              <div className="panel">
                <div className="panel-header">
                  <h3>Vehicle Reservations</h3>
                </div>
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Reservation #</th>
                        <th>Customer</th>
                        <th>Listing</th>
                        <th>Expires At</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reservations.map(r => (
                        <tr key={r.id}>
                          <td className="font-mono text-xs">{r.reservationNumber || `VM-RES-${r.id.slice(0, 8).toUpperCase()}`}</td>
                          <td>{r.customer.displayName || r.customer.email}</td>
                          <td>{r.listing.title}</td>
                          <td>{formatDate(r.expiresAt)}</td>
                          <td><span className={`badge ${statusBadgeClass(r.status)}`}>{r.status}</span></td>
                          <td>
                            {['CONFIRMED', 'REQUESTED'].includes(r.status) && (
                              <button
                                className="btn-danger btn-sm"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => {
                                  setTargetReleaseListing(null);
                                  setTargetReleaseReservation(r);
                                  setShowReleaseModal(true);
                                }}
                                title="Release reservation and return stock to inventory"
                              >
                                <Icons.Close size={13} /> Release
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {reservations.length === 0 && (
                        <tr><td colSpan={6} className="empty-state">No active reservations.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW: TASKS & FOLLOW-UPS */}
          {/* ==================================================== */}
          {page === 'tasks' && (
            <div>
              <div className="page-header">
                <div>
                  <p className="eyebrow">CRM WORK QUEUE</p>
                  <h1>Scheduled Tasks & Follow-ups</h1>
                </div>
              </div>

              <div className="panel">
                <div className="filters-bar">
                  <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">All Tasks</option>
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>

                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Task Type</th>
                        <th>Details</th>
                        <th>Due Date</th>
                        <th>Lead Ref</th>
                        <th>Priority</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map(t => (
                        <tr key={t.id}>
                          <td className="font-mono text-xs">{t.type}</td>
                          <td>{t.details}</td>
                          <td>{formatDate(t.dueAt)}</td>
                          <td>{t.lead ? t.lead.referenceCode : '—'}</td>
                          <td><span className={`badge ${t.priority === 'URGENT' ? 'badge-red' : 'badge-gray'}`}>{t.priority}</span></td>
                          <td><span className={`badge ${statusBadgeClass(t.status)}`}>{t.status}</span></td>
                          <td>
                            {t.status !== 'COMPLETED' && (
                              <button className="btn-primary btn-sm" onClick={() => setShowCompleteTaskModal(t.id)}>
                                Mark Done
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {tasks.length === 0 && (
                        <tr><td colSpan={7} className="empty-state">No scheduled follow-up tasks.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW: CUSTOMERS CRM */}
          {/* ==================================================== */}
          {page === 'customers' && (
            <div>
              <div className="page-header">
                <div>
                  <p className="eyebrow">CLIENT DIRECTORY</p>
                  <h1>Customer 360 Profiles</h1>
                </div>
              </div>

              <div className="panel">
                <div className="filters-bar">
                  <div className="search-input-box">
                    <Icons.Search size={15} />
                    <input
                      placeholder="Search customer by name, email, phone..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && void loadData()}
                    />
                  </div>
                  <button className="btn-secondary btn-sm" onClick={() => void loadData()}>Search</button>
                </div>

                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer Name</th>
                        <th>Customer UUID</th>
                        <th>Contact Email</th>
                        <th>Phone</th>
                        <th>Preferred City</th>
                        <th>Registered</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map(c => (
                        <tr key={c.id}>
                          <td className="table-title">{c.displayName || 'Customer'}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className="font-mono" style={{ fontSize: '12px', color: 'var(--yellow)' }}>
                                {c.id.slice(0, 8)}…{c.id.slice(-4)}
                              </span>
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                style={{ padding: '2px 6px', fontSize: '11px', minHeight: 'unset' }}
                                onClick={() => navigator.clipboard.writeText(c.id)}
                                title={`Copy ${c.id}`}
                              >
                                Copy
                              </button>
                            </div>
                          </td>
                          <td>{c.email}</td>
                          <td>{c.phone || '—'}</td>
                          <td>{c.preferredCity || '—'}</td>
                          <td>{formatDate(c.createdAt)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                className="btn-secondary btn-sm"
                                onClick={async () => {
                                  if (!user) return;
                                  const details = await salesApi.customer(user, c.id);
                                  setSelectedCustomer(details);
                                }}
                              >
                                View 360 Profile
                              </button>
                              <button
                                className="btn-outline btn-sm"
                                onClick={() => {
                                  setPrefilledCustomerId(c.id);
                                  setPage('communications');
                                }}
                              >
                                Notify
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {customers.length === 0 && (
                        <tr><td colSpan={7} className="empty-state">No customers found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW: COMMUNICATIONS (APPROVED TRANSACTIONAL EMAIL) */}
          {/* ==================================================== */}
          {page === 'communications' && (
            <CommunicationsView
              user={user}
              customers={customers}
              initialCustomerId={prefilledCustomerId}
            />
          )}

          {/* ==================================================== */}
          {/* VIEW: REPORTS & FUNNELS */}
          {/* ==================================================== */}
          {page === 'reports' && reports && (
            <div>
              <div className="page-header">
                <div>
                  <p className="eyebrow">ANALYTICS & METRICS</p>
                  <h1>Conversion Funnels & Performance</h1>
                </div>
              </div>

              <div className="funnel-container">
                <div className="funnel-card">
                  <h3>Seller Acquisition Funnel</h3>
                  <div className="funnel-steps">
                    {Object.entries(reports.sellerFunnel).map(([k, v]) => (
                      <div key={k} className="funnel-step">
                        <span className="funnel-step-name">{k.replace('_', ' ').toLowerCase()}</span>
                        <span className="funnel-step-count">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="funnel-card">
                  <h3>Buyer Enquiry Funnel</h3>
                  <div className="funnel-steps">
                    {Object.entries(reports.buyerFunnel).map(([k, v]) => (
                      <div key={k} className="funnel-step">
                        <span className="funnel-step-name">{k.replace('_', ' ').toLowerCase()}</span>
                        <span className="funnel-step-count">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="funnel-card">
                  <h3>Test Drive Conversions</h3>
                  <div className="funnel-steps">
                    {Object.entries(reports.testDriveFunnel).map(([k, v]) => (
                      <div key={k} className="funnel-step">
                        <span className="funnel-step-name">{k.replace('_', ' ').toLowerCase()}</span>
                        <span className="funnel-step-count">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ========================================== */}
      {/* MODAL: MANUAL SELLER LEAD ENTRY */}
      {/* ========================================== */}
      {showManualLeadModal && (
        <ManualLeadModal
          user={user}
          onClose={() => setShowManualLeadModal(false)}
          onSuccess={() => {
            setShowManualLeadModal(false);
            void loadData();
          }}
        />
      )}

      {/* ========================================== */}
      {/* MODAL: SELLER LEAD 360 DRAWER */}
      {/* ========================================== */}
      {selectedSellerLead && (
        <SellerLeadDrawer
          user={user}
          lead={selectedSellerLead}
          actor={actor}
          onClose={() => setSelectedSellerLead(null)}
          onRefresh={() => void loadData()}
        />
      )}

      {/* ========================================== */}
      {/* MODAL: BUYER LEAD DRAWER */}
      {/* ========================================== */}
      {selectedBuyerLead && (
        <BuyerLeadDrawer
          user={user}
          lead={selectedBuyerLead}
          onClose={() => setSelectedBuyerLead(null)}
          onRefresh={() => void loadData()}
          onNotifyCustomer={id => {
            setPrefilledCustomerId(id);
            setPage('communications');
          }}
          onCreateQuote={(listingId, customerId) => {
            setTargetListingId(listingId);
            setPrefilledCustomerId(customerId);
            setShowQuotationModal(true);
          }}
          onBookTestDrive={(listingId, customerId) => {
            setTargetListingId(listingId);
            setPrefilledCustomerId(customerId);
            setShowTestDriveModal(true);
          }}
        />
      )}

      {/* ========================================== */}
      {/* MODAL: CUSTOMER 360 PROFILE */}
      {/* ========================================== */}
      {selectedCustomer && (
        <CustomerProfileDrawer
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
          onNotifyCustomer={id => {
            setPrefilledCustomerId(id);
            setPage('communications');
          }}
        />
      )}

      {/* ========================================== */}
      {/* MODAL: CREATE QUOTATION */}
      {/* ========================================== */}
      {showQuotationModal && (
        <CreateQuotationModal
          user={user}
          customers={customers}
          inventory={inventory}
          initialListingId={targetListingId}
          initialCustomerId={prefilledCustomerId}
          onClose={() => {
            setShowQuotationModal(false);
            setTargetListingId('');
            setPrefilledCustomerId('');
          }}
          onSuccess={() => {
            setShowQuotationModal(false);
            setTargetListingId('');
            setPrefilledCustomerId('');
            void loadData();
          }}
        />
      )}

      {/* ========================================== */}
      {/* MODAL: REQUEST DISCOUNT */}
      {/* ========================================== */}
      {showDiscountModal && (
        <RequestDiscountModal
          user={user}
          quotationId={showDiscountModal}
          onClose={() => setShowDiscountModal(null)}
          onSuccess={() => {
            setShowDiscountModal(null);
            void loadData();
          }}
        />
      )}

      {/* ========================================== */}
      {/* MODAL: COMPLETE TASK */}
      {/* ========================================== */}
      {showCompleteTaskModal && (
        <CompleteTaskModal
          user={user}
          taskId={showCompleteTaskModal}
          onClose={() => setShowCompleteTaskModal(null)}
          onSuccess={() => {
            setShowCompleteTaskModal(null);
            void loadData();
          }}
        />
      )}

      {/* ========================================== */}
      {/* MODAL: SCHEDULE TEST DRIVE */}
      {/* ========================================== */}
      {showTestDriveModal && (
        <ScheduleTestDriveModal
          user={user}
          customers={customers}
          inventory={inventory}
          initialListingId={targetListingId}
          initialCustomerId={prefilledCustomerId}
          onClose={() => {
            setShowTestDriveModal(false);
            setTargetListingId('');
            setPrefilledCustomerId('');
          }}
          onSuccess={() => {
            setShowTestDriveModal(false);
            setTargetListingId('');
            setPrefilledCustomerId('');
            void loadData();
          }}
        />
      )}

      {/* ========================================== */}
      {/* MODAL: RESERVE STOCK */}
      {/* ========================================== */}
      {showReservationModal && (
        <RequestReservationModal
          user={user}
          customers={customers}
          inventory={inventory}
          initialListingId={targetListingId}
          initialCustomerId={prefilledCustomerId}
          onClose={() => {
            setShowReservationModal(false);
            setTargetListingId('');
            setPrefilledCustomerId('');
          }}
          onSuccess={() => {
            setShowReservationModal(false);
            setTargetListingId('');
            setPrefilledCustomerId('');
            void loadData();
          }}
        />
      )}

      {/* ========================================== */}
      {/* MODAL: RELEASE / UNRESERVE STOCK */}
      {/* ========================================== */}
      {showReleaseModal && (
        <ReleaseReservationModal
          user={user}
          listing={targetReleaseListing}
          reservation={targetReleaseReservation}
          onClose={() => {
            setShowReleaseModal(false);
            setTargetReleaseListing(null);
            setTargetReleaseReservation(null);
          }}
          onSuccess={() => {
            setShowReleaseModal(false);
            setTargetReleaseListing(null);
            setTargetReleaseReservation(null);
            void loadData();
          }}
        />
      )}
    </div>
  );
}

// ==========================================
// SUBCOMPONENT: MANUAL SELLER LEAD MODAL
// ==========================================
function ManualLeadModal({ user, onClose, onSuccess }: { user: User | null; onClose: () => void; onSuccess: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    sellerName: '',
    sellerPhone: '+91',
    city: 'Bengaluru',
    pincode: '560001',
    make: 'Hyundai',
    model: 'i20',
    variant: 'Sportz 1.2',
    manufacturingYear: 2021,
    fuelType: 'PETROL',
    transmission: 'MANUAL',
    odometerKm: 25000,
    expectedPriceRupees: '650000',
    sellerNotes: 'Walk-in customer at showroom.',
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      await salesApi.createSellerLead(user, {
        sellerName: form.sellerName,
        sellerPhone: form.sellerPhone,
        city: form.city,
        pincode: form.pincode,
        make: form.make,
        model: form.model,
        variant: form.variant || undefined,
        manufacturingYear: Number(form.manufacturingYear),
        fuelType: form.fuelType,
        transmission: form.transmission,
        odometerKm: Number(form.odometerKm),
        expectedPricePaise: form.expectedPriceRupees ? String(BigInt(form.expectedPriceRupees) * 100n) : undefined,
        sellerNotes: form.sellerNotes || undefined,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? `Error: ${err.code}` : 'Failed to create manual lead.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog lg">
        <div className="modal-header">
          <h3>Record Inbound / Walk-in Seller Lead</h3>
          <button onClick={onClose}><Icons.Close size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Seller Full Name *</label>
                <input required className="form-input" value={form.sellerName} onChange={e => setForm({ ...form, sellerName: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Seller Phone (+91...) *</label>
                <input required className="form-input" value={form.sellerPhone} onChange={e => setForm({ ...form, sellerPhone: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">City *</label>
                <input required className="form-input" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Pincode (6 digits) *</label>
                <input required className="form-input" value={form.pincode} onChange={e => setForm({ ...form, pincode: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Vehicle Make *</label>
                <input required className="form-input" value={form.make} onChange={e => setForm({ ...form, make: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Vehicle Model *</label>
                <input required className="form-input" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Variant</label>
                <input className="form-input" value={form.variant} onChange={e => setForm({ ...form, variant: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Manufacturing Year *</label>
                <input required type="number" className="form-input" value={form.manufacturingYear} onChange={e => setForm({ ...form, manufacturingYear: Number(e.target.value) })} />
              </div>
              <div className="form-group">
                <label className="form-label">Fuel Type *</label>
                <select className="form-select" value={form.fuelType} onChange={e => setForm({ ...form, fuelType: e.target.value })}>
                  <option value="PETROL">Petrol</option>
                  <option value="DIESEL">Diesel</option>
                  <option value="CNG">CNG</option>
                  <option value="ELECTRIC">Electric</option>
                  <option value="HYBRID">Hybrid</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Transmission *</label>
                <select className="form-select" value={form.transmission} onChange={e => setForm({ ...form, transmission: e.target.value })}>
                  <option value="MANUAL">Manual</option>
                  <option value="AUTOMATIC">Automatic</option>
                  <option value="CVT">CVT</option>
                  <option value="DCT">DCT</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Odometer (km) *</label>
                <input required type="number" className="form-input" value={form.odometerKm} onChange={e => setForm({ ...form, odometerKm: Number(e.target.value) })} />
              </div>
              <div className="form-group">
                <label className="form-label">Expected Price (₹)</label>
                <input className="form-input" value={form.expectedPriceRupees} onChange={e => setForm({ ...form, expectedPriceRupees: e.target.value })} />
              </div>
              <div className="form-group full">
                <label className="form-label">Initial Notes</label>
                <textarea className="form-textarea" value={form.sellerNotes} onChange={e => setForm({ ...form, sellerNotes: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Creating Lead…' : 'Save Seller Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// SUBCOMPONENT: SELLER LEAD 360 DRAWER
// ==========================================
function SellerLeadDrawer({
  user,
  lead,
  actor,
  onClose,
  onRefresh,
}: {
  user: User | null;
  lead: SellerLead;
  actor: Actor | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<'details' | 'interactions' | 'inspection' | 'offer'>('details');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [interactions, setInteractions] = useState<NonNullable<SellerLead['interactions']>>([]);
  const [offers, setOffers] = useState<Array<{ id: string; offerAmountPaise: string; status: string; validUntil: string }>>([]);
  const [valuations, setValuations] = useState<ValuationItem[]>([]);

  // Form states
  const [interactionNotes, setInteractionNotes] = useState('');
  const [channel, setChannel] = useState('CALL');
  const [outcome, setOutcome] = useState('CONNECTED');

  const [offerRupees, setOfferRupees] = useState('550000');
  const [inspectionDate, setInspectionDate] = useState(
    lead.inspectionDate ? new Date(lead.inspectionDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [inspectionSlot, setInspectionSlot] = useState(lead.inspectionTimeSlot || '11:00 AM - 01:00 PM');
  const [inspectionLocationType, setInspectionLocationType] = useState<'HUB' | 'HOME'>('HUB');
  const [inspectionAddress, setInspectionAddress] = useState(`${lead.city} Hub`);
  const [inspectionSummary, setInspectionSummary] = useState<{
    requests: Array<{
      id: string;
      status: string;
      requestedDate: string | null;
      timeSlot: string | null;
      locationType: string;
      address: string | null;
      notes: string | null;
      scheduledAt: string | null;
      createdAt: string;
      assignment?: {
        id: string;
        status: string;
        scheduledAt: string | null;
        locationType: string;
        address: string | null;
      } | null;
    }>;
    latestStatus: string;
    approvedReport: any;
  } | null>(null);

  const loadInteractions = async () => {
    if (!user) return;
    try {
      const res = await salesApi.interactions(user, lead.id);
      setInteractions(res);
      const [offRes, valRes] = await Promise.all([
        salesApi.getAcquisitionOffers(user, lead.id).catch(() => []),
        salesApi.getValuations(user, lead.id).catch(() => []),
      ]);
      setOffers(offRes);
      setValuations(valRes);
    } catch {
      // ignore
    }
  };

  const loadInspectionSummary = async () => {
    if (!user) return;
    try {
      const res = await salesApi.inspectionSummary(user, lead.id);
      setInspectionSummary(res as any);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void loadInteractions();
    void loadInspectionSummary();
  }, [lead.id]);

  const handleClaim = async () => {
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      await salesApi.claimSellerLead(user, lead.id);
      onRefresh();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? `Error: ${err.code}` : 'Failed to claim lead.');
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      await salesApi.updateSellerLeadStatus(user, lead.id, newStatus, 'Status progressed by sales executive');
      onRefresh();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? `Error: ${err.code}` : 'Status transition not permitted.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !interactionNotes) return;
    setBusy(true);
    try {
      await salesApi.createInteraction(user, lead.id, {
        channel,
        outcome,
        notes: interactionNotes,
      });
      setInteractionNotes('');
      await loadInteractions();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'Failed to log interaction');
    } finally {
      setBusy(false);
    }
  };

  const handleRequestInspection = async () => {
    if (!user) return;
    if (inspectionSummary?.requests?.some(r => ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS'].includes(r.status))) {
      setError('An active inspection request already exists for this lead.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await salesApi.requestInspection(user, lead.id, {
        locationType: inspectionLocationType,
        requestedDate: inspectionDate,
        timeSlot: inspectionSlot,
        address: inspectionLocationType === 'HUB' ? `${lead.city} Hub` : (inspectionAddress || `${lead.city} Doorstep`),
      });
      alert('Inspection requested successfully!');
      await loadInspectionSummary();
      onRefresh();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.code === 'INSPECTION_REQUEST_ALREADY_ACTIVE')) {
        setError('An inspection has already been requested or scheduled for this opportunity.');
      } else {
        setError(err instanceof ApiError ? err.code : 'Failed to schedule inspection');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleProposeOffer = async () => {
    if (!user || !offerRupees) return;
    setBusy(true);
    setError('');
    try {
      const validDate = new Date(Date.now() + 7 * 86400000).toISOString();
      const res = await salesApi.proposeAcquisitionOffer(user, lead.id, {
        offerAmountPaise: String(BigInt(offerRupees) * 100n),
        validUntil: validDate,
        terms: 'Authorized purchase valuation valid for 7 days.',
      });
      alert(res?.message || 'Purchase offer proposed and submitted for Admin / Manager approval!');
      await loadInteractions();
      onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'Offer proposal rejected');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog lg">
        <div className="modal-header">
          <div>
            <span className="eyebrow">SELLER OPPORTUNITY · {lead.referenceCode}</span>
            <h3>{lead.manufacturingYear} {lead.make} {lead.model} {lead.variant || ''}</h3>
          </div>
          <button onClick={onClose}><Icons.Close size={18} /></button>
        </div>

        <div className="modal-body">
          {error && <div className="error-banner">{error}</div>}

          {/* Quick Action Ribbon */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={`badge ${statusBadgeClass(lead.status)}`}>{lead.status}</span>
            <button className="btn-secondary btn-sm" onClick={handleClaim} disabled={busy}>
              Claim Lead
            </button>
            {lead.status === 'SUBMITTED' && (
              <>
                <button className="btn-primary btn-sm" onClick={() => handleStatusChange('QUALIFYING')}>
                  Start Qualification
                </button>
                <button className="btn-secondary btn-sm" onClick={() => setTab('inspection')}>
                  Schedule Inspection
                </button>
              </>
            )}
            {lead.status === 'QUALIFYING' && (
              <button className="btn-primary btn-sm" onClick={() => setTab('inspection')}>
                Schedule Inspection
              </button>
            )}
            {lead.status === 'INSPECTION_SCHEDULED' && (
              <>
                <button className="btn-secondary btn-sm" onClick={() => setTab('inspection')}>
                  View Inspection Status
                </button>
                <button className="btn-primary btn-sm" onClick={() => setTab('offer')}>
                  Propose Purchase Offer
                </button>
              </>
            )}
          </div>

          {/* Tab Navigation */}
          <div className="tabs-nav">
            <button className={`tab-btn ${tab === 'details' ? 'active' : ''}`} onClick={() => setTab('details')}>Lead Specs</button>
            <button className={`tab-btn ${tab === 'interactions' ? 'active' : ''}`} onClick={() => setTab('interactions')}>Interactions & Tasks</button>
            <button className={`tab-btn ${tab === 'inspection' ? 'active' : ''}`} onClick={() => setTab('inspection')}>Inspection</button>
            <button className={`tab-btn ${tab === 'offer' ? 'active' : ''}`} onClick={() => setTab('offer')}>Acquisition Offer</button>
          </div>

          {/* TAB 1: DETAILS */}
          {tab === 'details' && (
            <div className="form-grid">
              <div className="metric-card">
                <div className="metric-label">Seller Details</div>
                <div style={{ fontWeight: 600 }}>{lead.sellerName}</div>
                <div className="metric-sub">{lead.sellerPhone} · {lead.city} ({lead.pincode})</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Expected Valuation</div>
                <div className="metric-value" style={{ fontSize: '20px' }}>{formatCurrency(lead.expectedPricePaise)}</div>
                <div className="metric-sub">Customer stated ask</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Odometer & Fuel</div>
                <div style={{ fontWeight: 600 }}>{lead.odometerKm.toLocaleString('en-IN')} km</div>
                <div className="metric-sub">{lead.fuelType} · {lead.transmission}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Owner Count</div>
                <div style={{ fontWeight: 600 }}>{lead.ownershipNumber} Previous Owner(s)</div>
                <div className="metric-sub">Year: {lead.manufacturingYear}</div>
              </div>
            </div>
          )}

          {/* TAB 2: INTERACTIONS */}
          {tab === 'interactions' && (
            <div>
              <form onSubmit={handleLogInteraction} style={{ marginBottom: '16px' }}>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Channel</label>
                    <select className="form-select" value={channel} onChange={e => setChannel(e.target.value)}>
                      <option value="CALL">Phone Call</option>
                      <option value="EMAIL">Email</option>
                      <option value="MEETING">In-person Meeting</option>
                      <option value="INTERNAL_NOTE">Internal Note</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Outcome</label>
                    <select className="form-select" value={outcome} onChange={e => setOutcome(e.target.value)}>
                      <option value="CONNECTED">Connected</option>
                      <option value="ATTEMPTED">Attempted</option>
                      <option value="NO_ANSWER">No Answer</option>
                      <option value="RESCHEDULE_REQUESTED">Reschedule Requested</option>
                      <option value="INFORMATION_PROVIDED">Info Provided</option>
                    </select>
                  </div>
                  <div className="form-group full">
                    <label className="form-label">Interaction Notes</label>
                    <input
                      required
                      className="form-input"
                      placeholder="Summary of conversation with seller..."
                      value={interactionNotes}
                      onChange={e => setInteractionNotes(e.target.value)}
                    />
                  </div>
                </div>
                <button type="submit" className="btn-primary btn-sm" style={{ marginTop: '8px' }} disabled={busy}>
                  Log Interaction
                </button>
              </form>

              <div className="timeline">
                {interactions.map(item => (
                  <div key={item.id} className="timeline-item">
                    <div className="timeline-header">
                      <span className="timeline-channel">{item.channel}</span>
                      <span>{item.outcome}</span>
                      <span>· {formatDate(item.createdAt)}</span>
                    </div>
                    <div className="timeline-notes">{item.notes}</div>
                  </div>
                ))}
                {interactions.length === 0 && <p className="empty-state">No recorded interactions yet.</p>}
              </div>
            </div>
          )}

          {/* TAB 3: INSPECTION */}
          {tab === 'inspection' && (
            <div className="form-grid">
              {inspectionSummary?.requests && inspectionSummary.requests.length > 0 ? (
                (() => {
                  const activeReq = inspectionSummary.requests[0];
                  const hasInspector = Boolean(activeReq.assignment);

                  return (
                    <div className="form-group full" style={{
                      background: hasInspector ? 'rgba(16, 185, 129, 0.08)' : 'rgba(217, 119, 6, 0.08)',
                      border: `1px solid ${hasInspector ? 'rgba(16, 185, 129, 0.3)' : 'rgba(217, 119, 6, 0.3)'}`,
                      borderRadius: '8px',
                      padding: '16px',
                      gap: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: hasInspector ? '#10b981' : '#d97706', fontWeight: 600 }}>
                          <Icons.Inspections size={18} />
                          <span>
                            {hasInspector ? `Inspector Assigned · ${activeReq.assignment?.status}` : 'Inspection Requested · Awaiting Inspector Assignment'}
                          </span>
                        </div>
                        <span className={`badge ${hasInspector ? 'badge-green' : 'badge-yellow'}`}>
                          {hasInspector ? activeReq.assignment?.status : activeReq.status}
                        </span>
                      </div>

                      <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5 }}>
                        {hasInspector
                          ? `An inspector has been assigned for ${activeReq.assignment?.locationType || activeReq.locationType} inspection at ${activeReq.assignment?.address || activeReq.address}. Appointment: ${activeReq.assignment?.scheduledAt ? new Date(activeReq.assignment.scheduledAt).toLocaleString() : 'Scheduled'}.`
                          : `Inspection requested for ${activeReq.requestedDate ? new Date(activeReq.requestedDate).toLocaleDateString() : 'Immediate'} (${activeReq.timeSlot || 'Anytime'}) at ${activeReq.address || activeReq.locationType}. Hub Operations will assign a certified field inspector shortly.`}
                      </p>

                      {inspectionSummary.approvedReport ? (
                        <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(16, 185, 129, 0.12)', borderRadius: '6px' }}>
                          <div style={{ color: '#10b981', fontWeight: 600, fontSize: '0.85rem' }}>
                            ✓ Inspection Report Approved (Rev #{inspectionSummary.approvedReport.revision})
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                            {inspectionSummary.approvedReport.defectsCount} defects recorded · {inspectionSummary.approvedReport.mediaCount} evidence photos attached
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })()
              ) : !['SUBMITTED', 'QUALIFYING', 'INSPECTION_SCHEDULED'].includes(lead.status) ? (
                <div className="form-group full" style={{ background: 'rgba(100, 116, 139, 0.1)', border: '1px solid rgba(100, 116, 139, 0.2)', borderRadius: '8px', padding: '16px' }}>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>
                    This lead status ({lead.status}) is not eligible for new inspection requests.
                  </p>
                </div>
              ) : (
                <>
                  {(lead.inspectionDate || lead.inspectionTimeSlot) && (
                    <div className="form-group full" style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ color: '#38bdf8', fontWeight: 600, fontSize: '0.85rem' }}>
                        Customer Stated Preferred Appointment:
                      </div>
                      <div style={{ color: '#cbd5e1', fontSize: '0.85rem', marginTop: '2px' }}>
                        {lead.inspectionDate ? new Date(lead.inspectionDate).toLocaleDateString() : 'Date pending'} · {lead.inspectionTimeSlot || 'Anytime'}
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">Requested Date</label>
                    <input type="date" className="form-input" value={inspectionDate} onChange={e => setInspectionDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Time Slot</label>
                    <select className="form-select" value={inspectionSlot} onChange={e => setInspectionSlot(e.target.value)}>
                      <option value="10:00 AM - 12:00 PM">10:00 AM - 12:00 PM</option>
                      <option value="11:00 AM - 01:00 PM">11:00 AM - 01:00 PM</option>
                      <option value="02:00 PM - 04:00 PM">02:00 PM - 04:00 PM</option>
                      <option value="04:00 PM - 06:00 PM">04:00 PM - 06:00 PM</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Location Type</label>
                    <select className="form-select" value={inspectionLocationType} onChange={e => setInspectionLocationType(e.target.value as any)}>
                      <option value="HUB">Hub Inspection</option>
                      <option value="HOME">Doorstep (Home) Visit</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Location / Address</label>
                    <input
                      type="text"
                      className="form-input"
                      value={inspectionAddress}
                      onChange={e => setInspectionAddress(e.target.value)}
                      placeholder="Hub name or customer doorstep address"
                    />
                  </div>
                  <div className="form-group full">
                    <button className="btn-primary" onClick={handleRequestInspection} disabled={busy}>
                      {busy ? 'Scheduling...' : 'Confirm Hub / Doorstep Inspection Request'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 4: ACQUISITION OFFER & VALUATION REVIEW */}
          {tab === 'offer' && (
            <div>
              {/* Latest Valuation Review Status Banner */}
              {(() => {
                const latestVal = valuations[0];
                if (!latestVal) return null;

                if (latestVal.status === 'PENDING_APPROVAL') {
                  return (
                    <div style={{
                      background: 'rgba(255, 209, 102, 0.08)',
                      border: '1px solid rgba(255, 209, 102, 0.4)',
                      borderRadius: '8px',
                      padding: '14px',
                      marginBottom: '16px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--warning)', fontWeight: 600 }}>
                          <Icons.Offers size={18} />
                          <span>🟡 Offer Proposal Under Review</span>
                        </div>
                        <span className="badge badge-amber">Awaiting Admin Approval</span>
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '0.875rem', color: '#cbd5e1' }}>
                        Proposed Purchase Price: <strong className="font-mono">{formatCurrency(latestVal.recommendedPurchasePaise)}</strong>
                        {latestVal.expectedResalePaise && ` · Target Resale: ${formatCurrency(latestVal.expectedResalePaise)}`}
                      </div>
                      <div style={{ marginTop: '4px', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Submitted by {latestVal.createdBy?.user?.displayName || 'Sales Executive'} on {formatDate(latestVal.createdAt)}. Review by authorized pricing manager / admin is pending.
                      </div>
                    </div>
                  );
                }

                if (latestVal.status === 'APPROVED') {
                  return (
                    <div style={{
                      background: 'rgba(97, 217, 154, 0.08)',
                      border: '1px solid rgba(97, 217, 154, 0.4)',
                      borderRadius: '8px',
                      padding: '14px',
                      marginBottom: '16px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', fontWeight: 600 }}>
                          <Icons.Offers size={18} />
                          <span>🟢 Valuation Approved by Admin</span>
                        </div>
                        <span className="badge badge-green">Authorized Price</span>
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '0.875rem', color: '#cbd5e1' }}>
                        Approved Purchase Price: <strong className="font-mono">{formatCurrency(latestVal.recommendedPurchasePaise)}</strong>
                      </div>
                      <div style={{ marginTop: '4px', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Authorized by {latestVal.approvedBy?.user?.displayName || 'Admin'} on {formatDate(latestVal.approvedAt || latestVal.updatedAt)}. The official offer is ready to be communicated.
                      </div>
                    </div>
                  );
                }

                if (latestVal.status === 'REJECTED') {
                  return (
                    <div style={{
                      background: 'rgba(255, 124, 134, 0.08)',
                      border: '1px solid rgba(255, 124, 134, 0.4)',
                      borderRadius: '8px',
                      padding: '14px',
                      marginBottom: '16px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', fontWeight: 600 }}>
                          <Icons.Offers size={18} />
                          <span>🔴 Valuation Proposal Rejected by Admin</span>
                        </div>
                        <span className="badge badge-red">Proposal Rejected</span>
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '0.875rem', color: '#cbd5e1' }}>
                        Proposed Amount: <strong className="font-mono">{formatCurrency(latestVal.recommendedPurchasePaise)}</strong>
                      </div>
                      <div style={{
                        marginTop: '8px',
                        padding: '8px 12px',
                        background: 'rgba(255, 124, 134, 0.15)',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        color: '#fecdd3',
                      }}>
                        <strong>Admin Feedback / Reason:</strong> {latestVal.notes || 'Price exceeds commercial bounds. Please submit a revised proposal.'}
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Reviewed by {latestVal.approvedBy?.user?.displayName || 'Admin'} on {formatDate(latestVal.updatedAt)}. Adjust amount below to submit a revision.
                      </div>
                    </div>
                  );
                }

                return null;
              })()}

              <div className="form-grid" style={{ marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Proposed Offer Amount (₹)</label>
                  <input
                    className="form-input font-mono"
                    value={offerRupees}
                    onChange={e => setOfferRupees(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn-primary" onClick={handleProposeOffer} disabled={busy}>
                    {valuations[0]?.status === 'REJECTED'
                      ? 'Submit Revised Offer Proposal'
                      : valuations[0]?.status === 'PENDING_APPROVAL'
                      ? 'Submit Updated Valuation'
                      : 'Propose Purchase Offer'}
                  </button>
                </div>
              </div>

              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Type & Version</th>
                      <th>Amount</th>
                      <th>Status & Review</th>
                      <th>Notes / Valid Until</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Valuations */}
                    {valuations.map(val => (
                      <tr key={`v-${val.id}`}>
                        <td>
                          <div style={{ fontWeight: 600 }}>Valuation v{val.version}</div>
                          <div className="table-sub">{formatDate(val.createdAt)}</div>
                        </td>
                        <td className="font-mono" style={{ fontWeight: 700 }}>
                          {formatCurrency(val.recommendedPurchasePaise)}
                        </td>
                        <td>
                          {val.status === 'PENDING_APPROVAL' && (
                            <span className="badge badge-amber" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span>🟡</span> Under Admin Review
                            </span>
                          )}
                          {val.status === 'APPROVED' && (
                            <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span>🟢</span> Approved by Admin
                            </span>
                          )}
                          {val.status === 'REJECTED' && (
                            <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span>🔴</span> Rejected by Admin
                            </span>
                          )}
                          {!['PENDING_APPROVAL', 'APPROVED', 'REJECTED'].includes(val.status) && (
                            <span className={`badge ${statusBadgeClass(val.status)}`}>{val.status}</span>
                          )}
                        </td>
                        <td style={{ maxWidth: '240px' }}>
                          {val.notes ? (
                            <div style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '0.78rem',
                              lineHeight: 1.3,
                              background: val.status === 'REJECTED' ? 'rgba(255, 124, 134, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                              color: val.status === 'REJECTED' ? 'var(--danger)' : 'var(--text)',
                            }}>
                              {val.notes}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                              {val.approvedBy?.user?.displayName ? `By: ${val.approvedBy.user.displayName}` : 'No notes'}
                            </span>
                          )}
                        </td>
                        <td>
                          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                            {val.status === 'APPROVED' ? 'Offer Issued' : 'Commercial Record'}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {/* Official Offers */}
                    {offers.map(o => (
                      <tr key={`o-${o.id}`}>
                        <td>
                          <div style={{ fontWeight: 600 }}>Official Offer</div>
                          <div className="table-sub">{formatDate(o.validUntil)}</div>
                        </td>
                        <td className="font-mono" style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                          {formatCurrency(o.offerAmountPaise)}
                        </td>
                        <td><span className={`badge ${statusBadgeClass(o.status)}`}>{o.status}</span></td>
                        <td>Valid until: {formatDate(o.validUntil)}</td>
                        <td>
                          {o.status === 'OFFERED' && (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                className="btn-primary btn-sm"
                                onClick={async () => {
                                  if (!user) return;
                                  await salesApi.recordOfferResponse(user, lead.id, o.id, { decision: 'ACCEPTED' });
                                  await loadInteractions();
                                  onRefresh();
                                }}
                              >
                                Accepted
                              </button>
                              <button
                                className="btn-danger btn-sm"
                                onClick={async () => {
                                  if (!user) return;
                                  await salesApi.recordOfferResponse(user, lead.id, o.id, { decision: 'DECLINED', declineReason: 'Seller declined' });
                                  await loadInteractions();
                                  onRefresh();
                                }}
                              >
                                Declined
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}

                    {valuations.length === 0 && offers.length === 0 && (
                      <tr><td colSpan={5} className="empty-state">No valuation proposals or offers made yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// SUBCOMPONENT: BUYER LEAD DRAWER
// ==========================================
function BuyerLeadDrawer({
  user,
  lead,
  onClose,
  onRefresh,
  onNotifyCustomer,
  onCreateQuote,
  onBookTestDrive,
}: {
  user: User | null;
  lead: BuyerLead;
  onClose: () => void;
  onRefresh: () => void;
  onNotifyCustomer?: (id: string) => void;
  onCreateQuote?: (listingId: string, customerId: string) => void;
  onBookTestDrive?: (listingId: string, customerId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [copiedCustomer, setCopiedCustomer] = useState(false);
  const [copiedListing, setCopiedListing] = useState(false);

  const copyCustomerId = () => {
    navigator.clipboard.writeText(lead.user.id);
    setCopiedCustomer(true);
    setTimeout(() => setCopiedCustomer(false), 2000);
  };

  const copyListingId = () => {
    navigator.clipboard.writeText(lead.listing.id);
    setCopiedListing(true);
    setTimeout(() => setCopiedListing(false), 2000);
  };

  const updateStatus = async (status: string) => {
    if (!user) return;
    setBusy(true);
    try {
      await salesApi.updateBuyerStatus(user, lead.id, status);
      onRefresh();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="modal-header">
          <div>
            <span className="eyebrow">BUYER ENQUIRY</span>
            <h3>{lead.user.displayName || lead.user.email}</h3>
          </div>
          <button onClick={onClose}><Icons.Close size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="metric-card full" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div className="metric-label">Customer UUID</div>
                <div className="font-mono" style={{ fontSize: '12px', color: 'var(--yellow)', wordBreak: 'break-all' }}>
                  {lead.user.id}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" className="btn-secondary btn-sm" onClick={copyCustomerId}>
                  {copiedCustomer ? '✓ Copied' : 'Copy UUID'}
                </button>
                {onNotifyCustomer && (
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() => {
                      onNotifyCustomer(lead.user.id);
                      onClose();
                    }}
                  >
                    Notify Customer
                  </button>
                )}
              </div>
            </div>

            <div className="metric-card full" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div className="metric-label">Vehicle Listing ID (UUID)</div>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>{lead.listing.title}</div>
                <div className="font-mono" style={{ fontSize: '12px', color: 'var(--yellow)', wordBreak: 'break-all' }}>
                  {lead.listing.id}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" className="btn-secondary btn-sm" onClick={copyListingId}>
                  {copiedListing ? '✓ Copied' : 'Copy Listing ID'}
                </button>
                {onCreateQuote && (
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() => {
                      onCreateQuote(lead.listing.id, lead.user.id);
                      onClose();
                    }}
                  >
                    Quote
                  </button>
                )}
                {onBookTestDrive && (
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    onClick={() => {
                      onBookTestDrive(lead.listing.id, lead.user.id);
                      onClose();
                    }}
                  >
                    Test Drive
                  </button>
                )}
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label">Customer Contact</div>
              <div>{lead.user.email}</div>
              <div className="metric-sub">{lead.user.phone || 'Phone not provided'}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Vehicle Price</div>
              <div className="font-mono" style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{formatCurrency(lead.listing.pricePaise)}</div>
              <div className="metric-sub">Authorized Company Inventory</div>
            </div>
            <div className="metric-card full">
              <div className="metric-label">Message / Note</div>
              <div>{lead.message || 'No additional note provided by customer.'}</div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Close</button>
          {lead.status === 'RECEIVED' && (
            <button className="btn-secondary" onClick={() => updateStatus('IN_REVIEW')} disabled={busy}>
              Mark In Review
            </button>
          )}
          {lead.status === 'IN_REVIEW' && (
            <button className="btn-primary" onClick={() => updateStatus('CONTACTED')} disabled={busy}>
              Mark Contacted
            </button>
          )}
          {lead.status === 'CONTACTED' && (
            <button className="btn-danger" onClick={() => updateStatus('CLOSED')} disabled={busy}>
              Close Opportunity
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// SUBCOMPONENT: CUSTOMER 360 PROFILE
// ==========================================
function CustomerProfileDrawer({
  customer,
  onClose,
  onNotifyCustomer,
}: {
  customer: Customer;
  onClose: () => void;
  onNotifyCustomer?: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyId = () => {
    navigator.clipboard.writeText(customer.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog lg">
        <div className="modal-header">
          <div>
            <span className="eyebrow">CUSTOMER 360 PROFILE</span>
            <h3>{customer.displayName || customer.email}</h3>
          </div>
          <button onClick={onClose}><Icons.Close size={18} /></button>
        </div>
        <div className="modal-body">
          {/* Prominent Customer UUID card */}
          <div className="metric-card full" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div className="metric-label">Customer UUID (System ID)</div>
              <div className="font-mono" style={{ fontSize: '13px', color: 'var(--yellow)', wordBreak: 'break-all' }}>
                {customer.id}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-secondary btn-sm" onClick={copyId}>
                {copied ? '✓ Copied' : 'Copy UUID'}
              </button>
              {onNotifyCustomer && (
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => {
                    onNotifyCustomer(customer.id);
                    onClose();
                  }}
                >
                  Send Notification
                </button>
              )}
            </div>
          </div>

          <div className="form-grid" style={{ marginBottom: '16px' }}>
            <div className="metric-card">
              <div className="metric-label">Contact Details</div>
              <div>{customer.email}</div>
              <div className="metric-sub">{customer.phone || 'No phone'} · {customer.preferredCity || 'No city'}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Customer Since</div>
              <div>{formatDate(customer.createdAt)}</div>
            </div>
          </div>

          <h4 style={{ margin: '14px 0 8px', fontSize: '14px' }}>Associated Seller Enquiries</h4>
          <div className="table-responsive">
            <table>
              <thead>
                <tr><th>Ref Code</th><th>Vehicle</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(customer.acquisitionLeads || []).map(l => (
                  <tr key={l.id}>
                    <td className="font-mono">{l.referenceCode}</td>
                    <td>{l.make} {l.model}</td>
                    <td><span className={`badge ${statusBadgeClass(l.status)}`}>{l.status}</span></td>
                  </tr>
                ))}
                {(!customer.acquisitionLeads || customer.acquisitionLeads.length === 0) && (
                  <tr><td colSpan={3} className="empty-state">No selling enquiries.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <h4 style={{ margin: '14px 0 8px', fontSize: '14px' }}>Associated Buyer Enquiries</h4>
          <div className="table-responsive">
            <table>
              <thead>
                <tr><th>Vehicle Listing</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(customer.purchaseEnquiries || []).map(p => (
                  <tr key={p.id}>
                    <td>{p.listing.title}</td>
                    <td><span className={`badge ${statusBadgeClass(p.status)}`}>{p.status}</span></td>
                  </tr>
                ))}
                {(!customer.purchaseEnquiries || customer.purchaseEnquiries.length === 0) && (
                  <tr><td colSpan={2} className="empty-state">No buying enquiries.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// SUBCOMPONENT: SEARCHABLE CUSTOMER INPUT
// ==========================================
function SearchableCustomerInput({
  user,
  value,
  onChange,
  customers = [],
  required = true,
  label = 'Customer ID (UUID) *',
}: {
  user: User | null;
  value: string;
  onChange: (id: string) => void;
  customers?: Customer[];
  required?: boolean;
  label?: string;
}) {
  const [list, setList] = useState<Customer[]>(customers);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (customers.length > 0) {
      setList(customers);
    } else if (user) {
      setLoading(true);
      salesApi.customers(user, { limit: 100 })
        .then(res => {
          if (res?.items) setList(res.items);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [customers, user]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!search.trim() || !user) return;
    const timer = setTimeout(() => {
      salesApi.customers(user, { search: search.trim() })
        .then(res => {
          if (res?.items && res.items.length > 0) {
            setList(prev => {
              const map = new Map(prev.map(c => [c.id, c]));
              res.items.forEach(c => map.set(c.id, c));
              return Array.from(map.values());
            });
          }
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [search, user]);

  // If value is provided but not in list, fetch customer details
  useEffect(() => {
    if (value && user && !list.some(c => c.id === value)) {
      salesApi.customer(user, value)
        .then(c => {
          if (c) {
            setList(prev => prev.some(item => item.id === c.id) ? prev : [c, ...prev]);
          }
        })
        .catch(() => {});
    }
  }, [value, user, list]);

  const selectedCustomer = list.find(c => c.id === value);

  const filtered = useMemo(() => {
    if (!search.trim()) return list.slice(0, 10);
    const q = search.toLowerCase();
    return list.filter(c =>
      (c.displayName && c.displayName.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.preferredCity && c.preferredCity.toLowerCase().includes(q)) ||
      c.id.toLowerCase().includes(q)
    ).slice(0, 15);
  }, [list, search]);

  const copyId = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="form-group full" style={{ marginBottom: '16px' }} ref={containerRef}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <label className="form-label" style={{ margin: 0, fontWeight: 600 }}>{label}</label>
        {value && (
          <button
            type="button"
            className="btn-secondary btn-sm"
            style={{ padding: '2px 8px', fontSize: '11px', minHeight: 'unset' }}
            onClick={copyId}
          >
            {copied ? '✓ Copied' : 'Copy UUID'}
          </button>
        )}
      </div>

      {selectedCustomer ? (
        <div style={{
          padding: '10px 12px',
          background: 'rgba(97, 217, 154, 0.08)',
          border: '1px solid rgba(97, 217, 154, 0.3)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem' }}>
              {selectedCustomer.displayName || 'Customer'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
              {selectedCustomer.email} {selectedCustomer.phone ? `· ${selectedCustomer.phone}` : ''} {selectedCustomer.preferredCity ? `· ${selectedCustomer.preferredCity}` : ''}
            </div>
            <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--blue)', marginTop: '2px' }}>
              UUID: {selectedCustomer.id}
            </div>
          </div>
          <button
            type="button"
            className="btn-outline btn-sm"
            style={{ fontSize: '11px', padding: '3px 8px' }}
            onClick={() => {
              onChange('');
              setSearch('');
              setIsOpen(true);
            }}
          >
            Change
          </button>
        </div>
      ) : null}

      <div style={{ position: 'relative' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: '#06172f',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '0 8px',
        }}>
          <span style={{ color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', marginRight: '6px', flexShrink: 0 }}>
            <Icons.Search size={16} />
          </span>
          <input
            type="text"
            className="form-input"
            style={{ border: 'none', background: 'transparent', padding: '8px 0', minHeight: 'unset' }}
            placeholder="Search customer by name, email, phone or UUID..."
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
          />
          {search && (
            <button
              type="button"
              style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px' }}
              onClick={() => setSearch('')}
            >
              ✕
            </button>
          )}
        </div>

        {isOpen && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: '220px',
            overflowY: 'auto',
            background: '#06172f',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            zIndex: 100,
          }}>
            <div style={{ padding: '6px 10px', fontSize: '11px', color: 'var(--muted)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{loading ? 'Loading registered customers...' : `Registered Customers (${filtered.length})`}</span>
              <button
                type="button"
                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '11px' }}
                onClick={() => setIsOpen(false)}
              >
                Close ✕
              </button>
            </div>
            {filtered.map(c => (
              <div
                key={c.id}
                style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  background: c.id === value ? 'rgba(247, 181, 3, 0.12)' : 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = c.id === value ? 'rgba(247, 181, 3, 0.12)' : 'transparent')}
                onClick={() => {
                  onChange(c.id);
                  setIsOpen(false);
                  setSearch('');
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)' }}>
                  {c.displayName || 'Customer'}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  {c.email} {c.phone ? `· ${c.phone}` : ''} {c.preferredCity ? `· ${c.preferredCity}` : ''}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--blue)', fontFamily: 'monospace' }}>
                  {c.id}
                </div>
              </div>
            ))}
            {!filtered.length && !loading && (
              <div style={{ padding: '12px 10px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
                No registered customers found. You can enter or paste a direct UUID below.
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: '8px' }}>
        <input
          required={required}
          className="form-input font-mono"
          style={{ fontSize: '0.8rem', padding: '6px 10px', minHeight: 'unset' }}
          placeholder="Customer ID UUID (e.g. 11111111-1111-4111-8111-111111111111)"
          value={value}
          onChange={e => onChange(e.target.value.trim())}
        />
      </div>
    </div>
  );
}

// ==========================================
// SUBCOMPONENT: SEARCHABLE VEHICLE INPUT
// ==========================================
function SearchableVehicleInput({
  user,
  value,
  onChange,
  inventory = [],
  required = true,
  label = 'Vehicle Listing ID (UUID) *',
}: {
  user: User | null;
  value: string;
  onChange: (id: string) => void;
  inventory?: InventoryItem[];
  required?: boolean;
  label?: string;
}) {
  const [list, setList] = useState<InventoryItem[]>(inventory);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inventory.length > 0) {
      setList(inventory);
    } else if (user) {
      setLoading(true);
      salesApi.inventory(user, {})
        .then(res => {
          if (res?.items) setList(res.items);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [inventory, user]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!search.trim() || !user) return;
    const timer = setTimeout(() => {
      salesApi.inventory(user, { search: search.trim() })
        .then(res => {
          if (res?.items && res.items.length > 0) {
            setList(prev => {
              const map = new Map(prev.map(i => [i.id, i]));
              res.items.forEach(i => map.set(i.id, i));
              return Array.from(map.values());
            });
          }
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [search, user]);

  // If value is provided but not in list, try to fetch via inventory search
  useEffect(() => {
    if (value && user && !list.some(i => i.id === value)) {
      salesApi.inventory(user, { search: value })
        .then(res => {
          const found = res?.items?.find(i => i.id === value);
          if (found) {
            setList(prev => prev.some(item => item.id === found.id) ? prev : [found, ...prev]);
          }
        })
        .catch(() => {});
    }
  }, [value, user, list]);

  const selectedVehicle = list.find(i => i.id === value);

  const filtered = useMemo(() => {
    if (!search.trim()) return list.slice(0, 10);
    const q = search.toLowerCase();
    return list.filter(i =>
      i.title.toLowerCase().includes(q) ||
      (i.vehicle.city && i.vehicle.city.toLowerCase().includes(q)) ||
      (i.vehicle.make && i.vehicle.make.toLowerCase().includes(q)) ||
      (i.vehicle.model && i.vehicle.model.toLowerCase().includes(q)) ||
      i.id.toLowerCase().includes(q)
    ).slice(0, 15);
  }, [list, search]);

  const copyId = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="form-group full" style={{ marginBottom: '16px' }} ref={containerRef}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <label className="form-label" style={{ margin: 0, fontWeight: 600 }}>{label}</label>
        {value && (
          <button
            type="button"
            className="btn-secondary btn-sm"
            style={{ padding: '2px 8px', fontSize: '11px', minHeight: 'unset' }}
            onClick={copyId}
          >
            {copied ? '✓ Copied' : 'Copy UUID'}
          </button>
        )}
      </div>

      {selectedVehicle ? (
        <div style={{
          padding: '10px 12px',
          background: 'rgba(147, 197, 253, 0.08)',
          border: '1px solid rgba(147, 197, 253, 0.3)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem' }}>
              {selectedVehicle.title}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
              {formatCurrency(selectedVehicle.pricePaise)} · {selectedVehicle.vehicle.city || 'No city'} · {selectedVehicle.vehicle.fuelType} · {selectedVehicle.status}
            </div>
            <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--blue)', marginTop: '2px' }}>
              UUID: {selectedVehicle.id}
            </div>
          </div>
          <button
            type="button"
            className="btn-outline btn-sm"
            style={{ fontSize: '11px', padding: '3px 8px' }}
            onClick={() => {
              onChange('');
              setSearch('');
              setIsOpen(true);
            }}
          >
            Change
          </button>
        </div>
      ) : null}

      <div style={{ position: 'relative' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: '#06172f',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '0 8px',
        }}>
          <span style={{ color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', marginRight: '6px', flexShrink: 0 }}>
            <Icons.Search size={16} />
          </span>
          <input
            type="text"
            className="form-input"
            style={{ border: 'none', background: 'transparent', padding: '8px 0', minHeight: 'unset' }}
            placeholder="Search available vehicle by make, model, city, price or UUID..."
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
          />
          {search && (
            <button
              type="button"
              style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'padding', padding: '4px' }}
              onClick={() => setSearch('')}
            >
              ✕
            </button>
          )}
        </div>

        {isOpen && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: '220px',
            overflowY: 'auto',
            background: '#06172f',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            zIndex: 100,
          }}>
            <div style={{ padding: '6px 10px', fontSize: '11px', color: 'var(--muted)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{loading ? 'Loading inventory...' : `Available Vehicles (${filtered.length})`}</span>
              <button
                type="button"
                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '11px' }}
                onClick={() => setIsOpen(false)}
              >
                Close ✕
              </button>
            </div>
            {filtered.map(i => (
              <div
                key={i.id}
                style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  background: i.id === value ? 'rgba(247, 181, 3, 0.12)' : 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = i.id === value ? 'rgba(247, 181, 3, 0.12)' : 'transparent')}
                onClick={() => {
                  onChange(i.id);
                  setIsOpen(false);
                  setSearch('');
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)' }}>
                    {i.title}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--yellow)' }}>
                    {formatCurrency(i.pricePaise)}
                  </div>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  {i.vehicle.manufacturingYear} · {i.vehicle.fuelType} · {i.vehicle.city || 'No city'} · Status: {i.status}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--blue)', fontFamily: 'monospace' }}>
                  {i.id}
                </div>
              </div>
            ))}
            {!filtered.length && !loading && (
              <div style={{ padding: '12px 10px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
                No matching vehicle found in inventory. You can enter or paste a direct UUID below.
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: '8px' }}>
        <input
          required={required}
          className="form-input font-mono"
          style={{ fontSize: '0.8rem', padding: '6px 10px', minHeight: 'unset' }}
          placeholder="Vehicle Listing ID UUID (e.g. 11111111-1111-4111-8111-111111111111)"
          value={value}
          onChange={e => onChange(e.target.value.trim())}
        />
      </div>
    </div>
  );
}

// ==========================================
// SUBCOMPONENT: CREATE QUOTATION MODAL
// ==========================================
function CreateQuotationModal({
  user,
  customers = [],
  inventory = [],
  initialListingId = '',
  initialCustomerId = '',
  onClose,
  onSuccess,
}: {
  user: User | null;
  customers?: Customer[];
  inventory?: InventoryItem[];
  initialListingId?: string;
  initialCustomerId?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    listingId: initialListingId || inventory[0]?.id || '',
    customerId: initialCustomerId || customers[0]?.id || '',
    chargesRupees: '15000',
    discountRupees: '0',
    validDays: 7,
    terms: 'Valid with authorized V MOTIV quality inspection warranty.',
  });

  useEffect(() => {
    if (initialListingId) setForm(f => ({ ...f, listingId: initialListingId }));
    if (initialCustomerId) setForm(f => ({ ...f, customerId: initialCustomerId }));
  }, [initialListingId, initialCustomerId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      const validUntil = new Date(Date.now() + form.validDays * 86400000).toISOString();
      await salesApi.createQuotation(user, {
        listingId: form.listingId,
        customerId: form.customerId,
        chargesPaise: String(BigInt(form.chargesRupees) * 100n),
        discountPaise: String(BigInt(form.discountRupees) * 100n),
        validUntil,
        terms: form.terms,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? `Error: ${err.code}` : 'Failed to prepare quotation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="modal-header">
          <h3>Prepare Retail Quotation</h3>
          <button onClick={onClose}><Icons.Close size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            <div className="form-grid">
              <SearchableVehicleInput
                user={user}
                value={form.listingId}
                onChange={id => setForm(f => ({ ...f, listingId: id }))}
                inventory={inventory}
                required
              />
              <SearchableCustomerInput
                user={user}
                value={form.customerId}
                onChange={id => setForm(f => ({ ...f, customerId: id }))}
                customers={customers}
                required
              />
              <div className="form-group">
                <label className="form-label">Add-on Charges (RTO / Ins) ₹</label>
                <input className="form-input" value={form.chargesRupees} onChange={e => setForm({ ...form, chargesRupees: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Approved Discount ₹</label>
                <input className="form-input" value={form.discountRupees} onChange={e => setForm({ ...form, discountRupees: e.target.value })} />
              </div>
              <div className="form-group full">
                <label className="form-label">Terms and Notes</label>
                <textarea className="form-textarea" value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>Create Quotation</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// SUBCOMPONENT: REQUEST DISCOUNT MODAL
// ==========================================
function RequestDiscountModal({ user, quotationId, onClose, onSuccess }: { user: User | null; quotationId: string; onClose: () => void; onSuccess: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [discountRupees, setDiscountRupees] = useState('10000');
  const [reason, setReason] = useState('Customer ready for immediate booking upon ₹10,000 price exception.');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      await salesApi.requestDiscount(user, quotationId, {
        requestedDiscountPaise: String(BigInt(discountRupees) * 100n),
        reason,
      });
      alert('Discount request submitted for managerial review.');
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? `Error: ${err.code}` : 'Failed to request discount.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="modal-header">
          <h3>Request Managerial Discount</h3>
          <button onClick={onClose}><Icons.Close size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label">Discount Amount (₹) *</label>
              <input required className="form-input font-mono" value={discountRupees} onChange={e => setDiscountRupees(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Commercial Justification *</label>
              <textarea required className="form-textarea" value={reason} onChange={e => setReason(e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>Submit Request</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// SUBCOMPONENT: COMPLETE TASK MODAL
// ==========================================
function CompleteTaskModal({ user, taskId, onClose, onSuccess }: { user: User | null; taskId: string; onClose: () => void; onSuccess: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState('Successfully completed customer follow-up call.');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      await salesApi.completeTask(user, taskId, outcome);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'Failed to complete task');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="modal-header">
          <h3>Complete Task</h3>
          <button onClick={onClose}><Icons.Close size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            <div className="form-group">
              <label className="form-label">Actual Outcome Details *</label>
              <textarea required className="form-textarea" value={outcome} onChange={e => setOutcome(e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>Confirm Complete</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// SUBCOMPONENT: SCHEDULE TEST DRIVE MODAL
// ==========================================
function ScheduleTestDriveModal({
  user,
  customers = [],
  inventory = [],
  initialListingId = '',
  initialCustomerId = '',
  onClose,
  onSuccess,
}: {
  user: User | null;
  customers?: Customer[];
  inventory?: InventoryItem[];
  initialListingId?: string;
  initialCustomerId?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    listingId: initialListingId || inventory[0]?.id || '',
    customerId: initialCustomerId || customers[0]?.id || '',
    requestedDate: new Date().toISOString().slice(0, 10),
    timeSlot: '02:00 PM - 04:00 PM',
    customerNotes: 'Customer prefers showroom test drive.',
  });

  useEffect(() => {
    if (initialListingId) setForm(f => ({ ...f, listingId: initialListingId }));
    if (initialCustomerId) setForm(f => ({ ...f, customerId: initialCustomerId }));
  }, [initialListingId, initialCustomerId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      await salesApi.requestTestDrive(user, {
        listingId: form.listingId,
        customerId: form.customerId,
        requestedDate: form.requestedDate,
        timeSlot: form.timeSlot,
        customerNotes: form.customerNotes,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? `Error: ${err.code}` : 'Failed to schedule test drive.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="modal-header">
          <h3>Book Test Drive Appointment</h3>
          <button onClick={onClose}><Icons.Close size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            <div className="form-grid">
              <SearchableVehicleInput
                user={user}
                value={form.listingId}
                onChange={id => setForm(f => ({ ...f, listingId: id }))}
                inventory={inventory}
                required
              />
              <SearchableCustomerInput
                user={user}
                value={form.customerId}
                onChange={id => setForm(f => ({ ...f, customerId: id }))}
                customers={customers}
                required
              />
              <div className="form-group">
                <label className="form-label">Appointment Date *</label>
                <input required type="date" className="form-input" value={form.requestedDate} onChange={e => setForm({ ...form, requestedDate: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Time Slot *</label>
                <select className="form-select" value={form.timeSlot} onChange={e => setForm({ ...form, timeSlot: e.target.value })}>
                  <option value="10:00 AM - 12:00 PM">10:00 AM - 12:00 PM</option>
                  <option value="02:00 PM - 04:00 PM">02:00 PM - 04:00 PM</option>
                  <option value="04:00 PM - 06:00 PM">04:00 PM - 06:00 PM</option>
                </select>
              </div>
              <div className="form-group full">
                <label className="form-label">Appointment Notes</label>
                <textarea className="form-textarea" value={form.customerNotes} onChange={e => setForm({ ...form, customerNotes: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>Book Appointment</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// SUBCOMPONENT: REQUEST RESERVATION MODAL
// ==========================================
function RequestReservationModal({
  user,
  customers = [],
  inventory = [],
  initialListingId = '',
  initialCustomerId = '',
  onClose,
  onSuccess,
}: {
  user: User | null;
  customers?: Customer[];
  inventory?: InventoryItem[];
  initialListingId?: string;
  initialCustomerId?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    listingId: initialListingId || inventory[0]?.id || '',
    customerId: initialCustomerId || customers[0]?.id || '',
    hours: 48,
    notes: 'Token reservation initiated.',
  });

  useEffect(() => {
    if (initialListingId) setForm(f => ({ ...f, listingId: initialListingId }));
    if (initialCustomerId) setForm(f => ({ ...f, customerId: initialCustomerId }));
  }, [initialListingId, initialCustomerId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      const expiresAt = new Date(Date.now() + form.hours * 3600000).toISOString();
      await salesApi.requestReservation(user, {
        listingId: form.listingId,
        customerId: form.customerId,
        expiresAt,
        notes: form.notes,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? `Error: ${err.code}` : 'Failed to place reservation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="modal-header">
          <h3>Reserve Vehicle Stock</h3>
          <button onClick={onClose}><Icons.Close size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            <div className="form-grid">
              <SearchableVehicleInput
                user={user}
                value={form.listingId}
                onChange={id => setForm(f => ({ ...f, listingId: id }))}
                inventory={inventory}
                required
              />
              <SearchableCustomerInput
                user={user}
                value={form.customerId}
                onChange={id => setForm(f => ({ ...f, customerId: id }))}
                customers={customers}
                required
              />
              <div className="form-group">
                <label className="form-label">Hold Window (Hours)</label>
                <input type="number" className="form-input" value={form.hours} onChange={e => setForm({ ...form, hours: Number(e.target.value) })} />
              </div>
              <div className="form-group full">
                <label className="form-label">Reservation Notes</label>
                <textarea className="form-textarea" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>Confirm Reservation</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// SUBCOMPONENT: RELEASE RESERVATION MODAL
// ==========================================
function ReleaseReservationModal({
  user,
  listing,
  reservation,
  onClose,
  onSuccess,
}: {
  user: User | null;
  listing?: InventoryItem | null;
  reservation?: Reservation | { id: string; reservationNumber?: string; status: string; expiresAt: string; notes?: string | null; customer?: { id?: string; displayName?: string | null; email?: string } } | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('Released by sales executive');

  const vehicleTitle = listing?.title || (reservation as Reservation | undefined)?.listing?.title || 'Selected Vehicle';
  const customerName = reservation?.customer?.displayName || reservation?.customer?.email || (listing?.reservations?.[0]?.customer?.displayName || listing?.reservations?.[0]?.customer?.email);
  const expiresAt = reservation?.expiresAt || listing?.reservations?.[0]?.expiresAt;
  const targetReservationId = reservation?.id || listing?.reservations?.[0]?.id;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      if (targetReservationId) {
        await salesApi.releaseReservation(user, targetReservationId, reason.trim() || undefined);
      } else if (listing?.id) {
        await salesApi.releaseListingReservation(user, listing.id, reason.trim() || undefined);
      } else {
        throw new Error('No target listing or reservation found to release.');
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? `Error: ${err.code}` : 'Failed to release reservation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--color-danger, #ef4444)' }}>
              <Icons.Tag size={20} />
            </span>
            <h3>Release Vehicle Reservation</h3>
          </div>
          <button onClick={onClose}><Icons.Close size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}

            <div style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: '8px',
              padding: '14px',
              marginBottom: '16px'
            }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#f87171', marginBottom: '4px' }}>
                Unreserve & Return to Available Stock
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(234, 240, 248, 0.85)' }}>
                Releasing this reservation will mark it as <strong>RELEASED</strong> and restore the vehicle's status to <strong>PUBLISHED</strong>. It will be immediately available for new quotes, test drives, and bookings.
              </p>
            </div>

            <div className="form-grid">
              <div className="form-group full">
                <label className="form-label">Vehicle</label>
                <input
                  type="text"
                  className="form-input"
                  value={vehicleTitle}
                  disabled
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text, #eaf0f8)',
                    border: '1px solid var(--border)',
                    fontWeight: 600,
                  }}
                />
              </div>

              {customerName && (
                <div className="form-group">
                  <label className="form-label">Reserved By Customer</label>
                  <input
                    type="text"
                    className="form-input"
                    value={customerName}
                    disabled
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text, #eaf0f8)',
                      border: '1px solid var(--border)',
                    }}
                  />
                </div>
              )}

              {expiresAt && (
                <div className="form-group">
                  <label className="form-label">Expires At</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formatDate(expiresAt)}
                    disabled
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text, #eaf0f8)',
                      border: '1px solid var(--border)',
                    }}
                  />
                </div>
              )}

              <div className="form-group full">
                <label className="form-label">Reason for Release / Unreserve</label>
                <textarea
                  className="form-textarea"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Customer changed mind, deposit refunded, loan rejected, token expired..."
                  required
                />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-outline" onClick={onClose} disabled={busy}>
              Keep Reservation
            </button>
            <button
              type="submit"
              className="btn-danger"
              disabled={busy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Icons.Close size={15} />
              {busy ? 'Releasing...' : 'Confirm Release & Make Available'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// SUBCOMPONENT: COMMUNICATIONS VIEW
// ==========================================
function CommunicationsView({
  user,
  customers,
  initialCustomerId,
}: {
  user: User | null;
  customers: Customer[];
  initialCustomerId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [customerId, setCustomerId] = useState(initialCustomerId || customers[0]?.id || '');
  const [template, setTemplate] = useState('ENQUIRY_ACK');

  useEffect(() => {
    if (initialCustomerId) {
      setCustomerId(initialCustomerId);
    } else if (!customerId && customers.length > 0) {
      setCustomerId(customers[0].id);
    }
  }, [initialCustomerId, customers]);

  const templates = [
    { key: 'ENQUIRY_ACK', label: 'Enquiry Acknowledgment' },
    { key: 'ADDITIONAL_DETAILS_REQUESTED', label: 'More Details Requested' },
    { key: 'INSPECTION_CONFIRMED', label: 'Inspection Appointment Confirmed' },
    { key: 'OFFER_COMMUNICATED', label: 'Official Purchase Offer' },
    { key: 'QUOTATION_SENT', label: 'Retail Quotation' },
    { key: 'TEST_DRIVE_CONFIRMED', label: 'Test Drive Confirmed' },
  ];

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !customerId) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const res = await salesApi.sendEmail(user, {
        customerId,
        template,
      });
      setStatus(`Email queued in outbox (ID: ${res.id})`);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'Failed to send transactional email');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">TRANSACTIONAL COMMUNICATIONS</p>
          <h1>Approved Customer Notifications</h1>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: '640px' }}>
        <div className="panel-header">
          <h3>Send Verified Transactional Email</h3>
        </div>
        <form onSubmit={send} style={{ padding: '20px' }}>
          {status && <div className="badge badge-green" style={{ display: 'block', padding: '10px', marginBottom: '14px' }}>{status}</div>}
          {error && <div className="error-banner">{error}</div>}

          {/* Searchable Customer Input */}
          <SearchableCustomerInput
            user={user}
            value={customerId}
            onChange={id => setCustomerId(id)}
            customers={customers}
            required
            label="Target Customer (Search by name, email, phone or UUID) *"
          />

          <div className="form-group" style={{ marginBottom: '18px' }}>
            <label className="form-label">Approved Template *</label>
            <select className="form-select" value={template} onChange={e => setTemplate(e.target.value)}>
              {templates.map(t => (
                <option key={t.key} value={t.key}>{t.label} ({t.key})</option>
              ))}
            </select>
          </div>

          <button type="submit" className="btn-primary" disabled={busy || !customerId}>
            {busy ? 'Dispatching…' : 'Dispatch Customer Email'}
          </button>
        </form>
      </div>
    </div>
  );
}

// Mount React Root
createRoot(document.getElementById('root')!).render(<App />);
