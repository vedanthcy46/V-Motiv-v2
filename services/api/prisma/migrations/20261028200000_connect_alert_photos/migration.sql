-- Add photoUrls column to ConnectNotificationReference for visitor attached evidence photos
ALTER TABLE "ConnectNotificationReference" ADD COLUMN IF NOT EXISTS "photoUrls" JSONB;
