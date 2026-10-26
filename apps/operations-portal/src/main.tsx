import { useEffect, useMemo, useState, type FC, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, firebaseConfigured } from './firebase';
import { api, ApiError } from './api';
import type {
  AcquisitionCase,
  DashboardMetrics,
  InspectionRequest,
  InspectorEmployee,
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

export const App: FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const [handoverOdometer, setHandoverOdometer] = useState<number>(0);
  const [handoverMainKeys, setHandoverMainKeys] = useState<number>(1);
  const [handoverSpareKeys, setHandoverSpareKeys] = useState<number>(0);
  const [handoverDocsReceived, setHandoverDocsReceived] = useState(true);
  const [handoverLocation, setHandoverLocation] = useState('Bengaluru Central Hub');
  const [handoverCondition, setHandoverCondition] = useState('');

  const [stockInwardModal, setStockInwardModal] = useState<{ open: boolean; caseItem?: AcquisitionCase }>({ open: false });
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

  const [studioModal, setStudioModal] = useState<{ open: boolean; stockItem?: VehicleStockUnit }>({ open: false });
  const [studioTitle, setStudioTitle] = useState('');
  const [studioColor, setStudioColor] = useState('');
  const [studioSummary, setStudioSummary] = useState('');
  const [studioPhotos, setStudioPhotos] = useState('');

  const [publishModal, setPublishModal] = useState<{ open: boolean; stockItem?: VehicleStockUnit }>({ open: false });
  const [publishRetailPrice, setPublishRetailPrice] = useState<string>('');

  const [deliveryModal, setDeliveryModal] = useState<{ open: boolean; stockItem?: VehicleStockUnit }>({ open: false });
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
    try {
      const [m, r, ins, c, inv, td] = await Promise.all([
        api.dashboard(u).catch(() => null),
        api.inspectionRequests(u).catch(() => []),
        api.inspectors(u).catch(() => []),
        api.acquisitions(u).catch(() => []),
        api.inventory(u).catch(() => []),
        api.testDrives(u).catch(() => ({ items: [] })),
      ]);
      setMetrics(m);
      setRequests(r);
      setInspectors(ins);
      setCases(c);
      setInventory(inv);
      setTestDrives(Array.isArray(td) ? td : td?.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operations data');
    } finally {
      setLoading(false);
    }
  };

  // --- Handlers ---
  const handleAssignSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !assignModal.request || !assignInspectorId) return;
    setLoading(true);
    setError(null);
    try {
      await api.assignInspection(user, assignModal.request.id, {
        inspectorId: assignInspectorId,
        scheduledAt: assignDate ? new Date(assignDate).toISOString() : undefined,
        locationType: assignLocationType,
        address: assignAddress || undefined,
      });
      setSuccessMsg('Inspection assigned successfully');
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
        status: 'RECEIVED',
        location: handoverLocation,
        observedAt: new Date().toISOString(),
        odometerKm: Number(handoverOdometer) || 0,
        mainKeysReceived: Number(handoverMainKeys) || 1,
        spareKeysReceived: Number(handoverSpareKeys) || 0,
        documentsReceived: handoverDocsReceived,
        conditionNotes: handoverCondition || undefined,
        expectedVersion: handoverModal.caseItem.handover?.version,
      });
      setSuccessMsg('Vehicle physical handover recorded successfully');
      setHandoverModal({ open: false });
      await loadAllData();
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
      setError(err instanceof ApiError ? `Cost Decision Error: ${err.code}` : 'Decision failed');
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

  const handleQcSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !qcModal.stockItem) return;
    setLoading(true);
    setError(null);
    try {
      const qcReport = (await api.startQualityControl(user, qcModal.stockItem.id, {
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

  const handlePublishSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !publishModal.stockItem) return;
    const price = BigInt(publishRetailPrice || '0') * 100n;
    if (price <= 0n) {
      setError('Please enter a valid retail price in Rupees.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.publishListing(user, publishModal.stockItem.id, {
        retailPricePaise: price.toString(),
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
      <main className="app-container" style={{ padding: '3rem', textAlign: 'center' }}>
        <h1>Operations Configuration Required</h1>
        <p>Please configure VITE_FIREBASE_* and VITE_API_BASE environment variables.</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-container" style={{ justifyContent: 'center', alignItems: 'center', background: '#061A38', color: '#ffffff' }}>
        <div style={{ maxWidth: '440px', padding: '2.5rem', background: '#ffffff', color: '#0F172A', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: '#F7B503', color: '#061A38', fontWeight: 800, padding: '0.3rem 0.8rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
            V MOTIV V2
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#061A38', marginBottom: '0.5rem' }}>Operations Portal</h1>
          <p style={{ color: '#475569', fontSize: '0.9rem', marginBottom: '2rem' }}>
            Coordinate verified post-inspection operations, custody handovers, inventory stock, refurbishment, quality control and retail publishing.
          </p>
          <button
            onClick={() => void signInWithPopup(auth!, new GoogleAuthProvider())}
            style={{ width: '100%', padding: '0.85rem', background: '#061A38', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Sign in with Google
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="top-header">
        <div className="brand-section">
          <a href="#overview" className="brand-logo" onClick={() => setActiveTab('overview')}>
            <span className="brand-badge">V MOTIV</span>
            <div>
              <div className="brand-title">Operations Portal</div>
              <div className="brand-subtitle">ops.vmotiv.in</div>
            </div>
          </a>
        </div>
        <div className="user-section">
          <div className="user-badge">
            <span className="user-name">{user.displayName || user.email}</span>
            <span className="user-role">Operations & Fleet Manager</span>
          </div>
          <button className="btn-signout" onClick={() => void signOut(auth!)}>
            Sign out
          </button>
        </div>
      </header>

      {/* Sub Navigation Bar */}
      <nav className="sub-nav">
        <button className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          <IconDashboard /> Overview
        </button>
        <button className={`nav-tab ${activeTab === 'dispatch' ? 'active' : ''}`} onClick={() => { setActiveTab('dispatch'); setStatusFilter('ALL'); }}>
          <IconDispatch /> Inspection Dispatch
          {metrics?.unassigned ? <span className="tab-badge">{metrics.unassigned}</span> : null}
        </button>
        <button className={`nav-tab ${activeTab === 'acquisitions' ? 'active' : ''}`} onClick={() => { setActiveTab('acquisitions'); setStatusFilter('ALL'); }}>
          <IconAcquisitions /> Acquisitions
          {metrics?.acquisitions?.documentationRequired ? <span className="tab-badge">{metrics.acquisitions.documentationRequired}</span> : null}
        </button>
        <button className={`nav-tab ${activeTab === 'documentation' ? 'active' : ''}`} onClick={() => setActiveTab('documentation')}>
          <IconDocuments /> Documentation
        </button>
        <button className={`nav-tab ${activeTab === 'handover' ? 'active' : ''}`} onClick={() => setActiveTab('handover')}>
          <IconHandover /> Handover & Custody
          {metrics?.acquisitions?.settlementReady ? <span className="tab-badge">{metrics.acquisitions.settlementReady}</span> : null}
        </button>
        <button className={`nav-tab ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => { setActiveTab('inventory'); setStatusFilter('ALL'); }}>
          <IconInventory /> Stock Inventory
          {inventory.length ? <span className="tab-badge">{inventory.length}</span> : null}
        </button>
        <button className={`nav-tab ${activeTab === 'refurbishment' ? 'active' : ''}`} onClick={() => setActiveTab('refurbishment')}>
          <IconRefurbishment /> Refurbishment
          {metrics?.refurbishment?.pendingCostApprovals ? <span className="tab-badge" style={{ background: '#F7B503', color: '#061A38' }}>{metrics.refurbishment.pendingCostApprovals} cost</span> : null}
        </button>
        <button className={`nav-tab ${activeTab === 'qc' ? 'active' : ''}`} onClick={() => setActiveTab('qc')}>
          <IconQC /> Quality Control
          {metrics?.stock?.qcPending ? <span className="tab-badge">{metrics.stock.qcPending}</span> : null}
        </button>
        <button className={`nav-tab ${activeTab === 'studio' ? 'active' : ''}`} onClick={() => setActiveTab('studio')}>
          <IconStudio /> Listing Studio
          {metrics?.stock?.listingPreparation ? <span className="tab-badge">{metrics.stock.listingPreparation}</span> : null}
        </button>
        <button className={`nav-tab ${activeTab === 'publication' ? 'active' : ''}`} onClick={() => setActiveTab('publication')}>
          <IconPublish /> Retail Publication
          {metrics?.stock?.listingReady ? <span className="tab-badge">{metrics.stock.listingReady}</span> : null}
        </button>
        <button className={`nav-tab ${activeTab === 'deliveries' ? 'active' : ''}`} onClick={() => setActiveTab('deliveries')}>
          <IconDelivery /> Test Drives & Delivery
          {testDrives.length ? <span className="tab-badge">{testDrives.length}</span> : null}
        </button>
        <button className={`nav-tab ${activeTab === 'team' ? 'active' : ''}`} onClick={() => setActiveTab('team')}>
          Team & Tasks
        </button>
      </nav>

      {/* Main Container */}
      <main className="main-content">
        {/* Alerts */}
        {error ? (
          <aside className="alert-error" role="alert">
            <span>{error}</span>
            <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }} onClick={() => setError(null)}>
              ✕
            </button>
          </aside>
        ) : null}

        {successMsg ? (
          <aside style={{ background: '#DCFCE7', color: '#166534', border: '1px solid #16A34A', padding: '0.75rem 1rem', borderRadius: '10px', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>✓ {successMsg}</span>
            <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }} onClick={() => setSuccessMsg(null)}>
              ✕
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
            <h3 style={{ fontSize: '0.9rem', color: '#475569', textTransform: 'uppercase', marginBottom: '0.75rem', fontWeight: 700 }}>
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
            <h3 style={{ fontSize: '0.9rem', color: '#475569', textTransform: 'uppercase', marginBottom: '0.75rem', fontWeight: 700 }}>
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
                    <div className="checklist-item" style={{ borderLeft: '3px solid #D97706' }}>
                      <div className="checklist-info">
                        <span className="checklist-title">{metrics.unassigned} Inspection Requests Unassigned</span>
                        <span className="checklist-meta">Assign qualified inspectors to maintain SLA</span>
                      </div>
                      <button className="btn-secondary" onClick={() => setActiveTab('dispatch')}>Assign</button>
                    </div>
                  ) : null}

                  {metrics?.refurbishment?.pendingCostApprovals ? (
                    <div className="checklist-item" style={{ borderLeft: '3px solid #F7B503' }}>
                      <div className="checklist-info">
                        <span className="checklist-title">{metrics.refurbishment.pendingCostApprovals} Cost Approvals Pending</span>
                        <span className="checklist-meta">Workshop repair estimates awaiting independent decision</span>
                      </div>
                      <button className="btn-secondary" onClick={() => setActiveTab('refurbishment')}>Review</button>
                    </div>
                  ) : null}

                  {metrics?.stock?.qcPending ? (
                    <div className="checklist-item" style={{ borderLeft: '3px solid #2563EB' }}>
                      <div className="checklist-info">
                        <span className="checklist-title">{metrics.stock.qcPending} Vehicles Awaiting Independent QC</span>
                        <span className="checklist-meta">Completed workshop repairs ready for sign-off</span>
                      </div>
                      <button className="btn-secondary" onClick={() => setActiveTab('qc')}>Inspect</button>
                    </div>
                  ) : null}

                  {metrics?.stock?.listingReady ? (
                    <div className="checklist-item" style={{ borderLeft: '3px solid #16A34A' }}>
                      <div className="checklist-info">
                        <span className="checklist-title">{metrics.stock.listingReady} Vehicles Ready for Retail Publication</span>
                        <span className="checklist-meta">Commercial readiness gates cleared</span>
                      </div>
                      <button className="btn-gold" onClick={() => setActiveTab('publication')}>Publish</button>
                    </div>
                  ) : null}

                  {!metrics?.unassigned && !metrics?.refurbishment?.pendingCostApprovals && !metrics?.stock?.qcPending ? (
                    <p style={{ color: '#64748B', fontSize: '0.85rem' }}>No urgent operational bottlenecks at this moment.</p>
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
                          <div style={{ color: '#64748B', fontSize: '0.75rem' }}>
                            {evt.actor?.displayName || evt.actor?.email || 'System'} · {evt.entityType} ({evt.entityId.slice(0, 8)}...)
                          </div>
                        </div>
                        <span className="timeline-time">{new Date(evt.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    ))}
                    {!metrics?.recentEvents?.length ? (
                      <p style={{ color: '#94A3B8', fontSize: '0.85rem' }}>No recent audit events recorded.</p>
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
                      <th>Vehicle</th>
                      <th>City / Hub</th>
                      <th>Status</th>
                      <th>Assignment / Slot</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequests.map(r => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.lead.referenceCode}</strong>
                          <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{r.lead.sellerName} · {r.lead.sellerPhone || 'No phone'}</div>
                        </td>
                        <td>
                          <strong>{r.lead.make} {r.lead.model}</strong>
                          <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{r.lead.manufacturingYear} · {r.lead.fuelType || 'Petrol'} · {r.lead.odometerKm ? `${r.lead.odometerKm.toLocaleString()} km` : '—'}</div>
                        </td>
                        <td>{r.lead.city}</td>
                        <td>
                          <span className={`badge ${r.status === 'COMPLETED' ? 'badge-success' : r.status === 'SCHEDULED' ? 'badge-info' : r.status === 'IN_PROGRESS' ? 'badge-purple' : 'badge-warning'}`}>
                            {r.status}
                          </span>
                        </td>
                        <td>
                          {r.assignment ? (
                            <div>
                              <strong>{r.assignment.inspector?.user.displayName || r.assignment.inspector?.user.email}</strong>
                              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                <IconClock style={{ verticalAlign: 'middle', marginRight: '3px' }} />
                                {formatDate(r.assignment.scheduledAt)} ({r.assignment.locationType})
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: '#D97706', fontSize: '0.8rem', fontWeight: 600 }}>Unassigned</span>
                          )}
                        </td>
                        <td>
                          {r.status === 'REQUESTED' || !r.assignment ? (
                            <button
                              className="btn-gold"
                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                              onClick={() => {
                                setAssignModal({ open: true, request: r });
                                setAssignInspectorId(inspectors[0]?.userId || '');
                                setAssignDate(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
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
                          <span className="card-title">{c.lead.make} {c.lead.model}</span>
                          <span className={`badge ${c.status === 'COMPLETED' ? 'badge-success' : c.status === 'SETTLEMENT_READY' ? 'badge-info' : 'badge-warning'}`}>
                            {c.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <span className="card-subtitle">Case: {c.caseReference.slice(0, 13)} · Lead: {c.lead.referenceCode}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#061A38' }}>
                          {formatRupees(c.offer.offerAmountPaise)}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Agreed Purchase Price</span>
                      </div>
                    </div>

                    <div className="card-body">
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8125rem' }}>
                        <div><strong>Seller:</strong> {c.lead.sellerName}</div>
                        <div><strong>City:</strong> {c.lead.city}</div>
                        <div><strong>Year / Reg:</strong> {c.lead.manufacturingYear} · {c.lead.registrationNumber || 'Pending'}</div>
                        <div><strong>Accepted:</strong> {formatDate(c.offer.acceptedAt)}</div>
                      </div>

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
                        <div style={{ padding: '0.5rem', background: '#DCFCE7', borderRadius: '6px', fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>
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
                            setHandoverOdometer(c.handover?.odometerKm || 0);
                            setHandoverMainKeys(c.handover?.mainKeysReceived || 1);
                            setHandoverSpareKeys(c.handover?.spareKeysReceived || 0);
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
                          onClick={() => setStockInwardModal({ open: true, caseItem: c })}
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
                  <div style={{ padding: '1rem 1.25rem', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: '1rem', color: '#061A38' }}>{c.lead.make} {c.lead.model} ({c.lead.manufacturingYear})</strong>
                      <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
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
                      <div style={{ padding: '0.6rem', borderRadius: '6px', background: settlementDone ? '#DCFCE7' : '#FEF3C7', color: settlementDone ? '#166534' : '#B45309', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
                        <p style={{ color: '#64748B', fontSize: '0.85rem' }}>Physical vehicle custody has not yet been logged.</p>
                      )}
                    </div>

                    <div className="card-footer">
                      <button
                        className="btn-gold"
                        style={{ fontSize: '0.8rem' }}
                        onClick={() => {
                          setHandoverModal({ open: true, caseItem: c });
                          setHandoverOdometer(c.handover?.odometerKm || 0);
                          setHandoverMainKeys(c.handover?.mainKeysReceived || 1);
                          setHandoverSpareKeys(c.handover?.spareKeysReceived || 0);
                        }}
                      >
                        <IconHandover /> {c.handover ? 'Update Handover' : 'Record Handover'}
                      </button>
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
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Inwarded: {formatDate(s.createdAt)}</div>
                        </td>
                        <td>
                          <strong>{s.manufacturingYear} {s.make} {s.model} {s.variant || ''}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{s.fuelType} · {s.transmission}</div>
                        </td>
                        <td>
                          <div>{s.registrationNumber || 'N/A'}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{s.odometerKm.toLocaleString()} km</div>
                        </td>
                        <td>{s.physicalLocation}</td>
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
                                onClick={() => {
                                  setStudioModal({ open: true, stockItem: s });
                                  setStudioTitle(s.vehicle?.listing?.title || `${s.manufacturingYear} ${s.make} ${s.model} ${s.variant || ''}`.trim());
                                  setStudioColor(s.vehicle?.color || '');
                                  setStudioSummary(s.vehicle?.conditionSummary || '');
                                }}
                              >
                                Studio Specs
                              </button>
                            ) : null}

                            {s.status === 'LISTING_READY' ? (
                              <button
                                className="btn-gold"
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                onClick={() => {
                                  setPublishModal({ open: true, stockItem: s });
                                }}
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
                    <div style={{ padding: '1rem 1.25rem', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '1rem', color: '#061A38' }}>{s.manufacturingYear} {s.make} {s.model} ({s.stockCode})</strong>
                        <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Location: {s.physicalLocation} · Stock Status: {s.status}</div>
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
                                <div style={{ fontSize: '0.8rem', color: '#475569' }}>{wo.requiredAction}</div>
                              </td>
                              <td>{wo.assignedProvider || 'Internal Workshop'}</td>
                              <td>
                                <div>Est: {formatRupees(wo.estimatedCostPaise)}</div>
                                {wo.actualCostPaise ? <div style={{ fontSize: '0.75rem', color: '#16A34A' }}>Act: {formatRupees(wo.actualCostPaise)}</div> : null}
                              </td>
                              <td>
                                {wo.costApproval ? (
                                  <div>
                                    <span className={`badge ${wo.costApproval.status === 'APPROVED' ? 'badge-success' : wo.costApproval.status === 'REJECTED' ? 'badge-danger' : 'badge-warning'}`}>
                                      {wo.costApproval.status}
                                    </span>
                                    {wo.costApproval.reason ? <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{wo.costApproval.reason}</div> : null}
                                  </div>
                                ) : (
                                  <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>None</span>
                                )}
                              </td>
                              <td>
                                <span className={`badge ${wo.status === 'COMPLETED' ? 'badge-success' : wo.status === 'IN_PROGRESS' ? 'badge-purple' : wo.status === 'APPROVED' ? 'badge-info' : 'badge-warning'}`}>
                                  {wo.status.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                  {wo.status === 'DRAFT' ? (
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
                .filter(s => s.status === 'QC_PENDING' || (s.qualityControlReports && s.qualityControlReports.length > 0))
                .map(s => (
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
                        <div key={qc.id} style={{ marginTop: '0.5rem', padding: '0.6rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className={`badge ${qc.status === 'PASSED' ? 'badge-success' : qc.status === 'REWORK_REQUIRED' ? 'badge-warning' : 'badge-danger'}`}>
                              QC {qc.status}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>{formatDate(qc.reviewedAt || qc.createdAt)}</span>
                          </div>
                          {qc.findings ? <div style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>{qc.findings}</div> : null}
                        </div>
                      ))}
                    </div>

                    <div className="card-footer">
                      {s.status === 'QC_PENDING' ? (
                        <button
                          className="btn-gold"
                          style={{ fontSize: '0.8rem' }}
                          onClick={() => setQcModal({ open: true, stockItem: s })}
                        >
                          <IconQC /> Record QC Verdict
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#16A34A', fontWeight: 600 }}>QC Signed Off</span>
                      )}
                    </div>
                  </article>
                ))}
              {!inventory.some(s => s.status === 'QC_PENDING' || (s.qualityControlReports && s.qualityControlReports.length > 0)) ? (
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
            <div className="action-bar">
              <div className="section-heading">
                <h2>Listing Studio & Photography</h2>
                <p>Curate photos, highlights, verified tags, and vehicle specifications for marketplace publication.</p>
              </div>
              <button className="btn-secondary" onClick={() => void loadAllData()} disabled={loading}>
                <IconRefresh />
              </button>
            </div>

            <div className="detail-grid">
              {inventory
                .filter(s => ['LISTING_PREPARATION', 'LISTING_READY', 'QC_PENDING', 'RECEIVED'].includes(s.status))
                .map(s => (
                  <article className="detail-card" key={s.id}>
                    <div className="card-header">
                      <div>
                        <strong className="card-title">{s.manufacturingYear} {s.make} {s.model} {s.variant || ''}</strong>
                        <div className="card-subtitle">Stock: {s.stockCode} · Plate: {s.registrationNumber || 'Pending'}</div>
                      </div>
                      <span className={`badge ${s.status === 'LISTING_READY' ? 'badge-success' : 'badge-info'}`}>
                        {s.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="card-body">
                      <div><strong>Listing Title:</strong> {s.vehicle?.listing?.title || 'Draft not yet created'}</div>
                      <div><strong>Color:</strong> {s.vehicle?.color || 'Not recorded'}</div>
                      <div><strong>Condition:</strong> {s.vehicle?.conditionSummary || 'Inspection verified'}</div>
                      <div>
                        <strong>Curated Photos:</strong> {s.vehicle?.listing?.media?.length || 0} photos attached
                      </div>
                    </div>

                    <div className="card-footer">
                      <button
                        className="btn-gold"
                        style={{ fontSize: '0.8rem' }}
                        onClick={() => {
                          setStudioModal({ open: true, stockItem: s });
                          setStudioTitle(s.vehicle?.listing?.title || `${s.manufacturingYear} ${s.make} ${s.model} ${s.variant || ''}`.trim());
                          setStudioColor(s.vehicle?.color || '');
                          setStudioSummary(s.vehicle?.conditionSummary || '');
                          setStudioPhotos((s.vehicle?.listing?.media || []).map(m => m.url).join('\n'));
                        }}
                      >
                        <IconStudio /> {s.vehicle?.listing ? 'Edit Studio Details' : 'Prepare Listing'}
                      </button>
                    </div>
                  </article>
                ))}
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
                          <div className="card-subtitle">Stock: {s.stockCode} · Reg: {s.registrationNumber || 'N/A'}</div>
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
                          <div style={{ marginTop: '0.5rem', padding: '0.6rem', background: '#DCFCE7', borderRadius: '6px', color: '#166534', fontWeight: 600 }}>
                            ✓ Live in V MOTIV Catalog at {formatRupees(s.vehicle?.listing?.pricePaise)}
                          </div>
                        ) : null}
                      </div>

                      <div className="card-footer">
                        {!isPublished ? (
                          <button
                            className="btn-gold"
                            style={{ fontSize: '0.8rem' }}
                            onClick={() => {
                              setPublishModal({ open: true, stockItem: s });
                              setPublishRetailPrice(s.vehicle?.listing?.pricePaise ? String(Number(BigInt(s.vehicle.listing.pricePaise) / 100n)) : '');
                            }}
                          >
                            <IconPublish /> Approve Price & Publish
                          </button>
                        ) : (
                          <span style={{ color: '#16A34A', fontSize: '0.85rem', fontWeight: 600 }}>Live Marketplace Listing</span>
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
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{td.customer?.phone || td.customer?.email}</div>
                        </td>
                        <td>
                          <strong>{td.listing?.title || 'Vehicle Listing'}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{formatRupees(td.listing?.pricePaise)}</div>
                        </td>
                        <td>
                          <div>{td.requestedDate}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{td.timeSlot}</div>
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
                            <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Done</span>
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
                      {!ins.branches.length ? <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>All Branches</span> : null}
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
                <div>
                  <strong>{assignModal.request.lead.make} {assignModal.request.lead.model}</strong>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    Seller: {assignModal.request.lead.sellerName} · Ref: {assignModal.request.lead.referenceCode} · City: {assignModal.request.lead.city}
                  </div>
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
                  <strong>{handoverModal.caseItem.lead.make} {handoverModal.caseItem.lead.model}</strong>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    Seller: {handoverModal.caseItem.lead.sellerName} · Agreed Price: {formatRupees(handoverModal.caseItem.offer.offerAmountPaise)}
                  </div>
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
                <p style={{ fontSize: '0.85rem', color: '#475569' }}>
                  Acquisition gates verified. Establishing canonical stock unit in V MOTIV inventory.
                </p>

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
                <button type="submit" className="btn-gold" disabled={loading}>Inward Vehicle to Stock</button>
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
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
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
                  <small style={{ color: '#64748B' }}>Equivalent to {formatRupees(woCost)}</small>
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
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
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
      {studioModal.open && studioModal.stockItem ? (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Listing Studio Specifications</h3>
              <button className="btn-close" onClick={() => setStudioModal({ open: false })}>✕</button>
            </div>
            <form onSubmit={handleStudioSubmit}>
              <div className="modal-body">
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
                  <label>Condition & Highlight Summary</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Enter vehicle highlight summary for prospective buyers..."
                    value={studioSummary}
                    onChange={e => setStudioSummary(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Curated Photo URLs (one per line)</label>
                  <textarea
                    className="form-textarea"
                    placeholder="https://res.cloudinary.com/...&#10;https://res.cloudinary.com/..."
                    value={studioPhotos}
                    onChange={e => setStudioPhotos(e.target.value)}
                    style={{ minHeight: '100px' }}
                  />
                  <small style={{ color: '#64748B' }}>Front, rear, interior, odometer and engine photos.</small>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setStudioModal({ open: false })}>Cancel</button>
                <button type="submit" className="btn-gold" disabled={loading}>Save Studio Specifications</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

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
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
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
                    <small style={{ color: '#16A34A', fontWeight: 600 }}>
                      Formatted: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(publishRetailPrice))}
                    </small>
                  ) : null}
                </div>

                <div style={{ padding: '0.75rem', background: '#F8FAFC', borderRadius: '8px', fontSize: '0.8rem', color: '#475569' }}>
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
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
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
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
