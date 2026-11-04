// Tiny in-app signal: "something changed on the server, reload what you show". Push notifications emit it,
// screens that auto-refresh listen. Keeps the notification layer and the screens decoupled.
type Listener = (reason: string) => void;
const listeners = new Set<Listener>();

export function onRefreshSignal(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitRefreshSignal(reason: string): void {
  listeners.forEach(listener => {
    try {
      listener(reason);
    } catch {
      /* one broken listener must not stop the others */
    }
  });
}
