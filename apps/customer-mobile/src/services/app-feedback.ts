import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform, Share } from 'react-native';
import { initialRatingState, parseRatingState, type RatingState } from './rating-prompt';
import { rateUrls, shareMessage } from './store-links';

// Rating and sharing the app. The rules and addresses are in store-links.ts and rating-prompt.ts (pure, tested); this file only talks to the
// phone. Storage or sharing trouble never blocks anything and never shows an error: these are optional extras.

const IOS_STORE_URL = process.env.EXPO_PUBLIC_IOS_APP_URL;
const RATING_KEY = 'vmotiv.rating.v1';

/** Whether this build has somewhere to send people to rate it. */
export const canRateApp = () => rateUrls(Platform.OS, IOS_STORE_URL).length > 0;

/** Opens the store page to rate the app: the Play Store app if there is one, otherwise the web page. Returns false if nothing could be opened. */
export async function openRatePage(): Promise<boolean> {
  for (const url of rateUrls(Platform.OS, IOS_STORE_URL)) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // no app handles this address: try the next one
    }
  }
  return false;
}

/** Opens the phone's share sheet with a short message and the download link. Returns false if the sheet could not be opened. */
export async function shareApp(): Promise<boolean> {
  try {
    await Share.share({ message: shareMessage(Platform.OS, IOS_STORE_URL) });
    return true;
  } catch {
    return false;
  }
}

export async function loadRatingState(): Promise<RatingState> {
  try {
    const raw = await AsyncStorage.getItem(RATING_KEY);
    return raw ? parseRatingState(JSON.parse(raw)) : initialRatingState();
  } catch {
    return initialRatingState();
  }
}

export async function saveRatingState(state: RatingState): Promise<void> {
  try {
    await AsyncStorage.setItem(RATING_KEY, JSON.stringify(state));
  } catch {
    // not saved: at worst the person is asked a little sooner next time
  }
}
