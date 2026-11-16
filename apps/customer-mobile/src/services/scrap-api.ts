import { api, jsonBody } from '../api';
import { createScrapApi } from './scrap-endpoints';

// The mobile app's vehicle-scrapping API. The calls themselves are shared with the website (scrap-endpoints.ts); this only says how the
// app sends a request. The response types are shared too (scrap-types.ts).
export type { ScrapDetails, ScrapDraftView, ScrapEstimate, ScrapListRow, ScrapPage, ScrapSummary } from './scrap-types';
export { isDraftView } from './scrap-types';

export const scrapApi = createScrapApi((path, method, body) =>
  api(`/api/v2${path}`, { method, ...(body === undefined ? {} : { body: jsonBody(body) }) }),
);
