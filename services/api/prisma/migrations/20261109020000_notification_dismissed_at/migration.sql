-- Lets a person clear notifications from their list (additive).
-- A cleared notification is hidden, not deleted: deleting it would cascade to its queued push deliveries.
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "dismissedAt" TIMESTAMP(3);
