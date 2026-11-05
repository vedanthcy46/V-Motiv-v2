import type { HTMLAttributes, ReactNode } from 'react';
import { Skeleton } from './Loaders';

export function Card({ className = '', padded = true, children, ...rest }: { padded?: boolean } & HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={`rounded-box border border-base-300 bg-base-100 shadow-sm ${padded ? 'p-5' : ''} ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-base-content/60">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function StatCard({ label, value, hint, icon, loading, onClick }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode; loading?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-base-content/65">{label}</span>
        {icon ? <span className="grid size-8 place-items-center rounded-lg bg-base-200 text-base-content/70">{icon}</span> : null}
      </div>
      {loading ? <Skeleton className="mt-3 h-8 w-20" /> : <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</div>}
      {hint ? <div className="mt-1 text-xs text-base-content/55">{hint}</div> : null}
    </>
  );
  const cls = 'block w-full rounded-box border border-base-300 bg-base-100 p-5 text-left shadow-sm';
  return onClick
    ? <button type="button" onClick={onClick} className={`${cls} transition hover:border-primary/60 hover:shadow`}>{body}</button>
    : <div className={cls}>{body}</div>;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="vm-page-header">
      <div>
        {eyebrow ? <p className="vm-eyebrow mb-1">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="mt-1">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
