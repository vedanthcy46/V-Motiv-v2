CREATE TYPE "AcquisitionCaseStatus" AS ENUM ('DOCUMENTATION_REQUIRED', 'SETTLEMENT_READY', 'HANDOVER_READY', 'COMPLETED', 'ON_HOLD', 'CANCELLED');
CREATE TYPE "AcquisitionDocumentStatus" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'RECEIVED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'MISMATCH', 'WAIVED_BY_AUTHORIZED_POLICY');
CREATE TYPE "AcquisitionSettlementStatus" AS ENUM ('NOT_READY', 'READY_FOR_PAYMENT', 'PAYMENT_PENDING', 'PAYMENT_VERIFIED', 'PAYMENT_FAILED', 'CANCELLED');
CREATE TYPE "VehicleCustodyStatus" AS ENUM ('PENDING', 'SCHEDULED', 'RECEIVED', 'DISPUTED', 'REJECTED');

CREATE TABLE "AcquisitionCase" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "caseReference" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "leadId" UUID NOT NULL,
  "offerId" UUID NOT NULL,
  "sellerAcceptedByUserId" UUID NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL,
  "status" "AcquisitionCaseStatus" NOT NULL DEFAULT 'DOCUMENTATION_REQUIRED',
  "settlementStatus" "AcquisitionSettlementStatus" NOT NULL DEFAULT 'NOT_READY',
  "custodyStatus" "VehicleCustodyStatus" NOT NULL DEFAULT 'PENDING',
  "completedAt" TIMESTAMP(3),
  "completionNotes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcquisitionCase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AcquisitionCase_caseReference_key" ON "AcquisitionCase"("caseReference");
CREATE UNIQUE INDEX "AcquisitionCase_offerId_key" ON "AcquisitionCase"("offerId");
CREATE INDEX "AcquisitionCase_leadId_status_createdAt_idx" ON "AcquisitionCase"("leadId", "status", "createdAt");
CREATE INDEX "AcquisitionCase_settlementStatus_custodyStatus_idx" ON "AcquisitionCase"("settlementStatus", "custodyStatus");
ALTER TABLE "AcquisitionCase" ADD CONSTRAINT "AcquisitionCase_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "AcquisitionLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcquisitionCase" ADD CONSTRAINT "AcquisitionCase_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "AcquisitionOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AcquisitionDocumentReview" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "acquisitionCaseId" UUID NOT NULL,
  "documentType" TEXT NOT NULL,
  "status" "AcquisitionDocumentStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "notes" TEXT,
  "reviewedByEmployeeId" UUID,
  "reviewedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcquisitionDocumentReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AcquisitionDocumentReview_acquisitionCaseId_documentType_key" ON "AcquisitionDocumentReview"("acquisitionCaseId", "documentType");
CREATE INDEX "AcquisitionDocumentReview_acquisitionCaseId_status_idx" ON "AcquisitionDocumentReview"("acquisitionCaseId", "status");
ALTER TABLE "AcquisitionDocumentReview" ADD CONSTRAINT "AcquisitionDocumentReview_acquisitionCaseId_fkey" FOREIGN KEY ("acquisitionCaseId") REFERENCES "AcquisitionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AcquisitionSettlement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "acquisitionCaseId" UUID NOT NULL,
  "status" "AcquisitionSettlementStatus" NOT NULL DEFAULT 'NOT_READY',
  "approvedConsiderationPaise" BIGINT NOT NULL,
  "transactionReference" TEXT,
  "notes" TEXT,
  "verifiedByEmployeeId" UUID,
  "verifiedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcquisitionSettlement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AcquisitionSettlement_acquisitionCaseId_key" ON "AcquisitionSettlement"("acquisitionCaseId");
CREATE INDEX "AcquisitionSettlement_status_verifiedAt_idx" ON "AcquisitionSettlement"("status", "verifiedAt");
ALTER TABLE "AcquisitionSettlement" ADD CONSTRAINT "AcquisitionSettlement_acquisitionCaseId_fkey" FOREIGN KEY ("acquisitionCaseId") REFERENCES "AcquisitionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "VehicleHandover" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "acquisitionCaseId" UUID NOT NULL,
  "branchId" UUID,
  "custodianEmployeeId" UUID NOT NULL,
  "status" "VehicleCustodyStatus" NOT NULL DEFAULT 'PENDING',
  "location" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "registrationNumber" TEXT,
  "odometerKm" INTEGER,
  "mainKeysReceived" INTEGER NOT NULL DEFAULT 0,
  "spareKeysReceived" INTEGER NOT NULL DEFAULT 0,
  "documentsReceived" BOOLEAN NOT NULL DEFAULT false,
  "accessoriesNotes" TEXT,
  "conditionNotes" TEXT,
  "exceptionNotes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VehicleHandover_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VehicleHandover_acquisitionCaseId_key" ON "VehicleHandover"("acquisitionCaseId");
CREATE INDEX "VehicleHandover_branchId_status_observedAt_idx" ON "VehicleHandover"("branchId", "status", "observedAt");
ALTER TABLE "VehicleHandover" ADD CONSTRAINT "VehicleHandover_acquisitionCaseId_fkey" FOREIGN KEY ("acquisitionCaseId") REFERENCES "AcquisitionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleHandover" ADD CONSTRAINT "VehicleHandover_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
