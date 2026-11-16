// Which parts of the app are live. The home screen, the side menu, the rental screen and the opening introduction all read from here,
// so changing one line below (for example rental: 'open' once rentals launch) changes all of them together.
//
//   main         the headline service of the app: shown first and largest
//   open         available
//   coming-soon  shown but blocked: it cannot be opened until it is switched to 'open'

export type FeatureKey = 'service' | 'buy' | 'sell' | 'rental' | 'scrap';
export type FeatureStatus = 'main' | 'open' | 'coming-soon';

export const FEATURE_STATUS: Record<FeatureKey, FeatureStatus> = {
  service: 'main',
  buy: 'open',
  sell: 'open',
  rental: 'coming-soon',
  scrap: 'open',
};

export function isFeatureOpen(key: FeatureKey): boolean {
  return FEATURE_STATUS[key] !== 'coming-soon';
}

/** The short label shown on a feature's badge. */
export function featureBadge(key: FeatureKey): 'MAIN' | 'OPEN' | 'COMING SOON' {
  const status = FEATURE_STATUS[key];
  return status === 'main' ? 'MAIN' : status === 'coming-soon' ? 'COMING SOON' : 'OPEN';
}

export const COMING_SOON_TITLES: Partial<Record<FeatureKey, string>> = {
  rental: 'Self-drive rentals',
};

export function comingSoonMessage(key: FeatureKey): { title: string; body: string } {
  const name = COMING_SOON_TITLES[key] ?? 'This service';
  return {
    title: `${name} — coming soon`,
    body: `${name} is not open for bookings yet. We will let you know as soon as it is.\n\nYou can book a car service, buy a car, sell yours or scrap it with V MOTIV today.`,
  };
}

/** The four areas introduced when the app first opens, in the order they are shown. Service comes first because it is the main one. */
export const INTRO_FEATURES: Array<{ key: Exclude<FeatureKey, 'sell'>; title: string; body: string }> = [
  { key: 'service', title: 'Car service, done right', body: 'Book maintenance and repairs with doorstep pickup, clear estimates and live tracking.' },
  { key: 'buy', title: 'Buy a certified car', body: 'Browse inspected cars, see real prices and book a test drive.' },
  { key: 'rental', title: 'Self-drive rentals', body: 'Hourly and daily rental cars are on the way.' },
  { key: 'scrap', title: 'Scrap a car responsibly', body: 'Retire an old car the right way, with V MOTIV handling it.' },
];
