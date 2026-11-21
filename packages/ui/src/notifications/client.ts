import { createApiClient, resolveApiBase } from '../api/client';
import { createEmployeeNotificationsApi } from './api';

/**
 * Everything a portal needs for the employee inbox from one sign-in: an unprefixed API client (the inbox lives under `/employees/me`,
 * not under a portal prefix such as `/sales`), the typed inbox API, and the settings for the live stream.
 */
export function createEmployeeNotificationsClient(options: { apiBase: string | undefined; getToken: (force?: boolean) => Promise<string> }) {
  const base = resolveApiBase(options.apiBase);
  const client = createApiClient({ base, prefix: '', getToken: options.getToken });
  return { api: createEmployeeNotificationsApi(client), stream: { base, getToken: () => options.getToken(false) } };
}
