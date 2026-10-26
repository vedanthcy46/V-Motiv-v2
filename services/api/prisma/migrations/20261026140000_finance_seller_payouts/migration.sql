CREATE TYPE "FinancePayoutStatus" AS ENUM ('DRAFT', 'DOCUMENTS_PENDING', 'APPROVAL_PENDING', 'APPROVED', 'EXECUTION_PENDING', 'PROCESSING', 'RECONCILIATION_PENDING', 'PAID_VERIFIED', 'ON_HOLD', 'FAILED', 'CANCELLED', 'REVERSED', 'RECONCILIATION_EXCEPTION');
CREATE TYPE "FinancePaymentMethod" AS ENUM ('MANUAL_BANK_TRANSFER', 'NEFT', 'RTGS', 'IMPS', 'UPI', 'PAYMENT_GATEWAY', 'FINANCE_PARTNER');
CREATE TYPE "FinanceEvidenceKind" AS ENUM ('BANK_STATEMENT', 'PROVIDER_SETTLEMENT', 'MANUAL_BANK_CONFIRMATION');

CREATE TABLE "FinancePayoutInstruction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "settlementId" UUID NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "beneficiaryName" TEXT NOT NULL,
  "beneficiaryAccountMasked" TEXT NOT NULL,
  "beneficiaryVersion" INTEGER NOT NULL DEFAULT 1,
  "paymentMethod" "FinancePaymentMethod" NOT NULL DEFAULT 'MANUAL_BANK_TRANSFER',
  "status" "FinancePayoutStatus" NOT NULL DEFAULT 'DRAFT',
  "idempotencyKey" TEXT NOT NULL,
  "requestedByEmployeeId" UUID NOT NULL,
  "approvedByEmployeeId" UUID,
  "executedByEmployeeId" UUID,
  "verifiedByEmployeeId" UUID,
  "approvedAt" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "bankReference" TEXT,
  "executionNotes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancePayoutInstruction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinancePayoutInstruction_idempotencyKey_key" ON "FinancePayoutInstruction"("idempotencyKey");
CREATE UNIQUE INDEX "FinancePayoutInstruction_bankReference_key" ON "FinancePayoutInstruction"("bankReference");
CREATE INDEX "FinancePayoutInstruction_settlementId_status_createdAt_idx" ON "FinancePayoutInstruction"("settlementId", "status", "createdAt");
CREATE INDEX "FinancePayoutInstruction_status_createdAt_idx" ON "FinancePayoutInstruction"("status", "createdAt");
ALTER TABLE "FinancePayoutInstruction" ADD CONSTRAINT "FinancePayoutInstruction_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "AcquisitionSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayoutInstruction" ADD CONSTRAINT "FinancePayoutInstruction_requestedByEmployeeId_fkey" FOREIGN KEY ("requestedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayoutInstruction" ADD CONSTRAINT "FinancePayoutInstruction_approvedByEmployeeId_fkey" FOREIGN KEY ("approvedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayoutInstruction" ADD CONSTRAINT "FinancePayoutInstruction_executedByEmployeeId_fkey" FOREIGN KEY ("executedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayoutInstruction" ADD CONSTRAINT "FinancePayoutInstruction_verifiedByEmployeeId_fkey" FOREIGN KEY ("verifiedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FinancePaymentEvidence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payoutInstructionId" UUID NOT NULL,
  "kind" "FinanceEvidenceKind" NOT NULL,
  "reference" TEXT NOT NULL,
  "evidenceUri" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "recordedByEmployeeId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancePaymentEvidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinancePaymentEvidence_payoutInstructionId_reference_key" ON "FinancePaymentEvidence"("payoutInstructionId", "reference");
CREATE INDEX "FinancePaymentEvidence_reference_idx" ON "FinancePaymentEvidence"("reference");
ALTER TABLE "FinancePaymentEvidence" ADD CONSTRAINT "FinancePaymentEvidence_payoutInstructionId_fkey" FOREIGN KEY ("payoutInstructionId") REFERENCES "FinancePayoutInstruction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePaymentEvidence" ADD CONSTRAINT "FinancePaymentEvidence_recordedByEmployeeId_fkey" FOREIGN KEY ("recordedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
