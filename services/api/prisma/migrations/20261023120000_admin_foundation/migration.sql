ALTER TYPE "EmployeeRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
ALTER TYPE "EmployeeRole" ADD VALUE IF NOT EXISTS 'SECURITY_ADMIN';
ALTER TYPE "EmployeeRole" ADD VALUE IF NOT EXISTS 'SUPPORT_ADMIN';
ALTER TYPE "EmployeeRole" ADD VALUE IF NOT EXISTS 'LISTING_EXECUTIVE';
ALTER TYPE "EmployeeRole" ADD VALUE IF NOT EXISTS 'AUDIT_VIEWER';

CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "MfaStatus" AS ENUM ('REQUIRED', 'COMPLIANT', 'RECOVERY_REQUIRED');

ALTER TABLE "Employee"
  ADD COLUMN "employeeCode" TEXT,
  ADD COLUMN "designation" TEXT,
  ADD COLUMN "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "mfaStatus" "MfaStatus" NOT NULL DEFAULT 'REQUIRED',
  ADD COLUMN "lastAccessAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Employee" SET "status" = 'SUSPENDED' WHERE "active" = false;
CREATE UNIQUE INDEX "Employee_employeeCode_key" ON "Employee"("employeeCode");

ALTER TABLE "AuditEvent"
  ADD COLUMN "entityType" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'SUCCEEDED',
  ADD COLUMN "correlationId" TEXT,
  ADD COLUMN "details" JSONB;
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmailOutbox" ALTER COLUMN "userId" DROP NOT NULL;

CREATE TABLE "Role" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" "EmployeeRole" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "privileged" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

CREATE TABLE "Permission" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

CREATE TABLE "RolePermission" (
  "roleId" UUID NOT NULL,
  "permissionId" UUID NOT NULL,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

CREATE TABLE "EmployeeRoleAssignment" (
  "employeeId" UUID NOT NULL,
  "roleId" UUID NOT NULL,
  "assignedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeRoleAssignment_pkey" PRIMARY KEY ("employeeId", "roleId")
);
CREATE INDEX "EmployeeRoleAssignment_roleId_idx" ON "EmployeeRoleAssignment"("roleId");

CREATE TABLE "Branch" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "address" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

CREATE TABLE "EmployeeBranchAssignment" (
  "employeeId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeBranchAssignment_pkey" PRIMARY KEY ("employeeId", "branchId")
);
CREATE INDEX "EmployeeBranchAssignment_branchId_idx" ON "EmployeeBranchAssignment"("branchId");

CREATE TABLE "EmployeeInvitation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "designation" TEXT,
  "tokenHash" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdById" UUID NOT NULL,
  "activatedEmployeeId" UUID,
  "roleId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmployeeInvitation_tokenHash_key" ON "EmployeeInvitation"("tokenHash");
CREATE INDEX "EmployeeInvitation_email_status_idx" ON "EmployeeInvitation"("email", "status");
CREATE INDEX "EmployeeInvitation_expiresAt_status_idx" ON "EmployeeInvitation"("expiresAt", "status");

CREATE TABLE "EmployeeInvitationBranch" (
  "invitationId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  CONSTRAINT "EmployeeInvitationBranch_pkey" PRIMARY KEY ("invitationId", "branchId")
);
CREATE INDEX "EmployeeInvitationBranch_branchId_idx" ON "EmployeeInvitationBranch"("branchId");

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeRoleAssignment" ADD CONSTRAINT "EmployeeRoleAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeRoleAssignment" ADD CONSTRAINT "EmployeeRoleAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeBranchAssignment" ADD CONSTRAINT "EmployeeBranchAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeBranchAssignment" ADD CONSTRAINT "EmployeeBranchAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeInvitation" ADD CONSTRAINT "EmployeeInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeInvitation" ADD CONSTRAINT "EmployeeInvitation_activatedEmployeeId_fkey" FOREIGN KEY ("activatedEmployeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeInvitation" ADD CONSTRAINT "EmployeeInvitation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeInvitationBranch" ADD CONSTRAINT "EmployeeInvitationBranch_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "EmployeeInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeInvitationBranch" ADD CONSTRAINT "EmployeeInvitationBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
