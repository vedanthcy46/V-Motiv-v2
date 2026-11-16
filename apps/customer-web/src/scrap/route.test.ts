import { describe, expect, it } from 'vitest';
import { isScrapPath, parseScrapRoute, scrapPath } from './route';

describe('scrap routes', () => {
  it('recognises the scrapping area and nothing else', () => {
    expect(isScrapPath('/scrap')).toBe(true);
    expect(isScrapPath('/scrap/')).toBe(true);
    expect(isScrapPath('/SCRAP/new')).toBe(true);
    expect(isScrapPath('/scrapbook')).toBe(false);
    expect(isScrapPath('/')).toBe(false);
    expect(isScrapPath('/connect/abc')).toBe(false);
  });

  it('maps addresses to pages', () => {
    expect(parseScrapRoute('/scrap')).toEqual({ name: 'home' });
    expect(parseScrapRoute('/scrap/')).toEqual({ name: 'home' });
    expect(parseScrapRoute('/scrap/new')).toEqual({ name: 'new' });
    expect(parseScrapRoute('/scrap/requests')).toEqual({ name: 'list' });
    expect(parseScrapRoute('/scrap/requests/abcd1234-ef56')).toEqual({ name: 'request', id: 'abcd1234-ef56' });
  });

  it('sends anything unknown or malformed to the start page', () => {
    for (const path of ['/scrap/nope', '/scrap/new/extra', '/scrap/requests/short', '/scrap/requests/a b c d e f g h', '/scrap/requests/%E0%A4%A', '/scrap/requests/abcd1234/extra', '/scrap/requests/../etc']) {
      expect(parseScrapRoute(path)).toEqual({ name: 'home' });
    }
  });

  it('round-trips', () => {
    for (const route of [{ name: 'home' }, { name: 'new' }, { name: 'list' }, { name: 'request', id: 'abcd1234-ef56' }] as const) {
      expect(parseScrapRoute(scrapPath(route))).toEqual(route);
    }
  });
});
