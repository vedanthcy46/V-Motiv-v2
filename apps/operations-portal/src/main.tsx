import { useEffect, useMemo, useRef, useState, type FC, type FormEvent } from 'react';
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
import { api, ApiError } from './api';
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
  IconSearch,
  IconStudio,
} from './icons';
import './styles.css';

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
  | 'team';

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

  const submit = async (e: FormEvent) => {
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
          <button type="button" className="btn-close" onClick={onClose} aria-label="Close">
            <IconCross />
          </button>
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
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--muted)' }}>
                6-digit Verification Code *
              </label>
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
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
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
      <main className="auth-shell">
        <section className="auth-panel">
          <img className="auth-logo" src="/brand/vmotiv-logo.svg" alt="V MOTIV" />
          <p className="eyebrow">OPERATIONS & FLEET MANAGEMENT PORTAL</p>
          <h1>Authorized Operations Workspace</h1>
          <p>
            Sign in with your authorized V MOTIV corporate Google account to coordinate physical inspections, custody handover, refurbishment, QC, and retail delivery.
          </p>
          <div className="auth-actions">
            {firebaseConfigured ? (
              <button
                type="button"
                className="btn-primary"
                onClick={login}
                disabled={busy}
                style={{ minHeight: '44px', padding: '0.75rem 1.75rem', fontSize: '0.95rem' }}
              >
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
            <span className="kicker">Workflow 01 · Inspection & Handover</span>
            <strong>Dispatch & Vehicle Custody</strong>
            <span>Inspector dispatch, documentation verification, physical handover with digital custody gate.</span>
          </div>
          <div>
            <span className="kicker">Workflow 02 · Refurbishment & QC</span>
            <strong>Workshop & Studio Certification</strong>
            <span>Multi-category repair work orders, independent quality control audit, 360° studio photography.</span>
          </div>
          <div>
            <span className="kicker">Workflow 03 · Retail & Fulfillment</span>
            <strong>Publication & Customer Handover</strong>
            <span>Verified retail listing publication, showroom test drive coordination, and secure vehicle delivery.</span>
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

export const App: FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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

  // Modals
  const [assignModal, setAssignModal] = useState<{ open: boolean; request?: InspectionRequest }>({ open: false });
  const [assignInspectorId, setAssignInspectorId] = useState('');
  const [assignDate, setAssignDate] = useState('');
  const [assignLocationType, setAssignLocationType] = useState<'HUB' | 'HOME'>('HUB');
  const [assignAddress, setAssignAddress] = useState('');

  const [docModal, setDocModal] = useState<{ open: boolean; caseId?: string; docType?: string; currentStatus?: string }>({ open: false });
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
    color: string;
    odometerKm: number;
  }>({ open: false, registrationNumber: '', variant: '', color: '', odometerKm: 0 });

  const [branches, setBranches] = useState<Branch[]>([]);
  const [studioModal, setStudioModal] = useState<{ open: boolean; stockItem?: VehicleStockUnit }>({ open: false });
  const [studioFilter, setStudioFilter] = useState<'ALL' | 'PREPARATION' | 'READY' | 'LISTED'>('ALL');
  const [studioTitle, setStudioTitle] = useState('');
  const [studioColor, setStudioColor] = useState('');
  const [studioSummary, setStudioSummary] = useState('');
  const [studioPhotos, setStudioPhotos] = useState('');
  const [studioUploading, setStudioUploading] = useState(false);
  const [studioBranchId, setStudioBranchId] = useState('');

  const [publishModal, setPublishModal] = useState<{ open: boolean; stockItem?: VehicleStockUnit }>({ open: false });
  const [publishRetailPrice, setPublishRetailPrice] = useState<string>('');
  const [publishBranchId, setPublishBranchId] = useState('');

  const openStudioModal = (stockItem: VehicleStockUnit) => {
    setStudioTitle(stockItem.vehicle?.listing?.title || `${stockItem.manufacturingYear} ${stockItem.make} ${stockItem.model} ${stockItem.variant || ''}`.trim());
    setStudioColor(stockItem.vehicle?.color || '');
    setStudioSummary(stockItem.vehicle?.conditionSummary || '');
    setStudioBranchId(stockItem.branchId || stockItem.branch?.id || (branches[0]?.id ?? ''));
    setStudioPhotos((stockItem.vehicle?.listing?.media || []).map(m => m.url).join('\n'));
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

  // Auto-clear notification
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // Auth observer
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, u => {
      setUser(u);
      if (u) void loadAllData(u);
    });
  }, []);

  const loadAllData = async (u = user) => {
    if (!u) return;
    setLoading(true);
    setError(null);
    setLoadWarning(null);
    try {
      const unavailable: string[] = [];
      const load = async <T,>(label: string, request: Promise<T>, fallback: T): Promise<T> => {
        try {
          return await request;
        } catch {
          unavailable.push(label);
          return fallback;
        }
      };
      const [m, r, ins, c, inv, td, br] = await Promise.all([
        load('dashboard', api.dashboard(u), null),
        load('inspection dispatch', api.inspectionRequests(u), []),
        load('inspector availability', api.inspectors(u), []),
        load('acquisitions', api.acquisitions(u), []),
        load('inventory', api.inventory(u), []),
        load('test drives', api.testDrives(u), { items: [] }),
        load('branches', api.branches(u), []),
      ]);
      setMetrics(m);
      setRequests(r);
      setInspectors(ins);
      setCases(c);
      setInventory(inv);
      setTestDrives(Array.isArray(td) ? td : td?.items || []);
      setBranches(br || []);
      if (unavailable.length) setLoadWarning(`Some live data could not be loaded: ${unavailable.join(', ')}. Retry after checking the API connection.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operations data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || activeTab !== 'dispatch') return;
    const refresh = window.setInterval(() => void loadAllData(user), 30_000);
    return () => window.clearInterval(refresh);
  }, [user, activeTab]);

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
          setError('A date and time are required to reschedule an inspection.');
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
      await loadAllData();
    } catch (err) {
      setError(err instanceof ApiError ? `Error: ${err.code}` : 'Assignment failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDocUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !docModal.caseId || !docModal.docType) return;
    setLoading(true);
    setError(null);
    try {
      await api.updateDocument(user, docModal.caseId, {
        documentType: docModal.docType,
        status: docStatus,
        notes: docNotes || undefined,
      });
      setSuccessMsg(`Document ${docModal.docType} updated to ${docStatus}`);
      setDocModal({ open: false });
      await loadAllData();
    } catch (err) {
      setError(err instanceof ApiError ? `Document Error: ${err.code}` : 'Update failed');
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
      await loadAllData();
      setActiveTab('inventory');
    } catch (err) {
      setError(err instanceof ApiError ? `Handover Error: ${err.code}` : 'Handover failed');
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
      await loadAllData();
    } catch (err) {
      setError(err instanceof ApiError ? `Gate Error: ${err.code}` : 'Acquisition completion failed');
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
      await loadAllData();
      setActiveTab('inventory');
    } catch (err) {
      setError(err instanceof ApiError ? `Stock Inward Error: ${err.code}` : 'Stock inward failed');
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
        color: specsModal.color.trim() || undefined,
        odometerKm: specsModal.odometerKm || undefined,
      });
      setSuccessMsg('Vehicle specs & registration plate updated');
      setSpecsModal({ open: false, registrationNumber: '', variant: '', color: '', odometerKm: 0 });
      await loadAllData();
    } catch (err) {
      setError(err instanceof ApiError ? `Specs Error: ${err.code}` : 'Failed to update vehicle specs');
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
      await loadAllData();
    } catch (err) {
      setError(err instanceof ApiError ? `Work Order Error: ${err.code}` : 'Failed to create work order');
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
      await loadAllData();
    } catch (err) {
      setError(err instanceof ApiError ? `Approval Error: ${err.code}` : 'Submission failed');
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
      await loadAllData();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'COST_SELF_APPROVAL_DENIED') {
        setError('Cost Decision Error: Self-approval is not permitted under the four-eyes segregation policy. A different employee with Pricing Approver, Admin, or Super Admin role must approve this estimate.');
      } else {
        setError(err instanceof ApiError ? `Cost Decision Error: ${err.code}` : 'Decision failed');
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
      await loadAllData();
    } catch (err) {
      setError(err instanceof ApiError ? `Error: ${err.code}` : 'Failed to start work order');
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
      await loadAllData();
    } catch (err) {
      setError(err instanceof ApiError ? `Error: ${err.code}` : 'Failed to complete work order');
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
      setError('Please enter a valid cost amount in rupees.');
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
      await loadAllData();
    } catch (err) {
      setError(err instanceof ApiError ? `Resubmit Error: ${err.code}` : 'Failed to resubmit cost');
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
      await loadAllData();
    } catch (err) {
      setError(err instanceof ApiError ? `QC Error: ${err.code}` : 'Quality control submission failed');
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
      const urls = studioPhotos
        .split('\n')
        .map(u => u.trim())
        .filter(u => u.length > 5);

      await api.prepareListing(user, studioModal.stockItem.id, {
        title: studioTitle,
        color: studioColor || undefined,
        conditionSummary: studioSummary || undefined,
        mediaUrls: urls.length ? urls : undefined,
        branchId: studioBranchId || undefined,
        expectedVersion: studioModal.stockItem.version,
      });

      setSuccessMsg('Listing studio data saved. Status moved to LISTING_READY.');
      setStudioModal({ open: false });
      await loadAllData();
      setActiveTab('publication');
    } catch (err) {
      setError(err instanceof ApiError ? `Studio Error: ${err.code}` : 'Failed to save listing studio details');
    } finally {
      setLoading(false);
    }
  };

  const handleStudioPhotoUpload = async (files: FileList | null) => {
    if (!user || !studioModal.stockItem || !files?.length) return;
    setStudioUploading(true); setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) throw new Error('Only image files can be added to a retail listing.');
        if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name} is larger than the 12 MB upload limit.`);
        const base64Data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error(`Could not read ${file.name}.`)); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.readAsDataURL(file); });
        const result = await api.uploadListingPhoto(user, { base64Data, mimeType: file.type, filename: file.name.replace(/\.[^.]+$/, ''), folder: `vmotiv/listings/${studioModal.stockItem.stockCode}` });
        const url = result.secureUrl || result.url; if (!url) throw new Error(`Cloud upload did not return a URL for ${file.name}.`); uploaded.push(url);
      }
      setStudioPhotos(current => [...current.split('\n').filter(Boolean), ...uploaded].join('\n'));
      setSuccessMsg(`${uploaded.length} photo${uploaded.length === 1 ? '' : 's'} uploaded securely to Cloudinary.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not upload listing photos.'); } finally { setStudioUploading(false); }
  };

  const handlePublishSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !publishModal.stockItem) return;
    const price = BigInt(publishRetailPrice || '0') * 100n;
    if (price <= 0n) {
      setError('Please enter a valid retail price in Rupees.');
      return;
    }
    if (!publishBranchId) {
      setError('Please select a showroom / branch to list this vehicle.');
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
      await loadAllData();
      setActiveTab('inventory');
    } catch (err) {
      setError(err instanceof ApiError ? `Publish Error: ${err.code}` : 'Publication failed');
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
      await loadAllData();
    } catch (err) {
      setError(err instanceof ApiError ? `Delivery Error: ${err.code}` : 'Delivery failed');
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
      <main className="auth-shell">
        <section className="auth-panel">
          <img className="auth-logo" src="/brand/vmotiv-logo.svg" alt="V MOTIV" />
          <p className="eyebrow">CONFIGURATION REQUIRED</p>
          <h1>Environment Missing</h1>
          <p>
            Please configure VITE_FIREBASE_* and VITE_API_BASE environment variables.
          </p>
        </section>
      </main>
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
    team: 'Operations Team & Tasks',
  };

  return (
    <div className="app-shell">
      {/* Left Sidebar Navigation (Matching Admin Panel) */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <img src="/brand/vmotiv-logo.svg" alt="V MOTIV" />
          <span>Operations</span>
        </div>

        <nav aria-label="Operations Primary Navigation">
          <div className="sidebar-nav-section">Fleet & Dispatch</div>
          <button
            type="button"
            className={activeTab === 'overview' ? 'active' : ''}
            onClick={() => { setActiveTab('overview'); setSidebarOpen(false); }}
          >
            <IconDashboard />
            <span>Overview</span>
          </button>
          <button
            type="button"
            className={activeTab === 'dispatch' ? 'active' : ''}
            onClick={() => { setActiveTab('dispatch'); setStatusFilter('ALL'); setSidebarOpen(false); }}
          >
            <IconDispatch />
            <span>Inspection Dispatch</span>
            {metrics?.unassigned ? <span className="tab-badge">{metrics.unassigned}</span> : null}
          </button>

          <div className="sidebar-nav-section">Post-Inspection & Custody</div>
          <button
            type="button"
            className={activeTab === 'acquisitions' ? 'active' : ''}
            onClick={() => { setActiveTab('acquisitions'); setStatusFilter('ALL'); setSidebarOpen(false); }}
          >
            <IconAcquisitions />
            <span>Acquisitions & Valuation</span>
            {metrics?.acquisitions?.documentationRequired ? (
              <span className="tab-badge">{metrics.acquisitions.documentationRequired}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={activeTab === 'documentation' ? 'active' : ''}
            onClick={() => { setActiveTab('documentation'); setStatusFilter('ALL'); setSidebarOpen(false); }}
          >
            <IconDocuments />
            <span>Seller Documentation</span>
          </button>
          <button
            type="button"
            className={activeTab === 'handover' ? 'active' : ''}
            onClick={() => { setActiveTab('handover'); setStatusFilter('ALL'); setSidebarOpen(false); }}
          >
            <IconHandover />
            <span>Custody Handover</span>
            {metrics?.acquisitions?.handoverReady ? (
              <span className="tab-badge">{metrics.acquisitions.handoverReady}</span>
            ) : metrics?.acquisitions?.settlementReady ? (
              <span className="tab-badge">{metrics.acquisitions.settlementReady}</span>
            ) : null}
          </button>

          <div className="sidebar-nav-section">Vehicle Preparation</div>
          <button
            type="button"
            className={activeTab === 'inventory' ? 'active' : ''}
            onClick={() => { setActiveTab('inventory'); setStatusFilter('ALL'); setSidebarOpen(false); }}
          >
            <IconInventory />
            <span>Stock Inventory</span>
            {inventory.length ? <span className="tab-badge">{inventory.length}</span> : null}
          </button>
          <button
            type="button"
            className={activeTab === 'refurbishment' ? 'active' : ''}
            onClick={() => { setActiveTab('refurbishment'); setSidebarOpen(false); }}
          >
            <IconRefurbishment />
            <span>Workshop Repairs</span>
            {metrics?.refurbishment?.pendingCostApprovals ? (
              <span className="tab-badge" style={{ background: 'var(--yellow)', color: 'var(--navy)' }}>{metrics.refurbishment.pendingCostApprovals} cost</span>
            ) : null}
          </button>
          <button
            type="button"
            className={activeTab === 'qc' ? 'active' : ''}
            onClick={() => { setActiveTab('qc'); setSidebarOpen(false); }}
          >
            <IconQC />
            <span>Quality Control</span>
            {metrics?.stock?.qcPending ? <span className="tab-badge">{metrics.stock.qcPending}</span> : null}
          </button>

          <div className="sidebar-nav-section">Marketplace & Delivery</div>
          <button
            type="button"
            className={activeTab === 'studio' ? 'active' : ''}
            onClick={() => { setActiveTab('studio'); setSidebarOpen(false); }}
          >
            <IconStudio />
            <span>Listing Studio</span>
            {metrics?.stock?.listingPreparation ? (
              <span className="tab-badge">{metrics.stock.listingPreparation}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={activeTab === 'publication' ? 'active' : ''}
            onClick={() => { setActiveTab('publication'); setSidebarOpen(false); }}
          >
            <IconPublish />
            <span>Retail Publication</span>
            {metrics?.stock?.listingReady ? (
              <span className="tab-badge">{metrics.stock.listingReady}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={activeTab === 'deliveries' ? 'active' : ''}
            onClick={() => { setActiveTab('deliveries'); setSidebarOpen(false); }}
          >
            <IconDelivery />
            <span>Test Drives & Delivery</span>
            {testDrives.length ? <span className="tab-badge">{testDrives.length}</span> : null}
          </button>
          <button
            type="button"
            className={activeTab === 'team' ? 'active' : ''}
            onClick={() => { setActiveTab('team'); setSidebarOpen(false); }}
          >
            <IconLock />
            <span>Operations Team</span>
          </button>
        </nav>

        <div className="sidebar-account">
          <span>{user.displayName || user.email}</span>
          <small>Operations & Fleet Manager</small>
          <button type="button" onClick={() => void signOut(auth!)}>
            <IconLogout /> Sign out
          </button>
        </div>
      </aside>

      {sidebarOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}

      <div className="app-main">
        {/* Topbar (Matching Admin Panel) */}
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              className="icon-button mobile-menu"
              aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <IconCross /> : <IconMenu />}
            </button>
            <div>
              <span className="breadcrumb">V MOTIV Operations /</span>
              <strong>{TAB_LABELS[activeTab] || 'Workspace'}</strong>
            </div>
          </div>
          <div className="identity">
            <span>{user.email}</span>
            <span className="mfa-badge">MFA verified</span>
          </div>
        </header>

        {/* Main Content Area */}
        <main id="main" className="main-content" tabIndex={-1}>
        {/* Alerts */}
        {error ? (
          <aside className="alert-error" role="alert">
            <span>{error}</span>
            <button type="button" aria-label="Dismiss error" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }} onClick={() => setError(null)}>
              <IconCross />
            </button>
          </aside>
        ) : null}

        {loadWarning ? (
          <aside className="alert-warning" role="status">
            <span>{loadWarning}</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button type="button" className="btn-secondary btn-sm" onClick={() => void loadAllData()} disabled={loading}>Retry</button>
              <button type="button" aria-label="Dismiss loading warning" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }} onClick={() => setLoadWarning(null)}><IconCross /></button>
            </div>
          </aside>
        ) : null}

        {successMsg ? (
          <aside className="alert-success" role="status">
            <span><IconCheck /> {successMsg}</span>
            <button type="button" aria-label="Dismiss success message" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }} onClick={() => setSuccessMsg(null)}>
              <IconCross />
            </button>
          </aside>
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
                              <span style={{ padding: '1px 6px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.5px' }}>
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
                                    await loadAllData();
                                  } catch (e) {
                                    setError('Failed to cancel request');
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
                        <div style={{ padding: '0.5rem', background: 'var(--success-bg)', border: '1px solid rgba(97, 217, 154, 0.3)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--success)', fontWeight: 600 }}>
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
        {activeTab === 'documentation' ? (
          <div>
            <div className="action-bar">
              <div className="section-heading">
                <h2>Pre-Acquisition Documentation Checklist</h2>
                <p>Verify mandatory ownership, identity, lien and authority records before finance settlement release.</p>
              </div>
              <button className="btn-secondary" onClick={() => void loadAllData()} disabled={loading}>
                <IconRefresh />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {cases.map(c => (
                <article className="card-table" key={c.id}>
                  <div className="card-table-header">
                    <div>
                      <strong>{c.lead.make} {c.lead.model} ({c.lead.manufacturingYear})</strong>
                      <div className="card-table-subtitle">
                        Seller: {c.lead.sellerName} · Reg: {c.lead.registrationNumber || 'Not provided'} · Case: {c.caseReference.slice(0, 13)}
                      </div>
                    </div>
                    <span className={`badge ${c.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'}`}>
                      {c.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="table-responsive">
                    <table>
                      <thead>
                        <tr>
                          <th>Document Type</th>
                          <th>Current Status</th>
                          <th>Reviewed At</th>
                          <th>Reviewer Notes</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.documents.map(doc => (
                          <tr key={doc.id}>
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
                                  setDocStatus(doc.status === 'REQUESTED' ? 'RECEIVED' : doc.status === 'RECEIVED' ? 'UNDER_REVIEW' : 'VERIFIED');
                                  setDocNotes(doc.notes || '');
                                }}
                              >
                                Update Status
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
              {!cases.length ? (
                <div className="empty-state">
                  <h3>No documentation cases</h3>
                  <p>Accepted seller offers will generate document checklists automatically.</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

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
                        border: settlementDone ? '1px solid rgba(97, 217, 154, 0.3)' : '1px solid rgba(247, 181, 3, 0.3)',
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
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Inwarded: {formatDate(s.createdAt)}</div>
                        </td>
                        <td>
                          <strong>{s.manufacturingYear} {s.make} {s.model}{s.variant ? ` ${s.variant}` : ''}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                            {[s.fuelType, s.transmission, s.color || 'Standard'].filter(Boolean).join(' · ')}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {s.registrationNumber ? (
                              <span style={{ display: 'inline-block', width: 'fit-content', padding: '1px 6px', background: 'rgba(255, 255, 255, 0.06)', border: '1px solid var(--border)', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.5px', fontSize: '0.8125rem' }}>
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

                            {['LISTING_PREPARATION', 'QC_PENDING', 'LISTING_READY'].includes(s.status) ? (
                              <button
                                className="btn-secondary"
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                onClick={() => openStudioModal(s)}
                              >
                                Studio Specs
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
                          <span style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(2, 11, 24, 0.85)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--text)', border: '1px solid var(--border)' }}>
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
                      </div>

                      <div className="card-footer" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {s.status === 'LISTED' ? (
                          <>
                            <button
                              className="btn-secondary"
                              style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                              onClick={() => openStudioModal(s)}
                            >
                              🔒 View Specs (Read-Only)
                            </button>
                            {s.vehicle?.listing?.id ? (
                              <a
                                href={`https://www.vmotiv.in/buy/${s.vehicle.listing.id}`}
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
                          <div style={{ marginTop: '0.5rem', padding: '0.6rem', background: 'var(--success-bg)', border: '1px solid rgba(97, 217, 154, 0.3)', borderRadius: '6px', color: 'var(--success)', fontWeight: 600 }}>
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
                                href={`https://www.vmotiv.in/buy/${s.vehicle.listing.id}`}
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
                                  await loadAllData();
                                } catch (e) {
                                  setError('Failed to confirm test drive');
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
                                  await loadAllData();
                                } catch (e) {
                                  setError('Failed to update test drive');
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
        {/* VIEW 12: TEAM & WORKLOAD                                 */}
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
        </main>
      </div>

      {/* ======================================================== */}
      {/* MODAL: ASSIGN INSPECTOR                                  */}
      {/* ======================================================== */}
      {assignModal.open && assignModal.request ? (
        <div className="modal-overlay">
          <div className="modal-dialog">
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
                    📅 {(assignModal.request.requestedDate || assignModal.request.lead.inspectionDate) ? formatDate(assignModal.request.requestedDate || assignModal.request.lead.inspectionDate) : 'Date not finalized'}
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
                    <span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)', borderRadius: '4px', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.5px' }}>
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
                    {inspectors.map(ins => (
                      <option key={ins.userId} value={ins.userId}>
                        {ins.displayName || ins.email} ({ins.activeLoadCount} active jobs)
                      </option>
                    ))}
                  </select>
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
                <button type="submit" className="btn-gold" disabled={loading}>Confirm Assignment</button>
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
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Verify Document: {docModal.docType?.replace(/_/g, ' ')}</h3>
              <button className="btn-close" onClick={() => setDocModal({ open: false })}>✕</button>
            </div>
            <form onSubmit={handleDocUpdate}>
              <div className="modal-body">
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
                <button type="submit" className="btn-gold" disabled={loading}>Update Document Status</button>
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
          <div className="modal-dialog">
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
                <button type="submit" className="btn-gold" disabled={loading}>Save Custody Record</button>
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
          <div className="modal-dialog">
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
                <button type="submit" className="btn-gold" disabled={loading || !inwardBranchId}>Inward Vehicle to Stock</button>
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
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Edit Vehicle Specs & Registration Plate</h3>
              <button className="btn-close" onClick={() => setSpecsModal({ open: false, registrationNumber: '', variant: '', color: '', odometerKm: 0 })}>✕</button>
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
                  onClick={() => setSpecsModal({ open: false, registrationNumber: '', variant: '', color: '', odometerKm: 0 })}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Saving…' : 'Save Vehicle Specs'}
                </button>
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
          <div className="modal-dialog">
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
                <button type="submit" className="btn-gold" disabled={loading}>Create Work Order</button>
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
          <div className="modal-dialog">
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
                <button type="submit" className="btn-gold" disabled={loading}>Resubmit for Approval</button>
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
          <div className="modal-dialog">
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
                <button type="submit" className="btn-gold" disabled={loading}>Submit QC Decision</button>
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
        return (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Listing Studio Specifications {isStudioListed ? '🔒 (Locked)' : ''}</h3>
              <button className="btn-close" onClick={() => setStudioModal({ open: false })}>✕</button>
            </div>
            <form onSubmit={handleStudioSubmit}>
              <div className="modal-body">
                {isStudioListed ? (
                  <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#FCA5A5', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>🔒</span>
                    <div>
                      <strong>Published Marketplace Listing (Read-Only)</strong>
                      <div>This vehicle is live on the retail marketplace. Once a vehicle is listed, its specifications, showroom location, and curated photos cannot be altered.</div>
                    </div>
                  </div>
                ) : null}

                <div className="form-group">
                  <label>Showroom Hub / Branch *</label>
                  <select
                    className="form-select"
                    value={studioBranchId}
                    onChange={e => setStudioBranchId(e.target.value)}
                    disabled={isStudioListed}
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
                    disabled={isStudioListed}
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
                    disabled={isStudioListed}
                  />
                </div>

                <div className="form-group">
                  <label>Condition & Highlight Summary</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Enter vehicle highlight summary for prospective buyers..."
                    value={studioSummary}
                    onChange={e => setStudioSummary(e.target.value)}
                    disabled={isStudioListed}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="listing-photos">Retail vehicle photos</label>
                  <input id="listing-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => void handleStudioPhotoUpload(e.target.files)} disabled={isStudioListed || studioUploading || loading} />
                  <small style={{ color: 'var(--muted)' }}>{isStudioListed ? 'Photos are locked for published marketplace vehicles.' : studioUploading ? 'Uploading securely to Cloudinary…' : 'Upload front, rear, interior, odometer and engine photos. JPEG, PNG or WebP; maximum 12 MB each.'}</small>
                  {studioPhotos ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                      {studioPhotos.split('\n').filter(Boolean).map((url, index) => (
                        <div key={url} style={{ position: 'relative' }}>
                          <img src={url} alt={`Listing photo ${index + 1}`} style={{ width: 92, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                          {!isStudioListed ? (
                            <button
                              type="button"
                              aria-label={`Remove listing photo ${index + 1}`}
                              onClick={() => setStudioPhotos(current => current.split('\n').filter(item => item !== url).join('\n'))}
                              style={{ position: 'absolute', top: -7, right: -7, borderRadius: 99, border: 0, width: 22, height: 22, cursor: 'pointer', background: 'var(--red, #EF4444)', color: '#fff', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              ×
                            </button>
                          ) : null}
                          {!isStudioListed && index > 0 ? (
                            <button
                              type="button"
                              title="Make Primary / Hero Photo"
                              onClick={() => {
                                const photos = studioPhotos.split('\n').filter(Boolean);
                                const reordered = [url, ...photos.filter(p => p !== url)];
                                setStudioPhotos(reordered.join('\n'));
                              }}
                              style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(2, 11, 24, 0.85)', color: 'var(--yellow)', border: '1px solid var(--border)', borderRadius: 4, fontSize: '0.65rem', padding: '1px 5px', cursor: 'pointer' }}
                            >
                              ★ Cover
                            </button>
                          ) : index === 0 ? (
                            <span style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(247, 181, 3, 0.9)', color: '#000', fontWeight: 700, borderRadius: 4, fontSize: '0.65rem', padding: '1px 5px' }}>
                              Cover
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button type="button" className="btn-secondary" onClick={() => setStudioModal({ open: false })}>
                  {isStudioListed ? 'Close' : 'Cancel'}
                </button>
                {isStudioListed ? (
                  studioModal.stockItem.vehicle?.listing?.id ? (
                    <a
                      href={`https://www.vmotiv.in/buy/${studioModal.stockItem.vehicle.listing.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-primary"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      ↗ View on Marketplace
                    </a>
                  ) : null
                ) : (
                  <button type="submit" className="btn-gold" disabled={loading || studioUploading}>
                    Save Studio Specifications
                  </button>
                )}
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
          <div className="modal-dialog">
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

                <div style={{ padding: '0.75rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--muted)' }}>
                  <strong>Commercial Readiness Checklist:</strong>
                  <ul style={{ paddingLeft: '1.25rem', marginTop: '0.35rem' }}>
                    <li>Stock inward confirmed</li>
                    <li>Refurbishment work orders signed off</li>
                    <li>Independent QC review passed</li>
                    <li>Photos & title prepared in Listing Studio</li>
                  </ul>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setPublishModal({ open: false })}>Cancel</button>
                <button type="submit" className="btn-gold" disabled={loading}>Publish to Marketplace</button>
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
          <div className="modal-dialog">
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
                <button type="submit" className="btn-gold" disabled={loading}>Complete Buyer Delivery</button>
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
          <div className="modal-dialog">
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

              <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(97, 217, 154, 0.08)', border: '1px solid rgba(97, 217, 154, 0.3)', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--success)' }}>
                ✓ Physical handover finalized and registered in immutable AuditEvent compliance log.
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setViewBuyerModal({ open: false })}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
