import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  mediaDevices,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  type MediaStream,
} from 'react-native-webrtc';
import { io, Socket } from 'socket.io-client';
import {
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import {
  fetchOwnerCallSignals,
  fetchOwnerRealtimeTicket,
  sendOwnerCallSignal,
} from '../services/connect-api';
import { resolveRealtimeSocketUrl } from '../services/connect-public';

const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

interface ChatItem {
  id: string;
  from: 'VISITOR' | 'OWNER';
  text: string;
  sentAt: string;
}

export function ConnectVoiceCall({
  callSessionId,
  onClose,
}: {
  callSessionId: string;
  onClose: () => void;
}) {
  const peer = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const cursor = useRef<string | undefined>(undefined);

  const [state, setState] = useState('Connecting securely…');
  const [isMuted, setIsMuted] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatItem[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [callDuration, setCallDuration] = useState(0);

  // Timer for connected duration
  useEffect(() => {
    if (!state.includes('Connected')) return;
    const interval = setInterval(() => setCallDuration(d => d + 1), 1000);
    return () => clearInterval(interval);
  }, [state]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    let active = true;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const cleanup = () => {
      active = false;
      if (pollTimer) clearInterval(pollTimer);
      localStream.current?.getTracks().forEach(t => t.stop());
      localStream.current = null;
      peer.current?.close();
      peer.current = null;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };

    const start = async () => {
      try {
        // 1. Initialize WebRTC
        let pc: RTCPeerConnection | null = null;
        try {
          pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          peer.current = pc;

          const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
          localStream.current = stream;
          stream.getTracks().forEach(track => pc?.addTrack(track, stream));

          pc.onicecandidate = (event: any) => {
            const candidate = event.candidate;
            if (candidate) {
              const payload = candidate.toJSON() as Record<string, unknown>;
              socketRef.current?.emit('webrtc:signal', { kind: 'ICE', payload });
              void sendOwnerCallSignal(callSessionId, 'ICE', payload);
            }
          };

          pc.onconnectionstatechange = () => {
            if (pc?.connectionState === 'connected') {
              setState('Connected · private audio');
            }
          };
        } catch (webrtcErr) {
          console.warn('[ConnectVoiceCall] WebRTC setup error:', webrtcErr);
        }

        // 2. Fetch realtime ticket & join Socket.IO room
        try {
          const ticketResp = await fetchOwnerRealtimeTicket(callSessionId);
          if (active && ticketResp.ticket) {
            const realtimeUrl = resolveRealtimeSocketUrl();
            const socket = io(realtimeUrl, {
              transports: ['websocket', 'polling'],
              auth: { ticket: ticketResp.ticket },
            });
            socketRef.current = socket;

            socket.on('webrtc:signal', async ({ message }: any) => {
              if (!message || !pc) return;
              try {
                if (message.kind === 'OFFER' && !(pc as any).currentRemoteDescription) {
                  await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
                  const answer = await pc.createAnswer();
                  await pc.setLocalDescription(answer);
                  const payload = answer.toJSON() as Record<string, unknown>;
                  socket.emit('webrtc:signal', { kind: 'ANSWER', payload });
                  void sendOwnerCallSignal(callSessionId, 'ANSWER', payload);
                } else if (message.kind === 'ICE' && message.payload) {
                  await pc.addIceCandidate(new RTCIceCandidate(message.payload));
                }
              } catch (e) {
                console.warn('[ConnectVoiceCall] Socket WebRTC signal error:', e);
              }
            });

            socket.on('chat:message', (item: any) => {
              setChatMessages(prev => [
                ...prev,
                {
                  id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  from: item.from || 'VISITOR',
                  text: item.message?.text || (typeof item.message === 'string' ? item.message : ''),
                  sentAt: item.sentAt || new Date().toISOString(),
                },
              ]);
            });

            socket.on('call:hangup', () => {
              if (active) onClose();
            });
          }
        } catch (ticketErr) {
          console.warn('[ConnectVoiceCall] Socket ticket error, using HTTP signal fallback:', ticketErr);
        }

        // 3. Fallback HTTP signal poller
        const poll = async () => {
          try {
            const response = await fetchOwnerCallSignals(callSessionId, cursor.current);
            for (const signal of response.items) {
              cursor.current = signal.createdAt;
              if (!pc) continue;
              if (signal.kind === 'OFFER' && !(pc as any).currentRemoteDescription) {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.payload as any));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await sendOwnerCallSignal(callSessionId, 'ANSWER', answer.toJSON() as Record<string, unknown>);
              } else if (signal.kind === 'ICE') {
                await pc.addIceCandidate(new RTCIceCandidate(signal.payload as any));
              } else if (signal.kind === 'HANGUP') {
                onClose();
              }
            }
          } catch {
            // Signal polling quiet fallback
          }
        };

        await poll();
        pollTimer = setInterval(() => {
          if (active) void poll();
        }, 1500);

        setState('Waiting for the caller…');
      } catch {
        setState('Microphone or secure call connection unavailable.');
      }
    };

    void start();
    return cleanup;
  }, [callSessionId, onClose]);

  const toggleMute = () => {
    if (!localStream.current) return;
    const nextMuted = !isMuted;
    localStream.current.getAudioTracks().forEach(t => {
      t.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  };

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    socketRef.current?.emit('chat:message', { text });
    setChatMessages(prev => [
      ...prev,
      {
        id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        from: 'OWNER',
        text,
        sentAt: new Date().toISOString(),
      },
    ]);
    setChatInput('');
  };

  const handleEndCall = () => {
    socketRef.current?.emit('call:hangup');
    void sendOwnerCallSignal(callSessionId, 'HANGUP', {});
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleEndCall}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.kicker}>V MOTIV CONNECT</Text>
              <Text style={styles.title}>Private Owner Call</Text>
            </View>
            <View style={styles.privacyBadge}>
              <ShieldCheck size={14} color="#10B981" />
              <Text style={styles.privacyText}>Number Masked</Text>
            </View>
          </View>

          <View style={styles.statusBox}>
            <Text style={styles.description}>{state}</Text>
            {state.includes('Connecting') || state.includes('Waiting') ? (
              <ActivityIndicator color="#F7B503" style={{ marginTop: 8 }} />
            ) : (
              <Text style={styles.timerText}>{formatTimer(callDuration)}</Text>
            )}
          </View>

          {/* Chat Expandable Section */}
          {chatOpen ? (
            <View style={styles.chatContainer}>
              <View style={styles.chatHeader}>
                <Text style={styles.chatTitle}>Live Chat with Caller</Text>
                <Pressable onPress={() => setChatOpen(false)} hitSlop={10}>
                  <X size={18} color="#C7D6EA" />
                </Pressable>
              </View>
              <FlatList
                data={chatMessages}
                keyExtractor={item => item.id}
                style={styles.chatList}
                contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
                renderItem={({ item }) => {
                  const isMe = item.from === 'OWNER';
                  return (
                    <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                      <Text style={styles.bubbleAuthor}>{isMe ? 'You' : 'Caller'}</Text>
                      <Text style={styles.bubbleText}>{item.text}</Text>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.chatEmpty}>No messages yet. Send a message below.</Text>
                }
              />
              <View style={styles.chatInputRow}>
                <TextInput
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder="Type a message…"
                  placeholderTextColor="#7C92AE"
                  style={styles.chatInput}
                  onSubmitEditing={sendChat}
                />
                <Pressable onPress={sendChat} disabled={!chatInput.trim()} style={styles.sendBtn}>
                  <Send size={16} color="#061A38" />
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Action buttons row */}
          <View style={styles.controlsRow}>
            <Pressable
              onPress={toggleMute}
              style={[styles.circleBtn, isMuted && styles.circleBtnActive]}
            >
              {isMuted ? <MicOff size={22} color="#FFFFFF" /> : <Mic size={22} color="#FFFFFF" />}
              <Text style={styles.circleBtnLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
            </Pressable>

            <Pressable
              onPress={() => setChatOpen(prev => !prev)}
              style={[styles.circleBtn, chatOpen && styles.circleBtnActive]}
            >
              <MessageSquare size={22} color="#FFFFFF" />
              <Text style={styles.circleBtnLabel}>
                Chat{chatMessages.length > 0 ? ` (${chatMessages.length})` : ''}
              </Text>
            </Pressable>

            <Pressable onPress={handleEndCall} style={styles.endBtn}>
              <PhoneOff color="#FFFFFF" size={24} />
              <Text style={styles.endText}>End Call</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(2,11,24,0.85)' },
  card: { alignItems: 'center', gap: 16, borderRadius: 24, padding: 24, backgroundColor: '#0B2342', borderWidth: 1, borderColor: '#1F3C64', width: '100%', maxWidth: 460, alignSelf: 'center' },
  headerRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: '#F7B503', fontWeight: '800', letterSpacing: 1, fontSize: 11 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  privacyBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  privacyText: { color: '#10B981', fontSize: 11, fontWeight: '700' },
  statusBox: { alignItems: 'center', marginVertical: 6 },
  description: { color: '#C7D6EA', textAlign: 'center', fontSize: 14, lineHeight: 20 },
  timerText: { color: '#F7B503', fontSize: 20, fontWeight: '800', marginTop: 6, letterSpacing: 1 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8, width: '100%', justifyContent: 'center' },
  circleBtn: { alignItems: 'center', justifyContent: 'center', width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.12)', gap: 4 },
  circleBtnActive: { backgroundColor: '#F7B503' },
  circleBtnLabel: { color: '#C7D6EA', fontSize: 11, fontWeight: '600' },
  endBtn: { minWidth: 130, height: 68, paddingHorizontal: 20, borderRadius: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#DE3E49' },
  endText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  chatContainer: { width: '100%', height: 260, backgroundColor: '#061A38', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#1F3C64' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1F3C64', paddingBottom: 8 },
  chatTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  chatList: { flex: 1 },
  chatEmpty: { color: '#7C92AE', fontSize: 12, textAlign: 'center', marginTop: 30 },
  bubble: { maxWidth: '82%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#F7B503' },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: '#1F3C64' },
  bubbleAuthor: { fontSize: 10, fontWeight: '700', marginBottom: 2, color: '#061A38' },
  bubbleText: { fontSize: 13, color: '#061A38' },
  chatInputRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  chatInput: { flex: 1, height: 40, backgroundColor: '#0B2342', borderRadius: 20, paddingHorizontal: 14, color: '#FFFFFF', fontSize: 13, borderWidth: 1, borderColor: '#1F3C64' },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F7B503', alignItems: 'center', justifyContent: 'center' },
});
