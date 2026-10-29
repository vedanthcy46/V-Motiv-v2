import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Car,
  ChevronDown,
  ChevronUp,
  Image as LucideImage,
  Lightbulb,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneOff,
  Send,
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  mediaDevices,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  type MediaStream,
} from 'react-native-webrtc';
import { io, Socket } from 'socket.io-client';
import { ConnectQrScannerModal } from '../components/ConnectQrScannerModal';
import {
  fetchPublicCallSignals,
  fetchPublicRealtimeTicket,
  getConnectWebUrl,
  lookupPublicConnectVehicle,
  parseConnectQr,
  requestPublicConnectCall,
  resolveRealtimeSocketUrl,
  sendPublicCallSignal,
  sendPublicConnectAlert,
  type PublicConnectVehicle,
} from '../services/connect-public';
import {
  setConnectCallSpeakerphone,
  startConnectCallAudio,
  stopConnectCallAudio,
} from '../services/call-audio';
import { radius, space, useAppTheme } from '../theme';

const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

const REASONS = [
  { key: 'BLOCKING_ACCESS', label: 'Vehicle is blocking access', Icon: Car },
  { key: 'LIGHTS_ON', label: 'Lights are left on', Icon: Lightbulb },
  { key: 'DAMAGE_OR_ACCIDENT', label: 'Vehicle damage or accident', Icon: AlertTriangle },
  { key: 'SAFETY_CONCERN', label: 'Safety concern / needs attention', Icon: ShieldCheck },
  { key: 'OTHER', label: 'Other concern', Icon: MessageSquare },
] as const;

interface AttachedPhoto {
  id: string;
  uri: string;
  base64?: string;
}

interface ChatMessage {
  id: string;
  from: 'VISITOR' | 'OWNER';
  text: string;
  sentAt: string;
}

type SessionPhase = 'READY' | 'STARTING' | 'CALLING' | 'CONNECTED' | 'ERROR';
type SessionMode = 'VOICE' | 'CHAT';

export function ConnectGuestScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useAppTheme();

  // Sticker & Vehicle state
  const [scannerVisible, setScannerVisible] = useState(!route.params?.token);
  const [token, setToken] = useState<string | null>(route.params?.token || null);
  const [vehicle, setVehicle] = useState<PublicConnectVehicle | null>(null);
  const [loading, setLoading] = useState(false);

  // Realtime Call/Chat Session state
  const [phase, setPhase] = useState<SessionPhase>('READY');
  const [sessionMode, setSessionMode] = useState<SessionMode>('VOICE');
  const [activeCallSessionId, setActiveCallSessionId] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [speakerphoneOn, setSpeakerphoneOn] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Quick Preset Alert state (expandable)
  const [quickAlertOpen, setQuickAlertOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]['key']>('BLOCKING_ACCESS');
  const [alertMessage, setAlertMessage] = useState('');
  const [photos, setPhotos] = useState<AttachedPhoto[]>([]);
  const [sendingAlert, setSendingAlert] = useState(false);

  // References for WebRTC and Socket
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const signalCursor = useRef<string | undefined>(undefined);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatScrollRef = useRef<FlatList | null>(null);

  // Call timer
  useEffect(() => {
    if (phase !== 'CONNECTED' || sessionMode !== 'VOICE') return;
    const interval = setInterval(() => setCallDuration(d => d + 1), 1000);
    return () => clearInterval(interval);
  }, [phase, sessionMode]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const resolveToken = useCallback((value: string) => {
    const parsed = parseConnectQr(value);
    setScannerVisible(false);
    if (!parsed) {
      Alert.alert(
        'Not a V MOTIV Connect QR',
        'Scan an official V MOTIV Connect sticker or paste its full public link.',
      );
      return;
    }
    setToken(parsed.token);
  }, []);

  // Fetch Vehicle identity on token change
  useEffect(() => {
    if (!token) return;
    let mounted = true;
    setLoading(true);
    setVehicle(null);
    endSession();

    void lookupPublicConnectVehicle(token)
      .then(value => {
        if (mounted) setVehicle(value);
      })
      .catch((error: Error) => {
        if (!mounted) return;
        const webUrl = getConnectWebUrl(token);
        Alert.alert(
          'Could not open Connect in this app',
          error.message,
          webUrl
            ? [
                { text: 'Open secure web page', onPress: () => void Linking.openURL(webUrl) },
                { text: 'Close', style: 'cancel' },
              ]
            : [{ text: 'Close' }],
        );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  // Cleanup session on unmount
  useEffect(() => {
    return () => {
      endSession();
    };
  }, []);

  const endSession = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.emit('call:hangup');
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    setPhase('READY');
    setActiveCallSessionId(null);
    setCallDuration(0);
    setIsMuted(false);
    setSpeakerphoneOn(true);
    setSessionError(null);
    signalCursor.current = undefined;
    stopConnectCallAudio();
  }, []);

  // Start Realtime Session (either Voice Call or Private Chat)
  const startRealtimeSession = async (mode: SessionMode) => {
    if (!token || !vehicle) return;
    setSessionMode(mode);
    setPhase('STARTING');
    setSessionError(null);
    setChatMessages([]);

    try {
      if (mode === 'VOICE') {
        startConnectCallAudio(true);
        setSpeakerphoneOn(true);
      }
      // 1. Request/create call session
      const call = await requestPublicConnectCall(token, mode);
      const sessionId = call.callSessionId;
      setActiveCallSessionId(sessionId);

      // 2. Fetch visitor realtime ticket for Socket.IO
      const ticketResp = await fetchPublicRealtimeTicket(token, sessionId);
      const realtimeTicket = ticketResp.ticket;

      // 3. Connect to Socket.IO room
      const realtimeUrl = resolveRealtimeSocketUrl();
      const socket = io(realtimeUrl, {
        transports: ['websocket', 'polling'],
        auth: { ticket: realtimeTicket },
      });
      socketRef.current = socket;

      const pendingGuestIce: any[] = [];
      const flushGuestIce = async () => {
        const pc = peerRef.current;
        if (!pc) return;
        while (pendingGuestIce.length > 0) {
          const cand = pendingGuestIce.shift();
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch {
            // Stale candidate
          }
        }
      };

      const resendGuestOffer = () => {
        const pc = peerRef.current;
        if (pc?.localDescription && pc.connectionState !== 'connected') {
          const payload = (pc.localDescription as any).toJSON?.() || { type: pc.localDescription.type, sdp: pc.localDescription.sdp };
          socket.emit('webrtc:signal', { kind: 'OFFER', payload });
          void sendPublicCallSignal(token, sessionId, 'OFFER', payload);
        }
      };

      socket.on('peer:joined', ({ from }: any) => {
        if (from === 'OWNER') resendGuestOffer();
      });

      socket.on('call:ready', () => {
        resendGuestOffer();
      });

      // Socket.IO event listeners
      socket.on('webrtc:signal', async ({ message }: any) => {
        if (!message) return;
        const pc = peerRef.current;
        if (!pc) return;
        try {
          if (message.kind === 'ANSWER' && !(pc as any).currentRemoteDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
            await flushGuestIce();
            setPhase('CONNECTED');
          } else if (message.kind === 'ICE' && message.payload) {
            if ((pc as any).currentRemoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(message.payload));
            } else {
              pendingGuestIce.push(message.payload);
            }
          }
        } catch (e) {
          console.warn('[ConnectGuest] Signal process error:', e);
        }
      });

      socket.on('chat:message', (item: any) => {
        setChatMessages(prev => [
          ...prev,
          {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            from: item.from || 'OWNER',
            text: item.message?.text || (typeof item.message === 'string' ? item.message : ''),
            sentAt: item.sentAt || new Date().toISOString(),
          },
        ]);
        setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
      });

      socket.on('call:hangup', () => {
        Alert.alert('Session Ended', 'The vehicle owner has ended the session.');
        endSession();
      });

      // 4. Initialize WebRTC if Voice Call is requested
      if (mode === 'VOICE') {
        setPhase('CALLING');
        try {
          if (Platform.OS === 'android') {
            const hasCheck = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
            if (!hasCheck) {
              const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
              if (res !== PermissionsAndroid.RESULTS.GRANTED) {
                throw new Error('MICROPHONE_PERMISSION_DENIED');
              }
            }
          }

          const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          peerRef.current = pc;

          const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
          localStreamRef.current = stream;
          stream.getTracks().forEach(track => pc.addTrack(track, stream));

          pc.onicecandidate = (event: any) => {
            const candidate = event.candidate;
            if (candidate) {
              const payload = candidate.toJSON() as Record<string, unknown>;
              socket.emit('webrtc:signal', { kind: 'ICE', payload });
              void sendPublicCallSignal(token, sessionId, 'ICE', payload);
            }
          };

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
              setPhase('CONNECTED');
            }
          };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          const payload = offer.toJSON() as Record<string, unknown>;
          socket.emit('webrtc:signal', { kind: 'OFFER', payload });
          // The owner must be able to read a durable offer even when the
          // realtime socket is unavailable (for example behind serverless).
          await sendPublicCallSignal(token, sessionId, 'OFFER', payload);
        } catch (webrtcErr: any) {
          console.warn('[ConnectGuest] WebRTC audio init warning:', webrtcErr?.message || webrtcErr);
          // If microphone is unavailable, keep session in chat mode
          setPhase('CONNECTED');
          setSessionMode('CHAT');
          Alert.alert(
            'Microphone Notice',
            'Could not access microphone. You can still message the owner directly in the private room.',
          );
        }
      } else {
        // Direct private chat mode
        setPhase('CONNECTED');
      }

      // 5. Fallback polling for HTTP signals
      pollTimerRef.current = setInterval(async () => {
        try {
          const response = await fetchPublicCallSignals(token, sessionId, signalCursor.current);
          for (const signal of response.items) {
            signalCursor.current = signal.createdAt;
            const pc = peerRef.current;
            if (signal.kind === 'ANSWER' && pc && !(pc as any).currentRemoteDescription) {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.payload as any));
              setPhase('CONNECTED');
            } else if (signal.kind === 'ICE' && pc) {
              await pc.addIceCandidate(new RTCIceCandidate(signal.payload as any));
            } else if (signal.kind === 'HANGUP') {
              Alert.alert('Session Ended', 'The vehicle owner has ended the call.');
              endSession();
            }
          }
        } catch {
          // Fallback poller quiet retry
        }
      }, 1500);
    } catch (err: any) {
      console.error('[ConnectGuest] Realtime start failed:', err);
      if (mode === 'VOICE') stopConnectCallAudio();
      setPhase('ERROR');
      setSessionError(err?.message || 'Could not start private session. Please try again.');
    }
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const nextMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach(t => {
      t.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  };

  const toggleSpeakerphone = () => {
    const nextSpeakerphoneOn = !speakerphoneOn;
    setConnectCallSpeakerphone(nextSpeakerphoneOn);
    setSpeakerphoneOn(nextSpeakerphoneOn);
  };

  const sendChatMessage = () => {
    const text = chatInput.trim();
    if (!text || !socketRef.current) return;
    socketRef.current.emit('chat:message', { text });
    setChatMessages(prev => [
      ...prev,
      {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        from: 'VISITOR',
        text,
        sentAt: new Date().toISOString(),
      },
    ]);
    setChatInput('');
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // Quick Preset Alert handler
  const sendAlert = async () => {
    if (!token || !vehicle) return;
    setSendingAlert(true);
    try {
      const photoPayloads = photos.map(p => p.base64 || p.uri).filter(Boolean);
      await sendPublicConnectAlert(
        token,
        reason,
        alertMessage.trim() || undefined,
        photoPayloads.length > 0 ? photoPayloads : undefined,
      );
      Alert.alert(
        'Owner alerted',
        `Your privacy-protected alert has been sent${photos.length ? ` with ${photos.length} photo${photos.length > 1 ? 's' : ''}` : ''}. The owner’s contact details were not shared.`,
      );
      setAlertMessage('');
      setPhotos([]);
      setQuickAlertOpen(false);
    } catch (error: any) {
      Alert.alert('Alert not sent', error?.message || 'Please try again in a moment.');
    } finally {
      setSendingAlert(false);
    }
  };

  // Photo handlers for quick alerts
  const handleTakePhoto = async () => {
    if (photos.length >= 3) {
      Alert.alert('Limit Reached', 'You can attach up to 3 photos per alert.');
      return;
    }
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera Permission Required', 'Please enable camera permissions in device settings.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.65,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset) {
          setPhotos(prev => [
            ...prev,
            {
              id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              uri: asset.uri,
              base64: asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : undefined,
            },
          ].slice(0, 3));
        }
      }
    } catch (err: any) {
      Alert.alert('Camera Error', err?.message || 'Unable to open camera.');
    }
  };

  const handlePickFromLibrary = async () => {
    if (photos.length >= 3) {
      Alert.alert('Limit Reached', 'You can attach up to 3 photos per alert.');
      return;
    }
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo Library Permission Required', 'Please enable photo library permissions in device settings.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 3 - photos.length,
        quality: 0.65,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newItems: AttachedPhoto[] = result.assets.map((asset, idx) => ({
          id: `p_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          uri: asset.uri,
          base64: asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : undefined,
        }));
        setPhotos(prev => [...prev, ...newItems].slice(0, 3));
      }
    } catch (err: any) {
      Alert.alert('Gallery Error', err?.message || 'Unable to open photo gallery.');
    }
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const isSessionActive = phase === 'STARTING' || phase === 'CALLING' || phase === 'CONNECTED';

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (isSessionActive) {
              Alert.alert('End Active Session?', 'Leaving will disconnect the private call/chat.', [
                { text: 'Stay', style: 'cancel' },
                { text: 'End & Leave', style: 'destructive', onPress: () => { endSession(); navigation.goBack(); } },
              ]);
            } else {
              navigation.goBack();
            }
          }}
          hitSlop={10}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <ArrowLeft size={22} color={theme.colors.textPrimary} />
        </Pressable>

        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>V MOTIV Connect</Text>
          <Text style={[styles.headerSub, { color: theme.colors.textSecondary }]}>
            Public, privacy-protected vehicle contact
          </Text>
        </View>

        {!isSessionActive && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan another QR code"
            onPress={() => setScannerVisible(true)}
            style={({ pressed }) => [
              styles.scanButton,
              { borderColor: theme.colors.brandAccent },
              pressed && styles.pressed,
            ]}
          >
            <Camera size={18} color={theme.colors.brandAccent} />
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 20) + 28 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* No token scanned */}
          {!token ? (
            <View style={[styles.empty, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Camera size={38} color={theme.colors.brandAccent} />
              <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>Scan a vehicle QR sticker</Text>
              <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                No sign-in is required. The vehicle owner’s personal phone number, address, and name stay completely private.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setScannerVisible(true)}
                style={({ pressed }) => [
                  styles.primary,
                  { backgroundColor: theme.colors.brandAccent },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.primaryText, { color: theme.colors.brandNavy }]}>Open scanner</Text>
              </Pressable>
            </View>
          ) : loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={theme.colors.brandAccent} />
              <Text style={{ color: theme.colors.textSecondary, marginTop: 12 }}>
                Looking up secure vehicle identity…
              </Text>
            </View>
          ) : vehicle ? (
            <>
              {/* Vehicle Identity Card */}
              <View style={[styles.vehicleCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <View style={[styles.vehicleIcon, { backgroundColor: isDark ? '#14253E' : '#F6F9FD' }]}>
                  <Car size={32} color={theme.colors.brandAccent} />
                </View>
                <Text style={[styles.vehicleName, { color: theme.colors.textPrimary }]}>{vehicle.nickname}</Text>
                <Text style={[styles.vehicleMeta, { color: theme.colors.textSecondary }]}>
                  {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' · ')}
                </Text>
                <View style={styles.privacyRow}>
                  <ShieldCheck size={16} color="#10B981" />
                  <Text style={styles.privacyText}>Owner & caller numbers remain fully private</Text>
                </View>
              </View>

              {/* ACTIVE REALTIME SESSION (Voice or Chat in progress) */}
              {isSessionActive ? (
                <View style={[styles.sessionCard, { backgroundColor: isDark ? '#0B2342' : '#F6F9FD', borderColor: theme.colors.border }]}>
                  {/* Session Header Status */}
                  <View style={styles.sessionStatusHeader}>
                    <Text style={styles.sessionKicker}>V MOTIV REALTIME SESSION</Text>
                    {phase === 'STARTING' && (
                      <View style={styles.statusRow}>
                        <ActivityIndicator color={theme.colors.brandAccent} size="small" />
                        <Text style={[styles.sessionStateText, { color: theme.colors.textSecondary }]}>
                          Connecting to secure room…
                        </Text>
                      </View>
                    )}
                    {phase === 'CALLING' && (
                      <View style={styles.callingBox}>
                        <View style={styles.pulsingIcon}>
                          <Phone size={28} color="#F7B503" />
                        </View>
                        <Text style={[styles.callingTitle, { color: theme.colors.textPrimary }]}>
                          Calling vehicle owner…
                        </Text>
                        <Text style={[styles.callingSub, { color: theme.colors.textSecondary }]}>
                          Waiting for the owner to pick up. Personal numbers are masked.
                        </Text>
                      </View>
                    )}
                    {phase === 'CONNECTED' && (
                      <View style={styles.connectedBox}>
                        {sessionMode === 'VOICE' ? (
                          <>
                            <Text style={styles.timerLarge}>{formatTimer(callDuration)}</Text>
                            <Text style={[styles.connectedSub, { color: '#10B981' }]}>
                              Connected · Private audio active
                            </Text>
                          </>
                        ) : (
                          <Text style={[styles.connectedSub, { color: '#10B981', fontSize: 14 }]}>
                            Connected to Owner · Live private chat
                          </Text>
                        )}
                      </View>
                    )}
                  </View>

                  {/* Voice Controls (when in Voice Call) */}
                  {sessionMode === 'VOICE' && (phase === 'CALLING' || phase === 'CONNECTED') && (
                    <View style={styles.voiceControlsRow}>
                      <Pressable
                        onPress={toggleMute}
                        accessibilityRole="button"
                        accessibilityLabel={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                        accessibilityState={{ selected: isMuted }}
                        style={[
                          styles.controlBtn,
                          { backgroundColor: isMuted ? '#F7B503' : 'rgba(255,255,255,0.12)' },
                        ]}
                      >
                        {isMuted ? <MicOff size={22} color="#061A38" /> : <Mic size={22} color="#FFFFFF" />}
                        <Text style={[styles.controlBtnLabel, { color: isMuted ? '#061A38' : '#C7D6EA' }]}>
                          {isMuted ? 'Unmute' : 'Mute'}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={toggleSpeakerphone}
                        accessibilityRole="button"
                        accessibilityLabel={speakerphoneOn ? 'Use earpiece' : 'Use speakerphone'}
                        accessibilityState={{ selected: speakerphoneOn }}
                        style={[
                          styles.controlBtn,
                          { backgroundColor: speakerphoneOn ? '#F7B503' : 'rgba(255,255,255,0.12)' },
                        ]}
                      >
                        {speakerphoneOn ? <Volume2 size={22} color="#061A38" /> : <VolumeX size={22} color="#FFFFFF" />}
                        <Text style={[styles.controlBtnLabel, { color: speakerphoneOn ? '#061A38' : '#C7D6EA' }]}>
                          {speakerphoneOn ? 'Speaker' : 'Earpiece'}
                        </Text>
                      </Pressable>
                    </View>
                  )}

                  {/* Realtime Chat Section (integrated in the room) */}
                  <View style={[styles.chatCard, { backgroundColor: isDark ? '#061A38' : '#FFFFFF', borderColor: theme.colors.border }]}>
                    <Text style={[styles.chatTitle, { color: theme.colors.textPrimary }]}>Private Message Thread</Text>
                    <FlatList
                      ref={chatScrollRef}
                      data={chatMessages}
                      keyExtractor={item => item.id}
                      style={styles.chatList}
                      contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
                      renderItem={({ item }) => {
                        const isMe = item.from === 'VISITOR';
                        return (
                          <View
                            style={[
                              styles.chatBubble,
                              isMe ? styles.chatBubbleVisitor : styles.chatBubbleOwner,
                              { backgroundColor: isMe ? theme.colors.brandAccent : (isDark ? '#1F3C64' : '#E2E8F0') },
                            ]}
                          >
                            <Text style={[styles.chatBubbleSender, { color: isMe ? theme.colors.brandNavy : theme.colors.textSecondary }]}>
                              {isMe ? 'You (Visitor)' : 'Vehicle Owner'}
                            </Text>
                            <Text style={[styles.chatBubbleBody, { color: isMe ? theme.colors.brandNavy : theme.colors.textPrimary }]}>
                              {item.text}
                            </Text>
                          </View>
                        );
                      }}
                      ListEmptyComponent={
                        <Text style={[styles.chatEmptyText, { color: theme.colors.textSecondary }]}>
                          {phase === 'CALLING'
                            ? 'You can send a message while waiting for the owner to pick up.'
                            : 'No messages yet. Send a message to start conversation.'}
                        </Text>
                      }
                    />

                    {/* Chat Input */}
                    <View style={styles.chatInputRow}>
                      <TextInput
                        value={chatInput}
                        onChangeText={setChatInput}
                        placeholder="Type a message to the owner…"
                        placeholderTextColor={theme.colors.textMuted}
                        style={[
                          styles.chatInput,
                          {
                            backgroundColor: isDark ? '#0B2342' : '#F6F9FD',
                            color: theme.colors.textPrimary,
                            borderColor: theme.colors.border,
                          },
                        ]}
                        onSubmitEditing={sendChatMessage}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Send message"
                        onPress={sendChatMessage}
                        disabled={!chatInput.trim()}
                        style={({ pressed }) => [
                          styles.chatSendBtn,
                          { backgroundColor: theme.colors.brandAccent, opacity: chatInput.trim() ? 1 : 0.4 },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Send size={16} color={theme.colors.brandNavy} />
                      </Pressable>
                    </View>
                  </View>

                  {/* End Session Button */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="End private session"
                    onPress={endSession}
                    style={({ pressed }) => [styles.hangupButton, pressed && styles.pressed]}
                  >
                    <PhoneOff size={20} color="#FFFFFF" />
                    <Text style={styles.hangupText}>
                      {sessionMode === 'VOICE' ? 'End Call' : 'Exit Private Chat'}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                /* READY STATE: Action Buttons (Call / Message / Quick Alert) */
                <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>
                    Private vehicle contact
                  </Text>
                  <Text style={[styles.cardSub, { color: theme.colors.textSecondary }]}>
                    Contact the owner securely without seeing their number or personal identity.
                  </Text>

                  {sessionError && (
                    <View style={styles.errorBanner}>
                      <AlertTriangle size={16} color="#DC2626" />
                      <Text style={styles.errorText}>{sessionError}</Text>
                    </View>
                  )}

                  {/* Realtime Action Buttons */}
                  <View style={styles.actionButtonsCol}>
                    {vehicle.callingEnabled ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Call owner privately"
                        onPress={() => void startRealtimeSession('VOICE')}
                        style={({ pressed }) => [
                          styles.primaryBtn,
                          { backgroundColor: theme.colors.brandAccent },
                          pressed && styles.pressed,
                        ]}
                      >
                        <PhoneCall size={20} color={theme.colors.brandNavy} />
                        <Text style={[styles.primaryBtnText, { color: theme.colors.brandNavy }]}>
                          Call owner privately
                        </Text>
                      </Pressable>
                    ) : null}

                    {vehicle.messagingEnabled ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Start private chat"
                        onPress={() => void startRealtimeSession('CHAT')}
                        style={({ pressed }) => [
                          styles.secondaryBtn,
                          { borderColor: theme.colors.border, backgroundColor: isDark ? '#14253E' : '#F6F9FD' },
                          pressed && styles.pressed,
                        ]}
                      >
                        <MessageSquare size={19} color={theme.colors.brandAccent} />
                        <Text style={[styles.secondaryBtnText, { color: theme.colors.textPrimary }]}>
                          Start private chat
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {/* Quick Preset Alert Option (Expandable) */}
                  <View style={[styles.accordionSection, { borderTopColor: theme.colors.border }]}>
                    <Pressable
                      onPress={() => setQuickAlertOpen(prev => !prev)}
                      style={styles.accordionHeader}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={17} color={theme.colors.brandAccent} />
                        <Text style={[styles.accordionTitle, { color: theme.colors.textPrimary }]}>
                          Send quick preset alert (blocking, lights, damage)
                        </Text>
                      </View>
                      {quickAlertOpen ? (
                        <ChevronUp size={18} color={theme.colors.textSecondary} />
                      ) : (
                        <ChevronDown size={18} color={theme.colors.textSecondary} />
                      )}
                    </Pressable>

                    {quickAlertOpen && (
                      <View style={styles.presetContent}>
                        <View style={styles.reasonGrid}>
                          {REASONS.map(item => {
                            const selected = reason === item.key;
                            const Icon = item.Icon;
                            return (
                              <Pressable
                                key={item.key}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: selected }}
                                onPress={() => setReason(item.key)}
                                style={({ pressed }) => [
                                  styles.reason,
                                  {
                                    backgroundColor: selected
                                      ? 'rgba(247,181,3,0.13)'
                                      : isDark ? '#14253E' : '#F6F9FD',
                                    borderColor: selected ? theme.colors.brandAccent : theme.colors.border,
                                  },
                                  pressed && styles.pressed,
                                ]}
                              >
                                <Icon
                                  size={17}
                                  color={selected ? theme.colors.brandAccent : theme.colors.textSecondary}
                                />
                                <Text style={[styles.reasonText, { color: theme.colors.textPrimary }]}>
                                  {item.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        {/* Photo Attachments */}
                        <View style={styles.photoContainer}>
                          <View style={styles.photoHeaderRow}>
                            <Text style={[styles.label, { color: theme.colors.textPrimary }]}>
                              Attach photos (optional)
                            </Text>
                            <Text style={[styles.counter, { color: theme.colors.textSecondary }]}>
                              {photos.length}/3
                            </Text>
                          </View>
                          <View style={styles.photoButtonsRow}>
                            <Pressable
                              accessibilityRole="button"
                              onPress={handleTakePhoto}
                              disabled={photos.length >= 3 || sendingAlert}
                              style={({ pressed }) => [
                                styles.photoBtn,
                                { borderColor: theme.colors.border, backgroundColor: isDark ? '#14253E' : '#F6F9FD' },
                                (pressed || photos.length >= 3) && styles.pressed,
                              ]}
                            >
                              <Camera size={16} color={theme.colors.brandAccent} />
                              <Text style={[styles.photoBtnText, { color: theme.colors.textPrimary }]}>Take Photo</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              onPress={handlePickFromLibrary}
                              disabled={photos.length >= 3 || sendingAlert}
                              style={({ pressed }) => [
                                styles.photoBtn,
                                { borderColor: theme.colors.border, backgroundColor: isDark ? '#14253E' : '#F6F9FD' },
                                (pressed || photos.length >= 3) && styles.pressed,
                              ]}
                            >
                              <LucideImage size={16} color={theme.colors.brandAccent} />
                              <Text style={[styles.photoBtnText, { color: theme.colors.textPrimary }]}>Photo Library</Text>
                            </Pressable>
                          </View>

                          {photos.length > 0 && (
                            <View style={styles.thumbStrip}>
                              {photos.map(p => (
                                <View key={p.id} style={[styles.thumbWrap, { borderColor: theme.colors.border }]}>
                                  <Image source={{ uri: p.uri }} style={styles.thumbImage} resizeMode="cover" />
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="Remove photo"
                                    onPress={() => removePhoto(p.id)}
                                    style={styles.thumbDelete}
                                  >
                                    <X size={12} color="#FFFFFF" />
                                  </Pressable>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>

                        <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Optional note</Text>
                        <TextInput
                          value={alertMessage}
                          onChangeText={setAlertMessage}
                          maxLength={280}
                          multiline
                          placeholder="Example: Your headlights appear to be on, or car is blocking driveway."
                          placeholderTextColor={theme.colors.textMuted}
                          style={[
                            styles.input,
                            {
                              borderColor: theme.colors.border,
                              backgroundColor: isDark ? '#14253E' : '#F6F9FD',
                              color: theme.colors.textPrimary,
                            },
                          ]}
                        />
                        <Text style={[styles.counter, { color: theme.colors.textSecondary }]}>
                          {alertMessage.length}/280
                        </Text>

                        <Pressable
                          accessibilityRole="button"
                          disabled={sendingAlert}
                          onPress={() => void sendAlert()}
                          style={({ pressed }) => [
                            styles.primary,
                            { backgroundColor: theme.colors.brandAccent },
                            (pressed || sendingAlert) && styles.pressed,
                          ]}
                        >
                          <Send size={16} color={theme.colors.brandNavy} />
                          <Text style={[styles.primaryText, { color: theme.colors.brandNavy }]}>
                            {sendingAlert ? 'Sending…' : 'Send preset alert'}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Emergency Notice */}
              <View
                style={[
                  styles.notice,
                  {
                    backgroundColor: isDark ? '#2B2310' : '#FFF9E6',
                    borderColor: 'rgba(247,181,3,0.38)',
                  },
                ]}
              >
                <AlertTriangle size={18} color="#D97706" />
                <Text style={[styles.noticeText, { color: theme.colors.textPrimary }]}>
                  For accidents, medical emergencies, or criminal threats, call 112 immediately. Do not wait for an owner response.
                </Text>
              </View>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <ConnectQrScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanned={resolveToken}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 68,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    gap: 12,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  headerCopy: { flex: 1, gap: 2 },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub: { fontSize: 11.5 },
  scanButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: space.lg,
    gap: space.lg,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  loading: { paddingVertical: 72, alignItems: 'center', gap: 14 },
  empty: {
    borderWidth: 1,
    padding: space.xl,
    borderRadius: radius.lg,
    alignItems: 'center',
    gap: 13,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  vehicleCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.xl,
    alignItems: 'center',
    gap: 8,
  },
  vehicleIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleName: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  vehicleMeta: { fontSize: 13, textAlign: 'center' },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  privacyText: { fontSize: 12, fontWeight: '700', color: '#10B981' },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: 12 },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  cardSub: { fontSize: 13, lineHeight: 19 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: '#FEE2E2',
    borderRadius: radius.md,
  },
  errorText: { color: '#DC2626', fontSize: 12.5, fontWeight: '600', flex: 1 },
  actionButtonsCol: { gap: 10, marginTop: 4 },
  primaryBtn: {
    minHeight: 52,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800' },
  secondaryBtn: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  secondaryBtnText: { fontSize: 14.5, fontWeight: '700' },
  accordionSection: { borderTopWidth: 1, paddingTop: 14, marginTop: 6 },
  accordionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  accordionTitle: { fontSize: 13, fontWeight: '700', flex: 1 },
  presetContent: { gap: 12, marginTop: 12 },
  reasonGrid: { gap: 8 },
  reason: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reasonText: { fontSize: 13, fontWeight: '700', flex: 1 },
  photoContainer: { gap: 8, marginTop: 4 },
  photoHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  photoButtonsRow: { flexDirection: 'row', gap: 10 },
  photoBtn: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  photoBtnText: { fontSize: 12.5, fontWeight: '700' },
  thumbStrip: { flexDirection: 'row', gap: 10, marginTop: 6 },
  thumbWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbDelete: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 13, fontWeight: '800', marginTop: 2 },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  counter: { fontSize: 11, textAlign: 'right', marginTop: -7 },
  primary: {
    minHeight: 48,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  primaryText: { fontSize: 14, fontWeight: '800' },
  notice: { padding: 14, gap: 10, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row' },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  pressed: { opacity: 0.72 },

  // Realtime Session Styles
  sessionCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: 16,
  },
  sessionStatusHeader: { alignItems: 'center', gap: 8 },
  sessionKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#F7B503' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionStateText: { fontSize: 13 },
  callingBox: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  pulsingIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(247,181,3,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callingTitle: { fontSize: 18, fontWeight: '800' },
  callingSub: { fontSize: 12.5, textAlign: 'center', maxWidth: 280 },
  connectedBox: { alignItems: 'center', gap: 4, paddingVertical: 6 },
  timerLarge: { fontSize: 28, fontWeight: '800', color: '#F7B503', letterSpacing: 1 },
  connectedSub: { fontSize: 13, fontWeight: '700' },
  voiceControlsRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  controlBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  controlBtnLabel: { fontSize: 10, fontWeight: '700' },
  chatCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    height: 280,
  },
  chatTitle: { fontSize: 13, fontWeight: '800', marginBottom: 6 },
  chatList: { flex: 1 },
  chatBubble: {
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  chatBubbleVisitor: { alignSelf: 'flex-end', borderBottomRightRadius: 2 },
  chatBubbleOwner: { alignSelf: 'flex-start', borderBottomLeftRadius: 2 },
  chatBubbleSender: { fontSize: 10, fontWeight: '700', marginBottom: 2 },
  chatBubbleBody: { fontSize: 13 },
  chatEmptyText: { fontSize: 12, textAlign: 'center', marginTop: 40, paddingHorizontal: 16 },
  chatInputRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  chatInput: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 14,
    fontSize: 13,
    borderWidth: 1,
  },
  chatSendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hangupButton: {
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: '#DE3E49',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  hangupText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800' },
});
