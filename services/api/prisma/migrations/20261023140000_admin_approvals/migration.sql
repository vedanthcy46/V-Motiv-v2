CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'STALE');
CREATE TYPE "ApprovalDecisionType" AS ENUM ('APPROVE', 'REJECT');

CREATE TABLE "ApprovalRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestType" TEXT NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "requesterId" UUID NOT NULL,
  "requiredPermission" TEXT NOT NULL,
  "scopeBranchIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "payload" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "executedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ApprovalRequest_status_createdAt_idx" ON "ApprovalRequest"("status", "createdAt");
CREATE INDEX "ApprovalRequest_requesterId_createdAt_idx" ON "ApprovalRequest"("requesterId", "createdAt");

CREATE TABLE "ApprovalDecision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "decision" "ApprovalDecisionType" NOT NULL,
  "reason" TEXT NOT NULL,
  "requestVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApprovalDecision_requestId_key" ON "ApprovalDecision"("requestId");
CREATE INDEX "ApprovalDecision_actorId_createdAt_idx" ON "ApprovalDecision"("actorId", "createdAt");

ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
