CREATE TYPE "InspectionAppointmentStatus" AS ENUM ('ASSIGNED', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "InspectionReportStatus" AS ENUM ('DRAFT', 'SYNC_PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'REWORK_REQUIRED', 'APPROVED', 'REJECTED', 'SUPERSEDED');
CREATE TYPE "InspectionAnswerStatus" AS ENUM ('PASS', 'ISSUE', 'NOT_TESTED', 'NOT_APPLICABLE');
CREATE TYPE "InspectionDefectSeverity" AS ENUM ('MINOR', 'MODERATE', 'MAJOR', 'CRITICAL');
CREATE TYPE "InspectionReviewDecisionType" AS ENUM ('APPROVE', 'REQUEST_CORRECTION', 'REJECT');

CREATE TABLE "InspectionAssignment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "requestId" UUID NOT NULL, "inspectorId" UUID NOT NULL, "assignedById" UUID NOT NULL,
  "status" "InspectionAppointmentStatus" NOT NULL DEFAULT 'ASSIGNED', "scheduledAt" TIMESTAMP(3), "locationType" TEXT NOT NULL,
  "address" TEXT, "instructions" TEXT, "confirmedAt" TIMESTAMP(3), "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InspectionAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InspectionAssignment_requestId_key" ON "InspectionAssignment"("requestId");
CREATE INDEX "InspectionAssignment_inspectorId_status_scheduledAt_idx" ON "InspectionAssignment"("inspectorId", "status", "scheduledAt");

CREATE TABLE "InspectionReport" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "requestId" UUID NOT NULL, "assignmentId" UUID NOT NULL, "inspectorId" UUID NOT NULL,
  "revision" INTEGER NOT NULL, "status" "InspectionReportStatus" NOT NULL DEFAULT 'DRAFT', "templateKey" TEXT NOT NULL DEFAULT 'vehicle-standard',
  "templateVersion" INTEGER NOT NULL DEFAULT 1, "identity" JSONB NOT NULL DEFAULT '{}', "startedAt" TIMESTAMP(3), "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3), "recordVersion" INTEGER NOT NULL DEFAULT 1, "parentReportId" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "InspectionReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InspectionReport_requestId_revision_key" ON "InspectionReport"("requestId", "revision");
CREATE INDEX "InspectionReport_inspectorId_status_updatedAt_idx" ON "InspectionReport"("inspectorId", "status", "updatedAt");
CREATE INDEX "InspectionReport_status_submittedAt_idx" ON "InspectionReport"("status", "submittedAt");

CREATE TABLE "InspectionAnswer" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "reportId" UUID NOT NULL, "itemKey" TEXT NOT NULL, "status" "InspectionAnswerStatus" NOT NULL,
  "value" JSONB, "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InspectionAnswer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InspectionAnswer_reportId_itemKey_key" ON "InspectionAnswer"("reportId", "itemKey");

CREATE TABLE "InspectionDefect" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "reportId" UUID NOT NULL, "category" TEXT NOT NULL, "severity" "InspectionDefectSeverity" NOT NULL,
  "description" TEXT NOT NULL, "location" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InspectionDefect_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InspectionDefect_reportId_severity_idx" ON "InspectionDefect"("reportId", "severity");

CREATE TABLE "InspectionMedia" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "reportId" UUID NOT NULL, "logicalMediaId" TEXT NOT NULL, "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL, "byteSize" INTEGER NOT NULL, "checksumSha256" TEXT NOT NULL, "capturedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InspectionMedia_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InspectionMedia_reportId_logicalMediaId_key" ON "InspectionMedia"("reportId", "logicalMediaId");

CREATE TABLE "InspectionReviewDecision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "reportId" UUID NOT NULL, "reviewerId" UUID NOT NULL, "decision" "InspectionReviewDecisionType" NOT NULL,
  "reason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "InspectionReviewDecision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InspectionReviewDecision_reportId_key" ON "InspectionReviewDecision"("reportId");
CREATE INDEX "InspectionReviewDecision_reviewerId_createdAt_idx" ON "InspectionReviewDecision"("reviewerId", "createdAt");

ALTER TABLE "InspectionAssignment" ADD CONSTRAINT "InspectionAssignment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "InspectionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionAssignment" ADD CONSTRAINT "InspectionAssignment_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionAssignment" ADD CONSTRAINT "InspectionAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "InspectionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "InspectionAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_parentReportId_fkey" FOREIGN KEY ("parentReportId") REFERENCES "InspectionReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionAnswer" ADD CONSTRAINT "InspectionAnswer_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "InspectionReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionDefect" ADD CONSTRAINT "InspectionDefect_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "InspectionReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionMedia" ADD CONSTRAINT "InspectionMedia_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "InspectionReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionReviewDecision" ADD CONSTRAINT "InspectionReviewDecision_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "InspectionReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionReviewDecision" ADD CONSTRAINT "InspectionReviewDecision_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
