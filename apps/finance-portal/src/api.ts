import type { User } from 'firebase/auth';

const base = ((import.meta.env.VITE_API_BASE || 'http://localhost:4100/api/v2').replace(/\/$/, ''))
  .replace('https://vmotiv.in', 'https://api.vmotiv.in')
  .replace('https://www.vmotiv.in', 'https://api.vmotiv.in');

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function call<T>(user: User, path: string, init: RequestInit = {}): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(`${base}/finance${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ code: 'REQUEST_FAILED' }));
    throw new ApiError(data.code || 'REQUEST_FAILED');
  }
  return response.json();
}

export interface FinanceActor {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  phone?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  roles: string[];
}

export interface DashboardMetrics {
  readyForPreparation: number;
  pendingApproval: number;
  approved: number;
  reconciliation: number;
  exceptions: number;
  activeObligations: number;
  unappliedReceiptsPaise: string;
  totalExpensesPaise: string;
  totalCashBankPaise?: string;
  generatedAt?: string;
}

type FinanceDashboardResponse = {
  sellerPayouts?: Partial<Pick<DashboardMetrics, 'readyForPreparation' | 'pendingApproval' | 'approved' | 'reconciliation' | 'exceptions'>>;
  buyerCollections?: { activeObligations?: number; unverifiedReceipts?: number; unappliedReceiptsPaise?: string };
  refunds?: { pendingRefunds?: number };
  expenses?: { pendingExpenses?: number; totalExpensesPaise?: string };
  totalCashBankPaise?: string;
  generatedAt?: string;
} & Partial<DashboardMetrics>;

function normaliseDashboard(data: FinanceDashboardResponse): DashboardMetrics {
  const payouts = data.sellerPayouts || {};
  return {
    readyForPreparation: data.readyForPreparation ?? payouts.readyForPreparation ?? 0,
    pendingApproval: data.pendingApproval ?? payouts.pendingApproval ?? 0,
    approved: data.approved ?? payouts.approved ?? 0,
    reconciliation: data.reconciliation ?? payouts.reconciliation ?? 0,
    exceptions: data.exceptions ?? payouts.exceptions ?? 0,
    activeObligations: data.activeObligations ?? data.buyerCollections?.activeObligations ?? 0,
    unappliedReceiptsPaise: data.unappliedReceiptsPaise ?? data.buyerCollections?.unappliedReceiptsPaise ?? '0',
    totalExpensesPaise: data.totalExpensesPaise ?? data.expenses?.totalExpensesPaise ?? '0',
    totalCashBankPaise: data.totalCashBankPaise ?? '0',
    generatedAt: data.generatedAt,
  };
}

function parseStatementFeed(rawText: string) {
  const rows = rawText.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) throw new ApiError('STATEMENT_REQUIRES_HEADER_AND_ENTRY');
  const parseRow = (line: string) => {
    const values: string[] = [];
    let cell = ''; let quote = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') quote = !quote;
      else if (char === ',' && !quote) { values.push(cell.trim()); cell = ''; }
      else cell += char;
    }
    values.push(cell.trim());
    return values;
  };
  const headers = parseRow(rows[0]).map(value => value.toLowerCase().replace(/[^a-z]/g, ''));
  const index = (name: string) => headers.indexOf(name);
  const dateIndex = index('date');
  const narrationIndex = Math.max(index('narration'), index('description'));
  if (dateIndex < 0 || narrationIndex < 0) throw new ApiError('STATEMENT_COLUMNS_DATE_AND_NARRATION_REQUIRED');
  const numericPaise = (value: string) => String(Math.round((Number(value.replace(/,/g, '')) || 0) * 100));
  const entries = rows.slice(1).map(line => {
    const cells = parseRow(line);
    return {
      entryDate: cells[dateIndex],
      description: cells[narrationIndex],
      reference: index('ref') >= 0 ? cells[index('ref')] : index('reference') >= 0 ? cells[index('reference')] : undefined,
      debitPaise: index('debit') >= 0 ? numericPaise(cells[index('debit')]) : '0',
      creditPaise: index('credit') >= 0 ? numericPaise(cells[index('credit')]) : '0',
    };
  }).filter(entry => entry.entryDate && entry.description);
  if (!entries.length) throw new ApiError('STATEMENT_HAS_NO_VALID_ENTRIES');
  return entries;
}

export interface SettlementDocument {
  id: string;
  documentType: string;
  status: string;
  fileUrl?: string;
  verifiedAt?: string;
}

export interface SettlementCase {
  id: string;
  leadId: string;
  status: string;
  settlementStatus: string;
  stockUnitId?: string | null;
  lead: {
    referenceCode: string;
    make: string;
    model: string;
    variant?: string;
    manufacturingYear: number;
    registrationNumber: string;
    sellerName: string;
    sellerPhone?: string;
    inspectionCity?: string;
  };
  offer: {
    id: string;
    offerAmountPaise: string;
    status: string;
  };
  settlement?: {
    id: string;
    sellerPayablePaise?: string;
    lenderPayoffPaise?: string;
    lenderName?: string | null;
    lenderAccountMasked?: string | null;
    payoutInstructions?: PayoutInstruction[];
  } | null;
  documents: SettlementDocument[];
}

export interface PayoutInstruction {
  id: string;
  settlementId: string;
  payoutPurpose?: 'SELLER_PROCEEDS' | 'LENDER_PAYOFF' | null;
  beneficiaryName: string;
  beneficiaryAccountMasked: string;
  paymentMethod: string;
  amountPaise: string;
  status: string;
  version: number;
  bankReference?: string | null;
  reconciliationReference?: string | null;
  reconciledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuyerPaymentObligation {
  id: string;
  obligationNumber: string;
  customerId?: string;
  buyerUserId: string;
  buyerName: string;
  buyerEmail?: string | null;
  buyerPhone?: string | null;
  salePricePaise: string;
  bookingDepositPaise: string;
  totalPayablePaise: string;
  totalReceivedPaise: string;
  remainingBalancePaise: string;
  status: string;
  deliveryEligible: boolean;
  vehicleListingId?: string | null;
  stockUnitId?: string | null;
  quotationId?: string | null;
  reservationId?: string | null;
  stockUnit?: {
    vin: string;
    make: string;
    model: string;
    year: number;
    registrationNumber?: string | null;
  } | null;
  allocations: {
    id: string;
    amountPaise: string;
    allocatedAt: string;
    receipt: {
      id: string;
      receiptNumber: string;
      paymentMode: string;
      bankReference?: string | null;
    };
  }[];
  createdAt: string;
}

export interface IncomingReceipt {
  id: string;
  receiptNumber: string;
  companyBankAccountId?: string | null;
  payerName: string;
  payerPhone?: string | null;
  paymentMode: string;
  bankReference?: string | null;
  amountPaise: string;
  unappliedAmountPaise: string;
  status: string;
  receivedAt: string;
  verifiedAt?: string | null;
  evidenceUri?: string | null;
  allocations: {
    id: string;
    obligationId: string;
    amountPaise: string;
    allocatedAt: string;
  }[];
  createdAt: string;
}

export interface RefundCase {
  id: string;
  caseNumber: string;
  receiptId?: string | null;
  obligationId?: string | null;
  beneficiaryName: string;
  beneficiaryAccountMasked: string;
  reason: string;
  status: string;
  refundAmountPaise: string;
  bankReference?: string | null;
  reconciliationReference?: string | null;
  reconciledAt?: string | null;
  requestedAt: string;
  approvedAt?: string | null;
  executedAt?: string | null;
  createdAt: string;
  version?: number;
}

export interface Vendor {
  id: string;
  name: string;
  category: string;
  gstin?: string | null;
  panNumber?: string | null;
  bankAccountMasked?: string | null;
  ifscCode?: string | null;
  phone?: string | null;
  email?: string | null;
  active: boolean;
  createdAt: string;
}

export interface ExpenseClaim {
  id: string;
  claimNumber: string;
  stockUnitId?: string | null;
  stockUnit?: {
    vin: string;
    make: string;
    model: string;
    year: number;
    registrationNumber?: string | null;
  } | null;
  vendorId?: string | null;
  vendor?: {
    name: string;
    category: string;
  } | null;
  category: string;
  invoiceNumber?: string | null;
  amountPaise: string;
  status: string;
  version?: number;
  paymentMethod?: string | null;
  bankReference?: string | null;
  evidenceUri?: string | null;
  approvedAt?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

export interface CompanyBankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  ifscCode: string;
  branchName?: string | null;
  accountType: string;
  currentBalancePaise: string;
  active: boolean;
  createdAt: string;
}

export interface BankStatementEntry {
  id: string;
  importId: string;
  entryDate: string;
  valueDate?: string | null;
  narration: string;
  referenceNumber?: string | null;
  debitPaise: string;
  creditPaise: string;
  balancePaise?: string | null;
  status: string;
  matchedEntityId?: string | null;
  matchedEntityType?: string | null;
  createdAt: string;
}

export interface ReconciliationException {
  id: string;
  statementEntryId?: string | null;
  exceptionType: string;
  status: string;
  details: string;
  resolvedAt?: string | null;
  resolvedNote?: string | null;
  createdAt: string;
}

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  category: string;
  normalBalance: string;
  description?: string | null;
  active: boolean;
}

export interface AccountingPeriod {
  id: string;
  periodName: string;
  startDate: string;
  endDate: string;
  status: string;
  closedAt?: string | null;
  closedBy?: {
    user: {
      displayName: string;
    };
  } | null;
}

export interface FinancialJournalLine {
  id: string;
  accountId: string;
  account: {
    code: string;
    name: string;
    category: string;
  };
  debitPaise: string;
  creditPaise: string;
  description?: string | null;
}

export interface FinancialJournal {
  id: string;
  entryNumber: string;
  postingDate: string;
  periodId: string;
  period: {
    periodName: string;
    status: string;
  };
  sourceType: string;
  sourceReference?: string | null;
  description: string;
  status: string;
  lines: FinancialJournalLine[];
  createdAt: string;
}

export interface InvoiceDocument {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  obligationId?: string | null;
  stockUnitId?: string | null;
  stockUnit?: {
    vin: string;
    make: string;
    model: string;
    year: number;
    registrationNumber?: string | null;
  } | null;
  buyerName: string;
  buyerAddress?: string | null;
  buyerGstin?: string | null;
  subtotalPaise: string;
  cgstPaise: string;
  sgstPaise: string;
  igstPaise: string;
  totalPaise: string;
  pdfUrl?: string | null;
  issuedAt: string;
}

export interface VehicleProfitabilityItem {
  id?: string;
  stockUnitId: string;
  stockCode?: string;
  vin: string;
  registrationNumber?: string;
  title?: string;
  make: string;
  model: string;
  variant?: string;
  year: number;
  status: string;
  acquisitionCostPaise: string;
  refurbishmentExpensesPaise: string;
  totalInvestedPaise: string;
  listingPricePaise?: string;
  realizedSalePricePaise: string;
  realizedGrossMarginPaise: string;
  realizedGrossMarginPercent: number;
  deliveryEligible: boolean;
}

export interface AuditLogEntry {
  id: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: any;
  createdAt: string;
}

export const financeApi = {
  me: (u: User) => call<FinanceActor>(u, '/me'),
  dashboard: async (u: User) => normaliseDashboard(await call<FinanceDashboardResponse>(u, '/dashboard')),

  // Seller Settlements & Payouts
  settlements: (u: User) => call<SettlementCase[]>(u, '/seller-settlements'),
  preparePayout: (u: User, settlementId: string, body: {
    beneficiaryName: string;
    beneficiaryAccountMasked: string;
    paymentMethod: string;
    payoutPurpose?: 'SELLER_PROCEEDS' | 'LENDER_PAYOFF';
    amountPaise?: string;
    lenderName?: string;
    lenderAccountMasked?: string;
    lenderPayoffPaise?: string;
    sellerPayablePaise?: string;
    idempotencyKey?: string;
  }) => call<PayoutInstruction>(u, `/seller-settlements/${settlementId}/payout-instructions`, {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  submitPayout: (u: User, payoutId: string, version: number) =>
    call<PayoutInstruction>(u, `/payout-instructions/${payoutId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    }),
  decidePayout: (u: User, payoutId: string, body: { version: number; decision: 'APPROVE' | 'REJECT'; reason: string }) =>
    call<PayoutInstruction>(u, `/payout-instructions/${payoutId}/decision`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  executePayout: (u: User, payoutId: string, body: { version: number; bankReference: string; companyBankAccountId?: string; notes?: string }) =>
    call<PayoutInstruction>(u, `/payout-instructions/${payoutId}/execute`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  reconcilePayout: (u: User, payoutId: string, body: { version: number; kind: string; reference: string; evidenceUri?: string; observedAt: string }) =>
    call<PayoutInstruction>(u, `/payout-instructions/${payoutId}/reconcile`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Buyer Collections
  obligations: (u: User) => call<BuyerPaymentObligation[]>(u, '/buyer-obligations'),
  createObligation: (u: User, body: {
    buyerUserId?: string;
    buyerName: string;
    buyerEmail?: string;
    buyerPhone?: string;
    salePricePaise: string;
    bookingDepositPaise?: string;
    vehicleListingId?: string;
    stockUnitId?: string;
    quotationId?: string;
    reservationId?: string;
    branchId?: string;
  }) => call<BuyerPaymentObligation>(u, '/buyer-obligations', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  recordObligationPayment: (u: User, obligationId: string, body: {
    amountPaise: string;
    paymentMode?: string;
    bankReference?: string;
    companyBankAccountId?: string;
    notes?: string;
  }) => call<BuyerPaymentObligation>(u, `/buyer-obligations/${obligationId}/payments`, {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  // Receipts & Allocations
  receipts: (u: User) => call<IncomingReceipt[]>(u, '/receipts'),
  recordReceipt: (u: User, body: {
    payerName: string;
    payerPhone?: string;
    companyBankAccountId?: string;
    paymentMode: string;
    bankReference?: string;
    amountPaise: string;
    evidenceUri?: string;
    receivedAt?: string;
    branchId?: string;
    obligationId?: string;
  }) => call<IncomingReceipt>(u, '/receipts', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  verifyReceipt: (u: User, receiptId: string, body: { notes?: string; evidenceUri?: string }) =>
    call<IncomingReceipt>(u, `/receipts/${receiptId}/verify`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  allocateReceipt: (u: User, receiptId: string, body: { obligationId: string; amountPaise: string }) =>
    call<{ allocation: any; obligation: BuyerPaymentObligation; receipt: IncomingReceipt }>(u, `/receipts/${receiptId}/allocate`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Refunds
  refunds: (u: User) => call<RefundCase[]>(u, '/refunds'),
  requestRefund: (u: User, body: {
    receiptId?: string;
    obligationId?: string;
    customerId?: string;
    beneficiaryName: string;
    beneficiaryAccountMasked: string;
    reason: string;
    refundAmountPaise?: string;
    requestedAmountPaise?: string;
    notes?: string;
  }) => call<RefundCase>(u, '/refunds', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  decideRefund: (u: User, refundId: string, body: { decision: 'APPROVE' | 'REJECT'; reason: string }) =>
    call<RefundCase>(u, `/refunds/${refundId}/decision`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  executeRefund: (u: User, refundId: string, body: { bankReference: string; companyBankAccountId?: string; notes?: string }) =>
    call<RefundCase>(u, `/refunds/${refundId}/execute`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  reconcileRefund: (u: User, refundId: string, body: { kind: string; reference: string; evidenceUri?: string; observedAt: string }) =>
    call<RefundCase>(u, `/refunds/${refundId}/reconcile`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Vendors & Beneficiaries
  vendors: (u: User) => call<Vendor[]>(u, '/vendors'),
  createVendor: (u: User, body: {
    name: string;
    category: string;
    gstin?: string;
    panNumber?: string;
    bankAccountMasked?: string;
    beneficiaryAccountMasked?: string;
    ifscCode?: string;
    phone?: string;
    email?: string;
  }) => call<Vendor>(u, '/vendors', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  // Vehicle Expenses
  expenses: (u: User) => call<ExpenseClaim[]>(u, '/expenses'),
  createExpense: (u: User, body: {
    stockUnitId?: string;
    vendorId?: string;
    category: string;
    invoiceNumber?: string;
    amountPaise: string;
    invoiceAmountPaise?: string;
    description?: string;
    evidenceUri?: string;
  }) => call<ExpenseClaim>(u, '/expenses', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  decideExpense: (u: User, expenseId: string, body: { decision: 'APPROVE' | 'REJECT'; reason?: string; version?: number }) =>
    call<ExpenseClaim>(u, `/expenses/${expenseId}/decision`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  payExpense: (u: User, expenseId: string, body: { paymentMethod: string; bankReference: string; companyBankAccountId?: string; version?: number }) =>
    call<ExpenseClaim>(u, `/expenses/${expenseId}/pay`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Bank Accounts & Reconciliation
  bankAccounts: (u: User) => call<CompanyBankAccount[]>(u, '/bank-accounts'),
  createBankAccount: (u: User, body: {
    bankName: string;
    accountName?: string;
    accountNumberMasked: string;
    ifscCode: string;
    branchName?: string;
    accountType?: string;
    initialBalancePaise?: string;
    openingBalancePaise?: string;
  }) => call<CompanyBankAccount>(u, '/bank-accounts', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  updateBankAccount: (u: User, id: string, body: {
    bankName: string;
    accountName: string;
    accountNumberMasked: string;
    ifscCode: string;
    branchName?: string;
    accountType?: string;
  }) => call<CompanyBankAccount>(u, `/bank-accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }),
  removeBankAccount: (u: User, id: string) => call<{ id: string; action: 'DELETED' | 'DEACTIVATED'; references: number }>(u, `/bank-accounts/${id}`, {
    method: 'DELETE',
  }),
  bankStatements: (u: User) => call<BankStatementEntry[]>(u, '/bank-statements'),
  importBankStatement: (u: User, body: {
    companyBankAccountId: string;
    fileName: string;
    rawText: string;
  }) => {
    const entries = parseStatementFeed(body.rawText);
    const dates = entries.map(entry => entry.entryDate).sort();
    return call<{ importId: string; totalEntries: number; matchedEntries: number }>(u, '/bank-statements/import', {
    method: 'POST',
      body: JSON.stringify({
        companyBankAccountId: body.companyBankAccountId,
        filename: body.fileName,
        startDate: dates[0],
        endDate: dates[dates.length - 1],
        entries,
      }),
    });
  },
  matchStatementEntry: (u: User, entryId: string, body: { matchedEntityType: string; matchedEntityId: string }) =>
    call<BankStatementEntry>(u, `/bank-statements/entries/${entryId}/match`, {
      method: 'POST',
      body: JSON.stringify({ kind: body.matchedEntityType, targetId: body.matchedEntityId }),
    }),
  exceptions: (u: User) => call<ReconciliationException[]>(u, '/reconciliation-exceptions'),
  resolveException: (u: User, exceptionId: string, body: { note: string }) =>
    call<ReconciliationException>(u, `/reconciliation-exceptions/${exceptionId}/resolve`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Chart of Accounts & General Ledger
  chartOfAccounts: (u: User) => call<ChartOfAccount[]>(u, '/chart-of-accounts'),
  seedChartOfAccounts: (u: User) => call<{ count: number }>(u, '/chart-of-accounts/seed-default', { method: 'POST' }),
  accountingPeriods: (u: User) => call<AccountingPeriod[]>(u, '/accounting-periods'),
  closeAccountingPeriod: (u: User, periodId: string, body: { note?: string }) =>
    call<AccountingPeriod>(u, `/accounting-periods/${periodId}/close`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  journals: (u: User) => call<FinancialJournal[]>(u, '/journals'),
  postJournal: (u: User, body: {
    postingDate: string;
    periodId: string;
    sourceType: string;
    sourceReference?: string;
    description: string;
    lines: { accountId: string; debitPaise: string; creditPaise: string; description?: string }[];
  }) => call<FinancialJournal>(u, '/journals', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  // Invoices & Commercial Documents
  invoices: (u: User) => call<InvoiceDocument[]>(u, '/invoices'),
  issueInvoice: (u: User, body: {
    obligationId?: string;
    stockUnitId?: string;
    invoiceType: string;
    buyerName: string;
    buyerAddress?: string;
    buyerGstin?: string;
    subtotalPaise: string;
    cgstPaise?: string;
    sgstPaise?: string;
    igstPaise?: string;
  }) => call<InvoiceDocument>(u, '/invoices', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  // Vehicle Profitability & Margins
  profitability: (u: User) => call<VehicleProfitabilityItem[]>(u, '/profitability'),

  // Audit Trail
  auditTrail: (u: User) => call<AuditLogEntry[]>(u, '/audit-trail'),

  // Service Invoices & Prepayment Ledgers
  serviceInvoices: (u: User) => call<Array<{
    id: string;
    invoiceNumber: string;
    subtotalPaise: string;
    diagnosticFeeCreditPaise: string;
    priorPaymentsCreditedPaise: string;
    cgstPaise: string;
    sgstPaise: string;
    totalAmountPaise: string;
    outstandingPaise: string;
    status: string;
    issuedAt: string;
    serviceRequest?: {
      requestNumber: string;
      customer?: { displayName: string; phone?: string; email?: string };
      vehicle?: { make: string; model: string; registrationNumber?: string };
    };
  }>>(u, '/service/invoices'),
  servicePayments: (u: User) => call<Array<{
    id: string;
    type: string;
    amountPaise: string;
    paymentGateway: string;
    status: string;
    gatewayPaymentId?: string;
    verifiedAt?: string;
    serviceRequest?: {
      requestNumber: string;
      customer?: { displayName: string };
    };
  }>>(u, '/service/payments'),
};
