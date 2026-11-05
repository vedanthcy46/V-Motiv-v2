import { useCallback, useEffect, useRef, useState } from 'react';
import { NotificationBell, type NotificationItem } from './NotificationBell';
import { useAutoRefresh } from '../live/autoRefresh';

export interface StaffNotification extends NotificationItem {
  /** Where the hand-off should open, e.g. "/operations?tab=acquisitions". */
  deepLink?: string | null;
  entityId?: string | null;
}

export interface StaffNotificationSource {
  /** Newest first. */
  list: () => Promise<{ items: StaffNotification[]; unreadCount: number }>;
  markRead: (id: string) => Promise<unknown>;
  markAllRead: () => Promise<unknown>;
}

/** The query part of a deep link ("?tab=studio" → "studio"), or null. */
export function tabFromDeepLink(link?: string | null): string | null {
  if (!link) return null;
  const query = link.includes('?') ? link.slice(link.indexOf('?') + 1) : '';
  return new URLSearchParams(query).get('tab');
}

/**
 * The bell for a portal whose people are handed work by other teams (Finance, Operations…). It keeps itself fresh,
 * so a hand-off shows up as an unread badge without anyone refreshing, and opening an item jumps to the right screen.
 */
export function StaffNotificationBell({ source, enabled = true, title = 'Notifications', onOpenItem }: {
  source: StaffNotificationSource;
  enabled?: boolean;
  title?: string;
  onOpenItem?: (item: StaffNotification) => void;
}) {
  const [items, setItems] = useState<StaffNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const refresh = useCallback(async () => {
    const result = await sourceRef.current.list();
    setItems(result.items);
    setUnread(result.unreadCount);
  }, []);

  useEffect(() => { if (enabled) void refresh().catch(() => undefined); }, [enabled, refresh]);
  // A short poll is enough here: the list is one small, quiet request.
  useAutoRefresh(refresh, { enabled, intervalMs: 45_000, pauseWhen: () => false });

  return (
    <NotificationBell
      title={title}
      items={items}
      unread={unread}
      onOpen={() => { void refresh().catch(() => undefined); }}
      onMarkAllRead={async () => {
        await sourceRef.current.markAllRead();
        setItems(current => current.map(item => ({ ...item, read: true })));
        setUnread(0);
      }}
      onOpenItem={async item => {
        if (!item.read) {
          setItems(current => current.map(entry => entry.id === item.id ? { ...entry, read: true } : entry));
          setUnread(count => Math.max(0, count - 1));
          void sourceRef.current.markRead(item.id).catch(() => undefined);
        }
        onOpenItem?.(item as StaffNotification);
      }}
    />
  );
}
