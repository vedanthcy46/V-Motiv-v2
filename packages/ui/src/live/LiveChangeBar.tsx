// Floating notice: tells staff that something changed which they did not do themselves (a customer booking, an enquiry,
// a payment). Fed by useChangeWatcher; the data on screen refreshes by itself, the bar makes sure the change is noticed.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { subscribeChanges } from './autoRefresh';
import { CountBadge } from '../components/Badge';
import { Icon } from '../components/Icon';

export interface LiveChangeBarProps {
  /** Plain-language name for each watched domain, e.g. { rentals: 'Rental bookings' }. */
  labels: Record<string, string>;
}

let viewHandler: ((domain: string) => void) | null = null;

/** A portal registers where each domain's activity lives; the bar then offers a View button. Returns an unregister function. */
export function registerViewHandler(handler: (domain: string) => void): () => void {
  viewHandler = handler;
  return () => { if (viewHandler === handler) viewHandler = null; };
}

/** Puts the bar on the page in its own React root, so it is independent of the portal's screens and sign-in state. */
export function mountLiveChangeBar(labels: Record<string, string>): void {
  const host = document.createElement('div');
  host.id = 'live-change-bar-root';
  document.body.appendChild(host);
  createRoot(host).render(<LiveChangeBar labels={labels} />);
}

const AUTO_DISMISS_MS = 60_000;

export function LiveChangeBar({ labels }: LiveChangeBarProps) {
  const onView = viewHandler;
  const [pending, setPending] = useState<Record<string, number>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setPending({});
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeChanges(({ domains }) => {
      setPending(prev => {
        const next = { ...prev };
        for (const domain of domains) next[domain] = (next[domain] ?? 0) + 1;
        return next;
      });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setPending({}), AUTO_DISMISS_MS);
    });
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const domains = Object.keys(pending);
  if (domains.length === 0) return null;

  return (
    <div role="status" aria-live="polite" className="vm-live-bar alert border-base-300 bg-base-100 py-2.5 pl-4 pr-2 shadow-lg">
      <span className="relative flex size-2.5" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
      </span>
      <span className="text-sm font-semibold">New activity</span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-base-content/70">
        {domains.map(domain => (
          <span key={domain} className="inline-flex items-center gap-1.5">
            {labels[domain] ?? domain}
            {pending[domain]! > 1 ? <CountBadge count={pending[domain]!} tone="neutral" /> : null}
            {onView ? <button type="button" className="btn btn-primary btn-xs" onClick={() => { onView(domain); dismiss(); }}>View</button> : null}
          </span>
        ))}
      </span>
      <button type="button" className="btn btn-ghost btn-square btn-xs" onClick={dismiss} aria-label="Dismiss"><Icon name="close" size={14} /></button>
    </div>
  );
}
