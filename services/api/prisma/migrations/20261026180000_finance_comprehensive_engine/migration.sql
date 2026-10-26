-- AlterTable AcquisitionSettlement
ALTER TABLE "AcquisitionSettlement" ADD COLUMN IF NOT EXISTS "sellerPayablePaise" BIGINT;
ALTER TABLE "AcquisitionSettlement" ADD COLUMN IF NOT EXISTS "lenderPayoffPaise" BIGINT;
ALTER TABLE "AcquisitionSettlement" ADD COLUMN IF NOT EXISTS "lenderName" TEXT;
ALTER TABLE "AcquisitionSettlement" ADD COLUMN IF NOT EXISTS "lenderAccountMasked" TEXT;

-- AlterTable FinancePayoutInstruction
ALTER TABLE "FinancePayoutInstruction" ADD COLUMN IF NOT EXISTS "payoutPurpose" TEXT NOT NULL DEFAULT 'SELLER_PROCEEDS';

-- CreateEnums
DO $$ BEGIN
  CREATE TYPE "PaymentObligationStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID_VERIFIED', 'OVERDUE', 'REFUNDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "IncomingReceiptStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'RECONCILED', 'REVERSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "RefundReason" AS ENUM ('CANCELLED_RESERVATION', 'CANCELLED_SALE', 'DUPLICATE_PAYMENT', 'EXCESS_COLLECTION', 'DISPUTE_RESOLUTION', 'CONTRACTUAL_ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVAL_PENDING', 'APPROVED', 'PROCESSING', 'REFUNDED_VERIFIED', 'REJECTED', 'CANCELLED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "VendorCategory" AS ENUM ('WORKSHOP_MECHANICAL', 'WORKSHOP_BODY_PAINT', 'DETAILING', 'LOGISTICS_TOWING', 'PARTS_SUPPLIER', 'DOCUMENTATION_RTO', 'INSPECTION_AGENCY', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ExpenseCategory" AS ENUM ('REFURBISHMENT_MECHANICAL', 'REFURBISHMENT_BODYWORK', 'REFURBISHMENT_DETAILING', 'PARTS', 'TOWING_TRANSPORT', 'RTO_DOCUMENTATION', 'STORAGE_PARKING', 'INSPECTION_FEE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "StatementImportStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "StatementEntryStatus" AS ENUM ('UNMATCHED', 'MATCH_CANDIDATE', 'MATCHED', 'EXCEPTION');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ReconciliationExceptionType" AS ENUM ('UNMATCHED_BANK_CREDIT', 'UNMATCHED_BANK_DEBIT', 'AMOUNT_MISMATCH', 'DUPLICATE_SUSPECTED', 'COUNTERPARTY_MISMATCH', 'TIMING_DIFFERENCE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ExceptionResolutionStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'WRITTEN_OFF');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AccountCategory" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "NormalBalance" AS ENUM ('DEBIT', 'CREDIT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSING_PENDING', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "JournalSourceType" AS ENUM ('ACQUISITION_SETTLEMENT', 'BUYER_RECEIPT', 'EXPENSE_CLAIM', 'REFUND_DISBURSEMENT', 'MANUAL_ADJUSTMENT', 'PERIOD_CLOSE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "InvoiceType" AS ENUM ('VEHICLE_SALE_TAX_INVOICE', 'ACQUISITION_SETTLEMENT_STATEMENT', 'CREDIT_NOTE', 'PAYMENT_RECEIPT_VOUCHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable CompanyBankAccount
CREATE TABLE IF NOT EXISTS "CompanyBankAccount" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bankName" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "accountNumberMasked" TEXT NOT NULL,
  "ifscCode" TEXT NOT NULL,
  "branchName" TEXT,
  "accountType" TEXT NOT NULL DEFAULT 'CURRENT',
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "balancePaise" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable BuyerPaymentObligation
CREATE TABLE IF NOT EXISTS "BuyerPaymentObligation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "obligationNumber" TEXT NOT NULL,
  "customerId" UUID NOT NULL,
  "listingId" UUID NOT NULL,
  "quotationId" UUID,
  "reservationId" UUID,
  "totalPayablePaise" BIGINT NOT NULL,
  "paidAmountPaise" BIGINT NOT NULL DEFAULT 0,
  "remainingBalancePaise" BIGINT NOT NULL,
  "chargeBreakdown" JSONB,
  "status" "PaymentObligationStatus" NOT NULL DEFAULT 'PENDING',
  "dueDate" TIMESTAMP(3),
  "deliveryEligible" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuyerPaymentObligation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BuyerPaymentObligation_obligationNumber_key" ON "BuyerPaymentObligation"("obligationNumber");
CREATE INDEX IF NOT EXISTS "BuyerPaymentObligation_customerId_status_idx" ON "BuyerPaymentObligation"("customerId", "status");
CREATE INDEX IF NOT EXISTS "BuyerPaymentObligation_listingId_status_idx" ON "BuyerPaymentObligation"("listingId", "status");
CREATE INDEX IF NOT EXISTS "BuyerPaymentObligation_status_createdAt_idx" ON "BuyerPaymentObligation"("status", "createdAt");

-- CreateTable IncomingReceipt
CREATE TABLE IF NOT EXISTS "IncomingReceipt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "receiptNumber" TEXT NOT NULL,
  "customerId" UUID,
  "payerName" TEXT NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "unappliedAmountPaise" BIGINT NOT NULL,
  "paymentMethod" "FinancePaymentMethod" NOT NULL DEFAULT 'NEFT',
  "transactionReference" TEXT NOT NULL,
  "companyBankAccountId" UUID,
  "evidenceUri" TEXT,
  "notes" TEXT,
  "status" "IncomingReceiptStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "recordedByEmployeeId" UUID NOT NULL,
  "verifiedByEmployeeId" UUID,
  "verifiedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncomingReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "IncomingReceipt_receiptNumber_key" ON "IncomingReceipt"("receiptNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "IncomingReceipt_transactionReference_key" ON "IncomingReceipt"("transactionReference");
CREATE INDEX IF NOT EXISTS "IncomingReceipt_status_createdAt_idx" ON "IncomingReceipt"("status", "createdAt");

-- CreateTable ReceiptAllocation
CREATE TABLE IF NOT EXISTS "ReceiptAllocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "receiptId" UUID NOT NULL,
  "obligationId" UUID NOT NULL,
  "allocatedAmountPaise" BIGINT NOT NULL,
  "notes" TEXT,
  "allocatedByEmployeeId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReceiptAllocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ReceiptAllocation_obligationId_createdAt_idx" ON "ReceiptAllocation"("obligationId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReceiptAllocation_receiptId_createdAt_idx" ON "ReceiptAllocation"("receiptId", "createdAt");

-- CreateTable RefundCase
CREATE TABLE IF NOT EXISTS "RefundCase" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "refundNumber" TEXT NOT NULL,
  "obligationId" UUID,
  "receiptId" UUID,
  "customerId" UUID NOT NULL,
  "reason" "RefundReason" NOT NULL,
  "notes" TEXT NOT NULL,
  "requestedAmountPaise" BIGINT NOT NULL,
  "eligibleAmountPaise" BIGINT NOT NULL,
  "deductionAmountPaise" BIGINT NOT NULL DEFAULT 0,
  "approvedAmountPaise" BIGINT NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
  "beneficiaryName" TEXT NOT NULL,
  "beneficiaryAccountMasked" TEXT NOT NULL,
  "paymentMethod" "FinancePaymentMethod" NOT NULL DEFAULT 'NEFT',
  "bankReference" TEXT,
  "evidenceUri" TEXT,
  "requestedByEmployeeId" UUID NOT NULL,
  "approvedByEmployeeId" UUID,
  "executedByEmployeeId" UUID,
  "verifiedByEmployeeId" UUID,
  "approvedAt" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RefundCase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RefundCase_refundNumber_key" ON "RefundCase"("refundNumber");
CREATE INDEX IF NOT EXISTS "RefundCase_status_createdAt_idx" ON "RefundCase"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "RefundCase_customerId_status_idx" ON "RefundCase"("customerId", "status");

-- CreateTable Vendor
CREATE TABLE IF NOT EXISTS "Vendor" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "vendorCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "VendorCategory" NOT NULL,
  "contactPerson" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "gstin" TEXT,
  "beneficiaryAccountMasked" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Vendor_vendorCode_key" ON "Vendor"("vendorCode");

-- CreateTable ExpenseClaim
CREATE TABLE IF NOT EXISTS "ExpenseClaim" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "claimNumber" TEXT NOT NULL,
  "vendorId" UUID NOT NULL,
  "stockUnitId" UUID,
  "branchId" UUID,
  "category" "ExpenseCategory" NOT NULL,
  "invoiceNumber" TEXT,
  "invoiceDate" TIMESTAMP(3),
  "estimatedAmountPaise" BIGINT NOT NULL DEFAULT 0,
  "invoiceAmountPaise" BIGINT NOT NULL,
  "taxAmountPaise" BIGINT NOT NULL DEFAULT 0,
  "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
  "paymentMethod" "FinancePaymentMethod" NOT NULL DEFAULT 'MANUAL_BANK_TRANSFER',
  "bankReference" TEXT,
  "description" TEXT NOT NULL,
  "evidenceUri" TEXT,
  "submittedByEmployeeId" UUID NOT NULL,
  "approvedByEmployeeId" UUID,
  "paidByEmployeeId" UUID,
  "approvedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExpenseClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseClaim_claimNumber_key" ON "ExpenseClaim"("claimNumber");
CREATE INDEX IF NOT EXISTS "ExpenseClaim_stockUnitId_status_idx" ON "ExpenseClaim"("stockUnitId", "status");
CREATE INDEX IF NOT EXISTS "ExpenseClaim_vendorId_status_idx" ON "ExpenseClaim"("vendorId", "status");
CREATE INDEX IF NOT EXISTS "ExpenseClaim_status_createdAt_idx" ON "ExpenseClaim"("status", "createdAt");

-- CreateTable BankStatementImport
CREATE TABLE IF NOT EXISTS "BankStatementImport" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyBankAccountId" UUID NOT NULL,
  "filename" TEXT NOT NULL,
  "importedByEmployeeId" UUID NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "totalEntries" INTEGER NOT NULL DEFAULT 0,
  "matchedEntries" INTEGER NOT NULL DEFAULT 0,
  "exceptionEntries" INTEGER NOT NULL DEFAULT 0,
  "status" "StatementImportStatus" NOT NULL DEFAULT 'PROCESSED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankStatementImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable BankStatementEntry
CREATE TABLE IF NOT EXISTS "BankStatementEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "statementImportId" UUID NOT NULL,
  "companyBankAccountId" UUID NOT NULL,
  "entryDate" TIMESTAMP(3) NOT NULL,
  "valueDate" TIMESTAMP(3),
  "description" TEXT NOT NULL,
  "reference" TEXT,
  "debitPaise" BIGINT NOT NULL DEFAULT 0,
  "creditPaise" BIGINT NOT NULL DEFAULT 0,
  "balancePaise" BIGINT,
  "status" "StatementEntryStatus" NOT NULL DEFAULT 'UNMATCHED',
  "reconciledWithKind" TEXT,
  "reconciledWithId" UUID,
  "matchedByEmployeeId" UUID,
  "matchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankStatementEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BankStatementEntry_statementImportId_status_idx" ON "BankStatementEntry"("statementImportId", "status");
CREATE INDEX IF NOT EXISTS "BankStatementEntry_status_entryDate_idx" ON "BankStatementEntry"("status", "entryDate");

-- CreateTable ReconciliationException
CREATE TABLE IF NOT EXISTS "ReconciliationException" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "statementEntryId" UUID,
  "internalTransactionType" TEXT,
  "internalTransactionId" UUID,
  "exceptionType" "ReconciliationExceptionType" NOT NULL,
  "details" JSONB,
  "status" "ExceptionResolutionStatus" NOT NULL DEFAULT 'OPEN',
  "resolutionNotes" TEXT,
  "resolvedByEmployeeId" UUID,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReconciliationException_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ReconciliationException_status_createdAt_idx" ON "ReconciliationException"("status", "createdAt");

-- CreateTable ChartOfAccount
CREATE TABLE IF NOT EXISTS "ChartOfAccount" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "AccountCategory" NOT NULL,
  "normalBalance" "NormalBalance" NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChartOfAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChartOfAccount_code_key" ON "ChartOfAccount"("code");

-- CreateTable AccountingPeriod
CREATE TABLE IF NOT EXISTS "AccountingPeriod" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "periodName" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
  "closedByEmployeeId" UUID,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingPeriod_periodName_key" ON "AccountingPeriod"("periodName");

-- CreateTable FinancialJournal
CREATE TABLE IF NOT EXISTS "FinancialJournal" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "journalNumber" TEXT NOT NULL,
  "periodId" UUID NOT NULL,
  "postingDate" TIMESTAMP(3) NOT NULL,
  "sourceType" "JournalSourceType" NOT NULL,
  "sourceId" UUID,
  "narration" TEXT NOT NULL,
  "totalDebitPaise" BIGINT NOT NULL,
  "totalCreditPaise" BIGINT NOT NULL,
  "status" "JournalStatus" NOT NULL DEFAULT 'POSTED',
  "postedByEmployeeId" UUID NOT NULL,
  "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedJournalId" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialJournal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FinancialJournal_journalNumber_key" ON "FinancialJournal"("journalNumber");
CREATE INDEX IF NOT EXISTS "FinancialJournal_periodId_postingDate_idx" ON "FinancialJournal"("periodId", "postingDate");
CREATE INDEX IF NOT EXISTS "FinancialJournal_sourceType_sourceId_idx" ON "FinancialJournal"("sourceType", "sourceId");

-- CreateTable FinancialJournalLine
CREATE TABLE IF NOT EXISTS "FinancialJournalLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "journalId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "debitPaise" BIGINT NOT NULL DEFAULT 0,
  "creditPaise" BIGINT NOT NULL DEFAULT 0,
  "narration" TEXT,
  CONSTRAINT "FinancialJournalLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FinancialJournalLine_journalId_idx" ON "FinancialJournalLine"("journalId");
CREATE INDEX IF NOT EXISTS "FinancialJournalLine_accountId_idx" ON "FinancialJournalLine"("accountId");

-- CreateTable InvoiceDocument
CREATE TABLE IF NOT EXISTS "InvoiceDocument" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoiceNumber" TEXT NOT NULL,
  "invoiceType" "InvoiceType" NOT NULL,
  "stockUnitId" UUID,
  "customerId" UUID,
  "sellerLeadId" UUID,
  "subtotalPaise" BIGINT NOT NULL,
  "cgstPaise" BIGINT NOT NULL DEFAULT 0,
  "sgstPaise" BIGINT NOT NULL DEFAULT 0,
  "igstPaise" BIGINT NOT NULL DEFAULT 0,
  "totalAmountPaise" BIGINT NOT NULL,
  "pdfUri" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "issuedByEmployeeId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvoiceDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceDocument_invoiceNumber_key" ON "InvoiceDocument"("invoiceNumber");
CREATE INDEX IF NOT EXISTS "InvoiceDocument_invoiceType_issuedAt_idx" ON "InvoiceDocument"("invoiceType", "issuedAt");
CREATE INDEX IF NOT EXISTS "InvoiceDocument_stockUnitId_idx" ON "InvoiceDocument"("stockUnitId");
CREATE INDEX IF NOT EXISTS "InvoiceDocument_customerId_idx" ON "InvoiceDocument"("customerId");

-- ForeignKeys
ALTER TABLE "BuyerPaymentObligation" ADD CONSTRAINT "BuyerPaymentObligation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BuyerPaymentObligation" ADD CONSTRAINT "BuyerPaymentObligation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "VehicleListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BuyerPaymentObligation" ADD CONSTRAINT "BuyerPaymentObligation_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "BuyerQuotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuyerPaymentObligation" ADD CONSTRAINT "BuyerPaymentObligation_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "VehicleReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IncomingReceipt" ADD CONSTRAINT "IncomingReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncomingReceipt" ADD CONSTRAINT "IncomingReceipt_companyBankAccountId_fkey" FOREIGN KEY ("companyBankAccountId") REFERENCES "CompanyBankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncomingReceipt" ADD CONSTRAINT "IncomingReceipt_recordedByEmployeeId_fkey" FOREIGN KEY ("recordedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncomingReceipt" ADD CONSTRAINT "IncomingReceipt_verifiedByEmployeeId_fkey" FOREIGN KEY ("verifiedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "IncomingReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "BuyerPaymentObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_allocatedByEmployeeId_fkey" FOREIGN KEY ("allocatedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RefundCase" ADD CONSTRAINT "RefundCase_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "BuyerPaymentObligation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefundCase" ADD CONSTRAINT "RefundCase_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "IncomingReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefundCase" ADD CONSTRAINT "RefundCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundCase" ADD CONSTRAINT "RefundCase_requestedByEmployeeId_fkey" FOREIGN KEY ("requestedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundCase" ADD CONSTRAINT "RefundCase_approvedByEmployeeId_fkey" FOREIGN KEY ("approvedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundCase" ADD CONSTRAINT "RefundCase_executedByEmployeeId_fkey" FOREIGN KEY ("executedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundCase" ADD CONSTRAINT "RefundCase_verifiedByEmployeeId_fkey" FOREIGN KEY ("verifiedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_stockUnitId_fkey" FOREIGN KEY ("stockUnitId") REFERENCES "VehicleStockUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_submittedByEmployeeId_fkey" FOREIGN KEY ("submittedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_approvedByEmployeeId_fkey" FOREIGN KEY ("approvedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_paidByEmployeeId_fkey" FOREIGN KEY ("paidByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_companyBankAccountId_fkey" FOREIGN KEY ("companyBankAccountId") REFERENCES "CompanyBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_importedByEmployeeId_fkey" FOREIGN KEY ("importedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BankStatementEntry" ADD CONSTRAINT "BankStatementEntry_statementImportId_fkey" FOREIGN KEY ("statementImportId") REFERENCES "BankStatementImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankStatementEntry" ADD CONSTRAINT "BankStatementEntry_companyBankAccountId_fkey" FOREIGN KEY ("companyBankAccountId") REFERENCES "CompanyBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatementEntry" ADD CONSTRAINT "BankStatementEntry_matchedByEmployeeId_fkey" FOREIGN KEY ("matchedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_statementEntryId_fkey" FOREIGN KEY ("statementEntryId") REFERENCES "BankStatementEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_resolvedByEmployeeId_fkey" FOREIGN KEY ("resolvedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_closedByEmployeeId_fkey" FOREIGN KEY ("closedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinancialJournal" ADD CONSTRAINT "FinancialJournal_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialJournal" ADD CONSTRAINT "FinancialJournal_postedByEmployeeId_fkey" FOREIGN KEY ("postedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialJournalLine" ADD CONSTRAINT "FinancialJournalLine_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "FinancialJournal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialJournalLine" ADD CONSTRAINT "FinancialJournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvoiceDocument" ADD CONSTRAINT "InvoiceDocument_stockUnitId_fkey" FOREIGN KEY ("stockUnitId") REFERENCES "VehicleStockUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceDocument" ADD CONSTRAINT "InvoiceDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceDocument" ADD CONSTRAINT "InvoiceDocument_issuedByEmployeeId_fkey" FOREIGN KEY ("issuedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
