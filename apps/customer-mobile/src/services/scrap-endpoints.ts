import type { DraftPatch, QuestionnaireDefinition } from './scrap-form';
import type { ScrapDetails, ScrapDraftView, ScrapListRow, ScrapPage, ScrapSummary } from './scrap-types';

// The vehicle-scrapping API calls, written once for the mobile app and the website. Each supplies how to send a request (the app and the
// website attach sign-in tokens and base addresses differently); the paths, methods and bodies live only here, so the two cannot drift apart.
// All business rules live on the server. These only carry requests and read replies.

export type ScrapCall = <T>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown) => Promise<T>;

export function createScrapApi(call: ScrapCall) {
  const base = '/customer/scrap';
  return {
    questionnaire: () => call<QuestionnaireDefinition>(`${base}/questionnaire`, 'GET'),
    createDraft: (input: { customerVehicleId?: string; submissionKey?: string; draft?: DraftPatch }) =>
      call<{ created: boolean; request: ScrapDraftView }>(`${base}/requests`, 'POST', input),
    saveDraft: (id: string, expectedVersion: number, patch: DraftPatch) =>
      call<ScrapDraftView>(`${base}/requests/${id}`, 'PATCH', { expectedVersion, ...patch }),
    deleteDraft: (id: string) => call<{ deleted: true }>(`${base}/requests/${id}`, 'DELETE'),
    submit: (id: string) => call<{ alreadySubmitted: boolean; request: ScrapSummary }>(`${base}/requests/${id}/submit`, 'POST'),
    list: (cursor?: string) => call<ScrapPage<ScrapListRow>>(`${base}/requests${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, 'GET'),
    get: (id: string) => call<ScrapDetails | ScrapDraftView>(`${base}/requests/${id}`, 'GET'),
    cancel: (id: string, reason: string, expectedVersion?: number) =>
      call<ScrapSummary>(`${base}/requests/${id}/cancel`, 'POST', { reason, ...(expectedVersion ? { expectedVersion } : {}) }),
    raiseConcern: (id: string, category: string, description: string) =>
      call<{ id: string; category: string; status: string; createdAt: string }>(`${base}/requests/${id}/disputes`, 'POST', { category, description }),
    respondToOffer: (id: string, offerId: string, decision: 'ACCEPTED' | 'REJECTED', note?: string) =>
      call<{ repeated: boolean; request: ScrapSummary }>(`${base}/requests/${id}/offer-response`, 'POST', { offerId, decision, ...(note ? { note } : {}) }),
  };
}

export type ScrapApi = ReturnType<typeof createScrapApi>;
