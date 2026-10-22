ALTER TABLE "TestDriveRequest"
  ADD COLUMN "serviceCity" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "locationPreference" TEXT NOT NULL DEFAULT 'HUB',
  ADD COLUMN "address" TEXT;
