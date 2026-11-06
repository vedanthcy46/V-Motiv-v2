CREATE TABLE "GatewayOrder" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "referenceId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "gatewayPaymentId" TEXT,
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GatewayOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GatewayOrder_orderId_key" ON "GatewayOrder"("orderId");
CREATE INDEX "GatewayOrder_kind_referenceId_idx" ON "GatewayOrder"("kind", "referenceId");
CREATE INDEX "GatewayOrder_customerId_createdAt_idx" ON "GatewayOrder"("customerId", "createdAt");
