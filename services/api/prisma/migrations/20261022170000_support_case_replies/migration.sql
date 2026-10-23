CREATE TABLE "SupportCaseReply" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "caseId" UUID NOT NULL,
  "authorType" TEXT NOT NULL DEFAULT 'CUSTOMER',
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportCaseReply_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportCaseReply_caseId_createdAt_idx" ON "SupportCaseReply"("caseId", "createdAt");
ALTER TABLE "SupportCaseReply" ADD CONSTRAINT "SupportCaseReply_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SupportCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
