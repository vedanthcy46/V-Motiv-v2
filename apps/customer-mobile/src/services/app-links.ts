// Where a tap on an announcement (or any link-carrying notification) goes inside the customer app. Only these destinations exist:
// a link that does not match is ignored, so a notification can never steer the app somewhere it should not go.
export type AppDestination =
  | { kind: 'tab'; tab: 'Home' | 'Explore' }
  | { kind: 'screen'; name: 'Sell' | 'RentalHome' | 'ServiceHome' }
  | { kind: 'vehicle'; listingId: string };

export function resolveAppLink(link: string | null | undefined): AppDestination | null {
  if (!link || link.length > 200) return null;
  const vehicle = /^vmotiv:\/\/vehicles\/([0-9a-fA-F-]{36})$/.exec(link);
  if (vehicle) return { kind: 'vehicle', listingId: vehicle[1]! };
  const app = /^vmotiv:\/\/app\/(home|buy|sell|rentals|service)$/.exec(link);
  switch (app?.[1]) {
    case 'home': return { kind: 'tab', tab: 'Home' };
    case 'buy': return { kind: 'tab', tab: 'Explore' };
    case 'sell': return { kind: 'screen', name: 'Sell' };
    case 'rentals': return { kind: 'screen', name: 'RentalHome' };
    case 'service': return { kind: 'screen', name: 'ServiceHome' };
    default: return null;
  }
}
