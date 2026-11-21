import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { CountBadge } from '../components/Badge';
import { Icon } from '../components/Icon';
import { openNotification, timeAgo } from './NotificationInbox';
import type { InboxItem } from './api';
import { useEmployeeNotifications, type UseEmployeeNotificationsOptions } from './useEmployeeNotifications';

/** The bell in a portal's top bar: real unread count, the latest few items, and a link to the full inbox. Backed by PostgreSQL, not by counters. */
export function EmployeeNotificationBell({ api, stream, enabled = true, onNavigate, onViewAll, title = 'Notifications' }: UseEmployeeNotificationsOptions & { onNavigate: (route: string, item: InboxItem) => void; onViewAll: () => void; title?: string }) {
  const inbox = useEmployeeNotifications({ api, stream, enabled, filters: { limit: 6 } });
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const unread = inbox.counts.count;
  return (
    <div className="relative" ref={root}>
      <button type="button" className="btn btn-ghost btn-square btn-sm relative" aria-label={unread ? `${title}, ${unread} unread` : title} aria-haspopup="true" aria-expanded={open} onClick={() => { setOpen(value => !value); void inbox.refresh({ quiet: true }); }}>
        <Icon name="bell" size={19} />
        {unread > 0 ? <CountBadge count={unread} tone={inbox.counts.critical > 0 ? 'danger' : 'danger'} className="absolute -right-1 -top-1" /> : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-box border border-base-300 bg-base-100 text-base-content shadow-xl" role="menu">
          <div className="flex items-center justify-between border-b border-base-300 px-4 py-2.5">
            <strong className="text-sm">{title}{inbox.counts.actionRequired ? ` · ${inbox.counts.actionRequired} need action` : ''}</strong>
            {unread > 0 ? <Button size="xs" variant="ghost" onClick={() => void inbox.markAllRead()}>Mark all read</Button> : null}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {inbox.items.length === 0 ? <p className="px-4 py-8 text-center text-sm text-base-content/55">You are all caught up.</p> : inbox.items.map(item => (
              <button key={item.id} type="button" role="menuitem" className={`block w-full border-b border-base-300/70 px-4 py-3 text-left hover:bg-base-200 last:border-b-0 ${item.read ? '' : 'bg-primary/5'}`}
                onClick={async () => { if (await openNotification(api, item, onNavigate)) { setOpen(false); if (!item.read) void inbox.markRead(item.id); } }}>
                <span className="flex items-start gap-2">
                  <span className={`mt-1.5 size-2 flex-none rounded-full ${item.read ? '' : item.severity === 'CRITICAL' ? 'bg-error' : 'bg-primary'}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block text-xs text-base-content/65">{item.body}</span>
                    <span className="mt-0.5 block text-[11px] text-base-content/45">{timeAgo(item.createdAt)}{item.requiresAck && !item.acknowledgedAt ? ' · needs acknowledgement' : ''}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="block w-full border-t border-base-300 px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-base-200" onClick={() => { setOpen(false); onViewAll(); }}>View all notifications</button>
        </div>
      ) : null}
    </div>
  );
}
