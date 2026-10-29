import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  PermissionsAndroid,
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
import { radius, space, useAppTheme } from '../theme';
import { ConnectVoiceCall } from './ConnectVoiceCall';
import { ConnectChatModal } from './ConnectChatModal';

/**
 * Foreground incoming-call experience for a genuine V2 Connect request. The
 * call state is server-owned and every decision is persisted; vibration stops
 * deterministically when the request is handled or disappears.
 */
async function checkAndRequestMicPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const isGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (isGranted) return true;
      const status = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      return status === PermissionsAndroid.RESULTS.GRANTED;
    } catch (e) {
      console.warn('[ConnectOverlay] Mic permission error:', e);
      return false;
    }
  }
  return true;
}

export function ConnectIncomingCallOverlay() {
  const { state } = useAuth();
  const { theme } = useAppTheme();
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
    // Fast polling ensures immediate pickup modal
    const interval = setInterval(() => void refresh(), 2_500);

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

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => void respond('DECLINE')}>
      <View style={styles.scrim}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <ScrollView
            contentContainerStyle={styles.cardScroll}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={[styles.avatar, { backgroundColor: 'rgba(247,181,3,0.16)' }]}>
              {isChat ? (
                <MessageSquare size={28} color={theme.colors.brandAccent} />
              ) : (
                <Phone size={28} color={theme.colors.brandAccent} />
              )}
            </View>
            <Text style={[styles.eyebrow, { color: theme.colors.brandAccent }]}>V MOTIV CONNECT</Text>
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
              {isChat ? 'Passerby Chat Request' : 'Incoming vehicle call'}
            </Text>
            <Text style={[styles.vehicle, { color: theme.colors.textSecondary }]}>
              {vehicle.year} {vehicle.make} {vehicle.model}
            </Text>

            {Boolean(initialMessage) && (
              <View style={[styles.previewBox, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
                <Text style={[styles.previewLabel, { color: theme.colors.brandAccent }]}>Message:</Text>
                <Text style={[styles.previewText, { color: theme.colors.textPrimary }]}>"{String(initialMessage)}"</Text>
              </View>
            )}

            <View style={[styles.privacy, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
              <ShieldCheck size={14} color="#10B981" />
              <Text style={[styles.privacyText, { color: theme.colors.textSecondary }]}>The passerby cannot see your phone number or identity.</Text>
            </View>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decline incoming V MOTIV Connect request"
                disabled={busy}
                onPress={() => void respond('DECLINE')}
                style={({ pressed }) => [styles.callButton, styles.decline, (pressed || busy) && styles.pressed]}
              >
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <PhoneOff size={20} color="#FFFFFF" />}
                <Text style={styles.actionText}>{isChat ? 'Dismiss' : 'Decline'}</Text>
              </Pressable>

              {!isChat && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Chat with caller instead"
                  disabled={busy}
                  onPress={() => void respond('ACCEPT', true)}
                  style={({ pressed }) => [
                    styles.callButton,
                    { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: theme.colors.border, borderWidth: 1 },
                    (pressed || busy) && styles.pressed,
                  ]}
                >
                  <MessageSquare size={20} color="#FFFFFF" />
                  <Text style={[styles.actionText, { color: '#FFFFFF' }]}>Chat</Text>
                </Pressable>
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Accept incoming V MOTIV Connect request"
                disabled={busy}
                onPress={() => void respond('ACCEPT')}
                style={({ pressed }) => [styles.callButton, styles.accept, (pressed || busy) && styles.pressed]}
              >
                {busy ? (
                  <ActivityIndicator color="#061A38" />
                ) : isChat ? (
                  <MessageSquare size={20} color="#061A38" />
                ) : (
                  <Phone size={20} color="#061A38" />
                )}
                <Text style={[styles.actionText, { color: '#061A38' }]}>{isChat ? 'Open Chat' : 'Pick up'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md, backgroundColor: 'rgba(2,11,24,0.78)' },
  card: { width: '100%', maxWidth: 400, maxHeight: '88%', borderRadius: radius.card, borderWidth: 1, overflow: 'hidden' },
  cardScroll: { alignItems: 'center', padding: space.lg, gap: 8 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  vehicle: { fontSize: 13, textAlign: 'center' },
  previewBox: { width: '100%', borderWidth: 1, borderRadius: radius.md, padding: 8, marginTop: 4, gap: 2 },
  previewLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  previewText: { fontSize: 12, fontStyle: 'italic', lineHeight: 16 },
  privacy: { width: '100%', borderWidth: 1, borderRadius: radius.md, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  privacyText: { flex: 1, fontSize: 11, lineHeight: 15 },
  actions: { flexDirection: 'row', width: '100%', gap: 8, marginTop: 12 },
  callButton: { flex: 1, minHeight: 52, height: 54, paddingVertical: 6, paddingHorizontal: 4, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 4 },
  accept: { backgroundColor: '#10B981' },
  decline: { backgroundColor: '#EF4444' },
  actionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
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
