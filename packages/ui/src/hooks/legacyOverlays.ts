/**
 * Older dialogs in the portals are plain `.modal-overlay > .modal-dialog` markup. This gives every one of them the same
 * behaviour as the shared <Modal/>: dialog semantics, Escape to close, page scroll lock, focus moved in, Tab kept inside
 * and focus restored on close. It watches the page, so no portal markup has to change.
 */
const OVERLAY = '.modal-overlay, .dialog-scrim';
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

let installed = false;
let locked = 0;
const handled = new WeakSet<Element>();

function setup(overlay: HTMLElement) {
  if (handled.has(overlay)) return;
  handled.add(overlay);
  const dialog = overlay.querySelector<HTMLElement>('.modal-dialog, .dialog') ?? overlay;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const heading = dialog.querySelector<HTMLElement>('h1, h2, h3');
  if (heading) {
    heading.id ||= `vm-dialog-${Math.random().toString(36).slice(2, 8)}`;
    dialog.setAttribute('aria-labelledby', heading.id);
  }
  const previous = document.activeElement as HTMLElement | null;
  if (locked++ === 0) document.documentElement.style.overflow = 'hidden';
  if (!dialog.contains(document.activeElement)) {
    (dialog.querySelector<HTMLElement>('[autofocus], input:not([type=hidden]):not([disabled]), select, textarea') ?? dialog.querySelector<HTMLElement>(FOCUSABLE))?.focus({ preventScroll: true });
  }

  const onKey = (event: KeyboardEvent) => {
    // Only the top-most dialog reacts.
    const all = document.querySelectorAll(OVERLAY);
    if (all[all.length - 1] !== overlay) return;
    if (event.key === 'Escape') {
      const close = dialog.querySelector<HTMLElement>('.modal-header button, .dialog-header button, [aria-label*="lose" i], .btn-close');
      if (close) { event.stopPropagation(); close.click(); }
    } else if (event.key === 'Tab') {
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]!, last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey);

  const watcher = new MutationObserver(() => {
    if (document.body.contains(overlay)) return;
    watcher.disconnect();
    document.removeEventListener('keydown', onKey);
    if (--locked <= 0) { locked = 0; document.documentElement.style.overflow = ''; }
    if (previous && document.body.contains(previous)) previous.focus?.({ preventScroll: true });
  });
  watcher.observe(document.body, { childList: true, subtree: true });
}

export function enhanceLegacyOverlays(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const scan = (root: ParentNode) => root.querySelectorAll<HTMLElement>(OVERLAY).forEach(setup);
  scan(document);
  new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches(OVERLAY)) setup(node);
        else scan(node);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
}
