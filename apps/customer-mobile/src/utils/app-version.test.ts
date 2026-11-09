import { describe, expect, it } from 'vitest';
import { compareVersions, decideUpdate } from './app-version';

const config = (over: Partial<{ latestVersion: string | null; minSupportedVersion: string | null }> = {}) => ({ latestVersion: '1.0.1', minSupportedVersion: null, updateUrl: 'https://play.google.com/x', releaseNotes: 'Faster payments', ...over });

describe('version comparison', () => {
  it('compares numeric parts, not text', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('v1.2.0', '1.2.0')).toBe(0);
  });
});

describe('update decision', () => {
  it('shows an optional update when the backend version is newer than the app (1.0.0 -> 1.0.1)', () => {
    expect(decideUpdate({ current: '1.0.0', config: config() })).toMatchObject({ kind: 'optional', latest: '1.0.1', notes: 'Faster payments', url: 'https://play.google.com/x' });
  });
  it('shows nothing when the app is current, newer, or no version is published', () => {
    expect(decideUpdate({ current: '1.0.1', config: config() }).kind).toBe('none');
    expect(decideUpdate({ current: '1.0.2', config: config() }).kind).toBe('none');
    expect(decideUpdate({ current: '1.0.0', config: config({ latestVersion: null }) }).kind).toBe('none');
    expect(decideUpdate({ current: '1.0.0', config: null }).kind).toBe('none');
  });
  it('forces the update when the app is older than the minimum supported version', () => {
    expect(decideUpdate({ current: '0.9.0', config: config({ minSupportedVersion: '1.0.0' }) }).kind).toBe('required');
    expect(decideUpdate({ current: '1.0.0', config: config({ minSupportedVersion: '1.0.0' }) }).kind).toBe('optional');
    // choosing "Later" never hides a required update
    expect(decideUpdate({ current: '0.9.0', config: config({ minSupportedVersion: '1.0.0' }), dismissedVersion: '1.0.1' }).kind).toBe('required');
  });
  it('stays quiet after "Later" for that version, but asks again when a newer one is published', () => {
    expect(decideUpdate({ current: '1.0.0', config: config(), dismissedVersion: '1.0.1' }).kind).toBe('none');
    expect(decideUpdate({ current: '1.0.0', config: config({ latestVersion: '1.0.2' }), dismissedVersion: '1.0.1' }).kind).toBe('optional');
  });
});

describe('build number (version code)', () => {
  const cfg = { latestVersion: '1.0.1', latestVersionCode: 12, minSupportedVersion: null, updateUrl: null, releaseNotes: null };
  it('a higher build of the same version is an update', () => {
    expect(decideUpdate({ current: '1.0.1', currentCode: 11, config: cfg }).kind).toBe('optional');
    expect(decideUpdate({ current: '1.0.1', currentCode: 12, config: cfg }).kind).toBe('none');
    expect(decideUpdate({ current: '1.0.1', currentCode: 13, config: cfg }).kind).toBe('none');
  });
  it('is ignored when either build number is unknown, and never beats a newer version', () => {
    expect(decideUpdate({ current: '1.0.1', currentCode: null, config: cfg }).kind).toBe('none');
    expect(decideUpdate({ current: '1.0.2', currentCode: 1, config: cfg }).kind).toBe('none');
  });
  it('"Later" for a build hides exactly that build', () => {
    expect(decideUpdate({ current: '1.0.1', currentCode: 11, config: cfg, dismissedVersion: '1.0.1+12' }).kind).toBe('none');
    expect(decideUpdate({ current: '1.0.1', currentCode: 11, config: { ...cfg, latestVersionCode: 13 }, dismissedVersion: '1.0.1+12' }).kind).toBe('optional');
  });
});
