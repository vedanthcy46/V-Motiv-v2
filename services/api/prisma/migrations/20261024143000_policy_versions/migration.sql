CREATE TYPE "PolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'RETIRED');

CREATE TABLE "PolicyVersion" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "status" "PolicyStatus" NOT NULL DEFAULT 'DRAFT',
  "effectiveAt" TIMESTAMP(3),
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PolicyVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PolicyVersion_key_version_key" ON "PolicyVersion"("key", "version");
CREATE INDEX "PolicyVersion_key_status_idx" ON "PolicyVersion"("key", "status");
