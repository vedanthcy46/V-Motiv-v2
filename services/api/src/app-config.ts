// Store-update information for the mobile apps. The apps ask for it and show an "update available" card when the
// newest version here is higher than the version they are running. Changing the row changes what every app shows.
import type { PrismaClient } from '@prisma/client';

export type AppPlatform = 'ANDROID' | 'IOS';

export interface PublicAppConfig {
  app: string;
  platform: AppPlatform;
  /** null when nothing has been published for this app and platform: apps then show no update card. */
  latestVersion: string | null;
  /** Build number of the newest release (Android versionCode / iOS build number). */
  latestVersionCode: number | null;
  minSupportedVersion: string | null;
  updateUrl: string | null;
  releaseNotes: string | null;
  updatedAt: string | null;
}

export function parsePlatform(value: unknown): AppPlatform | null {
  const text = String(value ?? '').trim().toUpperCase();
  return text === 'ANDROID' || text === 'IOS' ? text : null;
}

/** A version such as "1.0.1" (up to four numeric parts). */
export function isValidVersion(value: string): boolean {
  return /^\d{1,4}(\.\d{1,4}){0,3}$/.test(value.trim());
}

const EMPTY = (app: string, platform: AppPlatform): PublicAppConfig => ({ app, platform, latestVersion: null, latestVersionCode: null, minSupportedVersion: null, updateUrl: null, releaseNotes: null, updatedAt: null });

/** The published config for an app + platform. Never throws: before the table exists (migration not applied) apps simply see "no update". */
export async function readAppConfig(db: Pick<PrismaClient, 'appConfig'>, app: string, platform: AppPlatform): Promise<PublicAppConfig> {
  try {
    const row = await db.appConfig.findUnique({ where: { app_platform: { app, platform } } });
    if (!row) return EMPTY(app, platform);
    return {
      app,
      platform,
      latestVersion: row.latestVersion,
      latestVersionCode: row.latestVersionCode ?? null,
      minSupportedVersion: row.minSupportedVersion,
      updateUrl: row.updateUrl,
      releaseNotes: row.releaseNotes,
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch {
    return EMPTY(app, platform);
  }
}
