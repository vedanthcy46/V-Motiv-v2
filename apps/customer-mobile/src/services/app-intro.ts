import AsyncStorage from '@react-native-async-storage/async-storage';

// The opening introduction (service, buy, rentals, scrap) is shown once, the first time the app opens. Bump the version in the key to
// show it again after a change that people should see.
const INTRO_SEEN_KEY = 'vmotiv.app-intro.v1';

/** True once the person has seen (or skipped) the introduction. Storage trouble counts as "seen": it must never trap anyone in it. */
export async function hasSeenAppIntro(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(INTRO_SEEN_KEY)) === '1';
  } catch {
    return true;
  }
}

export async function markAppIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // Not saved: the introduction may show again next time, which is harmless.
  }
}
