import { describe, expect, it } from 'vitest';
import { chatMessagesFromSignals, mergeChatMessages, type ChatMessage } from './connect-chat';

const at = (s: number) => new Date(Date.UTC(2026, 10, 22, 10, 0, s)).toISOString();
const msg = (id: string, from: 'VISITOR' | 'OWNER', text: string, s: number, local = false): ChatMessage => ({ id, from, text, sentAt: at(s), ...(local ? { local: true } : {}) });

describe('connect chat merging', () => {
  it('shows a message the socket never delivered once the saved copy arrives', () => {
    expect(mergeChatMessages([], [msg('s1', 'VISITOR', 'Your car is blocking mine', 1)])).toHaveLength(1);
  });

  it('does not double a message that arrives over the socket and then from the saved copy', () => {
    const afterSocket = mergeChatMessages([], [msg('sock-1', 'OWNER', 'Coming now', 2, true)]);
    const afterPoll = mergeChatMessages(afterSocket, [msg('db-1', 'OWNER', 'Coming now', 3)]);
    expect(afterPoll).toHaveLength(1);
    expect(afterPoll[0]).toMatchObject({ id: 'db-1' });
    expect(afterPoll[0]!.local).toBeUndefined();
  });

  it('keeps your own optimistic message when a poll does not include it yet', () => {
    const own = mergeChatMessages([], [msg('opt-1', 'VISITOR', 'Hello', 1, true)]);
    expect(mergeChatMessages(own, [])).toHaveLength(1);
  });

  it('keeps two identical messages sent twice, one-to-one with their saved copies', () => {
    let list = mergeChatMessages([], [msg('a', 'OWNER', 'ok', 1, true), msg('b', 'OWNER', 'ok', 2, true)]);
    list = mergeChatMessages(list, [msg('p1', 'OWNER', 'ok', 1), msg('p2', 'OWNER', 'ok', 2)]);
    expect(list.map(item => item.id)).toEqual(['p1', 'p2']);
  });

  it('is idempotent for repeated polls and orders by time', () => {
    const saved = [msg('2', 'OWNER', 'second', 5), msg('1', 'VISITOR', 'first', 1)];
    const once = mergeChatMessages([], saved);
    expect(mergeChatMessages(once, saved)).toEqual(once);
    expect(once.map(item => item.text)).toEqual(['first', 'second']);
  });

  it('does not match a different sender with the same text', () => {
    const list = mergeChatMessages([msg('l', 'VISITOR', 'ok', 1, true)], [msg('p', 'OWNER', 'ok', 2)]);
    expect(list).toHaveLength(2);
  });
});

describe('chat messages from saved signals', () => {
  it('keeps only text chat messages and maps the sender', () => {
    const items = chatMessagesFromSignals([
      { id: '1', kind: 'OFFER', senderRole: 'VISITOR', payload: { sdp: 'x' }, createdAt: at(1) },
      { id: '2', kind: 'CHAT', senderRole: 'OWNER', payload: { text: 'Hi' }, createdAt: at(2) },
      { id: '3', kind: 'CHAT', senderRole: 'VISITOR', payload: { text: '   ' }, createdAt: at(3) },
      { id: '4', kind: 'CHAT', senderRole: 'VISITOR', payload: {}, createdAt: at(4) },
      { id: '5', kind: 'CHAT', payload: { text: 'Hello' }, createdAt: at(5) },
    ]);
    expect(items.map(item => [item.id, item.from])).toEqual([['2', 'OWNER'], ['5', 'VISITOR']]);
  });
});
