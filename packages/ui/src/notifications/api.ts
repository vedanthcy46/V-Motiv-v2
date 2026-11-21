// Client for the employee notification API (services/api/src/employee-notifications). One implementation for every portal.
export type Severity = 'CRITICAL' | 'ACTION_REQUIRED' | 'INFORMATIONAL';
export type NotificationModule = 'SALES' | 'OPERATIONS' | 'FINANCE' | 'ADMIN' | 'INSPECTION';

export interface InboxItem {
  id: string; createdAt: string; readAt: string | null; acknowledgedAt: string | null; resolvedAt: string | null; supersededAt: string | null;
  severity: Severity; module: NotificationModule; portal: string; title: string; body: string; resourceType: string | null; resourceId: string | null;
  actionRoute: string | null; branchId: string | null; requiresAck: boolean; read: boolean; actionable: boolean;
}
export interface InboxPage { items: InboxItem[]; nextCursor: string | null; unreadCount: number; actionRequiredCount: number; branches: Array<{ id: string; code: string; name: string; city: string }> }
export interface InboxFilters { module?: string; severity?: string; unread?: boolean; actionRequired?: boolean; branchId?: string; from?: string; to?: string; cursor?: string; limit?: number }
export type OpenDecision = { allowed: true; actionRoute: string; module: NotificationModule; portal: string } | { allowed: false; reason: string };
export interface Preferences { pushEnabled: boolean; emailEnabled: boolean; inAppEnabled: boolean; quietHoursEnabled: boolean; quietHoursStart: string; quietHoursEnd: string; digestFrequency: 'OFF' | 'DAILY'; mutedModules: string[]; mandatory?: string }

type Requester = { request<T>(path: string, init?: { method?: string; body?: string; quiet?: boolean }): Promise<T> };

const query = (params: Record<string, unknown>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '' && value !== false) search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
};

export function createEmployeeNotificationsApi(client: Requester) {
  const base = '/employees/me';
  return {
    list: (filters: InboxFilters = {}) => client.request<InboxPage>(`${base}/notifications${query({ ...filters, unread: filters.unread ? 'true' : undefined, actionRequired: filters.actionRequired ? 'true' : undefined })}`),
    counts: (module?: string) => client.request<{ count: number; actionRequired: number; critical: number }>(`${base}/notifications/unread-count${query({ module })}`, { quiet: true }),
    markRead: (id: string) => client.request<InboxItem>(`${base}/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: (module?: string) => client.request<{ updated: number }>(`${base}/notifications/read-all`, { method: 'POST', body: JSON.stringify(module ? { module } : {}) }),
    acknowledge: (id: string) => client.request<InboxItem>(`${base}/notifications/${id}/acknowledge`, { method: 'POST' }),
    /** Ask whether the link may be followed NOW (reassigned, access removed, finished). The portal still authorises the record itself. */
    authoriseOpen: (id: string) => client.request<OpenDecision>(`${base}/notifications/${id}/open`),
    preferences: () => client.request<Preferences>(`${base}/notification-preferences`),
    updatePreferences: (update: Partial<Preferences>) => client.request<Preferences>(`${base}/notification-preferences`, { method: 'PATCH', body: JSON.stringify(update) }),
  };
}
export type EmployeeNotificationsApi = ReturnType<typeof createEmployeeNotificationsApi>;

export const OPEN_REFUSAL: Record<string, string> = {
  NO_LONGER_EMPLOYED: 'Your access has ended.',
  NO_LONGER_AUTHORISED: 'You no longer have access to that branch.',
  REASSIGNED: 'This was reassigned to someone else.',
  RESOLVED: 'This has already been dealt with.',
  EXPIRED: 'This notification has expired.',
  NO_LINK: 'This notification has no page to open.',
};

/**
 * Live updates: reads the Server-Sent Events stream with fetch (so the Authorization header can be sent). Reconnects with backoff.
 * The inbox never depends on it: when it is down the caller keeps polling the REST list.
 */
export function streamEmployeeNotifications(options: { base: string; getToken: () => Promise<string>; onNotification: (item: InboxItem) => void; onState?: (state: 'live' | 'down') => void }): () => void {
  let stopped = false;
  let controller: AbortController | undefined;
  let delay = 2000;

  const connect = async () => {
    while (!stopped) {
      controller = new AbortController();
      try {
        const token = await options.getToken();
        const response = await fetch(`${options.base.replace(/\/$/, '')}/employees/me/notifications/stream`, { headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' }, signal: controller.signal });
        if (!response.ok || !response.body) throw new Error(`stream ${response.status}`);
        options.onState?.('live');
        delay = 2000;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.indexOf('\n\n');
          while (boundary >= 0) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const event = /^event: (.+)$/m.exec(block)?.[1];
            const data = /^data: (.+)$/m.exec(block)?.[1];
            if (event === 'notification' && data) { try { options.onNotification(JSON.parse(data) as InboxItem); } catch { /* ignore a malformed frame */ } }
            if (event === 'end') { reader.cancel().catch(() => undefined); }
            boundary = buffer.indexOf('\n\n');
          }
        }
      } catch {
        if (stopped) return;
      }
      options.onState?.('down');
      if (stopped) return;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 60_000);
    }
  };
  void connect();
  return () => { stopped = true; controller?.abort(); };
}
