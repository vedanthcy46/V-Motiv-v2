import { describe, expect, it } from 'vitest';
import { PLAY_MARKET_URL, PLAY_WEB_URL, WEBSITE_URL, rateUrls, shareLink, shareMessage } from './store-links';
import {
  DAYS_BETWEEN_ASKS, MAX_DECLINES, SESSIONS_BEFORE_FIRST_ASK, answeredNotNow, answeredRate, askedNow, initialRatingState, parseRatingState, recordSession, shouldAskForRating,
  type RatingState,
} from './rating-prompt';

const DAY = 24 * 60 * 60 * 1000;

describe('where to rate', () => {
  it('on Android tries the Play Store app first, then the Play Store web page', () => {
    expect(rateUrls('android')).toEqual([PLAY_MARKET_URL, PLAY_WEB_URL]);
    expect(PLAY_MARKET_URL).toBe('market://details?id=in.vmotiv.customer');
    expect(PLAY_WEB_URL).toBe('https://play.google.com/store/apps/details?id=in.vmotiv.customer');
  });
  it('on iOS uses the configured store address, and offers nothing when there is none', () => {
    expect(rateUrls('ios', 'https://apps.apple.com/in/app/v-motiv/id123')).toEqual(['https://apps.apple.com/in/app/v-motiv/id123']);
    expect(rateUrls('ios')).toEqual([]);
    expect(rateUrls('ios', 'javascript:alert(1)')).toEqual([]);
    expect(rateUrls('ios', 'http://insecure.example')).toEqual([]);
  });
});

describe('what is shared', () => {
  it('shares the Play page on Android, and the store page or the website elsewhere', () => {
    expect(shareLink('android')).toBe(PLAY_WEB_URL);
    expect(shareLink('ios', 'https://apps.apple.com/in/app/v-motiv/id123')).toBe('https://apps.apple.com/in/app/v-motiv/id123');
    expect(shareLink('ios')).toBe(WEBSITE_URL);
  });
  it('is a plain message that carries the link and makes no promises', () => {
    const message = shareMessage('android');
    expect(message).toContain(PLAY_WEB_URL);
    expect(message).toMatch(/service/i);
    expect(message).not.toMatch(/free|discount|offer|win|reward/i);
  });
});

describe('when to ask for a rating', () => {
  const regular = (over: Partial<RatingState> = {}): RatingState => ({ ...initialRatingState(), sessions: SESSIONS_BEFORE_FIRST_ASK, ...over });
  const now = 1_800_000_000_000;

  it('waits until the app has been opened enough times', () => {
    expect(shouldAskForRating(regular({ sessions: SESSIONS_BEFORE_FIRST_ASK - 1 }), now)).toBe(false);
    expect(shouldAskForRating(regular(), now)).toBe(true);
  });
  it('counts a session each time the app opens', () => {
    expect(recordSession(initialRatingState()).sessions).toBe(1);
  });
  it('does not ask again soon after asking, then may ask once the quiet period has passed', () => {
    const asked = askedNow(regular(), now);
    expect(shouldAskForRating(asked, now + 1)).toBe(false);
    expect(shouldAskForRating(asked, now + (DAYS_BETWEEN_ASKS - 1) * DAY)).toBe(false);
    expect(shouldAskForRating(answeredNotNow(asked), now + DAYS_BETWEEN_ASKS * DAY)).toBe(true);
  });
  it('never asks again after the person has rated, or has said not now twice', () => {
    expect(shouldAskForRating(answeredRate(regular()), now + 999 * DAY)).toBe(false);
    let state = regular();
    for (let i = 0; i < MAX_DECLINES; i += 1) state = answeredNotNow(askedNow(state, now));
    expect(shouldAskForRating(state, now + 999 * DAY)).toBe(false);
  });
});

describe('the saved state', () => {
  it('is read back checked: damaged data starts afresh', () => {
    expect(parseRatingState(null)).toEqual(initialRatingState());
    expect(parseRatingState('x')).toEqual(initialRatingState());
    expect(parseRatingState({ sessions: -4, declined: 'two', lastAskedAt: 'yesterday', rated: 'yes' })).toEqual(initialRatingState());
    expect(parseRatingState({ sessions: 6.9, declined: 1, lastAskedAt: 5, rated: true })).toEqual({ sessions: 6, lastAskedAt: 5, declined: 1, rated: true });
  });
});
