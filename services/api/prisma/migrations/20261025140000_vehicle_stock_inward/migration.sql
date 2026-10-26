CREATE TYPE "VehicleStockStatus" AS ENUM ('RECEIVED', 'REFURBISHMENT_PENDING', 'IN_REFURBISHMENT', 'QC_PENDING', 'LISTING_PREPARATION', 'LISTING_READY', 'LISTED', 'RESERVED', 'SOLD', 'ON_HOLD', 'RETIRED');

CREATE TABLE "VehicleStockUnit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "stockCode" TEXT NOT NULL,
  "acquisitionCaseId" UUID NOT NULL,
  "vehicleId" UUID,
  "branchId" UUID,
  "receivedByEmployeeId" UUID NOT NULL,
  "status" "VehicleStockStatus" NOT NULL DEFAULT 'RECEIVED',
  "physicalLocation" TEXT NOT NULL,
  "registrationNumber" TEXT,
  "make" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "variant" TEXT,
  "manufacturingYear" INTEGER NOT NULL,
  "fuelType" TEXT NOT NULL,
  "transmission" TEXT NOT NULL,
  "odometerKm" INTEGER NOT NULL,
  "acquisitionCostPaise" BIGINT NOT NULL,
  "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VehicleStockUnit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VehicleStockUnit_stockCode_key" ON "VehicleStockUnit"("stockCode");
CREATE UNIQUE INDEX "VehicleStockUnit_acquisitionCaseId_key" ON "VehicleStockUnit"("acquisitionCaseId");
CREATE UNIQUE INDEX "VehicleStockUnit_vehicleId_key" ON "VehicleStockUnit"("vehicleId");
CREATE INDEX "VehicleStockUnit_branchId_status_createdAt_idx" ON "VehicleStockUnit"("branchId", "status", "createdAt");
CREATE INDEX "VehicleStockUnit_status_createdAt_idx" ON "VehicleStockUnit"("status", "createdAt");
ALTER TABLE "VehicleStockUnit" ADD CONSTRAINT "VehicleStockUnit_acquisitionCaseId_fkey" FOREIGN KEY ("acquisitionCaseId") REFERENCES "AcquisitionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleStockUnit" ADD CONSTRAINT "VehicleStockUnit_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleStockUnit" ADD CONSTRAINT "VehicleStockUnit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
