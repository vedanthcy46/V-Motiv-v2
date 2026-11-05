import { useSyncExternalStore } from 'react';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';
export interface ToastItem { id: number; tone: ToastTone; title: string; description?: string; duration: number }

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const emit = () => listeners.forEach(l => l());

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  items = items.filter(item => item.id !== id);
  emit();
}

function push(tone: ToastTone, title: string, options: { description?: string; duration?: number } = {}): number {
  // Identical message already visible: keep one toast instead of stacking duplicates.
  const duplicate = items.find(item => item.tone === tone && item.title === title && item.description === options.description);
  if (duplicate) { dismissToast(duplicate.id); }
  const id = nextId++;
  const duration = options.duration ?? (tone === 'error' ? 7000 : 4000);
  items = [...items.slice(-3), { id, tone, title, description: options.description, duration }];
  if (duration > 0) timers.set(id, setTimeout(() => dismissToast(id), duration));
  emit();
  return id;
}

type Options = { description?: string; duration?: number };
/** Fire-and-forget notifications, callable from anywhere (components, API helpers, event handlers). */
export const toast = {
  success: (title: string, options?: Options) => push('success', title, options),
  error: (title: string, options?: Options) => push('error', title, options),
  info: (title: string, options?: Options) => push('info', title, options),
  warning: (title: string, options?: Options) => push('warning', title, options),
  dismiss: dismissToast,
};

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => items,
    () => items,
  );
}
