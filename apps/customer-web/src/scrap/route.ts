// Which scrapping page a web address means. Pure, so the same rules are tested without a browser. Unknown or malformed addresses under /scrap
// go to the start page rather than showing an error.

export type ScrapRoute =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'list' }
  | { name: 'request'; id: string };

const ID = /^[A-Za-z0-9_-]{8,64}$/;

/** True for any address the scrapping area owns. */
export const isScrapPath = (pathname: string) => /^\/scrap(\/|$)/i.test(pathname);

export function parseScrapRoute(pathname: string): ScrapRoute {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean).map(part => { try { return decodeURIComponent(part); } catch { return ''; } });
  if (parts[0]?.toLowerCase() !== 'scrap' || parts.includes('')) return { name: 'home' }; // '' is an address part that could not be decoded
  const [, section, id, ...rest] = parts;
  if (!section) return { name: 'home' };
  if (rest.length) return { name: 'home' };
  if (section === 'new' && !id) return { name: 'new' };
  if (section === 'requests' && !id) return { name: 'list' };
  if (section === 'requests' && id && ID.test(id)) return { name: 'request', id };
  return { name: 'home' };
}

export const scrapPath = (route: ScrapRoute): string => {
  switch (route.name) {
    case 'new': return '/scrap/new';
    case 'list': return '/scrap/requests';
    case 'request': return `/scrap/requests/${encodeURIComponent(route.id)}`;
    default: return '/scrap';
  }
};
