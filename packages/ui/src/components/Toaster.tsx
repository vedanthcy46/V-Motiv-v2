import { dismissToast, useToasts, type ToastTone } from '../hooks/toastStore';
import { Icon, type IconName } from './Icon';

const toneClass: Record<ToastTone, string> = { success: 'alert-success', error: 'alert-error', info: 'alert-info', warning: 'alert-warning' };
const toneIcon: Record<ToastTone, IconName> = { success: 'success', error: 'error', info: 'info', warning: 'alert' };

/** Mount once per app. Anything can then call `toast.success(...)` / `toast.error(...)`. */
export function Toaster() {
  const toasts = useToasts();
  return (
    <div className="vm-toaster" aria-live="polite" aria-atomic="false">
      {toasts.map(item => (
        <div key={item.id} role={item.tone === 'error' ? 'alert' : 'status'} className={`vm-toast alert alert-soft ${toneClass[item.tone]} items-start gap-3 py-3`}>
          <Icon name={toneIcon[item.tone]} size={20} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug">{item.title}</p>
            {item.description ? <p className="mt-0.5 text-sm leading-snug opacity-80">{item.description}</p> : null}
          </div>
          <button type="button" className="btn btn-ghost btn-xs btn-square" aria-label="Dismiss notification" onClick={() => dismissToast(item.id)}><Icon name="close" size={14} /></button>
        </div>
      ))}
    </div>
  );
}
