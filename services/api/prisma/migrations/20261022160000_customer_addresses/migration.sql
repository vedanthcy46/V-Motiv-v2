CREATE TABLE "CustomerAddress" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "addressLine" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "pincode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerAddress_userId_createdAt_idx" ON "CustomerAddress"("userId", "createdAt");
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
