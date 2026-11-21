// Home-screen banners and hub photos and videos, managed by the Operations team (see services/api/src/home-content.ts). Pure: no network, no
// React, so the rules below are tested alone. Whatever arrives from the server or from the phone's saved copy is treated as untrusted and
// checked before anything is shown.

export type HomeKind = 'BANNER' | 'HUB_PHOTO' | 'HUB_VIDEO';
export type ActionType = 'NONE' | 'SCREEN' | 'LISTING' | 'URL';

export interface HomeItem {
  id: string;
  kind: HomeKind;
  title: string | null;
  subtitle: string | null;
  mediaUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  actionType: ActionType;
  actionTarget: string | null;
  ctaLabel: string | null;
  hubName: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

export interface HomeContent { banners: HomeItem[]; hubPhotos: HomeItem[]; hubVideos: HomeItem[] }

export const emptyHomeContent = (): HomeContent => ({ banners: [], hubPhotos: [], hubVideos: [] });

const SCREENS = ['SERVICE', 'BUY', 'SELL', 'RENTAL', 'SCRAP', 'SUPPORT', 'GARAGE'] as const;
export type ScreenName = (typeof SCREENS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value: unknown, max: number): string | null => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
const isHttps = (value: unknown): value is string => typeof value === 'string' && /^https:\/\/[^\s]+$/i.test(value);
const isoOrNull = (value: unknown): string | null => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null);

/** One item from the server or the saved copy, or null when it is unusable. A bad item is dropped, never shown half-broken. */
export function parseItem(raw: unknown, expected: HomeKind): HomeItem | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || r.kind !== expected || !isHttps(r.mediaUrl)) return null;
  let actionType: ActionType = r.actionType === 'SCREEN' || r.actionType === 'LISTING' || r.actionType === 'URL' ? r.actionType : 'NONE';
  const actionTarget = text(r.actionTarget, 500);
  // An action that could not work is turned off, so the item still shows but its tap does nothing, instead of a dead or unsafe button.
  if (actionType === 'SCREEN' && !(SCREENS as readonly string[]).includes(actionTarget ?? '')) actionType = 'NONE';
  if (actionType === 'LISTING' && !UUID.test(actionTarget ?? '')) actionType = 'NONE';
  if (actionType === 'URL' && !isHttps(actionTarget)) actionType = 'NONE';
  const duration = typeof r.durationSeconds === 'number' && r.durationSeconds >= 1 && r.durationSeconds <= 600 ? Math.round(r.durationSeconds) : null;
  return {
    id: r.id, kind: expected, title: text(r.title, 80), subtitle: text(r.subtitle, 160), mediaUrl: r.mediaUrl, thumbnailUrl: isHttps(r.thumbnailUrl) ? r.thumbnailUrl : null,
    durationSeconds: duration, actionType, actionTarget: actionType === 'NONE' ? null : actionTarget, ctaLabel: actionType === 'NONE' ? null : text(r.ctaLabel, 30),
    hubName: text(r.hubName, 80), startsAt: isoOrNull(r.startsAt), endsAt: isoOrNull(r.endsAt),
  };
}

const LIMITS = { banners: 8, hubPhotos: 12, hubVideos: 6 } as const;

/** The whole reply, checked. Anything that is not a list becomes an empty one. */
export function parseHomeContent(raw: unknown): HomeContent {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = (value: unknown, kind: HomeKind, max: number) => (Array.isArray(value) ? value.map(item => parseItem(item, kind)).filter((item): item is HomeItem => item !== null).slice(0, max) : []);
  return { banners: list(r.banners, 'BANNER', LIMITS.banners), hubPhotos: list(r.hubPhotos, 'HUB_PHOTO', LIMITS.hubPhotos), hubVideos: list(r.hubVideos, 'HUB_VIDEO', LIMITS.hubVideos) };
}

/** Drops items whose dates say they are not showing now. Matters for the saved copy, which can be days old when the phone has been offline. */
export function visibleNow(content: HomeContent, now: Date = new Date()): HomeContent {
  const showing = (item: HomeItem) => (!item.startsAt || new Date(item.startsAt) <= now) && (!item.endsAt || new Date(item.endsAt) > now);
  return { banners: content.banners.filter(showing), hubPhotos: content.hubPhotos.filter(showing), hubVideos: content.hubVideos.filter(showing) };
}

export const hasAnyContent = (content: HomeContent) => content.banners.length + content.hubPhotos.length + content.hubVideos.length > 0;

/** A saved copy older than this is not shown while offline: out-of-date promotions are worse than none. */
export const CACHE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export interface CachedHomeContent { savedAt: number; city: string; content: HomeContent }

/** The saved copy if it is usable for this city and not too old. */
export function readCache(raw: unknown, city: string, now: number = Date.now()): HomeContent | null {
  const r = raw as Partial<CachedHomeContent> | null;
  if (!r || typeof r.savedAt !== 'number' || now - r.savedAt > CACHE_MAX_AGE_MS || r.savedAt > now + 60_000) return null;
  if ((r.city ?? '') !== city) return null;
  return visibleNow(parseHomeContent(r.content), new Date(now));
}

// ------------------------------------------------------------------------------------------------------------------------------------
// Where a tap goes
// ------------------------------------------------------------------------------------------------------------------------------------

export type Destination =
  | { type: 'signin' }
  | { type: 'tab'; name: 'Explore' | 'Garage' }
  | { type: 'root'; name: 'ServiceHome' | 'Sell' | 'ScrapRequest' | 'Support' | 'RentalHome' }
  | { type: 'vehicle'; listingId: string }
  | { type: 'url'; url: string }
  | { type: 'comingSoon'; feature: 'rental' }
  | { type: 'none' };

export interface NavContext { signedIn: boolean; rentalOpen: boolean }

/** Where opening one of the app's own screens leads. The same rules serve the quick-action row and banner buttons, so they cannot disagree. */
export function destinationForScreen(screen: ScreenName, ctx: NavContext): Destination {
  switch (screen) {
    case 'BUY': return { type: 'tab', name: 'Explore' };
    case 'SCRAP': return ctx.signedIn ? { type: 'root', name: 'ScrapRequest' } : { type: 'signin' };
    case 'SERVICE': return ctx.signedIn ? { type: 'root', name: 'ServiceHome' } : { type: 'signin' };
    case 'SELL': return ctx.signedIn ? { type: 'root', name: 'Sell' } : { type: 'signin' };
    case 'SUPPORT': return ctx.signedIn ? { type: 'root', name: 'Support' } : { type: 'signin' };
    case 'GARAGE': return ctx.signedIn ? { type: 'tab', name: 'Garage' } : { type: 'signin' };
    case 'RENTAL':
      if (!ctx.rentalOpen) return { type: 'comingSoon', feature: 'rental' };
      return ctx.signedIn ? { type: 'root', name: 'RentalHome' } : { type: 'signin' };
  }
}

/** Where tapping an item leads. Already-checked items only (see parseItem). */
export function destinationForItem(item: Pick<HomeItem, 'actionType' | 'actionTarget'>, ctx: NavContext): Destination {
  if (item.actionType === 'SCREEN' && item.actionTarget) return destinationForScreen(item.actionTarget as ScreenName, ctx);
  if (item.actionType === 'LISTING' && item.actionTarget) return { type: 'vehicle', listingId: item.actionTarget };
  if (item.actionType === 'URL' && item.actionTarget) return { type: 'url', url: item.actionTarget };
  return { type: 'none' };
}

/** Time as m:ss for a video's length badge. */
export function durationText(seconds: number | null): string | null {
  if (!seconds) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The poster for a video card: its cover image, or nothing (the card then shows a plain dark tile with the play mark). */
export const posterFor = (item: HomeItem): string | null => (item.kind === 'HUB_VIDEO' ? item.thumbnailUrl : item.mediaUrl);
