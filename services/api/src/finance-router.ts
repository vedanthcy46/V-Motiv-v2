import { Router } from 'express';
import { z } from 'zod';
import { authentication, type Identity, type VerifyToken } from './auth.js';
import { PrismaFinanceStore } from './finance-store.js';

const uuid = z.string().uuid();
const payoutIdempotency = z.string().trim().min(16).max(120);

// Validation schemas
const preparePayoutInput = z.object({
  beneficiaryName: z.string().trim().min(2).max(160),
  beneficiaryAccountMasked: z.string().trim().min(4).max(80).regex(/^[A-Za-z0-9* -]+$/),
  paymentMethod: z.enum(['MANUAL_BANK_TRANSFER', 'NEFT', 'RTGS', 'IMPS', 'UPI', 'PAYMENT_GATEWAY', 'FINANCE_PARTNER']),
  payoutPurpose: z.enum(['SELLER_PROCEEDS', 'LENDER_PAYOFF', 'ADJUSTMENT']).optional(),
  amountPaise: z.union([z.string(), z.number()]).optional(),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
  lenderName: z.string().trim().max(160).optional(),
  lenderAccountMasked: z.string().trim().max(80).optional(),
  lenderPayoffPaise: z.union([z.string(), z.number()]).optional(),
  sellerPayablePaise: z.union([z.string(), z.number()]).optional(),
});

const versionInput = z.object({ version: z.number().int().positive() }).strict();

const approvalInput = versionInput.extend({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().trim().min(4).max(1000),
});

const executeInput = versionInput.extend({
  bankReference: z.string().trim().min(3).max(160),
  notes: z.string().trim().max(2000).optional(),
  companyBankAccountId: uuid.optional(),
});

const verifyInput = versionInput.extend({
  kind: z.enum(['BANK_STATEMENT', 'PROVIDER_SETTLEMENT', 'MANUAL_BANK_CONFIRMATION']),
  reference: z.string().trim().min(3).max(160),
  evidenceUri: z.string().url().max(1000).optional(),
  observedAt: z.string().datetime().transform(value => new Date(value)),
});

const createObligationInput = z.object({
  customerId: uuid.optional(),
  buyerUserId: uuid.optional(),
  buyerName: z.string().trim().min(2).max(160).optional(),
  buyerEmail: z.string().trim().email().optional(),
  buyerPhone: z.string().trim().max(30).optional(),
  listingId: uuid.optional(),
  vehicleListingId: uuid.optional(),
  stockUnitId: uuid.optional(),
  quotationId: uuid.optional(),
  reservationId: uuid.optional(),
  salePricePaise: z.union([z.string(), z.number()]).optional(),
  bookingDepositPaise: z.union([z.string(), z.number()]).optional(),
  totalPayablePaise: z.union([z.string(), z.number()]).optional(),
  chargeBreakdown: z.any().optional(),
  dueDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

const recordReceiptInput = z.object({
  customerId: uuid.optional(),
  payerName: z.string().trim().min(2).max(160),
  payerPhone: z.string().trim().max(30).optional(),
  amountPaise: z.union([z.string(), z.number()]),
  paymentMethod: z.enum(['MANUAL_BANK_TRANSFER', 'NEFT', 'RTGS', 'IMPS', 'UPI', 'PAYMENT_GATEWAY', 'FINANCE_PARTNER', 'CASH', 'CHEQUE', 'BANK_DEPOSIT']).default('MANUAL_BANK_TRANSFER'),
  paymentMode: z.string().optional(),
  transactionReference: z.string().trim().min(1).max(160).default('TXN-PENDING'),
  bankReference: z.string().trim().optional(),
  companyBankAccountId: uuid.optional(),
  evidenceUri: z.string().max(1000).optional(),
  receivedAt: z.string().optional(),
  branchId: uuid.optional(),
  notes: z.string().max(2000).optional(),
});

const allocateReceiptInput = z.object({
  receiptId: uuid.optional(),
  obligationId: uuid,
  allocatedAmountPaise: z.union([z.string(), z.number()]).optional(),
  amountPaise: z.union([z.string(), z.number()]).optional(),
  notes: z.string().max(1000).optional(),
});

const requestRefundInput = z.object({
  customerId: uuid,
  obligationId: uuid.optional(),
  receiptId: uuid.optional(),
  reason: z.enum(['CANCELLED_RESERVATION', 'CANCELLED_SALE', 'DUPLICATE_PAYMENT', 'EXCESS_COLLECTION', 'DISPUTE_RESOLUTION', 'CONTRACTUAL_ADJUSTMENT']),
  notes: z.string().trim().min(5).max(2000),
  requestedAmountPaise: z.union([z.string(), z.number()]),
  deductionAmountPaise: z.union([z.string(), z.number()]).optional(),
  beneficiaryName: z.string().trim().min(2).max(160),
  beneficiaryAccountMasked: z.string().trim().min(4).max(80).regex(/^[A-Za-z0-9* -]+$/),
  paymentMethod: z.enum(['MANUAL_BANK_TRANSFER', 'NEFT', 'RTGS', 'IMPS', 'UPI', 'PAYMENT_GATEWAY']).optional(),
}).strict();

const createVendorInput = z.object({
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().transform(c => {
    const map: Record<string, string> = {
      WORKSHOP: 'WORKSHOP_MECHANICAL',
      BODYSHOP: 'WORKSHOP_BODY_PAINT',
      DETAILING: 'DETAILING',
      SPARE_PARTS: 'PARTS_SUPPLIER',
      PARTS: 'PARTS_SUPPLIER',
      LOGISTICS: 'LOGISTICS_TOWING',
      TOWING: 'LOGISTICS_TOWING',
      RTO_AGENT: 'DOCUMENTATION_RTO',
      RTO: 'DOCUMENTATION_RTO',
      INSPECTION: 'INSPECTION_AGENCY',
    };
    return (map[c] || c) as any;
  }),
  contactPerson: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().optional().transform(v => (v && v.length > 0 ? v : undefined)),
  gstin: z.string().trim().max(30).optional(),
  panNumber: z.string().trim().max(30).optional(),
  bankAccountMasked: z.string().trim().max(80).optional(),
  beneficiaryAccountMasked: z.string().trim().max(80).optional(),
  ifscCode: z.string().trim().max(20).optional(),
});

const createExpenseInput = z.object({
  vendorId: uuid.optional(),
  stockUnitId: uuid.optional(),
  branchId: uuid.optional(),
  category: z.string().trim().transform(c => {
    const map: Record<string, string> = {
      MECHANICAL_REPAIR: 'REFURBISHMENT_MECHANICAL',
      BODY_AND_PAINT: 'REFURBISHMENT_BODYWORK',
      DETAILING_AND_CLEANING: 'REFURBISHMENT_DETAILING',
      PARTS_REPLACEMENT: 'PARTS',
      LOGISTICS_AND_TOWING: 'TOWING_TRANSPORT',
      RTO_AND_CHALLAN: 'RTO_DOCUMENTATION',
    };
    return (map[c] || c) as any;
  }),
  invoiceNumber: z.string().trim().max(80).optional(),
  invoiceDate: z.string().optional(),
  estimatedAmountPaise: z.union([z.string(), z.number()]).optional(),
  amountPaise: z.union([z.string(), z.number()]).optional(),
  invoiceAmountPaise: z.union([z.string(), z.number()]).optional(),
  taxAmountPaise: z.union([z.string(), z.number()]).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  evidenceUri: z.string().max(1000).optional(),
  paymentMethod: z.enum(['MANUAL_BANK_TRANSFER', 'NEFT', 'RTGS', 'IMPS', 'UPI']).optional(),
});

const createBankAccountInput = z.object({
  bankName: z.string().trim().min(2).max(100),
  accountName: z.string().trim().min(2).max(100).optional(),
  accountNumberMasked: z.string().trim().min(4).max(80),
  ifscCode: z.string().trim().min(4).max(20),
  branchName: z.string().trim().max(100).optional(),
  accountType: z.string().trim().max(40).optional(),
  openingBalancePaise: z.union([z.string(), z.number()]).optional(),
  initialBalancePaise: z.union([z.string(), z.number()]).optional(),
});

const importStatementInput = z.object({
  companyBankAccountId: uuid,
  filename: z.string().trim().min(1).max(255),
  startDate: z.string(),
  endDate: z.string(),
  entries: z.array(z.object({
    entryDate: z.string(),
    valueDate: z.string().optional(),
    description: z.string().trim().min(1).max(500),
    reference: z.string().trim().max(160).optional(),
    debitPaise: z.union([z.string(), z.number()]).optional(),
    creditPaise: z.union([z.string(), z.number()]).optional(),
    balancePaise: z.union([z.string(), z.number()]).optional(),
  })),
}).strict();

const matchStatementEntryInput = z.object({
  kind: z.string().trim().min(2).max(80),
  targetId: uuid,
  notes: z.string().max(1000).optional(),
}).strict();

const postJournalInput = z.object({
  periodId: uuid,
  postingDate: z.string(),
  sourceType: z.enum(['ACQUISITION_SETTLEMENT', 'BUYER_RECEIPT', 'EXPENSE_CLAIM', 'REFUND_DISBURSEMENT', 'MANUAL_ADJUSTMENT', 'PERIOD_CLOSE', 'MANUAL']).default('MANUAL_ADJUSTMENT'),
  sourceId: uuid.optional(),
  narration: z.string().trim().min(2).max(1000).optional(),
  description: z.string().trim().min(2).max(1000).optional(),
  lines: z.array(z.object({
    accountId: uuid,
    debitPaise: z.union([z.string(), z.number()]).default('0'),
    creditPaise: z.union([z.string(), z.number()]).default('0'),
    narration: z.string().max(500).optional(),
    description: z.string().max(500).optional(),
  })).min(2),
});

const issueInvoiceInput = z.object({
  invoiceType: z
    .string()
    .trim()
    .default('VEHICLE_SALE_TAX_INVOICE')
    .transform(t => {
      if (t === 'TAX_INVOICE' || t === 'VEHICLE_SALE' || t === 'SALE_INVOICE') {
        return 'VEHICLE_SALE_TAX_INVOICE';
      }
      return t as 'VEHICLE_SALE_TAX_INVOICE' | 'ACQUISITION_SETTLEMENT_STATEMENT' | 'CREDIT_NOTE' | 'PAYMENT_RECEIPT_VOUCHER';
    }),
  stockUnitId: uuid.optional(),
  customerId: uuid.optional(),
  obligationId: uuid.optional(),
  sellerLeadId: uuid.optional(),
  buyerName: z.string().optional(),
  buyerAddress: z.string().optional(),
  buyerGstin: z.string().optional(),
  subtotalPaise: z.union([z.string(), z.number()]),
  cgstPaise: z.union([z.string(), z.number()]).optional(),
  sgstPaise: z.union([z.string(), z.number()]).optional(),
  igstPaise: z.union([z.string(), z.number()]).optional(),
  pdfUri: z.string().max(1000).optional(),
});

export function createFinanceRouter(deps: { verify: VerifyToken; store: PrismaFinanceStore }) {
  const router = Router();
  router.use(authentication(deps.verify));

  router.use(async (_req, res, next) => {
    try {
      res.locals.financeActor = await deps.store.actor((res.locals.identity as Identity).uid);
      next();
    } catch (error) {
      next(error);
    }
  });

  // 1. Identity & Dashboard
  router.get('/me', (_req, res) => res.json(res.locals.financeActor));
  router.get('/dashboard', async (_req, res, next) => {
    try {
      res.json(await deps.store.dashboard(res.locals.financeActor));
    } catch (error) {
      next(error);
    }
  });

  // 2. Seller Settlements & Payouts
  router.get('/seller-settlements', async (req, res, next) => {
    try {
      res.json(await deps.store.settlements(res.locals.financeActor));
    } catch (error) {
      next(error);
    }
  });

  router.get('/seller-settlements/:id', async (req, res, next) => {
    try {
      res.json(await deps.store.settlementById(res.locals.financeActor, uuid.parse(req.params.id)));
    } catch (error) {
      next(error);
    }
  });

  router.post('/seller-settlements/:id/payout-instructions', async (req, res, next) => {
    try {
      const body = {
        ...req.body,
        idempotencyKey: req.body.idempotencyKey || crypto.randomUUID(),
      };
      const input = preparePayoutInput.parse(body);
      res.status(201).json(
        await deps.store.preparePayout(res.locals.financeActor, uuid.parse(req.params.id), {
          ...input,
          idempotencyKey: input.idempotencyKey || crypto.randomUUID(),
        })
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/payout-instructions/:id/submit', async (req, res, next) => {
    try {
      const input = versionInput.parse(req.body);
      res.json(
        await deps.store.submitPayout(res.locals.financeActor, uuid.parse(req.params.id), input.version)
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/payout-instructions/:id/decision', async (req, res, next) => {
    try {
      const input = approvalInput.parse(req.body);
      res.json(
        await deps.store.approvePayout(
          res.locals.financeActor,
          uuid.parse(req.params.id),
          input.version,
          input.decision,
          input.reason
        )
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/payout-instructions/:id/execute', async (req, res, next) => {
    try {
      const input = executeInput.parse(req.body);
      res.json(
        await deps.store.executePayout(
          res.locals.financeActor,
          uuid.parse(req.params.id),
          input.version,
          input.bankReference,
          input.notes
        )
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/payout-instructions/:id/reconcile', async (req, res, next) => {
    try {
      const input = verifyInput.parse(req.body);
      res.json(
        await deps.store.verifyPayout(
          res.locals.financeActor,
          uuid.parse(req.params.id),
          input.version,
          {
            ...input,
            evidenceUri: input.evidenceUri || 'https://private-evidence.vmotiv.in/manual-confirmation',
          }
        )
      );
    } catch (error) {
      next(error);
    }
  });

  // 3. Buyer Obligations & Collections
  router.get('/buyer-obligations', async (req, res, next) => {
    try {
      res.json(
        await deps.store.buyerObligations(res.locals.financeActor, {
          status: req.query.status as string,
          search: req.query.search as string,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  router.get('/buyer-obligations/:id', async (req, res, next) => {
    try {
      res.json(await deps.store.buyerObligationById(res.locals.financeActor, uuid.parse(req.params.id)));
    } catch (error) {
      next(error);
    }
  });

  router.post('/buyer-obligations', async (req, res, next) => {
    try {
      const input = createObligationInput.parse(req.body);
      const customerId = input.customerId || input.buyerUserId || crypto.randomUUID();
      const listingId = input.listingId || input.vehicleListingId || input.stockUnitId || crypto.randomUUID();
      const totalPayablePaise = input.totalPayablePaise || input.salePricePaise || '0';
      res.status(201).json(await deps.store.createBuyerObligation(res.locals.financeActor, {
        customerId,
        listingId,
        quotationId: input.quotationId,
        reservationId: input.reservationId,
        totalPayablePaise,
        chargeBreakdown: input.chargeBreakdown,
        dueDate: input.dueDate,
        notes: input.notes,
      }));
    } catch (error) {
      next(error);
    }
  });

  router.get('/receipts', async (req, res, next) => {
    try {
      res.json(
        await deps.store.incomingReceipts(res.locals.financeActor, {
          status: req.query.status as string,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/receipts', async (req, res, next) => {
    try {
      const body = {
        ...req.body,
        paymentMethod: req.body.paymentMethod || req.body.paymentMode || 'MANUAL_BANK_TRANSFER',
        transactionReference: req.body.transactionReference || req.body.bankReference || `TXN-${Date.now()}`,
      };
      const input = recordReceiptInput.parse(body);
      res.status(201).json(await deps.store.recordIncomingReceipt(res.locals.financeActor, {
        ...input,
        paymentMethod: input.paymentMethod || 'MANUAL_BANK_TRANSFER',
        transactionReference: input.transactionReference || `TXN-${Date.now()}`,
      }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/receipts/:id/verify', async (req, res, next) => {
    try {
      const input = versionInput.parse(req.body);
      res.json(
        await deps.store.verifyIncomingReceipt(
          res.locals.financeActor,
          uuid.parse(req.params.id),
          input.version
        )
      );
    } catch (error) {
      next(error);
    }
  });

  const handleAllocate = async (req: any, res: any, next: any) => {
    try {
      const body = {
        ...req.body,
        receiptId: req.body.receiptId || req.params.id,
        allocatedAmountPaise: req.body.allocatedAmountPaise || req.body.amountPaise,
      };
      const input = allocateReceiptInput.parse(body);
      res.json(await deps.store.allocateReceipt(res.locals.financeActor, input as any));
    } catch (error) {
      next(error);
    }
  };
  router.post('/receipts/allocate', handleAllocate);
  router.post('/receipts/:id/allocate', handleAllocate);

  // 4. Refunds & Reversals
  router.get('/refunds', async (req, res, next) => {
    try {
      res.json(
        await deps.store.refunds(res.locals.financeActor, {
          status: req.query.status as string,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  router.get('/refunds/:id', async (req, res, next) => {
    try {
      res.json(await deps.store.refundById(res.locals.financeActor, uuid.parse(req.params.id)));
    } catch (error) {
      next(error);
    }
  });

  router.post('/refunds', async (req, res, next) => {
    try {
      const input = requestRefundInput.parse(req.body);
      res.status(201).json(await deps.store.requestRefund(res.locals.financeActor, input));
    } catch (error) {
      next(error);
    }
  });

  router.post('/refunds/:id/decision', async (req, res, next) => {
    try {
      const input = approvalInput.parse(req.body);
      res.json(
        await deps.store.approveRefund(
          res.locals.financeActor,
          uuid.parse(req.params.id),
          input.version,
          input.decision,
          input.reason
        )
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/refunds/:id/execute', async (req, res, next) => {
    try {
      const input = executeInput.parse(req.body);
      res.json(
        await deps.store.executeRefund(
          res.locals.financeActor,
          uuid.parse(req.params.id),
          input.version,
          input.bankReference,
          input.notes
        )
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/refunds/:id/reconcile', async (req, res, next) => {
    try {
      const input = versionInput.parse(req.body);
      res.json(
        await deps.store.verifyRefund(res.locals.financeActor, uuid.parse(req.params.id), input.version)
      );
    } catch (error) {
      next(error);
    }
  });

  // 5. Vendors & Vehicle Expenses
  router.get('/vendors', async (_req, res, next) => {
    try {
      res.json(await deps.store.vendors(res.locals.financeActor));
    } catch (error) {
      next(error);
    }
  });

  router.post('/vendors', async (req, res, next) => {
    try {
      const input = createVendorInput.parse(req.body);
      const beneficiaryAccountMasked = input.beneficiaryAccountMasked || input.bankAccountMasked;
      res.status(201).json(
        await deps.store.createVendor(res.locals.financeActor, {
          name: input.name,
          category: input.category,
          contactPerson: input.contactPerson,
          phone: input.phone,
          email: input.email,
          gstin: input.gstin,
          beneficiaryAccountMasked,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  router.get('/expenses', async (req, res, next) => {
    try {
      res.json(
        await deps.store.expenses(res.locals.financeActor, {
          status: req.query.status as string,
          stockUnitId: req.query.stockUnitId as string,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/expenses', async (req, res, next) => {
    try {
      const input = createExpenseInput.parse(req.body);
      const invoiceAmountPaise = input.invoiceAmountPaise || input.amountPaise || '0';
      const description = input.description || `Expense claim for ${input.category}`;
      let vendorId = input.vendorId;
      if (!vendorId) {
        const defaultVendor = await deps.store.ensureDefaultVendor(res.locals.financeActor);
        vendorId = defaultVendor.id;
      }
      res.status(201).json(
        await deps.store.createExpense(res.locals.financeActor, {
          ...input,
          vendorId,
          invoiceAmountPaise,
          description,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/expenses/:id/decision', async (req, res, next) => {
    try {
      const input = approvalInput.parse(req.body);
      res.json(
        await deps.store.approveExpense(
          res.locals.financeActor,
          uuid.parse(req.params.id),
          input.version,
          input.decision,
          input.reason
        )
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/expenses/:id/pay', async (req, res, next) => {
    try {
      const input = executeInput.parse(req.body);
      res.json(
        await deps.store.payExpense(
          res.locals.financeActor,
          uuid.parse(req.params.id),
          input.version,
          input.bankReference,
          input.notes
        )
      );
    } catch (error) {
      next(error);
    }
  });

  // 6. Company Bank Accounts & Statement Reconciliation
  router.get('/bank-accounts', async (_req, res, next) => {
    try {
      res.json(await deps.store.bankAccounts(res.locals.financeActor));
    } catch (error) {
      next(error);
    }
  });

  router.post('/bank-accounts', async (req, res, next) => {
    try {
      const input = createBankAccountInput.parse(req.body);
      const accountName = input.accountName || `${input.bankName} Operations Account`;
      const openingBalancePaise = input.openingBalancePaise || input.initialBalancePaise || '0';
      res.status(201).json(
        await deps.store.createBankAccount(res.locals.financeActor, {
          ...input,
          accountName,
          openingBalancePaise,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  router.get('/bank-statements/imports', async (_req, res, next) => {
    try {
      res.json(await deps.store.statementImports(res.locals.financeActor));
    } catch (error) {
      next(error);
    }
  });

  router.post('/bank-statements/import', async (req, res, next) => {
    try {
      const input = importStatementInput.parse(req.body);
      res.status(201).json(await deps.store.importBankStatement(res.locals.financeActor, input));
    } catch (error) {
      next(error);
    }
  });

  router.get(['/bank-statements', '/bank-statements/entries'], async (req, res, next) => {
    try {
      res.json(
        await deps.store.statementEntries(res.locals.financeActor, {
          status: req.query.status as string,
          companyBankAccountId: req.query.companyBankAccountId as string,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/bank-statements/entries/:id/match', async (req, res, next) => {
    try {
      const input = matchStatementEntryInput.parse(req.body);
      res.json(
        await deps.store.matchStatementEntry(
          res.locals.financeActor,
          uuid.parse(req.params.id),
          input
        )
      );
    } catch (error) {
      next(error);
    }
  });

  // Reconciliation Exceptions
  router.get('/reconciliation-exceptions', async (req, res, next) => {
    try {
      res.json(await deps.store.reconciliationExceptions(res.locals.financeActor, { status: req.query.status as string }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/reconciliation-exceptions/:id/resolve', async (req, res, next) => {
    try {
      res.json(await deps.store.resolveException(res.locals.financeActor, uuid.parse(req.params.id), req.body?.note || req.body?.notes || 'Resolved by treasury'));
    } catch (error) {
      next(error);
    }
  });

  // 7. Double-Entry Financial Ledger
  router.get('/chart-of-accounts', async (_req, res, next) => {
    try {
      res.json(await deps.store.chartOfAccounts(res.locals.financeActor));
    } catch (error) {
      next(error);
    }
  });

  router.post(['/chart-of-accounts/seed', '/chart-of-accounts/seed-default'], async (_req, res, next) => {
    try {
      res.json(await deps.store.initializeDefaultCOA(res.locals.financeActor));
    } catch (error) {
      next(error);
    }
  });

  router.get('/accounting-periods', async (_req, res, next) => {
    try {
      res.json(await deps.store.accountingPeriods(res.locals.financeActor));
    } catch (error) {
      next(error);
    }
  });

  router.post('/accounting-periods/:id/close', async (req, res, next) => {
    try {
      res.json(
        await deps.store.closePeriod(
          res.locals.financeActor,
          uuid.parse(req.params.id),
          req.body?.notes
        )
      );
    } catch (error) {
      next(error);
    }
  });

  router.get('/journals', async (req, res, next) => {
    try {
      res.json(
        await deps.store.journals(res.locals.financeActor, {
          periodId: req.query.periodId as string,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/journals', async (req, res, next) => {
    try {
      const body = {
        ...req.body,
        narration: req.body.narration || req.body.description || 'General Journal Entry',
        sourceType: req.body.sourceType === 'MANUAL' ? 'MANUAL_ADJUSTMENT' : req.body.sourceType,
      };
      const input = postJournalInput.parse(body);
      res.status(201).json(await deps.store.postJournal(res.locals.financeActor, input as any));
    } catch (error) {
      next(error);
    }
  });

  // 8. Invoicing & Commercial Documents
  router.get('/invoices', async (req, res, next) => {
    try {
      res.json(
        await deps.store.invoices(res.locals.financeActor, {
          type: req.query.type as string,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/invoices', async (req, res, next) => {
    try {
      const input = issueInvoiceInput.parse(req.body);
      res.status(201).json(await deps.store.issueInvoice(res.locals.financeActor, input as any));
    } catch (error) {
      next(error);
    }
  });

  // 9. Vehicle-Level Costing & Profitability
  router.get(['/profitability', '/vehicle-profitability'], async (req, res, next) => {
    try {
      res.json(
        await deps.store.vehicleProfitability(res.locals.financeActor, {
          search: req.query.search as string,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  // 10. Audit Trail
  router.get(['/audit', '/audit-trail'], async (req, res, next) => {
    try {
      res.json(
        await deps.store.auditLogs(res.locals.financeActor, {
          action: req.query.action as string,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  return router;
}
