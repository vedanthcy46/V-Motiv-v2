-- Verified in-person acceptance of a purchase offer for walk-in sellers (one-time code sent to the seller's phone).
-- Additive only. The row is the durable evidence of the acceptance: verified phone, offer version, staff witness, time.
CREATE TABLE IF NOT EXISTS "SellerOfferAcceptanceChallenge" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "offerId" UUID NOT NULL,
  "leadId" UUID NOT NULL,
  "phone" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "offerVersion" INTEGER NOT NULL,
  "createdById" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SellerOfferAcceptanceChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SellerOfferAcceptanceChallenge_offerId_createdAt_idx" ON "SellerOfferAcceptanceChallenge"("offerId", "createdAt");
