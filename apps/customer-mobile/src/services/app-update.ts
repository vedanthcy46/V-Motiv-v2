import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { api } from '../api';
import { compareVersions, decideUpdate, dismissalKey, type AppUpdateConfig, type UpdateDecision } from '../utils/app-version';

const DISMISSED_KEY = 'vmotiv.update.dismissed.v1';
/** "Later" hides the card for this long (a newer version brings it back at once). */
const DISMISS_FOR_MS = 24 * 60 * 60 * 1000;
/** How often the app asks the server again while it stays open / returns to the foreground. */
const RECHECK_AFTER_MS = 10 * 60 * 1000;

export const currentAppVersion = (): string => Constants.expoConfig?.version ?? '0.0.0';

/** The installed build number: Android versionCode / iOS build number from the app's own configuration (null if unknown). */
export const currentBuildCode = (): number | null => {
  const raw = Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber : Constants.expoConfig?.android?.versionCode;
  const code = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
  return typeof code === 'number' && Number.isFinite(code) ? code : null;
};

async function readDismissed(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: string; at?: number };
    return parsed.version && parsed.at && Date.now() - parsed.at < DISMISS_FOR_MS ? parsed.version : null;
  } catch {
    return null;
  }
}

export async function fetchAppConfig(): Promise<AppUpdateConfig | null> {
  try {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    return await api<AppUpdateConfig>(`/api/v2/app-config?app=customer&platform=${platform}`);
  } catch {
    return null; // offline or server trouble: no card, and the app carries on
  }
}

/** The store page for this app: the link published in the app config, else the Play Store listing on Android. */
export function storeLink(config: { url: string | null }): string | null {
  if (config.url) return config.url;
  const id = Constants.expoConfig?.android?.package;
  return Platform.OS === 'android' && id ? `https://play.google.com/store/apps/details?id=${id}` : null;
}

/**
 * Checks the backend app config on start and whenever the app comes back to the foreground (at most every 10 minutes),
 * and tells the screen whether to show an update card.
 */
export function useAppUpdate(): { update: UpdateDecision; dismiss: () => void; openStore: () => void } {
  const current = currentAppVersion();
  const [update, setUpdate] = useState<UpdateDecision>({ kind: 'none', current, latest: null, notes: null, url: null });
  const lastCheck = useRef(0);

  const check = useCallback(async () => {
    lastCheck.current = Date.now();
    const config = await fetchAppConfig();
    setUpdate(decideUpdate({ current, currentCode: currentBuildCode(), config, dismissedVersion: await readDismissed() }));
  }, [current]);

  useEffect(() => {
    void check();
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active' && Date.now() - lastCheck.current > RECHECK_AFTER_MS) void check();
    });
    return () => subscription.remove();
  }, [check]);

  const dismiss = useCallback(() => {
    const key = update.kind === 'optional' ? dismissalKey(update, update.latest !== null && compareVersions(current, update.latest) === 0) : null;
    if (key) void AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify({ version: key, at: Date.now() })).catch(() => undefined);
    setUpdate(prev => (prev.kind === 'required' ? prev : { ...prev, kind: 'none' }));
  }, [update, current]);

  const openStore = useCallback(() => {
    const link = storeLink({ url: update.url });
    if (link) void Linking.openURL(link).catch(() => undefined);
  }, [update.url]);

  return { update, dismiss, openStore };
}
