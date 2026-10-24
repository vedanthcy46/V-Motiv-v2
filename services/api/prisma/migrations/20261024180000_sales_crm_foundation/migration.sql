CREATE TYPE "SalesTaskType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'INSPECTION_COORDINATION', 'TEST_DRIVE_FOLLOW_UP', 'QUOTATION_FOLLOW_UP', 'DOCUMENT_FOLLOW_UP');
CREATE TYPE "SalesTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "SalesTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "LeadInteractionChannel" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'INTERNAL_NOTE');
CREATE TYPE "LeadInteractionOutcome" AS ENUM ('ATTEMPTED', 'CONNECTED', 'NO_ANSWER', 'WRONG_NUMBER', 'RESCHEDULE_REQUESTED', 'INFORMATION_PROVIDED');
CREATE TYPE "InspectionRequestStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TABLE "SellerLeadAssignment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "leadId" UUID NOT NULL, "employeeId" UUID, "branchId" UUID,
  "assignedById" UUID, "reason" TEXT, "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "releasedAt" TIMESTAMP(3),
  CONSTRAINT "SellerLeadAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SellerLeadAssignment_leadId_releasedAt_idx" ON "SellerLeadAssignment"("leadId", "releasedAt");
CREATE INDEX "SellerLeadAssignment_employeeId_releasedAt_idx" ON "SellerLeadAssignment"("employeeId", "releasedAt");
CREATE INDEX "SellerLeadAssignment_branchId_releasedAt_idx" ON "SellerLeadAssignment"("branchId", "releasedAt");
CREATE UNIQUE INDEX "SellerLeadAssignment_one_active_assignment" ON "SellerLeadAssignment"("leadId") WHERE "releasedAt" IS NULL;

CREATE TABLE "LeadInteraction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "leadId" UUID NOT NULL, "employeeId" UUID NOT NULL,
  "channel" "LeadInteractionChannel" NOT NULL, "outcome" "LeadInteractionOutcome" NOT NULL, "notes" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadInteraction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LeadInteraction_leadId_occurredAt_idx" ON "LeadInteraction"("leadId", "occurredAt");
CREATE INDEX "LeadInteraction_employeeId_occurredAt_idx" ON "LeadInteraction"("employeeId", "occurredAt");

CREATE TABLE "SalesTask" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "leadId" UUID NOT NULL, "assignedEmployeeId" UUID NOT NULL, "createdByEmployeeId" UUID NOT NULL,
  "type" "SalesTaskType" NOT NULL, "status" "SalesTaskStatus" NOT NULL DEFAULT 'OPEN', "priority" "SalesTaskPriority" NOT NULL DEFAULT 'NORMAL',
  "dueAt" TIMESTAMP(3) NOT NULL, "details" TEXT NOT NULL, "expectedOutcome" TEXT, "completedAt" TIMESTAMP(3), "actualOutcome" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalesTask_assignedEmployeeId_status_dueAt_idx" ON "SalesTask"("assignedEmployeeId", "status", "dueAt");
CREATE INDEX "SalesTask_leadId_dueAt_idx" ON "SalesTask"("leadId", "dueAt");

CREATE TABLE "InspectionRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "leadId" UUID NOT NULL, "requestedByEmployeeId" UUID NOT NULL, "branchId" UUID,
  "requestedDate" DATE, "timeSlot" TEXT, "locationType" TEXT NOT NULL, "address" TEXT, "notes" TEXT,
  "status" "InspectionRequestStatus" NOT NULL DEFAULT 'REQUESTED', "scheduledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InspectionRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InspectionRequest_status_createdAt_idx" ON "InspectionRequest"("status", "createdAt");
CREATE INDEX "InspectionRequest_leadId_createdAt_idx" ON "InspectionRequest"("leadId", "createdAt");
CREATE INDEX "InspectionRequest_branchId_status_idx" ON "InspectionRequest"("branchId", "status");

ALTER TABLE "SellerLeadAssignment" ADD CONSTRAINT "SellerLeadAssignment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "AcquisitionLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SellerLeadAssignment" ADD CONSTRAINT "SellerLeadAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SellerLeadAssignment" ADD CONSTRAINT "SellerLeadAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadInteraction" ADD CONSTRAINT "LeadInteraction_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "AcquisitionLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadInteraction" ADD CONSTRAINT "LeadInteraction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesTask" ADD CONSTRAINT "SalesTask_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "AcquisitionLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesTask" ADD CONSTRAINT "SalesTask_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesTask" ADD CONSTRAINT "SalesTask_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionRequest" ADD CONSTRAINT "InspectionRequest_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "AcquisitionLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionRequest" ADD CONSTRAINT "InspectionRequest_requestedByEmployeeId_fkey" FOREIGN KEY ("requestedByEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionRequest" ADD CONSTRAINT "InspectionRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
