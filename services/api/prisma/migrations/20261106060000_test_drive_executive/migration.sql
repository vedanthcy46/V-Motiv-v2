ALTER TABLE "TestDriveRequest" ADD COLUMN "assignedEmployeeId" UUID, ADD COLUMN "assignedAt" TIMESTAMP(3);
ALTER TABLE "TestDriveRequest" ADD CONSTRAINT "TestDriveRequest_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "TestDriveRequest_assignedEmployeeId_status_idx" ON "TestDriveRequest"("assignedEmployeeId", "status");
