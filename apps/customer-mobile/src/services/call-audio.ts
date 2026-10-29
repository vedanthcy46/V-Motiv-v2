import InCallManager from 'react-native-incall-manager';

/**
 * Own the physical audio route for a private Connect call. WebRTC carries the
 * media; this service acquires phone-call audio focus and routes it to the
 * requested output.
 */
export function startConnectCallAudio(speakerphone = true) {
  try {
    InCallManager.start({ media: 'audio', auto: true });
    InCallManager.setForceSpeakerphoneOn(speakerphone);
    InCallManager.setSpeakerphoneOn(speakerphone);
  } catch (error) {
    console.warn('[CONNECT_CALL_AUDIO_START_FAILED]', error);
  }
}

export function setConnectCallSpeakerphone(enabled: boolean) {
  try {
    InCallManager.setForceSpeakerphoneOn(enabled);
    InCallManager.setSpeakerphoneOn(enabled);
  } catch (error) {
    console.warn('[CONNECT_CALL_AUDIO_ROUTE_FAILED]', error);
  }
}

/** Plays the system ringtone for a foreground incoming call. Android receives
 * a 90-second native timeout; the server independently closes unanswered
 * calls at the same deadline. */
export function startConnectIncomingRingtone() {
  try {
    InCallManager.startRingtone('_DEFAULT_', [0, 900, 500, 900], 'default', 90);
  } catch (error) {
    console.warn('[CONNECT_RINGTONE_START_FAILED]', error);
  }
}

export function stopConnectIncomingRingtone() {
  try {
    InCallManager.stopRingtone();
  } catch (error) {
    console.warn('[CONNECT_RINGTONE_STOP_FAILED]', error);
  }
}

export function stopConnectCallAudio() {
  try {
    InCallManager.setForceSpeakerphoneOn(false);
    InCallManager.stop();
  } catch (error) {
    console.warn('[CONNECT_CALL_AUDIO_STOP_FAILED]', error);
  }
}
