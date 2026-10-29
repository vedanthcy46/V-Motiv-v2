import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CheckCircle2, MessageSquare, Send, ShieldCheck, User, X } from 'lucide-react-native';
import { io, type Socket } from 'socket.io-client';
import {
  closeConnectCall,
  fetchOwnerCallSignals,
  fetchOwnerRealtimeTicket,
  sendOwnerCallSignal,
  type IncomingConnectCall,
  type WebRtcSignal,
} from '../services/connect-api';
import { radius, space, useAppTheme } from '../theme';

interface Props {
  call: IncomingConnectCall;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  from: 'VISITOR' | 'OWNER';
  text: string;
  sentAt: string;
}

const QUICK_REPLIES = [
  'Coming in 2 mins to move it!',
  'Thank you, checking right now!',
  'Sorry, on my way!',
  'All sorted, thank you!',
];

export function ConnectChatModal({ call, onClose }: Props) {
  const { theme, isDark } = useAppTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [isResolved, setIsResolved] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<FlatList>(null);

  // Poll fallback to ensure signals are never missed
  const refreshSignals = useCallback(async () => {
    try {
      const response = await fetchOwnerCallSignals(call.callSessionId);
      if (response.status === 'CLOSED') {
        setIsResolved(true);
      }
      const chatSignals = response.items.filter(
        item => item.kind === 'CHAT' && item.payload && typeof item.payload.text === 'string'
      );
      setMessages(
        chatSignals.map(s => ({
          id: s.id,
          from: (s.senderRole as 'VISITOR' | 'OWNER') || 'VISITOR',
          text: String(s.payload.text),
          sentAt: s.createdAt,
        }))
      );
    } catch {
      // Background polling non-fatal
    }
  }, [call.callSessionId]);

  // Connect to realtime socket
  useEffect(() => {
    let unmounted = false;

    async function initRealtime() {
      try {
        const ticketRes = await fetchOwnerRealtimeTicket(call.callSessionId);
        if (unmounted) return;

        const apiOrigin = (process.env.EXPO_PUBLIC_API_URL || 'https://api.vmotiv.in/api/v2')
          .replace(/\/$/, '')
          .replace(/\/api\/v[0-9]+$/, '');
        const realtimeUrl = process.env.EXPO_PUBLIC_REALTIME_URL || apiOrigin;

        const socket = io(realtimeUrl, {
          transports: ['websocket', 'polling'],
          auth: { ticket: ticketRes.ticket },
          reconnection: true,
        });

        socketRef.current = socket;

        socket.on('chat:message', (data: any) => {
          if (!data?.message?.text) return;
          const newMsg: ChatMessage = {
            id: String(Date.now()),
            from: data.from === 'OWNER' ? 'OWNER' : 'VISITOR',
            text: String(data.message.text),
            sentAt: data.sentAt || new Date().toISOString(),
          };
          setMessages(prev => {
            if (prev.some(m => m.text === newMsg.text && Math.abs(new Date(m.sentAt).getTime() - new Date(newMsg.sentAt).getTime()) < 2000)) {
              return prev;
            }
            return [...prev, newMsg];
          });
        });

        socket.on('call:hangup', () => {
          setIsResolved(true);
        });
      } catch {
        // Fallback to HTTP polling
      }
    }

    void initRealtime();
    void refreshSignals();

    const interval = setInterval(() => void refreshSignals(), 3000);

    return () => {
      unmounted = true;
      clearInterval(interval);
      socketRef.current?.disconnect();
    };
  }, [call.callSessionId, refreshSignals]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || busy || isResolved) return;

    setBusy(true);
    setInputText('');

    const optimistic: ChatMessage = {
      id: String(Date.now()),
      from: 'OWNER',
      text,
      sentAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit('chat:message', { text });
      }
      await sendOwnerCallSignal(call.callSessionId, 'CHAT', { text });
    } catch (e: any) {
      Alert.alert('Message not sent', e?.message || 'Please check your connection and try again.');
    } finally {
      setBusy(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  const handleCloseChat = () => {
    Alert.alert(
      'Close Conversation',
      'Resolve and close this chat? The passerby will be informed that the issue is settled.',
      [
        { text: 'Keep Open', style: 'cancel' },
        {
          text: 'Resolve & Close',
          style: 'destructive',
          onPress: async () => {
            setClosing(true);
            try {
              if (socketRef.current?.connected) {
                socketRef.current.emit('chat:message', { text: '[Issue resolved by owner]' });
                socketRef.current.emit('call:hangup');
              }
              await sendOwnerCallSignal(call.callSessionId, 'CLOSE', { reason: 'Resolved by owner' });
              await closeConnectCall(call.callSessionId, 'Resolved by owner');
              setIsResolved(true);
              setTimeout(onClose, 800);
            } catch (err: any) {
              Alert.alert('Unable to close chat', err?.message || 'Please try again.');
            } finally {
              setClosing(false);
            }
          },
        },
      ]
    );
  };

  const vehicle = call.link.vehicle;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
          <View style={styles.headerLeft}>
            <View style={[styles.iconWrap, { backgroundColor: 'rgba(247,181,3,0.14)' }]}>
              <MessageSquare size={20} color={theme.colors.brandAccent} />
            </View>
            <View>
              <Text style={[styles.vehicleTitle, { color: theme.colors.textPrimary }]}>
                {vehicle.year} {vehicle.make} {vehicle.model}
              </Text>
              <View style={styles.privacyRow}>
                <ShieldCheck size={13} color="#10B981" />
                <Text style={styles.privacyText}>Anonymous Passerby Chat</Text>
              </View>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={handleCloseChat}
              disabled={closing || isResolved}
              style={[styles.closeChatBtn, { opacity: closing || isResolved ? 0.6 : 1 }]}
            >
              {closing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.closeChatBtnText}>Close Chat</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} style={styles.dismissBtn}>
              <X size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Resolved Banner */}
        {isResolved && (
          <View style={styles.resolvedBanner}>
            <CheckCircle2 size={16} color="#10B981" />
            <Text style={styles.resolvedBannerText}>This conversation has been closed and resolved.</Text>
          </View>
        )}

        {/* Message Thread */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        >
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const isOwner = item.from === 'OWNER';
              return (
                <View style={[styles.messageRow, isOwner ? styles.messageRowOwner : styles.messageRowVisitor]}>
                  {!isOwner && (
                    <View style={styles.avatar}>
                      <User size={13} color="#FFFFFF" />
                    </View>
                  )}
                  <View
                    style={[
                      styles.bubble,
                      isOwner
                        ? [styles.bubbleOwner, { backgroundColor: theme.colors.brandAccent }]
                        : [styles.bubbleVisitor, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }],
                    ]}
                  >
                    <Text style={[styles.senderLabel, { color: isOwner ? '#061A38' : theme.colors.brandAccent }]}>
                      {isOwner ? 'You (Owner)' : 'Passerby'}
                    </Text>
                    <Text style={[styles.bubbleText, { color: isOwner ? '#061A38' : theme.colors.textPrimary }]}>
                      {item.text}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <MessageSquare size={36} color={theme.colors.textSecondary} />
                <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>Passerby Connected</Text>
                <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
                  The passerby scanned your vehicle QR sticker. You can chat securely below without sharing your phone number.
                </Text>
              </View>
            }
          />

          {/* Quick Replies */}
          {!isResolved && (
            <View style={styles.quickRepliesWrap}>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={QUICK_REPLIES}
                keyExtractor={(item, idx) => String(idx)}
                contentContainerStyle={{ paddingHorizontal: space.md, gap: space.xs }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => void handleSend(item)}
                    style={[styles.quickChip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                  >
                    <Text style={[styles.quickChipText, { color: theme.colors.textPrimary }]}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {/* Input Bar */}
          {!isResolved ? (
            <View style={[styles.inputBar, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
              <TextInput
                value={inputText}
                onChangeText={setInputText}
                placeholder="Reply to passerby..."
                placeholderTextColor={theme.colors.textSecondary}
                style={[styles.textInput, { backgroundColor: theme.colors.background, color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={() => void handleSend()}
              />
              <TouchableOpacity
                onPress={() => void handleSend()}
                disabled={!inputText.trim() || busy}
                style={[
                  styles.sendBtn,
                  { backgroundColor: theme.colors.brandAccent, opacity: !inputText.trim() || busy ? 0.5 : 1 },
                ]}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#061A38" />
                ) : (
                  <Send size={18} color="#061A38" />
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.inputBar, { backgroundColor: theme.colors.surface, justifyContent: 'center' }]}>
              <TouchableOpacity onPress={onClose} style={[styles.closeDoneBtn, { backgroundColor: theme.colors.brandAccent }]}>
                <Text style={styles.closeDoneBtnText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flex: 1,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  privacyText: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  closeChatBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  closeChatBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  dismissBtn: {
    padding: space.xs,
  },
  resolvedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    paddingVertical: 8,
    paddingHorizontal: space.md,
  },
  resolvedBannerText: {
    color: '#065F46',
    fontSize: 12,
    fontWeight: '600',
  },
  messageList: {
    padding: space.md,
    paddingBottom: space.lg,
    flexGrow: 1,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: space.sm,
    alignItems: 'flex-end',
    gap: 8,
  },
  messageRowOwner: {
    justifyContent: 'flex-end',
  },
  messageRowVisitor: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#6B7280',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  bubbleOwner: {
    borderBottomRightRadius: 2,
  },
  bubbleVisitor: {
    borderWidth: 1,
    borderBottomLeftRadius: 2,
  },
  senderLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  bubbleText: {
    fontSize: 13,
    lineHeight: 18,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: space.xl,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  quickRepliesWrap: {
    paddingVertical: space.xs,
  },
  quickChip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderTopWidth: 1,
    gap: space.xs,
  },
  textInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 14,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeDoneBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  closeDoneBtnText: {
    color: '#061A38',
    fontSize: 14,
    fontWeight: '700',
  },
});
