// Client for /staff/announcements (Admin and Operations manage platform announcements to customers who opted in to promotions).
type Requester = { request<T>(path: string, init?: { method?: string; body?: string; quiet?: boolean }): Promise<T> };

export type AnnouncementStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED';
export interface Announcement {
  id: string; title: string; body: string; target: string; listingId: string | null; city: string | null; status: AnnouncementStatus;
  scheduledFor: string | null; startedAt: string | null; completedAt: string | null; cancelledAt: string | null;
  recipientCount: number; pushQueued: number; lastError: string | null; createdAt: string;
}
export interface AnnouncementSettings { enabled: boolean; maxPerDay: number }
export interface AnnouncementDraft { title: string; body: string; target: string; listingId?: string | null; city?: string | null }
export interface AnnouncementList { items: Announcement[]; settings: AnnouncementSettings; targets: string[] }

export function createAnnouncementsApi(client: Requester) {
  const base = '/staff/announcements';
  return {
    list: () => client.request<AnnouncementList>(base),
    audience: (city?: string) => client.request<{ recipients: number; withPushDevice: number }>(`${base}/audience${city ? `?city=${encodeURIComponent(city)}` : ''}`, { quiet: true }),
    create: (draft: AnnouncementDraft) => client.request<Announcement>(base, { method: 'POST', body: JSON.stringify(draft) }),
    update: (id: string, draft: AnnouncementDraft) => client.request<Announcement>(`${base}/${id}`, { method: 'PATCH', body: JSON.stringify(draft) }),
    test: (id: string) => client.request<{ sent: boolean; pushDevices: number }>(`${base}/${id}/test`, { method: 'POST' }),
    send: (id: string, expectedRecipients: number, scheduledFor?: string | null) => client.request<Announcement & { deferred: boolean; audience?: { recipients: number; withPushDevice: number } }>(`${base}/${id}/send`, { method: 'POST', body: JSON.stringify({ expectedRecipients, ...(scheduledFor ? { scheduledFor } : {}) }) }),
    cancel: (id: string) => client.request<Announcement>(`${base}/${id}/cancel`, { method: 'POST' }),
    updateSettings: (settings: Partial<AnnouncementSettings>) => client.request<AnnouncementSettings>(`${base}/settings`, { method: 'PUT', body: JSON.stringify(settings) }),
  };
}
export type AnnouncementsApi = ReturnType<typeof createAnnouncementsApi>;
