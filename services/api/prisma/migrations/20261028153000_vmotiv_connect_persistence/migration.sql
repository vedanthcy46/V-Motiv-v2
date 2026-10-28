-- V MOTIV Connect persistence. This migration is deliberately idempotent:
-- older V2 databases may already contain CustomerVehicle from a prior db push,
-- while production needs only the missing Connect tables and columns.

CREATE TABLE IF NOT EXISTS "CustomerVehicle" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "make" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "variant" TEXT,
  "fuelType" TEXT NOT NULL,
  "transmission" TEXT NOT NULL,
  "color" TEXT,
  "registrationNumber" TEXT,
  "odometerKm" INTEGER,
  "vin" TEXT,
  "declaredOwnership" TEXT NOT NULL DEFAULT 'OWNER',
  "photoUrls" JSONB,
  "notes" TEXT,
  "isPreferred" BOOLEAN NOT NULL DEFAULT false,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMP(3),
  "lastServiceDate" TIMESTAMP(3),
  "nextServiceDueKm" INTEGER,
  "nextServiceDueDate" TIMESTAMP(3),
  "connectDeviceId" TEXT,
  "connectStatus" TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerVehicle_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CustomerVehicle" ADD COLUMN IF NOT EXISTS "connectDeviceId" TEXT;
ALTER TABLE "CustomerVehicle" ADD COLUMN IF NOT EXISTS "connectStatus" TEXT NOT NULL DEFAULT 'NOT_CONNECTED';
CREATE INDEX IF NOT EXISTS "CustomerVehicle_userId_isArchived_idx" ON "CustomerVehicle"("userId", "isArchived");
CREATE INDEX IF NOT EXISTS "CustomerVehicle_registrationNumber_idx" ON "CustomerVehicle"("registrationNumber");

DO $$ BEGIN
  ALTER TABLE "CustomerVehicle" ADD CONSTRAINT "CustomerVehicle_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "CustomerGarageConnectLink" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "connectVehicleId" TEXT,
  "qrTokenHash" TEXT NOT NULL,
  "qrTokenPreview" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "claimCodeHash" TEXT,
  "claimCodeExpiresAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerGarageConnectLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerGarageConnectLink_qrTokenHash_key" ON "CustomerGarageConnectLink"("qrTokenHash");
CREATE INDEX IF NOT EXISTS "CustomerGarageConnectLink_userId_status_idx" ON "CustomerGarageConnectLink"("userId", "status");
CREATE INDEX IF NOT EXISTS "CustomerGarageConnectLink_vehicleId_status_idx" ON "CustomerGarageConnectLink"("vehicleId", "status");

DO $$ BEGIN
  ALTER TABLE "CustomerGarageConnectLink" ADD CONSTRAINT "CustomerGarageConnectLink_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerGarageConnectLink" ADD CONSTRAINT "CustomerGarageConnectLink_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "CustomerVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "ConnectNotificationReference" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "linkId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "reason" TEXT,
  "messagePreview" TEXT,
  "callSessionId" TEXT,
  "visitorIpHash" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectNotificationReference_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ConnectNotificationReference_userId_isRead_idx" ON "ConnectNotificationReference"("userId", "isRead");
CREATE INDEX IF NOT EXISTS "ConnectNotificationReference_linkId_createdAt_idx" ON "ConnectNotificationReference"("linkId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ConnectNotificationReference" ADD CONSTRAINT "ConnectNotificationReference_linkId_fkey"
    FOREIGN KEY ("linkId") REFERENCES "CustomerGarageConnectLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ConnectNotificationReference" ADD CONSTRAINT "ConnectNotificationReference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "ConnectCallSessionReference" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "linkId" UUID NOT NULL,
  "callSessionId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'webrtc',
  "status" TEXT NOT NULL DEFAULT 'requested',
  "durationSeconds" INTEGER,
  "callerType" TEXT NOT NULL DEFAULT 'visitor',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConnectCallSessionReference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConnectCallSessionReference_callSessionId_key" ON "ConnectCallSessionReference"("callSessionId");
CREATE INDEX IF NOT EXISTS "ConnectCallSessionReference_linkId_status_idx" ON "ConnectCallSessionReference"("linkId", "status");
DO $$ BEGIN
  ALTER TABLE "ConnectCallSessionReference" ADD CONSTRAINT "ConnectCallSessionReference_linkId_fkey"
    FOREIGN KEY ("linkId") REFERENCES "CustomerGarageConnectLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "ConnectIntegrationAuditEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectIntegrationAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ConnectIntegrationAuditEvent_action_createdAt_idx" ON "ConnectIntegrationAuditEvent"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "ConnectIntegrationAuditEvent_entityId_entityType_idx" ON "ConnectIntegrationAuditEvent"("entityId", "entityType");
