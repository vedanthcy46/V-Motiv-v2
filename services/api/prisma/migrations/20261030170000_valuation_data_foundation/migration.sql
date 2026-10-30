CREATE TYPE "MarketObservationPriceType" AS ENUM ('ASKING_PRICE', 'COMPLETED_TRANSACTION', 'AUCTION', 'DEALER_WHOLESALE', 'OTHER');
CREATE TYPE "MarketObservationQualityStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'QUARANTINED', 'REJECTED');
CREATE TYPE "ValuationConfidenceCategory" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT', 'BLOCKED');

CREATE TABLE "MarketDataSource" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "provenanceNote" TEXT NOT NULL,
  "permittedForValuation" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketDataSource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketDataSource_key_key" ON "MarketDataSource"("key");

CREATE TABLE "MarketIngestionBatch" (
  "id" UUID NOT NULL,
  "sourceId" UUID NOT NULL,
  "sourceVersion" TEXT,
  "importedByUserId" UUID,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "totalRecords" INTEGER NOT NULL DEFAULT 0,
  "acceptedRecords" INTEGER NOT NULL DEFAULT 0,
  "quarantinedRecords" INTEGER NOT NULL DEFAULT 0,
  "rejectionSummary" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "MarketIngestionBatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketIngestionBatch_sourceId_importedAt_idx" ON "MarketIngestionBatch"("sourceId", "importedAt");
ALTER TABLE "MarketIngestionBatch" ADD CONSTRAINT "MarketIngestionBatch_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MarketDataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "VehicleMarketObservation" (
  "id" UUID NOT NULL,
  "sourceId" UUID NOT NULL,
  "batchId" UUID,
  "externalReference" TEXT,
  "duplicateKey" TEXT,
  "make" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "variant" TEXT,
  "manufacturingYear" INTEGER NOT NULL,
  "fuelType" TEXT NOT NULL,
  "transmission" TEXT NOT NULL,
  "odometerKm" INTEGER NOT NULL,
  "city" TEXT NOT NULL,
  "pricePaise" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "priceType" "MarketObservationPriceType" NOT NULL,
  "conditionBasis" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "qualityStatus" "MarketObservationQualityStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "qualityNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleMarketObservation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VehicleMarketObservation_make_model_variant_city_observedAt_idx" ON "VehicleMarketObservation"("make", "model", "variant", "city", "observedAt");
CREATE INDEX "VehicleMarketObservation_qualityStatus_observedAt_idx" ON "VehicleMarketObservation"("qualityStatus", "observedAt");
CREATE INDEX "VehicleMarketObservation_sourceId_externalReference_idx" ON "VehicleMarketObservation"("sourceId", "externalReference");
ALTER TABLE "VehicleMarketObservation" ADD CONSTRAINT "VehicleMarketObservation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MarketDataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleMarketObservation" ADD CONSTRAINT "VehicleMarketObservation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MarketIngestionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "InstantValuationSnapshot" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "leadId" UUID,
  "inputSnapshot" JSONB NOT NULL,
  "estimateAvailable" BOOLEAN NOT NULL DEFAULT false,
  "unavailableReason" TEXT,
  "sellerEstimateLowPaise" BIGINT,
  "sellerEstimateHighPaise" BIGINT,
  "confidence" "ValuationConfidenceCategory" NOT NULL DEFAULT 'INSUFFICIENT',
  "comparableCount" INTEGER NOT NULL DEFAULT 0,
  "dataAsOf" TIMESTAMP(3),
  "valuationVersion" TEXT NOT NULL,
  "policyVersion" TEXT,
  "assumptions" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InstantValuationSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InstantValuationSnapshot_userId_createdAt_idx" ON "InstantValuationSnapshot"("userId", "createdAt");
CREATE INDEX "InstantValuationSnapshot_leadId_createdAt_idx" ON "InstantValuationSnapshot"("leadId", "createdAt");
ALTER TABLE "InstantValuationSnapshot" ADD CONSTRAINT "InstantValuationSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstantValuationSnapshot" ADD CONSTRAINT "InstantValuationSnapshot_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "AcquisitionLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
