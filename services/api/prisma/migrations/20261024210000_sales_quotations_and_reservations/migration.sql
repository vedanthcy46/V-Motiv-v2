-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DiscountRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VehicleReservationStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'RELEASED', 'CONVERTED_TO_SALE');

-- CreateTable
CREATE TABLE "BuyerQuotation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enquiryId" UUID,
    "listingId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "basePricePaise" BIGINT NOT NULL,
    "chargesPaise" BIGINT NOT NULL DEFAULT 0,
    "chargeBreakdown" JSONB,
    "discountPaise" BIGINT NOT NULL DEFAULT 0,
    "finalAmountPaise" BIGINT NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "terms" TEXT,
    "customerResponseNotes" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerQuotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quotationId" UUID NOT NULL,
    "requestedDiscountPaise" BIGINT NOT NULL,
    "proposedPricePaise" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedById" UUID NOT NULL,
    "decidedById" UUID,
    "status" "DiscountRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNotes" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleReservation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "listingId" UUID NOT NULL,
    "quotationId" UUID,
    "enquiryId" UUID,
    "customerId" UUID NOT NULL,
    "reservedById" UUID NOT NULL,
    "status" "VehicleReservationStatus" NOT NULL DEFAULT 'REQUESTED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuyerQuotation_enquiryId_createdAt_idx" ON "BuyerQuotation"("enquiryId", "createdAt");
CREATE INDEX "BuyerQuotation_listingId_status_idx" ON "BuyerQuotation"("listingId", "status");
CREATE INDEX "BuyerQuotation_customerId_createdAt_idx" ON "BuyerQuotation"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscountRequest_quotationId_status_idx" ON "DiscountRequest"("quotationId", "status");

-- CreateIndex
CREATE INDEX "VehicleReservation_listingId_status_idx" ON "VehicleReservation"("listingId", "status");
CREATE INDEX "VehicleReservation_customerId_status_idx" ON "VehicleReservation"("customerId", "status");

-- AddForeignKey
ALTER TABLE "BuyerQuotation" ADD CONSTRAINT "BuyerQuotation_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "PurchaseEnquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuyerQuotation" ADD CONSTRAINT "BuyerQuotation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "VehicleListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BuyerQuotation" ADD CONSTRAINT "BuyerQuotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BuyerQuotation" ADD CONSTRAINT "BuyerQuotation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRequest" ADD CONSTRAINT "DiscountRequest_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "BuyerQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscountRequest" ADD CONSTRAINT "DiscountRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiscountRequest" ADD CONSTRAINT "DiscountRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleReservation" ADD CONSTRAINT "VehicleReservation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "VehicleListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleReservation" ADD CONSTRAINT "VehicleReservation_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "BuyerQuotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VehicleReservation" ADD CONSTRAINT "VehicleReservation_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "PurchaseEnquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VehicleReservation" ADD CONSTRAINT "VehicleReservation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleReservation" ADD CONSTRAINT "VehicleReservation_reservedById_fkey" FOREIGN KEY ("reservedById") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
