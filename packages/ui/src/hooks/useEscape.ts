import { useEffect } from 'react';

/** Locks page scroll and closes on Escape while `active`. */
export function useOverlay(active: boolean, onClose: () => void, closable = true) {
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && closable) { event.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', onKey); };
  }, [active, onClose, closable]);
}
