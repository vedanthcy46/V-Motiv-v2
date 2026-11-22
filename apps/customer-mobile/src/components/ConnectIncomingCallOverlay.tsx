import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { MessageSquare, Phone, PhoneOff, ShieldCheck } from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { closeConnectCall, fetchIncomingConnectCalls, respondToIncomingConnectCall, type IncomingConnectCall } from '../services/connect-api';
import {
  CONNECT_CALL_ACCEPT_ACTION,
  CONNECT_CALL_DECLINE_ACTION,
} from '../services/notifications';
import {
  startConnectIncomingRingtone,
  stopConnectIncomingRingtone,
} from '../services/call-audio';
import { ensureMicrophoneGranted } from '../services/mic-permission';
import { radius, space, useAppTheme } from '../theme';
import { ConnectVoiceCall } from './ConnectVoiceCall';
import { ConnectChatModal } from './ConnectChatModal';

/**
 * Foreground incoming-call experience for a genuine V2 Connect request. The
 * call state is server-owned and every decision is persisted; vibration stops
 * deterministically when the request is handled or disappears.
 */
const checkAndRequestMicPermission = ensureMicrophoneGranted;

export function ConnectIncomingCallOverlay() {
  const { state } = useAuth();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(0)).current;
  const [call, setCall] = useState<IncomingConnectCall | null>(null);
  const [resumableCall, setResumableCall] = useState<IncomingConnectCall | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [activeChatCall, setActiveChatCall] = useState<IncomingConnectCall | null>(null);

  const refresh = useCallback(async () => {
    if (state !== 'signed-in') {
      setCall(null);
      setResumableCall(null);
      return;
    }
    try {
      const response = await fetchIncomingConnectCalls();
      setCall(response.items.find(item => item.status === 'RINGING') || null);
      // Track ACCEPTED calls so the owner can resume a dismissed chat/call
      // instead of being locked out with no way back in.
      setResumableCall(response.items.find(item => item.status === 'ACCEPTED') || null);
    } catch {
      // Background polling must not interrupt normal app use when offline.
    }
  }, [state]);

  const handleNotificationAction = useCallback(async (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data;
    const callSessionId = typeof data?.callSessionId === 'string' ? data.callSessionId : null;
    const action = response.actionIdentifier;
    if (!callSessionId || (action !== CONNECT_CALL_ACCEPT_ACTION && action !== CONNECT_CALL_DECLINE_ACTION)) {
      void refresh();
      return;
    }

    try {
      const incoming = await fetchIncomingConnectCalls();
      const incomingCall = incoming.items.find(item => item.callSessionId === callSessionId);
      if (!incomingCall || incomingCall.status !== 'RINGING') {
        void refresh();
        return;
      }

      if (action === CONNECT_CALL_DECLINE_ACTION) {
        await respondToIncomingConnectCall(callSessionId, 'DECLINE');
        Vibration.cancel();
        setCall(current => current?.callSessionId === callSessionId ? null : current);
        return;
      }

      if (incomingCall.callerType !== 'visitor_chat') {
        await checkAndRequestMicPermission().catch(() => false);
      }
      await respondToIncomingConnectCall(callSessionId, 'ACCEPT');
      Vibration.cancel();
      setCall(null);
      if (incomingCall.callerType === 'visitor_chat') {
        setActiveChatCall(incomingCall);
      } else {
        setActiveCallId(callSessionId);
      }
    } catch (error) {
      console.warn('[CONNECT_NOTIFICATION_ACTION_FAILED]', error);
      void refresh();
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
    // A safety net only: push notifications (below) wake this up instantly when a call or chat arrives. Polling every
    // 2.5 s from every signed-in phone, in the background too, overloaded the API; now it checks every 15 s while the app is open.
    const interval = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15_000);
    const appState = AppState.addEventListener('change', next => { if (next === 'active') void refresh(); });

    // Push notification events trigger instant wakeup
    const sub1 = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data;
      if (data?.callSessionId || data?.type === 'CONNECT_CALL_REQUESTED' || data?.type === 'CONNECT_CHAT_MESSAGE') {
        void refresh();
      }
    });

    const sub2 = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.callSessionId || data?.type === 'CONNECT_CALL_REQUESTED' || data?.type === 'CONNECT_CHAT_MESSAGE') {
        void handleNotificationAction(response);
      }
    });

    return () => {
      clearInterval(interval);
      appState.remove();
      sub1.remove();
      sub2.remove();
    };
  }, [handleNotificationAction, refresh]);

  useEffect(() => {
    if (!call) {
      Vibration.cancel();
      return;
    }
    Vibration.vibrate([0, 900, 500, 900, 1_200], true);
    return () => Vibration.cancel();
  }, [call]);

  useEffect(() => {
    if (!call || call.callerType === 'visitor_chat') {
      stopConnectIncomingRingtone();
      return;
    }
    startConnectIncomingRingtone();
    return () => stopConnectIncomingRingtone();
  }, [call?.callSessionId, call?.callerType]);

  // A slow pulse around the caller icon while it rings.
  useEffect(() => {
    if (!call) return undefined;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    pulse.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [call?.callSessionId, pulse]);

  const respond = async (decision: 'ACCEPT' | 'DECLINE', forceChat = false) => {
    if (!call) return;
    setBusy(true);
    try {
      if (decision === 'ACCEPT' && call.callerType !== 'visitor_chat' && !forceChat) {
        // Attempt mic permission non-blockingly; if not in APK or denied,
        // voice call still connects in Receive-Only (Listen & Chat) mode
        await checkAndRequestMicPermission().catch(() => false);
      }

      await respondToIncomingConnectCall(call.callSessionId, decision);
      Vibration.cancel();
      const currentCall = call;
      setCall(null);
      if (decision === 'ACCEPT') {
        if (currentCall.callerType === 'visitor_chat' || forceChat) {
          setActiveChatCall(currentCall);
        } else {
          setActiveCallId(currentCall.callSessionId);
        }
      }
    } catch (error: any) {
      Alert.alert('Unable to update request', error?.message || 'Please try again.');
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  // Hooks must be declared before any conditional render branch. In
  // particular, accepting a chat switches `activeChatCall` immediately.
  const handleCloseVoiceCall = useCallback(() => {
    setActiveCallId(null);
    void refresh();
  }, [refresh]);

  if (activeChatCall) {
    return (
      <ConnectChatModal
        call={activeChatCall}
        onClose={() => {
          setActiveChatCall(null);
          void refresh();
        }}
      />
    );
  }

  if (activeCallId) return <ConnectVoiceCall callSessionId={activeCallId} onClose={handleCloseVoiceCall} />;

  // If no ringing call but an ACCEPTED session exists, show a resume banner
  // so the owner can get back into a chat/call they dismissed with the X
  // button instead of being locked out with no way back in.
  if (!call && resumableCall) {
    const rVehicle = resumableCall.link.vehicle;
    const rIsChat = resumableCall.callerType === 'visitor_chat';
    return (
      <Modal transparent statusBarTranslucent animationType="slide" onRequestClose={() => setResumableCall(null)}>
        <View style={styles.resumeWrap}>
          <View style={[styles.resumeCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            {rIsChat ? (
              <MessageSquare size={18} color={theme.colors.brandAccent} />
            ) : (
              <Phone size={18} color={theme.colors.brandAccent} />
            )}
            <View style={styles.resumeInfo}>
              <Text style={[styles.resumeTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                Active {rIsChat ? 'chat' : 'call'} · {rVehicle.make} {rVehicle.model}
              </Text>
              <Text style={[styles.resumeSub, { color: theme.colors.textSecondary }]}>
                Tap resume to continue
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Resume active ${rIsChat ? 'chat' : 'call'}`}
              onPress={() => {
                if (rIsChat) {
                  setActiveChatCall(resumableCall);
                } else {
                  setActiveCallId(resumableCall.callSessionId);
                }
                setResumableCall(null);
              }}
              style={[styles.resumeBtn, { backgroundColor: theme.colors.brandAccent }]}
            >
              <Text style={styles.resumeBtnText}>Resume</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="End active session"
              onPress={async () => {
                try {
                  await closeConnectCall(resumableCall.callSessionId, 'Closed by owner');
                } catch { /* non-fatal */ }
                setResumableCall(null);
                void refresh();
              }}
              style={styles.resumeCloseBtn}
            >
              <PhoneOff size={16} color="#EF4444" />
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  if (!call) return null;
  const vehicle = call.link.vehicle;
  const isChat = call.callerType === 'visitor_chat';
  const initialMessage = call.signals?.[0]?.payload?.text;

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={() => void respond('DECLINE')}>
      <View style={[styles.fullScreen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 28 }]}>
        <Text style={styles.eyebrow}>V MOTIV CONNECT</Text>

        <View style={styles.center}>
          <View style={styles.avatarWrap}>
            <Animated.View style={[styles.pulseRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} />
            <View style={styles.avatarBig}>
              {isChat ? <MessageSquare size={52} color="#F7B503" /> : <Phone size={52} color="#F7B503" />}
            </View>
          </View>
          <Text style={styles.titleBig}>{isChat ? 'Someone wants to chat' : 'Incoming vehicle call'}</Text>
          <Text style={styles.vehicleBig}>{vehicle.year} {vehicle.make} {vehicle.model}</Text>
          <Text style={styles.subtle}>{isChat ? 'A passer-by is messaging you about your vehicle' : 'A passer-by is calling about your vehicle'}</Text>

          {Boolean(initialMessage) && (
            <View style={styles.previewBox}>
              <Text style={styles.previewLabel}>Their message</Text>
              <Text style={styles.previewText} numberOfLines={4}>"{String(initialMessage)}"</Text>
            </View>
          )}

          <View style={styles.privacy}>
            <ShieldCheck size={14} color="#10B981" />
            <Text style={styles.privacyText}>They cannot see your phone number or identity.</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={isChat ? 'Dismiss chat request' : 'Decline call'} disabled={busy} onPress={() => void respond('DECLINE')} style={({ pressed }) => [styles.actionItem, (pressed || busy) && styles.pressed]}>
            <View style={[styles.actionCircle, styles.decline]}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <PhoneOff size={30} color="#FFFFFF" />}</View>
            <Text style={styles.actionLabel}>{isChat ? 'Dismiss' : 'Decline'}</Text>
          </Pressable>

          {!isChat && (
            <Pressable accessibilityRole="button" accessibilityLabel="Reply by chat instead of calling" disabled={busy} onPress={() => void respond('ACCEPT', true)} style={({ pressed }) => [styles.actionItem, (pressed || busy) && styles.pressed]}>
              <View style={[styles.actionCircle, styles.chatCircle]}><MessageSquare size={30} color="#FFFFFF" /></View>
              <Text style={styles.actionLabel}>Chat</Text>
            </Pressable>
          )}

          <Pressable accessibilityRole="button" accessibilityLabel={isChat ? 'Open chat' : 'Accept call'} disabled={busy} onPress={() => void respond('ACCEPT')} style={({ pressed }) => [styles.actionItem, (pressed || busy) && styles.pressed]}>
            <View style={[styles.actionCircle, styles.accept]}>{busy ? <ActivityIndicator color="#FFFFFF" /> : isChat ? <MessageSquare size={30} color="#FFFFFF" /> : <Phone size={30} color="#FFFFFF" />}</View>
            <Text style={styles.actionLabel}>{isChat ? 'Open chat' : 'Accept'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullScreen: { flex: 1, backgroundColor: '#061A38', paddingHorizontal: 24, alignItems: 'center', justifyContent: 'space-between' },
  center: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 8 },
  avatarWrap: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  pulseRing: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#F7B503' },
  avatarBig: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(247,181,3,0.16)', borderWidth: 2, borderColor: 'rgba(247,181,3,0.4)', alignItems: 'center', justifyContent: 'center' },
  titleBig: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  vehicleBig: { color: '#F7B503', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  subtle: { color: '#C7D6EA', fontSize: 14, textAlign: 'center' },
  actions: { flexDirection: 'row', width: '100%', justifyContent: 'space-evenly', alignItems: 'flex-start' },
  actionItem: { alignItems: 'center', gap: 8, minWidth: 84 },
  actionCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  chatCircle: { backgroundColor: '#2F6FED' },
  actionLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  eyebrow: { color: '#F7B503', fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  previewBox: { width: '100%', maxWidth: 360, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 12, marginTop: 10, gap: 4 },
  previewLabel: { color: '#F7B503', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  previewText: { color: '#FFFFFF', fontSize: 14, fontStyle: 'italic', lineHeight: 20 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  privacyText: { color: '#9FB3CE', fontSize: 12 },
  accept: { backgroundColor: '#10B981' },
  decline: { backgroundColor: '#EF4444' },
  pressed: { opacity: 0.72 },
  resumeWrap: { flex: 1, justifyContent: 'flex-start', paddingTop: 50 },
  resumeCard: { marginHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.lg, padding: 12, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6 },
  resumeInfo: { flex: 1, gap: 2 },
  resumeTitle: { fontSize: 14, fontWeight: '700' },
  resumeSub: { fontSize: 12 },
  resumeBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.md },
  resumeBtnText: { color: '#061A38', fontSize: 13, fontWeight: '800' },
  resumeCloseBtn: { padding: 8 },
});
