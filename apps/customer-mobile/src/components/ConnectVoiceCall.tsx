import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
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
  Volume2,
  VolumeX,
  X,
} from 'lucide-react-native';
import {
  fetchOwnerCallSignals,
  fetchOwnerRealtimeTicket,
  sendOwnerCallSignal,
} from '../services/connect-api';
import { resolveRealtimeSocketUrl } from '../services/connect-public';
import {
  setConnectCallSpeakerphone,
  startConnectCallAudio,
  stopConnectCallAudio,
} from '../services/call-audio';

const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

interface ChatItem {
  id: string;
  from: 'VISITOR' | 'OWNER';
  text: string;
  sentAt: string;
}

async function ensureMicrophonePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const check = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (check) return true;
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (e) {
      console.warn('[ConnectVoiceCall] Permission check error:', e);
      return false;
    }
  }
  return true;
}

export function ConnectVoiceCall({
  callSessionId,
  onClose,
}: {
  callSessionId: string;
  onClose: () => void;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const peer = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const cursor = useRef<string | undefined>(undefined);
  const answeredOffer = useRef(false);

  const [state, setState] = useState('Connecting securely…');
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [speakerphoneOn, setSpeakerphoneOn] = useState(true);
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

  // Listen for AppState changes (e.g. user toggles microphone permission in Settings and returns)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async nextState => {
      if (nextState === 'active' && !localStream.current && peer.current) {
        const hasMic = await ensureMicrophonePermission();
        if (hasMic) {
          try {
            const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
            localStream.current = stream;
            stream.getTracks().forEach(track => peer.current?.addTrack(track, stream));
            setMicPermissionDenied(false);
            setState(peer.current.connectionState === 'connected' ? 'Connected · private audio' : 'Waiting for the caller…');
          } catch (e) {
            console.warn('[ConnectVoiceCall] Re-acquiring mic error:', e);
          }
        }
      }
    });
    return () => subscription.remove();
  }, []);

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
      answeredOffer.current = false;
      stopConnectCallAudio();
    };

    const start = async () => {
      try {
        startConnectCallAudio(true);
        setSpeakerphoneOn(true);
        // 1. Initialize WebRTC peer connection
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peer.current = pc;

        const pendingIceCandidates: any[] = [];
        const flushPendingIce = async () => {
          while (pendingIceCandidates.length > 0) {
            const cand = pendingIceCandidates.shift();
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch {
              // Stale or duplicate candidate
            }
          }
        };

        pc.onicecandidate = (event: any) => {
          const candidate = event.candidate;
          if (candidate) {
            const payload = candidate.toJSON() as Record<string, unknown>;
            socketRef.current?.emit('webrtc:signal', { kind: 'ICE', payload });
            void sendOwnerCallSignal(callSessionId, 'ICE', payload).catch(() => undefined);
          }
        };

        const hasMic = await ensureMicrophonePermission();

        pc.onconnectionstatechange = () => {
          if (pc?.connectionState === 'connected') {
            setState(hasMic ? 'Connected · private audio' : 'Connected · Hearing caller (Chat to reply)');
          }
        };

        pc.oniceconnectionstatechange = () => {
          if (pc?.iceConnectionState === 'connected' || pc?.iceConnectionState === 'completed') {
            setState(hasMic ? 'Connected · private audio' : 'Connected · Hearing caller (Chat to reply)');
          }
        };

        // 2. Request and attach microphone audio stream
        if (hasMic) {
          setMicPermissionDenied(false);
          try {
            const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
            if (active) {
              localStream.current = stream;
              stream.getTracks().forEach(track => pc?.addTrack(track, stream));
            } else {
              stream.getTracks().forEach(t => t.stop());
            }
          } catch (micErr) {
            console.warn('[ConnectVoiceCall] Mic getUserMedia error:', micErr);
          }
        } else {
          setMicPermissionDenied(true);
          setChatOpen(true);
          setState('Listen & Chat Mode · Visitor audio active');
        }

        const handleSignal = async (kind: string, payload: any) => {
          if (!pc || !payload) return;
          try {
            if (kind === 'OFFER' && !answeredOffer.current) {
              setState('Answering caller…');
              await pc.setRemoteDescription(new RTCSessionDescription(payload));
              await flushPendingIce();
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              const answerPayload = (pc.localDescription as any)?.toJSON?.()
                || { type: pc.localDescription?.type, sdp: pc.localDescription?.sdp };
              socketRef.current?.emit('webrtc:signal', { kind: 'ANSWER', payload: answerPayload });
              // Await the durable write. If the realtime socket is unavailable
              // on serverless hosting, this is the caller's only answer path.
              await sendOwnerCallSignal(callSessionId, 'ANSWER', answerPayload);
              answeredOffer.current = true;
            } else if (kind === 'ANSWER' && !(pc as any).remoteDescription) {
              await pc.setRemoteDescription(new RTCSessionDescription(payload));
              await flushPendingIce();
            } else if (kind === 'ICE' && payload) {
              if ((pc as any).remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(payload)).catch(() => undefined);
              } else {
                pendingIceCandidates.push(payload);
              }
            }
          } catch (e) {
            console.warn('[ConnectVoiceCall] Signal process error:', e);
            if (kind === 'OFFER') {
              setState('Could not answer the caller. Please end the call and try again.');
            }
          }
        };

        // 3. Fetch realtime ticket & join Socket.IO room
        try {
          const ticketResp = await fetchOwnerRealtimeTicket(callSessionId);
          if (active && ticketResp.ticket) {
            const realtimeUrl = resolveRealtimeSocketUrl();
            const socket = io(realtimeUrl, {
              transports: ['websocket', 'polling'],
              auth: { ticket: ticketResp.ticket },
            });
            socketRef.current = socket;

            socket.on('connect', () => {
              // Immediately announce presence to trigger caller to send OFFER
              socket.emit('call:ready');
            });

            socket.on('webrtc:signal', async ({ message }: any) => {
              if (!message) return;
              await handleSignal(message.kind, message.payload);
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
              if (active) onCloseRef.current?.();
            });
          }
        } catch (ticketErr) {
          console.warn('[ConnectVoiceCall] Socket ticket error, using HTTP signal fallback:', ticketErr);
        }

        // 4. Fallback HTTP signal poller
        const poll = async () => {
          try {
            const response = await fetchOwnerCallSignals(callSessionId, cursor.current);
            if (response.status === 'CLOSED') {
              if (active) onCloseRef.current?.();
              return;
            }
            for (const signal of response.items) {
              cursor.current = signal.createdAt;
              if (!pc || signal.senderRole === 'OWNER') continue;
              if (signal.kind === 'HANGUP' || signal.kind === 'CLOSE') {
                if (active) onCloseRef.current?.();
              } else if (signal.kind === 'CHAT' && signal.payload) {
                const text = typeof (signal.payload as any).text === 'string' ? (signal.payload as any).text : '';
                if (text) {
                  setChatMessages(prev => {
                    if (prev.some(m => m.text === text && Math.abs(new Date(m.sentAt).getTime() - new Date(signal.createdAt).getTime()) < 2000)) {
                      return prev;
                    }
                    return [
                      ...prev,
                      {
                        id: signal.id,
                        from: 'VISITOR',
                        text,
                        sentAt: signal.createdAt,
                      },
                    ];
                  });
                }
              } else {
                await handleSignal(signal.kind, signal.payload);
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

        // The visitor is always the WebRTC offerer. The owner only answers;
        // generating an owner offer here creates glare and leaves callers
        // that correctly expect an ANSWER stuck in a waiting state.
        setState('Waiting for the caller…');
      } catch (err) {
        console.warn('[ConnectVoiceCall] Start error:', err);
        setState('Microphone or secure call connection unavailable.');
      }
    };

    void start();
    return cleanup;
  }, [callSessionId]);

  const toggleMute = () => {
    if (!localStream.current) return;
    const nextMuted = !isMuted;
    localStream.current.getAudioTracks().forEach(t => {
      t.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  };

  const toggleSpeakerphone = () => {
    const nextSpeakerphoneOn = !speakerphoneOn;
    setConnectCallSpeakerphone(nextSpeakerphoneOn);
    setSpeakerphoneOn(nextSpeakerphoneOn);
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
        <ScrollView
          contentContainerStyle={styles.scrollRoot}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
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
              {micPermissionDenied ? (
                <View style={styles.micDeniedBox}>
                  <Text style={styles.micDeniedNotice}>
                    Microphone access needed for two-way voice.
                  </Text>
                  <Text style={styles.micDeniedSub}>
                    You can hear the caller live. Tap below to enable microphone, or reply via Chat.
                  </Text>
                  <Pressable
                    onPress={async () => {
                      const granted = await ensureMicrophonePermission();
                      if (!granted) {
                        void Linking.openSettings();
                      }
                    }}
                    style={styles.enableMicBtn}
                  >
                    <Mic size={14} color="#061A38" />
                    <Text style={styles.enableMicBtnText}>Enable Microphone</Text>
                  </Pressable>
                </View>
              ) : state.includes('Connecting') || state.includes('Waiting') ? (
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
                accessibilityRole="button"
                accessibilityLabel={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                accessibilityState={{ selected: isMuted }}
                style={[styles.circleBtn, isMuted && styles.circleBtnActive]}
              >
                {isMuted ? <MicOff size={20} color="#FFFFFF" /> : <Mic size={20} color="#FFFFFF" />}
                <Text style={styles.circleBtnLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
              </Pressable>

              <Pressable
                onPress={toggleSpeakerphone}
                accessibilityRole="button"
                accessibilityLabel={speakerphoneOn ? 'Use earpiece' : 'Use speakerphone'}
                accessibilityState={{ selected: speakerphoneOn }}
                style={[styles.circleBtn, speakerphoneOn && styles.circleBtnActive]}
              >
                {speakerphoneOn ? <Volume2 size={20} color="#061A38" /> : <VolumeX size={20} color="#FFFFFF" />}
                <Text style={[styles.circleBtnLabel, speakerphoneOn && { color: '#061A38' }]}>
                  {speakerphoneOn ? 'Speaker' : 'Earpiece'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setChatOpen(prev => !prev)}
                style={[styles.circleBtn, chatOpen && styles.circleBtnActive]}
              >
                <MessageSquare size={20} color="#FFFFFF" />
                <Text style={styles.circleBtnLabel}>
                  Chat{chatMessages.length > 0 ? ` (${chatMessages.length})` : ''}
                </Text>
              </Pressable>

              <Pressable onPress={handleEndCall} style={styles.endBtn}>
                <PhoneOff color="#FFFFFF" size={20} />
                <Text style={styles.endText}>End Call</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(2,11,24,0.85)' },
  scrollRoot: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { alignItems: 'center', gap: 12, borderRadius: 20, padding: 18, backgroundColor: '#0B2342', borderWidth: 1, borderColor: '#1F3C64', width: '100%', maxWidth: 400, maxHeight: '90%' },
  headerRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: '#F7B503', fontWeight: '800', letterSpacing: 1, fontSize: 10 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  privacyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  privacyText: { color: '#10B981', fontSize: 11, fontWeight: '700' },
  statusBox: { alignItems: 'center', marginVertical: 4 },
  micDeniedBox: { alignItems: 'center', marginTop: 6, paddingHorizontal: 8, gap: 6 },
  micDeniedNotice: { color: '#F7B503', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  micDeniedSub: { color: '#C7D6EA', fontSize: 11, textAlign: 'center', lineHeight: 15 },
  enableMicBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F7B503', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginTop: 4 },
  enableMicBtnText: { color: '#061A38', fontSize: 11, fontWeight: '800' },
  description: { color: '#C7D6EA', textAlign: 'center', fontSize: 13, lineHeight: 18 },
  timerText: { color: '#F7B503', fontSize: 18, fontWeight: '800', marginTop: 4, letterSpacing: 1 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, width: '100%', justifyContent: 'center' },
  circleBtn: { alignItems: 'center', justifyContent: 'center', width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.12)', gap: 2 },
  circleBtnActive: { backgroundColor: '#F7B503' },
  circleBtnLabel: { color: '#C7D6EA', fontSize: 10, fontWeight: '600' },
  endBtn: { flex: 1, minWidth: 100, height: 54, paddingHorizontal: 14, borderRadius: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#DE3E49' },
  endText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  chatContainer: { width: '100%', height: 200, backgroundColor: '#061A38', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: '#1F3C64' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1F3C64', paddingBottom: 6 },
  chatTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  chatList: { flex: 1 },
  chatEmpty: { color: '#7C92AE', fontSize: 11, textAlign: 'center', marginTop: 24 },
  bubble: { maxWidth: '82%', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#F7B503' },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: '#1F3C64' },
  bubbleAuthor: { fontSize: 9, fontWeight: '700', marginBottom: 2, color: '#061A38' },
  bubbleText: { fontSize: 12, color: '#061A38' },
  chatInputRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  chatInput: { flex: 1, height: 36, backgroundColor: '#0B2342', borderRadius: 18, paddingHorizontal: 12, color: '#FFFFFF', fontSize: 12, borderWidth: 1, borderColor: '#1F3C64' },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F7B503', alignItems: 'center', justifyContent: 'center' },
});
