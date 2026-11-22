-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "announcementId" UUID;

-- CreateTable
CREATE TABLE "PlatformAnnouncement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'NONE',
    "listingId" TEXT,
    "city" TEXT,
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "sentById" UUID,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cursorUserId" UUID,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "pushQueued" INTEGER NOT NULL DEFAULT 0,
    "expectedRecipients" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxPerDay" INTEGER NOT NULL DEFAULT 2,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnouncementSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformAnnouncement_status_scheduledFor_idx" ON "PlatformAnnouncement"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "PlatformAnnouncement_createdAt_idx" ON "PlatformAnnouncement"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_announcementId_userId_key" ON "Notification"("announcementId", "userId");

