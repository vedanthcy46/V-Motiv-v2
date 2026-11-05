import {
  Alert, AppShell, AuthLayout, Button, CenterState, MfaChallengeModal, NotificationBell, PageLoader, SkeletonCards, StatusBadge, toast,
  describeApiError, initTheme, mountLiveChangeBar, useAutoRefresh, useChangeWatcher, type NavSection, type NotificationItem,
} from '@vmotiv/ui';
import { VehicleMakeModel } from './components/VehicleMakeModel';
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

initTheme();

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
  | 'service-leads'
  | 'rental-leads'
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
      <AuthLayout
        portalName="Sales"
        eyebrow="Sales executive portal"
        title="Authorised sales workspace"
        description="Sign in with your authorised V MOTIV corporate Google account to manage buyer and seller opportunities."
        points={[
          { title: 'Buy: vehicle acquisition and valuation', text: 'Seller lead qualification, physical inspections and approved offers.' },
          { title: 'Sell: inventory and retail fulfilment', text: 'Inbound buyer enquiries, showroom test drives and quotations.' },
          { title: 'Role and branch scoped', text: 'Strict server-side enforcement backed by transactional audit checks.' },
        ]}
      >
        {firebaseConfigured ? (
          <Button size="lg" block loading={busy} onClick={login}>{busy ? 'Connecting to Google…' : 'Continue with Google'}</Button>
        ) : (
          <Alert tone="error">Firebase configuration is missing for this environment.</Alert>
        )}
        {error ? <Alert tone="error">{error}</Alert> : null}
      </AuthLayout>

      {mfaResolver && auth && (
        <MfaChallengeModal auth={auth} resolver={mfaResolver} onClose={() => setMfaResolver(null)} onSuccess={() => setMfaResolver(null)} />
      )}
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
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState('');

  // Notifications dropdown state
  const [notifications, setNotifications] = useState<NotificationData | null>(null);

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
  const [serviceBookings, setServiceBookings] = useState<any[]>([]);
  const [rentalBookings, setRentalBookings] = useState<any[]>([]);
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
  const [targetEnquiryId, setTargetEnquiryId] = useState<string>('');
  const [showManualLeadModal, setShowManualLeadModal] = useState(false);
  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [targetReleaseListing, setTargetReleaseListing] = useState<InventoryItem | null>(null);
  const [targetReleaseReservation, setTargetReleaseReservation] = useState<Reservation | { id: string; reservationNumber?: string; status: string; expiresAt: string; notes?: string | null; customer?: { id?: string; displayName?: string | null; email?: string } } | null>(null);
  const [showTestDriveModal, setShowTestDriveModal] = useState(false);
  const [showCompleteTaskModal, setShowCompleteTaskModal] = useState<string | null>(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState<{ open: boolean; leadId?: string }>({ open: false });
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
  const loadData = async (currentUser = user, opts: { silent?: boolean } = {}) => {
    if (!currentUser) return;
    const silent = opts.silent === true;
    if (!silent) setError('');
    try {
      const unavailable: string[] = [];
      const optional = <T,>(label: string, request: Promise<T>, fallback: T) => request.catch(loadError => {
        if (silent) throw loadError;
        console.warn(`[SALES PORTAL] ${label} unavailable`, loadError);
        unavailable.push(label);
        return fallback;
      });
      // Who I am, the dashboard counts and my alerts load at the same time as the data for the open page,
      // instead of one group after the other.
      const headTask = Promise.all([
        actor ? Promise.resolve(actor) : salesApi.me(currentUser),
        page === 'overview' || !dashboard ? salesApi.dashboard(currentUser) : Promise.resolve(dashboard),
        optional('notifications', salesApi.notifications(currentUser), notifications),
      ]).then(([actorData, dashData, notifData]) => {
        if (actorData) setActor(actorData);
        if (dashData) setDashboard(dashData);
        if (notifData) setNotifications(notifData);
        setDenied(false);
      });

      const pageTask = (async () => {
      if (page === 'overview') {
        const [sellersRes, tasksRes, testDrivesRes, reviewsRes] = await Promise.all([
          salesApi.sellerLeads(currentUser, { limit: 10 }),
          salesApi.tasks(currentUser, { overdue: true }),
          salesApi.testDrives(currentUser, { status: 'REQUESTED' }),
          optional('review requests', salesApi.reviewRequests(currentUser), null),
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
        const buyerStatus = ['RECEIVED', 'IN_REVIEW', 'CONTACTED', 'CLOSED'].includes(statusFilter)
          ? statusFilter
          : undefined;
        const res = await salesApi.buyerLeads(currentUser, {
          search,
          status: buyerStatus,
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
          optional('customers', salesApi.customers(currentUser, { limit: 100 }), { items: [], total: 0, page: 1, totalPages: 1 }),
        ]);
        setInventory(invRes.items);
        if (custRes?.items) setCustomers(custRes.items);
      } else if (page === 'testdrives') {
        const [tdRes, invRes, custRes] = await Promise.all([
          salesApi.testDrives(currentUser, { search, status: statusFilter || undefined }),
          salesApi.inventory(currentUser, {}),
          optional('customers', salesApi.customers(currentUser, { limit: 100 }), { items: [], total: 0, page: 1, totalPages: 1 }),
        ]);
        setTestDrives(tdRes.items);
        setInventory(invRes.items);
        if (custRes?.items) setCustomers(custRes.items);
      } else if (page === 'pipeline') {
        const [quotesRes, reserveRes, invRes, custRes] = await Promise.all([
          salesApi.quotations(currentUser, { search, status: statusFilter || undefined }),
          salesApi.reservations(currentUser, {}),
          salesApi.inventory(currentUser, {}),
          optional('customers', salesApi.customers(currentUser, { limit: 100 }), { items: [], total: 0, page: 1, totalPages: 1 }),
        ]);
        setQuotations(quotesRes.items);
        setReservations(reserveRes.items);
        setInventory(invRes.items);
        if (custRes?.items) setCustomers(custRes.items);
      } else if (page === 'tasks') {
        const [res, sellersRes] = await Promise.all([
          salesApi.tasks(currentUser, { status: statusFilter || undefined }),
          optional('seller leads', salesApi.sellerLeads(currentUser, { limit: 100 }), { items: [], total: 0, page: 1, totalPages: 1 }),
        ]);
        setTasks(res);
        if (sellersRes?.items) setSellerLeads(sellersRes.items);
      } else if (page === 'customers' || page === 'communications') {
        const res = await salesApi.customers(currentUser, { search: page === 'customers' ? search : undefined });
        setCustomers(res.items);
      } else if (page === 'service-leads') {
        const sRes = await salesApi.serviceBookings(currentUser).catch(() => ({ items: [], total: 0 }));
        setServiceBookings(sRes?.items || []);
      } else if (page === 'rental-leads') {
        const rRes = await salesApi.rentalBookings(currentUser).catch(() => []);
        setRentalBookings(Array.isArray(rRes) ? rRes : []);
      } else if (page === 'reports') {
        const rep = await salesApi.reports(currentUser);
        setReports(rep);
      }
      })();

      await Promise.all([headTask, pageTask]);
      if (unavailable.length) {
        setError(`${unavailable.join(', ')} could not be loaded. Your saved work is intact; check sales permissions and refresh.`);
      }
    } catch (err: any) {
      if (silent) throw err;
      if (err instanceof ApiError && err.status === 403 && !actor) {
        setDenied(true);
      } else {
        const msg = err instanceof ApiError ? `Error: ${err.code} (${err.status})` : (err?.message || 'Unable to connect to the V MOTIV Sales service.');
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Clear page-specific filters and errors when switching navigation tabs
  useEffect(() => {
    setStatusFilter('');
    setSearch('');
    setError('');
  }, [page]);

  const selectPage = (nextPage: PageKey) => setPage(nextPage);

  useEffect(() => {
    if (user) void loadData(user);
  }, [user, page, statusFilter, unassignedFilter]);

  // Quiet refresh of the current page (pauses when hidden, idle, or a dialog is open).
  useAutoRefresh(() => loadData(user, { silent: true }), { enabled: Boolean(user), intervalMs: 30_000, pulse: user ? { domains: ['sales'], live: true, fetchTokens: (domains, fresh) => salesApi.pulse(user, domains, fresh) } : undefined });
  // Floating "New activity" bar for new leads, enquiries, test drives and quotations.
  useChangeWatcher(['sales'], (domains, fresh) => salesApi.pulse(user as User, domains, fresh), { enabled: Boolean(user) });

  if (!user) return <SignIn />;
  if (loading) return <PageLoader label="Loading your sales workspace" />;

  if (denied) {
    return (
      <CenterState
        eyebrow="Access not granted"
        title="Sales access required"
        actions={<Button onClick={() => auth && signOut(auth)}>Use another account</Button>}
      >
        <p>Your signed-in Google account ({user.email}) does not have an active Sales Executive role and branch assignment. Please contact an administrator to activate your employee account.</p>
      </CenterState>
    );
  }

  if (!actor && error) {
    return (
      <CenterState
        eyebrow="Service connection issue"
        title="Unable to connect"
        actions={
          <>
            <Button onClick={() => void loadData(user)}>Retry connection</Button>
            <Button variant="secondary" onClick={() => auth && signOut(auth)}>Sign out</Button>
          </>
        }
      >
        <p>{error}</p>
      </CenterState>
    );
  }

  const navSections: NavSection<PageKey>[] = [
    {
      title: 'Core operations',
      items: [
        { key: 'overview', label: 'Overview', icon: <Icons.Overview size={17} /> },
        { key: 'seller', label: 'Seller leads', icon: <Icons.SellerLeads size={17} />, badge: dashboard?.unassignedCount },
        { key: 'buyer', label: 'Buyer leads', icon: <Icons.BuyerLeads size={17} />, badge: dashboard?.buyerPipeline?.received },
      ],
    },
    {
      title: 'Acquisition (buy car)',
      items: [
        { key: 'inspections', label: 'Inspection requests', icon: <Icons.Inspections size={17} /> },
        { key: 'offers', label: 'Acquisition offers', icon: <Icons.Offers size={17} />, badge: dashboard?.pendingReviewCount },
      ],
    },
    {
      title: 'Deal execution (sell car)',
      items: [
        { key: 'inventory', label: 'Inventory stock', icon: <Icons.Inventory size={17} /> },
        { key: 'testdrives', label: 'Test drives', icon: <Icons.TestDrives size={17} />, badge: dashboard?.upcomingTestDrives },
        { key: 'pipeline', label: 'Pipeline and quotes', icon: <Icons.Pipeline size={17} /> },
      ],
    },
    {
      title: 'Service and rentals',
      items: [
        { key: 'service-leads', label: 'Service bookings', icon: <Icons.TestDrives size={17} /> },
        { key: 'rental-leads', label: 'Rental enquiries', icon: <Icons.Inventory size={17} /> },
      ],
    },
    {
      title: 'Clients and follow-ups',
      items: [
        { key: 'tasks', label: 'Tasks and follow-ups', icon: <Icons.Tasks size={17} />, badge: dashboard?.tasksOverdue },
        { key: 'customers', label: 'Customers CRM', icon: <Icons.Customers size={17} /> },
        { key: 'communications', label: 'Communications', icon: <Icons.Communications size={17} /> },
        { key: 'reports', label: 'Funnel and reports', icon: <Icons.Reports size={17} /> },
      ],
    },
  ];

  // Action items shown in the bell, each with what happens when it is opened.
  const alertActions = new Map<string, () => void>();
  const alertItems: NotificationItem[] = [];
  const addAlert = (id: string, title: string, body: string, action?: () => void) => {
    alertItems.push({ id, title, body, read: false });
    if (action) alertActions.set(id, action);
  };
  notifications?.pendingOfferReviews?.forEach(o => addAlert(`offer-${o.id}`, `Offer review pending: ${formatCurrency(o.recommendedPurchasePaise)}`, `${o.vehicleTitle} · ${o.sellerName} (${o.referenceCode})`, async () => {
    if (!user) return;
    try { setSelectedSellerLead(await salesApi.sellerLead(user, o.leadId)); } catch (e) { toast.error('Could not open the lead', { description: describeApiError(e) }); }
  }));
  notifications?.pendingDiscounts?.forEach(d => addAlert(`discount-${d.id}`, `Discount pending: ${formatCurrency(d.requestedDiscountPaise)}`, `${d.vehicleTitle} · ${d.customerName}`, () => setPage('pipeline')));
  notifications?.sentQuotations?.forEach(q => addAlert(`quote-${q.id}`, `Quote sent: ${q.quotationNumber}`, `${q.vehicleTitle} · ${q.customerName} · ${formatCurrency(q.finalPricePaise)}`));
  notifications?.pendingTestDrives?.forEach(td => addAlert(`drive-${td.id}`, `Test drive: ${td.listing.title}`, `${td.user?.displayName || 'Customer'} · ${td.requestedDate} (${td.timeSlot})`, () => setPage('testdrives')));
  notifications?.unassignedLeads?.forEach(l => addAlert(`lead-${l.id}`, `Unassigned: ${l.make} ${l.model}`, `${l.city} · Ref: ${l.referenceCode}`, () => setPage('seller')));
  notifications?.overdueTasks?.forEach(t => addAlert(`task-${t.id}`, `Overdue: ${t.type}`, t.details, () => setPage('tasks')));

  return (
    <AppShell
      portalName="Sales"
      sections={navSections}
      active={page}
      onSelect={selectPage}
      account={{ name: actor?.displayName || actor?.email || 'Sales executive', role: actor?.roles[0] || 'SALES_EXECUTIVE' }}
      onSignOut={() => auth && signOut(auth)}
      context={actor?.globalScope ? 'All branches (HQ)' : actor?.branches.map(b => b.city).join(', ') || 'Branch'}
      toolbar={
        <>
          <NotificationBell
            title="Action items"
            items={alertItems}
            unread={notifications?.totalUnread ?? alertItems.length}
            onOpenItem={item => alertActions.get(item.id)?.()}
          />
          <Button variant="secondary" size="sm" loading={refreshing} icon={<Icons.Refresh size={14} />} onClick={async () => { setRefreshing(true); try { await loadData(); } finally { setRefreshing(false); } }}>Refresh</Button>
        </>
      }
    >
          {error && <Alert tone="warning" className="mb-4" onDismiss={() => setError('')}>{error}</Alert>}

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
                      <span className="badge badge-amber">Pending</span>
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
                      <span className="badge badge-amber">Pending</span>
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
                                    background: isApproved ? 'color-mix(in oklab, var(--color-success) 10%, transparent)' : 'color-mix(in oklab, var(--color-error) 10%, transparent)',
                                    color: isApproved ? 'var(--success)' : 'var(--danger)',
                                    border: `1px solid ${isApproved ? 'color-mix(in oklab, var(--color-success) 30%, transparent)' : 'color-mix(in oklab, var(--color-error) 30%, transparent)'}`
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
                        <th>Owner</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sellerLeads.slice(0, 5).map(lead => {
                        const activeAssignment = lead.assignments && lead.assignments.length > 0 ? lead.assignments[0] : null;
                        const isClaimedByMe = Boolean(user?.email && activeAssignment?.employee?.user?.email === user.email);
                        return (
                          <tr key={lead.id}>
                            <td>
                              <div className="table-title">{lead.manufacturingYear} {lead.make} {lead.model}</div>
                              <div className="table-sub">{lead.sellerName} · {lead.sellerPhone}</div>
                            </td>
                            <td>{lead.city}</td>
                            <td className="font-mono">{formatCurrency(lead.expectedPricePaise)}</td>
                            <td><span className={`badge ${statusBadgeClass(lead.status)}`}>{lead.status}</span></td>
                            <td>
                              {activeAssignment ? (
                                <span className={`badge ${isClaimedByMe ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: '11px' }}>
                                  {isClaimedByMe ? '✓ You' : (activeAssignment.employee?.user?.displayName || activeAssignment.employee?.user?.email)}
                                </span>
                              ) : (
                                <span className="badge badge-warning" style={{ fontSize: '11px' }}>Unassigned</span>
                              )}
                            </td>
                            <td>
                              <button className="btn-secondary btn-sm" onClick={() => setSelectedSellerLead(lead)}>
                                Manage Lead
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {sellerLeads.length === 0 && (
                        <tr><td colSpan={6} className="empty-state">No active seller enquiries in queue.</td></tr>
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
                        <th>Owner</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sellerLeads.map(lead => {
                        const activeAssignment = lead.assignments && lead.assignments.length > 0 ? lead.assignments[0] : null;
                        const isClaimedByMe = Boolean(user?.email && activeAssignment?.employee?.user?.email === user.email);
                        return (
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
                              {activeAssignment ? (
                                <span className={`badge ${isClaimedByMe ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: '11px' }}>
                                  {isClaimedByMe ? '✓ You' : (activeAssignment.employee?.user?.displayName || activeAssignment.employee?.user?.email)}
                                </span>
                              ) : (
                                <span className="badge badge-warning" style={{ fontSize: '11px' }}>Unassigned</span>
                              )}
                            </td>
                            <td>
                              <button className="btn-secondary btn-sm" onClick={() => setSelectedSellerLead(lead)}>
                                View Details
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {sellerLeads.length === 0 && (
                        <tr><td colSpan={8} className="empty-state">No seller leads found matching the filters.</td></tr>
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
                        <th>Confirmed location</th>
                        <th>Confirmed appointment</th>
                        <th>Appointment address</th>
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
                          <td><span className="badge badge-gray">{req.assignment?.locationType || req.locationType}</span></td>
                          <td>
                            <div>{formatDate(req.assignment?.scheduledAt || req.scheduledAt || req.requestedDate)}</div>
                            <div className="table-sub font-mono">
                              {req.assignment?.scheduledAt || req.scheduledAt ? 'Confirmed by Operations' : (req.timeSlot || 'Awaiting Operations')}
                            </div>
                          </td>
                          <td>{req.assignment?.address || req.address || req.lead.city}</td>
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
                                  background: val.status === 'REJECTED' ? 'color-mix(in oklab, var(--color-error) 12%, transparent)' : 'color-mix(in oklab, var(--color-base-content) 4%, transparent)',
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
                                  background: 'color-mix(in oklab, var(--color-error) 12%, transparent)',
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
                    <option value="PENDING">Discount pending review</option>
                    <option value="APPROVED">Discount approved</option>
                    <option value="REJECTED">Discount rejected</option>
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
                                    Discount pending ({formatCurrency(q.latestDiscountRequest.requestedDiscountPaise)})
                                  </span>
                                ) : q.latestDiscountRequest.status === 'APPROVED' ? (
                                  <span
                                    className="badge badge-green"
                                    style={{ fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    Discount approved (-{formatCurrency(q.latestDiscountRequest.requestedDiscountPaise)})
                                  </span>
                                ) : (
                                  <span
                                    className="badge badge-red"
                                    style={{ fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    title={q.latestDiscountRequest.decisionNotes || q.latestDiscountRequest.reason}
                                  >
                                    Discount rejected
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
                                <button className="btn-secondary btn-sm" onClick={() => { setEditingQuotation(q); setShowQuotationModal(true); }}>Edit</button>
                              )}
                              {(q.status === 'DRAFT' || q.status === 'APPROVED') && (
                                <button
                                  className="btn-primary btn-sm"
                                  onClick={async () => {
                                    if (!user) return;
                                    await salesApi.submitQuotation(user, q.id);
                                    void loadData();
                                  }}
                                >
                                  {q.status === 'APPROVED' ? 'Send' : 'Submit'}
                                </button>
                              )}
                              {q.status === 'DRAFT' && q.latestDiscountRequest?.status !== 'PENDING' && (
                                <button className="btn-secondary btn-sm" onClick={() => setShowDiscountModal(q.id)}>
                                  {q.latestDiscountRequest?.status === 'REJECTED' ? 'Request revised discount' : 'Request discount'}
                                </button>
                              )}
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
                <button className="btn-primary" onClick={() => setShowCreateTaskModal({ open: true })}>
                  <Icons.Tasks size={16} /> + Schedule Follow-up
                </button>
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
                        <tr>
                          <td colSpan={7} className="empty-state">
                            <div style={{ marginBottom: '8px' }}>No scheduled follow-up tasks.</div>
                            <button className="btn-primary btn-sm" onClick={() => setShowCreateTaskModal({ open: true })}>
                              + Schedule Follow-up Task
                            </button>
                          </td>
                        </tr>
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
          {/* VIEW: SERVICE LEADS & BOOKINGS                       */}
          {/* ==================================================== */}
          {page === 'service-leads' && (
            <div>
              <div className="page-header">
                <div>
                  <p className="eyebrow">AUTOMOTIVE SERVICE CRM</p>
                  <h1>Car Service Bookings & Follow-ups</h1>
                  <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>
                    Customer maintenance and repair bookings across V MOTIV Hubs. Coordinate scheduling and assist customers.
                  </p>
                </div>
              </div>

              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Job # & Date</th>
                      <th>Customer Details</th>
                      <th>Vehicle</th>
                      <th>Category & Hub</th>
                      <th>Scheduled Slot</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!serviceBookings.length ? (
                      <tr>
                        <td colSpan={7} className="empty-state">
                          <p>No customer service bookings found.</p>
                        </td>
                      </tr>
                    ) : (
                      serviceBookings.map((job: any) => (
                        <tr key={job.id}>
                          <td>
                            <strong>{job.requestNumber}</strong>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{formatDate(job.createdAt)}</div>
                          </td>
                          <td>
                            <div><strong>{job.customer?.displayName || 'Customer'}</strong></div>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{job.customer?.phone || job.customer?.email || '—'}</div>
                          </td>
                          <td>
                            <div><strong>{job.vehicle?.make} {job.vehicle?.model}</strong></div>
                            <span className="code-pill" style={{ fontSize: '11px' }}>{job.vehicle?.registrationNumber || '—'}</span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--accent)' }}>{job.categoryKey?.replace(/_/g, ' ')}</div>
                            <small style={{ color: 'var(--muted)' }}>{job.hub?.name || 'Local Hub'}</small>
                          </td>
                          <td>
                            <div>{job.scheduledDate}</div>
                            <small style={{ color: 'var(--muted)' }}>{job.scheduledTimeSlot}</small>
                          </td>
                          <td>
                            <span className="badge neutral">{job.status}</span>
                          </td>
                          <td>
                            {job.customer?.phone && (
                              <a href={`tel:${job.customer.phone}`} className="button secondary small">
                                Call Customer
                              </a>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* VIEW: RENTAL LEADS & ENQUIRIES                       */}
          {/* ==================================================== */}
          {page === 'rental-leads' && (
            <div>
              <div className="page-header">
                <div>
                  <p className="eyebrow">SELF-DRIVE RENTAL CRM</p>
                  <h1>Car Rental Enquiries & Trips</h1>
                  <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>
                    Customer rental bookings, driver KYC compliance, and trip coordination across V MOTIV Hubs.
                  </p>
                </div>
              </div>

              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Booking # & Date</th>
                      <th>Customer</th>
                      <th>Vehicle</th>
                      <th>Trip Period</th>
                      <th>Total Payable</th>
                      <th>KYC Status</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!rentalBookings.length ? (
                      <tr>
                        <td colSpan={8} className="empty-state">
                          <p>No rental bookings found.</p>
                        </td>
                      </tr>
                    ) : (
                      rentalBookings.map((b: any) => (
                        <tr key={b.id}>
                          <td>
                            <strong>{b.bookingNumber}</strong>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{formatDate(b.startTime)}</div>
                          </td>
                          <td>
                            <div><strong>{b.customer?.displayName || 'Customer'}</strong></div>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{b.customer?.phone || b.customer?.email || '—'}</div>
                          </td>
                          <td>
                            <div><strong>{b.vehicle?.make} {b.vehicle?.model}</strong></div>
                            <span className="code-pill" style={{ fontSize: '11px' }}>{b.vehicle?.registrationNumber || 'Fleet'}</span>
                          </td>
                          <td>
                            <div>{formatDate(b.startTime)}</div>
                            <small style={{ color: 'var(--muted)' }}>to {formatDate(b.endTime)}</small>
                          </td>
                          <td className="money">
                            <strong>{formatCurrency(b.totalPayablePaise)}</strong>
                          </td>
                          <td>
                            <span className={`badge ${b.kycStatus === 'VERIFIED' ? 'success' : 'warning'}`}>
                              {b.kycStatus || 'PENDING'}
                            </span>
                          </td>
                          <td>
                            <span className="badge neutral">{b.status}</span>
                          </td>
                          <td>
                            {b.customer?.phone && (
                              <a href={`tel:${b.customer.phone}`} className="button secondary small">
                                Assist Driver
                              </a>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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
          onCreateQuote={(listingId, customerId, enquiryId) => {
            setTargetListingId(listingId);
            setPrefilledCustomerId(customerId);
            setTargetEnquiryId(enquiryId || '');
            setShowQuotationModal(true);
          }}
          onBookTestDrive={(listingId, customerId, enquiryId) => {
            setTargetListingId(listingId);
            setPrefilledCustomerId(customerId);
            setTargetEnquiryId(enquiryId || '');
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
          initialEnquiryId={targetEnquiryId}
          draft={editingQuotation}
          onClose={() => {
            setShowQuotationModal(false);
            setEditingQuotation(null);
            setTargetListingId('');
            setPrefilledCustomerId('');
            setTargetEnquiryId('');
          }}
          onSuccess={() => {
            setShowQuotationModal(false);
            setEditingQuotation(null);
            setTargetListingId('');
            setPrefilledCustomerId('');
            setTargetEnquiryId('');
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
      {/* MODAL: SCHEDULE FOLLOW-UP TASK */}
      {/* ========================================== */}
      {showCreateTaskModal.open && (
        <CreateTaskModal
          user={user}
          leads={sellerLeads}
          defaultLeadId={showCreateTaskModal.leadId}
          onClose={() => setShowCreateTaskModal({ open: false })}
          onSuccess={() => {
            setShowCreateTaskModal({ open: false });
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
          initialEnquiryId={targetEnquiryId}
          onClose={() => {
            setShowTestDriveModal(false);
            setTargetListingId('');
            setPrefilledCustomerId('');
            setTargetEnquiryId('');
          }}
          onSuccess={() => {
            setShowTestDriveModal(false);
            setTargetListingId('');
            setPrefilledCustomerId('');
            setTargetEnquiryId('');
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
    </AppShell>
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
              <VehicleMakeModel
                variant="sales"
                make={form.make}
                model={form.model}
                onChange={(nextMake, nextModel) => setForm({ ...form, make: nextMake, model: nextModel })}
                loadItems={salesApi.masterData}
              />
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
const IN_PERSON_ERRORS: Record<string, string> = {
  SMS_NOT_CONFIGURED: 'Text messages are not set up on the server yet, so a code cannot be sent. Ask an administrator to configure SMS.',
  SMS_DELIVERY_FAILED: 'The code could not be sent to the seller\'s phone. Check the number on the lead and try again.',
  OTP_RESEND_TOO_SOON: 'A code was just sent. Please wait a minute before requesting another.',
  OTP_SEND_LIMIT_REACHED: 'Too many codes were requested for this offer. Try again in an hour.',
  SELLER_MUST_ACCEPT_IN_APP: 'This seller has a V MOTIV app account and must accept the offer in the app.',
  LEAD_NOT_AWAITING_SELLER_RESPONSE: 'This lead is no longer waiting for the seller\'s response.',
  OFFER_NOT_ACTIONABLE: 'This offer can no longer be accepted.',
  OFFER_EXPIRED: 'This offer has expired. Issue a new offer first.',
  OFFER_CHANGED_REQUEST_NEW_CODE: 'The offer changed after the code was sent. Send a new code.',
  ACCEPTANCE_CODE_INVALID: 'That code is not correct.',
  ACCEPTANCE_CODE_EXPIRED: 'That code has expired. Send a new code.',
  ACCEPTANCE_CODE_LOCKED: 'Too many wrong attempts. Send a new code.',
  ACCEPTANCE_CODE_ALREADY_USED: 'That code was already used.',
  ACCEPTANCE_CODE_NOT_FOUND: 'Start again and send a new code.',
};

/** Walk-in seller accepts an offer in person: a one-time code goes to THEIR phone and they hand it to staff. */
function InPersonAcceptDialog({ user, leadId, offer, sellerName, onClose, onAccepted }: {
  user: User;
  leadId: string;
  offer: { id: string; offerAmountPaise: string };
  sellerName: string;
  onClose: () => void;
  onAccepted: () => void;
}) {
  const [challenge, setChallenge] = useState<{ challengeId: string; phoneMasked: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const amount = (Number(offer.offerAmountPaise) / 100).toLocaleString('en-IN');
  const describe = (err: unknown) => (err instanceof ApiError ? IN_PERSON_ERRORS[err.code] || `Error: ${err.code}` : 'Something went wrong. Please try again.');

  async function sendCode() {
    setBusy(true);
    setError('');
    try {
      const started = await salesApi.startInPersonAcceptance(user, leadId, offer.id);
      setChallenge({ challengeId: started.challengeId, phoneMasked: started.phoneMasked });
      setCode('');
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (!challenge || code.length !== 6) return;
    setBusy(true);
    setError('');
    try {
      await salesApi.confirmInPersonAcceptance(user, leadId, offer.id, { challengeId: challenge.challengeId, code });
      onAccepted();
    } catch (err) {
      setError(describe(err));
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="modal-header">
          <h3>Seller accepts in person</h3>
          <button onClick={onClose} disabled={busy}><Icons.Close size={18} /></button>
        </div>
        <form onSubmit={confirm}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            <p style={{ marginTop: 0 }}>
              <strong>{sellerName}</strong> is accepting the offer of <strong>₹{amount}</strong>. A one-time code is texted to the seller&apos;s own phone.
              You never see it: the seller reads it out or types it below, while standing in front of you.
            </p>
            {!challenge ? (
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void sendCode()}>
                {busy ? 'Sending…' : 'Send code to seller'}
              </button>
            ) : (
              <>
                <p style={{ color: 'var(--muted)' }}>Code sent to {challenge.phoneMasked}. It is valid for 10 minutes.</p>
                <div className="form-group">
                  <label className="form-label">Code from the seller</label>
                  <input
                    className="form-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    autoFocus
                  />
                </div>
                <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => void sendCode()}>Send a new code</button>
              </>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy || !challenge || code.length !== 6}>
              {busy && challenge ? 'Confirming…' : 'Confirm acceptance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
  const [offers, setOffers] = useState<Array<{ id: string; offerAmountPaise: string; status: string; validUntil: string; terms?: string | null; createdAt?: string; version?: number; declineReason?: string | null; acceptedAt?: string | null; declinedAt?: string | null }>>([]);
  const [valuations, setValuations] = useState<ValuationItem[]>([]);

  // Form states
  const [interactionNotes, setInteractionNotes] = useState('');
  const [channel, setChannel] = useState('CALL');
  const [outcome, setOutcome] = useState('CONNECTED');

  const [showScheduleTaskForm, setShowScheduleTaskForm] = useState(false);
  const [taskType, setTaskType] = useState('CALL');
  const [taskPriority, setTaskPriority] = useState('NORMAL');
  const [taskDueAt, setTaskDueAt] = useState(() => new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 16));
  const [taskDetails, setTaskDetails] = useState('');
  const [taskExpectedOutcome, setTaskExpectedOutcome] = useState('');

  const [offerRupees, setOfferRupees] = useState('550000');
  const [acceptingOffer, setAcceptingOffer] = useState<{ id: string; offerAmountPaise: string } | null>(null);
  const isWalkInLead = Boolean(lead.user?.email?.toLowerCase().endsWith('@vmotiv.internal'));
  const [valExpectedResale, setValExpectedResale] = useState(() =>
    lead.expectedPricePaise ? String(BigInt(lead.expectedPricePaise) / 100n) : '600000'
  );
  const [valRefurbishment, setValRefurbishment] = useState('15000');
  const [valTargetMargin, setValTargetMargin] = useState('35000');
  const [valPurchasePrice, setValPurchasePrice] = useState('550000');
  const [valNotes, setValNotes] = useState('');
  const [showValuationForm, setShowValuationForm] = useState(false);
  const [inspectionDate, setInspectionDate] = useState(
    lead.inspectionDate ? new Date(lead.inspectionDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [inspectionSlot, setInspectionSlot] = useState(lead.inspectionTimeSlot || '10:00-12:00');
  const [inspectionLocationType, setInspectionLocationType] = useState<'HUB' | 'HOME'>(lead.inspectionLocationType || 'HUB');
  const [inspectionAddress, setInspectionAddress] = useState(lead.inspectionAddress || (lead.inspectionLocationType === 'HOME' ? `${lead.city} Doorstep` : `${lead.city} Hub`));
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
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

  const handleRelease = async () => {
    if (!user) return;
    if (!confirm('Release this lead back to the branch pool for other team members?')) return;
    setBusy(true);
    setError('');
    try {
      await salesApi.releaseSellerLead(user, lead.id);
      onRefresh();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? `Error: ${err.code}` : 'Failed to release lead.');
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

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      await salesApi.createTask(user, lead.id, {
        type: taskType,
        priority: taskPriority,
        dueAt: new Date(taskDueAt).toISOString(),
        details: taskDetails,
        expectedOutcome: taskExpectedOutcome || undefined,
      });
      setShowScheduleTaskForm(false);
      setTaskDetails('');
      onRefresh();
      alert('Follow-up task scheduled successfully! Visible in Tasks & Follow-ups queue.');
    } catch (err) {
      setError(err instanceof ApiError ? `Error: ${err.code}` : 'Failed to schedule task');
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

  const handleUpdateInspectionSchedule = async () => {
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      await salesApi.updateInspectionSchedule(user, lead.id, {
        inspectionDate,
        inspectionTimeSlot: inspectionSlot,
        inspectionLocationType,
        inspectionAddress: inspectionLocationType === 'HUB' ? `${lead.city} Hub` : (inspectionAddress || `${lead.city} Doorstep`),
        notes: inspectionNotes || undefined,
      });
      alert('Inspection schedule confirmed & synced with Operations dispatch!');
      setShowRescheduleForm(false);
      await loadInspectionSummary();
      onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? `Error: ${err.code}` : 'Failed to update inspection schedule');
    } finally {
      setBusy(false);
    }
  };

  const canAuthorizeValuation = Boolean(actor?.roles.some(r => ['ADMIN', 'SUPER_ADMIN', 'PRICING_APPROVER'].includes(r)));

  const handleCreateValuation = async (autoApprove: boolean) => {
    if (!user) return;
    const reportId = inspectionSummary?.approvedReport?.id;
    if (!reportId) {
      setError('An approved inspection report is required before establishing a valuation recommendation.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await salesApi.createValuation(user, lead.id, {
        inspectionReportId: reportId,
        expectedResalePaise: String(BigInt(valExpectedResale || '0') * 100n),
        refurbishmentPaise: String(BigInt(valRefurbishment || '0') * 100n),
        requiredMarginPaise: String(BigInt(valTargetMargin || '0') * 100n),
        recommendedPurchasePaise: String(BigInt(valPurchasePrice || '0') * 100n),
        notes: valNotes || (autoApprove ? 'Authorized commercial valuation baseline.' : 'Valuation proposal submitted for pricing review.'),
        autoApprove: canAuthorizeValuation && autoApprove,
      });
      alert(autoApprove ? 'Valuation authorized and approved!' : 'Valuation submitted for pricing review.');
      setShowValuationForm(false);
      await loadInteractions();
      onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? `Error: ${err.code}` : 'Failed to submit valuation');
    } finally {
      setBusy(false);
    }
  };

  const handleDecideValuation = async (valId: string, version: number, decision: 'APPROVE' | 'REJECT') => {
    if (!user) return;
    const reason = decision === 'REJECT' ? (prompt('Reason for rejecting valuation recommendation:') || '') : undefined;
    if (decision === 'REJECT' && !reason) return;
    setBusy(true);
    setError('');
    try {
      await salesApi.decideValuation(user, lead.id, valId, { version, decision, reason });
      alert(`Valuation recommendation ${decision === 'APPROVE' ? 'approved' : 'rejected'}.`);
      await loadInteractions();
      onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? `Error: ${err.code}` : 'Failed to decide valuation');
    } finally {
      setBusy(false);
    }
  };

  const handleProposeOffer = async () => {
    if (!user || !offerRupees) return;
    // If no approved valuation baseline exists and user is sales staff without direct pricing authority, submit valuation proposal
    if ((!valuations[0] || valuations[0].status !== 'APPROVED') && !canAuthorizeValuation) {
      await handleCreateValuation(false);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const validDate = new Date(Date.now() + 7 * 86400000).toISOString();
      const res = await salesApi.proposeAcquisitionOffer(user, lead.id, {
        offerAmountPaise: String(BigInt(offerRupees) * 100n),
        validUntil: validDate,
        terms: 'Authorized purchase valuation valid for 7 days.',
      });
      alert(res?.message || 'Official purchase offer issued to seller!');
      await loadInteractions();
      onRefresh();
    } catch (err: any) {
      const code = err?.code || (err instanceof ApiError ? err.code : '');
      if (code === 'OFFER_PROPOSAL_REQUIRES_APPROVED_VALUATION') {
        setError('Offer proposal requires an authorized valuation recommendation. Please establish or approve the valuation below.');
        setShowValuationForm(true);
      } else if (code === 'OFFER_EXCEEDS_APPROVED_VALUATION') {
        setError('Proposed offer exceeds the current approved valuation baseline. Please submit or authorize an updated valuation baseline below.');
        setShowValuationForm(true);
      } else {
        setError(code ? `Error: ${code}` : (err?.message || 'Offer proposal rejected'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      {acceptingOffer && user && (
        <InPersonAcceptDialog
          user={user}
          leadId={lead.id}
          offer={acceptingOffer}
          sellerName={lead.sellerName}
          onClose={() => setAcceptingOffer(null)}
          onAccepted={async () => {
            setAcceptingOffer(null);
            await loadInteractions();
            onRefresh();
          }}
        />
      )}
      <div className="modal-dialog lg">
        <div className="modal-header">
          <div>
            <span className="eyebrow">SELLER OPPORTUNITY · {lead.referenceCode}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>{lead.manufacturingYear} {lead.make} {lead.model}{lead.variant ? ` ${lead.variant}` : ''}</h3>
              {lead.registrationNumber ? (
                <span style={{ padding: '2px 8px', background: 'color-mix(in oklab, var(--color-base-content) 8%, transparent)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.5px' }}>
                  {lead.registrationNumber}
                </span>
              ) : (
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)', background: 'color-mix(in oklab, var(--color-base-content) 4%, transparent)', padding: '2px 6px', borderRadius: '4px' }}>Plate Pending</span>
              )}
            </div>
          </div>
          <button onClick={onClose}><Icons.Close size={18} /></button>
        </div>

        <div className="modal-body">
          {error && <div className="error-banner">{error}</div>}

          {/* Quick Action Ribbon */}
          {(() => {
            const activeAssignment = lead.assignments && lead.assignments.length > 0 ? lead.assignments[0] : null;
            const isClaimedByMe = Boolean(user?.email && activeAssignment?.employee?.user?.email === user.email);
            const assigneeName = activeAssignment?.employee?.user?.displayName || activeAssignment?.employee?.user?.email || 'Sales Advisor';

            return (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className={`badge ${statusBadgeClass(lead.status)}`}>{lead.status}</span>
                {activeAssignment ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      className={`badge ${isClaimedByMe ? 'badge-success' : 'badge-neutral'}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      {isClaimedByMe ? '✓ Claimed by You' : `🔒 Claimed by ${assigneeName}`}
                    </span>
                    {isClaimedByMe && (
                      <button
                        className="btn-outline btn-sm"
                        onClick={handleRelease}
                        disabled={busy}
                        style={{ fontSize: '11px', padding: '3px 8px' }}
                        title="Release this lead back to the unassigned branch pool"
                      >
                        Release Lead
                      </button>
                    )}
                  </div>
                ) : (
                  <button className="btn-secondary btn-sm" onClick={handleClaim} disabled={busy}>
                    Claim Lead
                  </button>
                )}
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
            );
          })()}

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
                <div className="metric-label">Registration & Vehicle</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{lead.manufacturingYear} {lead.make} {lead.model}</div>
                  {lead.registrationNumber ? (
                    <span style={{ padding: '1px 6px', background: 'color-mix(in oklab, var(--color-base-content) 8%, transparent)', border: '1px solid var(--border)', borderRadius: '3px', fontSize: '11px', fontWeight: 700 }}>
                      {lead.registrationNumber}
                    </span>
                  ) : null}
                </div>
                <div className="metric-sub">
                  Variant: <strong>{lead.variant || 'Standard'}</strong> · Colour: <strong>{lead.color || 'Standard'}</strong>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                  {[lead.registrationYear ? `Reg: ${lead.registrationYear}` : '', lead.registrationCity || lead.city].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Customer Available Inspection Time</div>
                <div style={{ fontWeight: 600, color: (lead.inspectionDate || lead.inspectionTimeSlot) ? 'var(--color-info)' : 'var(--text)' }}>
                  {lead.inspectionDate ? new Date(lead.inspectionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date not set'}
                </div>
                <div className="metric-sub">
                  Slot: <strong>{lead.inspectionTimeSlot || 'Flexible'}</strong> · {lead.inspectionLocationType === 'HOME' ? 'Doorstep' : 'Hub'}
                </div>
                {lead.inspectionAddress ? (
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lead.inspectionAddress}>
                    📍 {lead.inspectionAddress}
                  </div>
                ) : null}
              </div>
              <div className="metric-card">
                <div className="metric-label">Assigned Advisor</div>
                {lead.assignments && lead.assignments.length > 0 ? (
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {lead.assignments[0].employee?.user?.displayName || 'Sales Representative'}
                    </div>
                    <div className="metric-sub">{lead.assignments[0].employee?.user?.email}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                      Claimed {new Date(lead.assignments[0].assignedAt).toLocaleString()}
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="badge badge-warning">Unassigned Pool</span>
                    <div className="metric-sub" style={{ marginTop: '4px' }}>Open for branch claiming</div>
                  </div>
                )}
              </div>
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
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button type="submit" className="btn-primary btn-sm" disabled={busy}>
                    Log Interaction
                  </button>
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    onClick={() => setShowScheduleTaskForm(!showScheduleTaskForm)}
                  >
                    {showScheduleTaskForm ? 'Cancel Task' : '+ Schedule Follow-up Task'}
                  </button>
                </div>
              </form>

              {showScheduleTaskForm && (
                <form onSubmit={handleCreateTask} style={{ marginBottom: '16px', padding: '14px', background: 'color-mix(in oklab, var(--color-base-content) 3%, transparent)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '8px', color: 'var(--color-primary)' }}>
                    Schedule Next CRM Follow-up for this Opportunity
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Task Type *</label>
                      <select className="form-select" value={taskType} onChange={e => setTaskType(e.target.value)}>
                        <option value="CALL">Phone Call</option>
                        <option value="INSPECTION_COORDINATION">Inspection Coordination</option>
                        <option value="QUOTATION_FOLLOW_UP">Offer / Quotation Discussion</option>
                        <option value="DOCUMENT_FOLLOW_UP">Document / RC Verification</option>
                        <option value="TEST_DRIVE_FOLLOW_UP">Test Drive Follow-up</option>
                        <option value="MEETING">In-person Meeting</option>
                        <option value="EMAIL">Email Follow-up</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Priority</label>
                      <select className="form-select" value={taskPriority} onChange={e => setTaskPriority(e.target.value)}>
                        <option value="LOW">Low</option>
                        <option value="NORMAL">Normal</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Due Date & Time *</label>
                      <input
                        type="datetime-local"
                        className="form-input"
                        value={taskDueAt}
                        onChange={e => setTaskDueAt(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group full">
                      <label className="form-label">Task Details / Instructions *</label>
                      <input
                        required
                        className="form-input"
                        placeholder="e.g. Call seller to finalize valuation offer and schedule vehicle handover..."
                        value={taskDetails}
                        onChange={e => setTaskDetails(e.target.value)}
                      />
                    </div>
                    <div className="form-group full">
                      <label className="form-label">Expected Outcome (Optional)</label>
                      <input
                        className="form-input"
                        placeholder="e.g. Offer accepted, deposit collection agreed"
                        value={taskExpectedOutcome}
                        onChange={e => setTaskExpectedOutcome(e.target.value)}
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn-primary btn-sm" style={{ marginTop: '10px' }} disabled={busy}>
                    {busy ? 'Scheduling...' : 'Save Follow-up Task'}
                  </button>
                </form>
              )}

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
                      background: hasInspector ? 'color-mix(in oklab, var(--color-success) 8%, transparent)' : 'rgba(217, 119, 6, 0.08)',
                      border: `1px solid ${hasInspector ? 'color-mix(in oklab, var(--color-success) 30%, transparent)' : 'rgba(217, 119, 6, 0.3)'}`,
                      borderRadius: '8px',
                      padding: '16px',
                      gap: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: hasInspector ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: 600 }}>
                          <Icons.Inspections size={18} />
                          <span>
                            {hasInspector ? `Inspector Assigned · ${activeReq.assignment?.status}` : 'Inspection Requested · Awaiting Inspector Assignment'}
                          </span>
                        </div>
                        <span className={`badge ${hasInspector ? 'badge-green' : 'badge-yellow'}`}>
                          {hasInspector ? activeReq.assignment?.status : activeReq.status}
                        </span>
                      </div>

                      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                        {hasInspector
                          ? `An inspector has been assigned for ${activeReq.assignment?.locationType || activeReq.locationType} inspection at ${activeReq.assignment?.address || activeReq.address}. Appointment: ${activeReq.assignment?.scheduledAt ? new Date(activeReq.assignment.scheduledAt).toLocaleString() : 'Scheduled'}.`
                          : `Inspection requested for ${activeReq.requestedDate ? new Date(activeReq.requestedDate).toLocaleDateString() : 'Immediate'} (${activeReq.timeSlot || 'Anytime'}) at ${activeReq.address || activeReq.locationType}. Hub Operations will assign a certified field inspector shortly.`}
                      </p>

                      {/* Reschedule / Update Available Inspection Time */}
                      <div style={{ marginTop: '12px', borderTop: '1px solid color-mix(in oklab, var(--color-base-content) 8%, transparent)', paddingTop: '10px' }}>
                        <button
                          type="button"
                          className="btn-outline btn-sm"
                          onClick={() => setShowRescheduleForm(!showRescheduleForm)}
                          style={{ fontSize: '12px' }}
                        >
                          {showRescheduleForm ? '✕ Close Reschedule Form' : '📅 Update Available Inspection Time / Reschedule'}
                        </button>

                        {showRescheduleForm && (
                          <div style={{ marginTop: '12px', padding: '14px', background: 'color-mix(in oklab, var(--color-base-content) 3%, transparent)', border: '1px solid var(--border)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                              Mention Customer Confirmed Available Slot (Syncs directly to Operations Portal):
                            </div>
                            <div className="form-grid" style={{ gap: '10px' }}>
                              <div className="form-group">
                                <label className="form-label">Available Date</label>
                                <input type="date" className="form-input" value={inspectionDate} onChange={e => setInspectionDate(e.target.value)} />
                              </div>
                              <div className="form-group">
                                <label className="form-label">Time Slot</label>
                                <select className="form-select" value={inspectionSlot} onChange={e => setInspectionSlot(e.target.value)}>
                                  <option value="10:00-12:00">10:00 AM - 12:00 PM (Morning)</option>
                                  <option value="12:00-14:00">12:00 PM - 02:00 PM (Afternoon)</option>
                                  <option value="14:00-16:00">02:00 PM - 04:00 PM (Late Afternoon)</option>
                                  <option value="16:00-18:00">04:00 PM - 06:00 PM (Evening)</option>
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
                                <label className="form-label">Address</label>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={inspectionAddress}
                                  onChange={e => setInspectionAddress(e.target.value)}
                                  placeholder="Address for inspection"
                                />
                              </div>
                              <div className="form-group full">
                                <label className="form-label">Notes for Operations Dispatch / Field Inspector</label>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={inspectionNotes}
                                  onChange={e => setInspectionNotes(e.target.value)}
                                  placeholder="e.g. Customer requested after lunch, gate entry code 402"
                                />
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                              <button
                                type="button"
                                className="btn-primary btn-sm"
                                onClick={handleUpdateInspectionSchedule}
                                disabled={busy}
                              >
                                {busy ? 'Syncing...' : 'Sync Confirmed Slot to Operations'}
                              </button>
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                onClick={() => setShowRescheduleForm(false)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {inspectionSummary.approvedReport ? (
                        <div style={{ marginTop: '8px', padding: '10px', background: 'color-mix(in oklab, var(--color-success) 12%, transparent)', borderRadius: '6px' }}>
                          <div style={{ color: 'var(--color-success)', fontWeight: 600, fontSize: '0.85rem' }}>
                            ✓ Inspection Report Approved (Rev #{inspectionSummary.approvedReport.revision})
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '2px' }}>
                            {inspectionSummary.approvedReport.defectsCount} defects recorded · {inspectionSummary.approvedReport.mediaCount} evidence photos attached
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })()
              ) : !['SUBMITTED', 'QUALIFYING', 'INSPECTION_SCHEDULED'].includes(lead.status) ? (
                <div className="form-group full" style={{ background: 'rgba(100, 116, 139, 0.1)', border: '1px solid rgba(100, 116, 139, 0.2)', borderRadius: '8px', padding: '16px' }}>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted)' }}>
                    This lead status ({lead.status}) is not eligible for new inspection requests.
                  </p>
                </div>
              ) : (
                <>
                  {(lead.inspectionDate || lead.inspectionTimeSlot) && (
                    <div className="form-group full" style={{ background: 'color-mix(in oklab, var(--color-info) 8%, transparent)', border: '1px solid color-mix(in oklab, var(--color-info) 25%, transparent)', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ color: 'var(--color-info)', fontWeight: 600, fontSize: '0.85rem' }}>
                        Customer Stated Preferred Appointment:
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '2px' }}>
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
                      <option value="10:00-12:00">10:00 AM - 12:00 PM (Morning)</option>
                      <option value="12:00-14:00">12:00 PM - 02:00 PM (Afternoon)</option>
                      <option value="14:00-16:00">02:00 PM - 04:00 PM (Late Afternoon)</option>
                      <option value="16:00-18:00">04:00 PM - 06:00 PM (Evening)</option>
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
              {/* Inspection Prerequisite Banner */}
              {!inspectionSummary?.approvedReport ? (
                <div style={{
                  background: 'color-mix(in oklab, var(--color-error) 8%, transparent)',
                  border: '1px solid color-mix(in oklab, var(--color-error) 30%, transparent)',
                  borderRadius: '8px',
                  padding: '14px',
                  marginBottom: '16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-error)', fontWeight: 600 }}>
                    <Icons.Inspections size={18} />
                    <span>Inspection Report Required Before Valuation</span>
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                    Under V MOTIV policy, an independent vehicle inspection must be conducted and approved by the review team before commercial valuation and acquisition offers can be authorized.
                  </div>
                </div>
              ) : (
                <div style={{
                  background: 'color-mix(in oklab, var(--color-success) 8%, transparent)',
                  border: '1px solid color-mix(in oklab, var(--color-success) 30%, transparent)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-success)', fontWeight: 600, fontSize: '0.9rem' }}>
                    <Icons.Inspections size={17} />
                    <span>✓ Verified Inspection Report (Rev #{inspectionSummary.approvedReport.revision})</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    {inspectionSummary.approvedReport.defectsCount ?? 0} defects recorded · {inspectionSummary.approvedReport.mediaCount ?? 0} photos attached
                  </div>
                </div>
              )}

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
                          <span>🟡 Valuation Recommendation Under Review</span>
                        </div>
                        <span className="badge badge-amber">Awaiting Approval</span>
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '0.875rem', color: 'var(--muted)' }}>
                        Recommended Purchase Price: <strong className="font-mono">{formatCurrency(latestVal.recommendedPurchasePaise)}</strong>
                        {latestVal.expectedResalePaise && ` · Expected Resale: ${formatCurrency(latestVal.expectedResalePaise)}`}
                      </div>
                      <div style={{ marginTop: '4px', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Submitted by {latestVal.createdBy?.user?.displayName || 'Sales / Pricing Staff'} on {formatDate(latestVal.createdAt)}.
                      </div>

                      {canAuthorizeValuation && (
                        <div style={{ marginTop: '12px', display: 'flex', gap: '8px', borderTop: '1px solid color-mix(in oklab, var(--color-base-content) 8%, transparent)', paddingTop: '10px' }}>
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            style={{ background: 'var(--color-success)', color: 'var(--color-success-content)', fontWeight: 600, border: 'none' }}
                            onClick={() => handleDecideValuation(latestVal.id, latestVal.version, 'APPROVE')}
                            disabled={busy}
                          >
                            ✓ Authorize & Approve Valuation
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            style={{ color: 'var(--color-error)' }}
                            onClick={() => handleDecideValuation(latestVal.id, latestVal.version, 'REJECT')}
                            disabled={busy}
                          >
                            ✕ Reject Valuation
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }

                if (latestVal.status === 'APPROVED') {
                  return (
                    <div style={{
                      background: 'color-mix(in oklab, var(--color-success) 8%, transparent)',
                      border: '1px solid color-mix(in oklab, var(--color-success) 40%, transparent)',
                      borderRadius: '8px',
                      padding: '14px',
                      marginBottom: '16px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', fontWeight: 600 }}>
                          <Icons.Offers size={18} />
                          <span>🟢 Authorized Acquisition Valuation</span>
                        </div>
                        <span className="badge badge-green">Authorized Price</span>
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '0.875rem', color: 'var(--muted)' }}>
                        Maximum Authorized Purchase Offer: <strong className="font-mono">{formatCurrency(latestVal.recommendedPurchasePaise)}</strong>
                        {latestVal.expectedResalePaise && ` · Target Resale: ${formatCurrency(latestVal.expectedResalePaise)}`}
                      </div>
                      <div style={{ marginTop: '4px', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Authorized by {latestVal.approvedBy?.user?.displayName || 'Administration'} on {formatDate(latestVal.approvedAt || latestVal.updatedAt)}. The official purchase offer can now be communicated to the seller.
                      </div>
                    </div>
                  );
                }

                if (latestVal.status === 'REJECTED') {
                  return (
                    <div style={{
                      background: 'color-mix(in oklab, var(--color-error) 8%, transparent)',
                      border: '1px solid color-mix(in oklab, var(--color-error) 40%, transparent)',
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
                      <div style={{ marginTop: '8px', fontSize: '0.875rem', color: 'var(--muted)' }}>
                        Proposed Amount: <strong className="font-mono">{formatCurrency(latestVal.recommendedPurchasePaise)}</strong>
                      </div>
                      <div style={{
                        marginTop: '8px',
                        padding: '8px 12px',
                        background: 'color-mix(in oklab, var(--color-error) 15%, transparent)',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        color: 'var(--color-error)',
                      }}>
                        <strong>Admin Feedback / Reason:</strong> {latestVal.notes || 'Price exceeds commercial bounds. Please submit a revised proposal.'}
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Reviewed by {latestVal.approvedBy?.user?.displayName || 'Admin'} on {formatDate(latestVal.updatedAt)}. Adjust parameters below to submit a revision.
                      </div>
                    </div>
                  );
                }

                return null;
              })()}

              {/* Valuation Recommendation Form: Visible if no approved valuation exists, or when toggled */}
              {inspectionSummary?.approvedReport && (!valuations[0] || valuations[0].status !== 'APPROVED' || showValuationForm) && (
                <div style={{
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)' }}>
                      📊 Acquisition Valuation & Economics Recommendation
                    </div>
                    {valuations[0]?.status === 'APPROVED' && (
                      <button type="button" className="text-button" onClick={() => setShowValuationForm(false)}>Hide</button>
                    )}
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Expected Retail Resale Price (₹)</label>
                      <input
                        className="form-input font-mono"
                        type="number"
                        value={valExpectedResale}
                        onChange={e => setValExpectedResale(e.target.value)}
                        placeholder="e.g. 600000"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Estimated Refurbishment Cost (₹)</label>
                      <input
                        className="form-input font-mono"
                        type="number"
                        value={valRefurbishment}
                        onChange={e => setValRefurbishment(e.target.value)}
                        placeholder="e.g. 15000"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Target Margin / Operational Cost (₹)</label>
                      <input
                        className="form-input font-mono"
                        type="number"
                        value={valTargetMargin}
                        onChange={e => setValTargetMargin(e.target.value)}
                        placeholder="e.g. 35000"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Recommended Purchase Price (₹)</label>
                      <input
                        className="form-input font-mono"
                        type="number"
                        value={valPurchasePrice}
                        onChange={e => {
                          setValPurchasePrice(e.target.value);
                          setOfferRupees(e.target.value);
                        }}
                        placeholder="e.g. 550000"
                      />
                    </div>
                    <div className="form-group full">
                      <label className="form-label">Valuation Notes / Commercial Rationale</label>
                      <input
                        className="form-input"
                        value={valNotes}
                        onChange={e => setValNotes(e.target.value)}
                        placeholder="e.g. Bodywork in good shape, tyres have 40% life remaining, margin aligned with market tier."
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {canAuthorizeValuation && (
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ background: 'var(--color-success)', color: 'var(--color-success-content)', fontWeight: 600, border: 'none' }}
                        onClick={() => handleCreateValuation(true)}
                        disabled={busy}
                      >
                        {busy ? 'Authorizing...' : '✓ Authorize & Establish Valuation'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleCreateValuation(false)}
                      disabled={busy}
                    >
                      {busy ? 'Submitting...' : 'Submit Valuation for Review'}
                    </button>
                  </div>
                </div>
              )}

              {/* Offer Proposal Section */}
              {inspectionSummary?.approvedReport && (
                <div style={{
                  background: 'color-mix(in oklab, var(--color-base-content) 3%, transparent)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '16px',
                }}>
                  {(() => {
                    const latestOffer = offers[0];
                    const isDeclined = latestOffer?.status === 'DECLINED';
                    const nextVersion = (latestOffer?.version || 1) + (isDeclined ? 1 : 0);
                    return (
                      <>
                        {isDeclined && (
                          <div style={{
                            background: 'color-mix(in oklab, var(--color-error) 8%, transparent)',
                            border: '1px solid color-mix(in oklab, var(--color-error) 35%, transparent)',
                            borderRadius: '8px',
                            padding: '14px',
                            marginBottom: '16px',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-error)', fontWeight: 600, fontSize: '0.92rem' }}>
                                <Icons.Offers size={18} />
                                <span>Previous Purchase Offer (v{latestOffer.version || 1} · {formatCurrency(latestOffer.offerAmountPaise)}) was Declined</span>
                              </div>
                              <span className="badge badge-red">Declined by Seller</span>
                            </div>
                            <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--muted)' }}>
                              <strong>Decline Reason / Feedback:</strong> {latestOffer.declineReason || 'Price not acceptable to seller'}
                              {lead.expectedPricePaise && (
                                <span> · Seller Expectation: <strong className="font-mono">{formatCurrency(lead.expectedPricePaise)}</strong></span>
                              )}
                            </div>
                            <div style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--muted)' }}>
                              The seller lead remains active in commercial negotiation. You can propose a revised counter-offer (v{nextVersion}) below to continue the acquisition.
                            </div>
                          </div>
                        )}

                        <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>{isDeclined ? `🔄 Issue Revised Counter-Offer (v${nextVersion})` : '📢 Issue Official Purchase Offer to Seller'}</span>
                          {valuations[0]?.status === 'APPROVED' && !showValuationForm && (
                            <button type="button" className="text-button" style={{ fontSize: '0.8rem' }} onClick={() => setShowValuationForm(true)}>
                              Revise Valuation Baseline
                            </button>
                          )}
                        </div>
                        <div className="form-grid">
                          <div className="form-group">
                            <label className="form-label">{isDeclined ? `Counter-Offer Amount v${nextVersion} (₹)` : 'Purchase Offer Amount (₹)'}</label>
                            <input
                              className="form-input font-mono"
                              value={offerRupees}
                              onChange={e => setOfferRupees(e.target.value)}
                              placeholder="Offer amount in ₹"
                            />
                          </div>
                          <div className="form-group" style={{ justifyContent: 'flex-end', alignItems: 'flex-end' }}>
                            <button
                              className="btn-primary"
                              onClick={handleProposeOffer}
                              disabled={busy || !offerRupees}
                              style={{ width: '100%' }}
                            >
                              {busy
                                ? 'Processing...'
                                : (!valuations[0] || valuations[0].status !== 'APPROVED') && !canAuthorizeValuation
                                ? 'Submit Valuation Proposal for Pricing Review'
                                : isDeclined
                                ? `Issue Revised Counter-Offer (v${nextVersion})`
                                : 'Propose Purchase Offer'}
                            </button>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

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
                              background: val.status === 'REJECTED' ? 'color-mix(in oklab, var(--color-error) 12%, transparent)' : 'color-mix(in oklab, var(--color-base-content) 4%, transparent)',
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
                          <div style={{ fontWeight: 600 }}>Official Offer (v{o.version || 1})</div>
                          <div className="table-sub">{formatDate(o.createdAt || o.validUntil)}</div>
                        </td>
                        <td className="font-mono" style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                          {formatCurrency(o.offerAmountPaise)}
                        </td>
                        <td><span className={`badge ${statusBadgeClass(o.status)}`}>{o.status}</span></td>
                        <td style={{ maxWidth: '240px' }}>
                          {o.status === 'DECLINED' && o.declineReason ? (
                            <div style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '0.78rem',
                              lineHeight: 1.3,
                              background: 'color-mix(in oklab, var(--color-error) 12%, transparent)',
                              color: 'var(--color-error)',
                            }}>
                              Declined: {o.declineReason}
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                              Valid until: {formatDate(o.validUntil)}
                            </span>
                          )}
                        </td>
                        <td>
                          {o.status === 'OFFERED' && (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                              {/* Acceptance is a legally meaningful act by the seller: the API only accepts it from the seller's own
                                  signed-in app session (SELLER_ACCEPTANCE_REQUIRES_CUSTOMER_AUTHENTICATION), never from staff. */}
                              {isWalkInLead ? (
                                <button className="btn-primary btn-sm" onClick={() => setAcceptingOffer({ id: o.id, offerAmountPaise: o.offerAmountPaise })}>
                                  Accept in person
                                </button>
                              ) : (
                                <span style={{ fontSize: '0.78rem', color: 'var(--muted)', maxWidth: '170px', lineHeight: 1.3 }}>
                                  Awaiting the seller to accept in the V MOTIV app
                                </span>
                              )}
                              <button
                                className="btn-danger btn-sm"
                                onClick={async () => {
                                  if (!user) return;
                                  const reason = prompt('Enter customer decline reason (e.g. Price too low, expecting higher offer):') || 'Price not acceptable';
                                  try {
                                    await salesApi.recordOfferResponse(user, lead.id, o.id, { decision: 'DECLINED', declineReason: reason });
                                    await loadInteractions();
                                    onRefresh();
                                  } catch (error) {
                                    window.alert(error instanceof Error ? error.message : 'Could not record the decline. Please try again.');
                                  }
                                }}
                              >
                                Declined
                              </button>
                            </div>
                          )}
                          {o.status === 'DECLINED' && (
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => {
                                setOfferRupees('');
                                const el = document.querySelector('input[placeholder="Offer amount in ₹"]') as HTMLInputElement | null;
                                if (el) {
                                  el.focus();
                                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                              }}
                            >
                              Counter-Offer
                            </button>
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
  onCreateQuote?: (listingId: string, customerId: string, enquiryId?: string) => void;
  onBookTestDrive?: (listingId: string, customerId: string, enquiryId?: string) => void;
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
            <span className="eyebrow">BUYER ENQUIRY WORKFLOW</span>
            <h3>{lead.user.displayName || lead.user.email}</h3>
          </div>
          <button onClick={onClose}><Icons.Close size={18} /></button>
        </div>
        <div className="modal-body">
          {/* Synchronized 4-Stage Lead Pipeline */}
          <div style={{ marginBottom: '14px', padding: '10px 12px', background: 'color-mix(in oklab, var(--color-base-content) 3%, transparent)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '8px', fontWeight: 600 }}>
              Lead Workflow Progress (Synced with Customer Mobile)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', textAlign: 'center', fontSize: '12px' }}>
              {[
                { key: 'RECEIVED', label: '1. Received' },
                { key: 'IN_REVIEW', label: '2. In Review' },
                { key: 'CONTACTED', label: '3. Contacted' },
                { key: 'CLOSED', label: '4. Closed' },
              ].map(st => {
                const isActive = lead.status === st.key;
                const isPast = ['RECEIVED', 'IN_REVIEW', 'CONTACTED', 'CLOSED'].indexOf(lead.status) > ['RECEIVED', 'IN_REVIEW', 'CONTACTED', 'CLOSED'].indexOf(st.key);
                return (
                  <div key={st.key} style={{
                    padding: '6px 4px',
                    borderRadius: '6px',
                    fontWeight: isActive ? 700 : 500,
                    background: isActive ? 'var(--yellow)' : isPast ? 'color-mix(in oklab, var(--color-success) 15%, transparent)' : 'color-mix(in oklab, var(--color-base-content) 2%, transparent)',
                    color: isActive ? 'var(--color-base-100)' : isPast ? 'var(--success)' : 'var(--muted)',
                    border: isActive ? '1px solid var(--yellow)' : '1px solid transparent',
                  }}>
                    {st.label}
                  </div>
                );
              })}
            </div>
          </div>

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
                      onCreateQuote(lead.listing.id, lead.user.id, lead.id);
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
                      onBookTestDrive(lead.listing.id, lead.user.id, lead.id);
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
              Move to In Review
            </button>
          )}
          {lead.status === 'IN_REVIEW' && (
            <button className="btn-primary" onClick={() => updateStatus('CONTACTED')} disabled={busy}>
              Move to Contacted
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

          <h4 style={{ margin: '14px 0 8px', fontSize: '14px' }}>Communications & Notification History</h4>
          <div className="table-responsive">
            <table>
              <thead>
                <tr><th>Channel / Type</th><th>Subject / Title</th><th>Status</th><th>Date</th></tr>
              </thead>
              <tbody>
                {((customer.emailOutbox || []).map(e => ({
                  id: e.id,
                  channel: 'EMAIL',
                  title: e.subject,
                  template: e.templateVersion,
                  status: e.state,
                  date: e.createdAt,
                  detail: e.text,
                })).concat((customer.notifications || []).map(n => ({
                  id: n.id,
                  channel: 'IN_APP',
                  title: n.title,
                  template: n.category,
                  status: n.read ? 'READ' : 'UNREAD',
                  date: n.createdAt,
                  detail: n.body,
                })))).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(c => (
                  <tr key={c.id}>
                    <td>
                      <span className={`badge ${c.channel === 'EMAIL' ? 'badge-blue' : 'badge-amber'}`}>
                        {c.channel}
                      </span>
                      <small style={{ display: 'block', fontSize: '10px', color: 'var(--muted)' }}>{c.template}</small>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.title}</div>
                      {c.detail && <small style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', whiteSpace: 'pre-wrap', maxHeight: '40px', overflow: 'hidden' }}>{c.detail}</small>}
                    </td>
                    <td><span className={`badge ${statusBadgeClass(c.status)}`}>{c.status}</span></td>
                    <td><small>{new Date(c.date).toLocaleString()}</small></td>
                  </tr>
                ))}
                {(!customer.emailOutbox || customer.emailOutbox.length === 0) && (!customer.notifications || customer.notifications.length === 0) && (
                  <tr><td colSpan={4} className="empty-state">No communications recorded.</td></tr>
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
          background: 'color-mix(in oklab, var(--color-success) 8%, transparent)',
          border: '1px solid color-mix(in oklab, var(--color-success) 30%, transparent)',
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
          background: 'var(--color-base-200)',
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
            background: 'var(--color-base-200)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 10px 25px var(--scrim)',
            zIndex: 100,
          }}>
            <div style={{ padding: '6px 10px', fontSize: '11px', color: 'var(--muted)', borderBottom: '1px solid color-mix(in oklab, var(--color-base-content) 6%, transparent)', display: 'flex', justifyContent: 'space-between' }}>
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
                  borderBottom: '1px solid color-mix(in oklab, var(--color-base-content) 4%, transparent)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  background: c.id === value ? 'color-mix(in oklab, var(--color-primary) 12%, transparent)' : 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in oklab, var(--color-base-content) 6%, transparent)')}
                onMouseLeave={e => (e.currentTarget.style.background = c.id === value ? 'color-mix(in oklab, var(--color-primary) 12%, transparent)' : 'transparent')}
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
          background: 'color-mix(in oklab, var(--color-info) 8%, transparent)',
          border: '1px solid color-mix(in oklab, var(--color-info) 30%, transparent)',
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
          background: 'var(--color-base-200)',
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
            background: 'var(--color-base-200)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 10px 25px var(--scrim)',
            zIndex: 100,
          }}>
            <div style={{ padding: '6px 10px', fontSize: '11px', color: 'var(--muted)', borderBottom: '1px solid color-mix(in oklab, var(--color-base-content) 6%, transparent)', display: 'flex', justifyContent: 'space-between' }}>
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
                  borderBottom: '1px solid color-mix(in oklab, var(--color-base-content) 4%, transparent)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  background: i.id === value ? 'color-mix(in oklab, var(--color-primary) 12%, transparent)' : 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in oklab, var(--color-base-content) 6%, transparent)')}
                onMouseLeave={e => (e.currentTarget.style.background = i.id === value ? 'color-mix(in oklab, var(--color-primary) 12%, transparent)' : 'transparent')}
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
  initialEnquiryId = '',
  draft = null,
  onClose,
  onSuccess,
}: {
  user: User | null;
  customers?: Customer[];
  inventory?: InventoryItem[];
  initialListingId?: string;
  initialCustomerId?: string;
  initialEnquiryId?: string;
  draft?: Quotation | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    listingId: draft?.listing.id || initialListingId || inventory[0]?.id || '',
    customerId: draft?.customer.id || initialCustomerId || customers[0]?.id || '',
    chargesRupees: draft ? String(BigInt(draft.chargesPaise) / 100n) : '15000',
    validDays: draft ? Math.max(1, Math.ceil((new Date(draft.validUntil).getTime() - Date.now()) / 86400000)) : 7,
    terms: draft?.terms || 'Valid with authorized V MOTIV quality inspection warranty.',
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
      const payload = {
        chargesPaise: String(BigInt(form.chargesRupees) * 100n),
        validUntil,
        terms: form.terms,
        enquiryId: initialEnquiryId || undefined,
      };
      if (draft) await salesApi.updateQuotation(user, draft.id, payload);
      else await salesApi.createQuotation(user, { listingId: form.listingId, customerId: form.customerId, ...payload });
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
          <h3>{draft ? 'Edit Draft Quotation' : 'Prepare Retail Quotation'}</h3>
          <button onClick={onClose}><Icons.Close size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            <div className="form-grid">
              {draft ? <>
                <div className="form-group"><label className="form-label">Vehicle</label><div className="form-input" aria-readonly="true">{draft.listing.title}</div></div>
                <div className="form-group"><label className="form-label">Customer</label><div className="form-input" aria-readonly="true">{draft.customer.displayName || draft.customer.email}</div></div>
              </> : <>
                <SearchableVehicleInput user={user} value={form.listingId} onChange={id => setForm(f => ({ ...f, listingId: id }))} inventory={inventory} required />
                <SearchableCustomerInput user={user} value={form.customerId} onChange={id => setForm(f => ({ ...f, customerId: id }))} customers={customers} required />
              </>}
              <div className="form-group">
                <label className="form-label">Add-on Charges (RTO / Ins) ₹</label>
                <input className="form-input" value={form.chargesRupees} onChange={e => setForm({ ...form, chargesRupees: e.target.value })} />
              </div>
              <p className="form-helper full">Discounts are not applied while preparing a quotation. Save this draft first, then request a separately approved commercial discount.</p>
              <div className="form-group full">
                <label className="form-label">Terms and Notes</label>
                <textarea className="form-textarea" value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : draft ? 'Save Draft Changes' : 'Create Draft Quotation'}</button>
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
// SUBCOMPONENT: CREATE TASK MODAL
// ==========================================
function CreateTaskModal({
  user,
  leads = [],
  defaultLeadId,
  onClose,
  onSuccess,
}: {
  user: User | null;
  leads: SellerLead[];
  defaultLeadId?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [leadId, setLeadId] = useState(defaultLeadId || (leads[0]?.id || ''));
  const [type, setType] = useState('CALL');
  const [priority, setPriority] = useState('NORMAL');
  const [dueAt, setDueAt] = useState(() => {
    const d = new Date(Date.now() + 2 * 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [details, setDetails] = useState('');
  const [expectedOutcome, setExpectedOutcome] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !leadId) {
      setError('Please select an active seller opportunity.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await salesApi.createTask(user, leadId, {
        type,
        priority,
        dueAt: new Date(dueAt).toISOString(),
        details,
        expectedOutcome: expectedOutcome || undefined,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? `Error: ${err.code}` : 'Failed to schedule task');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="modal-header">
          <h3>Schedule CRM Follow-up Task</h3>
          <button onClick={onClose}><Icons.Close size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}

            <div className="form-group">
              <label className="form-label">Related Seller Opportunity *</label>
              {leads.length > 0 ? (
                <select className="form-select" value={leadId} onChange={e => setLeadId(e.target.value)} required>
                  {leads.map(l => (
                    <option key={l.id} value={l.id}>
                      [{l.referenceCode}] {l.make} {l.model} — {l.sellerName} ({l.city})
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ color: 'var(--color-destructive)', fontSize: '0.85rem' }}>
                  No active seller leads found. Claim or create an acquisition opportunity first.
                </div>
              )}
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Task Type *</label>
                <select className="form-select" value={type} onChange={e => setType(e.target.value)}>
                  <option value="CALL">Phone Call</option>
                  <option value="INSPECTION_COORDINATION">Inspection Coordination</option>
                  <option value="QUOTATION_FOLLOW_UP">Offer / Quotation Discussion</option>
                  <option value="DOCUMENT_FOLLOW_UP">Document / RC Verification</option>
                  <option value="TEST_DRIVE_FOLLOW_UP">Test Drive Follow-up</option>
                  <option value="MEETING">In-person Meeting</option>
                  <option value="EMAIL">Email Follow-up</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Priority</label>
                <select className="form-select" value={priority} onChange={e => setPriority(e.target.value)}>
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Due Date & Time *</label>
              <input
                type="datetime-local"
                className="form-input"
                value={dueAt}
                onChange={e => setDueAt(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Task Details / Instructions *</label>
              <textarea
                required
                className="form-textarea"
                placeholder="e.g. Call seller to confirm doorstep inspection time slot and address..."
                value={details}
                onChange={e => setDetails(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Expected Outcome (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Confirmed inspection appointment for tomorrow"
                value={expectedOutcome}
                onChange={e => setExpectedOutcome(e.target.value)}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy || !leads.length}>
              {busy ? 'Scheduling...' : 'Schedule Task'}
            </button>
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
  initialEnquiryId = '',
  onClose,
  onSuccess,
}: {
  user: User | null;
  customers?: Customer[];
  inventory?: InventoryItem[];
  initialListingId?: string;
  initialCustomerId?: string;
  initialEnquiryId?: string;
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
        enquiryId: initialEnquiryId || undefined,
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
                <input required type="date" min={new Date().toISOString().slice(0, 10)} className="form-input" value={form.requestedDate} onChange={e => setForm({ ...form, requestedDate: e.target.value })} />
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
            <span style={{ color: 'var(--color-danger, var(--color-error))' }}>
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
              background: 'color-mix(in oklab, var(--color-error) 12%, transparent)',
              border: '1px solid color-mix(in oklab, var(--color-error) 35%, transparent)',
              borderRadius: '8px',
              padding: '14px',
              marginBottom: '16px'
            }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--color-error)', marginBottom: '4px' }}>
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
                    background: 'color-mix(in oklab, var(--color-base-content) 5%, transparent)',
                    color: 'var(--text, var(--color-base-content))',
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
                      background: 'color-mix(in oklab, var(--color-base-content) 5%, transparent)',
                      color: 'var(--text, var(--color-base-content))',
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
                      background: 'color-mix(in oklab, var(--color-base-content) 5%, transparent)',
                      color: 'var(--text, var(--color-base-content))',
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
mountLiveChangeBar({ sales: 'Leads, enquiries, test drives & quotations' });
