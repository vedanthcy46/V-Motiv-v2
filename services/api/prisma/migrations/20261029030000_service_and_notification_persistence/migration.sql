-- Recover persistence objects that were introduced in the application schema
-- before their production migration was committed. All statements are
-- idempotent because earlier environments may contain a partial rollout.

DO $$ BEGIN CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'EMAIL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PushDeliveryState" AS ENUM ('QUEUED', 'SENDING', 'PROVIDER_ACCEPTED', 'PROVIDER_HANDOFF_CONFIRMED', 'FAILED', 'DISABLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ServiceRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPOINTMENT_SCHEDULED', 'PICKUP_DISPATCHED', 'IN_TRANSIT_TO_HUB', 'ARRIVED_AT_HUB', 'CHECKED_IN', 'DIAGNOSIS_IN_PROGRESS', 'ESTIMATE_PENDING_APPROVAL', 'ESTIMATE_APPROVED', 'ESTIMATE_REJECTED', 'PARTS_ORDERED', 'WORK_IN_PROGRESS', 'QC_PENDING', 'QC_PASSED', 'QC_REWORK_REQUIRED', 'INVOICE_GENERATED', 'PAYMENT_PENDING', 'PAID', 'RETURN_DISPATCHED', 'READY_FOR_COLLECTION', 'COMPLETED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ServiceFulfillmentType" AS ENUM ('PICKUP_AND_RETURN', 'SELF_DROP_AT_HUB'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ServiceEstimateStatus" AS ENUM ('DRAFT', 'SENT_TO_CUSTOMER', 'APPROVED', 'DECLINED', 'SUPERSEDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ServiceWorkOrderStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ServiceQCResult" AS ENUM ('PASS', 'REWORK_REQUIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ServicePaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PAID_VERIFIED', 'FAILED', 'REFUNDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "userId" UUID NOT NULL, "eventType" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'GENERAL', "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
  "title" TEXT NOT NULL, "body" TEXT NOT NULL, "entityType" TEXT, "entityId" TEXT, "deepLink" TEXT,
  "targetApp" TEXT, "read" BOOLEAN NOT NULL DEFAULT false, "readAt" TIMESTAMP(3), "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_category_createdAt_idx" ON "Notification"("userId", "category", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_eventType_createdAt_idx" ON "Notification"("eventType", "createdAt");

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "userId" UUID NOT NULL, "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "pushEnabled" BOOLEAN NOT NULL DEFAULT true, "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
  "inspectionAlerts" BOOLEAN NOT NULL DEFAULT true, "offerAlerts" BOOLEAN NOT NULL DEFAULT true,
  "orderAlerts" BOOLEAN NOT NULL DEFAULT true, "operationalEscalations" BOOLEAN NOT NULL DEFAULT true,
  "marketingEnabled" BOOLEAN NOT NULL DEFAULT false, "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
  "quietHoursStart" TEXT DEFAULT '22:00', "quietHoursEnd" TEXT DEFAULT '08:00',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

CREATE TABLE IF NOT EXISTS "PushDevice" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "userId" UUID NOT NULL, "app" TEXT NOT NULL, "token" TEXT NOT NULL,
  "platform" TEXT NOT NULL, "installationId" TEXT, "projectId" TEXT, "environment" TEXT NOT NULL DEFAULT 'production',
  "active" BOOLEAN NOT NULL DEFAULT true, "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushDevice_userId_token_app_key" ON "PushDevice"("userId", "token", "app");
CREATE INDEX IF NOT EXISTS "PushDevice_userId_active_idx" ON "PushDevice"("userId", "active");
CREATE INDEX IF NOT EXISTS "PushDevice_app_active_idx" ON "PushDevice"("app", "active");
CREATE INDEX IF NOT EXISTS "PushDevice_token_idx" ON "PushDevice"("token");

CREATE TABLE IF NOT EXISTS "NotificationDelivery" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "notificationId" UUID NOT NULL, "channel" "NotificationChannel" NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED', "provider" TEXT, "providerId" TEXT, "error" TEXT, "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "NotificationDelivery_notificationId_channel_idx" ON "NotificationDelivery"("notificationId", "channel");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_status_createdAt_idx" ON "NotificationDelivery"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "PushTicket" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "deviceId" UUID NOT NULL, "notificationId" UUID, "title" TEXT, "body" TEXT,
  "data" JSONB, "ticketId" TEXT, "status" "PushDeliveryState" NOT NULL DEFAULT 'QUEUED', "receiptStatus" TEXT,
  "receiptMessage" TEXT, "receiptDetails" JSONB, "attempts" INTEGER NOT NULL DEFAULT 0, "lastAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushTicket_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PushTicket_status_createdAt_idx" ON "PushTicket"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "PushTicket_ticketId_idx" ON "PushTicket"("ticketId");

CREATE TABLE IF NOT EXISTS "ServiceHub" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "branchId" UUID, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "city" TEXT NOT NULL,
  "address" TEXT NOT NULL, "latitude" DOUBLE PRECISION, "longitude" DOUBLE PRECISION,
  "operatingHours" TEXT NOT NULL DEFAULT '08:00 - 19:00 Mon-Sat', "phone" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "capacityPerSlot" INTEGER NOT NULL DEFAULT 4, "pickupRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 25.0,
  "pickupFeePaise" BIGINT NOT NULL DEFAULT 49900, "diagnosticFeePaise" BIGINT NOT NULL DEFAULT 79900,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceHub_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceHub_branchId_key" ON "ServiceHub"("branchId");
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceHub_code_key" ON "ServiceHub"("code");
CREATE INDEX IF NOT EXISTS "ServiceHub_city_isActive_idx" ON "ServiceHub"("city", "isActive");

CREATE TABLE IF NOT EXISTS "ServiceSlotCapacity" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "hubId" UUID NOT NULL, "slotDate" TEXT NOT NULL, "slotTime" TEXT NOT NULL,
  "maxCapacity" INTEGER NOT NULL DEFAULT 4, "bookedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceSlotCapacity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceSlotCapacity_hubId_slotDate_slotTime_key" ON "ServiceSlotCapacity"("hubId", "slotDate", "slotTime");
CREATE INDEX IF NOT EXISTS "ServiceSlotCapacity_hubId_slotDate_idx" ON "ServiceSlotCapacity"("hubId", "slotDate");

CREATE TABLE IF NOT EXISTS "ServiceIssueTemplate" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "categoryKey" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
  "title" TEXT NOT NULL, "description" TEXT NOT NULL, "icon" TEXT NOT NULL, "fixedPackageAvailable" BOOLEAN NOT NULL DEFAULT false,
  "packagePricePaise" BIGINT, "packageFeatures" JSONB, "questionsJson" JSONB NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceIssueTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceIssueTemplate_categoryKey_key" ON "ServiceIssueTemplate"("categoryKey");
CREATE INDEX IF NOT EXISTS "ServiceIssueTemplate_categoryKey_isActive_idx" ON "ServiceIssueTemplate"("categoryKey", "isActive");

CREATE TABLE IF NOT EXISTS "ServiceRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "requestNumber" TEXT NOT NULL, "customerId" UUID NOT NULL, "vehicleId" UUID NOT NULL,
  "hubId" UUID NOT NULL, "categoryKey" TEXT NOT NULL, "templateVersion" INTEGER NOT NULL DEFAULT 1, "customerSymptoms" TEXT NOT NULL,
  "questionAnswers" JSONB NOT NULL, "mediaUrls" JSONB, "fulfillmentType" "ServiceFulfillmentType" NOT NULL,
  "status" "ServiceRequestStatus" NOT NULL DEFAULT 'SUBMITTED', "pickupAddress" JSONB, "returnAddress" JSONB,
  "scheduledDate" TEXT NOT NULL, "scheduledTimeSlot" TEXT NOT NULL, "assignedAdvisorId" UUID, "assignedTechnicianId" UUID,
  "assignedPickupDriverId" UUID, "assignedReturnDriverId" UUID, "emergencySafetyFlag" BOOLEAN NOT NULL DEFAULT false,
  "safetyNotes" TEXT, "estimatedCompletionDate" TIMESTAMP(3), "cancellationReason" TEXT, "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceRequest_requestNumber_key" ON "ServiceRequest"("requestNumber");
CREATE INDEX IF NOT EXISTS "ServiceRequest_customerId_status_idx" ON "ServiceRequest"("customerId", "status");
CREATE INDEX IF NOT EXISTS "ServiceRequest_hubId_status_idx" ON "ServiceRequest"("hubId", "status");
CREATE INDEX IF NOT EXISTS "ServiceRequest_requestNumber_idx" ON "ServiceRequest"("requestNumber");
CREATE INDEX IF NOT EXISTS "ServiceRequest_vehicleId_idx" ON "ServiceRequest"("vehicleId");

CREATE TABLE IF NOT EXISTS "ServiceCustodyRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "serviceRequestId" UUID NOT NULL, "type" TEXT NOT NULL, "odometerKm" INTEGER NOT NULL,
  "fuelChargeLevel" TEXT NOT NULL, "keyCount" INTEGER NOT NULL DEFAULT 1, "accessoriesJson" JSONB, "preExistingDamageNotes" TEXT,
  "damagePhotoUrls" JSONB, "custodyOfficerId" UUID, "handoverByPerson" TEXT NOT NULL, "customerAcknowledged" BOOLEAN NOT NULL DEFAULT false,
  "customerSignatureUrl" TEXT, "discrepancyNotes" TEXT, "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceCustodyRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ServiceCustodyRecord_serviceRequestId_idx" ON "ServiceCustodyRecord"("serviceRequestId");

CREATE TABLE IF NOT EXISTS "ServiceDiagnosis" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "serviceRequestId" UUID NOT NULL, "technicianId" UUID, "diagnosticSummary" TEXT NOT NULL,
  "detailedFindings" TEXT NOT NULL, "recommendedAction" TEXT NOT NULL, "photosAndScans" JSONB, "diagnosticFeePaise" BIGINT NOT NULL DEFAULT 0,
  "isRoadTestNeeded" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceDiagnosis_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ServiceDiagnosis_serviceRequestId_idx" ON "ServiceDiagnosis"("serviceRequestId");

CREATE TABLE IF NOT EXISTS "ServiceEstimate" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "serviceRequestId" UUID NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
  "status" "ServiceEstimateStatus" NOT NULL DEFAULT 'DRAFT', "subtotalPaise" BIGINT NOT NULL, "pickupDropFeePaise" BIGINT NOT NULL DEFAULT 0,
  "diagnosticFeePaise" BIGINT NOT NULL DEFAULT 0, "discountPaise" BIGINT NOT NULL DEFAULT 0, "cgstPaise" BIGINT NOT NULL DEFAULT 0,
  "sgstPaise" BIGINT NOT NULL DEFAULT 0, "igstPaise" BIGINT NOT NULL DEFAULT 0, "totalAmountPaise" BIGINT NOT NULL, "customerNotes" TEXT,
  "internalNotes" TEXT, "validUntil" TIMESTAMP(3) NOT NULL, "respondedAt" TIMESTAMP(3), "responseNotes" TEXT, "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceEstimate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ServiceEstimate_serviceRequestId_status_idx" ON "ServiceEstimate"("serviceRequestId", "status");

CREATE TABLE IF NOT EXISTS "ServiceEstimateItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "estimateId" UUID NOT NULL, "category" TEXT NOT NULL, "description" TEXT NOT NULL,
  "partNumber" TEXT, "quantity" INTEGER NOT NULL DEFAULT 1, "unitPricePaise" BIGINT NOT NULL, "totalPricePaise" BIGINT NOT NULL,
  "isMandatory" BOOLEAN NOT NULL DEFAULT true, "isApprovedByCustomer" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "ServiceEstimateItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ServiceEstimateItem_estimateId_idx" ON "ServiceEstimateItem"("estimateId");

CREATE TABLE IF NOT EXISTS "ServiceWorkOrder" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "serviceRequestId" UUID NOT NULL, "status" "ServiceWorkOrderStatus" NOT NULL DEFAULT 'PLANNED',
  "instructions" TEXT NOT NULL, "assignedTechnicianId" UUID, "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "actualHoursSpent" DOUBLE PRECISION,
  "technicianNotes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceWorkOrder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ServiceWorkOrder_serviceRequestId_idx" ON "ServiceWorkOrder"("serviceRequestId");

CREATE TABLE IF NOT EXISTS "ServiceQCRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "serviceRequestId" UUID NOT NULL, "inspectorId" UUID, "result" "ServiceQCResult" NOT NULL,
  "checklistResults" JSONB NOT NULL, "reworkReason" TEXT, "notes" TEXT, "passedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceQCRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ServiceQCRecord_serviceRequestId_idx" ON "ServiceQCRecord"("serviceRequestId");

CREATE TABLE IF NOT EXISTS "ServicePaymentRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "serviceRequestId" UUID NOT NULL, "type" TEXT NOT NULL, "amountPaise" BIGINT NOT NULL,
  "status" "ServicePaymentStatus" NOT NULL DEFAULT 'PENDING', "paymentGateway" TEXT, "gatewayOrderId" TEXT, "gatewayPaymentId" TEXT,
  "verifiedByFinanceId" UUID, "verifiedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ServicePaymentRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ServicePaymentRecord_serviceRequestId_idx" ON "ServicePaymentRecord"("serviceRequestId");

CREATE TABLE IF NOT EXISTS "ServiceHistoryEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "serviceRequestId" UUID NOT NULL, "fromStatus" TEXT, "toStatus" TEXT NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT NOT NULL, "actorRole" TEXT, "actorId" UUID, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ServiceHistoryEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ServiceHistoryEvent_serviceRequestId_idx" ON "ServiceHistoryEvent"("serviceRequestId");

DO $$ BEGIN ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PushTicket" ADD CONSTRAINT "PushTicket_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PushDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ServiceHub" ADD CONSTRAINT "ServiceHub_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ServiceSlotCapacity" ADD CONSTRAINT "ServiceSlotCapacity_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "ServiceHub"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "CustomerVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "ServiceHub"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ServiceCustodyRecord" ADD CONSTRAINT "ServiceCustodyRecord_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ServiceDiagnosis" ADD CONSTRAINT "ServiceDiagnosis_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ServiceEstimate" ADD CONSTRAINT "ServiceEstimate_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ServiceEstimateItem" ADD CONSTRAINT "ServiceEstimateItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "ServiceEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ServiceWorkOrder" ADD CONSTRAINT "ServiceWorkOrder_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ServiceQCRecord" ADD CONSTRAINT "ServiceQCRecord_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ServicePaymentRecord" ADD CONSTRAINT "ServicePaymentRecord_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ServiceHistoryEvent" ADD CONSTRAINT "ServiceHistoryEvent_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- WebRTC signalling is persisted so Vercel's stateless functions can broker a
-- private browser-to-app call without exposing either participant's number.
CREATE TABLE IF NOT EXISTS "ConnectCallSignal" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "callId" UUID NOT NULL, "senderRole" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "payload" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectCallSignal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ConnectCallSignal_callId_createdAt_idx" ON "ConnectCallSignal"("callId", "createdAt");
DO $$ BEGIN ALTER TABLE "ConnectCallSignal" ADD CONSTRAINT "ConnectCallSignal_callId_fkey" FOREIGN KEY ("callId") REFERENCES "ConnectCallSessionReference"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
