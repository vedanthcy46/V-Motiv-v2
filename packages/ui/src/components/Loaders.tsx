import type { HTMLAttributes } from 'react';
import { usePendingRequests } from '../hooks/requestProgress';
import { useEffect, useState } from 'react';

export function Spinner({ size = 'md', className = '', label = 'Loading' }: { size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string; label?: string }) {
  return <span role="status" aria-label={label} className={`loading loading-spinner loading-${size} text-primary ${className}`} />;
}

export function Skeleton({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={`vm-skeleton ${className}`} {...rest} />;
}

export function SkeletonRows({ rows = 5, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`grid gap-2 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-12" style={{ opacity: 1 - i * 0.12 }} />)}
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-28 rounded-box" />)}
    </div>
  );
}

/** Table-shaped placeholder shown while a list is loading for the first time. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="vm-table-wrap" role="status" aria-label="Loading">
      <table style={{ minWidth: 0 }}>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r} className="border-t border-base-300 first:border-t-0">
              {Array.from({ length: columns }, (_, c) => (
                <td key={c} className="p-3"><Skeleton className="h-4" style={{ width: `${55 + ((r + c) % 4) * 11}%` }} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Full-screen first-load state: logo and spinner, shown until the session and first data arrive. */
export function PageLoader({ label = 'Loading your workspace', logo = '/brand/vmotiv-logo.svg' }: { label?: string; logo?: string }) {
  return (
    <div className="vm-center" role="status" aria-live="polite">
      <div>
        <img src={logo} alt="V MOTIV" className="mb-2" />
        <span className="loading loading-spinner loading-md text-primary" aria-hidden="true" />
        <p className="text-sm">{label}…</p>
      </div>
    </div>
  );
}

/** Thin bar at the top of the window while any tracked request is running (appears only if it takes longer than 150 ms). */
export function RequestProgress() {
  const pending = usePendingRequests();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (pending === 0) { setVisible(false); return undefined; }
    const timer = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timer);
  }, [pending]);
  return visible ? <div className="vm-progress" role="progressbar" aria-label="Working" /> : null;
}
