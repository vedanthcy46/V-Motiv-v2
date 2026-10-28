import { Component, useEffect, useRef, useState, type FC, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  GoogleAuthProvider,
  getMultiFactorResolver,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  type Auth,
  type MultiFactorResolver,
  type PhoneMultiFactorInfo,
  type User,
} from 'firebase/auth';
import { auth, firebaseConfigured } from './firebase';
import {
  financeApi,
  ApiError,
  type FinanceActor,
  type DashboardMetrics,
  type SettlementCase,
  type PayoutInstruction,
  type BuyerPaymentObligation,
  type IncomingReceipt,
  type RefundCase,
  type Vendor,
  type ExpenseClaim,
  type CompanyBankAccount,
  type BankStatementEntry,
  type ReconciliationException,
  type ChartOfAccount,
  type AccountingPeriod,
  type FinancialJournal,
  type InvoiceDocument,
  type VehicleProfitabilityItem,
  type AuditLogEntry,
} from './api';
import {
  IconDashboard,
  IconSellerSettlements,
  IconBuyerCollections,
  IconVerification,
  IconRefunds,
  IconExpenses,
  IconVendors,
  IconBankAccounts,
  IconLedger,
  IconInvoices,
  IconProfitability,
  IconAudit,
  IconRefresh,
  IconSearch,
  IconPlus,
  IconUpload,
  IconLogout,
  IconCross,
  IconClock,
  IconLock,
  IconMenu,
} from './icons';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  state: { hasError: boolean; error: Error | null } = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[FINANCE PORTAL ERROR]', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <main className="center-state">
          <img className="state-logo" src="/brand/vmotiv-logo.svg" alt="V MOTIV" />
          <p className="eyebrow">Finance Control Centre</p>
          <h1>An unexpected error occurred</h1>
          <p>{this.state.error?.message || 'Please refresh the page to continue.'}</p>
          <button className="button primary" onClick={() => window.location.reload()}>
            Reload Application
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

function ModalDialog({
  className = 'dialog',
  onClose,
  children,
}: {
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) {
      try {
        el.showModal();
      } catch {
        el.setAttribute('open', '');
      }
    }
  }, []);

  return (
    <dialog
      ref={ref}
      className={className}
      onCancel={onClose}
    >
      {children}
    </dialog>
  );
}

const money = (paise?: string | number | null) => {
  if (paise === undefined || paise === null || paise === '') return '—';
  try {
    const val = typeof paise === 'string' ? BigInt(paise) : BigInt(Math.round(paise));
    const isNegative = val < 0n;
    const absVal = isNegative ? -val : val;
    const rupees = Number(absVal / 100n);
    const formatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(rupees);
    return isNegative ? `-${formatted}` : formatted;
  } catch {
    return '—';
  }
};

const text = (value?: string | null) => {
  if (!value) return '—';
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
};

const formatDate = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
};

const errorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      FINANCE_ACCESS_DENIED: 'This Google account is not an active V MOTIV Finance officer or administrator.',
      ADMIN_ACCESS_DENIED: 'This Google account is not an active V MOTIV administrator.',
      FINANCE_MFA_REQUIRED: 'A verified multi-factor session is required. Complete your organization\'s Firebase MFA setup, then sign in again.',
      ADMIN_MFA_REQUIRED: 'A verified multi-factor session is required. Complete your organization\'s Firebase MFA setup, then sign in again.',
      PERMISSION_DENIED: 'Your current permissions do not allow this action.',
      BRANCH_SCOPE_DENIED: 'This record is outside your assigned branch scope.',
      CONCURRENT_MODIFICATION: 'This record was modified by another user. Please refresh and try again.',
      ALREADY_PROCESSED: 'This instruction has already been executed or cancelled.',
      PAYOUT_EXECUTION_SEPARATION_REQUIRED: 'Maker-checker policy: the officer who requested or approved this payout cannot execute the transfer.',
      PAYOUT_NOT_EXECUTABLE: 'This payout instruction is not in an executable (Approved) state.',
      BANK_REFERENCE_ALREADY_EXISTS: 'This bank transfer reference/UTR is already recorded in the system.',
      REFUND_CUSTOMER_SOURCE_REQUIRED: 'A customer obligation or receipt must be selected to originate this refund.',
      REFUND_NOT_EXECUTABLE: 'This refund is not in an approved, executable state.',
      REFUND_SELF_APPROVAL_DENIED: 'Maker-checker policy: the officer who requested this refund cannot approve it.',
      INVALID_INPUT: 'One or more required fields are invalid or missing.',
      RESOURCE_CONFLICT: 'A record with this identifier or reference already exists.',
    };
    return messages[error.code] || `Error: ${text(error.code)}`;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'The request could not be completed. Check the connection and try again.';
};

type TabKey =
  | 'overview'
  | 'seller-settlements'
  | 'buyer-collections'
  | 'receipts'
  | 'refunds'
  | 'expenses'
  | 'vendors'
  | 'banking'
  | 'exceptions'
  | 'ledger'
  | 'invoices'
  | 'profitability'
  | 'audit';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [actor, setActor] = useState<FinanceActor | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>('overview');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [enrollMfaOpen, setEnrollMfaOpen] = useState(false);
  const [sessionReload, setSessionReload] = useState(0);

  // Data states
  const [dashboard, setDashboard] = useState<DashboardMetrics | null>(null);
  const [settlements, setSettlements] = useState<SettlementCase[]>([]);
  const [obligations, setObligations] = useState<BuyerPaymentObligation[]>([]);
  const [receipts, setReceipts] = useState<IncomingReceipt[]>([]);
  const [refunds, setRefunds] = useState<RefundCase[]>([]);
  const [expenses, setExpenses] = useState<ExpenseClaim[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bankAccounts, setBankAccounts] = useState<CompanyBankAccount[]>([]);
  const [statements, setStatements] = useState<BankStatementEntry[]>([]);
  const [exceptions, setExceptions] = useState<ReconciliationException[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [journals, setJournals] = useState<FinancialJournal[]>([]);
  const [invoices, setInvoices] = useState<InvoiceDocument[]>([]);
  const [profitability, setProfitability] = useState<VehicleProfitabilityItem[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditLogEntry[]>([]);

  // Active Modals
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const loadFinanceData = async (currentUser: User) => {
    try {
      const unavailable: string[] = [];
      const load = <T,>(label: string, request: Promise<T>, fallback: T) =>
        request.catch(loadError => {
          console.warn(`[FINANCE PORTAL] ${label} unavailable`, loadError);
          unavailable.push(label);
          return fallback;
        });
      const [
        dash,
        settle,
        obs,
        recs,
        refs,
        exps,
        vens,
        banks,
        stmts,
        excs,
        coas,
        pers,
        jrnls,
        invs,
        prof,
        logs,
      ] = await Promise.all([
        load('Treasury overview', financeApi.dashboard(currentUser), null),
        load('Seller settlements', financeApi.settlements(currentUser), []),
        load('Buyer collections', financeApi.obligations(currentUser), []),
        load('Incoming receipts', financeApi.receipts(currentUser), []),
        load('Refunds', financeApi.refunds(currentUser), []),
        load('Vehicle expenses', financeApi.expenses(currentUser), []),
        load('Vendors', financeApi.vendors(currentUser), []),
        load('Bank accounts', financeApi.bankAccounts(currentUser), []),
        load('Bank statements', financeApi.bankStatements(currentUser), []),
        load('Reconciliation exceptions', financeApi.exceptions(currentUser), []),
        load('Chart of accounts', financeApi.chartOfAccounts(currentUser), []),
        load('Accounting periods', financeApi.accountingPeriods(currentUser), []),
        load('Journal entries', financeApi.journals(currentUser), []),
        load('Tax invoices', financeApi.invoices(currentUser), []),
        load('Unit profitability', financeApi.profitability(currentUser), []),
        load('Audit trail', financeApi.auditTrail(currentUser), []),
      ]);

      if (dash) setDashboard(dash);
      setSettlements(settle);
      setObligations(obs);
      setReceipts(recs);
      setRefunds(refs);
      setExpenses(exps);
      setVendors(vens);
      setBankAccounts(banks);
      setStatements(stmts);
      setExceptions(excs);
      setAccounts(coas);
      setPeriods(pers);
      setJournals(jrnls);
      setInvoices(invs);
      setProfitability(prof);
      setAuditTrail(logs);
      setError(unavailable.length
        ? `${unavailable.join(', ')} could not be loaded. Confirm the assigned finance permissions, then refresh.`
        : '');
    } catch (e: any) {
      setError(errorMessage(e));
    }
  };

  useEffect(() => {
    if (!auth) return;

    // Check for redirect sign-in resolution on startup
    getRedirectResult(auth)
      .then(result => {
        if (result?.user) {
          const savedHref = sessionStorage.getItem('vmotiv_signin_redirect_back');
          if (savedHref) {
            sessionStorage.removeItem('vmotiv_signin_redirect_back');
            window.history.replaceState({}, '', savedHref);
          }
        }
      })
      .catch((err: any) => {
        if (auth && err?.code === 'auth/multi-factor-auth-required') {
          const resolver = getMultiFactorResolver(auth, err);
          setMfaResolver(resolver);
        } else if (err?.message) {
          setError(err.message);
        }
      });

    return onAuthStateChanged(auth, next => {
      setUser(next);
      if (!next) {
        setActor(null);
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    financeApi.me(user)
      .then(actorData => {
        setActor(actorData);
        return loadFinanceData(user);
      })
      .catch(err => {
        setActor(null);
        setError(errorMessage(err));
        if (auth && multiFactor(user).enrolledFactors.length === 0) {
          setEnrollMfaOpen(true);
        }
      })
      .finally(() => setLoading(false));
  }, [user, sessionReload]);

  const googleSignIn = async () => {
    if (!auth) return;
    setBusy(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      // 1. Handle MFA requirement
      if (err?.code === 'auth/multi-factor-auth-required') {
        const resolver = getMultiFactorResolver(auth, err);
        setMfaResolver(resolver);
        setBusy(false);
        return;
      }
      // 2. Handle COOP or popup blocked by falling back to redirect
      if (
        err?.code === 'auth/popup-blocked' ||
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.message?.includes('Cross-Origin-Opener-Policy') ||
        err?.message?.includes('closed')
      ) {
        try {
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: 'select_account' });
          sessionStorage.setItem('vmotiv_signin_redirect_back', window.location.pathname + window.location.search);
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectError: any) {
          setError(errorMessage(redirectError));
        }
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    if (auth) await signOut(auth);
    setMfaResolver(null);
    setEnrollMfaOpen(false);
    setActor(null);
    setUser(null);
  };

  const runAction = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await task();
      if (user) await loadFinanceData(user);
      setActiveModal(null);
      setSelectedItem(null);
    } catch (e: any) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!firebaseConfigured || !auth) {
    return (
      <main className="center-state">
        <img className="state-logo" src="/brand/vmotiv-logo.svg" alt="V MOTIV" />
        <p className="eyebrow">Finance Control Centre</p>
        <h1>Firebase configuration required</h1>
        <p>Set the Finance Portal Firebase and API environment variables before using this workspace.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="center-state" aria-busy="true">
        <img className="state-logo" src="/brand/vmotiv-logo.svg" alt="V MOTIV" />
        <div className="spinner" />
        <p>Verifying identity and finance access.</p>
      </main>
    );
  }

  // Not signed in or not authorized as finance actor -> Show exact Admin Portal split Auth page
  if (!user || !actor) {
    const isMfaIssue = error.includes('multi-factor') || error.includes('Firebase MFA') || error.includes('MFA_REQUIRED');
    return (
      <>
        <main className="auth-shell">
          <section className="auth-panel">
            <img className="auth-logo" src="/brand/vmotiv-logo.svg" alt="V MOTIV" />
            <p className="eyebrow">FINANCE CONTROL CENTRE</p>
            <h1>Govern dealership treasury with accountable access.</h1>
            <p>
              Employee identity, branch scope, permissions and multi-factor status are verified by the V MOTIV backend on every protected request.
            </p>
            <div className="auth-actions">
              {!user ? (
                <button className="button primary" onClick={googleSignIn} disabled={busy}>
                  {busy ? 'Connecting to Google...' : 'Continue with Google'}
                </button>
              ) : isMfaIssue ? (
                <button className="button primary" onClick={() => setEnrollMfaOpen(true)}>
                  Set Up Phone 2FA
                </button>
              ) : (
                <button className="button primary" onClick={googleSignIn} disabled={busy}>
                  Continue with Google
                </button>
              )}
              {user && (
                <button className="button secondary" onClick={logout}>
                  Use another account
                </button>
              )}
            </div>
            {error && (
              <div className="alert error" role="alert">
                <strong>Access not granted</strong>
                <span>{error}</span>
              </div>
            )}
            <p className="security-note">
              Google Sign-In alone never creates Finance access. MFA and backend authorization required.
            </p>
          </section>
          <aside className="auth-aside" aria-label="Security controls">
            <div>
              <span className="kicker">Identity</span>
              <strong>Verified Google employee account</strong>
            </div>
            <div>
              <span className="kicker">Authorization</span>
              <strong>Server-controlled roles and branch scope</strong>
            </div>
            <div>
              <span className="kicker">Assurance</span>
              <strong>Multi-factor authentication (MFA) enforced</strong>
            </div>
            <div>
              <span className="kicker">Accountability</span>
              <strong>Treasury movements and approvals are immutably audited</strong>
            </div>
          </aside>
        </main>

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

  const selectTab = (nextTab: TabKey) => {
    setTab(nextTab);
    setSidebarOpen(false);
  };

  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>
      <div className="app-shell">
        {/* Sidebar - Exact Admin Portal Structure */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <img src="/brand/vmotiv-logo.svg" alt="V MOTIV" />
          <span>FINANCE</span>
        </div>

        <nav aria-label="Primary navigation">
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => selectTab('overview')}>
            <IconDashboard />
            <span>Overview</span>
          </button>
          <button className={tab === 'seller-settlements' ? 'active' : ''} onClick={() => selectTab('seller-settlements')}>
            <IconSellerSettlements />
            <span>Seller Settlements</span>
            {dashboard?.pendingApproval ? <span className="count-badge">{dashboard.pendingApproval}</span> : null}
          </button>
          <button className={tab === 'buyer-collections' ? 'active' : ''} onClick={() => selectTab('buyer-collections')}>
            <IconBuyerCollections />
            <span>Buyer Collections</span>
            {dashboard?.activeObligations ? <span className="count-badge">{dashboard.activeObligations}</span> : null}
          </button>
          <button className={tab === 'receipts' ? 'active' : ''} onClick={() => selectTab('receipts')}>
            <IconVerification />
            <span>Incoming Receipts</span>
          </button>
          <button className={tab === 'refunds' ? 'active' : ''} onClick={() => selectTab('refunds')}>
            <IconRefunds />
            <span>Refunds & Reversals</span>
          </button>
          <button className={tab === 'expenses' ? 'active' : ''} onClick={() => selectTab('expenses')}>
            <IconExpenses />
            <span>Vehicle Expenses</span>
          </button>
          <button className={tab === 'vendors' ? 'active' : ''} onClick={() => selectTab('vendors')}>
            <IconVendors />
            <span>Vendors & Payees</span>
          </button>
          <button className={tab === 'banking' ? 'active' : ''} onClick={() => selectTab('banking')}>
            <IconBankAccounts />
            <span>Bank Accounts & Rec</span>
          </button>
          <button className={tab === 'exceptions' ? 'active' : ''} onClick={() => selectTab('exceptions')}>
            <IconClock />
            <span>Exceptions</span>
            {dashboard?.exceptions ? (
              <span className="count-badge" style={{ color: 'var(--danger)', borderColor: 'rgba(255,124,134,0.4)', background: 'rgba(255,124,134,0.1)' }}>
                {dashboard.exceptions}
              </span>
            ) : null}
          </button>
          <button className={tab === 'ledger' ? 'active' : ''} onClick={() => selectTab('ledger')}>
            <IconLedger />
            <span>Financial Ledger</span>
          </button>
          <button className={tab === 'invoices' ? 'active' : ''} onClick={() => selectTab('invoices')}>
            <IconInvoices />
            <span>Tax Invoices</span>
          </button>
          <button className={tab === 'profitability' ? 'active' : ''} onClick={() => selectTab('profitability')}>
            <IconProfitability />
            <span>Unit Profitability</span>
          </button>
          <button className={tab === 'audit' ? 'active' : ''} onClick={() => selectTab('audit')}>
            <IconAudit />
            <span>Audit Trail</span>
          </button>
        </nav>

        <div className="sidebar-account">
          <span>{actor.displayName || user.email}</span>
          <small>{actor.roles.join(' · ') || 'Authorized Finance Officer'}</small>
          <button type="button" onClick={logout}>
            <IconLogout /> Sign Out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Container - Exact Admin Portal Topbar & Content */}
      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="icon-button mobile-menu"
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <IconMenu />
          </button>
          <div>
            <span className="breadcrumb">FINANCE CONTROL CENTRE</span>
            <strong>
              {tab === 'overview' && 'Treasury Overview'}
              {tab === 'seller-settlements' && 'Seller Settlements & Payouts'}
              {tab === 'buyer-collections' && 'Buyer Payment Obligations'}
              {tab === 'receipts' && 'Incoming Payment Receipts'}
              {tab === 'refunds' && 'Customer Refunds & Reversals'}
              {tab === 'expenses' && 'Vehicle Refurbishment Expenses'}
              {tab === 'vendors' && 'Authorized Dealership Vendors'}
              {tab === 'banking' && 'Bank Accounts & Statement Feeds'}
              {tab === 'exceptions' && 'Reconciliation Exceptions Queue'}
              {tab === 'ledger' && 'Dealership Chart of Accounts & GL'}
              {tab === 'invoices' && 'Commercial Tax Invoices'}
              {tab === 'profitability' && 'Vehicle Unit Profitability Matrix'}
              {tab === 'audit' && 'Immutable Financial Audit Trail'}
            </strong>
          </div>

          <div className="identity">
            <span className="privileged-badge">{actor.roles[0] || 'FINANCE'}</span>
            <span>{actor.displayName || user.email}</span>
            <button className="button secondary small" onClick={() => loadFinanceData(user)} title="Refresh">
              <IconRefresh />
            </button>
            <button className="button secondary small" onClick={logout}>
              Sign out
            </button>
          </div>
        </header>

        <main id="main">
          {error && (
            <div className="alert error" role="alert">
              <strong>Action Notice</strong>
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: OVERVIEW */}
          {tab === 'overview' && (
            <>
              <div className="page-header">
                <div>
                  <p className="eyebrow">CONTROLLED MONEY MOVEMENT</p>
                  <h1>Treasury & Liquidity Overview</h1>
                  <p>
                    Monitor acquisition payouts, customer receipts, expense claims, and banking reconciliation status in real time.
                  </p>
                </div>
                <div className="page-actions">
                  <button className="button primary" onClick={() => setTab('seller-settlements')}>
                    Review Seller Payouts
                  </button>
                  <button className="button secondary" onClick={() => { setSelectedItem(null); setActiveModal('RECORD_RECEIPT'); }}>
                    <IconPlus /> Record Receipt
                  </button>
                </div>
              </div>

              <div className="metric-grid">
                <div className="metric-card">
                  <span>Ready to Prepare</span>
                  <strong>{dashboard?.readyForPreparation ?? 0}</strong>
                  <small>Acquisitions awaiting disbursement</small>
                </div>
                <div className="metric-card">
                  <span>Awaiting Approval</span>
                  <strong style={{ color: 'var(--yellow)' }}>{dashboard?.pendingApproval ?? 0}</strong>
                  <small>Maker-checker gate</small>
                </div>
                <div className="metric-card">
                  <span>Ready to Execute</span>
                  <strong>{dashboard?.approved ?? 0}</strong>
                  <small>Approved bank instructions</small>
                </div>
                <div className="metric-card">
                  <span>Reconciliation Pending</span>
                  <strong>{dashboard?.reconciliation ?? 0}</strong>
                  <small>Awaiting statement match</small>
                </div>
                <div className="metric-card">
                  <span>Active Obligations</span>
                  <strong>{dashboard?.activeObligations ?? 0}</strong>
                  <small>Buyer vehicle purchase plans</small>
                </div>
                <div className="metric-card">
                  <span>Unapplied Receipts</span>
                  <strong style={{ color: 'var(--success)' }}>{money(dashboard?.unappliedReceiptsPaise)}</strong>
                  <small>Available customer funds</small>
                </div>
                <div className="metric-card">
                  <span>Vehicle Expenses</span>
                  <strong style={{ color: 'var(--warning)' }}>{money(dashboard?.totalExpensesPaise)}</strong>
                  <small>Cumulative direct refurbishment</small>
                </div>
                <div className="metric-card">
                  <span>Open Exceptions</span>
                  <strong style={{ color: 'var(--danger)' }}>{dashboard?.exceptions ?? 0}</strong>
                  <small>Banking discrepancies</small>
                </div>
              </div>

              {/* Settlements panel */}
              <div className="panel table-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent Acquisition Settlements</h2>
                    <p>Separation of duties: preparation, approval, bank execution, and reconciliation.</p>
                  </div>
                  <button className="button secondary small" onClick={() => setTab('seller-settlements')}>
                    View All
                  </button>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Vehicle / Seller</th>
                        <th>Accepted Consideration</th>
                        <th>Documents</th>
                        <th>Settlement State</th>
                        <th>Latest Payout</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.slice(0, 5).map(item => {
                        const payout = item.settlement?.payoutInstructions?.[0];
                        const docsOk = item.documents?.length && item.documents.every(d => ['VERIFIED', 'WAIVED_BY_AUTHORIZED_POLICY'].includes(d.status));
                        return (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.lead.manufacturingYear} {item.lead.make} {item.lead.model}</strong>
                              <span>{item.lead.sellerName} · Ref: <span className="code-pill">{item.lead.referenceCode}</span></span>
                            </td>
                            <td className="money">{money(item.offer.offerAmountPaise)}</td>
                            <td>
                              <span className={`status ${docsOk ? 'success' : 'warning'}`}>
                                <span /> {docsOk ? 'Verified' : 'Pending'}
                              </span>
                            </td>
                            <td>
                              <span className="status neutral"><span /> {text(item.settlementStatus)}</span>
                            </td>
                            <td>
                              {payout ? (
                                <div>
                                  <span className="status neutral"><span /> {text(payout.status)}</span>
                                  <small className="money">{money(payout.amountPaise)}</small>
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>
                              <button
                                className="button secondary small"
                                onClick={() => { setSelectedItem(item); setActiveModal('PAYOUT_MANAGE'); }}
                              >
                                {payout ? 'Manage' : 'Prepare'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {!settlements.length && (
                        <tr key="empty">
                          <td colSpan={6} className="empty-state">No settlement cases found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: SELLER SETTLEMENTS */}
          {tab === 'seller-settlements' && (
            <div className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h2>Seller Acquisition Settlements & Payouts</h2>
                  <p>Masked beneficiary data only. A payout is never treated as paid until independent bank statement evidence is recorded.</p>
                </div>
                <div className="search-input-wrap">
                  <IconSearch />
                  <input
                    placeholder="Search vehicle, seller, ref..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Vehicle / Seller</th>
                      <th>Accepted Consideration</th>
                      <th>Documents</th>
                      <th>Settlement State</th>
                      <th>Latest Payout</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlements
                      .filter(s =>
                        !search ||
                        s.lead.sellerName.toLowerCase().includes(search.toLowerCase()) ||
                        s.lead.referenceCode.toLowerCase().includes(search.toLowerCase()) ||
                        s.lead.make.toLowerCase().includes(search.toLowerCase()) ||
                        s.lead.model.toLowerCase().includes(search.toLowerCase())
                      )
                      .map(item => {
                        const payout = item.settlement?.payoutInstructions?.[0];
                        const docsOk = item.documents?.length && item.documents.every(d => ['VERIFIED', 'WAIVED_BY_AUTHORIZED_POLICY'].includes(d.status));
                        return (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.lead.manufacturingYear} {item.lead.make} {item.lead.model}</strong>
                              <span>{item.lead.sellerName} · Ref: <span className="code-pill">{item.lead.referenceCode}</span></span>
                            </td>
                            <td className="money">{money(item.offer.offerAmountPaise)}</td>
                            <td>
                              <span className={`status ${docsOk ? 'success' : 'warning'}`}>
                                <span /> {docsOk ? 'All Verified' : 'Pending'}
                              </span>
                            </td>
                            <td>
                              <span className="status neutral"><span /> {text(item.settlementStatus)}</span>
                            </td>
                            <td>
                              {payout ? (
                                <div>
                                  <span className="status neutral"><span /> {text(payout.status)}</span>
                                  <span className="money">{money(payout.amountPaise)}</span>
                                  <small>{payout.beneficiaryName} · {payout.beneficiaryAccountMasked}</small>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--muted)' }}>Not Prepared</span>
                              )}
                            </td>
                            <td>
                              <button
                                className="button primary small"
                                onClick={() => { setSelectedItem(item); setActiveModal('PAYOUT_MANAGE'); }}
                              >
                                {payout ? 'Review / Progress' : 'Prepare Payout'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    {!settlements.length && (
                      <tr key="empty">
                        <td colSpan={6} className="empty-state">No settlement cases found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: BUYER COLLECTIONS */}
          {tab === 'buyer-collections' && (
            <div className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h2>Buyer Payment Obligations & Delivery Release</h2>
                  <p>Vehicles remain strictly delivery-locked until 100% of the sale obligation is satisfied.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="button primary small" onClick={() => { setSelectedItem(null); setActiveModal('CREATE_OBLIGATION'); }}>
                    <IconPlus /> Create Obligation
                  </button>
                </div>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Obligation #</th>
                      <th>Buyer</th>
                      <th>Vehicle</th>
                      <th>Total Payable</th>
                      <th>Total Received</th>
                      <th>Remaining Balance</th>
                      <th>Delivery Gate</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obligations
                      .filter(o =>
                        !search ||
                        o.obligationNumber.toLowerCase().includes(search.toLowerCase()) ||
                        o.buyerName.toLowerCase().includes(search.toLowerCase())
                      )
                      .map(ob => {
                        const isClear = ob.deliveryEligible;
                        return (
                          <tr key={ob.id}>
                            <td>
                              <span className="code-pill">{ob.obligationNumber}</span>
                              <small>{formatDate(ob.createdAt)}</small>
                            </td>
                            <td>
                              <strong>{ob.buyerName}</strong>
                              <small>{ob.buyerPhone || ob.buyerEmail || '—'}</small>
                            </td>
                            <td>
                              {ob.stockUnit ? (
                                <div>
                                  <strong>{ob.stockUnit.year} {ob.stockUnit.make} {ob.stockUnit.model}</strong>
                                  <small>VIN: {ob.stockUnit.vin}</small>
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="money">{money(ob.totalPayablePaise)}</td>
                            <td className="money" style={{ color: 'var(--success)' }}>{money(ob.totalReceivedPaise)}</td>
                            <td className="money" style={{ color: ob.remainingBalancePaise === '0' ? 'var(--success)' : 'var(--warning)' }}>
                              {money(ob.remainingBalancePaise)}
                            </td>
                            <td>
                              <span className={`status ${isClear ? 'success' : 'danger'}`}>
                                <span /> {isClear ? 'DELIVERY ELIGIBLE' : 'GATE LOCKED'}
                              </span>
                            </td>
                            <td>
                              <span className="status neutral"><span /> {text(ob.status)}</span>
                            </td>
                            <td>
                              <button
                                className="button secondary small"
                                onClick={() => { setSelectedItem(ob); setActiveModal('VIEW_OBLIGATION_ALLOCATIONS'); }}
                              >
                                Allocations ({ob.allocations?.length || 0})
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    {!obligations.length && (
                      <tr key="empty">
                        <td colSpan={9} className="empty-state">No payment obligations found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: RECEIPTS */}
          {tab === 'receipts' && (
            <div className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h2>Incoming Payment Receipts</h2>
                  <p>Log incoming funds, verify bank credits, and allocate to buyer payment obligations.</p>
                </div>
                <button className="button primary small" onClick={() => { setSelectedItem(null); setActiveModal('RECORD_RECEIPT'); }}>
                  <IconPlus /> Record Receipt
                </button>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Receipt #</th>
                      <th>Payer Name</th>
                      <th>Payment Mode</th>
                      <th>Bank Reference / UTR</th>
                      <th>Total Amount</th>
                      <th>Unapplied Funds</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map(rc => (
                      <tr key={rc.id}>
                        <td>
                          <span className="code-pill">{rc.receiptNumber}</span>
                          <small>{formatDate(rc.receivedAt)}</small>
                        </td>
                        <td>
                          <strong>{rc.payerName}</strong>
                          <small>{rc.payerPhone || '—'}</small>
                        </td>
                        <td>{text(rc.paymentMode)}</td>
                        <td><span className="code-pill">{rc.bankReference || '—'}</span></td>
                        <td className="money">{money(rc.amountPaise)}</td>
                        <td className="money" style={{ color: rc.unappliedAmountPaise === '0' ? 'var(--muted)' : 'var(--warning)' }}>
                          {money(rc.unappliedAmountPaise)}
                        </td>
                        <td>
                          <span className={`status ${rc.status === 'VERIFIED' ? 'success' : 'warning'}`}>
                            <span /> {text(rc.status)}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            {rc.status === 'UNVERIFIED' && (
                              <button
                                className="button primary small"
                                onClick={() => { setSelectedItem(rc); setActiveModal('VERIFY_RECEIPT'); }}
                              >
                                Verify UTR
                              </button>
                            )}
                            {BigInt(rc.unappliedAmountPaise || '0') > 0n && (
                              <button
                                className="button secondary small"
                                onClick={() => { setSelectedItem(rc); setActiveModal('ALLOCATE_RECEIPT'); }}
                              >
                                Allocate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!receipts.length && (
                      <tr key="empty">
                        <td colSpan={8} className="empty-state">No payment receipts found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: REFUNDS */}
          {tab === 'refunds' && (
            <div className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h2>Customer Refunds & Reversals</h2>
                  <p>Governed by independent authorization, bank disbursement recording, and statement reconciliation.</p>
                </div>
                <button className="button primary small" onClick={() => { setSelectedItem(null); setActiveModal('REQUEST_REFUND'); }}>
                  <IconPlus /> Request Refund
                </button>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Case #</th>
                      <th>Beneficiary</th>
                      <th>Reason</th>
                      <th>Refund Amount</th>
                      <th>Bank Reference</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refunds.map(rf => (
                      <tr key={rf.id}>
                        <td>
                          <span className="code-pill">{rf.caseNumber}</span>
                          <small>{formatDate(rf.requestedAt)}</small>
                        </td>
                        <td>
                          <strong>{rf.beneficiaryName}</strong>
                          <small>Acct: {rf.beneficiaryAccountMasked}</small>
                        </td>
                        <td>{text(rf.reason)}</td>
                        <td className="money" style={{ color: 'var(--danger)' }}>{money(rf.refundAmountPaise)}</td>
                        <td><span className="code-pill">{rf.bankReference || '—'}</span></td>
                        <td>
                          <span className={`status ${rf.status === 'RECONCILED' ? 'success' : rf.status === 'REJECTED' ? 'danger' : 'warning'}`}>
                            <span /> {text(rf.status)}
                          </span>
                        </td>
                        <td>
                          <button
                            className="button secondary small"
                            onClick={() => { setSelectedItem(rf); setActiveModal('MANAGE_REFUND'); }}
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!refunds.length && (
                      <tr key="empty">
                        <td colSpan={7} className="empty-state">No refund cases recorded.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: EXPENSES */}
          {tab === 'expenses' && (
            <div className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h2>Vehicle Refurbishment & Direct Expenses</h2>
                  <p>Costs linked to specific vehicle stock units (VIN) to establish actual vehicle profitability.</p>
                </div>
                <button className="button primary small" onClick={() => { setSelectedItem(null); setActiveModal('NEW_EXPENSE'); }}>
                  <IconPlus /> Record Expense
                </button>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Claim #</th>
                      <th>Vehicle Stock Unit</th>
                      <th>Vendor</th>
                      <th>Category</th>
                      <th>Invoice #</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map(ex => (
                      <tr key={ex.id}>
                        <td>
                          <span className="code-pill">{ex.claimNumber}</span>
                          <small>{formatDate(ex.createdAt)}</small>
                        </td>
                        <td>
                          {ex.stockUnit ? (
                            <div>
                              <strong>{ex.stockUnit.year} {ex.stockUnit.make} {ex.stockUnit.model}</strong>
                              <small>VIN: {ex.stockUnit.vin}</small>
                            </div>
                          ) : (
                            <small>Dealership Overhead</small>
                          )}
                        </td>
                        <td>{ex.vendor?.name || '—'}</td>
                        <td>{text(ex.category)}</td>
                        <td>{ex.invoiceNumber || '—'}</td>
                        <td className="money">{money(ex.amountPaise)}</td>
                        <td>
                          <span className={`status ${ex.status === 'PAID' ? 'success' : ex.status === 'APPROVED' ? 'warning' : 'neutral'}`}>
                            <span /> {text(ex.status)}
                          </span>
                        </td>
                        <td>
                          <button
                            className="button secondary small"
                            onClick={() => { setSelectedItem(ex); setActiveModal('MANAGE_EXPENSE'); }}
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!expenses.length && (
                      <tr key="empty">
                        <td colSpan={8} className="empty-state">No expenses recorded.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: VENDORS */}
          {tab === 'vendors' && (
            <div className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h2>Authorized Dealership Vendors & Counterparties</h2>
                  <p>Workshops, spare parts partners, detailers, and logistics counterparties.</p>
                </div>
                <button className="button primary small" onClick={() => { setSelectedItem(null); setActiveModal('NEW_VENDOR'); }}>
                  <IconPlus /> Add Vendor
                </button>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Vendor Name</th>
                      <th>Category</th>
                      <th>GSTIN</th>
                      <th>PAN</th>
                      <th>Bank Account</th>
                      <th>IFSC</th>
                      <th>Contact</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map(v => (
                      <tr key={v.id}>
                        <td><strong>{v.name}</strong></td>
                        <td>{text(v.category)}</td>
                        <td><span className="code-pill">{v.gstin || '—'}</span></td>
                        <td><span className="code-pill">{v.panNumber || '—'}</span></td>
                        <td>{v.bankAccountMasked || '—'}</td>
                        <td><span className="code-pill">{v.ifscCode || '—'}</span></td>
                        <td>
                          <div>{v.phone || '—'}</div>
                          <small>{v.email || ''}</small>
                        </td>
                        <td>
                          <span className={`status ${v.active ? 'success' : 'danger'}`}>
                            <span /> {v.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!vendors.length && (
                      <tr key="empty">
                        <td colSpan={8} className="empty-state">No vendors configured.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 8: BANK ACCOUNTS & RECONCILIATION */}
          {tab === 'banking' && (
            <>
              <div className="metric-grid">
                {bankAccounts.map(b => (
                  <div className="metric-card" key={b.id}>
                    <span>{b.bankName}</span>
                    <strong>{money(b.currentBalancePaise)}</strong>
                    <small>Acct: {b.accountNumberMasked} · IFSC: {b.ifscCode}</small>
                    <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--yellow)' }}>
                      Branch: {b.branchName} · {text(b.accountType)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="panel table-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Bank Statement Entries & Reconciliation</h2>
                    <p>Import corporate bank feeds and match entries to payouts or receipts.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="button secondary small" onClick={() => { setSelectedItem(null); setActiveModal('NEW_BANK_ACCOUNT'); }}>
                      <IconPlus /> Add Account
                    </button>
                    <button className="button primary small" onClick={() => { setSelectedItem(null); setActiveModal('IMPORT_STATEMENT'); }}>
                      <IconUpload /> Import Statement
                    </button>
                  </div>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Narration</th>
                        <th>Reference #</th>
                        <th>Debit</th>
                        <th>Credit</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statements.map(st => (
                        <tr key={st.id}>
                          <td>{formatDate(st.entryDate)}</td>
                          <td><strong>{st.narration}</strong></td>
                          <td><span className="code-pill">{st.referenceNumber || '—'}</span></td>
                          <td className="money" style={{ color: BigInt(st.debitPaise || '0') > 0n ? 'var(--danger)' : 'var(--muted)' }}>
                            {money(st.debitPaise)}
                          </td>
                          <td className="money" style={{ color: BigInt(st.creditPaise || '0') > 0n ? 'var(--success)' : 'var(--muted)' }}>
                            {money(st.creditPaise)}
                          </td>
                          <td>
                            <span className={`status ${st.status === 'MATCHED' ? 'success' : 'warning'}`}>
                              <span /> {text(st.status)}
                            </span>
                          </td>
                          <td>
                            {st.status === 'UNMATCHED' && (
                              <button
                                className="button primary small"
                                onClick={() => { setSelectedItem(st); setActiveModal('MATCH_STATEMENT_ENTRY'); }}
                              >
                                Match Entry
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!statements.length && (
                        <tr key="empty">
                          <td colSpan={7} className="empty-state">No bank statement entries imported.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* TAB 9: EXCEPTIONS */}
          {tab === 'exceptions' && (
            <div className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h2>Reconciliation Exception Queue</h2>
                  <p>Discrepancies identified between bank statements, payouts, receipts, and invoices.</p>
                </div>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Reported Date</th>
                      <th>Exception Type</th>
                      <th>Details</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exceptions.map(ex => (
                      <tr key={ex.id}>
                        <td>{formatDate(ex.createdAt)}</td>
                        <td>
                          <span className="status danger"><span /> {text(ex.exceptionType)}</span>
                        </td>
                        <td>{ex.details}</td>
                        <td>
                          <span className={`status ${ex.status === 'RESOLVED' ? 'success' : 'warning'}`}>
                            <span /> {text(ex.status)}
                          </span>
                        </td>
                        <td>
                          {ex.status === 'OPEN' && (
                            <button
                              className="button primary small"
                              onClick={() => { setSelectedItem(ex); setActiveModal('RESOLVE_EXCEPTION'); }}
                            >
                              Resolve
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!exceptions.length && (
                      <tr key="empty">
                        <td colSpan={5} className="empty-state">No reconciliation exceptions open.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 10: LEDGER & COA */}
          {tab === 'ledger' && (
            <>
              <div className="panel table-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Dealership Chart of Accounts</h2>
                    <p>Standardized dealership accounting code structure.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="button secondary small" onClick={() => runAction(() => financeApi.seedChartOfAccounts(user))}>
                      Seed Dealership Accounts
                    </button>
                    <button className="button primary small" onClick={() => { setSelectedItem(null); setActiveModal('POST_JOURNAL'); }}>
                      <IconPlus /> Post Journal Entry
                    </button>
                  </div>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Account Code</th>
                        <th>Account Name</th>
                        <th>Category</th>
                        <th>Normal Balance</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map(acc => (
                        <tr key={acc.id}>
                          <td><span className="code-pill">{acc.code}</span></td>
                          <td><strong>{acc.name}</strong></td>
                          <td>{text(acc.category)}</td>
                          <td>{acc.normalBalance}</td>
                          <td>
                            <span className={`status ${acc.active ? 'success' : 'danger'}`}>
                              <span /> {acc.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {!accounts.length && (
                        <tr key="empty">
                          <td colSpan={5} className="empty-state">No accounts configured. Click "Seed Dealership Accounts" to initialize.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel table-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Posted Financial Journal Entries</h2>
                    <p>Strict double-entry journal logs where total debits equal total credits.</p>
                  </div>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Entry #</th>
                        <th>Posting Date</th>
                        <th>Period</th>
                        <th>Narration</th>
                        <th>Lines</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journals.map(j => {
                        const dr = j.lines.reduce((s, l) => s + BigInt(l.debitPaise || '0'), 0n);
                        const cr = j.lines.reduce((s, l) => s + BigInt(l.creditPaise || '0'), 0n);
                        return (
                          <tr key={j.id}>
                            <td><span className="code-pill">{j.entryNumber}</span></td>
                            <td>{formatDate(j.postingDate)}</td>
                            <td><strong>{j.period.periodName}</strong></td>
                            <td>{j.description}</td>
                            <td>
                              <div style={{ fontSize: '0.82rem' }}>
                                <span style={{ color: 'var(--success)' }}>Dr: {money(dr.toString())}</span>
                                {' / '}
                                <span style={{ color: 'var(--yellow)' }}>Cr: {money(cr.toString())}</span>
                              </div>
                              <small>{j.lines.length} lines</small>
                            </td>
                            <td>
                              <span className="status success"><span /> {text(j.status)}</span>
                            </td>
                          </tr>
                        );
                      })}
                      {!journals.length && (
                        <tr key="empty">
                          <td colSpan={6} className="empty-state">No journal entries posted yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* TAB 11: INVOICES */}
          {tab === 'invoices' && (
            <div className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h2>Commercial Vehicle Sales Tax Invoices</h2>
                  <p>Statutory GST invoices and commercial sale documentation with CGST and SGST breakdown.</p>
                </div>
                <button className="button primary small" onClick={() => { setSelectedItem(null); setActiveModal('ISSUE_INVOICE'); }}>
                  <IconPlus /> Issue Invoice
                </button>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Issued Date</th>
                      <th>Buyer Name</th>
                      <th>Vehicle</th>
                      <th>Subtotal</th>
                      <th>CGST (9%)</th>
                      <th>SGST (9%)</th>
                      <th>Total Invoiced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => (
                      <tr key={inv.id}>
                        <td><span className="code-pill">{inv.invoiceNumber}</span></td>
                        <td>{formatDate(inv.issuedAt)}</td>
                        <td>
                          <strong>{inv.buyerName}</strong>
                          <small>GSTIN: {inv.buyerGstin || 'Unregistered Consumer'}</small>
                        </td>
                        <td>
                          {inv.stockUnit ? (
                            <div>
                              <strong>{inv.stockUnit.year} {inv.stockUnit.make} {inv.stockUnit.model}</strong>
                              <small>VIN: {inv.stockUnit.vin}</small>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="money">{money(inv.subtotalPaise)}</td>
                        <td className="money">{money(inv.cgstPaise)}</td>
                        <td className="money">{money(inv.sgstPaise)}</td>
                        <td className="money" style={{ color: 'var(--yellow)' }}>{money(inv.totalPaise)}</td>
                      </tr>
                    ))}
                    {!invoices.length && (
                      <tr key="empty">
                        <td colSpan={8} className="empty-state">No commercial invoices issued.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 12: PROFITABILITY */}
          {tab === 'profitability' && (
            <div className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h2>Vehicle Unit Profitability Matrix</h2>
                  <p>Real-time vehicle-level margins comparing acquisition cost, refurbishment expenses, realized sale price, and gross margin %.</p>
                </div>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Vehicle Stock Unit</th>
                      <th>Acquisition Cost</th>
                      <th>Refurbishment Costs</th>
                      <th>Total Capital Invested</th>
                      <th>Realized Sale Price</th>
                      <th>Gross Margin</th>
                      <th>Margin %</th>
                      <th>Delivery Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitability.map(p => {
                      const isProfit = BigInt(p.realizedGrossMarginPaise || '0') >= 0n;
                      return (
                        <tr key={p.stockUnitId}>
                          <td>
                            <strong>{p.year} {p.make} {p.model}</strong>
                            <small>VIN: <span className="code-pill">{p.vin}</span></small>
                          </td>
                          <td className="money">{money(p.acquisitionCostPaise)}</td>
                          <td className="money" style={{ color: 'var(--warning)' }}>{money(p.refurbishmentExpensesPaise)}</td>
                          <td className="money">{money(p.totalInvestedPaise)}</td>
                          <td className="money" style={{ color: 'var(--success)' }}>{money(p.realizedSalePricePaise)}</td>
                          <td className="money" style={{ color: isProfit ? 'var(--success)' : 'var(--danger)' }}>
                            {money(p.realizedGrossMarginPaise)}
                          </td>
                          <td>
                            {(() => {
                              const marginPct = typeof p.realizedGrossMarginPercent === 'number' && !isNaN(p.realizedGrossMarginPercent)
                                ? p.realizedGrossMarginPercent
                                : 0;
                              return (
                                <span className={`status ${marginPct >= 8 ? 'success' : marginPct > 0 ? 'warning' : 'danger'}`}>
                                  <span /> {marginPct.toFixed(1)}%
                                </span>
                              );
                            })()}
                          </td>
                          <td>
                            <span className={`status ${p.deliveryEligible ? 'success' : 'neutral'}`}>
                              <span /> {p.deliveryEligible ? 'DELIVERY READY' : 'IN INVENTORY'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {!profitability.length && (
                      <tr key="empty">
                        <td colSpan={8} className="empty-state">No vehicle units available in profitability matrix.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 13: AUDIT TRAIL */}
          {tab === 'audit' && (
            <div className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h2>Immutable Financial Audit Trail</h2>
                  <p>Chronological system audit logs of all money movements and authorizations.</p>
                </div>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Action</th>
                      <th>Actor</th>
                      <th>Entity Type</th>
                      <th>Entity ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditTrail.map(a => (
                      <tr key={a.id}>
                        <td>{formatDate(a.createdAt)}</td>
                        <td><span className="code-pill">{a.action}</span></td>
                        <td>{a.actorEmail || 'System / Automated'}</td>
                        <td>{a.entityType}</td>
                        <td><span className="code-pill">{a.entityId}</span></td>
                      </tr>
                    ))}
                    {!auditTrail.length && (
                      <tr key="empty">
                        <td colSpan={5} className="empty-state">No audit logs recorded yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL 1: PAYOUT PREPARE & PROGRESS */}
      {activeModal === 'PAYOUT_MANAGE' && selectedItem && (
        <PayoutManageDialog
          item={selectedItem}
          user={user}
          busy={busy}
          bankAccounts={bankAccounts}
          onClose={() => { setActiveModal(null); setSelectedItem(null); }}
          onAction={runAction}
        />
      )}

      {/* MODAL 2: RECORD INCOMING RECEIPT */}
      {activeModal === 'RECORD_RECEIPT' && (
        <RecordReceiptDialog
          user={user}
          busy={busy}
          bankAccounts={bankAccounts}
          onClose={() => setActiveModal(null)}
          onAction={runAction}
        />
      )}

      {/* MODAL 3: VERIFY INCOMING RECEIPT */}
      {activeModal === 'VERIFY_RECEIPT' && selectedItem && (
        <VerifyReceiptDialog
          receipt={selectedItem}
          user={user}
          busy={busy}
          onClose={() => { setActiveModal(null); setSelectedItem(null); }}
          onAction={runAction}
        />
      )}

      {/* MODAL 4: ALLOCATE RECEIPT */}
      {activeModal === 'ALLOCATE_RECEIPT' && selectedItem && (
        <AllocateReceiptDialog
          receipt={selectedItem}
          obligations={obligations}
          user={user}
          busy={busy}
          onClose={() => { setActiveModal(null); setSelectedItem(null); }}
          onAction={runAction}
        />
      )}

      {/* MODAL 5: CREATE BUYER OBLIGATION */}
      {activeModal === 'CREATE_OBLIGATION' && (
        <CreateObligationDialog
          user={user}
          busy={busy}
          onClose={() => setActiveModal(null)}
          onAction={runAction}
        />
      )}

      {/* MODAL 6: VIEW OBLIGATION ALLOCATIONS */}
      {activeModal === 'VIEW_OBLIGATION_ALLOCATIONS' && selectedItem && (
        <ViewObligationAllocationsDialog
          obligation={selectedItem}
          onClose={() => { setActiveModal(null); setSelectedItem(null); }}
        />
      )}

      {/* MODAL 7: REQUEST REFUND */}
      {activeModal === 'REQUEST_REFUND' && (
        <RequestRefundDialog
          user={user}
          busy={busy}
          receipts={receipts}
          obligations={obligations}
          onClose={() => setActiveModal(null)}
          onAction={runAction}
        />
      )}

      {/* MODAL 8: MANAGE REFUND */}
      {activeModal === 'MANAGE_REFUND' && selectedItem && (
        <ManageRefundDialog
          refund={selectedItem}
          user={user}
          busy={busy}
          bankAccounts={bankAccounts}
          onClose={() => { setActiveModal(null); setSelectedItem(null); }}
          onAction={runAction}
        />
      )}

      {/* MODAL 9: NEW VEHICLE EXPENSE */}
      {activeModal === 'NEW_EXPENSE' && (
        <NewExpenseDialog
          user={user}
          busy={busy}
          vendors={vendors}
          profitability={profitability}
          onClose={() => setActiveModal(null)}
          onAction={runAction}
        />
      )}

      {/* MODAL 10: MANAGE EXPENSE CLAIM */}
      {activeModal === 'MANAGE_EXPENSE' && selectedItem && (
        <ManageExpenseDialog
          expense={selectedItem}
          user={user}
          busy={busy}
          bankAccounts={bankAccounts}
          onClose={() => { setActiveModal(null); setSelectedItem(null); }}
          onAction={runAction}
        />
      )}

      {/* MODAL 11: NEW VENDOR */}
      {activeModal === 'NEW_VENDOR' && (
        <NewVendorDialog
          user={user}
          busy={busy}
          onClose={() => setActiveModal(null)}
          onAction={runAction}
        />
      )}

      {/* MODAL 12: NEW BANK ACCOUNT */}
      {activeModal === 'NEW_BANK_ACCOUNT' && (
        <NewBankAccountDialog
          user={user}
          busy={busy}
          onClose={() => setActiveModal(null)}
          onAction={runAction}
        />
      )}

      {/* MODAL 13: IMPORT STATEMENT */}
      {activeModal === 'IMPORT_STATEMENT' && (
        <ImportStatementDialog
          user={user}
          busy={busy}
          bankAccounts={bankAccounts}
          onClose={() => setActiveModal(null)}
          onAction={runAction}
        />
      )}

      {/* MODAL 14: MATCH STATEMENT ENTRY */}
      {activeModal === 'MATCH_STATEMENT_ENTRY' && selectedItem && (
        <MatchStatementDialog
          entry={selectedItem}
          user={user}
          busy={busy}
          receipts={receipts}
          settlements={settlements}
          expenses={expenses}
          onClose={() => { setActiveModal(null); setSelectedItem(null); }}
          onAction={runAction}
        />
      )}

      {/* MODAL 15: RESOLVE EXCEPTION */}
      {activeModal === 'RESOLVE_EXCEPTION' && selectedItem && (
        <ResolveExceptionDialog
          exception={selectedItem}
          user={user}
          busy={busy}
          onClose={() => { setActiveModal(null); setSelectedItem(null); }}
          onAction={runAction}
        />
      )}

      {/* MODAL 16: POST JOURNAL ENTRY */}
      {activeModal === 'POST_JOURNAL' && (
        <PostJournalDialog
          user={user}
          busy={busy}
          accounts={accounts}
          periods={periods}
          onClose={() => setActiveModal(null)}
          onAction={runAction}
        />
      )}

      {/* MODAL 17: ISSUE INVOICE */}
      {activeModal === 'ISSUE_INVOICE' && (
        <IssueInvoiceDialog
          user={user}
          busy={busy}
          obligations={obligations}
          onClose={() => setActiveModal(null)}
          onAction={runAction}
        />
      )}
      </div>
    </>
  );
}

// --------------------------------------------------------------------------
// Multi-Factor Authentication Challenge Dialog (Exact Admin Portal Pattern)
// --------------------------------------------------------------------------

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
    const el = ref.current;
    if (el && !el.open) {
      try {
        el.showModal();
      } catch {
        el.setAttribute('open', '');
      }
    }
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
        try { recaptchaVerifierRef.current.clear(); } catch {}
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
            <IconCross />
          </button>
        </header>

        {error && <div className="alert error" role="alert">{error}</div>}

        <p className="helper" style={{ margin: '1rem 0' }}>
          An SMS with a 6-digit verification code has been dispatched to <strong>{phoneDisplay}</strong>. Enter the code below to complete authorization.
        </p>

        <label style={{ display: 'block', margin: '1rem 0' }}>
          Verification Code
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
            required
            style={{ fontSize: '1.25rem', letterSpacing: '0.25em', textAlign: 'center' }}
          />
        </label>

        <footer>
          <button
            type="button"
            className="button secondary"
            disabled={sending || verifying}
            onClick={() => void sendOtp()}
          >
            {sending ? 'Sending...' : 'Resend Code'}
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={!verificationId || code.trim().length !== 6 || verifying}
          >
            {verifying ? 'Verifying...' : 'Verify & Enter'}
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
    const el = ref.current;
    if (el && !el.open) {
      try {
        el.showModal();
      } catch {
        el.setAttribute('open', '');
      }
    }
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
              <IconCross />
            </button>
          </header>
          {error && <div className="alert error" role="alert">{error}</div>}
          <p className="helper" style={{ margin: '1rem 0' }}>
            Privileged Finance access requires two-step verification. Enter your mobile phone number to receive an SMS verification code.
          </p>
          <label>
            Phone number (with country code) <span aria-hidden="true">*</span>
            <input
              name="phone"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+91 9876543210"
              required
              autoFocus
            />
          </label>
          <footer>
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? 'Sending SMS…' : 'Send Code'}
            </button>
          </footer>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp}>
          <header>
            <div>
              <p className="eyebrow">Multi-Factor Authentication</p>
              <h2>Confirm Phone Number</h2>
            </div>
            <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
              <IconCross />
            </button>
          </header>
          {error && <div className="alert error" role="alert">{error}</div>}
          <p className="helper" style={{ margin: '1rem 0' }}>
            Enter the 6-digit verification code sent to <strong>{phone}</strong>.
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
              style={{ fontSize: '1.25rem', letterSpacing: '0.25em', textAlign: 'center' }}
            />
          </label>
          <footer>
            <button type="button" className="button secondary" onClick={() => setStep('phone')}>
              Change Number
            </button>
            <button className="button primary" disabled={busy || code.length !== 6}>
              {busy ? 'Enrolling…' : 'Complete Enrollment'}
            </button>
          </footer>
        </form>
      )}
    </dialog>
  );
}

// --------------------------------------------------------------------------
// MODAL DIALOGS (Using standard ModalDialog component matching Admin Portal)
// --------------------------------------------------------------------------

function PayoutManageDialog({
  item,
  user,
  busy,
  bankAccounts,
  onClose,
  onAction,
}: {
  item: SettlementCase;
  user: User;
  busy: boolean;
  bankAccounts: CompanyBankAccount[];
  onClose: () => void;
  onAction: (task: () => Promise<unknown>) => void;
}) {
  const payout = item.settlement?.payoutInstructions?.[0];
  const [splitPayoff, setSplitPayoff] = useState(false);

  const prepare = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: any = {
      beneficiaryName: String(fd.get('beneficiaryName')),
      beneficiaryAccountMasked: String(fd.get('beneficiaryAccountMasked')),
      paymentMethod: String(fd.get('paymentMethod')),
      idempotencyKey: crypto.randomUUID(),
    };
    if (splitPayoff) {
      body.lenderName = String(fd.get('lenderName'));
      body.lenderAccountMasked = String(fd.get('lenderAccountMasked'));
      const lenderPaise = BigInt(Math.round(Number(fd.get('lenderPayoffRupees')) * 100));
      const sellerPaise = BigInt(Math.round(Number(fd.get('sellerPayableRupees')) * 100));
      body.lenderPayoffPaise = lenderPaise.toString();
      body.sellerPayablePaise = sellerPaise.toString();
    }
    onAction(() => financeApi.preparePayout(user, item.id, body));
  };

  const decide = (decision: 'APPROVE' | 'REJECT') => {
    onAction(() =>
      financeApi.decidePayout(user, payout!.id, {
        version: payout!.version,
        decision,
        reason: 'Authorized review decision recorded in treasury workflow.',
      })
    );
  };

  const execute = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const bankAccountId = String(fd.get('companyBankAccountId') || '').trim();
    onAction(() =>
      financeApi.executePayout(user, payout!.id, {
        version: payout!.version,
        bankReference: String(fd.get('bankReference')).trim(),
        companyBankAccountId: bankAccountId || undefined,
        notes: String(fd.get('notes') || '').trim() || 'Controlled transfer executed via corporate netbanking.',
      })
    );
  };

  const reconcile = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onAction(() =>
      financeApi.reconcilePayout(user, payout!.id, {
        version: payout!.version,
        kind: 'MANUAL_BANK_CONFIRMATION',
        reference: String(fd.get('reference')),
        evidenceUri: String(fd.get('evidenceUri') || 'https://private-evidence.vmotiv.in/bank-advice.pdf'),
        observedAt: new Date().toISOString(),
      })
    );
  };

  return (
    <ModalDialog className="dialog" onClose={onClose}>
      <header>
        <div>
          <p className="eyebrow">SELLER ACQUISITION SETTLEMENT</p>
          <h2>{item.lead.sellerName}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose}><IconCross /></button>
      </header>

      <div className="alert info" style={{ margin: '1rem 0' }}>
        Vehicle: <strong>{item.lead.manufacturingYear} {item.lead.make} {item.lead.model}</strong>
        <br />
        Accepted Consideration: <strong>{money(item.offer.offerAmountPaise)}</strong>
      </div>

      {!payout ? (
        <form onSubmit={prepare}>
          <div className="form-grid">
            <div className="full">
              <label>
                Beneficiary Legal Name
                <input name="beneficiaryName" defaultValue={item.lead.sellerName} required minLength={2} />
              </label>
            </div>

            <div>
              <label>
                Masked Account (Last 4 digits visible)
                <input name="beneficiaryAccountMasked" placeholder="XXXX 1234" required pattern="[A-Za-z0-9* -]+" />
              </label>
            </div>

            <div>
              <label>
                Payment Method
                <select name="paymentMethod">
                  <option value="NEFT">NEFT</option>
                  <option value="RTGS">RTGS</option>
                  <option value="IMPS">IMPS</option>
                  <option value="MANUAL_BANK_TRANSFER">Corporate Portal Transfer</option>
                </select>
              </label>
            </div>

            <div className="full">
              <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={splitPayoff}
                  onChange={e => setSplitPayoff(e.target.checked)}
                  style={{ width: 'auto', minHeight: 'auto', margin: 0 }}
                />
                <span>Split Beneficiary Payoff (Direct Lender Hypothecation Release)</span>
              </label>
            </div>

            {splitPayoff && (
              <>
                <div>
                  <label>
                    Lender Legal Name
                    <input name="lenderName" placeholder="e.g. HDFC Bank Ltd" required={splitPayoff} />
                  </label>
                </div>
                <div>
                  <label>
                    Lender Payout Account (Masked)
                    <input name="lenderAccountMasked" placeholder="XXXX 9876" required={splitPayoff} />
                  </label>
                </div>
                <div>
                  <label>
                    Lender Foreclosure Amount (₹)
                    <input name="lenderPayoffRupees" type="number" step="1" required={splitPayoff} placeholder="250000" />
                  </label>
                </div>
                <div>
                  <label>
                    Seller Net Proceeds (₹)
                    <input name="sellerPayableRupees" type="number" step="1" required={splitPayoff} placeholder="350000" />
                  </label>
                </div>
              </>
            )}
          </div>

          <footer>
            <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? 'Preparing...' : 'Create Payout Instruction'}
            </button>
          </footer>
        </form>
      ) : (
        <div>
          <div className="form-grid">
            <div>
              <span className="helper">Payout Status</span>
              <strong>{text(payout.status)}</strong>
            </div>
            <div>
              <span className="helper">Disbursement Amount</span>
              <strong className="money" style={{ fontSize: '1.25rem' }}>{money(payout.amountPaise)}</strong>
            </div>
            <div>
              <span className="helper">Beneficiary</span>
              <strong>{payout.beneficiaryName}</strong> ({payout.beneficiaryAccountMasked})
            </div>
            <div>
              <span className="helper">Payment Method</span>
              <strong>{text(payout.paymentMethod)}</strong>
            </div>
          </div>

          {payout.status === 'DRAFT' && (
            <footer>
              <button
                type="button"
                className="button primary"
                disabled={busy}
                onClick={() => onAction(() => financeApi.submitPayout(user, payout.id, payout.version))}
              >
                Submit for Approval
              </button>
            </footer>
          )}

          {payout.status === 'APPROVAL_PENDING' && (
            <footer>
              <button type="button" className="button danger" disabled={busy} onClick={() => decide('REJECT')}>
                Reject / Put on Hold
              </button>
              <button type="button" className="button primary" disabled={busy} onClick={() => decide('APPROVE')}>
                Approve Payout
              </button>
            </footer>
          )}

          {payout.status === 'APPROVED' && (
            <form onSubmit={execute}>
              <div className="form-grid">
                <div>
                  <label>
                    Paying Bank Account
                    <select name="companyBankAccountId">
                      {bankAccounts.map(b => (
                        <option key={b.id} value={b.id}>{b.bankName} ({b.accountNumberMasked})</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div>
                  <label>
                    Bank Transfer Reference / UTR
                    <input name="bankReference" placeholder="UTR123456789" required />
                  </label>
                </div>
              </div>
              <footer>
                <button type="submit" className="button primary" disabled={busy}>
                  Record Execution
                </button>
              </footer>
            </form>
          )}

          {payout.status === 'RECONCILIATION_PENDING' && (
            <form onSubmit={reconcile}>
              <div className="form-grid">
                <div>
                  <label>
                    Statement Reference
                    <input name="reference" defaultValue={payout.bankReference || 'MATCH'} required />
                  </label>
                </div>
                <div>
                  <label>
                    Evidence Document URI
                    <input name="evidenceUri" defaultValue="https://private-evidence.vmotiv.in/advice.pdf" />
                  </label>
                </div>
              </div>
              <footer>
                <button type="submit" className="button primary" disabled={busy}>
                  Confirm Reconciliation
                </button>
              </footer>
            </form>
          )}
        </div>
      )}
    </ModalDialog>
  );
}

function RecordReceiptDialog({
  user,
  busy,
  bankAccounts,
  onClose,
  onAction,
}: {
  user: User;
  busy: boolean;
  bankAccounts: CompanyBankAccount[];
  onClose: () => void;
  onAction: (task: () => Promise<unknown>) => void;
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amountPaise = BigInt(Math.round(Number(fd.get('amountRupees')) * 100)).toString();

    onAction(() =>
      financeApi.recordReceipt(user, {
        payerName: String(fd.get('payerName')),
        payerPhone: String(fd.get('payerPhone') || ''),
        paymentMode: String(fd.get('paymentMode')),
        bankReference: String(fd.get('bankReference') || ''),
        companyBankAccountId: String(fd.get('companyBankAccountId') || ''),
        amountPaise,
        evidenceUri: String(fd.get('evidenceUri') || ''),
      })
    );
  };

  return (
    <ModalDialog className="dialog" onClose={onClose}>
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">CUSTOMER COLLECTIONS</p>
            <h2>Record Incoming Payment Receipt</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><IconCross /></button>
        </header>

        <div className="form-grid">
          <div>
            <label>
              Payer Legal Name
              <input name="payerName" required minLength={2} placeholder="Rahul Sharma" />
            </label>
          </div>
          <div>
            <label>
              Payer Contact Phone
              <input name="payerPhone" placeholder="+91 98765 43210" />
            </label>
          </div>
          <div>
            <label>
              Amount Received (₹ Rupees)
              <input name="amountRupees" type="number" step="1" required min="1" placeholder="50000" />
            </label>
          </div>
          <div>
            <label>
              Payment Mode
              <select name="paymentMode">
                <option value="IMPS">IMPS</option>
                <option value="NEFT">NEFT</option>
                <option value="RTGS">RTGS</option>
                <option value="UPI">UPI</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </label>
          </div>
          <div>
            <label>
              Bank Reference / UTR
              <input name="bankReference" placeholder="UTR/Transaction Ref" />
            </label>
          </div>
          <div>
            <label>
              Company Bank Account
              <select name="companyBankAccountId">
                <option value="">Select Account</option>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>{b.bankName} ({b.accountNumberMasked})</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Recording...' : 'Record Receipt'}
          </button>
        </footer>
      </form>
    </ModalDialog>
  );
}

function VerifyReceiptDialog({
  receipt,
  user,
  busy,
  onClose,
  onAction,
}: {
  receipt: IncomingReceipt;
  user: User;
  busy: boolean;
  onClose: () => void;
  onAction: (task: () => Promise<unknown>) => void;
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onAction(() =>
      financeApi.verifyReceipt(user, receipt.id, {
        notes: String(fd.get('notes') || 'Verified'),
        evidenceUri: String(fd.get('evidenceUri') || receipt.evidenceUri || ''),
      })
    );
  };

  return (
    <ModalDialog className="dialog compact" onClose={onClose}>
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">PAYMENT VERIFICATION</p>
            <h2>Verify {receipt.receiptNumber}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><IconCross /></button>
        </header>

        <div className="alert info" style={{ margin: '1rem 0' }}>
          Payer: <strong>{receipt.payerName}</strong> · Amount: <strong>{money(receipt.amountPaise)}</strong>
          <br />
          UTR / Ref: <strong>{receipt.bankReference || 'None'}</strong>
        </div>

        <label style={{ display: 'block', margin: '1rem 0' }}>
          Verification Notes
          <input name="notes" defaultValue="Confirmed funds settled in company bank statement." />
        </label>

        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Verifying...' : 'Confirm Verification'}
          </button>
        </footer>
      </form>
    </ModalDialog>
  );
}

function AllocateReceiptDialog({
  receipt,
  obligations,
  user,
  busy,
  onClose,
  onAction,
}: {
  receipt: IncomingReceipt;
  obligations: BuyerPaymentObligation[];
  user: User;
  busy: boolean;
  onClose: () => void;
  onAction: (task: () => Promise<unknown>) => void;
}) {
  const [selectedObligationId, setSelectedObligationId] = useState(obligations[0]?.id || '');
  const unappliedRupees = Number(BigInt(receipt.unappliedAmountPaise || '0') / 100n);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const rupees = Number(fd.get('amountRupees'));
    const amountPaise = BigInt(Math.round(rupees * 100)).toString();

    onAction(() =>
      financeApi.allocateReceipt(user, receipt.id, {
        obligationId: selectedObligationId,
        amountPaise,
      })
    );
  };

  return (
    <ModalDialog className="dialog" onClose={onClose}>
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">FUNDS APPLICATION</p>
            <h2>Allocate Receipt Funds</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><IconCross /></button>
        </header>

        <div className="alert info" style={{ margin: '1rem 0' }}>
          Receipt: <strong>{receipt.receiptNumber}</strong> · Unapplied Funds: <strong>{money(receipt.unappliedAmountPaise)}</strong>
        </div>

        <div className="form-grid single">
          <div>
            <label>
              Select Buyer Payment Obligation
              <select value={selectedObligationId} onChange={e => setSelectedObligationId(e.target.value)}>
                {obligations.map(ob => (
                  <option key={ob.id} value={ob.id}>
                    {ob.obligationNumber} - {ob.buyerName} (Remaining: {money(ob.remainingBalancePaise)})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <label>
              Amount to Allocate (₹ Rupees)
              <input
                name="amountRupees"
                type="number"
                step="1"
                required
                min="1"
                max={unappliedRupees}
                defaultValue={unappliedRupees}
              />
            </label>
          </div>
        </div>

        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy || !selectedObligationId}>
            {busy ? 'Allocating...' : 'Apply Funds'}
          </button>
        </footer>
      </form>
    </ModalDialog>
  );
}

function CreateObligationDialog({
  user,
  busy,
  onClose,
  onAction,
}: {
  user: User;
  busy: boolean;
  onClose: () => void;
  onAction: (task: () => Promise<unknown>) => void;
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const salePricePaise = BigInt(Math.round(Number(fd.get('salePriceRupees')) * 100)).toString();
    const depositPaise = BigInt(Math.round(Number(fd.get('depositRupees') || 0) * 100)).toString();
    const emailVal = String(fd.get('buyerEmail') || '').trim();
    const phoneVal = String(fd.get('buyerPhone') || '').trim();

    onAction(() =>
      financeApi.createObligation(user, {
        buyerName: String(fd.get('buyerName')),
        buyerEmail: emailVal.length > 0 ? emailVal : undefined,
        buyerPhone: phoneVal.length > 0 ? phoneVal : undefined,
        salePricePaise,
        bookingDepositPaise: depositPaise,
      })
    );
  };

  return (
    <ModalDialog className="dialog" onClose={onClose}>
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">BUYER COMMERCIAL RECORD</p>
            <h2>Create Payment Obligation</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><IconCross /></button>
        </header>

        <div className="form-grid">
          <div>
            <label>
              Buyer Legal Name <span aria-hidden="true">*</span>
              <input name="buyerName" required minLength={2} placeholder="Vikram Malhotra" />
            </label>
          </div>
          <div>
            <label>
              Buyer Phone Number
              <input name="buyerPhone" placeholder="+91 98765 43210" />
            </label>
          </div>
          <div>
            <label>
              Buyer Email Address
              <input name="buyerEmail" type="email" placeholder="vikram@example.com" />
            </label>
          </div>
          <div>
            <label>
              Sale Price (₹ Rupees) <span aria-hidden="true">*</span>
              <input name="salePriceRupees" type="number" step="1" required min="1" placeholder="1200000" />
            </label>
          </div>
          <div>
            <label>
              Booking Deposit Credit (₹)
              <input name="depositRupees" type="number" step="1" defaultValue="0" />
            </label>
          </div>
        </div>

        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Creating...' : 'Create Obligation'}
          </button>
        </footer>
      </form>
    </ModalDialog>
  );
}

function ViewObligationAllocationsDialog({
  obligation,
  onClose,
}: {
  obligation: BuyerPaymentObligation;
  onClose: () => void;
}) {
  return (
    <ModalDialog className="dialog wide" onClose={onClose}>
      <div>
        <header>
          <div>
            <p className="eyebrow">ALLOCATION BREAKDOWN</p>
            <h2>{obligation.obligationNumber} — {obligation.buyerName}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><IconCross /></button>
        </header>

        <div className="alert info" style={{ margin: '1rem 0' }}>
          Payable: <strong>{money(obligation.totalPayablePaise)}</strong> · Received: <strong>{money(obligation.totalReceivedPaise)}</strong> · Remaining: <strong>{money(obligation.remainingBalancePaise)}</strong>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Receipt #</th>
                <th>Mode</th>
                <th>Bank Ref / UTR</th>
                <th>Allocated Amount</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {obligation.allocations?.map(al => (
                <tr key={al.id}>
                  <td><span className="code-pill">{al.receipt?.receiptNumber}</span></td>
                  <td>{text(al.receipt?.paymentMode)}</td>
                  <td><span className="code-pill">{al.receipt?.bankReference || '—'}</span></td>
                  <td className="money" style={{ color: 'var(--success)' }}>{money(al.amountPaise)}</td>
                  <td>{formatDate(al.allocatedAt)}</td>
                </tr>
              ))}
              {!obligation.allocations?.length && (
                <tr key="empty">
                  <td colSpan={5} className="empty-state">No payment allocations recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Close</button>
        </footer>
      </div>
    </ModalDialog>
  );
}

function RequestRefundDialog({
  user,
  busy,
  receipts,
  obligations,
  onClose,
  onAction,
}: {
  user: User;
  busy: boolean;
  receipts: IncomingReceipt[];
  obligations: BuyerPaymentObligation[];
  onClose: () => void;
  onAction: (task: () => Promise<unknown>) => void;
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amountPaise = BigInt(Math.round(Number(fd.get('amountRupees')) * 100)).toString();
    const obligationId = String(fd.get('obligationId') || '') || undefined;
    const selectedObligation = obligations.find(o => o.id === obligationId);
    const rawNotes = String(fd.get('notes') || '').trim();

    onAction(() =>
      financeApi.requestRefund(user, {
        beneficiaryName: String(fd.get('beneficiaryName')).trim(),
        beneficiaryAccountMasked: String(fd.get('beneficiaryAccountMasked')).trim(),
        reason: String(fd.get('reason')),
        refundAmountPaise: amountPaise,
        requestedAmountPaise: amountPaise,
        customerId: selectedObligation?.customerId || selectedObligation?.buyerUserId,
        receiptId: String(fd.get('receiptId') || '') || undefined,
        obligationId,
        notes: rawNotes.length >= 5 ? rawNotes : 'Customer refund requested via finance portal.',
      })
    );
  };

  return (
    <ModalDialog className="dialog" onClose={onClose}>
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">REFUND INITIATION</p>
            <h2>Request Customer Refund</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><IconCross /></button>
        </header>

        <div className="form-grid">
          <div>
            <label>
              Beneficiary Legal Name
              <input name="beneficiaryName" required minLength={2} placeholder="Rahul Sharma" />
            </label>
          </div>
          <div>
            <label>
              Beneficiary Masked Account
              <input name="beneficiaryAccountMasked" required placeholder="XXXX 1234" />
            </label>
          </div>
          <div>
            <label>
              Refund Amount (₹ Rupees)
              <input name="amountRupees" type="number" step="1" required min="1" placeholder="25000" />
            </label>
          </div>
          <div>
            <label>
              Refund Reason
              <select name="reason">
                <option value="BOOKING_CANCELLATION">Booking Cancellation / Reservation Retracted</option>
                <option value="EXCESS_PAYMENT">Excess Payment Received</option>
                <option value="LOAN_REJECTION">Customer Loan Rejection</option>
                <option value="VEHICLE_UNAVAILABLE">Vehicle Quality Failure / Contractual Adjustment</option>
                <option value="DUPLICATE_PAYMENT">Duplicate Payment</option>
                <option value="DISPUTE_RESOLUTION">Dispute Resolution</option>
              </select>
            </label>
          </div>
          <div className="full">
            <label>
              Source customer payment <span aria-hidden="true">*</span>
              <select name="obligationId" required defaultValue="">
                <option value="" disabled>Select the buyer obligation being refunded</option>
                {obligations.map(obligation => (
                  <option key={obligation.id} value={obligation.id}>
                    {obligation.obligationNumber} — {obligation.buyerName} ({money(obligation.remainingBalancePaise)} remaining)
                  </option>
                ))}
              </select>
              <small className="helper">A refund must be linked to a real customer obligation for audit and approval.</small>
            </label>
          </div>
          <div className="full">
            <label>
              Reason and supporting note <span aria-hidden="true">*</span>
              <textarea name="notes" required minLength={5} rows={3} placeholder="Explain why the customer is entitled to this refund." />
            </label>
          </div>
        </div>

        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Submitting...' : 'Submit Refund'}
          </button>
        </footer>
      </form>
    </ModalDialog>
  );
}

function ManageRefundDialog({
  refund,
  user,
  busy,
  bankAccounts,
  onClose,
  onAction,
}: {
  refund: RefundCase;
  user: User;
  busy: boolean;
  bankAccounts: CompanyBankAccount[];
  onClose: () => void;
  onAction: (task: () => Promise<unknown>) => void;
}) {
  const decide = (decision: 'APPROVE' | 'REJECT') => {
    onAction(() =>
      financeApi.decideRefund(user, refund.id, {
        decision,
        reason: 'Authorized decision in refund governance.',
      })
    );
  };

  const execute = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const bankAccountId = String(fd.get('companyBankAccountId') || '').trim();
    onAction(() =>
      financeApi.executeRefund(user, refund.id, {
        bankReference: String(fd.get('bankReference')).trim(),
        companyBankAccountId: bankAccountId || undefined,
        notes: 'Customer refund disbursed.',
      })
    );
  };

  const reconcile = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onAction(() => financeApi.reconcileRefund(user, refund.id, {
      kind: 'MANUAL_BANK_CONFIRMATION',
      reference: String(fd.get('reference')),
      observedAt: new Date().toISOString(),
    }));
  };

  return (
    <ModalDialog className="dialog" onClose={onClose}>
      <div>
        <header>
          <div>
            <p className="eyebrow">REFUND MANAGEMENT</p>
            <h2>Case {refund.caseNumber}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><IconCross /></button>
        </header>

        <div className="form-grid">
          <div>
            <span className="helper">Beneficiary</span>
            <strong>{refund.beneficiaryName}</strong> ({refund.beneficiaryAccountMasked})
          </div>
          <div>
            <span className="helper">Amount</span>
            <strong className="money" style={{ color: 'var(--danger)', fontSize: '1.25rem' }}>{money(refund.refundAmountPaise)}</strong>
          </div>
        </div>

        {refund.status === 'APPROVAL_PENDING' && (
          <footer>
            <button type="button" className="button danger" disabled={busy} onClick={() => decide('REJECT')}>
              Reject
            </button>
            <button type="button" className="button primary" disabled={busy} onClick={() => decide('APPROVE')}>
              Approve Refund
            </button>
          </footer>
        )}

        {refund.status === 'APPROVED' && (
          <form onSubmit={execute}>
            <div className="form-grid">
              <div>
                <label>
                  Bank Account
                  <select name="companyBankAccountId">
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>{b.bankName} ({b.accountNumberMasked})</option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Bank UTR Reference
                  <input name="bankReference" placeholder="UTR123456789" required />
                </label>
              </div>
            </div>
            <footer>
              <button type="submit" className="button primary" disabled={busy}>
                Record Execution
              </button>
            </footer>
          </form>
        )}

        {refund.status === 'PROCESSING' && (
          <form onSubmit={reconcile}>
            <div className="alert info" style={{ marginTop: '1rem' }}>
              Transfer has been recorded. A separate finance user must verify it against the bank statement before this refund is final.
            </div>
            <div className="form-grid" style={{ marginTop: '1rem' }}>
              <div className="full">
                <label>
                  Bank statement / reconciliation reference
                  <input name="reference" required defaultValue={refund.bankReference || ''} placeholder="Statement entry or confirmation reference" />
                </label>
              </div>
            </div>
            <footer>
              <button type="submit" className="button primary" disabled={busy}>Verify Refund Against Bank</button>
            </footer>
          </form>
        )}

        {['REFUNDED_VERIFIED', 'RECONCILED', 'EXECUTED', 'REJECTED'].includes(refund.status) && (
          <footer>
            <button type="button" className="button secondary" onClick={onClose}>Close</button>
          </footer>
        )}
      </div>
    </ModalDialog>
  );
}

function NewExpenseDialog({
  user,
  busy,
  vendors,
  profitability,
  onClose,
  onAction,
}: {
  user: User;
  busy: boolean;
  vendors: Vendor[];
  profitability: VehicleProfitabilityItem[];
  onClose: () => void;
  onAction: (task: () => Promise<unknown>) => void;
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amountPaise = BigInt(Math.round(Number(fd.get('amountRupees')) * 100)).toString();

    onAction(() =>
      financeApi.createExpense(user, {
        stockUnitId: String(fd.get('stockUnitId') || '') || undefined,
        vendorId: String(fd.get('vendorId') || '') || undefined,
        category: String(fd.get('category')),
        invoiceNumber: String(fd.get('invoiceNumber') || ''),
        amountPaise,
        invoiceAmountPaise: amountPaise,
        description: String(fd.get('description') || 'Vehicle refurbishment expense'),
        evidenceUri: String(fd.get('evidenceUri') || ''),
      })
    );
  };

  return (
    <ModalDialog className="dialog" onClose={onClose}>
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">DIRECT VEHICLE EXPENSE</p>
            <h2>Record Refurbishment Expense</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><IconCross /></button>
        </header>

        <div className="form-grid">
          <div className="full">
            <label>
              Vehicle Stock Unit (VIN)
              <select name="stockUnitId">
                <option value="">General Dealership Overhead</option>
                {profitability.map((p, idx) => (
                  <option key={p.stockUnitId || p.vin || `prof-${idx}`} value={p.stockUnitId}>
                    {p.year} {p.make} {p.model} (VIN: {p.vin})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label>
              Vendor / Workshop
              <select name="vendorId">
                <option value="">Select Vendor</option>
                {vendors.map((v, idx) => (
                  <option key={v.id || `vend-${idx}`} value={v.id}>{v.name} ({text(v.category)})</option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label>
              Expense Category
              <select name="category" defaultValue="REFURBISHMENT_MECHANICAL">
                <option value="REFURBISHMENT_MECHANICAL">Mechanical Repair & Overhaul</option>
                <option value="REFURBISHMENT_BODYWORK">Bodyshop & Dent/Paint</option>
                <option value="REFURBISHMENT_DETAILING">Detailing & Valeting</option>
                <option value="PARTS">Spare Parts & Consumables</option>
                <option value="TOWING_TRANSPORT">Logistics & Flatbed Towing</option>
                <option value="RTO_DOCUMENTATION">RTO & Documentation</option>
                <option value="STORAGE_PARKING">Storage & Yard Parking</option>
                <option value="OTHER">General Operations</option>
              </select>
            </label>
          </div>
          <div className="full">
            <label>
              Expense Description / Scope of Work <span aria-hidden="true">*</span>
              <input name="description" placeholder="Brake pad replacement and wheel balancing" required minLength={3} />
            </label>
          </div>
          <div>
            <label>
              Vendor Bill / Invoice #
              <input name="invoiceNumber" placeholder="INV-2026-001" />
            </label>
          </div>
          <div>
            <label>
              Expense Amount (₹ Rupees)
              <input name="amountRupees" type="number" step="1" required min="1" placeholder="15000" />
            </label>
          </div>
        </div>

        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Recording...' : 'Record Expense'}
          </button>
        </footer>
      </form>
    </ModalDialog>
  );
}

function ManageExpenseDialog({
  expense,
  user,
  busy,
  bankAccounts,
  onClose,
  onAction,
}: {
  expense: ExpenseClaim;
  user: User;
  busy: boolean;
  bankAccounts: CompanyBankAccount[];
  onClose: () => void;
  onAction: (task: () => Promise<unknown>) => void;
}) {
  const decide = (decision: 'APPROVE' | 'REJECT') => {
    onAction(() =>
      financeApi.decideExpense(user, expense.id, {
        decision,
        reason: 'Authorized expense verification in dealership workshop workflow.',
        version: expense.version,
      })
    );
  };

  const pay = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onAction(() =>
      financeApi.payExpense(user, expense.id, {
        paymentMethod: String(fd.get('paymentMethod')),
        bankReference: String(fd.get('bankReference')),
        companyBankAccountId: String(fd.get('companyBankAccountId') || ''),
        version: expense.version,
      })
    );
  };

  return (
    <ModalDialog className="dialog" onClose={onClose}>
      <div>
        <header>
          <div>
            <p className="eyebrow">EXPENSE CLAIM</p>
            <h2>Claim {expense.claimNumber}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><IconCross /></button>
        </header>

        <div className="form-grid">
          <div>
            <span className="helper">Vendor</span>
            <strong>{expense.vendor?.name || 'Unassigned'}</strong>
          </div>
          <div>
            <span className="helper">Amount</span>
            <strong className="money" style={{ fontSize: '1.25rem' }}>{money(expense.amountPaise)}</strong>
          </div>
          <div>
            <span className="helper">Category</span>
            <div>{text(expense.category)}</div>
          </div>
          <div>
            <span className="helper">Invoice #</span>
            <div>{expense.invoiceNumber || '—'}</div>
          </div>
        </div>

        {expense.status === 'SUBMITTED' && (
          <footer>
            <button type="button" className="button danger" disabled={busy} onClick={() => decide('REJECT')}>
              Reject
            </button>
            <button type="button" className="button primary" disabled={busy} onClick={() => decide('APPROVE')}>
              Approve Expense
            </button>
          </footer>
        )}

        {expense.status === 'APPROVED' && (
          <form onSubmit={pay}>
            <div className="form-grid">
              <div>
                <label>
                  Paying Bank Account
                  <select name="companyBankAccountId">
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>{b.bankName} ({b.accountNumberMasked})</option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Payment Mode
                  <select name="paymentMethod">
                    <option value="NEFT">NEFT</option>
                    <option value="IMPS">IMPS</option>
                    <option value="UPI">UPI</option>
                  </select>
                </label>
              </div>
              <div className="full">
                <label>
                  Bank Transfer Reference / UTR
                  <input name="bankReference" placeholder="UTR123456789" required />
                </label>
              </div>
            </div>
            <footer>
              <button type="submit" className="button primary" disabled={busy}>
                Record Payment
              </button>
            </footer>
          </form>
        )}

        {expense.status === 'PAID' && (
          <footer>
            <button type="button" className="button secondary" onClick={onClose}>Close</button>
          </footer>
        )}
      </div>
    </ModalDialog>
  );
}

function NewVendorDialog({
  user,
  busy,
  onClose,
  onAction,
}: {
  user: User;
  busy: boolean;
  onClose: () => void;
  onAction: (task: () => Promise<unknown>) => void;
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const emailVal = String(fd.get('email') || '').trim();
    onAction(() =>
      financeApi.createVendor(user, {
        name: String(fd.get('name')),
        category: String(fd.get('category')),
        gstin: String(fd.get('gstin') || '') || undefined,
        panNumber: String(fd.get('panNumber') || '') || undefined,
        bankAccountMasked: String(fd.get('bankAccountMasked') || '') || undefined,
        beneficiaryAccountMasked: String(fd.get('bankAccountMasked') || '') || undefined,
        ifscCode: String(fd.get('ifscCode') || '') || undefined,
        phone: String(fd.get('phone') || '') || undefined,
        email: emailVal ? emailVal : undefined,
      })
    );
  };

  return (
    <ModalDialog className="dialog" onClose={onClose}>
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">COUNTERPARTY ONBOARDING</p>
            <h2>Add Authorized Vendor</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><IconCross /></button>
        </header>

        <div className="form-grid">
          <div>
            <label>
              Vendor Entity Name <span aria-hidden="true">*</span>
              <input name="name" required minLength={2} placeholder="Bosch Car Service" />
            </label>
          </div>
          <div>
            <label>
              Category
              <select name="category" defaultValue="WORKSHOP_MECHANICAL">
                <option value="WORKSHOP_MECHANICAL">Workshop & Mechanical</option>
                <option value="WORKSHOP_BODY_PAINT">Bodyshop & Paint</option>
                <option value="PARTS_SUPPLIER">Spare Parts Distributor</option>
                <option value="LOGISTICS_TOWING">Logistics & Flatbed Towing</option>
                <option value="DETAILING">Detailing & Valeting</option>
                <option value="DOCUMENTATION_RTO">RTO Liaison & Agent</option>
                <option value="INSPECTION_AGENCY">Inspection Agency</option>
                <option value="OTHER">Other Vendor</option>
              </select>
            </label>
          </div>
          <div>
            <label>
              GSTIN
              <input name="gstin" placeholder="29AAAAA0000A1Z5" />
            </label>
          </div>
          <div>
            <label>
              PAN Number
              <input name="panNumber" placeholder="AAAAA0000A" />
            </label>
          </div>
          <div>
            <label>
              Masked Bank Account
              <input name="bankAccountMasked" placeholder="XXXX 5678" />
            </label>
          </div>
          <div>
            <label>
              Bank IFSC Code
              <input name="ifscCode" placeholder="HDFC0001234" />
            </label>
          </div>
          <div>
            <label>
              Phone Number
              <input name="phone" placeholder="+91 9876543210" />
            </label>
          </div>
          <div>
            <label>
              Email Address
              <input name="email" type="email" placeholder="vendor@workshop.in" />
            </label>
          </div>
        </div>

        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Saving...' : 'Add Vendor'}
          </button>
        </footer>
      </form>
    </ModalDialog>
  );
}

function NewBankAccountDialog({
  user,
  busy,
  onClose,
  onAction,
}: {
  user: User;
  busy: boolean;
  onClose: () => void;
  onAction: (task: () => Promise<unknown>) => void;
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const balancePaise = BigInt(Math.round(Number(fd.get('initialBalanceRupees') || 0) * 100)).toString();

    onAction(() =>
      financeApi.createBankAccount(user, {
        bankName: String(fd.get('bankName')),
        accountName: String(fd.get('accountName') || 'V MOTIV AUTOMOTIVE INDIA PVT LTD'),
        accountNumberMasked: String(fd.get('accountNumberMasked')),
        ifscCode: String(fd.get('ifscCode')),
        branchName: String(fd.get('branchName')),
        accountType: String(fd.get('accountType') || 'CURRENT'),
        initialBalancePaise: balancePaise,
        openingBalancePaise: balancePaise,
      })
    );
  };

  return (
    <ModalDialog className="dialog" onClose={onClose}>
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">TREASURY MANAGEMENT</p>
            <h2>Add Company Bank Account</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><IconCross /></button>
        </header>

        <div className="form-grid">
          <div>
            <label>
              Bank Name
              <input name="bankName" required placeholder="HDFC Bank" />
            </label>
          </div>
          <div>
            <label>
              Account Holder / Legal Entity Name
              <input name="accountName" defaultValue="V MOTIV AUTOMOTIVE INDIA PVT LTD" required />
            </label>
          </div>
          <div>
            <label>
              Masked Account Number
              <input name="accountNumberMasked" required placeholder="XXXX 9876" />
            </label>
          </div>
          <div>
            <label>
              IFSC Code
              <input name="ifscCode" required placeholder="HDFC0000001" />
            </label>
          </div>
          <div>
            <label>
              Branch Name
              <input name="branchName" required placeholder="Indiranagar Branch" />
            </label>
          </div>
          <div>
            <label>
              Account Type
              <select name="accountType" defaultValue="CURRENT">
                <option value="CURRENT">Current Account</option>
                <option value="ESCROW">Escrow Account</option>
                <option value="NODAL">Nodal Account</option>
                <option value="SAVINGS">Savings Account</option>
              </select>
            </label>
          </div>
          <div>
            <label>
              Opening Balance (₹)
              <input name="initialBalanceRupees" type="number" min="0" step="1" defaultValue="0" placeholder="0" />
            </label>
          </div>
        </div>

        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Creating...' : 'Save Bank Account'}
          </button>
        </footer>
      </form>
    </ModalDialog>
  );
}

function ImportStatementDialog({
  user,
  busy,
  bankAccounts,
  onClose,
  onAction,
}: {
  user: User;
  busy: boolean;
  bankAccounts: CompanyBankAccount[];
  onClose: () => void;
  onAction: (task: () => Promise<unknown>) => void;
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onAction(() =>
      financeApi.importBankStatement(user, {
        companyBankAccountId: String(fd.get('companyBankAccountId')),
        fileName: String(fd.get('fileName') || 'statement.csv'),
        rawText: String(fd.get('rawText')),
      })
    );
  };

  return (
    <ModalDialog className="dialog wide" onClose={onClose}>
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">STATEMENT RECONCILIATION</p>
            <h2>Import Bank Statement Feed</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><IconCross /></button>
        </header>

        <div className="form-grid single">
          <div>
            <label>
              Company Bank Account
              <select name="companyBankAccountId" required>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>{b.bankName} ({b.accountNumberMasked})</option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label>
              Statement Raw Content (CSV / Text Feed)
              <textarea
                name="rawText"
                rows={8}
                required
                placeholder={`date,narration,ref,debit,credit\n2026-10-26,"RTGS/CUSTOMER PAYMENT",UTR87654321,0,1200000\n2026-10-26,"NEFT/WORKSHOP EXPENSE",NEFT998877,15000,0`}
              />
            </label>
          </div>
        </div>

        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Importing...' : 'Parse & Import Statement'}
          </button>
        </footer>
      </form>
    </ModalDialog>
  );
}

function MatchStatementDialog({
  entry,
  user,
  busy,
  receipts,
  settlements,
  expenses,
  onClose,
  onAction,
}: {
  entry: BankStatementEntry;
  user: User;
  busy: boolean;
  receipts: IncomingReceipt[];
  settlements: SettlementCase[];
  expenses: ExpenseClaim[];
  onClose: () => void;
  onAction: (task: () => Promise<unknown>) => void;
}) {
  const [matchType, setMatchType] = useState<'RECEIPT' | 'PAYOUT' | 'EXPENSE'>('RECEIPT');
  const [matchId, setMatchId] = useState('');

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onAction(() =>
      financeApi.matchStatementEntry(user, entry.id, {
        matchedEntityType: matchType,
        matchedEntityId: matchId,
      })
    );
  };

  return (
    <ModalDialog className="dialog" onClose={onClose}>
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">RECONCILIATION MATCHING</p>
            <h2>Match Statement Entry</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><IconCross /></button>
        </header>

        <div className="alert info" style={{ margin: '1rem 0' }}>
          Narration: <strong>{entry.narration}</strong>
          <br />
          Debit: {money(entry.debitPaise)} · Credit: {money(entry.creditPaise)} · Ref: {entry.referenceNumber || '—'}
        </div>

        <div className="form-grid single">
          <div>
            <label>
              Match With
              <select value={matchType} onChange={e => { setMatchType(e.target.value as any); setMatchId(''); }}>
                <option value="RECEIPT">Customer Receipt (Credit)</option>
                <option value="PAYOUT">Seller Payout (Debit)</option>
                <option value="EXPENSE">Workshop Expense (Debit)</option>
              </select>
            </label>
          </div>

          <div>
            <label>
              Select Transaction
              <select value={matchId} onChange={e => setMatchId(e.target.value)} required>
                <option value="">Select Target Transaction</option>
                {matchType === 'RECEIPT' &&
                  receipts.map(r => (
                    <option key={r.id} value={r.id}>{r.receiptNumber} - {r.payerName} ({money(r.amountPaise)})</option>
                  ))}
                {matchType === 'PAYOUT' &&
                  settlements.map(s => {
                    const p = s.settlement?.payoutInstructions?.[0];
                    if (!p) return null;
                    return <option key={p.id} value={p.id}>{s.lead.sellerName} - {p.beneficiaryName} ({money(p.amountPaise)})</option>;
                  })}
                {matchType === 'EXPENSE' &&
                  expenses.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.claimNumber} - {ex.vendor?.name} ({money(ex.amountPaise)})</option>
                  ))}
              </select>
            </label>
          </div>
        </div>

        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy || !matchId}>
            {busy ? 'Matching...' : 'Confirm Match'}
          </button>
        </footer>
      </form>
    </ModalDialog>
  );
}

function ResolveExceptionDialog({
  exception,
  user,
  busy,
  onClose,
  onAction,
}: {
  exception: ReconciliationException;
  user: User;
  busy: boolean;
  onClose: () => void;
  onAction: (task: () => Promise<unknown>) => void;
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onAction(() =>
      financeApi.resolveException(user, exception.id, {
        note: String(fd.get('note')),
      })
    );
  };

  return (
    <ModalDialog className="dialog" onClose={onClose}>
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">AUDIT RESOLUTION</p>
            <h2>Resolve Exception</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><IconCross /></button>
        </header>

        <div className="alert error" style={{ margin: '1rem 0' }}>
          Type: <strong>{text(exception.exceptionType)}</strong>
          <br />
          Details: {exception.details}
        </div>

        <label style={{ display: 'block', margin: '1rem 0' }}>
          Resolution Note
          <textarea name="note" required rows={3} placeholder="Explanation of audit resolution..." />
        </label>

        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Resolving...' : 'Resolve Exception'}
          </button>
        </footer>
      </form>
    </ModalDialog>
  );
}

function PostJournalDialog({
  user,
  busy,
  accounts,
  periods,
  onClose,
  onAction,
}: {
  user: User;
  busy: boolean;
  accounts: ChartOfAccount[];
  periods: AccountingPeriod[];
  onClose: () => void;
  onAction: (task: () => Promise<unknown>) => void;
}) {
  const [lines, setLines] = useState<
    { accountId: string; debitRupees: string; creditRupees: string; description: string }[]
  >([
    { accountId: accounts[0]?.id || '', debitRupees: '100000', creditRupees: '0', description: 'Debit' },
    { accountId: accounts[1]?.id || '', debitRupees: '0', creditRupees: '100000', description: 'Credit' },
  ]);

  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debitRupees) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.creditRupees) || 0), 0);
  const isBalanced = totalDebit > 0 && totalDebit === totalCredit;

  const addLine = () => {
    setLines([...lines, { accountId: accounts[0]?.id || '', debitRupees: '0', creditRupees: '0', description: '' }]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: string, val: string) => {
    const next = [...lines];
    (next[idx] as any)[field] = val;
    setLines(next);
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isBalanced) return;
    const fd = new FormData(e.currentTarget);

    const formattedLines = lines.map(l => ({
      accountId: l.accountId,
      debitPaise: BigInt(Math.round((Number(l.debitRupees) || 0) * 100)).toString(),
      creditPaise: BigInt(Math.round((Number(l.creditRupees) || 0) * 100)).toString(),
      description: l.description,
    }));

    onAction(() =>
      financeApi.postJournal(user, {
        postingDate: String(fd.get('postingDate') || new Date().toISOString()),
        periodId: String(fd.get('periodId')),
        sourceType: 'MANUAL',
        description: String(fd.get('description')),
        lines: formattedLines,
      })
    );
  };

  return (
    <ModalDialog className="dialog wide" onClose={onClose}>
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">DOUBLE-ENTRY GENERAL LEDGER</p>
            <h2>Post Balanced Journal Entry</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><IconCross /></button>
        </header>

        <div className="form-grid">
          <div>
            <label>
              Accounting Period
              <select name="periodId" required>
                {periods.map(p => (
                  <option key={p.id} value={p.id}>{p.periodName} ({text(p.status)})</option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label>
              Posting Date
              <input name="postingDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            </label>
          </div>
          <div className="full">
            <label>
              Narration / Description
              <input name="description" required placeholder="Month-end adjustment" />
            </label>
          </div>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <span className="helper" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Journal Lines</span>
          {lines.map((l, idx) => (
            <div key={idx} className="journal-line-row">
              <select value={l.accountId} onChange={e => updateLine(idx, 'accountId', e.target.value)} required>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                ))}
              </select>
              <input
                type="number"
                step="1"
                placeholder="Debit ₹"
                value={l.debitRupees}
                onChange={e => updateLine(idx, 'debitRupees', e.target.value)}
              />
              <input
                type="number"
                step="1"
                placeholder="Credit ₹"
                value={l.creditRupees}
                onChange={e => updateLine(idx, 'creditRupees', e.target.value)}
              />
              <input
                placeholder="Line memo"
                value={l.description}
                onChange={e => updateLine(idx, 'description', e.target.value)}
              />
              <button
                type="button"
                className="button danger small"
                onClick={() => removeLine(idx)}
                disabled={lines.length <= 2}
              >
                <IconCross />
              </button>
            </div>
          ))}

          <button type="button" className="button secondary small" onClick={addLine} style={{ marginTop: '0.5rem' }}>
            <IconPlus /> Add Line
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', padding: '0.75rem', background: 'var(--surface)', borderRadius: '0.5rem' }}>
          <div>
            <span>Dr: <strong>₹{totalDebit.toLocaleString('en-IN')}</strong></span>
            {' · '}
            <span>Cr: <strong>₹{totalCredit.toLocaleString('en-IN')}</strong></span>
          </div>
          <span className={`status ${isBalanced ? 'success' : 'danger'}`}>
            <span /> {isBalanced ? 'BALANCED' : `DIFF: ₹${Math.abs(totalDebit - totalCredit).toLocaleString('en-IN')}`}
          </span>
        </div>

        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy || !isBalanced}>
            {busy ? 'Posting...' : 'Post Journal'}
          </button>
        </footer>
      </form>
    </ModalDialog>
  );
}

function IssueInvoiceDialog({
  user,
  busy,
  obligations,
  onClose,
  onAction,
}: {
  user: User;
  busy: boolean;
  obligations: BuyerPaymentObligation[];
  onClose: () => void;
  onAction: (task: () => Promise<unknown>) => void;
}) {
  const [selectedObligationId, setSelectedObligationId] = useState(obligations[0]?.id || '');
  const obligation = obligations.find(o => o.id === selectedObligationId);

  const subtotalRupees = obligation ? Number(BigInt(obligation.salePricePaise || '0') / 100n) : 1000000;
  const [subtotal, setSubtotal] = useState(subtotalRupees);

  const cgst = Math.round(subtotal * 0.09);
  const sgst = Math.round(subtotal * 0.09);
  const total = subtotal + cgst + sgst;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    onAction(() =>
      financeApi.issueInvoice(user, {
        obligationId: obligation?.id,
        stockUnitId: obligation?.stockUnitId || undefined,
        invoiceType: 'VEHICLE_SALE_TAX_INVOICE',
        buyerName: String(fd.get('buyerName')),
        buyerAddress: String(fd.get('buyerAddress') || ''),
        buyerGstin: String(fd.get('buyerGstin') || ''),
        subtotalPaise: BigInt(subtotal * 100).toString(),
        cgstPaise: BigInt(cgst * 100).toString(),
        sgstPaise: BigInt(sgst * 100).toString(),
      })
    );
  };

  return (
    <ModalDialog className="dialog" onClose={onClose}>
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">COMMERCIAL TAX DOCUMENT</p>
            <h2>Issue Commercial Sales Invoice</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><IconCross /></button>
        </header>

        <div className="form-grid">
          <div className="full">
            <label>
              Buyer Payment Obligation
              <select
                value={selectedObligationId}
                onChange={e => {
                  setSelectedObligationId(e.target.value);
                  const ob = obligations.find(o => o.id === e.target.value);
                  if (ob) setSubtotal(Number(BigInt(ob.salePricePaise || '0') / 100n));
                }}
              >
                {obligations.map(ob => (
                  <option key={ob.id} value={ob.id}>
                    {ob.obligationNumber} - {ob.buyerName} ({money(ob.salePricePaise)})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label>
              Buyer Legal Name
              <input name="buyerName" defaultValue={obligation?.buyerName || ''} required />
            </label>
          </div>
          <div>
            <label>
              Buyer GSTIN (Optional)
              <input name="buyerGstin" placeholder="29XXXXX1234X1ZX" />
            </label>
          </div>
          <div>
            <label>
              Taxable Subtotal (₹)
              <input
                type="number"
                step="1"
                value={subtotal}
                onChange={e => setSubtotal(Number(e.target.value) || 0)}
                required
              />
            </label>
          </div>
          <div>
            <label>
              Total Invoice Value
              <div className="money" style={{ fontSize: '1.25rem', color: 'var(--yellow)', marginTop: '0.4rem' }}>
                ₹{total.toLocaleString('en-IN')}
              </div>
            </label>
          </div>
        </div>

        <footer>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Issuing...' : 'Issue Invoice'}
          </button>
        </footer>
      </form>
    </ModalDialog>
  );
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
