CREATE TYPE "RefurbishmentWorkOrderStatus" AS ENUM ('DRAFT', 'PENDING_COST_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "QualityControlStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PASSED', 'REWORK_REQUIRED', 'FAILED');

CREATE TABLE "RefurbishmentWorkOrder" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "stockUnitId" UUID NOT NULL,
  "createdByEmployeeId" UUID NOT NULL,
  "category" TEXT NOT NULL,
  "requiredAction" TEXT NOT NULL,
  "assignedProvider" TEXT,
  "estimatedCostPaise" BIGINT,
  "actualCostPaise" BIGINT,
  "status" "RefurbishmentWorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RefurbishmentWorkOrder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RefurbishmentWorkOrder_stockUnitId_status_createdAt_idx" ON "RefurbishmentWorkOrder"("stockUnitId", "status", "createdAt");
ALTER TABLE "RefurbishmentWorkOrder" ADD CONSTRAINT "RefurbishmentWorkOrder_stockUnitId_fkey" FOREIGN KEY ("stockUnitId") REFERENCES "VehicleStockUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RefurbishmentCostApproval" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workOrderId" UUID NOT NULL,
  "requestedByEmployeeId" UUID NOT NULL,
  "decidedByEmployeeId" UUID,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "decidedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RefurbishmentCostApproval_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RefurbishmentCostApproval_workOrderId_key" ON "RefurbishmentCostApproval"("workOrderId");
CREATE INDEX "RefurbishmentCostApproval_status_createdAt_idx" ON "RefurbishmentCostApproval"("status", "createdAt");
ALTER TABLE "RefurbishmentCostApproval" ADD CONSTRAINT "RefurbishmentCostApproval_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "RefurbishmentWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "QualityControlReport" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "stockUnitId" UUID NOT NULL,
  "workOrderId" UUID,
  "reviewerEmployeeId" UUID NOT NULL,
  "status" "QualityControlStatus" NOT NULL DEFAULT 'PENDING',
  "findings" TEXT,
  "evidenceNotes" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QualityControlReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QualityControlReport_stockUnitId_status_createdAt_idx" ON "QualityControlReport"("stockUnitId", "status", "createdAt");
ALTER TABLE "QualityControlReport" ADD CONSTRAINT "QualityControlReport_stockUnitId_fkey" FOREIGN KEY ("stockUnitId") REFERENCES "VehicleStockUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityControlReport" ADD CONSTRAINT "QualityControlReport_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "RefurbishmentWorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
