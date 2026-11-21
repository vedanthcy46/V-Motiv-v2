import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '../hooks/toastStore';
import { modalIsOpen } from '../live/autoRefresh';
import { streamEmployeeNotifications, type EmployeeNotificationsApi, type InboxFilters, type InboxItem, type InboxPage } from './api';

export interface UseEmployeeNotificationsOptions {
  api: EmployeeNotificationsApi;
  enabled?: boolean;
  /** For live updates: where the API lives (…/api/v2) and how to get a fresh sign-in token. Without them the list simply polls. */
  stream?: { base: string; getToken: () => Promise<string> };
  filters?: InboxFilters;
  pollMs?: number;
}

/**
 * The inbox state for a portal: the list, the unread and action-required counts, live arrival of new items, and a REST poll as the
 * fallback when no live connection can be held. A new critical alert shows a toast on top of the bell.
 */
export function useEmployeeNotifications({ api, enabled = true, stream, filters = {}, pollMs = 45_000 }: UseEmployeeNotificationsOptions) {
  const [page, setPage] = useState<InboxPage | null>(null);
  const [counts, setCounts] = useState({ count: 0, actionRequired: 0, critical: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const filtersKey = JSON.stringify(filters);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const seen = useRef(new Set<string>());

  const refresh = useCallback(async (opts: { quiet?: boolean } = {}) => {
    if (!opts.quiet) setLoading(true);
    try {
      const [list, summary] = await Promise.all([api.list({ limit: 20, ...filtersRef.current }), api.counts()]);
      setPage(list);
      setCounts(summary);
      setError(null);
      list.items.forEach(item => seen.current.add(item.id));
    } catch (err) {
      if (!opts.quiet) setError(err instanceof Error ? err.message : 'Could not load notifications');
    } finally {
      if (!opts.quiet) setLoading(false);
    }
  }, [api]);

  const loadMore = useCallback(async () => {
    if (!page?.nextCursor) return;
    const next = await api.list({ limit: 20, ...filtersRef.current, cursor: page.nextCursor });
    setPage(current => current ? { ...next, items: [...current.items, ...next.items] } : next);
  }, [api, page?.nextCursor]);

  useEffect(() => { if (enabled) void refresh(); }, [enabled, refresh, filtersKey]);

  // Poll quietly. It is slower while a live connection is up and never refreshes under an open dialog.
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => { if (!document.hidden && !modalIsOpen()) void refresh({ quiet: true }); }, live ? pollMs * 4 : pollMs);
    return () => clearInterval(timer);
  }, [enabled, live, pollMs, refresh]);

  // Live arrival.
  useEffect(() => {
    if (!enabled || !stream) return undefined;
    return streamEmployeeNotifications({
      base: stream.base, getToken: stream.getToken, onState: state => setLive(state === 'live'),
      onNotification: (item: InboxItem) => {
        if (seen.current.has(item.id)) return;
        seen.current.add(item.id);
        setPage(current => current ? { ...current, items: [item, ...current.items], unreadCount: current.unreadCount + 1 } : current);
        setCounts(current => ({ count: current.count + 1, actionRequired: current.actionRequired + (item.requiresAck ? 1 : 0), critical: current.critical + (item.severity === 'CRITICAL' ? 1 : 0) }));
        if (item.severity === 'CRITICAL') toast.error(item.title, { description: item.body });
      },
    });
  }, [enabled, stream?.base]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchItem = (id: string, change: Partial<InboxItem>) => setPage(current => current ? { ...current, items: current.items.map(item => item.id === id ? { ...item, ...change } : item) } : current);

  const markRead = useCallback(async (id: string) => {
    patchItem(id, { read: true, readAt: new Date().toISOString() });
    setCounts(current => ({ ...current, count: Math.max(0, current.count - 1) }));
    try { await api.markRead(id); } catch { void refresh({ quiet: true }); }
  }, [api, refresh]);

  const markAllRead = useCallback(async (module?: string) => { await api.markAllRead(module); await refresh({ quiet: true }); }, [api, refresh]);
  const acknowledge = useCallback(async (id: string) => { const item = await api.acknowledge(id); patchItem(id, item); await refresh({ quiet: true }); }, [api, refresh]);

  return { page, items: page?.items ?? [], counts, loading, error, live, refresh, loadMore, markRead, markAllRead, acknowledge };
}
export type EmployeeNotificationsState = ReturnType<typeof useEmployeeNotifications>;
