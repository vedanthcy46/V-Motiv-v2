/** Preserve explicit settings; allow time for Neon compute activation. */
export function databaseConnection(value, { migration = false, directUrl } = {}) {
  const url = new URL(migration && directUrl ? directUrl : value);
  if (url.hostname.endsWith('.neon.tech')) {
    if (migration) url.hostname = url.hostname.replace('-pooler.', '.');
    if (!url.searchParams.has('connect_timeout')) url.searchParams.set('connect_timeout', '30');
    if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '30');
  }
  return url.toString();
}
