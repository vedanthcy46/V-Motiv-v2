import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useOverlay } from '../hooks/useEscape';
import { Button } from './Button';
import { Icon } from './Icon';

const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' } as const;
export type ModalSize = keyof typeof sizes;

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open?: boolean;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  size?: ModalSize;
  children: ReactNode;
  footer?: ReactNode;
  /** While true (a save is running) the dialog cannot be dismissed. */
  busy?: boolean;
  /** Wrap body and footer in a form so Enter submits and the footer buttons can use type="submit". */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}

/** One dialog for every portal: dimmed backdrop, focus trap, Escape / backdrop close, scroll lock, restores focus. */
export function Modal({ open = true, title, description, onClose, size = 'md', children, footer, busy, onSubmit }: ModalProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const requestClose = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  useOverlay(open, requestClose);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current;
    node?.querySelector<HTMLElement>('[autofocus],input:not([type=hidden]),select,textarea')?.focus({ preventScroll: true }) ?? node?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0]!, last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); previous?.focus?.(); };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const inner = (
    <>
      <header className="flex items-start justify-between gap-4 border-b border-base-300 px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-base-content/60">{description}</p> : null}
        </div>
        <button type="button" className="btn btn-ghost btn-square btn-sm -mr-1.5" aria-label="Close dialog" onClick={requestClose} disabled={busy}>
          <Icon name="close" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer ? <footer className="flex flex-col-reverse gap-2 border-t border-base-300 bg-base-200/60 px-5 py-3 sm:flex-row sm:justify-end">{footer}</footer> : null}
    </>
  );

  return createPortal(
    <div className="modal modal-open" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy || undefined}
        tabIndex={-1}
        className={`vm-modal-box modal-box flex max-h-[min(92dvh,52rem)] w-full flex-col overflow-hidden rounded-box border border-base-300 bg-base-100 p-0 shadow-xl ${sizes[size]}`}
      >
        {onSubmit ? <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">{inner}</form> : inner}
      </div>
    </div>,
    document.body,
  );
}

/** Right-hand panel for record details (lead 360, case detail...). */
export function Drawer({ open = true, title, subtitle, onClose, children, footer, width = 'max-w-2xl' }: { open?: boolean; title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: string }) {
  const titleId = useId();
  useOverlay(open, onClose);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[1000]" role="presentation">
      <button type="button" aria-label="Close panel" className="absolute inset-0 cursor-default bg-[var(--scrim)]" style={{ animation: 'vm-fade-in .15s ease both' }} onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby={titleId} className={`vm-drawer-panel absolute inset-y-0 right-0 flex w-full ${width} flex-col border-l border-base-300 bg-base-100 shadow-xl`}>
        <header className="flex items-start justify-between gap-4 border-b border-base-300 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-base-content/60">{subtitle}</p> : null}
          </div>
          <button type="button" className="btn btn-ghost btn-square btn-sm" aria-label="Close panel" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t border-base-300 bg-base-200/60 px-5 py-3">{footer}</footer> : null}
      </aside>
    </div>,
    document.body,
  );
}

export interface ConfirmOptions { title: string; message?: ReactNode; confirmLabel?: string; cancelLabel?: string; tone?: 'primary' | 'danger' }

/** Confirmation dialog that resolves a promise; replaces window.confirm. */
export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary', onConfirm, onCancel }: ConfirmOptions & { onConfirm: () => void | Promise<void>; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>{confirmLabel}</Button>
        </>
      }
    >
      {message ? <div className="text-sm text-base-content/75">{message}</div> : null}
    </Modal>
  );
}
