import { NativeModules, Platform } from 'react-native';
import InCallManager from 'react-native-incall-manager';

/**
 * Checks if the underlying native module for InCallManager is registered.
 * InCallManager internally relies on `NativeModules.InCallManager`. When running
 * on web, Expo Go, simulators, or an environment without the native module linked,
 * method calls would throw: "TypeError: Cannot read property 'stopRingtone' of null".
 */
function isNativeInCallManagerAvailable(): boolean {
  return Platform.OS !== 'web' && Boolean(NativeModules?.InCallManager && InCallManager);
}

/**
 * Own the physical audio route for a private Connect call. WebRTC carries the
 * media; this service acquires phone-call audio focus and routes it to the
 * requested output.
 */
export function startConnectCallAudio(speakerphone = false) {
  if (!isNativeInCallManagerAvailable()) return;
  try {
    // `auto: false`: the route is only ever what we set (earpiece by default), never switched to the loudspeaker on its own.
    InCallManager?.start?.({ media: 'audio', auto: false });
    InCallManager?.setForceSpeakerphoneOn?.(speakerphone);
    InCallManager?.setSpeakerphoneOn?.(speakerphone);
  } catch (error) {
    console.warn('[CONNECT_CALL_AUDIO_START_FAILED]', error);
  }
}

export function setConnectCallSpeakerphone(enabled: boolean) {
  if (!isNativeInCallManagerAvailable()) return;
  try {
    InCallManager?.setForceSpeakerphoneOn?.(enabled);
    InCallManager?.setSpeakerphoneOn?.(enabled);
  } catch (error) {
    console.warn('[CONNECT_CALL_AUDIO_ROUTE_FAILED]', error);
  }
}

/** Plays the system ringtone for a foreground incoming call. Android receives
 * a 90-second native timeout; the server independently closes unanswered
 * calls at the same deadline. */
export function startConnectIncomingRingtone() {
  if (!isNativeInCallManagerAvailable()) return;
  try {
    InCallManager?.startRingtone?.('_DEFAULT_', [0, 900, 500, 900], 'default', 90);
  } catch (error) {
    console.warn('[CONNECT_RINGTONE_START_FAILED]', error);
  }
}

export function stopConnectIncomingRingtone() {
  if (!isNativeInCallManagerAvailable()) return;
  try {
    InCallManager?.stopRingtone?.();
  } catch (error) {
    console.warn('[CONNECT_RINGTONE_STOP_FAILED]', error);
  }
}

export function stopConnectCallAudio() {
  if (!isNativeInCallManagerAvailable()) return;
  try {
    InCallManager?.setForceSpeakerphoneOn?.(false);
    InCallManager?.stop?.();
  } catch (error) {
    console.warn('[CONNECT_CALL_AUDIO_STOP_FAILED]', error);
  }
}
