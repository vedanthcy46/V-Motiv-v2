-- Central employee notification pipeline: durable outbox, routing policies, queue ownership, escalation, per-recipient inbox fields.
CREATE TYPE "NotificationSeverity" AS ENUM ('CRITICAL', 'ACTION_REQUIRED', 'INFORMATIONAL');

CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD');

ALTER TABLE "Branch" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

ALTER TABLE "Employee" ADD COLUMN     "reportsToId" UUID;

ALTER TABLE "Notification" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "actionRoute" TEXT,
ADD COLUMN     "branchId" UUID,
ADD COLUMN     "dedupKey" TEXT,
ADD COLUMN     "escalationLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "eventId" UUID,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "module" TEXT,
ADD COLUMN     "requiresAck" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resourceId" TEXT,
ADD COLUMN     "resourceType" TEXT,
ADD COLUMN     "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFORMATIONAL',
ADD COLUMN     "supersededAt" TIMESTAMP(3);

ALTER TABLE "NotificationPreference" ADD COLUMN     "digestFrequency" TEXT NOT NULL DEFAULT 'OFF',
ADD COLUMN     "mutedModules" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "DomainOutboxEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "branchId" UUID,
    "actorId" UUID,
    "payload" JSONB NOT NULL,
    "dedupKey" TEXT,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "policyVersion" INTEGER,
    "routing" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "DomainOutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationRoutingPolicy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "eventType" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "module" TEXT NOT NULL,
    "requiredPermission" TEXT,
    "recipientStrategy" TEXT NOT NULL,
    "branchScope" TEXT NOT NULL DEFAULT 'BRANCH',
    "severity" "NotificationSeverity" NOT NULL,
    "deliveryChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT false,
    "escalationPolicyKey" TEXT,
    "dedupWindowMinutes" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRoutingPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationQueueMember" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "queueKey" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "branchId" UUID,
    "memberRole" TEXT NOT NULL DEFAULT 'MEMBER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationQueueMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationEscalationPolicy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "description" TEXT,
    "steps" JSONB NOT NULL,
    "respectWorkingHours" BOOLEAN NOT NULL DEFAULT true,
    "workingHoursStart" TEXT NOT NULL DEFAULT '09:00',
    "workingHoursEnd" TEXT NOT NULL DEFAULT '19:00',
    "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "holidays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationEscalationPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationEscalationEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notificationId" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "escalatedToUserId" UUID,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationEscalationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DomainOutboxEvent_dedupKey_key" ON "DomainOutboxEvent"("dedupKey");

CREATE INDEX "DomainOutboxEvent_status_nextAttemptAt_idx" ON "DomainOutboxEvent"("status", "nextAttemptAt");

CREATE INDEX "DomainOutboxEvent_eventType_createdAt_idx" ON "DomainOutboxEvent"("eventType", "createdAt");

CREATE INDEX "DomainOutboxEvent_aggregateType_aggregateId_idx" ON "DomainOutboxEvent"("aggregateType", "aggregateId");

CREATE INDEX "NotificationRoutingPolicy_eventType_enabled_idx" ON "NotificationRoutingPolicy"("eventType", "enabled");

CREATE UNIQUE INDEX "NotificationRoutingPolicy_eventType_version_key" ON "NotificationRoutingPolicy"("eventType", "version");

CREATE INDEX "NotificationQueueMember_queueKey_active_branchId_idx" ON "NotificationQueueMember"("queueKey", "active", "branchId");

CREATE INDEX "NotificationQueueMember_userId_idx" ON "NotificationQueueMember"("userId");

CREATE UNIQUE INDEX "NotificationEscalationPolicy_key_key" ON "NotificationEscalationPolicy"("key");

CREATE UNIQUE INDEX "NotificationEscalationEvent_notificationId_level_key" ON "NotificationEscalationEvent"("notificationId", "level");

CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

CREATE INDEX "Notification_userId_severity_createdAt_idx" ON "Notification"("userId", "severity", "createdAt");

CREATE INDEX "Notification_branchId_module_idx" ON "Notification"("branchId", "module");

CREATE INDEX "Notification_requiresAck_acknowledgedAt_resolvedAt_createdA_idx" ON "Notification"("requiresAck", "acknowledgedAt", "resolvedAt", "createdAt");

CREATE INDEX "Notification_resourceType_resourceId_idx" ON "Notification"("resourceType", "resourceId");

CREATE UNIQUE INDEX "Notification_eventId_userId_key" ON "Notification"("eventId", "userId");

ALTER TABLE "NotificationEscalationEvent" ADD CONSTRAINT "NotificationEscalationEvent_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
