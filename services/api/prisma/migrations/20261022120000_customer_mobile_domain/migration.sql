CREATE TYPE "VehicleListingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RESERVED', 'SOLD', 'WITHDRAWN');
CREATE TYPE "TestDriveStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "AcquisitionLeadStatus" AS ENUM ('SUBMITTED', 'QUALIFYING', 'INSPECTION_SCHEDULED', 'OFFER_PENDING', 'OFFERED', 'ACCEPTED', 'REJECTED', 'CANCELLED');

CREATE TABLE "Vehicle" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "make" TEXT NOT NULL, "model" TEXT NOT NULL,
  "variant" TEXT NOT NULL, "manufacturingYear" INTEGER NOT NULL, "fuelType" TEXT NOT NULL,
  "transmission" TEXT NOT NULL, "odometerKm" INTEGER NOT NULL, "color" TEXT,
  "ownershipCount" INTEGER, "city" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "VehicleListing" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "vehicleId" UUID NOT NULL, "title" TEXT NOT NULL,
  "pricePaise" BIGINT NOT NULL, "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" "VehicleListingStatus" NOT NULL DEFAULT 'DRAFT', "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VehicleListing_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "VehicleMedia" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "listingId" UUID NOT NULL, "url" TEXT NOT NULL,
  "mediaType" TEXT NOT NULL DEFAULT 'IMAGE', "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "VehicleMedia_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WishlistItem" (
  "userId" UUID NOT NULL, "listingId" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("userId", "listingId")
);
CREATE TABLE "TestDriveRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "userId" UUID NOT NULL, "listingId" UUID NOT NULL,
  "requestedDate" DATE NOT NULL, "timeSlot" TEXT NOT NULL, "customerNotes" TEXT,
  "status" "TestDriveStatus" NOT NULL DEFAULT 'REQUESTED', "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TestDriveRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AcquisitionLead" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "userId" UUID NOT NULL, "sellerName" TEXT NOT NULL,
  "sellerPhone" TEXT NOT NULL, "city" TEXT NOT NULL, "pincode" TEXT NOT NULL, "make" TEXT NOT NULL,
  "model" TEXT NOT NULL, "variant" TEXT, "manufacturingYear" INTEGER NOT NULL, "fuelType" TEXT NOT NULL,
  "transmission" TEXT NOT NULL, "odometerKm" INTEGER NOT NULL, "expectedPricePaise" BIGINT,
  "status" "AcquisitionLeadStatus" NOT NULL DEFAULT 'SUBMITTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcquisitionLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VehicleListing_vehicleId_key" ON "VehicleListing"("vehicleId");
CREATE INDEX "VehicleListing_status_publishedAt_idx" ON "VehicleListing"("status", "publishedAt");
CREATE INDEX "VehicleMedia_listingId_displayOrder_idx" ON "VehicleMedia"("listingId", "displayOrder");
CREATE UNIQUE INDEX "TestDriveRequest_userId_listingId_requestedDate_timeSlot_key" ON "TestDriveRequest"("userId", "listingId", "requestedDate", "timeSlot");
CREATE INDEX "TestDriveRequest_userId_createdAt_idx" ON "TestDriveRequest"("userId", "createdAt");
CREATE INDEX "AcquisitionLead_userId_createdAt_idx" ON "AcquisitionLead"("userId", "createdAt");

ALTER TABLE "VehicleListing" ADD CONSTRAINT "VehicleListing_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleMedia" ADD CONSTRAINT "VehicleMedia_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "VehicleListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "VehicleListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestDriveRequest" ADD CONSTRAINT "TestDriveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TestDriveRequest" ADD CONSTRAINT "TestDriveRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "VehicleListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcquisitionLead" ADD CONSTRAINT "AcquisitionLead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
