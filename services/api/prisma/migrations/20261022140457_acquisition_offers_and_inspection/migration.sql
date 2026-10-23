-- CreateEnum
CREATE TYPE "AcquisitionOfferStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- AlterTable
ALTER TABLE "AcquisitionLead" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "inspectionAddress" TEXT,
ADD COLUMN     "inspectionDate" DATE,
ADD COLUMN     "inspectionLocationType" TEXT DEFAULT 'HUB',
ADD COLUMN     "inspectionTimeSlot" TEXT,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "referenceCode" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PurchaseEnquiry" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SavedSearch" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SupportCase" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "referenceCode" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SupportedCity" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
-- serviceCity is introduced by 20261022150000_test_drive_location.
-- Do not alter it before that migration runs on a fresh database.
ALTER TABLE "TestDriveRequest" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Vehicle" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "VehicleListing" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "VehicleMedia" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "AcquisitionOffer" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "offerAmountPaise" BIGINT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "AcquisitionOfferStatus" NOT NULL DEFAULT 'OFFERED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "terms" TEXT,
    "declineReason" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcquisitionOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcquisitionOffer_leadId_createdAt_idx" ON "AcquisitionOffer"("leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "AcquisitionOffer" ADD CONSTRAINT "AcquisitionOffer_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "AcquisitionLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
