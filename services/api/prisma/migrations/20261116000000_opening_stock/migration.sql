-- Opening stock: cars a hub already owned before the app existed (additive).
-- Such a car has no lead, inspection or purchase case, so the link to an acquisition case becomes optional.
ALTER TABLE "VehicleStockUnit" ALTER COLUMN "acquisitionCaseId" DROP NOT NULL;
ALTER TABLE "VehicleStockUnit" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'ACQUISITION';
ALTER TABLE "VehicleStockUnit" ADD COLUMN IF NOT EXISTS "openingStockDetails" JSONB;
