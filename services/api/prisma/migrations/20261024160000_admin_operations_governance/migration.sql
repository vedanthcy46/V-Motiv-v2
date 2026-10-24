-- CreateEnum
CREATE TYPE "ExportJobStatus" AS ENUM ('REQUESTED', 'APPROVAL_PENDING', 'READY', 'EXPIRED', 'REJECTED', 'FAILED');

-- AlterTable
ALTER TABLE "PrivacyRequest" ADD COLUMN "details" JSONB,
ADD COLUMN "resolution" TEXT,
ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "resolvedById" UUID;

-- CreateIndex
CREATE INDEX "PrivacyRequest_status_createdAt_idx" ON "PrivacyRequest"("status", "createdAt");

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resourceType" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "filter" JSONB NOT NULL DEFAULT '{}',
    "format" TEXT NOT NULL DEFAULT 'CSV',
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'REQUESTED',
    "requesterId" UUID NOT NULL,
    "approvalRequestId" UUID,
    "fileContent" TEXT,
    "rowCount" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterDataItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentCode" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterDataItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExportJob_approvalRequestId_key" ON "ExportJob"("approvalRequestId");
CREATE INDEX "ExportJob_requesterId_createdAt_idx" ON "ExportJob"("requesterId", "createdAt");
CREATE INDEX "ExportJob_status_createdAt_idx" ON "ExportJob"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MasterDataItem_category_code_key" ON "MasterDataItem"("category", "code");
CREATE INDEX "MasterDataItem_category_active_idx" ON "MasterDataItem"("category", "active");

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
