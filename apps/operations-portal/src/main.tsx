import { Suspense, lazy, useEffect, useMemo, useRef, useState, type FC, type FormEvent } from 'react';
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
import { auth, firebaseConfigured } from './firebase';
import { OpeningStockTools } from './components/OpeningStockTools';
import { api, ApiError, operationsNotifications } from './api';
import type {
  AcquisitionCase,
  Branch,
  DashboardMetrics,
  InspectionRequest,
  InspectorEmployee,
  RefurbishmentWorkOrder,
  TestDrive,
  VehicleStockUnit,
} from './types';
import {
  IconAcquisitions,
  IconCheck,
  IconClock,
  IconCross,
  IconDashboard,
  IconDelivery,
  IconDispatch,
  IconDocuments,
  IconHandover,
  IconInventory,
  IconLock,
  IconLogout,
  IconMenu,
  IconPublish,
  IconQC,
  IconRefresh,
  IconRefurbishment,
  IconRentals,
  IconSearch,
  IconService,
  IconStudio,
} from './icons';
// The two big workshop and rental screens are only downloaded when their tab is opened.
const ServiceOperationsPanel = lazy(() => import('./components/ServiceOperationsPanel').then(m => ({ default: m.ServiceOperationsPanel })));
const HomeContentManager = lazy(() => import('./components/HomeContentManager').then(m => ({ default: m.HomeContentManager })));
const RentalOperationsPanel = lazy(() => import('./components/RentalOperationsPanel').then(m => ({ default: m.RentalOperationsPanel })));
import {
  Alert, AppShell, AuthLayout, Button, CenterState, MfaChallengeModal, PageLoader, SkeletonRows, StaffNotificationBell, tabFromDeepLink, toast,
  initTheme, modalIsOpen, mountLiveChangeBar, registerViewHandler, useAutoRefresh, useChangeWatcher, type NavSection,
} from '@vmotiv/ui';
import './styles.css';

initTheme();

type TabKey =
  | 'overview'
  | 'dispatch'
  | 'acquisitions'
  | 'documentation'
  | 'handover'
  | 'inventory'
  | 'refurbishment'
  | 'qc'
  | 'studio'
  | 'publication'
  | 'deliveries'
  | 'service'
  | 'rentals'
  | 'homecontent'
  | 'team';

const DEFAULT_BODY_TYPES = [
  { code: 'HATCHBACK', name: 'Hatchback' },
  { code: 'SEDAN', name: 'Sedan' },
  { code: 'SUV', name: 'SUV' },
  { code: 'MUV', name: 'MUV' },
  { code: 'COUPE', name: 'Coupe' },
  { code: 'CONVERTIBLE', name: 'Convertible' },
];
const bodyTypeLabel = (code: string, options: Array<{ code: string; name: string }>) => options.find(option => option.code === code.toUpperCase())?.name ?? code;

const MARKETPLACE_URL = 'https://www.vmotiv.in/buy';

/** Mirrors the server's listing rules (services/api/src/listing-readiness.ts) so the studio shows what is missing before anyone presses save. */
const MIN_LISTING_PHOTOS = 3;
function computeListingGaps(f: { title: string; photoCount: number; color: string; registrationNumber: string; conditionSummary: string; branchId: string; price: string }): string[] {
  const gaps: string[] = [];
  if (f.title.trim().length < 3) gaps.push('A listing title');
  if (f.price !== 'n/a' && !(Number(f.price) > 0)) gaps.push('A retail price');
  if (f.photoCount < MIN_LISTING_PHOTOS) gaps.push(`At least ${MIN_LISTING_PHOTOS} photos (has ${f.photoCount})`);
  if (!f.color.trim()) gaps.push('The exterior colour');
  if (!f.registrationNumber.trim()) gaps.push('The registration number');
  if (!f.conditionSummary.trim()) gaps.push('A condition summary for customers');
  if (!f.branchId) gaps.push('The branch where the car is kept');
  return gaps;
}

function isVersionConflict(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && /version.?conflict|stale|changed by someone/i.test(err.code);
}

/** Plain-language error for a failed action. A version conflict means a colleague changed the record first, so say so. */
function describeError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (isVersionConflict(err)) return 'Someone else updated this record while you were editing. The latest data has been loaded; please check it and try again.';
    return err.message && err.message !== err.code ? err.message : `${fallback} (${err.code})`;
  }
  return err instanceof Error ? err.message : fallback;
}

type DataGroup = 'dashboard' | 'requests' | 'inspectors' | 'cases' | 'inventory' | 'testDrives' | 'branches';
const ALL_GROUPS: DataGroup[] = ['dashboard', 'requests', 'inspectors', 'cases', 'inventory', 'testDrives', 'branches'];
/** What each screen actually shows, so a background refresh fetches only that instead of all seven lists. */
const TAB_GROUPS: Record<TabKey, DataGroup[]> = {
  overview: ['dashboard', 'requests', 'cases', 'inventory'],
  dispatch: ['requests', 'inspectors'],
  acquisitions: ['cases'],
  documentation: ['cases'],
  handover: ['cases', 'inventory'],
  inventory: ['inventory'],
  refurbishment: ['inventory'],
  qc: ['inventory'],
  studio: ['inventory', 'branches'],
  publication: ['inventory', 'branches'],
  deliveries: ['inventory', 'testDrives'],
  service: ['dashboard'],
  rentals: ['dashboard'],
  homecontent: [],
  team: ['inspectors'],
};

function needsQualityControl(stock: VehicleStockUnit) {
  const hasCompletedWorkOrder = stock.workOrders?.some(workOrder => workOrder.status === 'COMPLETED') ?? false;
  const hasPassedQualityControl = stock.qualityControlReports?.some(report => report.status === 'PASSED') ?? false;
  const canRecoverStaleWorkflow = !['LISTED', 'RESERVED', 'SOLD', 'RETIRED'].includes(stock.status);
  const receivedWithoutRepair = stock.status === 'RECEIVED' && (stock.workOrders?.length ?? 0) === 0;
  return stock.status === 'QC_PENDING' || receivedWithoutRepair || (canRecoverStaleWorkflow && hasCompletedWorkOrder && !hasPassedQualityControl);
}

// ============================================================================
// RESILIENT BROWSER FETCH RECOVERY
// Fixes third-party browser extensions (e.g. 200.js interceptors) that crash on M_ID
// ============================================================================
if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    try {
      return await originalFetch.apply(this, [input, init] as any);
    } catch (err: any) {
      if (
        err instanceof TypeError &&
        (String(err?.message).includes('M_ID') || String(err?.stack).includes('200.js'))
      ) {
        try {
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          document.documentElement.appendChild(iframe);
          const cleanFetch = iframe.contentWindow?.fetch;
          if (cleanFetch) {
            const res = await cleanFetch.apply(window, [input, init] as any);
            setTimeout(() => {
              try { iframe.remove(); } catch { /* ignore */ }
            }, 1000);
            return res;
          }
          iframe.remove();
        } catch {
          // ignore fallback error
        }
      }
      throw err;
    }
  };
}

function formatRupees(paise?: string | number | null): string {
  if (paise === undefined || paise === null) return '—';
  const val = typeof paise === 'string' ? BigInt(paise) : BigInt(Math.round(Number(paise)));
  const rupees = Number(val / 100n);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(rupees);
}

/** An appointment date is a calendar date stored at midnight UTC; show just the date (the time slot is shown separately). */
function formatAppointmentDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// ==========================================
// 2-STEP VERIFICATION (MFA CHALLENGE DIALOG)
// ==========================================
// ==========================================
// AUTH SCREEN (SPLIT PANE CORPORATE THEME)
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
        portalName="Operations"
        eyebrow="Operations and fleet management"
        title="Authorised operations workspace"
        description="Sign in with your authorised V MOTIV corporate Google account to coordinate physical inspections, custody handover, refurbishment, quality control and retail delivery."
        points={[
          { title: 'Dispatch and vehicle custody', text: 'Inspector dispatch, documentation checks and physical handover with a digital custody gate.' },
          { title: 'Workshop and studio certification', text: 'Repair work orders, independent quality control and 360° studio photography.' },
          { title: 'Publication and customer handover', text: 'Verified retail listings, showroom test drives and secure vehicle delivery.' },
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

export const App: FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const activeTabRef = useRef<TabKey>('overview');
  activeTabRef.current = activeTab;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  // Confirmations appear as toasts (a dialog may be open, or the page may have scrolled).
  const setSuccessMsg = (message: string | null) => { if (message) toast.success(message); };
  const reportError = (message: string | null) => { if (message) toast.error('Could not complete this action', { description: message }); };
  // Failed save: explain it, and when a colleague got there first, reload so the screen shows what they changed.
  const failAction = (err: unknown, fallback: string) => {
    reportError(describeError(err, fallback));
    if (isVersionConflict(err)) void loadAllData(user, true).catch(() => undefined);
  };

  // Data states
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [requests, setRequests] = useState<InspectionRequest[]>([]);
  const [inspectors, setInspectors] = useState<InspectorEmployee[]>([]);
  const [cases, setCases] = useState<AcquisitionCase[]>([]);
  const [inventory, setInventory] = useState<VehicleStockUnit[]>([]);
  const [testDrives, setTestDrives] = useState<TestDrive[]>([]);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Seller Documentation Checklist Filters
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [docCaseStatusFilter, setDocCaseStatusFilter] = useState('ALL');
  const [docVerificationFilter, setDocVerificationFilter] = useState('ALL');
  const [docTypeFilter, setDocTypeFilter] = useState('ALL');

  // Modals
  const [assignModal, setAssignModal] = useState<{ open: boolean; request?: InspectionRequest }>({ open: false });
  const [assignInspectorId, setAssignInspectorId] = useState('');
  // Same rule the API enforces: only inspectors assigned to the request's branch can take it.
  const assignableInspectors = inspectors.filter(
    ins => !assignModal.request?.branchId || ins.branches.some(b => b.id === assignModal.request?.branchId),
  );
  const [assignDate, setAssignDate] = useState('');
  const [assignLocationType, setAssignLocationType] = useState<'HUB' | 'HOME'>('HUB');
  const [assignAddress, setAssignAddress] = useState('');

  const [docModal, setDocModal] = useState<{ open: boolean; caseId?: string; docType?: string; docTypes?: string[]; currentStatus?: string }>({ open: false });
  // Documents ticked for a bulk status update, per case
  const [docSelection, setDocSelection] = useState<Record<string, string[]>>({});
  const toggleDocSelected = (caseId: string, docType: string) =>
    setDocSelection(prev => {
      const current = prev[caseId] ?? [];
      return { ...prev, [caseId]: current.includes(docType) ? current.filter(t => t !== docType) : [...current, docType] };
    });
  const [docStatus, setDocStatus] = useState('VERIFIED');
  const [docNotes, setDocNotes] = useState('');

  const [handoverModal, setHandoverModal] = useState<{ open: boolean; caseItem?: AcquisitionCase }>({ open: false });
  const [handoverRegNumber, setHandoverRegNumber] = useState('');
  const [handoverOdometer, setHandoverOdometer] = useState<number>(0);
  const [handoverMainKeys, setHandoverMainKeys] = useState<number>(1);
  const [handoverSpareKeys, setHandoverSpareKeys] = useState<number>(0);
  const [handoverDocsReceived, setHandoverDocsReceived] = useState(true);
  const [handoverBranchId, setHandoverBranchId] = useState('');
  const [handoverLocation, setHandoverLocation] = useState('Bengaluru Central Hub');
  const [handoverCondition, setHandoverCondition] = useState('');

  const [stockInwardModal, setStockInwardModal] = useState<{ open: boolean; caseItem?: AcquisitionCase }>({ open: false });
  const [inwardBranchId, setInwardBranchId] = useState('');
  const [inwardLocation, setInwardLocation] = useState('Bengaluru Central Hub - Bay 4');
  const [inwardNotes, setInwardNotes] = useState('');

  const [workOrderModal, setWorkOrderModal] = useState<{ open: boolean; stockItem?: VehicleStockUnit }>({ open: false });
  const [woCategory, setWoCategory] = useState('MECHANICAL');
  const [woAction, setWoAction] = useState('');
  const [woProvider, setWoProvider] = useState('');
  const [woCost, setWoCost] = useState<string>('500000'); // ₹5,000 in paise

  const [qcModal, setQcModal] = useState<{ open: boolean; stockItem?: VehicleStockUnit }>({ open: false });
  const [qcFindings, setQcFindings] = useState('');
  const [qcDecision, setQcDecision] = useState<'PASS' | 'REWORK_REQUIRED' | 'FAIL'>('PASS');

  const [specsModal, setSpecsModal] = useState<{
    open: boolean;
    stockItem?: VehicleStockUnit;
    registrationNumber: string;
    variant: string;
    bodyType: string;
    color: string;
    odometerKm: number;
  }>({ open: false, registrationNumber: '', variant: '', bodyType: '', color: '', odometerKm: 0 });
  // Body types come from the administrator-managed list; these are used until it loads.
  const [bodyTypeOptions, setBodyTypeOptions] = useState<Array<{ code: string; name: string }>>(DEFAULT_BODY_TYPES);
  useEffect(() => {
    void api.masterData()
      .then(items => {
        const fromMaster = items.filter(item => item.category === 'BODY_TYPE').map(item => ({ code: item.code, name: item.name }));
        if (fromMaster.length) setBodyTypeOptions(fromMaster);
      })
      .catch(() => undefined);
  }, []);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [studioModal, setStudioModal] = useState<{ open: boolean; stockItem?: VehicleStockUnit }>({ open: false });
  const [studioFilter, setStudioFilter] = useState<'ALL' | 'PREPARATION' | 'READY' | 'LISTED'>('ALL');
  const [studioTitle, setStudioTitle] = useState('');
  const [studioColor, setStudioColor] = useState('');
  const [studioSummary, setStudioSummary] = useState('');
  const [studioPhotos, setStudioPhotos] = useState('');
  const [stagedStudioFiles, setStagedStudioFiles] = useState<Array<{ id: string; file: File; previewUrl: string; name: string }>>([]);
  const [studioUploading, setStudioUploading] = useState(false);
  const [studioBranchId, setStudioBranchId] = useState('');
  const [studioRegistration, setStudioRegistration] = useState('');
  const [studioPrice, setStudioPrice] = useState('');

  const [publishModal, setPublishModal] = useState<{ open: boolean; stockItem?: VehicleStockUnit }>({ open: false });
  const [publishRetailPrice, setPublishRetailPrice] = useState<string>('');
  const [publishBranchId, setPublishBranchId] = useState('');

  const closeStudioModal = () => {
    stagedStudioFiles.forEach(s => URL.revokeObjectURL(s.previewUrl));
    setStagedStudioFiles([]);
    setStudioModal({ open: false });
  };

  const openStudioModal = (stockItem: VehicleStockUnit) => {
    stagedStudioFiles.forEach(s => URL.revokeObjectURL(s.previewUrl));
    setStagedStudioFiles([]);
    setStudioTitle(stockItem.vehicle?.listing?.title || `${stockItem.manufacturingYear} ${stockItem.make} ${stockItem.model} ${stockItem.variant || ''}`.trim());
    setStudioColor(stockItem.vehicle?.color || '');
    setStudioSummary(stockItem.vehicle?.conditionSummary || '');
    setStudioBranchId(stockItem.branchId || stockItem.branch?.id || (branches[0]?.id ?? ''));
    setStudioPhotos((stockItem.vehicle?.listing?.media || []).map(m => m.url).join('\n'));
    setStudioRegistration(stockItem.registrationNumber || '');
    setStudioPrice(stockItem.vehicle?.listing?.pricePaise ? String(Number(BigInt(stockItem.vehicle.listing.pricePaise) / 100n)) : '');
    setStudioModal({ open: true, stockItem });
  };

  const openPublishModal = (stockItem: VehicleStockUnit) => {
    setPublishRetailPrice(
      stockItem.vehicle?.listing?.pricePaise
        ? String(Number(BigInt(stockItem.vehicle.listing.pricePaise) / 100n))
        : ''
    );
    setPublishBranchId(stockItem.branchId || stockItem.branch?.id || (branches[0]?.id ?? ''));
    setPublishModal({ open: true, stockItem });
  };

  // Edit & resubmit cost after rejection
  const [editCostModal, setEditCostModal] = useState<{ open: boolean; wo?: RefurbishmentWorkOrder }>({ open: false });
  const [editCostValue, setEditCostValue] = useState<string>('');

  const [deliveryModal, setDeliveryModal] = useState<{ open: boolean; stockItem?: VehicleStockUnit }>({ open: false });
  const [viewBuyerModal, setViewBuyerModal] = useState<{ open: boolean; stockItem?: VehicleStockUnit }>({ open: false });
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Auth observer
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, u => {
      setUser(u);
      if (u) void loadAllData(u);
    });
  }, []);

  // silent = background refresh: no spinner, keeps what is on screen, and throws on failure so the refresher can back off.
  const loadAllData = async (u = user, silent = false) => {
    if (!u) return;
    if (!silent) {
      setLoading(true);
      setError(null);
      setLoadWarning(null);
    }
    try {
      const unavailable: string[] = [];
      const load = async <T,>(label: string, request: Promise<T>, fallback: T): Promise<T> => {
        try {
          return await request;
        } catch (loadError) {
          if (silent) throw loadError;
          unavailable.push(label);
          return fallback;
        }
      };
      // A first or manual load fetches everything; a background refresh only what the open tab shows.
      const groups = new Set<DataGroup>(silent ? TAB_GROUPS[activeTabRef.current] : ALL_GROUPS);
      const want = <T,>(group: DataGroup, label: string, request: () => Promise<T>, apply: (value: T) => void, fallback: T) =>
        groups.has(group) ? load(label, request(), fallback).then(apply) : Promise.resolve();
      await Promise.all([
        want('dashboard', 'dashboard', () => api.dashboard(u), setMetrics, null),
        want('requests', 'inspection dispatch', () => api.inspectionRequests(u), setRequests, []),
        want('inspectors', 'inspector availability', () => api.inspectors(u), setInspectors, []),
        want('cases', 'acquisitions', () => api.acquisitions(u), setCases, []),
        want('inventory', 'inventory', () => api.inventory(u), setInventory, []),
        want('testDrives', 'test drives', () => api.testDrives(u), td => setTestDrives(Array.isArray(td) ? td : td?.items || []), { items: [] }),
        want('branches', 'branches', () => api.branches(u), br => setBranches(br || []), []),
      ]);
      if (unavailable.length) setLoadWarning(`Some live data could not be loaded: ${unavailable.join(', ')}. Retry after checking the API connection.`);
    } catch (err) {
      if (silent) throw err;
      setError(err instanceof Error ? err.message : 'Failed to load operations data');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Keep the dispatch board, acquisitions and inventory current without a manual refresh.
  useAutoRefresh(() => loadAllData(user, true), { enabled: Boolean(user) && !loading, intervalMs: 30_000, pauseWhen: () => modalIsOpen(), pulse: user ? { domains: ['dispatch'], live: true, fetchTokens: (domains, fresh) => api.pulse(user, domains, fresh) } : undefined });
  // Floating "New activity" bar for everything customers do that lands in this portal, whichever tab is open.
  useChangeWatcher(['dispatch', 'rentals', 'service'], (domains, fresh) => api.pulse(user as User, domains, fresh), { enabled: Boolean(user) });
  useEffect(() => registerViewHandler(domain => { if (domain === 'dispatch' || domain === 'rentals' || domain === 'service') setActiveTab(domain); }), []);

  // Opening a tab brings its data up to date (background refreshes only fetch the tab that is open).
  const lastRefreshedTab = useRef<TabKey>('overview');
  useEffect(() => {
    if (!user || lastRefreshedTab.current === activeTab) return;
    lastRefreshedTab.current = activeTab;
    void loadAllData(user, true).catch(() => undefined);
  }, [activeTab, user]);

  // --- Handlers ---
  const handleAssignSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !assignModal.request || !assignInspectorId) return;
    setLoading(true);
    setError(null);
    try {
      const scheduledAt = assignDate ? new Date(assignDate).toISOString() : undefined;
      if (assignModal.request.assignment) {
        if (!scheduledAt) {
          reportError('A date and time are required to reschedule an inspection.');
          return;
        }
        await api.rescheduleInspection(user, assignModal.request.id, {
          scheduledAt,
          locationType: assignLocationType,
          address: assignAddress || undefined,
          reason: assignModal.request.status === 'CANCELLED'
            ? 'Appointment reopened and rescheduled through Operations Dispatch'
            : 'Appointment rescheduled through Operations Dispatch',
        });
        setSuccessMsg(assignModal.request.status === 'CANCELLED'
          ? 'Cancelled inspection reopened and rescheduled'
          : 'Inspection rescheduled successfully');
      } else {
        await api.assignInspection(user, assignModal.request.id, {
          inspectorId: assignInspectorId,
          scheduledAt,
          locationType: assignLocationType,
          address: assignAddress || undefined,
        });
        setSuccessMsg('Inspection assigned successfully');
      }
      setAssignModal({ open: false });
      void loadAllData(user, true).catch(() => undefined);
    } catch (err) {
      failAction(err, 'Assignment failed');
    } finally {
      setLoading(false);
    }
  };

  // One click, no dialog: mark documents VERIFIED straight from REQUESTED / RECEIVED / UNDER_REVIEW.
  const verifyDocumentsNow = async (caseId: string, types: string[]) => {
    if (!user || types.length === 0) return;
    setLoading(true);
    try {
      const failed: string[] = [];
      // In turn, not together: each update re-works the case's overall document status.
      for (const documentType of types) {
        try {
          await api.updateDocument(user, caseId, { documentType, status: 'VERIFIED' });
        } catch (err) {
          failed.push(documentType.replace(/_/g, ' ') + (err instanceof ApiError ? ` (${err.code})` : ''));
        }
      }
      if (failed.length) reportError(`Verified ${types.length - failed.length} of ${types.length}. Not verified: ${failed.join(', ')}`);
      else setSuccessMsg(types.length === 1 ? 'Document verified' : `${types.length} documents verified`);
      setDocSelection(prev => ({ ...prev, [caseId]: failed.length ? prev[caseId] ?? [] : [] }));
      void loadAllData(user, true).catch(() => undefined);
    } finally {
      setLoading(false);
    }
  };

  const handleDocUpdate = async (e: FormEvent) => {
    e.preventDefault();
    const types = docModal.docTypes ?? (docModal.docType ? [docModal.docType] : []);
    const caseId = docModal.caseId;
    if (!user || !caseId || types.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      // One document at a time, so a failure names exactly which ones were not updated.
      const failedTypes: string[] = [];
      const failedLabels: string[] = [];
      for (const documentType of types) {
        try {
          await api.updateDocument(user, caseId, { documentType, status: docStatus, notes: docNotes || undefined });
        } catch (err) {
          failedTypes.push(documentType);
          failedLabels.push(documentType.replace(/_/g, ' ') + (err instanceof ApiError ? ' (' + err.code + ')' : ''));
        }
      }
      if (failedTypes.length > 0) reportError('Updated ' + (types.length - failedTypes.length) + ' of ' + types.length + '. Not updated: ' + failedLabels.join(', '));
      else setSuccessMsg(types.length === 1 ? `Document ${types[0]} updated to ${docStatus}` : `${types.length} documents updated to ${docStatus}`);
      setDocSelection(prev => ({ ...prev, [caseId]: failedTypes }));
      setDocModal({ open: false });
      void loadAllData(user, true).catch(() => undefined);
    } catch (err) {
      failAction(err, 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const handleHandoverSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !handoverModal.caseItem) return;
    setLoading(true);
    setError(null);
    try {
      await api.recordHandover(user, handoverModal.caseItem.id, {
        branchId: handoverBranchId || undefined,
        status: 'RECEIVED',
        location: handoverLocation,
        observedAt: new Date().toISOString(),
        registrationNumber: handoverRegNumber.trim().toUpperCase() || undefined,
        odometerKm: Number(handoverOdometer) || 0,
        mainKeysReceived: Number(handoverMainKeys) || 1,
        spareKeysReceived: Number(handoverSpareKeys) || 0,
        documentsReceived: handoverDocsReceived,
        conditionNotes: handoverCondition || undefined,
        expectedVersion: handoverModal.caseItem.handover?.version,
      });
      setSuccessMsg('Custody recorded. The acquisition was completed and moved into Stock Inventory for QC.');
      setHandoverModal({ open: false });
      void loadAllData(user, true).catch(() => undefined);
      setActiveTab('inventory');
    } catch (err) {
      failAction(err, 'Handover failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteAcquisition = async (caseItem: AcquisitionCase) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      await api.completeAcquisition(user, caseItem.id, {
        expectedVersion: caseItem.version,
        completionNotes: 'All document, settlement and custody gates verified.',
      });
      setSuccessMsg(`Acquisition case ${caseItem.caseReference} completed! Ready for Stock Inward.`);
      void loadAllData(user, true).catch(() => undefined);
    } catch (err) {
      failAction(err, 'Acquisition completion failed');
    } finally {
      setLoading(false);
    }
  };

  const handleStockInwardSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !stockInwardModal.caseItem) return;
    setLoading(true);
    setError(null);
    try {
      const stock = await api.stockInward(user, stockInwardModal.caseItem.id, {
        branchId: inwardBranchId,
        physicalLocation: inwardLocation,
        notes: inwardNotes || undefined,
      });
      setSuccessMsg(`Stock Inward Created! Stock Code: ${stock.stockCode}`);
      setStockInwardModal({ open: false });
      void loadAllData(user, true).catch(() => undefined);
      setActiveTab('inventory');
    } catch (err) {
      failAction(err, 'Stock inward failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSpecs = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !specsModal.stockItem) return;
    setLoading(true);
    setError(null);
    try {
      await api.updateStockVehicleSpecs(user, specsModal.stockItem.id, {
        registrationNumber: specsModal.registrationNumber.trim().toUpperCase() || undefined,
        variant: specsModal.variant.trim() || undefined,
        bodyType: specsModal.bodyType,
        color: specsModal.color.trim() || undefined,
        odometerKm: specsModal.odometerKm || undefined,
      });
      setSuccessMsg('Vehicle specs & registration plate updated');
      setSpecsModal({ open: false, registrationNumber: '', variant: '', bodyType: '', color: '', odometerKm: 0 });
      void loadAllData(user, true).catch(() => undefined);
    } catch (err) {
      failAction(err, 'Failed to update vehicle specs');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorkOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !workOrderModal.stockItem) return;
    setLoading(true);
    setError(null);
    try {
      await api.createWorkOrder(user, workOrderModal.stockItem.id, {
        category: woCategory,
        requiredAction: woAction,
        assignedProvider: woProvider || undefined,
        estimatedCostPaise: Number(woCost) || 0,
      });
      setSuccessMsg('Refurbishment work order created');
      setWorkOrderModal({ open: false });
      setWoAction('');
      void loadAllData(user, true).catch(() => undefined);
    } catch (err) {
      failAction(err, 'Failed to create work order');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitCostApproval = async (woId: string, currentVersion: number, cost: number) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      await api.submitWorkOrderCost(user, woId, {
        expectedVersion: currentVersion,
        estimatedCostPaise: cost,
        reason: 'Authorized workshop cost estimation submitted for approval',
      });
      setSuccessMsg('Cost submitted for independent approver decision');
      void loadAllData(user, true).catch(() => undefined);
    } catch (err) {
      failAction(err, 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDecideCost = async (woId: string, approvalVersion: number, decision: 'APPROVE' | 'REJECT') => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      await api.decideWorkOrderCost(user, woId, {
        expectedVersion: approvalVersion,
        decision,
        reason: decision === 'APPROVE' ? 'Approved within budget policy' : 'Rejected - quote exceeds threshold',
      });
      setSuccessMsg(`Cost approval ${decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'}`);
      void loadAllData(user, true).catch(() => undefined);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'COST_SELF_APPROVAL_DENIED') {
        reportError('Cost Decision Error: Self-approval is not permitted under the four-eyes segregation policy. A different employee with Pricing Approver, Admin, or Super Admin role must approve this estimate.');
      } else {
        failAction(err, 'Decision failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStartWorkOrder = async (woId: string, version: number) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      await api.startWorkOrder(user, woId, version);
      setSuccessMsg('Work order started. Stock status moved to IN_REFURBISHMENT.');
      void loadAllData(user, true).catch(() => undefined);
    } catch (err) {
      failAction(err, 'Failed to start work order');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteWorkOrder = async (woId: string, version: number, actualPaise?: number) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      await api.completeWorkOrder(user, woId, {
        expectedVersion: version,
        actualCostPaise: actualPaise,
        notes: 'Refurbishment completed and ready for independent QC inspection.',
      });
      setSuccessMsg('Work order completed! Stock moved to QC_PENDING.');
      void loadAllData(user, true).catch(() => undefined);
    } catch (err) {
      failAction(err, 'Failed to complete work order');
    } finally {
      setLoading(false);
    }
  };

  /** Open the edit & resubmit modal for a cost-rejected work order */
  const openEditCostModal = (wo: RefurbishmentWorkOrder) => {
    setEditCostValue(String(Math.round(Number(wo.estimatedCostPaise || 0) / 100)));
    setEditCostModal({ open: true, wo });
  };

  /** Submit an updated cost estimate for a previously-rejected work order */
  const handleEditAndResubmitCost = async (e: FormEvent) => {
    e.preventDefault();
    const wo = editCostModal.wo;
    if (!user || !wo) return;
    const costPaise = Math.round(parseFloat(editCostValue) * 100);
    if (isNaN(costPaise) || costPaise <= 0) {
      reportError('Please enter a valid cost amount in rupees.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.submitWorkOrderCost(user, wo.id, {
        expectedVersion: wo.version,
        estimatedCostPaise: costPaise,
        reason: 'Revised cost estimate submitted for re-approval after previous rejection',
      });
      setSuccessMsg('Revised cost resubmitted for approval');
      setEditCostModal({ open: false });
      void loadAllData(user, true).catch(() => undefined);
    } catch (err) {
      failAction(err, 'Failed to resubmit cost');
    } finally {
      setLoading(false);
    }
  };

  const handleQcSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !qcModal.stockItem) return;
    setLoading(true);
    setError(null);
    try {
      const qcReport = (await api.startQualityControl(user, qcModal.stockItem.id, {
        workOrderId: qcModal.stockItem.workOrders?.find(workOrder => workOrder.status === 'COMPLETED')?.id,
        findings: qcFindings,
      })) as { id: string; version: number };

      await api.decideQualityControl(user, qcReport.id, {
        expectedVersion: qcReport.version,
        decision: qcDecision,
        findings: qcFindings,
      });

      setSuccessMsg(`Quality Control verdict: ${qcDecision}. Stock status updated.`);
      setQcModal({ open: false });
      setQcFindings('');
      void loadAllData(user, true).catch(() => undefined);
    } catch (err) {
      failAction(err, 'Quality control submission failed');
    } finally {
      setLoading(false);
    }
  };

  const handleStudioSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !studioModal.stockItem) return;
    setLoading(true);
    setError(null);
    try {
      const existingUrls = studioPhotos
        .split('\n')
        .map(u => u.trim())
        .filter(u => u.length > 5);

      const newlyUploadedUrls: string[] = [];
      if (stagedStudioFiles.length > 0) {
        setStudioUploading(true);
        for (const staged of stagedStudioFiles) {
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error(`Could not read ${staged.name}.`));
            reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
            reader.readAsDataURL(staged.file);
          });
          const result = await api.uploadListingPhoto(user, {
            base64Data,
            mimeType: staged.file.type,
            filename: staged.file.name.replace(/\.[^.]+$/, ''),
            folder: `vmotiv/listings/${studioModal.stockItem.stockCode}`,
          });
          const url = result.secureUrl || result.url;
          if (!url) throw new Error(`Cloud upload did not return a URL for ${staged.name}.`);
          newlyUploadedUrls.push(url);
        }
      }

      const allUrls = [...existingUrls, ...newlyUploadedUrls];

      const live = studioModal.stockItem.status === 'LISTED';
      if (live) {
        // A live car is edited in place: it stays published, and customers see the change straight away.
        const rupees = Number(studioPrice);
        await api.updateListing(user, studioModal.stockItem.id, {
          title: studioTitle.trim() || undefined,
          color: studioColor.trim() || undefined,
          conditionSummary: studioSummary.trim() || undefined,
          registrationNumber: studioRegistration.trim() || undefined,
          retailPricePaise: Number.isFinite(rupees) && rupees > 0 ? String(BigInt(Math.round(rupees)) * 100n) : undefined,
          mediaUrls: allUrls,
        });
      } else {
        // The registration number goes in the same request as the rest. Saving it separately first changed the record's version, so the
        // main save below then failed with "someone else updated this record" against its own earlier save.
        await api.prepareListing(user, studioModal.stockItem.id, {
          title: studioTitle,
          color: studioColor || undefined,
          conditionSummary: studioSummary || undefined,
          mediaUrls: allUrls.length ? allUrls : undefined,
          branchId: studioBranchId || undefined,
          registrationNumber: studioRegistration.trim() || undefined,
          expectedVersion: studioModal.stockItem.version,
        });
      }

      // Cleanup object URLs and staged files
      stagedStudioFiles.forEach(s => URL.revokeObjectURL(s.previewUrl));
      setStagedStudioFiles([]);
      setStudioPhotos(allUrls.join('\n'));

      setSuccessMsg(live ? 'Live listing updated. Customers see the change now.' : 'Listing studio data saved. Status moved to LISTING_READY.');
      setStudioModal({ open: false });
      void loadAllData(user, true).catch(() => undefined);
      if (!live) setActiveTab('publication');
    } catch (err) {
      failAction(err, 'Failed to save listing studio details');
    } finally {
      setLoading(false);
      setStudioUploading(false);
    }
  };

  const handleStudioPhotoSelect = (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    try {
      const newStaged: Array<{ id: string; file: File; previewUrl: string; name: string }> = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          throw new Error('Only image files (JPEG, PNG, WebP) can be added to a retail listing.');
        }
        if (file.size > 12 * 1024 * 1024) {
          throw new Error(`${file.name} is larger than the 12 MB upload limit.`);
        }
        newStaged.push({
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          name: file.name,
        });
      }
      setStagedStudioFiles(current => [...current, ...newStaged]);
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'Could not stage listing photo.');
    }
  };

  const removeStagedStudioPhoto = (id: string) => {
    setStagedStudioFiles(curr => {
      const target = curr.find(p => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return curr.filter(p => p.id !== id);
    });
  };

  const handlePublishSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !publishModal.stockItem) return;
    const price = BigInt(publishRetailPrice || '0') * 100n;
    if (price <= 0n) {
      reportError('Please enter a valid retail price in Rupees.');
      return;
    }
    if (!publishBranchId) {
      reportError('Please select a showroom / branch to list this vehicle.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.publishListing(user, publishModal.stockItem.id, {
        retailPricePaise: price.toString(),
        branchId: publishBranchId,
        expectedVersion: publishModal.stockItem.version,
      });
      setSuccessMsg(`Vehicle published to customer marketplace! Stock code: ${publishModal.stockItem.stockCode}`);
      setPublishModal({ open: false });
      void loadAllData(user, true).catch(() => undefined);
      setActiveTab('inventory');
    } catch (err) {
      failAction(err, 'Publication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDeliverySubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !deliveryModal.stockItem) return;
    setLoading(true);
    setError(null);
    try {
      await api.deliverVehicle(user, deliveryModal.stockItem.id, {
        buyerName,
        buyerPhone,
        deliveryNotes: deliveryNotes || undefined,
        expectedVersion: deliveryModal.stockItem.version,
      });
      setSuccessMsg(`Vehicle delivered to ${buyerName}! Status updated to SOLD.`);
      setDeliveryModal({ open: false });
      void loadAllData(user, true).catch(() => undefined);
    } catch (err) {
      failAction(err, 'Delivery failed');
    } finally {
      setLoading(false);
    }
  };

  // --- Filtering ---
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.lead.referenceCode.toLowerCase().includes(q) ||
        r.lead.sellerName.toLowerCase().includes(q) ||
        r.lead.make.toLowerCase().includes(q) ||
        r.lead.model.toLowerCase().includes(q) ||
        r.lead.city.toLowerCase().includes(q)
      );
    });
  }, [requests, statusFilter, searchQuery]);

  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.caseReference.toLowerCase().includes(q) ||
        c.lead.referenceCode.toLowerCase().includes(q) ||
        c.lead.sellerName.toLowerCase().includes(q) ||
        c.lead.make.toLowerCase().includes(q) ||
        c.lead.model.toLowerCase().includes(q) ||
        (c.lead.registrationNumber && c.lead.registrationNumber.toLowerCase().includes(q))
      );
    });
  }, [cases, statusFilter, searchQuery]);

  const filteredInventory = useMemo(() => {
    return inventory.filter(s => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        s.stockCode.toLowerCase().includes(q) ||
        s.make.toLowerCase().includes(q) ||
        s.model.toLowerCase().includes(q) ||
        s.physicalLocation.toLowerCase().includes(q) ||
        (s.registrationNumber && s.registrationNumber.toLowerCase().includes(q))
      );
    });
  }, [inventory, statusFilter, searchQuery]);

  // Auth screen
  if (!firebaseConfigured) {
    return (
      <CenterState eyebrow="Configuration required" title="Environment missing">
        <p>Please configure the VITE_FIREBASE_* and VITE_API_BASE environment variables.</p>
      </CenterState>
    );
  }

  if (!user) {
    return <SignIn />;
  }

  const TAB_LABELS: Record<TabKey, string> = {
    overview: 'Executive Overview',
    dispatch: 'Inspection Dispatch',
    acquisitions: 'Acquisitions & Valuation',
    documentation: 'Seller Documentation',
    handover: 'Custody Handover',
    inventory: 'Stock Inventory',
    refurbishment: 'Workshop Repairs',
    qc: 'Quality Control',
    studio: 'Listing Studio & Photography',
    publication: 'Retail Publication',
    deliveries: 'Test Drives & Buyer Delivery',
    service: 'Car Service & Workshop Operations',
    rentals: 'Rental Fleet & Trips',
    homecontent: 'App Home Content',
    team: 'Operations Team & Tasks',
  };

  const selectTab = (key: TabKey) => {
    setActiveTab(key);
    if (['dispatch', 'acquisitions', 'documentation', 'handover', 'inventory'].includes(key)) setStatusFilter('ALL');
  };
  const navSections: NavSection<TabKey>[] = [
    {
      title: 'Fleet and dispatch',
      items: [
        { key: 'overview', label: 'Overview', icon: <IconDashboard /> },
        { key: 'dispatch', label: 'Inspection dispatch', icon: <IconDispatch />, badge: metrics?.unassigned },
      ],
    },
    {
      title: 'Post-inspection and custody',
      items: [
        { key: 'acquisitions', label: 'Acquisitions and valuation', icon: <IconAcquisitions />, badge: metrics?.acquisitions?.documentationRequired },
        { key: 'documentation', label: 'Seller documentation', icon: <IconDocuments /> },
        { key: 'handover', label: 'Custody handover', icon: <IconHandover />, badge: metrics?.acquisitions?.handoverReady || metrics?.acquisitions?.settlementReady },
      ],
    },
    {
      title: 'Vehicle preparation',
      items: [
        { key: 'inventory', label: 'Stock inventory', icon: <IconInventory />, badge: inventory.length },
        { key: 'refurbishment', label: 'Workshop repairs', icon: <IconRefurbishment />, badge: metrics?.refurbishment?.pendingCostApprovals },
        { key: 'qc', label: 'Quality control', icon: <IconQC />, badge: metrics?.stock?.qcPending },
      ],
    },
    {
      title: 'Marketplace and delivery',
      items: [
        { key: 'studio', label: 'Listing studio', icon: <IconStudio />, badge: metrics?.stock?.listingPreparation },
        { key: 'publication', label: 'Retail publication', icon: <IconPublish />, badge: metrics?.stock?.listingReady },
        { key: 'deliveries', label: 'Test drives and delivery', icon: <IconDelivery />, badge: testDrives.length },
        { key: 'service', label: 'Car service and hubs', icon: <IconService /> },
        { key: 'rentals', label: 'Rental fleet and trips', icon: <IconRentals /> },
        { key: 'homecontent', label: 'App home content', icon: <IconPublish /> },
        { key: 'team', label: 'Operations team', icon: <IconLock /> },
      ],
    },
  ];

  return (
    <AppShell
      portalName="Operations"
      sections={navSections}
      active={activeTab}
      onSelect={selectTab}
      account={{ name: user.displayName || user.email || 'Operations', role: 'Operations and fleet manager' }}
      onSignOut={() => void signOut(auth!)}
      context="V MOTIV Operations"
      title={TAB_LABELS[activeTab] || 'Workspace'}
      toolbar={
        <>
          <StaffNotificationBell
            title="Operations notifications"
            source={operationsNotifications(user)}
            onOpenItem={item => {
              const next = tabFromDeepLink(item.deepLink);
              if (next && next in TAB_GROUPS) setActiveTab(next as TabKey);
            }}
          />
          <span className="hidden text-sm text-base-content/65 md:inline">{user.email}</span>
          <span className="badge badge-soft badge-success hidden font-medium sm:inline-flex">MFA verified</span>
        </>
      }
    >
        {/* Alerts */}
        {error ? <Alert tone="error" className="mb-4" onDismiss={() => setError(null)}>{error}</Alert> : null}

        {loadWarning ? (
          <Alert tone="warning" className="mb-4" onDismiss={() => setLoadWarning(null)}>
            <span>{loadWarning}</span>{' '}
            <Button size="xs" variant="secondary" loading={loading} onClick={() => void loadAllData()}>Retry</Button>
          </Alert>
        ) : null}

        {/* ======================================================== */}
        {/* VIEW 1: OVERVIEW / DASHBOARD                             */}
        {/* ======================================================== */}
        {activeTab === 'overview' ? (
          <div>
            <div className="action-bar">
              <div className="section-heading">
                <h2>Operations Command Center</h2>
                <p>Real-time lifecycle coordination across inspections, acquisitions, custody, refurbishment and retail publishing.</p>
              </div>
              <button className="btn-secondary" onClick={() => void loadAllData()} disabled={loading}>
                <IconRefresh /> {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {/* Inspection Metrics */}
            <h3 style={{ fontSize: '0.9rem', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '0.75rem', fontWeight: 700 }}>
              Physical Inspection Pipeline
            </h3>
            <div className="metrics-grid">
              <article className="metric-card accent-gold">
                <span className="metric-title">Unassigned</span>
                <span className="metric-value">{metrics?.unassigned ?? '0'}</span>
                <span className="metric-subtitle">Requires inspector assignment</span>
              </article>
              <article className="metric-card accent-blue">
                <span className="metric-title">Scheduled</span>
                <span className="metric-value">{metrics?.scheduled ?? '0'}</span>
                <span className="metric-subtitle">Confirmed date & time slot</span>
              </article>
              <article className="metric-card accent-purple">
                <span className="metric-title">In Progress</span>
                <span className="metric-value">{metrics?.inProgress ?? '0'}</span>
                <span className="metric-subtitle">Active evaluations in field</span>
              </article>
              <article className="metric-card accent-green">
                <span className="metric-title">Completed</span>
                <span className="metric-value">{metrics?.completed ?? '0'}</span>
                <span className="metric-subtitle">Submitted for review / approved</span>
              </article>
            </div>

            {/* Acquisition & Inventory Pipeline */}
            <h3 style={{ fontSize: '0.9rem', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '0.75rem', fontWeight: 700 }}>
              Post-Inspection Operations & Inventory Funnel
            </h3>
            <div className="metrics-grid">
              <article className="metric-card accent-gold">
                <span className="metric-title">Docs Pending</span>
                <span className="metric-value">{metrics?.acquisitions?.documentationRequired ?? '0'}</span>
                <span className="metric-subtitle">Pre-acquisition verification</span>
              </article>
              <article className="metric-card accent-blue">
                <span className="metric-title">Settlement Ready</span>
                <span className="metric-value">{metrics?.acquisitions?.settlementReady ?? '0'}</span>
                <span className="metric-subtitle">Awaiting Finance payment</span>
              </article>
              <article className="metric-card accent-purple">
                <span className="metric-title">In Refurbishment</span>
                <span className="metric-value">{(metrics?.stock?.refurbishmentPending || 0) + (metrics?.stock?.inRefurbishment || 0)}</span>
                <span className="metric-subtitle">{metrics?.refurbishment?.pendingCostApprovals || 0} cost approvals pending</span>
              </article>
              <article className="metric-card accent-gold">
                <span className="metric-title">QC & Listing Prep</span>
                <span className="metric-value">{(metrics?.stock?.qcPending || 0) + (metrics?.stock?.listingPreparation || 0)}</span>
                <span className="metric-subtitle">QC checks & photography</span>
              </article>
              <article className="metric-card accent-green">
                <span className="metric-title">Marketplace Listed</span>
                <span className="metric-value">{metrics?.stock?.listed ?? '0'}</span>
                <span className="metric-subtitle">Published on customer web & app</span>
              </article>
              <article className="metric-card accent-green">
                <span className="metric-title">Delivered (Sold)</span>
                <span className="metric-value">{metrics?.stock?.sold ?? '0'}</span>
                <span className="metric-subtitle">Delivered to verified buyers</span>
              </article>
            </div>

            {/* Urgent exceptions and recent activity */}
            <div className="detail-grid">
              <div className="detail-card">
                <div className="card-header">
                  <div>
                    <h4 className="card-title">Urgent Action Items</h4>
                    <p className="card-subtitle">Immediate bottlenecks requiring operational action</p>
                  </div>
                </div>
                <div className="card-body">
                  {metrics?.unassigned ? (
                    <div className="checklist-item" style={{ borderLeft: '3px solid var(--warning)' }}>
                      <div className="checklist-info">
                        <span className="checklist-title">{metrics.unassigned} Inspection Requests Unassigned</span>
                        <span className="checklist-meta">Assign qualified inspectors to maintain SLA</span>
                      </div>
                      <button className="btn-secondary" onClick={() => setActiveTab('dispatch')}>Assign</button>
                    </div>
                  ) : null}

                  {metrics?.refurbishment?.pendingCostApprovals ? (
                    <div className="checklist-item" style={{ borderLeft: '3px solid var(--yellow)' }}>
                      <div className="checklist-info">
                        <span className="checklist-title">{metrics.refurbishment.pendingCostApprovals} Cost Approvals Pending</span>
                        <span className="checklist-meta">Workshop repair estimates awaiting independent decision</span>
                      </div>
                      <button className="btn-secondary" onClick={() => setActiveTab('refurbishment')}>Review</button>
                    </div>
                  ) : null}

                  {metrics?.stock?.qcPending ? (
                    <div className="checklist-item" style={{ borderLeft: '3px solid var(--primary)' }}>
                      <div className="checklist-info">
                        <span className="checklist-title">{metrics.stock.qcPending} Vehicles Awaiting Independent QC</span>
                        <span className="checklist-meta">Completed workshop repairs ready for sign-off</span>
                      </div>
                      <button className="btn-secondary" onClick={() => setActiveTab('qc')}>Inspect</button>
                    </div>
                  ) : null}

                  {metrics?.stock?.listingReady ? (
                    <div className="checklist-item" style={{ borderLeft: '3px solid var(--success)' }}>
                      <div className="checklist-info">
                        <span className="checklist-title">{metrics.stock.listingReady} Vehicles Ready for Retail Publication</span>
                        <span className="checklist-meta">Commercial readiness gates cleared</span>
                      </div>
                      <button className="btn-gold" onClick={() => setActiveTab('publication')}>Publish</button>
                    </div>
                  ) : null}

                  {!metrics?.unassigned && !metrics?.refurbishment?.pendingCostApprovals && !metrics?.stock?.qcPending ? (
                    <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No urgent operational bottlenecks at this moment.</p>
                  ) : null}
                </div>
              </div>

              {/* Audit Timeline */}
              <div className="detail-card">
                <div className="card-header">
                  <div>
                    <h4 className="card-title">Recent Operational Activity</h4>
                    <p className="card-subtitle">Verified audit trail of completed operations events</p>
                  </div>
                </div>
                <div className="card-body">
                  <div className="timeline-list">
                    {(metrics?.recentEvents || []).slice(0, 6).map(evt => (
                      <div className="timeline-item" key={evt.id}>
                        <div className="timeline-dot" />
                        <div className="timeline-content">
                          <strong>{evt.action.replace(/_/g, ' ')}</strong>
                          <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                            {evt.actor?.displayName || evt.actor?.email || 'System'} · {evt.entityType} ({evt.entityId.slice(0, 8)}...)
                          </div>
                        </div>
                        <span className="timeline-time">{new Date(evt.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    ))}
                    {!metrics?.recentEvents?.length ? (
                      <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No recent audit events recorded.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ======================================================== */}
        {/* VIEW 2: INSPECTION DISPATCH                              */}
        {/* ======================================================== */}
        {activeTab === 'dispatch' ? (
          <div>
            <div className="action-bar">
              <div className="section-heading">
                <h2>Inspection Dispatch & Scheduling</h2>
                <p>Assign field inspectors, manage scheduling windows, and handle conflict rescheduling.</p>
              </div>
              <div className="filter-group">
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search by code, seller, car..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <select className="select-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="ALL">All Statuses</option>
                  <option value="REQUESTED">Unassigned (REQUESTED)</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                </select>
                <button className="btn-secondary" onClick={() => void loadAllData()} disabled={loading}>
                  <IconRefresh />
                </button>
              </div>
            </div>

            <div className="card-table">
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Reference & Seller</th>
                      <th>Vehicle & Reg</th>
                      <th>Customer Appointment</th>
                      <th>Status</th>
                      <th>Inspector Assignment</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequests.map(r => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.lead.referenceCode}</strong>
                          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{r.lead.sellerName} · {r.lead.sellerPhone || 'No phone'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>City: {r.lead.city}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <strong>{r.lead.make} {r.lead.model}{r.lead.variant ? ` ${r.lead.variant}` : ''}</strong>
                            {r.lead.registrationNumber ? (
                              <span style={{ padding: '1px 6px', background: 'color-mix(in oklab, var(--color-base-content) 8%, transparent)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.5px' }}>
                                {r.lead.registrationNumber}
                              </span>
                            ) : null}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '2px' }}>
                            {[r.lead.manufacturingYear, r.lead.fuelType, r.lead.transmission, r.lead.color, r.lead.odometerKm ? `${r.lead.odometerKm.toLocaleString()} km` : null].filter(Boolean).join(' · ')}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: (r.requestedDate || r.lead.inspectionDate) ? 'var(--gold)' : 'var(--muted)' }}>
                              {(r.requestedDate || r.lead.inspectionDate) ? formatDate(r.requestedDate || r.lead.inspectionDate) : 'Schedule Pending'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text)' }}>
                              Slot: <strong>{r.timeSlot || r.lead.inspectionTimeSlot || 'Flexible'}</strong> · {r.locationType === 'HOME' || r.lead.inspectionLocationType === 'HOME' ? 'Doorstep' : 'Hub'}
                            </div>
                            {(r.address || r.lead.inspectionAddress) ? (
                              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.address || r.lead.inspectionAddress || undefined}>
                                📍 {r.address || r.lead.inspectionAddress}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${r.status === 'COMPLETED' ? 'badge-success' : r.status === 'SCHEDULED' ? 'badge-info' : r.status === 'IN_PROGRESS' ? 'badge-purple' : 'badge-warning'}`}>
                            {r.status}
                          </span>
                        </td>
                        <td>
                          {r.assignment ? (
                            <div>
                              <strong>{r.assignment.inspector?.user.displayName || r.assignment.inspector?.user.email}</strong>
                              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                                <IconClock style={{ verticalAlign: 'middle', marginRight: '3px' }} />
                                {formatDate(r.assignment.scheduledAt)} ({r.assignment.locationType})
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--warning)', fontSize: '0.8rem', fontWeight: 600 }}>Unassigned</span>
                          )}
                        </td>
                        <td>
                          {r.status === 'REQUESTED' || !r.assignment ? (
                            <button
                              className="btn-gold"
                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                              onClick={() => {
                                const targetDateStr = r.requestedDate || r.lead.inspectionDate;
                                const targetSlot = r.timeSlot || r.lead.inspectionTimeSlot;
                                let resolvedAssignDate = '';
                                if (targetDateStr) {
                                  const dateOnly = targetDateStr.slice(0, 10);
                                  const startHour = targetSlot ? (targetSlot.split('-')[0] || '10:00').trim() : '10:00';
                                  resolvedAssignDate = `${dateOnly}T${startHour.padStart(5, '0')}`;
                                } else {
                                  resolvedAssignDate = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
                                }
                                setAssignModal({ open: true, request: r });
                                setAssignInspectorId(inspectors[0]?.userId || '');
                                setAssignDate(resolvedAssignDate);
                                setAssignLocationType(((r.assignment?.locationType || r.locationType || r.lead.inspectionLocationType) === 'HOME' ? 'HOME' : 'HUB') as 'HUB' | 'HOME');
                                setAssignAddress(r.assignment?.address || r.address || r.lead.inspectionAddress || '');
                              }}
                            >
                              Assign Inspector
                            </button>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                              <button
                                className="btn-secondary"
                                style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                                onClick={() => {
                                  setAssignModal({ open: true, request: r });
                                  setAssignInspectorId(r.assignment?.inspectorId || inspectors[0]?.userId || '');
                                  setAssignDate(r.assignment?.scheduledAt ? new Date(r.assignment.scheduledAt).toISOString().slice(0, 16) : '');
                                  setAssignLocationType((r.assignment?.locationType || r.locationType) as 'HUB' | 'HOME');
                                  setAssignAddress(r.assignment?.address || r.address || '');
                                }}
                              >
                                Reschedule
                              </button>
                              <button
                                className="btn-danger"
                                style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                                onClick={async () => {
                                  if (!confirm(`Cancel inspection request ${r.lead.referenceCode}?`)) return;
                                  try {
                                    await api.cancelInspection(user, r.id, 'Cancelled via operations dispatch');
                                    setSuccessMsg('Inspection request cancelled');
                                    void loadAllData(user, true).catch(() => undefined);
                                  } catch (e) {
                                    reportError('Failed to cancel request');
                                  }
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!filteredRequests.length ? (
                      <tr>
                        <td colSpan={6} className="empty-state">
                          <h3>No inspection requests found</h3>
                          <p>All evaluation requests have been assigned or match no filter.</p>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {/* ======================================================== */}
        {/* VIEW 3: ACQUISITIONS & VALUATIONS                        */}
        {/* ======================================================== */}
        {activeTab === 'acquisitions' ? (
          <div>
            <div className="action-bar">
              <div className="section-heading">
                <h2>Acquisition Cases & Valuation Progress</h2>
                <p>Track post-inspection purchase cases from seller offer acceptance through document verification and finance payment.</p>
              </div>
              <div className="filter-group">
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search case, seller, VIN..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                <select className="select-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="ALL">All Stages</option>
                  <option value="DOCUMENTATION_REQUIRED">Documentation Required</option>
                  <option value="SETTLEMENT_READY">Settlement Ready</option>
                  <option value="HANDOVER_READY">Handover Ready</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ON_HOLD">On Hold</option>
                </select>
                <button className="btn-secondary" onClick={() => void loadAllData()} disabled={loading}>
                  <IconRefresh />
                </button>
              </div>
            </div>

            <div className="detail-grid">
              {filteredCases.map(c => {
                const docsTerminal = c.documents.length > 0 && c.documents.every(d => ['VERIFIED', 'WAIVED_BY_AUTHORIZED_POLICY'].includes(d.status));
                const settlementDone = c.settlementStatus === 'PAYMENT_VERIFIED';
                const handoverDone = c.custodyStatus === 'RECEIVED' && c.handover?.documentsReceived;
                const canComplete = docsTerminal && settlementDone && handoverDone && c.status !== 'COMPLETED';

                return (
                  <article className="detail-card" key={c.id}>
                    <div className="card-header">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="card-title">{c.lead.make} {c.lead.model}{c.lead.variant ? ` ${c.lead.variant}` : ''}</span>
                          <span className={`badge ${c.status === 'COMPLETED' ? 'badge-success' : c.status === 'SETTLEMENT_READY' ? 'badge-info' : 'badge-warning'}`}>
                            {c.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <span className="card-subtitle">Case: {c.caseReference.slice(0, 13)} · Lead: {c.lead.referenceCode}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--yellow)' }}>
                          {formatRupees(c.offer.offerAmountPaise)}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Agreed Purchase Price</span>
                      </div>
                    </div>

                    <div className="card-body">
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8125rem' }}>
                        <div><strong>Seller:</strong> {c.lead.sellerName}</div>
                        <div><strong>City:</strong> {c.lead.city}</div>
                        <div><strong>Year / Reg:</strong> {c.lead.manufacturingYear} · {c.lead.registrationNumber || c.handover?.registrationNumber || 'Pending'}</div>
                        <div><strong>Accepted:</strong> {formatDate(c.offer.acceptedAt)}</div>
                      </div>
                      {[c.lead.fuelType, c.lead.transmission, (c.lead as any).color].filter(Boolean).length > 0 && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                          {[c.lead.fuelType, c.lead.transmission, (c.lead as any).color].filter(Boolean).join(' · ')}
                        </div>
                      )}

                      {/* Readiness Gates */}
                      <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <div className={`gate-indicator ${docsTerminal ? 'passed' : 'blocked'}`}>
                          <span>{docsTerminal ? '✓' : '✗'} 1. Seller & Vehicle Documents:</span>
                          <span style={{ marginLeft: 'auto' }}>
                            {c.documents.filter(d => ['VERIFIED', 'WAIVED_BY_AUTHORIZED_POLICY'].includes(d.status)).length} / {c.documents.length} Verified
                          </span>
                        </div>
                        <div className={`gate-indicator ${settlementDone ? 'passed' : 'blocked'}`}>
                          <span>{settlementDone ? '✓' : '✗'} 2. Finance Settlement:</span>
                          <span style={{ marginLeft: 'auto' }}>
                            {c.settlementStatus} {c.settlement?.transactionReference ? `(${c.settlement.transactionReference})` : ''}
                          </span>
                        </div>
                        <div className={`gate-indicator ${handoverDone ? 'passed' : 'blocked'}`}>
                          <span>{handoverDone ? '✓' : '✗'} 3. Physical Custody & Keys:</span>
                          <span style={{ marginLeft: 'auto' }}>{c.custodyStatus}</span>
                        </div>
                      </div>

                      {c.stockUnit ? (
                        <div style={{ padding: '0.5rem', background: 'var(--success-bg)', border: '1px solid color-mix(in oklab, var(--color-success) 30%, transparent)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--success)', fontWeight: 600 }}>
                          ✓ Inwarded to Stock: {c.stockUnit.stockCode} ({c.stockUnit.status})
                        </div>
                      ) : null}
                    </div>

                    <div className="card-footer">
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                          onClick={() => {
                            setActiveTab('documentation');
                            setSearchQuery(c.caseReference);
                          }}
                        >
                          <IconDocuments /> Docs
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                          onClick={() => {
                            setHandoverModal({ open: true, caseItem: c });
                            setHandoverRegNumber(c.handover?.registrationNumber || c.lead.registrationNumber || '');
                            setHandoverOdometer(c.handover?.odometerKm || c.lead.odometerKm || 0);
                            setHandoverMainKeys(c.handover?.mainKeysReceived || 1);
                            setHandoverSpareKeys(c.handover?.spareKeysReceived || 0);
                            setHandoverBranchId(c.handover?.branchId || branches.find(branch => branch.city.toLowerCase() === c.lead.city.toLowerCase())?.id || branches[0]?.id || '');
                          }}
                        >
                          <IconHandover /> Handover
                        </button>
                      </div>

                      {canComplete ? (
                        <button
                          className="btn-gold"
                          style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                          onClick={() => void handleCompleteAcquisition(c)}
                        >
                          <IconCheck /> Complete Acquisition
                        </button>
                      ) : c.status === 'COMPLETED' && !c.stockUnit ? (
                        <button
                          className="btn-primary"
                          style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                          onClick={() => {
                            const cityBranch = branches.find(branch => branch.city.toLowerCase() === c.lead.city.toLowerCase());
                            setInwardBranchId(cityBranch?.id || branches[0]?.id || '');
                            setStockInwardModal({ open: true, caseItem: c });
                          }}
                        >
                          <IconInventory /> Stock Inward
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {!filteredCases.length ? (
                <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
                  <h3>No acquisition cases found</h3>
                  <p>When sellers accept approved acquisition offers, cases automatically register here.</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ======================================================== */}
        {/* VIEW 4: DOCUMENTATION VERIFICATION                       */}
        {/* ======================================================== */}
        {activeTab === 'documentation' ? (() => {
          const filteredDocCases = cases.filter(c => {
            if (docSearchQuery.trim()) {
              const q = docSearchQuery.trim().toLowerCase();
              const match =
                (c.lead.sellerName && c.lead.sellerName.toLowerCase().includes(q)) ||
                (c.lead.sellerPhone && c.lead.sellerPhone.includes(q)) ||
                (c.lead.make && c.lead.make.toLowerCase().includes(q)) ||
                (c.lead.model && c.lead.model.toLowerCase().includes(q)) ||
                (c.lead.registrationNumber && c.lead.registrationNumber.toLowerCase().includes(q)) ||
                (c.caseReference && c.caseReference.toLowerCase().includes(q));
              if (!match) return false;
            }
            if (docCaseStatusFilter !== 'ALL' && c.status !== docCaseStatusFilter) {
              return false;
            }
            if (docVerificationFilter === 'PENDING') {
              const hasPending = c.documents.some(d => ['REQUESTED', 'RECEIVED', 'UNDER_REVIEW'].includes(d.status));
              if (!hasPending) return false;
            } else if (docVerificationFilter === 'ALL_VERIFIED') {
              const allDone = c.documents.length > 0 && c.documents.every(d => ['VERIFIED', 'WAIVED_BY_AUTHORIZED_POLICY'].includes(d.status));
              if (!allDone) return false;
            } else if (docVerificationFilter === 'REJECTED') {
              const hasRejected = c.documents.some(d => d.status === 'REJECTED');
              if (!hasRejected) return false;
            }
            if (docTypeFilter !== 'ALL') {
              const hasDocType = c.documents.some(d => d.documentType === docTypeFilter);
              if (!hasDocType) return false;
            }
            return true;
          });

          const hasDocFilters = Boolean(docSearchQuery.trim() || docCaseStatusFilter !== 'ALL' || docVerificationFilter !== 'ALL' || docTypeFilter !== 'ALL');
          const resetDocFilters = () => {
            setDocSearchQuery('');
            setDocCaseStatusFilter('ALL');
            setDocVerificationFilter('ALL');
            setDocTypeFilter('ALL');
          };

          return (
            <div>
              <div className="action-bar" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                <div className="section-heading">
                  <h2>Pre-Acquisition Documentation Checklist</h2>
                  <p>Verify mandatory ownership, identity, lien and authority records before finance settlement release.</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button className="btn-secondary" onClick={() => void loadAllData()} disabled={loading} title="Reload Cases">
                    <IconRefresh />
                  </button>
                </div>
              </div>

              {/* Documentation Filter Bar */}
              <div style={{
                background: 'color-mix(in oklab, var(--color-base-content) 3%, transparent)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                  <div style={{ flex: '1 1 240px', position: 'relative' }}>
                    <input
                      type="text"
                      className="search-input"
                      style={{ width: '100%' }}
                      placeholder="Search seller, phone, car, reg plate, case reference..."
                      value={docSearchQuery}
                      onChange={e => setDocSearchQuery(e.target.value)}
                    />
                  </div>

                  <select
                    className="select-filter"
                    style={{ flex: '0 1 180px' }}
                    value={docCaseStatusFilter}
                    onChange={e => setDocCaseStatusFilter(e.target.value)}
                  >
                    <option value="ALL">All Case Statuses</option>
                    <option value="DOCUMENTATION_REQUIRED">Documentation Required</option>
                    <option value="SETTLEMENT_READY">Settlement Ready</option>
                    <option value="HANDOVER_READY">Handover Ready</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="ON_HOLD">On Hold</option>
                  </select>

                  <select
                    className="select-filter"
                    style={{ flex: '0 1 190px' }}
                    value={docVerificationFilter}
                    onChange={e => setDocVerificationFilter(e.target.value)}
                  >
                    <option value="ALL">All Verification States</option>
                    <option value="PENDING">Pending Review (Action Req.)</option>
                    <option value="ALL_VERIFIED">All Docs Verified & Cleared</option>
                    <option value="REJECTED">Has Rejected Documents</option>
                  </select>

                  <select
                    className="select-filter"
                    style={{ flex: '0 1 180px' }}
                    value={docTypeFilter}
                    onChange={e => setDocTypeFilter(e.target.value)}
                  >
                    <option value="ALL">All Document Types</option>
                    <option value="RC_FRONT">RC Front</option>
                    <option value="RC_BACK">RC Back</option>
                    <option value="INSURANCE_POLICY">Insurance Policy</option>
                    <option value="POLLUTION_CERTIFICATE">PUC Certificate</option>
                    <option value="INVOICE">Purchase Invoice</option>
                    <option value="LOAN_NOC">Bank Loan NOC</option>
                    <option value="FORM_29_30">Form 29 / 30 (RTO)</option>
                    <option value="SERVICE_RECORD">Service Record</option>
                    <option value="AADHAAR">Seller Aadhaar</option>
                    <option value="PAN">Seller PAN</option>
                  </select>

                  {hasDocFilters && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--color-error)' }}
                      onClick={resetDocFilters}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--muted)' }}>
                  <div>
                    Showing <strong>{filteredDocCases.length}</strong> of <strong>{cases.length}</strong> seller documentation cases
                    {hasDocFilters ? ' (filtered)' : ''}
                  </div>
                  {docTypeFilter !== 'ALL' && (
                    <div style={{ color: 'var(--color-primary)' }}>
                      Highlighting documents of type: <strong>{docTypeFilter.replace(/_/g, ' ')}</strong>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {filteredDocCases.map(c => {
                  const displayedDocs = docTypeFilter !== 'ALL'
                    ? c.documents.filter(d => d.documentType === docTypeFilter)
                    : c.documents;

                  return (
                    <article className="card-table" key={c.id}>
                      <div className="card-table-header">
                        <div>
                          <strong>{c.lead.make} {c.lead.model} ({c.lead.manufacturingYear})</strong>
                          <div className="card-table-subtitle">
                            Seller: {c.lead.sellerName} · Tel: {c.lead.sellerPhone || '—'} · Reg: {c.lead.registrationNumber || 'Not provided'} · Case: {c.caseReference.slice(0, 13)}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`badge ${c.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'}`}>
                            {c.status.replace(/_/g, ' ')}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                            {c.documents.filter(d => ['VERIFIED', 'WAIVED_BY_AUTHORIZED_POLICY'].includes(d.status)).length} / {c.documents.length} Verified
                          </span>
                        </div>
                      </div>

                      {(() => {
                        const selected = (docSelection[c.id] ?? []).filter(t => displayedDocs.some(d => d.documentType === t));
                        return selected.length > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', background: 'color-mix(in oklab, var(--color-primary) 10%, transparent)', borderBottom: '1px solid var(--border)' }}>
                            <strong style={{ fontSize: '0.85rem' }}>{selected.length} selected</strong>
                            <button
                              type="button"
                              className="btn-primary"
                              style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem' }}
                              disabled={loading}
                              onClick={() => void verifyDocumentsNow(c.id, selected)}
                            >
                              Verify {selected.length} selected
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem' }}
                              onClick={() => {
                                setDocModal({ open: true, caseId: c.id, docTypes: selected });
                                setDocStatus('VERIFIED');
                                setDocNotes('');
                              }}
                            >
                              Other status…
                            </button>
                            <button type="button" className="btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => setDocSelection(prev => ({ ...prev, [c.id]: [] }))}>Clear</button>
                          </div>
                        ) : null;
                      })()}
                      <div className="table-responsive">
                        <table>
                          <thead>
                            <tr>
                              <th style={{ width: '36px' }}>
                                <input
                                  type="checkbox"
                                  aria-label="Select all documents"
                                  checked={displayedDocs.length > 0 && displayedDocs.every(d => (docSelection[c.id] ?? []).includes(d.documentType))}
                                  onChange={e => setDocSelection(prev => ({ ...prev, [c.id]: e.target.checked ? displayedDocs.map(d => d.documentType) : [] }))}
                                />
                              </th>
                              <th>Document Type</th>
                              <th>Current Status</th>
                              <th>Reviewed At</th>
                              <th>Reviewer Notes</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayedDocs.map(doc => (
                              <tr key={doc.id} style={docTypeFilter !== 'ALL' ? { background: 'color-mix(in oklab, var(--color-base-content) 4%, transparent)' } : undefined}>
                                <td>
                                  <input
                                    type="checkbox"
                                    aria-label={`Select ${doc.documentType.replace(/_/g, ' ')}`}
                                    checked={(docSelection[c.id] ?? []).includes(doc.documentType)}
                                    onChange={() => toggleDocSelected(c.id, doc.documentType)}
                                  />
                                </td>
                                <td>
                                  <strong>{doc.documentType.replace(/_/g, ' ')}</strong>
                                </td>
                                <td>
                                  <span className={`badge ${doc.status === 'VERIFIED' ? 'badge-success' : doc.status === 'WAIVED_BY_AUTHORIZED_POLICY' ? 'badge-purple' : doc.status === 'REJECTED' ? 'badge-danger' : 'badge-warning'}`}>
                                    {doc.status.replace(/_/g, ' ')}
                                  </span>
                                </td>
                                <td>{formatDate(doc.reviewedAt)}</td>
                                <td>{doc.notes || '—'}</td>
                                <td>
                                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                    {['REQUESTED', 'RECEIVED', 'UNDER_REVIEW'].includes(doc.status) ? (
                                      <button
                                        className="btn-primary"
                                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                        disabled={loading}
                                        onClick={() => void verifyDocumentsNow(c.id, [doc.documentType])}
                                      >
                                        Verify
                                      </button>
                                    ) : null}
                                    <button
                                      className="btn-secondary"
                                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                      onClick={() => {
                                        setDocModal({
                                          open: true,
                                          caseId: c.id,
                                          docType: doc.documentType,
                                          currentStatus: doc.status,
                                        });
                                        setDocStatus(doc.status === 'VERIFIED' ? 'REJECTED' : 'VERIFIED');
                                        setDocNotes(doc.notes || '');
                                      }}
                                    >
                                      {['REQUESTED', 'RECEIVED', 'UNDER_REVIEW'].includes(doc.status) ? 'Reject / waive…' : 'Change status'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  );
                })}

                {!filteredDocCases.length && cases.length > 0 ? (
                  <div className="empty-state">
                    <h3>No matching documentation cases</h3>
                    <p>No seller cases matched your current search or status filters. Try clearing your filters.</p>
                    <button className="btn-secondary" style={{ marginTop: '8px' }} onClick={resetDocFilters}>Reset Filters</button>
                  </div>
                ) : null}

                {!cases.length ? (
                  <div className="empty-state">
                    <h3>No documentation cases</h3>
                    <p>Accepted seller offers will generate document checklists automatically.</p>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })() : null}

        {/* ======================================================== */}
        {/* VIEW 5: HANDOVER & CUSTODY                               */}
        {/* ======================================================== */}
        {activeTab === 'handover' ? (
          <div>
            <div className="action-bar">
              <div className="section-heading">
                <h2>Vehicle Physical Handover & Key Custody</h2>
                <p>Record key transfers, odometer reading, and vehicle custody once Finance settlement is verified.</p>
              </div>
              <button className="btn-secondary" onClick={() => void loadAllData()} disabled={loading}>
                <IconRefresh />
              </button>
            </div>

            <div className="detail-grid">
              {cases.map(c => {
                const settlementDone = c.settlementStatus === 'PAYMENT_VERIFIED';
                return (
                  <article className="detail-card" key={c.id}>
                    <div className="card-header">
                      <div>
                        <strong className="card-title">{c.lead.make} {c.lead.model}</strong>
                        <div className="card-subtitle">Reg: {c.lead.registrationNumber || 'N/A'} · Seller: {c.lead.sellerName}</div>
                      </div>
                      <span className={`badge ${c.custodyStatus === 'RECEIVED' ? 'badge-success' : 'badge-warning'}`}>
                        {c.custodyStatus}
                      </span>
                    </div>

                    <div className="card-body">
                      {/* Finance Settlement Barrier */}
                      <div style={{
                        padding: '0.6rem',
                        borderRadius: '6px',
                        background: settlementDone ? 'var(--success-bg)' : 'var(--warning-bg)',
                        border: settlementDone ? '1px solid color-mix(in oklab, var(--color-success) 30%, transparent)' : '1px solid color-mix(in oklab, var(--color-primary) 30%, transparent)',
                        color: settlementDone ? 'var(--success)' : 'var(--warning)',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                      }}>
                        <IconLock />
                        <span>Finance Payment Gate: <strong>{c.settlementStatus}</strong></span>
                      </div>

                      {c.handover ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8125rem' }}>
                          <div><strong>Location:</strong> {c.handover.location}</div>
                          <div><strong>Odometer:</strong> {c.handover.odometerKm?.toLocaleString()} km</div>
                          <div><strong>Main Keys:</strong> {c.handover.mainKeysReceived}</div>
                          <div><strong>Spare Keys:</strong> {c.handover.spareKeysReceived}</div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <strong>Documents Received:</strong> {c.handover.documentsReceived ? '✓ Yes (Originals stored in Hub vault)' : '✗ No'}
                          </div>
                          {c.handover.conditionNotes ? (
                            <div style={{ gridColumn: '1 / -1' }}><strong>Notes:</strong> {c.handover.conditionNotes}</div>
                          ) : null}
                        </div>
                      ) : (
                        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Physical vehicle custody has not yet been logged.</p>
                      )}
                    </div>

                    <div className="card-footer">
                      {c.status === 'COMPLETED' && c.stockUnit ? (
                        <button className="btn-primary" style={{ fontSize: '0.8rem' }} onClick={() => setActiveTab('inventory')}>
                          <IconInventory /> View Stock & QC Workflow
                        </button>
                      ) : (
                        <button
                          className="btn-gold"
                          style={{ fontSize: '0.8rem' }}
                          onClick={() => {
                            setHandoverModal({ open: true, caseItem: c });
                            setHandoverRegNumber(c.handover?.registrationNumber || c.lead.registrationNumber || '');
                            setHandoverOdometer(c.handover?.odometerKm || c.lead.odometerKm || 0);
                            setHandoverMainKeys(c.handover?.mainKeysReceived || 1);
                            setHandoverSpareKeys(c.handover?.spareKeysReceived || 0);
                            setHandoverBranchId(c.handover?.branchId || branches.find(branch => branch.city.toLowerCase() === c.lead.city.toLowerCase())?.id || branches[0]?.id || '');
                          }}
                        >
                          <IconHandover /> {c.handover ? 'Confirm Stock Inward' : 'Record Handover'}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ======================================================== */}
        {/* VIEW 6: STOCK INVENTORY                                  */}
        {/* ======================================================== */}
        {activeTab === 'inventory' ? (
          <div>
            <div className="action-bar">
              <div className="section-heading">
                <h2>Acquired Vehicle Stock Registry</h2>
                <p>Track canonical vehicle inventory from stock inward through refurbishment, QC, listing and retail sale.</p>
              </div>
              <div className="filter-group">
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search stock code, model, plate..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                <select className="select-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="ALL">All Stock Statuses</option>
                  <option value="RECEIVED">Received</option>
                  <option value="REFURBISHMENT_PENDING">Refurbishment Pending</option>
                  <option value="IN_REFURBISHMENT">In Refurbishment</option>
                  <option value="QC_PENDING">QC Pending</option>
                  <option value="LISTING_PREPARATION">Listing Preparation</option>
                  <option value="LISTING_READY">Listing Ready</option>
                  <option value="LISTED">Listed (Published)</option>
                  <option value="RESERVED">Reserved</option>
                  <option value="SOLD">Sold (Delivered)</option>
                </select>
                <button className="btn-secondary" onClick={() => void loadAllData()} disabled={loading}>
                  <IconRefresh />
                </button>
                {user ? (
                  <OpeningStockTools
                    user={user}
                    branches={branches}
                    onAdded={message => { setSuccessMsg(message); void loadAllData(); }}
                  />
                ) : null}
              </div>
            </div>

            <div className="card-table">
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Stock Code</th>
                      <th>Vehicle</th>
                      <th>Reg Plate / Km</th>
                      <th>Location</th>
                      <th>Acquisition Cost</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventory.map(s => (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.stockCode}</strong>
                          {s.source === 'OPENING_STOCK' ? (
                            <span className="badge badge-info" style={{ marginLeft: '0.4rem' }} title="Entered by hand: a car the hub already owned before the app. It must pass inspection before it can be listed.">OPENING STOCK</span>
                          ) : null}
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Inwarded: {formatDate(s.createdAt)}</div>
                        </td>
                        <td>
                          <strong>{s.manufacturingYear} {s.make} {s.model}{s.variant ? ` ${s.variant}` : ''}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                            {[s.bodyType ? bodyTypeLabel(s.bodyType, bodyTypeOptions) : '', s.fuelType, s.transmission, s.color || 'Standard'].filter(Boolean).join(' · ')}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {s.registrationNumber ? (
                              <span style={{ display: 'inline-block', width: 'fit-content', padding: '1px 6px', background: 'color-mix(in oklab, var(--color-base-content) 6%, transparent)', border: '1px solid var(--border)', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.5px', fontSize: '0.8125rem' }}>
                                {s.registrationNumber}
                              </span>
                            ) : (
                              <span style={{ fontWeight: 600, color: 'var(--muted)', fontSize: '0.8125rem' }}>Pending</span>
                            )}
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{s.odometerKm.toLocaleString()} km</div>
                            {(s.registrationYear || s.registrationCity) && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
                                {[s.registrationYear ? `Reg: ${s.registrationYear}` : '', s.registrationCity].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>{s.branch?.name ? `${s.branch.name} (${s.branch.city})` : (branches.find(b => b.id === s.branchId)?.name || s.physicalLocation || 'Main Hub')}</td>
                        <td>{formatRupees(s.acquisitionCostPaise)}</td>
                        <td>
                          <span className={`badge ${
                            s.status === 'LISTED' ? 'badge-success' :
                            s.status === 'SOLD' ? 'badge-purple' :
                            s.status === 'LISTING_READY' || s.status === 'LISTING_PREPARATION' ? 'badge-info' :
                            s.status === 'QC_PENDING' ? 'badge-purple' :
                            s.status === 'IN_REFURBISHMENT' ? 'badge-warning' :
                            'badge-neutral'
                          }`}>
                            {s.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                              onClick={() => {
                                setSpecsModal({
                                  open: true,
                                  stockItem: s,
                                  registrationNumber: s.registrationNumber || '',
                                  variant: s.variant || '',
                                  bodyType: s.bodyType || '',
                                  color: s.color || '',
                                  odometerKm: s.odometerKm || 0,
                                });
                              }}
                              title="Update registration number, color, or variant specs"
                            >
                              Edit Specs
                            </button>

                            {['RECEIVED', 'REFURBISHMENT_PENDING', 'IN_REFURBISHMENT'].includes(s.status) ? (
                              <button
                                className="btn-secondary"
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                onClick={() => {
                                  setWorkOrderModal({ open: true, stockItem: s });
                                }}
                              >
                                + Work Order
                              </button>
                            ) : null}

                            {s.status === 'QC_PENDING' ? (
                              <button
                                className="btn-gold"
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                onClick={() => {
                                  setQcModal({ open: true, stockItem: s });
                                }}
                              >
                                Independent QC
                              </button>
                            ) : null}

                            {['LISTING_PREPARATION', 'QC_PENDING', 'LISTING_READY', 'LISTED'].includes(s.status) ? (
                              <button
                                className="btn-secondary"
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                onClick={() => openStudioModal(s)}
                              >
                                {s.status === 'LISTED' ? 'Edit listing' : 'Studio Specs'}
                              </button>
                            ) : null}

                            {s.status === 'LISTING_READY' ? (
                              <button
                                className="btn-gold"
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                onClick={() => openPublishModal(s)}
                              >
                                Approve & Publish
                              </button>
                            ) : null}

                            {['LISTED', 'RESERVED'].includes(s.status) ? (
                              <button
                                className="btn-primary"
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                onClick={() => {
                                  setDeliveryModal({ open: true, stockItem: s });
                                }}
                              >
                                Handover to Buyer
                              </button>
                            ) : null}

                            {s.status === 'SOLD' ? (
                              <button
                                className="btn-secondary"
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderColor: 'rgba(196, 181, 253, 0.4)', color: 'var(--purple)' }}
                                onClick={() => {
                                  setViewBuyerModal({ open: true, stockItem: s });
                                }}
                              >
                                Buyer Details
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredInventory.length ? (
                      <tr>
                        <td colSpan={7} className="empty-state">
                          <h3>No stock vehicles found</h3>
                          <p>Complete acquisition cases and inward them to create stock records.</p>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {/* ======================================================== */}
        {/* VIEW 7: REFURBISHMENT & WORK ORDERS                      */}
        {/* ======================================================== */}
        {activeTab === 'refurbishment' ? (
          <div>
            <div className="action-bar">
              <div className="section-heading">
                <h2>Refurbishment Workshop & Cost Approvals</h2>
                <p>Manage repair work orders, track workshop providers, and enforce independent price authorizations.</p>
              </div>
              <button className="btn-secondary" onClick={() => void loadAllData()} disabled={loading}>
                <IconRefresh />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {inventory
                .filter(s => s.workOrders && s.workOrders.length > 0)
                .map(s => (
                  <article className="card-table" key={s.id}>
                    <div className="card-table-header">
                      <div>
                        <strong>{s.manufacturingYear} {s.make} {s.model} ({s.stockCode})</strong>
                        <div className="card-table-subtitle">Location: {s.physicalLocation} · Stock Status: {s.status}</div>
                      </div>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                        onClick={() => setWorkOrderModal({ open: true, stockItem: s })}
                      >
                        + Add Work Order
                      </button>
                    </div>

                    <div className="table-responsive">
                      <table>
                        <thead>
                          <tr>
                            <th>Category & Action</th>
                            <th>Provider</th>
                            <th>Cost Est. / Actual</th>
                            <th>Cost Approval</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.workOrders?.map(wo => (
                            <tr key={wo.id}>
                              <td>
                                <strong>{wo.category}</strong>
                                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{wo.requiredAction}</div>
                              </td>
                              <td>{wo.assignedProvider || 'Internal Workshop'}</td>
                              <td>
                                <div>Est: {formatRupees(wo.estimatedCostPaise)}</div>
                                {wo.actualCostPaise ? <div style={{ fontSize: '0.75rem', color: 'var(--success)' }}>Act: {formatRupees(wo.actualCostPaise)}</div> : null}
                              </td>
                              <td>
                                {wo.costApproval ? (
                                  <div>
                                    <span className={`badge ${wo.costApproval.status === 'APPROVED' ? 'badge-success' : wo.costApproval.status === 'REJECTED' ? 'badge-danger' : 'badge-warning'}`}>
                                      {wo.costApproval.status}
                                    </span>
                                    {wo.costApproval.reason ? <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{wo.costApproval.reason}</div> : null}
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>None</span>
                                )}
                              </td>
                              <td>
                                <span className={`badge ${wo.status === 'COMPLETED' ? 'badge-success' : wo.status === 'IN_PROGRESS' ? 'badge-purple' : wo.status === 'APPROVED' ? 'badge-info' : 'badge-warning'}`}>
                                  {wo.status.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                  {wo.status === 'DRAFT' && wo.costApproval?.status === 'REJECTED' ? (
                                    // Cost was rejected — show Edit & Resubmit
                                    <button
                                      className="btn-gold"
                                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                      onClick={() => openEditCostModal(wo)}
                                    >
                                      ✏️ Edit & Resubmit
                                    </button>
                                  ) : wo.status === 'DRAFT' ? (
                                    // Fresh DRAFT — submit for first approval
                                    <button
                                      className="btn-secondary"
                                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                      onClick={() => void handleSubmitCostApproval(wo.id, wo.version, Number(wo.estimatedCostPaise) || 500000)}
                                    >
                                      Submit Cost
                                    </button>
                                  ) : null}

                                  {wo.status === 'PENDING_COST_APPROVAL' && wo.costApproval ? (
                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                      <button
                                        className="btn-gold"
                                        style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
                                        onClick={() => void handleDecideCost(wo.id, wo.costApproval!.version, 'APPROVE')}
                                      >
                                        Approve
                                      </button>
                                      <button
                                        className="btn-danger"
                                        style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
                                        onClick={() => void handleDecideCost(wo.id, wo.costApproval!.version, 'REJECT')}
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  ) : null}

                                  {wo.status === 'APPROVED' ? (
                                    <button
                                      className="btn-primary"
                                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                      onClick={() => void handleStartWorkOrder(wo.id, wo.version)}
                                    >
                                      Start Work
                                    </button>
                                  ) : null}

                                  {wo.status === 'IN_PROGRESS' ? (
                                    <button
                                      className="btn-gold"
                                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                      onClick={() => void handleCompleteWorkOrder(wo.id, wo.version, Number(wo.estimatedCostPaise))}
                                    >
                                      Complete Work
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))}
              {!inventory.some(s => s.workOrders && s.workOrders.length > 0) ? (
                <div className="empty-state">
                  <h3>No active work orders</h3>
                  <p>Create work orders from the Stock Inventory tab to manage refurbishment jobs.</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ======================================================== */}
        {/* VIEW 8: QUALITY CONTROL (INDEPENDENT)                    */}
        {/* ======================================================== */}
        {activeTab === 'qc' ? (
          <div>
            <div className="action-bar">
              <div className="section-heading">
                <h2>Independent Quality Control Sign-Off</h2>
                <p>Enforce strict independent inspection checks before vehicles advance to Listing Studio and publication.</p>
              </div>
              <button className="btn-secondary" onClick={() => void loadAllData()} disabled={loading}>
                <IconRefresh />
              </button>
            </div>

            <div className="detail-grid">
              {inventory
                .filter(s => needsQualityControl(s) || (s.qualityControlReports && s.qualityControlReports.length > 0))
                .map(s => {
                  const qcInProgress = s.qualityControlReports?.some(report => report.status === 'IN_PROGRESS');
                  return (
                  <article className="detail-card" key={s.id}>
                    <div className="card-header">
                      <div>
                        <strong className="card-title">{s.manufacturingYear} {s.make} {s.model}</strong>
                        <div className="card-subtitle">Stock: {s.stockCode} · Status: {s.status}</div>
                      </div>
                      <span className={`badge ${s.status === 'QC_PENDING' ? 'badge-warning' : 'badge-info'}`}>
                        {s.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="card-body">
                      <div><strong>Location:</strong> {s.physicalLocation}</div>
                      <div><strong>Completed Work Orders:</strong> {s.workOrders?.filter(w => w.status === 'COMPLETED').length || 0}</div>

                      {s.qualityControlReports?.map(qc => (
                        <div key={qc.id} style={{ marginTop: '0.5rem', padding: '0.6rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className={`badge ${qc.status === 'PASSED' ? 'badge-success' : qc.status === 'REWORK_REQUIRED' ? 'badge-warning' : 'badge-danger'}`}>
                              QC {qc.status}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{formatDate(qc.reviewedAt || qc.createdAt)}</span>
                          </div>
                          {qc.findings ? <div style={{ fontSize: '0.8rem', marginTop: '0.35rem', color: 'var(--text)' }}>{qc.findings}</div> : null}
                        </div>
                      ))}
                    </div>

                    <div className="card-footer">
                      {qcInProgress ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--warning)', fontWeight: 600 }}>QC report is already in progress</span>
                      ) : needsQualityControl(s) ? (
                        <button
                          className="btn-gold"
                          style={{ fontSize: '0.8rem' }}
                          onClick={() => setQcModal({ open: true, stockItem: s })}
                        >
                          <IconQC /> Record QC Verdict
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 600 }}>QC Signed Off</span>
                      )}
                    </div>
                  </article>
                  );
                })}
              {!inventory.some(s => needsQualityControl(s) || (s.qualityControlReports && s.qualityControlReports.length > 0)) ? (
                <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
                  <h3>No vehicles awaiting QC sign-off</h3>
                  <p>Vehicles with completed refurbishment work orders will appear here automatically.</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ======================================================== */}
        {/* VIEW 9: LISTING STUDIO                                   */}
        {/* ======================================================== */}
        {activeTab === 'studio' ? (
          <div>
            <div className="action-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="section-heading">
                <h2>Listing Studio & Photography</h2>
                <p>Curate photos, highlights, verified tags, and vehicle specifications for marketplace publication.</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--surface-2)', padding: '0.25rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <button
                    className={`btn-sm ${studioFilter === 'ALL' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setStudioFilter('ALL')}
                    style={{ border: 'none' }}
                  >
                    All Studio Units ({inventory.filter(s => ['LISTING_PREPARATION', 'LISTING_READY', 'LISTED'].includes(s.status)).length})
                  </button>
                  <button
                    className={`btn-sm ${studioFilter === 'PREPARATION' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setStudioFilter('PREPARATION')}
                    style={{ border: 'none' }}
                  >
                    Preparation Required ({inventory.filter(s => s.status === 'LISTING_PREPARATION').length})
                  </button>
                  <button
                    className={`btn-sm ${studioFilter === 'READY' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setStudioFilter('READY')}
                    style={{ border: 'none' }}
                  >
                    Listing Ready ({inventory.filter(s => s.status === 'LISTING_READY').length})
                  </button>
                  <button
                    className={`btn-sm ${studioFilter === 'LISTED' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setStudioFilter('LISTED')}
                    style={{ border: 'none' }}
                  >
                    Live Catalog ({inventory.filter(s => s.status === 'LISTED').length})
                  </button>
                </div>
                <button className="btn-secondary" onClick={() => void loadAllData()} disabled={loading} title="Refresh studio inventory">
                  <IconRefresh />
                </button>
              </div>
            </div>

            <div className="detail-grid">
              {(() => {
                const filteredStudioUnits = inventory.filter(s => {
                  if (studioFilter === 'PREPARATION') {
                    return s.status === 'LISTING_PREPARATION';
                  }
                  if (studioFilter === 'READY') {
                    return s.status === 'LISTING_READY';
                  }
                  if (studioFilter === 'LISTED') {
                    return s.status === 'LISTED';
                  }
                  return ['LISTING_PREPARATION', 'LISTING_READY', 'LISTED'].includes(s.status);
                });

                if (filteredStudioUnits.length === 0) {
                  return (
                    <div className="empty-state" style={{ gridColumn: '1 / -1', padding: '3.5rem 1.5rem', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', padding: '1rem', background: 'var(--surface-2)', borderRadius: '50%', marginBottom: '1rem', color: 'var(--yellow)' }}>
                        <IconStudio style={{ width: 36, height: 36 }} />
                      </div>
                      <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--text)' }}>No Vehicle Units in Studio</h3>
                      <p style={{ maxWidth: '520px', margin: '0 auto 1.5rem', color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                        Vehicle stock units inwarded from seller acquisitions or passed by Quality Control (QC) flow into this Listing Studio. Here, photographers and listing managers attach high-res 360° photos, curate headline titles, and verify condition tags before publishing.
                      </p>
                      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                        <button className="btn-secondary" onClick={() => setActiveTab('inventory')}>
                          <IconInventory /> View All Inventory ({inventory.length})
                        </button>
                        <button className="btn-outline" onClick={() => setActiveTab('handover')}>
                          <IconHandover /> Check Vehicle Handover
                        </button>
                      </div>
                    </div>
                  );
                }

                return filteredStudioUnits.map(s => {
                  const mediaList = s.vehicle?.listing?.media || [];
                  const heroPhoto = mediaList[0]?.url;

                  return (
                    <article className="detail-card" key={s.id}>
                      {heroPhoto ? (
                        <div style={{ height: '140px', overflow: 'hidden', borderTopLeftRadius: 'var(--radius-md)', borderTopRightRadius: 'var(--radius-md)', background: 'var(--surface-2)', position: 'relative' }}>
                          <img src={heroPhoto} alt={s.model} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <span style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'var(--scrim)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--text)', border: '1px solid var(--border)' }}>
                            {mediaList.length} photo{mediaList.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      ) : null}

                      <div className="card-header">
                        <div>
                          <strong className="card-title">{s.manufacturingYear} {s.make} {s.model} {s.variant || ''}</strong>
                          <div className="card-subtitle">Stock: {s.stockCode} · Plate: {s.registrationNumber || 'Pending'}</div>
                        </div>
                        <span className={`badge ${s.status === 'LISTING_READY' ? 'badge-success' : s.status === 'LISTED' ? 'badge-info' : 'badge-warning'}`}>
                          {s.status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="card-body">
                        <div><strong>Public Title:</strong> {s.vehicle?.listing?.title || 'Draft not yet created'}</div>
                        <div><strong>Color:</strong> {s.vehicle?.color || s.color || 'Not recorded'}</div>
                        <div><strong>Condition Summary:</strong> {s.vehicle?.conditionSummary || 'Inspection verified'}</div>
                        <div>
                          <strong>Studio Media:</strong> {mediaList.length ? `${mediaList.length} curated images ready` : 'No photos attached yet'}
                        </div>
                        {s.listingGaps?.length ? (
                          <div className="studio-checklist is-incomplete" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                            <strong>Still needed</strong>: {s.listingGaps.map(g => g.label).join(', ')}
                          </div>
                        ) : null}
                      </div>

                      <div className="card-footer" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {s.status === 'LISTED' ? (
                          <>
                            <button
                              className="btn-secondary"
                              style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                              onClick={() => openStudioModal(s)}
                            >
                              Edit live listing
                            </button>
                            {s.vehicle?.listing?.id ? (
                              <a
                                href={`${MARKETPLACE_URL}/${s.vehicle.listing.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-outline"
                                style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' }}
                              >
                                ↗ Live Listing
                              </a>
                            ) : null}
                          </>
                        ) : (
                          <button
                            className="btn-gold"
                            style={{ fontSize: '0.8rem' }}
                            onClick={() => openStudioModal(s)}
                          >
                            <IconStudio /> {s.vehicle?.listing ? 'Edit Studio Specs & Photos' : 'Prepare Listing'}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                });
              })()}
            </div>
          </div>
        ) : null}

        {/* ======================================================== */}
        {/* VIEW 10: RETAIL PUBLICATION                              */}
        {/* ======================================================== */}
        {activeTab === 'publication' ? (
          <div>
            <div className="action-bar">
              <div className="section-heading">
                <h2>Commercial Readiness & Retail Publication</h2>
                <p>Validate commercial gates and publish approved vehicles to the customer marketplace.</p>
              </div>
              <button className="btn-secondary" onClick={() => void loadAllData()} disabled={loading}>
                <IconRefresh />
              </button>
            </div>

            <div className="detail-grid">
              {inventory
                .filter(s => s.status === 'LISTING_READY' || s.status === 'LISTED')
                .map(s => {
                  const isPublished = s.status === 'LISTED';
                  return (
                    <article className="detail-card" key={s.id}>
                      <div className="card-header">
                        <div>
                          <strong className="card-title">{s.vehicle?.listing?.title || `${s.manufacturingYear} ${s.make} ${s.model}`}</strong>
                          <div className="card-subtitle">
                            Stock: {s.stockCode} · Reg: {s.registrationNumber || 'N/A'}
                            {s.branch?.name ? ` · 📍 ${s.branch.name}` : (branches.find(b => b.id === s.branchId)?.name ? ` · 📍 ${branches.find(b => b.id === s.branchId)?.name}` : '')}
                          </div>
                        </div>
                        <span className={`badge ${isPublished ? 'badge-success' : 'badge-info'}`}>
                          {s.status}
                        </span>
                      </div>

                      <div className="card-body">
                        <div className="gate-indicator passed">✓ Stock Inward Completed: {s.stockCode}</div>
                        <div className="gate-indicator passed">✓ Refurbishment & Repairs Verified</div>
                        <div className="gate-indicator passed">✓ Independent QC Sign-off Passed</div>
                        <div className="gate-indicator passed">✓ Studio Specifications & Photos Attached</div>

                        {isPublished ? (
                          <div style={{ marginTop: '0.5rem', padding: '0.6rem', background: 'var(--success-bg)', border: '1px solid color-mix(in oklab, var(--color-success) 30%, transparent)', borderRadius: '6px', color: 'var(--success)', fontWeight: 600 }}>
                            ✓ Live in V MOTIV Catalog at {formatRupees(s.vehicle?.listing?.pricePaise)}
                          </div>
                        ) : null}
                      </div>

                      <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {!isPublished ? (
                          <button
                            className="btn-gold"
                            style={{ fontSize: '0.8rem' }}
                            onClick={() => openPublishModal(s)}
                          >
                            <IconPublish /> Approve Price & Publish
                          </button>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--success)', fontSize: '0.85rem', fontWeight: 600 }}>✓ Live Marketplace Listing</span>
                            {s.vehicle?.listing?.id ? (
                              <a
                                href={`${MARKETPLACE_URL}/${s.vehicle.listing.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-outline"
                                style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                              >
                                ↗ Open in Marketplace
                              </a>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              {!inventory.some(s => s.status === 'LISTING_READY' || s.status === 'LISTED') ? (
                <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
                  <h3>No vehicles in publication pipeline</h3>
                  <p>Prepare vehicles in Listing Studio to advance them here for retail price approval.</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ======================================================== */}
        {/* VIEW 11: TEST DRIVES & BUYER DELIVERIES                   */}
        {/* ======================================================== */}
        {activeTab === 'deliveries' ? (
          <div>
            <div className="action-bar">
              <div className="section-heading">
                <h2>Buyer Test Drives & Vehicle Handover</h2>
                <p>Manage customer test drives and record official delivery to buyers.</p>
              </div>
              <button className="btn-secondary" onClick={() => void loadAllData()} disabled={loading}>
                <IconRefresh />
              </button>
            </div>

            <div className="card-table">
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Listing Vehicle</th>
                      <th>Date & Slot</th>
                      <th>Preference</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testDrives.map(td => (
                      <tr key={td.id}>
                        <td>
                          <strong>{td.customer?.name || td.customer?.email}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{td.customer?.phone || td.customer?.email}</div>
                        </td>
                        <td>
                          <strong>{td.listing?.title || 'Vehicle Listing'}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{formatRupees(td.listing?.pricePaise)}</div>
                        </td>
                        <td>
                          <div>{td.requestedDate}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{td.timeSlot}</div>
                        </td>
                        <td>{td.locationPreference}</td>
                        <td>
                          <span className={`badge ${td.status === 'COMPLETED' ? 'badge-success' : td.status === 'CONFIRMED' ? 'badge-info' : 'badge-warning'}`}>
                            {td.status}
                          </span>
                        </td>
                        <td>
                          {td.status === 'REQUESTED' ? (
                            <button
                              className="btn-gold"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                              onClick={async () => {
                                try {
                                  await api.updateTestDriveStatus(user, td.id, 'CONFIRMED');
                                  setSuccessMsg('Test drive appointment confirmed');
                                  void loadAllData(user, true).catch(() => undefined);
                                } catch (e) {
                                  reportError('Failed to confirm test drive');
                                }
                              }}
                            >
                              Confirm
                            </button>
                          ) : td.status === 'CONFIRMED' ? (
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                              onClick={async () => {
                                try {
                                  await api.updateTestDriveStatus(user, td.id, 'COMPLETED');
                                  setSuccessMsg('Test drive marked as completed');
                                  void loadAllData(user, true).catch(() => undefined);
                                } catch (e) {
                                  reportError('Failed to update test drive');
                                }
                              }}
                            >
                              Mark Completed
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Done</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!testDrives.length ? (
                      <tr>
                        <td colSpan={6} className="empty-state">
                          <h3>No buyer test drive requests</h3>
                          <p>Appointments booked by customers on the customer web/app appear here.</p>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {/* ======================================================== */}
        {/* VIEW 12: CAR SERVICE OPERATIONS                           */}
        {/* ======================================================== */}
        {activeTab === 'service' ? (
          <Suspense fallback={<SkeletonRows rows={6} />}>
            <ServiceOperationsPanel
              user={user}
              branches={branches}
              onError={err => reportError(err)}
              onSuccess={msg => setSuccessMsg(msg)}
            />
          </Suspense>
        ) : null}

        {/* ======================================================== */}
        {/* VIEW 13: RENTAL FLEET & OPERATIONS                        */}
        {/* ======================================================== */}
        {activeTab === 'rentals' ? (
          <Suspense fallback={<SkeletonRows rows={6} />}>
            <RentalOperationsPanel
              user={user}
              branches={branches}
              onError={err => reportError(err)}
              onSuccess={msg => setSuccessMsg(msg)}
            />
          </Suspense>
        ) : null}

        {/* ======================================================== */}
        {/* APP HOME CONTENT: banners and hub photos and videos       */}
        {/* ======================================================== */}
        {activeTab === 'homecontent' ? (
          <Suspense fallback={<SkeletonRows rows={6} />}>
            <HomeContentManager user={user} />
          </Suspense>
        ) : null}

        {/* ======================================================== */}
        {/* VIEW 14: TEAM & WORKLOAD                                 */}
        {/* ======================================================== */}
        {activeTab === 'team' ? (
          <div>
            <div className="action-bar">
              <div className="section-heading">
                <h2>Field Inspector Team & Workload Balancing</h2>
                <p>View inspector availability, branch coverage, and active assignment loads across hubs.</p>
              </div>
              <button className="btn-secondary" onClick={() => void loadAllData()} disabled={loading}>
                <IconRefresh />
              </button>
            </div>

            <div className="detail-grid">
              {inspectors.map(ins => (
                <article className="detail-card" key={ins.userId}>
                  <div className="card-header">
                    <div>
                      <strong className="card-title">{ins.displayName || ins.email}</strong>
                      <div className="card-subtitle">{ins.phone || ins.email}</div>
                    </div>
                    <span className={`badge ${ins.activeLoadCount > 3 ? 'badge-danger' : ins.activeLoadCount > 0 ? 'badge-info' : 'badge-success'}`}>
                      {ins.activeLoadCount} Active Jobs
                    </span>
                  </div>

                  <div className="card-body">
                    <div><strong>Assigned Branches:</strong></div>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {ins.branches.map(b => (
                        <span key={b.id} className="badge badge-neutral">{b.name} ({b.city})</span>
                      ))}
                      {!ins.branches.length ? <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>All Branches</span> : null}
                    </div>
                  </div>
                </article>
              ))}
              {!inspectors.length ? (
                <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
                  <h3>No active inspectors found</h3>
                  <p>Assign the INSPECTOR role in the Admin Portal to populate field staff here.</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

      {/* ======================================================== */}
      {/* MODAL: ASSIGN INSPECTOR                                  */}
      {/* ======================================================== */}
      {assignModal.open && assignModal.request ? (
        <div className="modal-overlay">
          <div className="modal-dialog modal-dialog-md">
            <div className="modal-header">
              <h3>Assign Field Inspector</h3>
              <button className="btn-close" onClick={() => setAssignModal({ open: false })}>✕</button>
            </div>
            <form onSubmit={handleAssignSubmit}>
              <div className="modal-body">
                {/* Synced Customer & Sales Appointment Callout */}
                <div style={{
                  padding: '0.85rem',
                  borderRadius: '8px',
                  background: 'rgba(235, 179, 56, 0.12)',
                  border: '1px solid rgba(235, 179, 56, 0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px',
                  marginBottom: '1rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--gold)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                      Customer & Sales Confirmed Appointment
                    </span>
                    <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                      {assignModal.request.timeSlot || assignModal.request.lead.inspectionTimeSlot || 'Flexible'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)' }}>
                    📅 {(assignModal.request.requestedDate || assignModal.request.lead.inspectionDate) ? formatAppointmentDate(assignModal.request.requestedDate || assignModal.request.lead.inspectionDate) : 'Date not finalized'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    📍 {((assignModal.request.locationType || assignModal.request.lead.inspectionLocationType) === 'HOME')
                      ? `Doorstep: ${assignModal.request.address || assignModal.request.lead.inspectionAddress || assignModal.request.lead.city}`
                      : `Hub Inspection (${assignModal.request.lead.city})`}
                  </div>
                  {assignModal.request.notes ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '3px', fontStyle: 'italic' }}>
                      Note from Sales: "{assignModal.request.notes}"
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)', marginBottom: '0.75rem' }}>
                  <div>
                    <strong>{assignModal.request.lead.manufacturingYear} {assignModal.request.lead.make} {assignModal.request.lead.model}{assignModal.request.lead.variant ? ` ${assignModal.request.lead.variant}` : ''}</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                      Seller: {assignModal.request.lead.sellerName} · Ref: {assignModal.request.lead.referenceCode} · City: {assignModal.request.lead.city}
                    </div>
                  </div>
                  {assignModal.request.lead.registrationNumber ? (
                    <span style={{ padding: '2px 8px', background: 'color-mix(in oklab, var(--color-base-content) 8%, transparent)', border: '1px solid var(--border)', borderRadius: '4px', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.5px' }}>
                      {assignModal.request.lead.registrationNumber}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>Plate Pending</span>
                  )}
                </div>

                <div className="form-group">
                  <label>Select Inspector</label>
                  <select
                    className="form-select"
                    value={assignInspectorId}
                    onChange={e => setAssignInspectorId(e.target.value)}
                    required
                  >
                    <option value="">Select an inspector...</option>
                    {assignableInspectors.map(ins => (
                      <option key={ins.userId} value={ins.userId}>
                        {ins.displayName || ins.email} ({ins.activeLoadCount} active jobs)
                      </option>
                    ))}
                  </select>
                  {assignableInspectors.length === 0 && (
                    <div role="alert" style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-warning)', fontWeight: 600 }}>
                      No active inspector is assigned to this request's branch{assignModal.request.lead.city ? ` (${assignModal.request.lead.city})` : ''}. Add an inspector to that branch in the Admin portal, then reopen this dialog.
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>Scheduled Date & Time Slot</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={assignDate}
                    onChange={e => setAssignDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Evaluation Location</label>
                  <select
                    className="form-select"
                    value={assignLocationType}
                    onChange={e => setAssignLocationType(e.target.value as 'HUB' | 'HOME')}
                  >
                    <option value="HUB">V MOTIV Inspection Hub</option>
                    <option value="HOME">Customer Doorstep (HOME)</option>
                  </select>
                </div>

                {assignLocationType === 'HOME' ? (
                  <div className="form-group">
                    <label>Doorstep Address</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Full doorstep address..."
                      value={assignAddress}
                      onChange={e => setAssignAddress(e.target.value)}
                      required
                    />
                  </div>
                ) : null}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setAssignModal({ open: false })}>Cancel</button>
                <Button type="submit" loading={loading}>Confirm Assignment</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ======================================================== */}
      {/* MODAL: DOCUMENT STATUS UPDATE                            */}
      {/* ======================================================== */}
      {docModal.open ? (
        <div className="modal-overlay">
          <div className="modal-dialog modal-dialog-lg">
            <div className="modal-header">
              <h3>{docModal.docTypes && docModal.docTypes.length > 1 ? `Update ${docModal.docTypes.length} Documents` : `Verify Document: ${(docModal.docTypes?.[0] ?? docModal.docType)?.replace(/_/g, ' ')}`}</h3>
              <button className="btn-close" onClick={() => setDocModal({ open: false })}>✕</button>
            </div>
            <form onSubmit={handleDocUpdate}>
              <div className="modal-body">
                {docModal.docTypes && docModal.docTypes.length > 1 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                    Applies to: <strong style={{ color: 'var(--text)' }}>{docModal.docTypes.map(t => t.replace(/_/g, ' ')).join(', ')}</strong>. The same status and notes are recorded on each.
                  </div>
                ) : null}
                <div className="form-group">
                  <label>Document Status</label>
                  <select
                    className="form-select"
                    value={docStatus}
                    onChange={e => setDocStatus(e.target.value)}
                    required
                  >
                    <option value="RECEIVED">RECEIVED (Document collected)</option>
                    <option value="UNDER_REVIEW">UNDER_REVIEW (Verifying authenticity)</option>
                    <option value="VERIFIED">VERIFIED (Valid & clear title)</option>
                    <option value="REJECTED">REJECTED (Illegible / Fake / Discrepancy)</option>
                    <option value="WAIVED_BY_AUTHORIZED_POLICY">WAIVED_BY_AUTHORIZED_POLICY (Policy exemption)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Reviewer Verification Notes</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Enter document verification details, registration checks, or discrepancy notes..."
                    value={docNotes}
                    onChange={e => setDocNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setDocModal({ open: false })}>Cancel</button>
                <Button type="submit" loading={loading}>{docModal.docTypes && docModal.docTypes.length > 1 ? `Update ${docModal.docTypes.length} Documents` : 'Update Document Status'}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ======================================================== */}
      {/* MODAL: RECORD HANDOVER                                   */}
      {/* ======================================================== */}
      {handoverModal.open && handoverModal.caseItem ? (
        <div className="modal-overlay">
          <div className="modal-dialog modal-dialog-md">
            <div className="modal-header">
              <h3>Record Physical Handover & Custody</h3>
              <button className="btn-close" onClick={() => setHandoverModal({ open: false })}>✕</button>
            </div>
            <form onSubmit={handleHandoverSubmit}>
              <div className="modal-body">
                <div>
                  <strong>{handoverModal.caseItem.lead.manufacturingYear} {handoverModal.caseItem.lead.make} {handoverModal.caseItem.lead.model}{handoverModal.caseItem.lead.variant ? ` ${handoverModal.caseItem.lead.variant}` : ''}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Seller: {handoverModal.caseItem.lead.sellerName} · Agreed Price: {formatRupees(handoverModal.caseItem.offer.offerAmountPaise)} · {[handoverModal.caseItem.lead.fuelType, handoverModal.caseItem.lead.transmission, handoverModal.caseItem.lead.color].filter(Boolean).join(' · ')}
                  </div>
                </div>

                <div className="form-group">
                  <label>Receiving Branch</label>
                  <select
                    className="form-select"
                    value={handoverBranchId}
                    onChange={e => setHandoverBranchId(e.target.value)}
                    required
                  >
                    <option value="">Select the branch receiving custody</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name} · {branch.city}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    Saving confirmed custody creates the stock unit for QC and Listing Studio. It does not publish to customers.
                  </span>
                </div>

                <div className="form-group">
                  <label>Registration Plate Number</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. KA 01 AB 1234"
                    value={handoverRegNumber}
                    onChange={e => setHandoverRegNumber(e.target.value)}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    Registration plate attached to the vehicle stock record.
                  </span>
                </div>

                <div className="form-group">
                  <label>Hub Handover Location</label>
                  <input
                    type="text"
                    className="form-input"
                    value={handoverLocation}
                    onChange={e => setHandoverLocation(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Actual Odometer Reading at Custody (km)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={handoverOdometer}
                    onChange={e => setHandoverOdometer(Number(e.target.value))}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label>Main Keys Count</label>
                    <input
                      type="number"
                      className="form-input"
                      value={handoverMainKeys}
                      onChange={e => setHandoverMainKeys(Number(e.target.value))}
                      min={0}
                      max={10}
                    />
                  </div>
                  <div className="form-group">
                    <label>Spare Keys Count</label>
                    <input
                      type="number"
                      className="form-input"
                      value={handoverSpareKeys}
                      onChange={e => setHandoverSpareKeys(Number(e.target.value))}
                      min={0}
                      max={10}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="chk-docs"
                    checked={handoverDocsReceived}
                    onChange={e => setHandoverDocsReceived(e.target.checked)}
                  />
                  <label htmlFor="chk-docs" style={{ fontWeight: 500 }}>Original RC and seller authority documents physically received and stored in vault</label>
                </div>

                <div className="form-group">
                  <label>Physical Condition & Accessories Notes</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Note spare tire, tool kit, jack, user manuals, minor handover scratches..."
                    value={handoverCondition}
                    onChange={e => setHandoverCondition(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setHandoverModal({ open: false })}>Cancel</button>
                <Button type="submit" loading={loading}>Save Custody Record</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ======================================================== */}
      {/* MODAL: STOCK INWARD                                      */}
      {/* ======================================================== */}
      {stockInwardModal.open && stockInwardModal.caseItem ? (
        <div className="modal-overlay">
          <div className="modal-dialog modal-dialog-md">
            <div className="modal-header">
              <h3>Establish Acquired Vehicle Stock</h3>
              <button className="btn-close" onClick={() => setStockInwardModal({ open: false })}>✕</button>
            </div>
            <form onSubmit={handleStockInwardSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  Acquisition gates verified. Establishing canonical stock unit in V MOTIV inventory.
                </p>

                <div className="form-group">
                  <label>Inventory Branch</label>
                  <select
                    className="form-input"
                    value={inwardBranchId}
                    onChange={e => setInwardBranchId(e.target.value)}
                    required
                  >
                    <option value="" disabled>Select a branch</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name} ({branch.city})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Physical Hub / Bay Location</label>
                  <input
                    type="text"
                    className="form-input"
                    value={inwardLocation}
                    onChange={e => setInwardLocation(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Stock Inward Notes</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Enter parking bay, key tag ID, intake notes..."
                    value={inwardNotes}
                    onChange={e => setInwardNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setStockInwardModal({ open: false })}>Cancel</button>
                <Button type="submit" loading={loading} disabled={!inwardBranchId}>Inward Vehicle to Stock</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ======================================================== */}
      {/* MODAL: EDIT VEHICLE SPECS & REGISTRATION                 */}
      {/* ======================================================== */}
      {specsModal.open && specsModal.stockItem ? (
        <div className="modal-overlay">
          <div className="modal-dialog modal-dialog-md">
            <div className="modal-header">
              <h3>Edit Vehicle Specs & Registration Plate</h3>
              <button className="btn-close" onClick={() => setSpecsModal({ open: false, registrationNumber: '', variant: '', bodyType: '', color: '', odometerKm: 0 })}>✕</button>
            </div>
            <form onSubmit={handleSaveSpecs}>
              <div className="modal-body">
                <div>
                  <strong>Stock: {specsModal.stockItem.stockCode}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    {specsModal.stockItem.manufacturingYear} {specsModal.stockItem.make} {specsModal.stockItem.model}
                  </div>
                </div>

                <div className="form-group">
                  <label>Registration Number (Plate) *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. KA-02-VM-1023"
                    value={specsModal.registrationNumber}
                    onChange={e => setSpecsModal({ ...specsModal, registrationNumber: e.target.value.toUpperCase() })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Variant</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. SX (O), Titanium, VXi"
                    value={specsModal.variant}
                    onChange={e => setSpecsModal({ ...specsModal, variant: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Body type</label>
                  <select
                    className="form-select"
                    value={specsModal.bodyType}
                    onChange={e => setSpecsModal({ ...specsModal, bodyType: e.target.value })}
                  >
                    <option value="">Detect from make and model</option>
                    {bodyTypeOptions.map(option => <option key={option.code} value={option.code}>{option.name}</option>)}
                  </select>
                  <small className="helper">Customers filter cars by this (Hatchback, Sedan, SUV…). Leave it on automatic unless the car is an exception.</small>
                </div>

                <div className="form-group">
                  <label>Exterior Color</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Polar White, Phantom Black"
                    value={specsModal.color}
                    onChange={e => setSpecsModal({ ...specsModal, color: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Odometer (Kilometres)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={specsModal.odometerKm}
                    onChange={e => setSpecsModal({ ...specsModal, odometerKm: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSpecsModal({ open: false, registrationNumber: '', variant: '', bodyType: '', color: '', odometerKm: 0 })}
                >
                  Cancel
                </button>
                <Button type="submit" loading={loading}>
                  {loading ? 'Saving…' : 'Save Vehicle Specs'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ======================================================== */}
      {/* MODAL: CREATE WORK ORDER                                 */}
      {/* ======================================================== */}
      {workOrderModal.open && workOrderModal.stockItem ? (
        <div className="modal-overlay">
          <div className="modal-dialog modal-dialog-md">
            <div className="modal-header">
              <h3>Create Refurbishment Work Order</h3>
              <button className="btn-close" onClick={() => setWorkOrderModal({ open: false })}>✕</button>
            </div>
            <form onSubmit={handleCreateWorkOrder}>
              <div className="modal-body">
                <div>
                  <strong>Stock: {workOrderModal.stockItem.stockCode}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    {workOrderModal.stockItem.make} {workOrderModal.stockItem.model} ({workOrderModal.stockItem.registrationNumber || 'N/A'})
                  </div>
                </div>

                <div className="form-group">
                  <label>Repair Category</label>
                  <select
                    className="form-select"
                    value={woCategory}
                    onChange={e => setWoCategory(e.target.value)}
                  >
                    <option value="MECHANICAL">MECHANICAL (Engine, brakes, suspension)</option>
                    <option value="BODY_PAINT">BODY & PAINT (Dent removal, repaint, touchups)</option>
                    <option value="INTERIOR_DETAILING">INTERIOR & DETAILING (Deep cleaning, upholstery)</option>
                    <option value="ELECTRICAL">ELECTRICAL (Sensors, battery, infotainment)</option>
                    <option value="TIRES">TIRES & WHEELS (Replacement, alignment)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Required Action</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Describe specific repair work required..."
                    value={woAction}
                    onChange={e => setWoAction(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Assigned Workshop Provider</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Bosch Authorized Service Hub"
                    value={woProvider}
                    onChange={e => setWoProvider(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Estimated Cost (Paise, e.g. 500000 = ₹5,000)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={woCost}
                    onChange={e => setWoCost(e.target.value)}
                    required
                  />
                  <small style={{ color: 'var(--muted)' }}>Equivalent to {formatRupees(woCost)}</small>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setWorkOrderModal({ open: false })}>Cancel</button>
                <Button type="submit" loading={loading}>Create Work Order</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ======================================================== */}
      {/* MODAL: EDIT & RESUBMIT REJECTED COST                     */}
      {/* ======================================================== */}
      {editCostModal.open && editCostModal.wo ? (
        <div className="modal-overlay">
          <div className="modal-dialog modal-dialog-md">
            <div className="modal-header">
              <h3>Edit &amp; Resubmit Cost Estimate</h3>
              <button className="btn-close" onClick={() => setEditCostModal({ open: false })}>✕</button>
            </div>
            <form onSubmit={handleEditAndResubmitCost}>
              <div className="modal-body">
                <div
                  style={{
                    background: 'rgba(220, 53, 69, 0.1)',
                    border: '1px solid rgba(220, 53, 69, 0.4)',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    marginBottom: '1rem',
                  }}
                >
                  <strong style={{ color: 'var(--danger)' }}>Previous Cost Rejected</strong>
                  {editCostModal.wo.costApproval?.reason && (
                    <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '4px 0 0' }}>
                      Reason: {editCostModal.wo.costApproval.reason}
                    </p>
                  )}
                </div>

                <div style={{ marginBottom: '0.75rem', fontSize: '0.88rem', color: 'var(--muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>{editCostModal.wo.category}</strong>
                  <div>{editCostModal.wo.requiredAction}</div>
                  {editCostModal.wo.assignedProvider && <div>Provider: {editCostModal.wo.assignedProvider}</div>}
                </div>

                <div className="form-group">
                  <label>Revised Estimated Cost (₹ Rupees)</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="e.g. 4500"
                    value={editCostValue}
                    onChange={e => setEditCostValue(e.target.value)}
                    min="1"
                    step="1"
                    required
                  />
                  <small style={{ color: 'var(--muted)' }}>
                    Previous estimate: {formatRupees(editCostModal.wo.estimatedCostPaise)}
                    {editCostValue && !isNaN(Number(editCostValue)) && Number(editCostValue) > 0 && (
                      <> &rarr; New: &#8377;{Number(editCostValue).toLocaleString('en-IN')}</>
                    )}
                  </small>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditCostModal({ open: false })}>Cancel</button>
                <Button type="submit" loading={loading}>Resubmit for Approval</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ======================================================== */}
      {/* MODAL: RECORD QC                                         */}
      {/* ======================================================== */}
      {qcModal.open && qcModal.stockItem ? (
        <div className="modal-overlay">
          <div className="modal-dialog modal-dialog-md">
            <div className="modal-header">
              <h3>Independent Quality Control Sign-Off</h3>
              <button className="btn-close" onClick={() => setQcModal({ open: false })}>✕</button>
            </div>
            <form onSubmit={handleQcSubmit}>
              <div className="modal-body">
                <div>
                  <strong>Stock: {qcModal.stockItem.stockCode}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    {qcModal.stockItem.make} {qcModal.stockItem.model} ({qcModal.stockItem.physicalLocation})
                  </div>
                </div>

                <div className="form-group">
                  <label>QC Decision</label>
                  <select
                    className="form-select"
                    value={qcDecision}
                    onChange={e => setQcDecision(e.target.value as 'PASS' | 'REWORK_REQUIRED' | 'FAIL')}
                  >
                    <option value="PASS">PASS (Advances vehicle to LISTING_PREPARATION)</option>
                    <option value="REWORK_REQUIRED">REWORK_REQUIRED (Returns to workshop for corrections)</option>
                    <option value="FAIL">FAIL (Major defect unresolved - put ON_HOLD)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Inspection Findings & Checklist Review</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Enter quality verification findings across paint finish, alignment, mechanical sounds, interior detailing..."
                    value={qcFindings}
                    onChange={e => setQcFindings(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setQcModal({ open: false })}>Cancel</button>
                <Button type="submit" loading={loading}>Submit QC Decision</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ======================================================== */}
      {/* MODAL: LISTING STUDIO                                    */}
      {/* ======================================================== */}
      {studioModal.open && studioModal.stockItem ? (() => {
        const isStudioListed = studioModal.stockItem.status === 'LISTED';
        const savedPhotoCount = studioPhotos.split('\n').filter(u => u.trim().length > 5).length;
        const studioGaps = computeListingGaps({
          title: studioTitle,
          photoCount: savedPhotoCount + stagedStudioFiles.length,
          color: studioColor,
          registrationNumber: studioRegistration,
          conditionSummary: studioSummary,
          branchId: studioBranchId,
          price: isStudioListed ? studioPrice : 'n/a',
        });
        return (
        <div className="modal-overlay">
          <div className="modal-dialog modal-dialog-lg">
            <div className="modal-header">
              <h3>{isStudioListed ? 'Edit Live Listing' : 'Listing Studio Specifications'}</h3>
              <button className="btn-close" onClick={closeStudioModal}>✕</button>
            </div>
            <form onSubmit={handleStudioSubmit}>
              <div className="modal-body">
                {isStudioListed ? (
                  <div className="studio-live-note">
                    <strong>This car is live on the marketplace.</strong>
                    <div>Changes you save here appear to customers straight away. A live listing must always stay complete, so a save is refused if it would leave anything below missing.</div>
                  </div>
                ) : null}
                <div className={`studio-checklist ${studioGaps.length ? 'is-incomplete' : 'is-complete'}`} role="status">
                  <strong>{studioGaps.length ? `Still needed before this can be published (${studioGaps.length})` : 'Everything customers need is filled in'}</strong>
                  {studioGaps.length ? <ul>{studioGaps.map(g => <li key={g}>{g}</li>)}</ul> : null}
                </div>

                <div className="form-group">
                  <label>Showroom Hub / Branch *</label>
                  <select
                    className="form-select"
                    value={studioBranchId}
                    onChange={e => setStudioBranchId(e.target.value)}
                    required
                  >
                    <option value="">Select Showroom Branch *</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.city}) {b.code ? `· [${b.code}]` : ''}
                      </option>
                    ))}
                  </select>
                  <small style={{ color: 'var(--muted)' }}>Branch where this vehicle is physically housed and listed.</small>
                </div>

                <div className="form-group">
                  <label>Public Vehicle Title</label>
                  <input
                    type="text"
                    className="form-input"
                    value={studioTitle}
                    onChange={e => setStudioTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Exterior Color</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Polar White, Phantom Black"
                    value={studioColor}
                    onChange={e => setStudioColor(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Registration number</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. KA01AB1234"
                    value={studioRegistration}
                    onChange={e => setStudioRegistration(e.target.value.toUpperCase())}
                  />
                </div>

                {isStudioListed ? (
                  <div className="form-group">
                    <label>Retail price (₹)</label>
                    <input
                      type="number"
                      min={1}
                      className="form-input"
                      value={studioPrice}
                      onChange={e => setStudioPrice(e.target.value)}
                    />
                  </div>
                ) : null}

                <div className="form-group">
                  <label>Condition & Highlight Summary</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Enter vehicle highlight summary for prospective buyers..."
                    value={studioSummary}
                    onChange={e => setStudioSummary(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="listing-photos">Retail vehicle photos</label>
                  <input
                    id="listing-photos"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={e => {
                      handleStudioPhotoSelect(e.target.files);
                      e.target.value = '';
                    }}
                    disabled={studioUploading || loading}
                  />
                  <small style={{ color: 'var(--muted)' }}>
                    {studioUploading
                      ? 'Uploading staged photos securely to Cloudinary & saving listing…'
                      : 'Select photos to stage locally. Photos will ONLY be uploaded to Cloudinary when you click "Save Studio Specifications".'}
                  </small>

                  {/* Staged photos awaiting save */}
                  {stagedStudioFiles.length > 0 ? (
                    <div style={{ marginTop: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.78rem', color: 'var(--yellow)', fontWeight: 600 }}>
                        <span>⏳ Pending Upload ({stagedStudioFiles.length} photo{stagedStudioFiles.length === 1 ? '' : 's'} staged - will upload on save):</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {stagedStudioFiles.map((staged, sIdx) => (
                          <div key={staged.id} style={{ position: 'relative', border: '2px dashed var(--yellow)', borderRadius: 8, padding: 2, background: 'color-mix(in oklab, var(--color-primary) 5%, transparent)' }}>
                            <img src={staged.previewUrl} alt={`Staged photo ${sIdx + 1}`} style={{ width: 92, height: 64, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                            <button
                              type="button"
                              aria-label={`Discard staged photo ${sIdx + 1}`}
                              onClick={() => removeStagedStudioPhoto(staged.id)}
                              style={{ position: 'absolute', top: -7, right: -7, borderRadius: 99, border: 0, width: 22, height: 22, cursor: 'pointer', background: 'var(--red, var(--color-error))', color: '#fff', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              ×
                            </button>
                            <span style={{ position: 'absolute', bottom: 4, left: 4, background: 'var(--scrim)', color: 'var(--yellow)', fontSize: '0.62rem', padding: '1px 4px', borderRadius: 3 }}>
                              Staged
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Existing Saved Photos */}
                  {studioPhotos ? (
                    <div style={{ marginTop: '0.75rem' }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.4rem', fontWeight: 600 }}>
                        Current Saved Photos ({studioPhotos.split('\n').filter(Boolean).length}):
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {studioPhotos.split('\n').filter(Boolean).map((url, index) => (
                          <div key={url} style={{ position: 'relative' }}>
                            <img src={url} alt={`Listing photo ${index + 1}`} style={{ width: 92, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                            {(
                              <button
                                type="button"
                                aria-label={`Remove listing photo ${index + 1}`}
                                onClick={() => setStudioPhotos(current => current.split('\n').filter(item => item !== url).join('\n'))}
                                style={{ position: 'absolute', top: -7, right: -7, borderRadius: 99, border: 0, width: 22, height: 22, cursor: 'pointer', background: 'var(--red, var(--color-error))', color: '#fff', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                ×
                              </button>
                            )}
                            {index > 0 ? (
                              <button
                                type="button"
                                title="Make Primary / Hero Photo"
                                onClick={() => {
                                  const photos = studioPhotos.split('\n').filter(Boolean);
                                  const reordered = [url, ...photos.filter(p => p !== url)];
                                  setStudioPhotos(reordered.join('\n'));
                                }}
                                style={{ position: 'absolute', bottom: 4, left: 4, background: 'var(--scrim)', color: 'var(--yellow)', border: '1px solid var(--border)', borderRadius: 4, fontSize: '0.65rem', padding: '1px 5px', cursor: 'pointer' }}
                              >
                                ★ Cover
                              </button>
                            ) : index === 0 ? (
                              <span style={{ position: 'absolute', bottom: 4, left: 4, background: 'color-mix(in oklab, var(--color-primary) 90%, transparent)', color: '#000', fontWeight: 700, borderRadius: 4, fontSize: '0.65rem', padding: '1px 5px' }}>
                                Cover
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button type="button" className="btn-secondary" onClick={closeStudioModal}>
                  Cancel
                </button>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {isStudioListed && studioModal.stockItem.vehicle?.listing?.id && MARKETPLACE_URL ? (
                    <a
                      href={`${MARKETPLACE_URL}/${studioModal.stockItem.vehicle.listing.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary"
                      style={{ textDecoration: 'none' }}
                    >
                      ↗ View listing
                    </a>
                  ) : null}
                  <Button type="submit" loading={loading} disabled={studioUploading}>
                    {studioUploading
                      ? 'Uploading photos & saving…'
                      : isStudioListed
                      ? 'Save changes to live listing'
                      : stagedStudioFiles.length > 0
                      ? `Upload & Save (${stagedStudioFiles.length} Staged Photo${stagedStudioFiles.length === 1 ? '' : 's'})`
                      : 'Save Studio Specifications'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
        );
      })() : null}

      {/* ======================================================== */}
      {/* MODAL: PUBLISH LISTING                                   */}
      {/* ======================================================== */}
      {publishModal.open && publishModal.stockItem ? (
        <div className="modal-overlay">
          <div className="modal-dialog modal-dialog-md">
            <div className="modal-header">
              <h3>Approve Retail Price & Publish</h3>
              <button className="btn-close" onClick={() => setPublishModal({ open: false })}>✕</button>
            </div>
            <form onSubmit={handlePublishSubmit}>
              <div className="modal-body">
                <div>
                  <strong>{publishModal.stockItem.vehicle?.listing?.title || `${publishModal.stockItem.manufacturingYear} ${publishModal.stockItem.make} ${publishModal.stockItem.model}`}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Stock Code: {publishModal.stockItem.stockCode} · Acquired Cost: {formatRupees(publishModal.stockItem.acquisitionCostPaise)}
                  </div>
                </div>

                <div className="form-group">
                  <label>Retail Asking Price (in ₹ Rupees)</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="e.g. 1250000 for ₹12.50 Lakh"
                    value={publishRetailPrice}
                    onChange={e => setPublishRetailPrice(e.target.value)}
                    required
                  />
                  {publishRetailPrice ? (
                    <small style={{ color: 'var(--success)', fontWeight: 600 }}>
                      Formatted: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(publishRetailPrice))}
                    </small>
                  ) : null}
                </div>

                <div className="form-group">
                  <label>Showroom Hub / Branch for Marketplace Listing *</label>
                  <select
                    className="form-select"
                    value={publishBranchId}
                    onChange={e => setPublishBranchId(e.target.value)}
                    required
                  >
                    <option value="">Select Showroom Branch *</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.city}) {b.code ? `· [${b.code}]` : ''}
                      </option>
                    ))}
                  </select>
                  <small style={{ color: 'var(--muted)' }}>
                    This vehicle will be published to the customer marketplace and tied to this showroom branch.
                  </small>
                </div>

                {publishModal.stockItem.listingGaps?.length ? (
                  <div className="studio-checklist is-incomplete" role="alert">
                    <strong>Cannot publish yet. Still needed in Listing Studio:</strong>
                    <ul>{publishModal.stockItem.listingGaps.map(g => <li key={g.key}>{g.label}</li>)}</ul>
                    <button type="button" className="btn-secondary" style={{ marginTop: '0.5rem' }} onClick={() => { const item = publishModal.stockItem!; setPublishModal({ open: false }); openStudioModal(item); }}>
                      Open Listing Studio
                    </button>
                  </div>
                ) : (
                  <div className="studio-checklist is-complete">
                    <strong>Listing is complete.</strong> Title, photos, colour, registration, condition summary and branch are all filled in.
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setPublishModal({ open: false })}>Cancel</button>
                <Button type="submit" loading={loading}>Publish to Marketplace</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ======================================================== */}
      {/* MODAL: DELIVER VEHICLE                                   */}
      {/* ======================================================== */}
      {deliveryModal.open && deliveryModal.stockItem ? (
        <div className="modal-overlay">
          <div className="modal-dialog modal-dialog-md">
            <div className="modal-header">
              <h3>Customer Delivery Handover</h3>
              <button className="btn-close" onClick={() => setDeliveryModal({ open: false })}>✕</button>
            </div>
            <form onSubmit={handleDeliverySubmit}>
              <div className="modal-body">
                <div>
                  <strong>{deliveryModal.stockItem.make} {deliveryModal.stockItem.model} ({deliveryModal.stockItem.stockCode})</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Registration: {deliveryModal.stockItem.registrationNumber || 'N/A'} · Odometer: {deliveryModal.stockItem.odometerKm.toLocaleString()} km
                  </div>
                </div>

                <div className="form-group">
                  <label>Buyer Full Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter purchasing customer name"
                    value={buyerName}
                    onChange={e => setBuyerName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Buyer Phone Number</label>
                  <input
                    type="tel"
                    className="form-input"
                    placeholder="+91 98765 43210"
                    value={buyerPhone}
                    onChange={e => setBuyerPhone(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Handover & Delivery Notes</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Confirm keys handed over, delivery checklist signed, receipt verified..."
                    value={deliveryNotes}
                    onChange={e => setDeliveryNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setDeliveryModal({ open: false })}>Cancel</button>
                <Button type="submit" loading={loading}>Complete Buyer Delivery</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ======================================================== */}
      {/* MODAL: VIEW BUYER DETAILS (SOLD VEHICLE)                  */}
      {/* ======================================================== */}
      {viewBuyerModal.open && viewBuyerModal.stockItem ? (
        <div className="modal-overlay">
          <div className="modal-dialog modal-dialog-md">
            <div className="modal-header">
              <h3>Buyer & Handover Information</h3>
              <button className="btn-close" onClick={() => setViewBuyerModal({ open: false })}>✕</button>
            </div>
            <div className="modal-body">
              <div>
                <strong>{viewBuyerModal.stockItem.make} {viewBuyerModal.stockItem.model} ({viewBuyerModal.stockItem.stockCode})</strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  Registration: {viewBuyerModal.stockItem.registrationNumber || 'N/A'} · Odometer: {viewBuyerModal.stockItem.odometerKm.toLocaleString()} km
                </div>
              </div>

              <div style={{ padding: '0.9rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Lifecycle Status:</span>
                  <span className="badge badge-purple">SOLD & DELIVERED</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Buyer Full Name:</span>
                  <strong style={{ color: 'var(--yellow)', fontSize: '0.95rem' }}>
                    {viewBuyerModal.stockItem.deliveryRecord?.buyerName ||
                     (viewBuyerModal.stockItem.notes?.match(/\[DELIVERY to ([^(\]]+)/)?.[1]?.trim()) ||
                     'Verified Customer'}
                  </strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Buyer Phone Number:</span>
                  <strong style={{ color: 'var(--text)' }}>
                    {viewBuyerModal.stockItem.deliveryRecord?.buyerPhone ||
                     (viewBuyerModal.stockItem.notes?.match(/\(([+0-9\s]+)\)\]/)?.[1]?.trim()) ||
                     'Recorded in Audit Log'}
                  </strong>
                </div>

                {viewBuyerModal.stockItem.deliveryRecord?.deliveredAt ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Delivery Date:</span>
                    <span style={{ color: 'var(--text)', fontSize: '0.85rem' }}>
                      {formatDate(viewBuyerModal.stockItem.deliveryRecord.deliveredAt)}
                    </span>
                  </div>
                ) : null}

                {viewBuyerModal.stockItem.deliveryRecord?.deliveredBy ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Handover Handled By:</span>
                    <span style={{ color: 'var(--text)', fontSize: '0.85rem' }}>
                      {viewBuyerModal.stockItem.deliveryRecord.deliveredBy}
                    </span>
                  </div>
                ) : null}
              </div>

              {viewBuyerModal.stockItem.notes ? (
                <div className="form-group">
                  <label>Handover & Delivery Notes</label>
                  <div style={{ padding: '0.75rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.82rem', whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
                    {viewBuyerModal.stockItem.notes}
                  </div>
                </div>
              ) : null}

              <div style={{ padding: '0.65rem 0.85rem', background: 'color-mix(in oklab, var(--color-success) 8%, transparent)', border: '1px solid color-mix(in oklab, var(--color-success) 30%, transparent)', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--success)' }}>
                ✓ Physical handover finalized and registered in immutable AuditEvent compliance log.
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setViewBuyerModal({ open: false })}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
mountLiveChangeBar({ dispatch: 'Inspections, acquisitions & test drives', rentals: 'Rental bookings & payments', service: 'Service requests & estimates' });
