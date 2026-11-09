// "New activity" notices: tell staff that something changed which they did not do themselves (a customer booking, an enquiry,
// a payment). Fed by useChangeWatcher; the data on screen refreshes by itself, the toast makes sure the change is noticed.
// The notices go through the portal's shared toaster (top of the stack with every other message), one card per area:
// more activity in the same area updates its card with a count instead of stacking duplicates.
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { subscribeChanges } from './autoRefresh';
import { toast } from '../hooks/toastStore';

export interface LiveChangeBarProps {
  /** Plain-language name for each watched domain, e.g. { rentals: 'Rental bookings' }. */
  labels: Record<string, string>;
}

let viewHandler: ((domain: string) => void) | null = null;

/** A portal registers where each domain's activity lives; the toast then offers a View button. Returns an unregister function. */
export function registerViewHandler(handler: (domain: string) => void): () => void {
  viewHandler = handler;
  return () => { if (viewHandler === handler) viewHandler = null; };
}

/** Starts listening for activity, independent of the portal's screens and sign-in state. */
export function mountLiveChangeBar(labels: Record<string, string>): void {
  const host = document.createElement('div');
  host.id = 'live-change-bar-root';
  host.hidden = true;
  document.body.appendChild(host);
  createRoot(host).render(<LiveChangeBar labels={labels} />);
}

const NOTICE_MS = 9_000;

/** Renders nothing: it turns change announcements into toasts. */
export function LiveChangeBar({ labels }: LiveChangeBarProps) {
  const counts = useRef<Record<string, { count: number; id: number }>>({});

  useEffect(() => {
    return subscribeChanges(({ domains }) => {
      for (const domain of domains) {
        const previous = counts.current[domain];
        if (previous) toast.dismiss(previous.id);
        const count = (previous?.count ?? 0) + 1;
        const onView = viewHandler;
        const id = toast.info('New activity', {
          description: `${labels[domain] ?? domain}${count > 1 ? ` (${count})` : ''}`,
          duration: NOTICE_MS,
          action: onView ? { label: 'View', onClick: () => onView(domain) } : undefined,
        });
        counts.current[domain] = { count, id };
        // After the notice has gone away, the next activity starts counting from one again.
        setTimeout(() => { if (counts.current[domain]?.id === id) delete counts.current[domain]; }, NOTICE_MS + 500);
      }
    });
  }, [labels]);

  return null;
}
