import { createApiClient, resolveApiBase } from '../api/client';
import { createAnnouncementsApi } from './api';

/** One unprefixed client per sign-in for the announcements API (it lives under /staff/announcements, not a portal prefix). */
export function createAnnouncementsClient(options: { apiBase: string | undefined; getToken: (force?: boolean) => Promise<string> }) {
  return createAnnouncementsApi(createApiClient({ base: resolveApiBase(options.apiBase), prefix: '', getToken: options.getToken, preferMessage: true }));
}
