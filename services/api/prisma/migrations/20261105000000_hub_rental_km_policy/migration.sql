-- Administrator-controlled rental km policy per hub/location. Both columns are nullable so the
-- migration is additive and existing vehicles keep their own values until a hub policy is set.
ALTER TABLE "ServiceHub" ADD COLUMN IF NOT EXISTS "rentalIncludedKmPerDay" INTEGER;
ALTER TABLE "ServiceHub" ADD COLUMN IF NOT EXISTS "rentalExtraKmRatePaise" BIGINT;
