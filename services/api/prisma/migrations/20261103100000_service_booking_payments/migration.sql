-- Add dynamic pricing and diagnostic fees to ServiceIssueTemplate
ALTER TABLE "ServiceIssueTemplate" ADD COLUMN IF NOT EXISTS "pricingType" TEXT NOT NULL DEFAULT 'FIXED';
ALTER TABLE "ServiceIssueTemplate" ADD COLUMN IF NOT EXISTS "diagnosticFeePaise" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "ServiceIssueTemplate" ADD COLUMN IF NOT EXISTS "updatedByEmployeeId" UUID;

-- Add payment plan, balance tracking and invoice fields to ServiceRequest
ALTER TABLE "ServiceRequest" ADD COLUMN IF NOT EXISTS "paymentPlanSnapshot" JSONB;
ALTER TABLE "ServiceRequest" ADD COLUMN IF NOT EXISTS "servicePaymentStatus" TEXT NOT NULL DEFAULT 'UNPAID';
ALTER TABLE "ServiceRequest" ADD COLUMN IF NOT EXISTS "depositStatus" TEXT NOT NULL DEFAULT 'NOT_COLLECTED';
ALTER TABLE "ServiceRequest" ADD COLUMN IF NOT EXISTS "verifiedPaidPaise" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "ServiceRequest" ADD COLUMN IF NOT EXISTS "outstandingBalancePaise" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "ServiceRequest" ADD COLUMN IF NOT EXISTS "finalInvoiceId" UUID;
ALTER TABLE "ServiceRequest" ADD COLUMN IF NOT EXISTS "releaseReadiness" JSONB;

-- Add installmentType, gatewaySignature and idempotencyKey to ServicePaymentRecord
ALTER TABLE "ServicePaymentRecord" ADD COLUMN IF NOT EXISTS "installmentType" TEXT;
ALTER TABLE "ServicePaymentRecord" ADD COLUMN IF NOT EXISTS "gatewaySignature" TEXT;
ALTER TABLE "ServicePaymentRecord" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentRecord_idempotencyKey_key" ON "ServicePaymentRecord"("idempotencyKey");

-- Create ServiceInvoice table
CREATE TABLE IF NOT EXISTS "ServiceInvoice" (
  "id" UUID NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "serviceRequestId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "estimateId" UUID,
  "subtotalPaise" BIGINT NOT NULL,
  "diagnosticFeeCreditPaise" BIGINT NOT NULL DEFAULT 0,
  "priorPaymentsCreditedPaise" BIGINT NOT NULL DEFAULT 0,
  "cgstPaise" BIGINT NOT NULL DEFAULT 0,
  "sgstPaise" BIGINT NOT NULL DEFAULT 0,
  "igstPaise" BIGINT NOT NULL DEFAULT 0,
  "totalAmountPaise" BIGINT NOT NULL,
  "outstandingPaise" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ISSUED',
  "pdfUri" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "issuedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceInvoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceInvoice_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceInvoice_invoiceNumber_key" ON "ServiceInvoice"("invoiceNumber");
CREATE INDEX IF NOT EXISTS "ServiceInvoice_serviceRequestId_idx" ON "ServiceInvoice"("serviceRequestId");
CREATE INDEX IF NOT EXISTS "ServiceInvoice_customerId_idx" ON "ServiceInvoice"("customerId");

-- Create ServicePaymentPolicy table
CREATE TABLE IF NOT EXISTS "ServicePaymentPolicy" (
  "id" UUID NOT NULL,
  "version" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isApproved" BOOLEAN NOT NULL DEFAULT true,
  "allowZeroAdvance" BOOLEAN NOT NULL DEFAULT true,
  "allowPartialAdvance" BOOLEAN NOT NULL DEFAULT true,
  "defaultPartialAdvancePercent" INTEGER NOT NULL DEFAULT 25,
  "diagnosticFeePaise" BIGINT NOT NULL DEFAULT 50000,
  "diagnosticFeeCreditedToInvoice" BOOLEAN NOT NULL DEFAULT true,
  "partsAdvancePercent" INTEGER NOT NULL DEFAULT 50,
  "partialPlans" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServicePaymentPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentPolicy_version_key" ON "ServicePaymentPolicy"("version");
