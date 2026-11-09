import { PermissionsAndroid, Platform } from 'react-native';

export type MicrophoneAccess = 'granted' | 'denied' | 'blocked';

let pending: Promise<MicrophoneAccess> | null = null;

/** Whether the microphone is allowed right now, without asking. iOS asks when the microphone is first opened. */
export async function checkMicrophone(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  } catch {
    return false;
  }
}

/**
 * Ask for the microphone. Safe to call from several places at once: they share one system prompt (a second request made while
 * the prompt is open used to come back "denied" even though the person then tapped Allow). After the prompt the real state is
 * read again, so an allowed microphone is never reported as not allowed.
 * `blocked` means the system will no longer show the prompt, so the only way is the app's Settings.
 */
export function ensureMicrophone(): Promise<MicrophoneAccess> {
  if (Platform.OS !== 'android') return Promise.resolve('granted');
  if (pending) return pending;
  pending = (async (): Promise<MicrophoneAccess> => {
    try {
      if (await checkMicrophone()) return 'granted';
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
      if (await checkMicrophone()) return 'granted';
      return result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
    } catch (error) {
      console.warn('[MIC_PERMISSION_FAILED]', error);
      return (await checkMicrophone()) ? 'granted' : 'denied';
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** Convenience for callers that only need yes or no. */
export async function ensureMicrophoneGranted(): Promise<boolean> {
  return (await ensureMicrophone()) === 'granted';
}
