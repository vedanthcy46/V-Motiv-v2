-- CreateEnum
CREATE TYPE "ScrapRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'SALES_REVIEW', 'DOCUMENTS_REQUIRED', 'ASSESSMENT_PENDING', 'ASSESSMENT_COMPLETED', 'OPERATIONS_REVIEW', 'PARTNER_QUOTE_PENDING', 'OFFER_PENDING_CUSTOMER', 'OFFER_ACCEPTED', 'COLLECTION_SCHEDULED', 'COLLECTED', 'FACILITY_RECEIVED', 'DEPOSIT_CONFIRMED', 'SCRAPPING_IN_PROGRESS', 'SCRAPPING_COMPLETED', 'REGISTRATION_UPDATE_PENDING', 'COMPLETED', 'ON_HOLD', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScrapPaymentRollup" AS ENUM ('NOT_APPLICABLE', 'NOT_STARTED', 'OBLIGATION_RECORDED', 'PARTIALLY_PAID', 'PAID_VERIFIED', 'FAILED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ScrapRegistrationStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'EVIDENCE_RECEIVED', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScrapPartnerStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEREGISTERED');

-- CreateEnum
CREATE TYPE "ScrapDocumentStatus" AS ENUM ('REQUESTED', 'UPLOADED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ScrapEstimateStatus" AS ENUM ('ESTIMATED', 'QUOTATION_REQUIRED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ScrapAssessmentStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REINSPECTION_REQUIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ScrapQuoteStatus" AS ENUM ('RECEIVED', 'UNDER_VERIFICATION', 'VERIFIED', 'REJECTED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ScrapOfferStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT_TO_CUSTOMER', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ScrapOfferDecision" AS ENUM ('ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScrapPickupStatus" AS ENUM ('SCHEDULED', 'CUSTOMER_CONFIRMED', 'AGENT_ASSIGNED', 'COLLECTED', 'FAILED', 'RESCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScrapCustodianType" AS ENUM ('CUSTOMER', 'TRANSPORT', 'FACILITY', 'VMOTIV');

-- CreateEnum
CREATE TYPE "ScrapCertificateType" AS ENUM ('CERTIFICATE_OF_DEPOSIT', 'CERTIFICATE_OF_VEHICLE_SCRAPPING');

-- CreateEnum
CREATE TYPE "ScrapVerificationState" AS ENUM ('PENDING', 'RECEIVED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ScrapPayerType" AS ENUM ('RVSF', 'VMOTIV');

-- CreateEnum
CREATE TYPE "ScrapObligationStatus" AS ENUM ('RECORDED', 'PARTIALLY_SETTLED', 'SETTLED', 'FAILED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScrapTransactionKind" AS ENUM ('PAYMENT', 'REVERSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ScrapTransactionStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScrapSettlementStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ScrapDisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ScrapRequest" (
    "id" UUID NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "customerVehicleId" UUID,
    "status" "ScrapRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "holdFromStatus" "ScrapRequestStatus",
    "holdReason" TEXT,
    "registrationNormalized" TEXT,
    "city" TEXT,
    "pickupAddress" JSONB,
    "ownershipDeclaration" JSONB,
    "ownershipDeclaredAt" TIMESTAMP(3),
    "blockingFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "salesAssigneeId" UUID,
    "opsAssigneeId" UUID,
    "partnerId" UUID,
    "paymentState" "ScrapPaymentRollup" NOT NULL DEFAULT 'NOT_STARTED',
    "registrationStatus" "ScrapRegistrationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "submissionKey" TEXT,
    "draftData" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapVehicleSnapshot" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "variant" TEXT,
    "manufacturingYear" INTEGER NOT NULL,
    "registrationYear" INTEGER,
    "fuelType" TEXT NOT NULL,
    "vehicleCategory" TEXT NOT NULL,
    "odometerKm" INTEGER,
    "vin" TEXT,
    "isElectric" BOOLEAN NOT NULL DEFAULT false,
    "estimatedWeightKg" INTEGER,
    "measuredWeightKg" INTEGER,
    "identitySource" TEXT NOT NULL DEFAULT 'CUSTOMER_DECLARED',
    "identityVerifiedAt" TIMESTAMP(3),
    "identityVerifiedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapVehicleSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapConditionAnswer" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "questionKey" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "questionnaireVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapConditionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapDocument" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "documentType" TEXT NOT NULL,
    "status" "ScrapDocumentStatus" NOT NULL DEFAULT 'REQUESTED',
    "storageKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "checksumSha256" TEXT,
    "uploadedById" UUID,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapEstimate" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ScrapEstimateStatus" NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "sourceData" JSONB,
    "adjustments" JSONB,
    "minPaise" BIGINT,
    "maxPaise" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ScrapEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapAssessment" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ScrapAssessmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "inspectorId" UUID NOT NULL,
    "assignedById" UUID NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "address" JSONB,
    "checklist" JSONB,
    "observations" TEXT,
    "hazards" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "measuredWeightKg" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "supersedesId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapAssessmentMedia" (
    "id" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "checksumSha256" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapAssessmentMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapPartner" (
    "id" UUID NOT NULL,
    "legalName" TEXT NOT NULL,
    "registrationReference" TEXT NOT NULL,
    "registeredAddress" TEXT NOT NULL,
    "serviceAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ScrapPartnerStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verificationMethod" TEXT,
    "verificationEvidence" JSONB,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "registrationValidUntil" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "suspendedById" UUID,
    "suspensionReason" TEXT,
    "settlementArrangement" TEXT,
    "collectionCapabilities" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapPartnerContact" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "userId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapPartnerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapPartnerContract" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "documentKey" TEXT,
    "terms" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapPartnerContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapPartnerQuote" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ScrapQuoteStatus" NOT NULL DEFAULT 'RECEIVED',
    "quotedAmountPaise" BIGINT NOT NULL,
    "towingChargePaise" BIGINT NOT NULL DEFAULT 0,
    "processingChargePaise" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "validUntil" TIMESTAMP(3) NOT NULL,
    "rateCardReference" TEXT,
    "documentKey" TEXT,
    "receivedById" UUID,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "ScrapPartnerQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapOffer" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ScrapOfferStatus" NOT NULL DEFAULT 'DRAFT',
    "customerPayoutPaise" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "payerType" "ScrapPayerType" NOT NULL DEFAULT 'RVSF',
    "calculationVersion" TEXT NOT NULL,
    "adjustments" JSONB,
    "terms" JSONB,
    "termsVersion" TEXT,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "supersedesId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapOfferAcceptance" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "decision" "ScrapOfferDecision" NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "termsVersion" TEXT,
    "note" TEXT,
    "deviceInfo" JSONB,
    "networkHash" TEXT,

    CONSTRAINT "ScrapOfferAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapPickup" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ScrapPickupStatus" NOT NULL DEFAULT 'SCHEDULED',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "address" JSONB NOT NULL,
    "customerConfirmedAt" TIMESTAMP(3),
    "agentName" TEXT,
    "agentPhone" TEXT,
    "agentEmployeeId" UUID,
    "transportProvider" TEXT,
    "identityMatched" BOOLEAN,
    "identityEvidence" JSONB,
    "failureReason" TEXT,
    "scheduledById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapPickup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapCustodyEvent" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "pickupId" UUID,
    "action" TEXT NOT NULL,
    "fromCustodianType" "ScrapCustodianType",
    "fromCustodianRef" TEXT,
    "toCustodianType" "ScrapCustodianType" NOT NULL,
    "toCustodianRef" TEXT,
    "actorId" UUID,
    "actorType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "location" JSONB,
    "evidence" JSONB,
    "exceptionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapCustodyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapCertificate" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "type" "ScrapCertificateType" NOT NULL,
    "officialReference" TEXT NOT NULL,
    "issuingPartnerId" UUID NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "storageKey" TEXT NOT NULL,
    "verificationState" "ScrapVerificationState" NOT NULL DEFAULT 'RECEIVED',
    "verificationMethod" TEXT,
    "verificationEvidence" JSONB,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "receivedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapPaymentObligation" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "payerType" "ScrapPayerType" NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "ScrapObligationStatus" NOT NULL DEFAULT 'RECORDED',
    "dueBy" TIMESTAMP(3),
    "beneficiary" JSONB,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapPaymentObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapPaymentTransaction" (
    "id" UUID NOT NULL,
    "obligationId" UUID NOT NULL,
    "kind" "ScrapTransactionKind" NOT NULL DEFAULT 'PAYMENT',
    "amountPaise" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "idempotencyKey" TEXT NOT NULL,
    "method" TEXT,
    "externalReference" TEXT,
    "status" "ScrapTransactionStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "evidence" JSONB,
    "failureReason" TEXT,
    "recordedById" UUID NOT NULL,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapPaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapSettlement" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "grossPaise" BIGINT NOT NULL,
    "commissionPaise" BIGINT NOT NULL DEFAULT 0,
    "processingExpensePaise" BIGINT NOT NULL DEFAULT 0,
    "transportPaise" BIGINT NOT NULL DEFAULT 0,
    "netPaise" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "ScrapSettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "preparedById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapStatusEvent" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "fromStatus" "ScrapRequestStatus",
    "toStatus" "ScrapRequestStatus" NOT NULL,
    "actorId" UUID,
    "actorType" TEXT NOT NULL,
    "reason" TEXT,
    "evidence" JSONB,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapDispute" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "raisedById" UUID NOT NULL,
    "raisedByType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ScrapDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" UUID,
    "resolution" TEXT,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapPolicy" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapPolicy_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScrapRequest_requestNumber_key" ON "ScrapRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "ScrapRequest_customerId_status_createdAt_idx" ON "ScrapRequest"("customerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ScrapRequest_status_createdAt_idx" ON "ScrapRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ScrapRequest_salesAssigneeId_status_idx" ON "ScrapRequest"("salesAssigneeId", "status");

-- CreateIndex
CREATE INDEX "ScrapRequest_partnerId_status_idx" ON "ScrapRequest"("partnerId", "status");

-- CreateIndex
CREATE INDEX "ScrapRequest_registrationNormalized_idx" ON "ScrapRequest"("registrationNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapRequest_customerId_submissionKey_key" ON "ScrapRequest"("customerId", "submissionKey");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapVehicleSnapshot_requestId_key" ON "ScrapVehicleSnapshot"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapConditionAnswer_requestId_questionKey_key" ON "ScrapConditionAnswer"("requestId", "questionKey");

-- CreateIndex
CREATE INDEX "ScrapDocument_requestId_documentType_idx" ON "ScrapDocument"("requestId", "documentType");

-- CreateIndex
CREATE INDEX "ScrapDocument_status_createdAt_idx" ON "ScrapDocument"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapEstimate_requestId_version_key" ON "ScrapEstimate"("requestId", "version");

-- CreateIndex
CREATE INDEX "ScrapAssessment_inspectorId_status_scheduledAt_idx" ON "ScrapAssessment"("inspectorId", "status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapAssessment_requestId_version_key" ON "ScrapAssessment"("requestId", "version");

-- CreateIndex
CREATE INDEX "ScrapAssessmentMedia_assessmentId_idx" ON "ScrapAssessmentMedia"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapPartner_registrationReference_key" ON "ScrapPartner"("registrationReference");

-- CreateIndex
CREATE INDEX "ScrapPartner_status_idx" ON "ScrapPartner"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapPartnerContact_partnerId_email_key" ON "ScrapPartnerContact"("partnerId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapPartnerContract_partnerId_reference_key" ON "ScrapPartnerContract"("partnerId", "reference");

-- CreateIndex
CREATE INDEX "ScrapPartnerQuote_status_validUntil_idx" ON "ScrapPartnerQuote"("status", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapPartnerQuote_requestId_partnerId_version_key" ON "ScrapPartnerQuote"("requestId", "partnerId", "version");

-- CreateIndex
CREATE INDEX "ScrapOffer_status_expiresAt_idx" ON "ScrapOffer"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapOffer_requestId_version_key" ON "ScrapOffer"("requestId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapOfferAcceptance_offerId_key" ON "ScrapOfferAcceptance"("offerId");

-- CreateIndex
CREATE INDEX "ScrapPickup_status_windowStart_idx" ON "ScrapPickup"("status", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapPickup_requestId_version_key" ON "ScrapPickup"("requestId", "version");

-- CreateIndex
CREATE INDEX "ScrapCustodyEvent_requestId_occurredAt_idx" ON "ScrapCustodyEvent"("requestId", "occurredAt");

-- CreateIndex
CREATE INDEX "ScrapCertificate_requestId_type_verificationState_idx" ON "ScrapCertificate"("requestId", "type", "verificationState");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapCertificate_requestId_type_officialReference_key" ON "ScrapCertificate"("requestId", "type", "officialReference");

-- CreateIndex
CREATE INDEX "ScrapPaymentObligation_requestId_idx" ON "ScrapPaymentObligation"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapPaymentObligation_offerId_payerType_key" ON "ScrapPaymentObligation"("offerId", "payerType");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapPaymentTransaction_idempotencyKey_key" ON "ScrapPaymentTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ScrapPaymentTransaction_obligationId_status_idx" ON "ScrapPaymentTransaction"("obligationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapSettlement_requestId_partnerId_version_key" ON "ScrapSettlement"("requestId", "partnerId", "version");

-- CreateIndex
CREATE INDEX "ScrapStatusEvent_requestId_createdAt_idx" ON "ScrapStatusEvent"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "ScrapDispute_requestId_status_idx" ON "ScrapDispute"("requestId", "status");

-- CreateIndex
CREATE INDEX "ScrapDispute_status_createdAt_idx" ON "ScrapDispute"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ScrapRequest" ADD CONSTRAINT "ScrapRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapRequest" ADD CONSTRAINT "ScrapRequest_customerVehicleId_fkey" FOREIGN KEY ("customerVehicleId") REFERENCES "CustomerVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapRequest" ADD CONSTRAINT "ScrapRequest_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "ScrapPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapVehicleSnapshot" ADD CONSTRAINT "ScrapVehicleSnapshot_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ScrapRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapConditionAnswer" ADD CONSTRAINT "ScrapConditionAnswer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ScrapRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapDocument" ADD CONSTRAINT "ScrapDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ScrapRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapEstimate" ADD CONSTRAINT "ScrapEstimate_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ScrapRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapAssessment" ADD CONSTRAINT "ScrapAssessment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ScrapRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapAssessmentMedia" ADD CONSTRAINT "ScrapAssessmentMedia_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ScrapAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapPartnerContact" ADD CONSTRAINT "ScrapPartnerContact_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "ScrapPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapPartnerContract" ADD CONSTRAINT "ScrapPartnerContract_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "ScrapPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapPartnerQuote" ADD CONSTRAINT "ScrapPartnerQuote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ScrapRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapPartnerQuote" ADD CONSTRAINT "ScrapPartnerQuote_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "ScrapPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapOffer" ADD CONSTRAINT "ScrapOffer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ScrapRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapOffer" ADD CONSTRAINT "ScrapOffer_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "ScrapPartnerQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapOfferAcceptance" ADD CONSTRAINT "ScrapOfferAcceptance_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ScrapOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapPickup" ADD CONSTRAINT "ScrapPickup_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ScrapRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapCustodyEvent" ADD CONSTRAINT "ScrapCustodyEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ScrapRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapCustodyEvent" ADD CONSTRAINT "ScrapCustodyEvent_pickupId_fkey" FOREIGN KEY ("pickupId") REFERENCES "ScrapPickup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapCertificate" ADD CONSTRAINT "ScrapCertificate_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ScrapRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapCertificate" ADD CONSTRAINT "ScrapCertificate_issuingPartnerId_fkey" FOREIGN KEY ("issuingPartnerId") REFERENCES "ScrapPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapPaymentObligation" ADD CONSTRAINT "ScrapPaymentObligation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ScrapRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapPaymentObligation" ADD CONSTRAINT "ScrapPaymentObligation_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ScrapOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapPaymentTransaction" ADD CONSTRAINT "ScrapPaymentTransaction_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "ScrapPaymentObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapSettlement" ADD CONSTRAINT "ScrapSettlement_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ScrapRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapSettlement" ADD CONSTRAINT "ScrapSettlement_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "ScrapPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapStatusEvent" ADD CONSTRAINT "ScrapStatusEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ScrapRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapDispute" ADD CONSTRAINT "ScrapDispute_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ScrapRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Hand-written additions (Prisma cannot express these). Everything above is generated from schema.prisma.
-- ---------------------------------------------------------------------------------------------------------------------------------------

-- A vehicle can have only one live scrapping request. Drafts do not count (a customer may start and abandon them), and finished,
-- rejected and cancelled requests do not either. A second request for the same registration number is refused by the database itself,
-- not just by the API, so two simultaneous submissions cannot both succeed.
CREATE UNIQUE INDEX "ScrapRequest_one_live_request_per_registration"
  ON "ScrapRequest" ("registrationNormalized")
  WHERE "registrationNormalized" IS NOT NULL
    AND "status" NOT IN ('DRAFT', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- A case on hold must remember where it was, so it can only resume there.
ALTER TABLE "ScrapRequest" ADD CONSTRAINT "ScrapRequest_hold_remembers_status"
  CHECK ("status" <> 'ON_HOLD' OR "holdFromStatus" IS NOT NULL);

-- Money is stored in paise as whole numbers; amounts are never negative, and an obligation or a transaction is for a positive amount.
ALTER TABLE "ScrapPartnerQuote" ADD CONSTRAINT "ScrapPartnerQuote_amounts_not_negative"
  CHECK ("quotedAmountPaise" >= 0 AND "towingChargePaise" >= 0 AND "processingChargePaise" >= 0);
ALTER TABLE "ScrapOffer" ADD CONSTRAINT "ScrapOffer_payout_not_negative" CHECK ("customerPayoutPaise" >= 0);
ALTER TABLE "ScrapPaymentObligation" ADD CONSTRAINT "ScrapPaymentObligation_amount_positive" CHECK ("amountPaise" > 0);
ALTER TABLE "ScrapPaymentTransaction" ADD CONSTRAINT "ScrapPaymentTransaction_amount_positive" CHECK ("amountPaise" > 0);
ALTER TABLE "ScrapSettlement" ADD CONSTRAINT "ScrapSettlement_parts_not_negative"
  CHECK ("grossPaise" >= 0 AND "commissionPaise" >= 0 AND "processingExpensePaise" >= 0 AND "transportPaise" >= 0);

-- A customer-declared vehicle identity is never recorded as officially verified without a person and a time against it.
ALTER TABLE "ScrapVehicleSnapshot" ADD CONSTRAINT "ScrapVehicleSnapshot_verified_has_a_verifier"
  CHECK ("identitySource" = 'CUSTOMER_DECLARED' OR ("identityVerifiedAt" IS NOT NULL AND "identityVerifiedById" IS NOT NULL));

-- A certificate marked VERIFIED must say who verified it, when and by what method: "verified" is never an unexplained status.
ALTER TABLE "ScrapCertificate" ADD CONSTRAINT "ScrapCertificate_verified_has_evidence"
  CHECK ("verificationState" <> 'VERIFIED' OR ("verifiedById" IS NOT NULL AND "verifiedAt" IS NOT NULL AND "verificationMethod" IS NOT NULL));

-- A payment transaction marked VERIFIED must say who verified it and when.
ALTER TABLE "ScrapPaymentTransaction" ADD CONSTRAINT "ScrapPaymentTransaction_verified_has_a_verifier"
  CHECK ("status" <> 'VERIFIED' OR ("verifiedById" IS NOT NULL AND "verifiedAt" IS NOT NULL));

-- A partner only becomes ACTIVE after someone verified it, and says how.
ALTER TABLE "ScrapPartner" ADD CONSTRAINT "ScrapPartner_active_is_verified"
  CHECK ("status" <> 'ACTIVE' OR ("verifiedById" IS NOT NULL AND "verifiedAt" IS NOT NULL AND "verificationMethod" IS NOT NULL));
