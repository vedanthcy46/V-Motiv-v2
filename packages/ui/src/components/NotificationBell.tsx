import { useEffect, useRef, useState } from 'react';
import { CountBadge } from './Badge';
import { Icon } from './Icon';
import { Button } from './Button';

export interface NotificationItem {
  id: string;
  title: string;
  body?: string | null;
  read?: boolean;
  createdAt?: string;
}

function ago(value?: string): string {
  if (!value) return '';
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(value).toLocaleDateString();
}

/** Bell with unread count and a dropdown list; identical in every portal. */
export function NotificationBell({ items, unread, title = 'Notifications', onOpenItem, onMarkAllRead, onOpen }: {
  items: NotificationItem[];
  unread: number;
  title?: string;
  onOpenItem?: (item: NotificationItem) => void;
  onMarkAllRead?: () => void | Promise<void>;
  /** Called when the dropdown opens (a good moment to refresh the list). */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        className="btn btn-ghost btn-square btn-sm relative"
        aria-label={unread ? `${title}, ${unread} unread` : title}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => { setOpen(value => { if (!value) onOpen?.(); return !value; }); }}
      >
        <Icon name="bell" size={19} />
        {unread > 0 ? <CountBadge count={unread} tone="danger" className="absolute -right-1 -top-1" /> : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-box border border-base-300 bg-base-100 text-base-content shadow-xl" style={{ animation: 'vm-pop-in .15s ease both' }} role="menu">
          <div className="flex items-center justify-between border-b border-base-300 px-4 py-2.5">
            <strong className="text-sm">{title}</strong>
            {unread > 0 && onMarkAllRead ? (
              <Button size="xs" variant="ghost" loading={marking} onClick={async () => { setMarking(true); try { await onMarkAllRead(); } finally { setMarking(false); } }}>Mark all read</Button>
            ) : null}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-base-content/55">You are all caught up.</p>
            ) : items.map(item => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className={`block w-full border-b border-base-300/70 px-4 py-3 text-left transition last:border-b-0 hover:bg-base-200 ${item.read ? '' : 'bg-primary/5'}`}
                onClick={() => { onOpenItem?.(item); setOpen(false); }}
              >
                <span className="flex items-start gap-2">
                  {!item.read ? <span className="mt-1.5 size-2 flex-none rounded-full bg-primary" aria-hidden="true" /> : <span className="size-2 flex-none" />}
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm leading-snug ${item.read ? 'font-medium text-base-content/75' : 'font-semibold'}`}>{item.title}</span>
                    {item.body ? <span className="mt-0.5 line-clamp-2 block text-xs text-base-content/60">{item.body}</span> : null}
                    {item.createdAt ? <span className="mt-1 block text-[0.6875rem] text-base-content/45">{ago(item.createdAt)}</span> : null}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
