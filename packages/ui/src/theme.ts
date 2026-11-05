import { useSyncExternalStore } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'vmotiv-theme';
const listeners = new Set<() => void>();
let mode: ThemeMode = 'system';

function read(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(value: ThemeMode = mode): ResolvedTheme {
  if (value !== 'system') return value;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply() {
  const resolved = resolveTheme();
  const root = document.documentElement;
  root.setAttribute('data-theme', `vmotiv-${resolved}`);
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0b1526' : '#ffffff');
}

/** Call once, before the first render, so the page never flashes the wrong theme. */
export function initTheme(): void {
  if (typeof window === 'undefined') return;
  mode = read();
  apply();
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (mode === 'system') { apply(); listeners.forEach(l => l()); }
  });
  // Enable the crossfade only after the first paint.
  requestAnimationFrame(() => document.body?.classList.add('vm-ready'));
}

export function setThemeMode(next: ThemeMode): void {
  mode = next;
  try { window.localStorage.setItem(KEY, next); } catch { /* storage unavailable: theme still applies for this visit */ }
  apply();
  listeners.forEach(l => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useTheme() {
  const current = useSyncExternalStore(subscribe, () => mode, () => 'system' as ThemeMode);
  const resolved = resolveTheme(current);
  return {
    mode: current,
    resolved,
    setMode: setThemeMode,
    toggle: () => setThemeMode(resolved === 'dark' ? 'light' : 'dark'),
  };
}
