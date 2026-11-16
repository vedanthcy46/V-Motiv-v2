// In-page navigation with the browser's History API. Changing the address fires an event the scrapping area listens to, so links change the
// page without a reload while back, forward and "open in new tab" keep working.

export const NAVIGATE_EVENT = 'vmotiv:navigate';

export function navigate(path: string, options: { replace?: boolean } = {}) {
  if (window.location.pathname + window.location.search === path) return;
  if (options.replace) window.history.replaceState({}, '', path);
  else window.history.pushState({}, '', path);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
  window.scrollTo(0, 0);
}
