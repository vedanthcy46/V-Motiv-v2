// V MOTIV Connect chat: messages reach a screen two ways, instantly over the socket and (always) from the saved signals the screen
// polls. The same message therefore arrives twice, and a message the socket never delivered must still appear from the saved copy.
// This merges the two without losing or doubling anything.
export interface ChatMessage {
  id: string;
  from: 'VISITOR' | 'OWNER';
  text: string;
  sentAt: string;
  /** Shown straight away (typed here, or pushed over the socket) and not yet confirmed by the saved copy. */
  local?: boolean;
}

const MATCH_WINDOW_MS = 60_000;

/**
 * Add `incoming` to `current`. A saved message (not `local`) replaces the oldest still-unconfirmed local message with the same sender and
 * text; a message already present (same id) is ignored. Order is by time sent.
 */
export function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const result = [...current];
  for (const message of incoming) {
    if (result.some(item => item.id === message.id)) continue;
    if (!message.local) {
      const at = new Date(message.sentAt).getTime();
      const index = result.findIndex(item => item.local && item.from === message.from && item.text === message.text && Math.abs(new Date(item.sentAt).getTime() - at) <= MATCH_WINDOW_MS);
      if (index >= 0) { result[index] = message; continue; }
    }
    result.push(message);
  }
  return result.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
}

/** The chat messages in a list of saved call signals. Anything that is not a text chat message is ignored. */
export function chatMessagesFromSignals(signals: Array<{ id?: string; kind: string; senderRole?: string; payload: unknown; createdAt?: string }>): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const signal of signals) {
    const payload = signal.payload as { text?: unknown } | null;
    if (!signal.id || !signal.createdAt || signal.kind !== 'CHAT' || !payload || typeof payload.text !== 'string' || !payload.text.trim()) continue;
    out.push({ id: signal.id, from: signal.senderRole === 'OWNER' ? 'OWNER' : 'VISITOR', text: payload.text, sentAt: signal.createdAt });
  }
  return out;
}
