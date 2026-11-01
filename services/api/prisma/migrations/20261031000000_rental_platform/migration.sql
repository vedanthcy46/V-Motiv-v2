-- Rental platform enums
CREATE TYPE "RentalVehicleStatus" AS ENUM ('AVAILABLE', 'ON_TRIP', 'MAINTENANCE', 'CLEANING', 'RESERVED', 'RETIRED');
CREATE TYPE "RentalBlockReason" AS ENUM ('MAINTENANCE', 'CLEANING', 'OPERATIONAL_RESTRICTION', 'ACCIDENT_REPAIR', 'BUFFER');
CREATE TYPE "RentalBookingStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'VEHICLE_COLLECTED', 'TRIP_ACTIVE', 'RETURN_INSPECTED', 'SETTLED', 'CANCELLED');
CREATE TYPE "RentalDriverKycStatus" AS ENUM ('PENDING_REVIEW', 'VERIFIED', 'REJECTED');
CREATE TYPE "RentalExtensionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "RentalHoldStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'EXPIRED', 'RELEASED');
CREATE TYPE "RentalPaymentType" AS ENUM ('RENTAL_PREPAYMENT', 'REFUNDABLE_DEPOSIT', 'EXTENSION_FEE', 'ADDITIONAL_CHARGES', 'DEPOSIT_REFUND');
CREATE TYPE "RentalPaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'REFUNDED');

-- ResendWebhookEvent
CREATE TABLE "ResendWebhookEvent" (
  "id" UUID NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "emailId" TEXT,
  "recipient" TEXT,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResendWebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ResendWebhookEvent_eventId_key" ON "ResendWebhookEvent"("eventId");
CREATE INDEX "ResendWebhookEvent_emailId_idx" ON "ResendWebhookEvent"("emailId");

-- Branch supports flags
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "supportsService" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "supportsRentals" BOOLEAN NOT NULL DEFAULT true;

-- New EmployeeRole enum values
ALTER TYPE "EmployeeRole" ADD VALUE IF NOT EXISTS 'SERVICE_ADVISOR';
ALTER TYPE "EmployeeRole" ADD VALUE IF NOT EXISTS 'SERVICE_DISPATCH';
ALTER TYPE "EmployeeRole" ADD VALUE IF NOT EXISTS 'PICKUP_DRIVER';
ALTER TYPE "EmployeeRole" ADD VALUE IF NOT EXISTS 'HUB_MANAGER';
ALTER TYPE "EmployeeRole" ADD VALUE IF NOT EXISTS 'TECHNICIAN';
ALTER TYPE "EmployeeRole" ADD VALUE IF NOT EXISTS 'SERVICE_QC';
ALTER TYPE "EmployeeRole" ADD VALUE IF NOT EXISTS 'SERVICE_MANAGER';
ALTER TYPE "EmployeeRole" ADD VALUE IF NOT EXISTS 'RENTAL_MANAGER';
ALTER TYPE "EmployeeRole" ADD VALUE IF NOT EXISTS 'RENTAL_DISPATCH';
ALTER TYPE "EmployeeRole" ADD VALUE IF NOT EXISTS 'RENTAL_FLEET_OFFICER';

-- RentalFleetVehicle
CREATE TABLE "RentalFleetVehicle" (
  "id" UUID NOT NULL,
  "fleetNumber" TEXT NOT NULL,
  "registrationNumber" TEXT NOT NULL,
  "vin" TEXT NOT NULL,
  "make" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "variant" TEXT,
  "year" INTEGER NOT NULL,
  "transmission" TEXT NOT NULL,
  "fuelType" TEXT NOT NULL,
  "seats" INTEGER NOT NULL DEFAULT 5,
  "color" TEXT NOT NULL,
  "odometerKm" INTEGER NOT NULL DEFAULT 0,
  "fuelLevelPercent" INTEGER NOT NULL DEFAULT 100,
  "hubId" UUID NOT NULL,
  "images" JSONB NOT NULL,
  "status" "RentalVehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
  "commercialPermitNumber" TEXT NOT NULL,
  "commercialPermitExpiry" TIMESTAMP(3) NOT NULL,
  "insurancePolicyNumber" TEXT NOT NULL,
  "insuranceExpiry" TIMESTAMP(3) NOT NULL,
  "fitnessCertExpiry" TIMESTAMP(3) NOT NULL,
  "isEligibleForRental" BOOLEAN NOT NULL DEFAULT true,
  "baseDailyRatePaise" BIGINT NOT NULL,
  "baseHourlyRatePaise" BIGINT NOT NULL,
  "securityDepositPaise" BIGINT NOT NULL,
  "includedKmPerDay" INTEGER NOT NULL DEFAULT 250,
  "extraKmRatePaise" BIGINT NOT NULL DEFAULT 1200,
  "cleaningBufferMinutes" INTEGER NOT NULL DEFAULT 120,
  "minRentalHours" INTEGER NOT NULL DEFAULT 8,
  "maxRentalDays" INTEGER NOT NULL DEFAULT 30,
  "features" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RentalFleetVehicle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RentalFleetVehicle_fleetNumber_key" ON "RentalFleetVehicle"("fleetNumber");
CREATE UNIQUE INDEX "RentalFleetVehicle_registrationNumber_key" ON "RentalFleetVehicle"("registrationNumber");
CREATE UNIQUE INDEX "RentalFleetVehicle_vin_key" ON "RentalFleetVehicle"("vin");
CREATE INDEX "RentalFleetVehicle_hubId_status_isEligibleForRental_idx" ON "RentalFleetVehicle"("hubId", "status", "isEligibleForRental");
CREATE INDEX "RentalFleetVehicle_make_model_idx" ON "RentalFleetVehicle"("make", "model");
ALTER TABLE "RentalFleetVehicle" ADD CONSTRAINT "RentalFleetVehicle_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "ServiceHub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RentalVehicleBlock
CREATE TABLE "RentalVehicleBlock" (
  "id" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "reason" "RentalBlockReason" NOT NULL,
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalVehicleBlock_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RentalVehicleBlock_vehicleId_startTime_endTime_idx" ON "RentalVehicleBlock"("vehicleId", "startTime", "endTime");
ALTER TABLE "RentalVehicleBlock" ADD CONSTRAINT "RentalVehicleBlock_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "RentalFleetVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RentalBookingHold
CREATE TABLE "RentalBookingHold" (
  "id" UUID NOT NULL,
  "holdCode" TEXT NOT NULL,
  "vehicleId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "hubId" UUID NOT NULL,
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" "RentalHoldStatus" NOT NULL DEFAULT 'ACTIVE',
  "quoteSnapshot" JSONB NOT NULL,
  "estimatedTotalPaise" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RentalBookingHold_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RentalBookingHold_holdCode_key" ON "RentalBookingHold"("holdCode");
CREATE INDEX "RentalBookingHold_vehicleId_startTime_endTime_status_expiresAt_idx" ON "RentalBookingHold"("vehicleId", "startTime", "endTime", "status", "expiresAt");
CREATE INDEX "RentalBookingHold_customerId_status_idx" ON "RentalBookingHold"("customerId", "status");
ALTER TABLE "RentalBookingHold" ADD CONSTRAINT "RentalBookingHold_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "RentalFleetVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalBookingHold" ADD CONSTRAINT "RentalBookingHold_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RentalBookingHold" ADD CONSTRAINT "RentalBookingHold_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "ServiceHub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RentalBooking
CREATE TABLE "RentalBooking" (
  "id" UUID NOT NULL,
  "bookingNumber" TEXT NOT NULL,
  "holdId" UUID,
  "customerId" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "pickupHubId" UUID NOT NULL,
  "returnHubId" UUID NOT NULL,
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "status" "RentalBookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "kycStatus" "RentalDriverKycStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "pricingSnapshot" JSONB NOT NULL,
  "baseFarePaise" BIGINT NOT NULL,
  "taxPaise" BIGINT NOT NULL,
  "securityDepositPaise" BIGINT NOT NULL,
  "totalPayablePaise" BIGINT NOT NULL,
  "includedKm" INTEGER NOT NULL,
  "extraKmRatePaise" BIGINT NOT NULL,
  "cancellationReason" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "customerNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RentalBooking_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RentalBooking_bookingNumber_key" ON "RentalBooking"("bookingNumber");
CREATE UNIQUE INDEX "RentalBooking_holdId_key" ON "RentalBooking"("holdId");
CREATE INDEX "RentalBooking_customerId_status_idx" ON "RentalBooking"("customerId", "status");
CREATE INDEX "RentalBooking_vehicleId_startTime_endTime_status_idx" ON "RentalBooking"("vehicleId", "startTime", "endTime", "status");
CREATE INDEX "RentalBooking_pickupHubId_status_idx" ON "RentalBooking"("pickupHubId", "status");
ALTER TABLE "RentalBooking" ADD CONSTRAINT "RentalBooking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RentalBooking" ADD CONSTRAINT "RentalBooking_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "RentalFleetVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalBooking" ADD CONSTRAINT "RentalBooking_pickupHubId_fkey" FOREIGN KEY ("pickupHubId") REFERENCES "ServiceHub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalBooking" ADD CONSTRAINT "RentalBooking_returnHubId_fkey" FOREIGN KEY ("returnHubId") REFERENCES "ServiceHub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalBooking" ADD CONSTRAINT "RentalBooking_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "RentalBookingHold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RentalDriverVerification
CREATE TABLE "RentalDriverVerification" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "licenseNumber" TEXT NOT NULL,
  "licenseExpiry" TIMESTAMP(3) NOT NULL,
  "licenseCategory" TEXT NOT NULL DEFAULT 'LMV',
  "dateOfBirth" TIMESTAMP(3) NOT NULL,
  "drivingExperienceYears" INTEGER NOT NULL,
  "licenseFrontUrl" TEXT NOT NULL,
  "licenseBackUrl" TEXT NOT NULL,
  "status" "RentalDriverKycStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "rejectionReason" TEXT,
  "verifiedById" UUID,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RentalDriverVerification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RentalDriverVerification_bookingId_key" ON "RentalDriverVerification"("bookingId");
CREATE INDEX "RentalDriverVerification_customerId_status_idx" ON "RentalDriverVerification"("customerId", "status");
ALTER TABLE "RentalDriverVerification" ADD CONSTRAINT "RentalDriverVerification_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "RentalBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RentalDriverVerification" ADD CONSTRAINT "RentalDriverVerification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RentalAgreementAcceptance
CREATE TABLE "RentalAgreementAcceptance" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "termsVersion" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  CONSTRAINT "RentalAgreementAcceptance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RentalAgreementAcceptance_bookingId_key" ON "RentalAgreementAcceptance"("bookingId");
CREATE INDEX "RentalAgreementAcceptance_customerId_idx" ON "RentalAgreementAcceptance"("customerId");
ALTER TABLE "RentalAgreementAcceptance" ADD CONSTRAINT "RentalAgreementAcceptance_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "RentalBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RentalAgreementAcceptance" ADD CONSTRAINT "RentalAgreementAcceptance_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RentalTrip
CREATE TABLE "RentalTrip" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "pickupTime" TIMESTAMP(3),
  "pickupOdometerKm" INTEGER,
  "pickupFuelPercent" INTEGER,
  "pickupPhotos" JSONB,
  "pickupNotes" TEXT,
  "pickupStaffId" UUID,
  "pickupCustomerSigned" BOOLEAN NOT NULL DEFAULT false,
  "returnTime" TIMESTAMP(3),
  "returnOdometerKm" INTEGER,
  "returnFuelPercent" INTEGER,
  "returnPhotos" JSONB,
  "returnNotes" TEXT,
  "returnStaffId" UUID,
  "returnCustomerSigned" BOOLEAN NOT NULL DEFAULT false,
  "excessKm" INTEGER NOT NULL DEFAULT 0,
  "excessKmChargePaise" BIGINT NOT NULL DEFAULT 0,
  "fuelRefillChargePaise" BIGINT NOT NULL DEFAULT 0,
  "lateReturnChargePaise" BIGINT NOT NULL DEFAULT 0,
  "damageChargePaise" BIGINT NOT NULL DEFAULT 0,
  "totalAdditionalChargesPaise" BIGINT NOT NULL DEFAULT 0,
  "depositRefundPaise" BIGINT NOT NULL DEFAULT 0,
  "isSettled" BOOLEAN NOT NULL DEFAULT false,
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RentalTrip_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RentalTrip_bookingId_key" ON "RentalTrip"("bookingId");
CREATE INDEX "RentalTrip_bookingId_idx" ON "RentalTrip"("bookingId");
ALTER TABLE "RentalTrip" ADD CONSTRAINT "RentalTrip_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "RentalBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RentalExtension
CREATE TABLE "RentalExtension" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "originalEndTime" TIMESTAMP(3) NOT NULL,
  "requestedEndTime" TIMESTAMP(3) NOT NULL,
  "additionalHours" INTEGER NOT NULL,
  "additionalFarePaise" BIGINT NOT NULL,
  "additionalTaxPaise" BIGINT NOT NULL,
  "totalPayablePaise" BIGINT NOT NULL,
  "status" "RentalExtensionStatus" NOT NULL DEFAULT 'REQUESTED',
  "reviewedById" UUID,
  "reviewedAt" TIMESTAMP(3),
  "paymentRecordId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalExtension_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RentalExtension_bookingId_status_idx" ON "RentalExtension"("bookingId", "status");
ALTER TABLE "RentalExtension" ADD CONSTRAINT "RentalExtension_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "RentalBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RentalDamageClaim
CREATE TABLE "RentalDamageClaim" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "estimatedRepairCostPaise" BIGINT NOT NULL,
  "photos" JSONB NOT NULL,
  "reportedByStaffId" UUID NOT NULL,
  "isCustomerDisputed" BOOLEAN NOT NULL DEFAULT false,
  "customerDisputeNotes" TEXT,
  "resolvedCostPaise" BIGINT,
  "resolutionNotes" TEXT,
  "resolvedByFinanceId" UUID,
  "status" TEXT NOT NULL DEFAULT 'PENDING_FINANCE_REVIEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalDamageClaim_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RentalDamageClaim_bookingId_status_idx" ON "RentalDamageClaim"("bookingId", "status");
ALTER TABLE "RentalDamageClaim" ADD CONSTRAINT "RentalDamageClaim_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "RentalBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RentalPaymentRecord
CREATE TABLE "RentalPaymentRecord" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "type" "RentalPaymentType" NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "status" "RentalPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "paymentGateway" TEXT NOT NULL DEFAULT 'RAZORPAY',
  "gatewayOrderId" TEXT,
  "gatewayPaymentId" TEXT,
  "gatewaySignature" TEXT,
  "verifiedByFinanceId" UUID,
  "verifiedAt" TIMESTAMP(3),
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalPaymentRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RentalPaymentRecord_idempotencyKey_key" ON "RentalPaymentRecord"("idempotencyKey");
CREATE INDEX "RentalPaymentRecord_bookingId_status_idx" ON "RentalPaymentRecord"("bookingId", "status");
ALTER TABLE "RentalPaymentRecord" ADD CONSTRAINT "RentalPaymentRecord_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "RentalBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RentalAuditEvent
CREATE TABLE "RentalAuditEvent" (
  "id" UUID NOT NULL,
  "bookingId" UUID,
  "vehicleId" UUID,
  "eventType" TEXT NOT NULL,
  "actorId" UUID,
  "actorRole" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RentalAuditEvent_bookingId_eventType_idx" ON "RentalAuditEvent"("bookingId", "eventType");
CREATE INDEX "RentalAuditEvent_vehicleId_idx" ON "RentalAuditEvent"("vehicleId");
ALTER TABLE "RentalAuditEvent" ADD CONSTRAINT "RentalAuditEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "RentalBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
