import { api, jsonBody } from '../api';
import type { toPayload } from './scrap-request';

// The one network call. Kept apart from the form rules so those can be tested without the app's native modules.
export interface ScrapRequestResult {
  created: boolean;
  request: { id: string; requestNumber: string; status: string; statusText: string };
}

export const sendScrapRequest = (payload: ReturnType<typeof toPayload>) =>
  api<ScrapRequestResult>('/api/v2/customer/scrap/requests', { method: 'POST', body: jsonBody(payload) });
