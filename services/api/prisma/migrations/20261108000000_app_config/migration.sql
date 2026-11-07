-- Store-update information for the mobile apps (additive).
CREATE TABLE IF NOT EXISTS "AppConfig" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "app" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "latestVersion" TEXT NOT NULL,
  "minSupportedVersion" TEXT,
  "updateUrl" TEXT,
  "releaseNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AppConfig_app_platform_key" ON "AppConfig"("app", "platform");
