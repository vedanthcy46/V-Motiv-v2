import type { HTMLAttributes, ReactNode } from 'react';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
const toneClass: Record<Tone, string> = {
  neutral: 'badge-neutral',
  primary: 'badge-primary',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-error',
  info: 'badge-info',
};

export function Badge({ tone = 'neutral', soft = true, size = 'md', dot, className = '', children, ...rest }: { tone?: Tone; soft?: boolean; size?: 'sm' | 'md'; dot?: boolean; children: ReactNode } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`badge ${soft ? 'badge-soft' : ''} ${toneClass[tone]} ${size === 'sm' ? 'badge-sm' : ''} whitespace-nowrap font-medium ${className}`} {...rest}>
      {dot ? <span className="inline-block size-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

const POSITIVE = /^(ACTIVE|APPROVED|ACCEPTED|COMPLETED|CONFIRMED|PAID|PUBLISHED|VERIFIED|SETTLED|DELIVERED|SUCCESS|SUCCEEDED|READY|AVAILABLE|CAPTURED|RECEIVED_OK|ISSUED|CLEARED)$/;
const NEGATIVE = /^(REJECTED|DECLINED|CANCELLED|CANCELED|FAILED|EXPIRED|SUSPENDED|DEACTIVATED|OVERDUE|REFUNDED|BLOCKED|DENIED|VOID|VOIDED|LOST|CLOSED_LOST)$/;
const WAITING = /^(PENDING|PENDING_APPROVAL|OPEN|SUBMITTED|REQUESTED|RECEIVED|DRAFT|QUALIFYING|OFFER_PENDING|AWAITING.*|WAITING.*|IN_REVIEW|ON_HOLD|SCHEDULED|OFFERED|INSPECTION_SCHEDULED)$/;
const ACTIVE_WORK = /^(IN_PROGRESS|PROCESSING|ASSIGNED|CONTACTED|STARTED|ONGOING|DISPATCHED|RESERVED|IN_TRANSIT)$/;

/** Maps a workflow status string (e.g. PENDING_APPROVAL) to a consistent colour and a readable label. */
export function statusTone(status: string): Tone {
  const key = status.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (POSITIVE.test(key)) return 'success';
  if (NEGATIVE.test(key)) return 'danger';
  if (ACTIVE_WORK.test(key)) return 'info';
  if (WAITING.test(key)) return 'warning';
  return 'neutral';
}

export function humanize(value: string): string {
  const text = value.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function StatusBadge({ status, label, size }: { status: string; label?: string; size?: 'sm' | 'md' }) {
  return <Badge tone={statusTone(status)} dot size={size}>{label ?? humanize(status)}</Badge>;
}

/** Notification count bubble: hides at zero, caps at 99+. */
export function CountBadge({ count, tone = 'primary', className = '', label }: { count: number; tone?: Tone; className?: string; label?: string }) {
  if (!count || count < 0) return null;
  return (
    <span className={`badge badge-sm ${toneClass[tone]} ${tone === 'danger' ? 'vm-count-solid-danger' : tone === 'primary' ? 'vm-count-solid' : ''} min-w-5 justify-center rounded-full px-1.5 font-semibold tabular-nums ${className}`} aria-label={label ?? `${count} new`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
