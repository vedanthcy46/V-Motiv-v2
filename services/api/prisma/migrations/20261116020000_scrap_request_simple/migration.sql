-- Vehicle scrapping, simplified: a customer asks, our team is notified and phones them, and everything after that happens offline.
--
-- An earlier, much larger scrapping design (about twenty tables) was removed before it was used. These statements drop its tables and types if
-- they exist, so the new, small ScrapRequest table can take the name. On a database that never had them they do nothing.

DROP TABLE IF EXISTS "ScrapSettlement" CASCADE;
DROP TABLE IF EXISTS "ScrapPaymentTransaction" CASCADE;
DROP TABLE IF EXISTS "ScrapPaymentObligation" CASCADE;
DROP TABLE IF EXISTS "ScrapCertificate" CASCADE;
DROP TABLE IF EXISTS "ScrapCustodyEvent" CASCADE;
DROP TABLE IF EXISTS "ScrapPickup" CASCADE;
DROP TABLE IF EXISTS "ScrapOfferAcceptance" CASCADE;
DROP TABLE IF EXISTS "ScrapOffer" CASCADE;
DROP TABLE IF EXISTS "ScrapPartnerQuote" CASCADE;
DROP TABLE IF EXISTS "ScrapPartnerContract" CASCADE;
DROP TABLE IF EXISTS "ScrapPartnerContact" CASCADE;
DROP TABLE IF EXISTS "ScrapAssessmentMedia" CASCADE;
DROP TABLE IF EXISTS "ScrapAssessment" CASCADE;
DROP TABLE IF EXISTS "ScrapEstimate" CASCADE;
DROP TABLE IF EXISTS "ScrapDocument" CASCADE;
DROP TABLE IF EXISTS "ScrapConditionAnswer" CASCADE;
DROP TABLE IF EXISTS "ScrapVehicleSnapshot" CASCADE;
DROP TABLE IF EXISTS "ScrapStatusEvent" CASCADE;
DROP TABLE IF EXISTS "ScrapDispute" CASCADE;
DROP TABLE IF EXISTS "ScrapPolicy" CASCADE;
DROP TABLE IF EXISTS "ScrapPartner" CASCADE;
DROP TABLE IF EXISTS "ScrapRequest" CASCADE;

DROP TYPE IF EXISTS "ScrapRequestStatus";
DROP TYPE IF EXISTS "ScrapPaymentRollup";
DROP TYPE IF EXISTS "ScrapRegistrationStatus";
DROP TYPE IF EXISTS "ScrapPartnerStatus";
DROP TYPE IF EXISTS "ScrapDocumentStatus";
DROP TYPE IF EXISTS "ScrapEstimateStatus";
DROP TYPE IF EXISTS "ScrapAssessmentStatus";
DROP TYPE IF EXISTS "ScrapQuoteStatus";
DROP TYPE IF EXISTS "ScrapOfferStatus";
DROP TYPE IF EXISTS "ScrapOfferDecision";
DROP TYPE IF EXISTS "ScrapPickupStatus";
DROP TYPE IF EXISTS "ScrapCustodianType";
DROP TYPE IF EXISTS "ScrapCertificateType";
DROP TYPE IF EXISTS "ScrapVerificationState";
DROP TYPE IF EXISTS "ScrapPayerType";
DROP TYPE IF EXISTS "ScrapObligationStatus";
DROP TYPE IF EXISTS "ScrapTransactionKind";
DROP TYPE IF EXISTS "ScrapTransactionStatus";
DROP TYPE IF EXISTS "ScrapSettlementStatus";
DROP TYPE IF EXISTS "ScrapDisputeStatus";

-- CreateEnum
CREATE TYPE "ScrapRequestStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');

-- CreateTable
CREATE TABLE "ScrapRequest" (
    "id" UUID NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "submissionKey" TEXT,
    "registrationNumber" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "manufacturingYear" INTEGER NOT NULL,
    "fuelType" TEXT,
    "odometerKm" INTEGER,
    "condition" TEXT,
    "city" TEXT NOT NULL,
    "pickupAddress" TEXT,
    "contactPhone" TEXT NOT NULL,
    "status" "ScrapRequestStatus" NOT NULL DEFAULT 'NEW',
    "staffNote" TEXT,
    "handledById" UUID,
    "contactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScrapRequest_requestNumber_key" ON "ScrapRequest"("requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapRequest_submissionKey_key" ON "ScrapRequest"("submissionKey");

-- CreateIndex
CREATE INDEX "ScrapRequest_status_createdAt_idx" ON "ScrapRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ScrapRequest_customerId_createdAt_idx" ON "ScrapRequest"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "ScrapRequest" ADD CONSTRAINT "ScrapRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
