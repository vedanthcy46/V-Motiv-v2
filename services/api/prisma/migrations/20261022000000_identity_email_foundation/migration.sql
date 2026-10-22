-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('SALES_EXECUTIVE', 'INSPECTOR', 'INSPECTION_REVIEWER', 'OPERATIONS_MANAGER', 'INVENTORY_MANAGER', 'PRICING_APPROVER', 'FINANCE', 'ADMIN');

-- CreateEnum
CREATE TYPE "EmailState" AS ENUM ('PENDING', 'PROCESSING', 'ACCEPTED', 'FAILED', 'REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "firebaseUid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "phone" TEXT,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "userId" UUID NOT NULL,
    "role" "EmployeeRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locationIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOutbox" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL DEFAULT 'welcome-v1',
    "recipient" TEXT NOT NULL,
    "sender" TEXT,
    "subject" TEXT NOT NULL DEFAULT 'Welcome to V MOTIV',
    "text" TEXT NOT NULL DEFAULT 'Welcome to V MOTIV. Your account is ready. You can use it to manage your vehicle buying and selling requests.',
    "state" "EmailState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstAttemptAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");

-- CreateIndex
CREATE INDEX "AuditEvent_entityId_createdAt_idx" ON "AuditEvent"("entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailOutbox_eventKey_key" ON "EmailOutbox"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "EmailOutbox_providerMessageId_key" ON "EmailOutbox"("providerMessageId");

-- CreateIndex
CREATE INDEX "EmailOutbox_state_availableAt_idx" ON "EmailOutbox"("state", "availableAt");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
