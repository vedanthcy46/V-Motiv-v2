-- Build number (Android versionCode / iOS build number) next to the version name (additive).
ALTER TABLE "AppConfig" ADD COLUMN IF NOT EXISTS "latestVersionCode" INTEGER;
