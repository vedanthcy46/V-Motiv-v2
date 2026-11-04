-- The ServiceHub model gained these capability flags after its initial table
-- migration. Keep this migration additive so both existing and fresh databases
-- are safe to deploy.
ALTER TABLE "ServiceHub" ADD COLUMN IF NOT EXISTS "supportsService" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ServiceHub" ADD COLUMN IF NOT EXISTS "supportsRentals" BOOLEAN NOT NULL DEFAULT true;
