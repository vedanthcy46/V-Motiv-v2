import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Keyboard,
  Linking,
  Modal,
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
  Phone,
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
import { candidatePayload, descriptionPayload } from '../services/webrtc-payload';
import { checkMicrophone, ensureMicrophone, ensureMicrophoneGranted } from '../services/mic-permission';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatMessagesFromSignals, mergeChatMessages, type ChatMessage } from '../services/connect-chat';
import { KeyboardAvoider } from './KeyboardAvoider';

const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

type ChatItem = ChatMessage;

const ensureMicrophonePermission = ensureMicrophoneGranted;

export function ConnectVoiceCall({
  callSessionId,
  onClose,
}: {
  callSessionId: string;
  onClose: () => void;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const insets = useSafeAreaInsets();

  const peer = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const cursor = useRef<string | undefined>(undefined);
  const answeredOffer = useRef(false);

  const [state, setState] = useState('Connecting securely…');
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [speakerphoneOn, setSpeakerphoneOn] = useState(false);
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

  // Keep the in-call message composer fully visible as the keyboard animates
  // in. The outer ScrollView carries the complete call card, so it must move
  // instead of leaving the nested message list underneath the keyboard.
  useEffect(() => {
    if (!chatOpen) return;
    const eventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const listener = Keyboard.addListener(eventName, () => {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    });
    return () => listener.remove();
  }, [chatOpen]);

  useEffect(() => {
    if (!chatOpen) return;
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [chatMessages.length, chatOpen]);

  /**
   * Open the microphone and start sending it on the call that is already running. The answer was sent with a send-and-receive
   * audio line (see the OFFER handling below), so swapping the track in needs no new negotiation.
   */
  const attachMicrophone = async (): Promise<boolean> => {
    const pc = peer.current;
    if (!pc || localStream.current) return Boolean(localStream.current);
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      const track = stream.getAudioTracks()[0];
      if (!track) return false;
      const audioTransceiver = pc.getTransceivers?.().find((item: any) => item.receiver?.track?.kind === 'audio');
      if (audioTransceiver?.sender) await audioTransceiver.sender.replaceTrack(track);
      else pc.addTrack(track, stream);
      localStream.current = stream;
      setMicPermissionDenied(false);
      setState(pc.connectionState === 'connected' ? 'Connected · private audio' : 'Waiting for the caller…');
      return true;
    } catch (e) {
      console.warn('[ConnectVoiceCall] Could not open the microphone:', e);
      return false;
    }
  };

  // The person may allow the microphone in Settings and come back: pick it up without asking again.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async nextState => {
      if (nextState === 'active' && !localStream.current && peer.current && (await checkMicrophone())) {
        await attachMicrophone();
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
    // If the caller's connection drops without a hang-up (app closed, signal lost), end the call after a short grace period so the
    // owner is not left on a call nobody is on. A caller who reconnects within the grace period keeps the call.
    let callerLeftTimer: ReturnType<typeof setTimeout> | undefined;
    // Likewise if the audio connection itself drops and does not recover.
    let connectionLostTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      active = false;
      if (pollTimer) clearInterval(pollTimer);
      if (callerLeftTimer) clearTimeout(callerLeftTimer);
      if (connectionLostTimer) clearTimeout(connectionLostTimer);
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
        // Earpiece first; the speaker button switches to the loudspeaker.
        startConnectCallAudio(false);
        setSpeakerphoneOn(false);
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
            const payload = candidatePayload(candidate);
            socketRef.current?.emit('webrtc:signal', { kind: 'ICE', payload });
            void sendOwnerCallSignal(callSessionId, 'ICE', payload).catch(() => undefined);
          }
        };

        const hasMic = await ensureMicrophonePermission();

        pc.onconnectionstatechange = () => {
          if (!active) return; // this call has already been closed
          const connection = pc?.connectionState;
          if (connection === 'connected') {
            if (connectionLostTimer) { clearTimeout(connectionLostTimer); connectionLostTimer = undefined; }
            setState(hasMic ? 'Connected · private audio' : 'Connected · Hearing caller (Chat to reply)');
          } else if (connection === 'failed' || connection === 'closed') {
            onCloseRef.current?.();
          } else if (connection === 'disconnected' && !connectionLostTimer) {
            // Often a brief blip that recovers by itself, so wait a few seconds before giving up.
            connectionLostTimer = setTimeout(() => {
              connectionLostTimer = undefined;
              if (active && pc?.connectionState !== 'connected') onCloseRef.current?.();
            }, 8_000);
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
              // Without a microphone yet, still answer as send-and-receive so it can be switched on mid-call, without renegotiating.
              if (!localStream.current) {
                try {
                  const audioTransceiver = pc.getTransceivers?.().find((item: any) => item.receiver?.track?.kind === 'audio');
                  if (audioTransceiver) (audioTransceiver as any).direction = 'sendrecv';
                } catch { /* older engines: the answer stays receive-only until the next call */ }
              }
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              const answerPayload = descriptionPayload(pc.localDescription as any);
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
              const text = item?.message?.text || (typeof item?.message === 'string' ? item.message : '');
              if (!text) return;
              setChatMessages(prev => mergeChatMessages(prev, [{ id: `sock_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, from: item.from === 'OWNER' ? 'OWNER' : 'VISITOR', text: String(text), sentAt: item.sentAt || new Date().toISOString(), local: true }]));
            });

            socket.on('call:hangup', () => {
              if (active) onCloseRef.current?.();
            });

            socket.on('peer:left', ({ from }: any) => {
              if (from !== 'VISITOR' || callerLeftTimer) return;
              callerLeftTimer = setTimeout(() => {
                if (active) onCloseRef.current?.();
              }, 10_000);
            });

            socket.on('peer:joined', ({ from }: any) => {
              if (from !== 'VISITOR' || !callerLeftTimer) return;
              clearTimeout(callerLeftTimer);
              callerLeftTimer = undefined;
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
            // Chat is always read from the saved messages (the socket may be down); merged so nothing doubles or vanishes.
            const saved = chatMessagesFromSignals(response.items);
            if (saved.length) setChatMessages(prev => mergeChatMessages(prev, saved));
            for (const signal of response.items) {
              cursor.current = signal.createdAt;
              if (!pc || signal.senderRole === 'OWNER' || signal.kind === 'CHAT') continue;
              if (signal.kind === 'HANGUP' || signal.kind === 'CLOSE') {
                if (active) onCloseRef.current?.();
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
    const localId = `out_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setChatMessages(prev => mergeChatMessages(prev, [{ id: localId, from: 'OWNER', text, sentAt: new Date().toISOString(), local: true }]));
    setChatInput('');
    // Instant copy over the socket, plus the saved copy the caller's phone reads.
    if (socketRef.current?.connected) socketRef.current.emit('chat:message', { text });
    sendOwnerCallSignal(callSessionId, 'CHAT', { text }).catch(() => {
      setChatMessages(prev => prev.filter(item => item.id !== localId));
      setChatInput(current => current || text);
      Alert.alert('Message not sent', 'Check your connection and try again.');
    });
  };

  const handleEndCall = () => {
    socketRef.current?.emit('call:hangup');
    void sendOwnerCallSignal(callSessionId, 'HANGUP', {});
    onClose();
  };

  const connected = state.includes('Connected');
  const ringing = state.includes('Connecting') || state.includes('Waiting');

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={handleEndCall}>
      <KeyboardAvoider style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]} keyboardVerticalOffset={0}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.kicker}>V MOTIV CONNECT</Text>
            <Text style={styles.title}>Private call</Text>
          </View>
          <View style={styles.privacyBadge}>
            <ShieldCheck size={14} color="#10B981" />
            <Text style={styles.privacyText}>Number hidden</Text>
          </View>
        </View>

        {chatOpen ? (
          <View style={styles.chatPanel}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatTitle}>Chat with caller{connected ? `  ·  ${formatTimer(callDuration)}` : ''}</Text>
              <Pressable onPress={() => setChatOpen(false)} hitSlop={10} accessibilityLabel="Close chat"><X size={20} color="#C7D6EA" /></Pressable>
            </View>
            <ScrollView ref={scrollRef} style={styles.chatScroll} contentContainerStyle={styles.chatMessages} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {chatMessages.length === 0 ? (
                <Text style={styles.chatEmpty}>No messages yet. You can talk and type at the same time.</Text>
              ) : chatMessages.map(item => {
                const isMe = item.from === 'OWNER';
                return (
                  <View key={item.id} style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                    <Text style={styles.bubbleAuthor}>{isMe ? 'You' : 'Caller'}</Text>
                    <Text style={[styles.bubbleText, !isMe && { color: '#FFFFFF' }]}>{item.text}</Text>
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.chatInputRow}>
              <TextInput value={chatInput} onChangeText={setChatInput} placeholder="Type a message…" placeholderTextColor="#7C92AE" style={styles.chatInput} returnKeyType="send" onSubmitEditing={sendChat} />
              <Pressable onPress={sendChat} disabled={!chatInput.trim()} accessibilityLabel="Send message" style={[styles.sendBtn, !chatInput.trim() && { opacity: 0.5 }]}><Send size={18} color="#061A38" /></Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.middle}>
            <View style={[styles.avatarRing, connected && styles.avatarRingLive]}>
              <View style={styles.avatar}><Phone size={44} color="#F7B503" /></View>
            </View>
            <Text style={styles.callerName}>Vehicle passer-by</Text>
            {micPermissionDenied ? (
              <View style={styles.micDeniedBox}>
                <Text style={styles.micDeniedNotice}>Microphone access needed for two-way voice.</Text>
                <Text style={styles.micDeniedSub}>You can hear the caller live. Allow the microphone, or reply with Chat.</Text>
                <Pressable
                  onPress={async () => {
                    const access = await ensureMicrophone();
                    if (access === 'granted') {
                      if (!(await attachMicrophone())) { setMicPermissionDenied(false); setState('Microphone could not be started. Use Chat to reply.'); }
                    } else if (access === 'blocked') {
                      void Linking.openSettings();
                    }
                  }}
                  style={styles.enableMicBtn}
                >
                  <Mic size={16} color="#061A38" />
                  <Text style={styles.enableMicBtnText}>Enable microphone</Text>
                </Pressable>
              </View>
            ) : (
              <>
                {connected ? <Text style={styles.timerText}>{formatTimer(callDuration)}</Text> : null}
                <Text style={styles.description}>{state}</Text>
                {ringing ? <ActivityIndicator color="#F7B503" style={{ marginTop: 10 }} /> : null}
              </>
            )}
          </View>
        )}

        <View style={styles.controlsRow}>
          <Pressable onPress={toggleMute} accessibilityRole="button" accessibilityLabel={isMuted ? 'Unmute microphone' : 'Mute microphone'} accessibilityState={{ selected: isMuted }} style={styles.controlItem}>
            <View style={[styles.circleBtn, isMuted && styles.circleBtnActive]}>{isMuted ? <MicOff size={24} color="#061A38" /> : <Mic size={24} color="#FFFFFF" />}</View>
            <Text style={styles.circleBtnLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
          </Pressable>
          <Pressable onPress={toggleSpeakerphone} accessibilityRole="button" accessibilityLabel={speakerphoneOn ? 'Switch to earpiece' : 'Switch to speaker'} accessibilityState={{ selected: speakerphoneOn }} style={styles.controlItem}>
            <View style={[styles.circleBtn, speakerphoneOn && styles.circleBtnActive]}>{speakerphoneOn ? <Volume2 size={24} color="#061A38" /> : <Phone size={24} color="#FFFFFF" />}</View>
            <Text style={styles.circleBtnLabel}>{speakerphoneOn ? 'Speaker' : 'Earpiece'}</Text>
          </Pressable>
          <Pressable onPress={() => setChatOpen(prev => !prev)} accessibilityRole="button" accessibilityLabel="Chat" accessibilityState={{ selected: chatOpen }} style={styles.controlItem}>
            <View style={[styles.circleBtn, chatOpen && styles.circleBtnActive]}>
              <MessageSquare size={24} color={chatOpen ? '#061A38' : '#FFFFFF'} />
              {!chatOpen && chatMessages.length > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{chatMessages.length > 9 ? '9+' : chatMessages.length}</Text></View> : null}
            </View>
            <Text style={styles.circleBtnLabel}>Chat</Text>
          </Pressable>
        </View>
        <Pressable onPress={handleEndCall} accessibilityRole="button" accessibilityLabel="End call" style={styles.endBtn}>
          <PhoneOff color="#FFFFFF" size={24} />
          <Text style={styles.endText}>End call</Text>
        </Pressable>
      </KeyboardAvoider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#061A38', paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: '#F7B503', fontWeight: '800', letterSpacing: 1, fontSize: 11 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  privacyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  privacyText: { color: '#10B981', fontSize: 11, fontWeight: '700' },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  avatarRing: { width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: 'rgba(247,181,3,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarRingLive: { borderColor: '#10B981' },
  avatar: { width: 116, height: 116, borderRadius: 58, backgroundColor: 'rgba(247,181,3,0.14)', alignItems: 'center', justifyContent: 'center' },
  callerName: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  timerText: { color: '#F7B503', fontSize: 30, fontWeight: '800', letterSpacing: 1.5, marginTop: 2 },
  description: { color: '#C7D6EA', textAlign: 'center', fontSize: 15, lineHeight: 21, paddingHorizontal: 16 },
  micDeniedBox: { alignItems: 'center', marginTop: 8, paddingHorizontal: 12, gap: 8 },
  micDeniedNotice: { color: '#F7B503', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  micDeniedSub: { color: '#C7D6EA', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  enableMicBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F7B503', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22, marginTop: 4 },
  enableMicBtnText: { color: '#061A38', fontSize: 14, fontWeight: '800' },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start', marginTop: 14, marginBottom: 18 },
  controlItem: { alignItems: 'center', gap: 6, minWidth: 80 },
  circleBtn: { alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.14)' },
  circleBtnActive: { backgroundColor: '#F7B503' },
  circleBtnLabel: { color: '#C7D6EA', fontSize: 12, fontWeight: '600' },
  badge: { position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  endBtn: { height: 60, borderRadius: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#DE3E49' },
  endText: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },
  chatPanel: { flex: 1, marginTop: 14, backgroundColor: '#0B2342', borderRadius: 18, padding: 12, borderWidth: 1, borderColor: '#1F3C64' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1F3C64', paddingBottom: 8 },
  chatTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  chatScroll: { flex: 1 },
  chatMessages: { gap: 8, paddingVertical: 10, flexGrow: 1 },
  chatEmpty: { color: '#7C92AE', fontSize: 13, textAlign: 'center', marginVertical: 24 },
  bubble: { maxWidth: '82%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#F7B503' },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: '#1F3C64' },
  bubbleAuthor: { fontSize: 10, fontWeight: '700', marginBottom: 2, color: '#7C92AE' },
  bubbleText: { fontSize: 14, color: '#061A38' },
  chatInputRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  chatInput: { flex: 1, height: 44, backgroundColor: '#061A38', borderRadius: 22, paddingHorizontal: 16, color: '#FFFFFF', fontSize: 14, borderWidth: 1, borderColor: '#1F3C64' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F7B503', alignItems: 'center', justifyContent: 'center' },
});
