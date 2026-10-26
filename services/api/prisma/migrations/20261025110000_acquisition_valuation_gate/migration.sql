CREATE TYPE "AcquisitionValuationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED');

CREATE TABLE "AcquisitionValuation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "leadId" UUID NOT NULL,
  "inspectionReportId" UUID NOT NULL,
  "expectedResalePaise" BIGINT NOT NULL,
  "refurbishmentPaise" BIGINT NOT NULL DEFAULT 0,
  "otherCostsPaise" BIGINT NOT NULL DEFAULT 0,
  "requiredMarginPaise" BIGINT NOT NULL DEFAULT 0,
  "recommendedPurchasePaise" BIGINT NOT NULL,
  "notes" TEXT,
  "status" "AcquisitionValuationStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" UUID NOT NULL,
  "approvedById" UUID,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcquisitionValuation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AcquisitionOffer" ADD COLUMN "valuationId" UUID;
ALTER TABLE "AcquisitionValuation" ADD CONSTRAINT "AcquisitionValuation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "AcquisitionLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcquisitionValuation" ADD CONSTRAINT "AcquisitionValuation_inspectionReportId_fkey" FOREIGN KEY ("inspectionReportId") REFERENCES "InspectionReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcquisitionValuation" ADD CONSTRAINT "AcquisitionValuation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcquisitionValuation" ADD CONSTRAINT "AcquisitionValuation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcquisitionOffer" ADD CONSTRAINT "AcquisitionOffer_valuationId_fkey" FOREIGN KEY ("valuationId") REFERENCES "AcquisitionValuation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AcquisitionValuation_leadId_status_createdAt_idx" ON "AcquisitionValuation"("leadId", "status", "createdAt");
CREATE INDEX "AcquisitionValuation_inspectionReportId_idx" ON "AcquisitionValuation"("inspectionReportId");
CREATE INDEX "AcquisitionOffer_valuationId_idx" ON "AcquisitionOffer"("valuationId");
