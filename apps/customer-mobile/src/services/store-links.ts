// Where to send people to rate the app, and what they share when they tell a friend. Pure (no react-native imports), so it is tested alone.

export const PLAY_PACKAGE = 'in.vmotiv.customer';
export const PLAY_WEB_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;
/** Opens the Play Store app straight on our page (the web address above is the fallback when there is no Play Store app). */
export const PLAY_MARKET_URL = `market://details?id=${PLAY_PACKAGE}`;
export const WEBSITE_URL = 'https://vmotiv.in';

export type Os = 'android' | 'ios' | string;

/** Web address of the iOS listing, if one is configured for this build. */
const cleanUrl = (value: string | undefined | null) => {
  const v = (value ?? '').trim();
  return /^https:\/\/\S+$/i.test(v) ? v : '';
};

/** The addresses to try, in order, to rate the app. Empty when this platform has no store page to send people to (the Rate entry is then hidden). */
export function rateUrls(os: Os, iosUrl?: string | null): string[] {
  if (os === 'android') return [PLAY_MARKET_URL, PLAY_WEB_URL];
  const ios = cleanUrl(iosUrl);
  return ios ? [ios] : [];
}

/** The link people share: the store page where there is one, the website otherwise. */
export function shareLink(os: Os, iosUrl?: string | null): string {
  if (os === 'android') return PLAY_WEB_URL;
  return cleanUrl(iosUrl) || WEBSITE_URL;
}

/** The message a person sends to a friend. Plain, honest, and easy to edit before sending. */
export function shareMessage(os: Os, iosUrl?: string | null): string {
  return `I use V MOTIV for my car: book a service, buy a car, sell one or scrap an old one, all in one app. Take a look: ${shareLink(os, iosUrl)}`;
}
