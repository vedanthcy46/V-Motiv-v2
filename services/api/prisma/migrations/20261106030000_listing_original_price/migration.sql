-- The price customers first saw, so the apps can show how much it has dropped.
ALTER TABLE "VehicleListing" ADD COLUMN "originalPricePaise" BIGINT;
UPDATE "VehicleListing" SET "originalPricePaise" = "pricePaise" WHERE "pricePaise" > 0;
