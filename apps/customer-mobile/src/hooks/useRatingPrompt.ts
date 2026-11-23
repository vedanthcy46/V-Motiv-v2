import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { canRateApp, loadRatingState, openRatePage, saveRatingState } from '../services/app-feedback';
import { answeredNotNow, answeredRate, askedNow, recordSession, shouldAskForRating } from '../services/rating-prompt';

// Counts each time the app is opened (once per launch, not once per visit to Home).
let countedThisLaunch = false;
/** A moment after Home appears, so the question never lands on top of the screen loading. */
const ASK_DELAY_MS = 4000;

/**
 * Asks, once in a while and politely, whether the person would rate the app. Only on the Home screen, only when signed in, and only where there
 * is a store page to send them to. The wording is neutral (it does not ask whether they are happy first). See services/rating-prompt.ts for when.
 */
export function useRatingPrompt(enabled: boolean) {
  useFocusEffect(
    useCallback(() => {
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;

      void (async () => {
        let state = await loadRatingState();
        if (!countedThisLaunch) {
          countedThisLaunch = true;
          state = recordSession(state);
          await saveRatingState(state);
        }
        if (!enabled || !canRateApp() || !shouldAskForRating(state, Date.now()) || !active) return;
        timer = setTimeout(() => {
          if (!active) return;
          const asked = askedNow(state, Date.now());
          void saveRatingState(asked);
          Alert.alert(
            'Rate V MOTIV',
            'If V MOTIV has been useful, a quick rating helps other drivers find us. It only takes a moment.',
            [
              { text: 'Not now', style: 'cancel', onPress: () => void saveRatingState(answeredNotNow(asked)) },
              { text: 'Rate V MOTIV', onPress: () => { void saveRatingState(answeredRate(asked)); void openRatePage(); } },
            ],
          );
        }, ASK_DELAY_MS);
      })();

      return () => {
        active = false;
        if (timer) clearTimeout(timer);
      };
    }, [enabled]),
  );
}
