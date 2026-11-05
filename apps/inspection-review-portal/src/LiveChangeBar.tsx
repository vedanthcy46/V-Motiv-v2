// Floating action bar: tells staff that something changed which they did not do themselves (a customer booking, an enquiry,
// a payment). Fed by useChangeWatcher; the data on screen refreshes by itself, the bar makes sure the change is noticed.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { subscribeChanges } from './autoRefresh';

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
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '1.25rem',
        transform: 'translateX(-50%)',
        zIndex: 1200,
        maxWidth: 'min(640px, calc(100vw - 2rem))',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap',
        padding: '0.7rem 0.9rem 0.7rem 1rem',
        background: '#0b2140',
        color: '#f8fafc',
        border: '1px solid #f59e0b',
        borderRadius: '999px',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.55)',
        fontSize: '0.875rem',
      }}
    >
      <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 0 4px rgba(245, 158, 11, 0.25)', flexShrink: 0 }} />
      <span style={{ fontWeight: 700 }}>New activity</span>
      <span style={{ color: '#cbd5e1', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {domains.map(domain => (
          <span key={domain} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            {labels[domain] ?? domain}
            {pending[domain]! > 1 ? <span style={{ background: 'rgba(245, 158, 11, 0.2)', borderRadius: 999, padding: '0 0.4rem', fontSize: '0.75rem' }}>×{pending[domain]}</span> : null}
            {onView ? (
              <button
                type="button"
                onClick={() => { onView(domain); dismiss(); }}
                style={{ background: '#f59e0b', color: '#0b1a30', border: 'none', borderRadius: 999, padding: '0.2rem 0.7rem', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}
              >
                View
              </button>
            ) : null}
          </span>
        ))}
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{ background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0.1rem 0.3rem' }}
      >
        ✕
      </button>
    </div>
  );
}
