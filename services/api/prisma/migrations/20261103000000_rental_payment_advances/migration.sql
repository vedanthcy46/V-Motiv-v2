-- Add partial payment and balance tracking columns to RentalBooking
ALTER TABLE "RentalBooking" ADD COLUMN IF NOT EXISTS "paymentPlanSnapshot" JSONB;
ALTER TABLE "RentalBooking" ADD COLUMN IF NOT EXISTS "rentalPaymentStatus" TEXT DEFAULT 'NOT_PAID';
ALTER TABLE "RentalBooking" ADD COLUMN IF NOT EXISTS "depositStatus" TEXT DEFAULT 'NOT_COLLECTED';
ALTER TABLE "RentalBooking" ADD COLUMN IF NOT EXISTS "balanceDueAt" TIMESTAMP(3);
ALTER TABLE "RentalBooking" ADD COLUMN IF NOT EXISTS "verifiedPaidPaise" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "RentalBooking" ADD COLUMN IF NOT EXISTS "outstandingBalancePaise" BIGINT NOT NULL DEFAULT 0;

-- Add installmentType to RentalPaymentRecord
ALTER TABLE "RentalPaymentRecord" ADD COLUMN IF NOT EXISTS "installmentType" TEXT;

-- Create RentalPaymentPolicy table for versioned payment rules
CREATE TABLE IF NOT EXISTS "RentalPaymentPolicy" (
  "id" UUID NOT NULL,
  "version" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isApproved" BOOLEAN NOT NULL DEFAULT true,
  "allowPartialMoreThanHours" INTEGER NOT NULL DEFAULT 72,
  "allowPartialWindowHours" INTEGER NOT NULL DEFAULT 24,
  "requireFullWithinHours" INTEGER NOT NULL DEFAULT 24,
  "balanceDueHoursBeforePickup" INTEGER NOT NULL DEFAULT 24,
  "partialPlans" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalPaymentPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RentalPaymentPolicy_version_key" ON "RentalPaymentPolicy"("version");
