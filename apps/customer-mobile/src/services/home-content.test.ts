import { describe, expect, it } from 'vitest';
import {
  CACHE_MAX_AGE_MS, destinationForItem, destinationForScreen, durationText, emptyHomeContent, hasAnyContent, parseHomeContent, parseItem, posterFor, readCache, visibleNow,
  type HomeItem,
} from './home-content';

const IMG = 'https://res.cloudinary.com/vmotiv/image/upload/a.jpg';
const base = (over: Record<string, unknown> = {}) => ({ id: 'i1', kind: 'BANNER', mediaUrl: IMG, title: 'Diwali offers', actionType: 'NONE', ...over });

describe('checking an item', () => {
  it('accepts a good banner and trims its text', () => {
    const item = parseItem(base({ title: '  Diwali offers  ', subtitle: 'Up to 20% off', hubName: 'Koramangala Hub' }), 'BANNER')!;
    expect(item).toMatchObject({ id: 'i1', title: 'Diwali offers', subtitle: 'Up to 20% off', hubName: 'Koramangala Hub', actionType: 'NONE', actionTarget: null });
  });
  it('drops anything unusable: no id, wrong kind, no media, media that is not https', () => {
    for (const bad of [null, 'x', {}, base({ id: 5 }), base({ kind: 'HUB_PHOTO' }), base({ mediaUrl: '' }), base({ mediaUrl: 'http://a/b.jpg' }), base({ mediaUrl: 'javascript:alert(1)' }), base({ mediaUrl: 'data:image/png;base64,AAAA' })]) {
      expect(parseItem(bad, 'BANNER'), JSON.stringify(bad)).toBeNull();
    }
  });
  it('turns a button that could not work into no button, rather than a dead or unsafe one', () => {
    expect(parseItem(base({ actionType: 'SCREEN', actionTarget: 'SETTINGS', ctaLabel: 'Go' }), 'BANNER')).toMatchObject({ actionType: 'NONE', actionTarget: null, ctaLabel: null });
    expect(parseItem(base({ actionType: 'LISTING', actionTarget: 'abc' }), 'BANNER')!.actionType).toBe('NONE');
    expect(parseItem(base({ actionType: 'URL', actionTarget: 'javascript:alert(1)' }), 'BANNER')!.actionType).toBe('NONE');
    expect(parseItem(base({ actionType: 'URL', actionTarget: 'http://vmotiv.in' }), 'BANNER')!.actionType).toBe('NONE');
    expect(parseItem(base({ actionType: 'SCREEN', actionTarget: 'SERVICE', ctaLabel: 'Book now' }), 'BANNER')).toMatchObject({ actionType: 'SCREEN', actionTarget: 'SERVICE', ctaLabel: 'Book now' });
    expect(parseItem(base({ actionType: 'URL', actionTarget: 'https://vmotiv.in/offers' }), 'BANNER')!.actionType).toBe('URL');
  });
  it('keeps a video\'s length only when it is sensible, and a cover only when it is https', () => {
    const video = (over: Record<string, unknown>) => parseItem({ ...base({ kind: 'HUB_VIDEO', mediaUrl: 'https://res.cloudinary.com/v/video/upload/a.mp4' }), ...over }, 'HUB_VIDEO')!;
    expect(video({ durationSeconds: 27.6 }).durationSeconds).toBe(28);
    for (const bad of [0, -3, 9999, 'x', null]) expect(video({ durationSeconds: bad }).durationSeconds).toBeNull();
    expect(video({ thumbnailUrl: 'http://x/a.jpg' }).thumbnailUrl).toBeNull();
    expect(video({ thumbnailUrl: IMG }).thumbnailUrl).toBe(IMG);
  });
});

describe('the whole reply', () => {
  it('keeps the good items in each list and drops the rest', () => {
    const content = parseHomeContent({ banners: [base(), base({ id: 'bad', mediaUrl: 'http://x' })], hubPhotos: [base({ id: 'p1', kind: 'HUB_PHOTO' })], hubVideos: 'nope' });
    expect(content.banners.map(b => b.id)).toEqual(['i1']);
    expect(content.hubPhotos).toHaveLength(1);
    expect(content.hubVideos).toEqual([]);
  });
  it('turns anything that is not an object into an empty Home, and caps each list', () => {
    for (const junk of [null, undefined, 'x', 5, []]) expect(parseHomeContent(junk)).toEqual(emptyHomeContent());
    const many = Array.from({ length: 20 }, (_, i) => base({ id: `b${i}` }));
    expect(parseHomeContent({ banners: many }).banners).toHaveLength(8);
    expect(hasAnyContent(parseHomeContent({ banners: many }))).toBe(true);
    expect(hasAnyContent(emptyHomeContent())).toBe(false);
  });
});

describe('what is showing now', () => {
  const item = (id: string, startsAt: string | null, endsAt: string | null): HomeItem => parseItem(base({ id, startsAt, endsAt }), 'BANNER')!;
  const now = new Date('2026-11-19T10:00:00Z');
  it('drops items that have not started or have ended (the saved copy can be days old)', () => {
    const content = { banners: [item('open', null, null), item('future', '2026-11-20T00:00:00Z', null), item('past', null, '2026-11-18T00:00:00Z'), item('now', '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z'), item('endsNow', null, '2026-11-19T10:00:00Z')], hubPhotos: [], hubVideos: [] };
    expect(visibleNow(content, now).banners.map(b => b.id)).toEqual(['open', 'now']);
  });
});

describe('the saved copy', () => {
  const saved = (over: Record<string, unknown> = {}) => ({ savedAt: 1_000_000, city: 'Pune', content: { banners: [base()], hubPhotos: [], hubVideos: [] }, ...over });
  it('is used for the same city while recent', () => {
    expect(readCache(saved(), 'Pune', 1_000_000 + 3600_000)!.banners).toHaveLength(1);
  });
  it('is not used for another city, when too old, from the future, or when damaged', () => {
    expect(readCache(saved(), 'Chennai', 1_000_000)).toBeNull();
    expect(readCache(saved(), 'Pune', 1_000_000 + CACHE_MAX_AGE_MS + 1)).toBeNull();
    expect(readCache(saved({ savedAt: 9_999_999_999_999 }), 'Pune', 1_000_000)).toBeNull();
    for (const junk of [null, 'x', {}, { savedAt: 'x' }]) expect(readCache(junk, 'Pune', 1_000_000)).toBeNull();
  });
  it('re-checks the items inside it, so a tampered or expired one never shows', () => {
    const copy = saved({ content: { banners: [base({ id: 'ok' }), base({ id: 'evil', mediaUrl: 'http://x' }), base({ id: 'ended', endsAt: '1970-01-01T00:00:00.500Z' })], hubPhotos: [], hubVideos: [] } });
    expect(readCache(copy, 'Pune', 1_000_000 + 1000)!.banners.map(b => b.id)).toEqual(['ok']);
  });
});

describe('where a tap goes', () => {
  const out = { signedIn: false, rentalOpen: true };
  const inn = { signedIn: true, rentalOpen: true };
  it('browsing cars needs no account; everything that creates or shows personal data asks for sign-in first', () => {
    expect(destinationForScreen('BUY', out)).toEqual({ type: 'tab', name: 'Explore' });
    for (const screen of ['SERVICE', 'SELL', 'SCRAP', 'SUPPORT', 'GARAGE'] as const) expect(destinationForScreen(screen, out)).toEqual({ type: 'signin' });
  });
  it('signed in, each goes to its screen', () => {
    expect(destinationForScreen('SERVICE', inn)).toEqual({ type: 'root', name: 'ServiceHome' });
    expect(destinationForScreen('SELL', inn)).toEqual({ type: 'root', name: 'Sell' });
    expect(destinationForScreen('SCRAP', inn)).toEqual({ type: 'root', name: 'ScrapRequest' });
    expect(destinationForScreen('SUPPORT', inn)).toEqual({ type: 'root', name: 'Support' });
    expect(destinationForScreen('GARAGE', inn)).toEqual({ type: 'tab', name: 'Garage' });
  });
  it('rentals say "coming soon" for everyone until they open', () => {
    expect(destinationForScreen('RENTAL', { signedIn: true, rentalOpen: false })).toEqual({ type: 'comingSoon', feature: 'rental' });
    expect(destinationForScreen('RENTAL', { signedIn: false, rentalOpen: false })).toEqual({ type: 'comingSoon', feature: 'rental' });
    expect(destinationForScreen('RENTAL', out)).toEqual({ type: 'signin' });
    expect(destinationForScreen('RENTAL', inn)).toEqual({ type: 'root', name: 'RentalHome' });
  });
  it('an item opens a screen, a car or a link, or does nothing', () => {
    expect(destinationForItem({ actionType: 'SCREEN', actionTarget: 'SELL' }, inn)).toEqual({ type: 'root', name: 'Sell' });
    expect(destinationForItem({ actionType: 'LISTING', actionTarget: '11111111-1111-4111-8111-111111111111' }, out)).toEqual({ type: 'vehicle', listingId: '11111111-1111-4111-8111-111111111111' });
    expect(destinationForItem({ actionType: 'URL', actionTarget: 'https://vmotiv.in/offers' }, out)).toEqual({ type: 'url', url: 'https://vmotiv.in/offers' });
    expect(destinationForItem({ actionType: 'NONE', actionTarget: null }, out)).toEqual({ type: 'none' });
    expect(destinationForItem({ actionType: 'SCREEN', actionTarget: null }, out)).toEqual({ type: 'none' });
  });
});

describe('small helpers', () => {
  it('formats a video length', () => {
    expect(durationText(27)).toBe('0:27');
    expect(durationText(75)).toBe('1:15');
    expect(durationText(null)).toBeNull();
  });
  it('uses the cover for a video and the image itself for a photo', () => {
    const video = parseItem(base({ kind: 'HUB_VIDEO', mediaUrl: 'https://x/v.mp4', thumbnailUrl: IMG }), 'HUB_VIDEO')!;
    expect(posterFor(video)).toBe(IMG);
    expect(posterFor(parseItem(base({ kind: 'HUB_PHOTO' }), 'HUB_PHOTO')!)).toBe(IMG);
  });
});
