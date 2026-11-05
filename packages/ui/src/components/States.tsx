import type { ReactNode } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';

export function EmptyState({ title, description, action, icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-1 rounded-box border border-dashed border-base-300 px-6 py-10 text-center">
      <span className="mb-2 grid size-11 place-items-center rounded-full bg-base-200 text-base-content/60">{icon ?? <Icon name="inbox" size={22} />}</span>
      <p className="font-semibold">{title}</p>
      {description ? <p className="max-w-md text-sm text-base-content/60">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, onDismiss, className = '' }: { tone?: 'info' | 'success' | 'warning' | 'error'; title?: ReactNode; children?: ReactNode; onDismiss?: () => void; className?: string }) {
  const icon = { info: 'info', success: 'success', warning: 'alert', error: 'error' } as const;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`alert alert-soft alert-${tone} items-start ${className}`}>
      <Icon name={icon[tone]} size={20} className="mt-0.5" />
      <div className="min-w-0 flex-1 text-sm">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5 opacity-85' : ''}>{children}</div> : null}
      </div>
      {onDismiss ? <button type="button" className="btn btn-ghost btn-xs btn-square" aria-label="Dismiss" onClick={onDismiss}><Icon name="close" size={14} /></button> : null}
    </div>
  );
}

/** Failed-to-load state with a retry button. */
export function ErrorState({ message, onRetry, retrying }: { message: ReactNode; onRetry?: () => void; retrying?: boolean }) {
  return (
    <Alert tone="error" title="Could not load this data">
      <p>{message}</p>
      {onRetry ? <Button className="mt-3" size="sm" variant="outline" loading={retrying} onClick={onRetry} icon={<Icon name="refresh" size={14} />}>Try again</Button> : null}
    </Alert>
  );
}

/** Centred full-page message (access denied, connection issue). */
export function CenterState({ eyebrow, title, children, actions, logo = '/brand/vmotiv-logo.svg' }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode; logo?: string }) {
  return (
    <main className="vm-center">
      <div>
        <img src={logo} alt="V MOTIV" className="mb-3" />
        {eyebrow ? <p className="vm-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {children}
        {actions ? <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div> : null}
      </div>
    </main>
  );
}
