CREATE TYPE "SupportCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
CREATE TYPE "PurchaseEnquiryStatus" AS ENUM ('RECEIVED', 'IN_REVIEW', 'CONTACTED', 'CLOSED');

ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3), ADD COLUMN "termsVersion" TEXT, ADD COLUMN "preferredCity" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "registrationYear" INTEGER, ADD COLUMN "bodyType" TEXT, ADD COLUMN "engineCapacityCc" INTEGER, ADD COLUMN "conditionSummary" TEXT;
ALTER TABLE "AcquisitionLead" ADD COLUMN "referenceCode" TEXT NOT NULL DEFAULT gen_random_uuid()::text, ADD COLUMN "idempotencyKey" TEXT, ADD COLUMN "ownershipCount" INTEGER, ADD COLUMN "registrationYear" INTEGER, ADD COLUMN "color" TEXT, ADD COLUMN "registrationCity" TEXT, ADD COLUMN "insuranceValidUntil" DATE, ADD COLUMN "loanOutstanding" BOOLEAN, ADD COLUMN "accidentHistory" TEXT, ADD COLUMN "serviceHistory" TEXT, ADD COLUMN "sellerNotes" TEXT;
CREATE UNIQUE INDEX "AcquisitionLead_referenceCode_key" ON "AcquisitionLead"("referenceCode");
CREATE UNIQUE INDEX "AcquisitionLead_userId_idempotencyKey_key" ON "AcquisitionLead"("userId", "idempotencyKey");

CREATE TABLE "SupportedCity" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SupportedCity_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "SupportedCity_name_key" ON "SupportedCity"("name");
CREATE TABLE "SavedSearch" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "userId" UUID NOT NULL, "name" TEXT NOT NULL, "query" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id"));
CREATE INDEX "SavedSearch_userId_createdAt_idx" ON "SavedSearch"("userId", "createdAt");
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "PurchaseEnquiry" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "userId" UUID NOT NULL, "listingId" UUID NOT NULL, "message" TEXT, "status" "PurchaseEnquiryStatus" NOT NULL DEFAULT 'RECEIVED', "idempotencyKey" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PurchaseEnquiry_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "PurchaseEnquiry_userId_idempotencyKey_key" ON "PurchaseEnquiry"("userId", "idempotencyKey");
CREATE INDEX "PurchaseEnquiry_userId_createdAt_idx" ON "PurchaseEnquiry"("userId", "createdAt");
ALTER TABLE "PurchaseEnquiry" ADD CONSTRAINT "PurchaseEnquiry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseEnquiry" ADD CONSTRAINT "PurchaseEnquiry_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "VehicleListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "SupportCase" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "userId" UUID NOT NULL, "subject" TEXT NOT NULL, "category" TEXT NOT NULL, "description" TEXT NOT NULL, "status" "SupportCaseStatus" NOT NULL DEFAULT 'OPEN', "referenceCode" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "SupportCase_referenceCode_key" ON "SupportCase"("referenceCode");
CREATE INDEX "SupportCase_userId_createdAt_idx" ON "SupportCase"("userId", "createdAt");
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
