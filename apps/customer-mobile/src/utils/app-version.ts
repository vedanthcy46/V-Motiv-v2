// Version comparison and the "should we show an update card?" decision. Pure, so it is easy to test.

/** -1 if a < b, 0 if equal, 1 if a > b. Compares numeric parts ("1.0.10" > "1.0.9"); missing parts count as 0 ("1.0" == "1.0.0"). */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string) => value.trim().replace(/^v/i, '').split('.').map(part => Number.parseInt(part, 10) || 0);
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export interface AppUpdateConfig {
  latestVersion: string | null;
  /** Build number (Android versionCode / iOS build number) of the newest release. */
  latestVersionCode?: number | null;
  minSupportedVersion: string | null;
  updateUrl: string | null;
  releaseNotes: string | null;
}

export type UpdateKind = 'none' | 'optional' | 'required';

export interface UpdateDecision {
  kind: UpdateKind;
  current: string;
  latestCode?: number | null;
  latest: string | null;
  notes: string | null;
  url: string | null;
}

/**
 * 'required' when the running version is older than the minimum supported one (the card cannot be dismissed),
 * 'optional' when a newer version exists, otherwise 'none'. `dismissed` is a version the customer already chose "Later" for.
 */
export function decideUpdate(args: { current: string; currentCode?: number | null; config: AppUpdateConfig | null; dismissedVersion?: string | null }): UpdateDecision {
  const { current, currentCode, config, dismissedVersion } = args;
  const none: UpdateDecision = { kind: 'none', current, latestCode: config?.latestVersionCode ?? null, latest: config?.latestVersion ?? null, notes: config?.releaseNotes ?? null, url: config?.updateUrl ?? null };
  if (!config?.latestVersion) return none;
  const mustUpdate = Boolean(config.minSupportedVersion) && compareVersions(current, config.minSupportedVersion!) < 0;
  if (mustUpdate) return { ...none, kind: 'required' };
  const versionCompare = compareVersions(current, config.latestVersion);
  // The same version name with a higher build number is also an update (a rebuilt release).
  const newerBuild = versionCompare === 0 && typeof config.latestVersionCode === 'number' && typeof currentCode === 'number' && currentCode < config.latestVersionCode;
  if (versionCompare >= 0 && !newerBuild) return none;
  const dismissKey = newerBuild ? `${config.latestVersion}+${config.latestVersionCode}` : config.latestVersion;
  if (dismissedVersion && dismissedVersion === dismissKey) return none; // "Later" was chosen for exactly this release
  if (dismissedVersion && !newerBuild && compareVersions(dismissedVersion.split('+')[0]!, config.latestVersion) >= 0) return none;
  return { ...none, kind: 'optional' };
}

/** What "Later" remembers: the version, plus the build when only the build is newer. */
export function dismissalKey(update: Pick<UpdateDecision, 'latest' | 'latestCode' | 'current'>, sameVersion: boolean): string | null {
  if (!update.latest) return null;
  return sameVersion && update.latestCode ? `${update.latest}+${update.latestCode}` : update.latest;
}
