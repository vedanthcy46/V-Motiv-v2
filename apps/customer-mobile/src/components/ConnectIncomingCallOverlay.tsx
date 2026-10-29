import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { MessageSquare, Phone, PhoneOff, ShieldCheck } from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../auth/AuthProvider';
import { fetchIncomingConnectCalls, respondToIncomingConnectCall, type IncomingConnectCall } from '../services/connect-api';
import { radius, space, useAppTheme } from '../theme';
import { ConnectVoiceCall } from './ConnectVoiceCall';
import { ConnectChatModal } from './ConnectChatModal';

/**
 * Foreground incoming-call experience for a genuine V2 Connect request. The
 * call state is server-owned and every decision is persisted; vibration stops
 * deterministically when the request is handled or disappears.
 */
export function ConnectIncomingCallOverlay() {
  const { state } = useAuth();
  const { theme } = useAppTheme();
  const [call, setCall] = useState<IncomingConnectCall | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [activeChatCall, setActiveChatCall] = useState<IncomingConnectCall | null>(null);

  const refresh = useCallback(async () => {
    if (state !== 'signed-in') {
      setCall(null);
      return;
    }
    try {
      const response = await fetchIncomingConnectCalls();
      setCall(response.items.find(item => item.status === 'RINGING') || null);
    } catch {
      // Background polling must not interrupt normal app use when offline.
    }
  }, [state]);

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
        void refresh();
      }
    });

    return () => {
      clearInterval(interval);
      sub1.remove();
      sub2.remove();
    };
  }, [refresh]);

  useEffect(() => {
    if (!call) {
      Vibration.cancel();
      return;
    }
    Vibration.vibrate([0, 900, 500, 900, 1_200], true);
    return () => Vibration.cancel();
  }, [call]);

  const respond = async (decision: 'ACCEPT' | 'DECLINE') => {
    if (!call) return;
    setBusy(true);
    try {
      await respondToIncomingConnectCall(call.callSessionId, decision);
      Vibration.cancel();
      const currentCall = call;
      setCall(null);
      if (decision === 'ACCEPT') {
        if (currentCall.callerType === 'visitor_chat') {
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

  if (activeCallId) return <ConnectVoiceCall callSessionId={activeCallId} onClose={() => setActiveCallId(null)} />;
  if (!call) return null;
  const vehicle = call.link.vehicle;
  const isChat = call.callerType === 'visitor_chat';
  const initialMessage = call.signals?.[0]?.payload?.text;

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => void respond('DECLINE')}>
      <View style={styles.scrim}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: 'rgba(247,181,3,0.16)' }]}>
            {isChat ? (
              <MessageSquare size={34} color={theme.colors.brandAccent} />
            ) : (
              <Phone size={34} color={theme.colors.brandAccent} />
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
            <ShieldCheck size={16} color="#10B981" />
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
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <PhoneOff size={25} color="#FFFFFF" />}
              <Text style={styles.actionText}>{isChat ? 'Dismiss' : 'Decline'}</Text>
            </Pressable>
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
                <MessageSquare size={25} color="#061A38" />
              ) : (
                <Phone size={25} color="#061A38" />
              )}
              <Text style={[styles.actionText, { color: '#061A38' }]}>{isChat ? 'Open Chat' : 'Pick up'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, backgroundColor: 'rgba(2,11,24,0.78)' },
  card: { width: '100%', maxWidth: 420, borderRadius: radius.card, borderWidth: 1, padding: space.xl, alignItems: 'center', gap: 10 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1 }, title: { fontSize: 23, fontWeight: '800', textAlign: 'center' }, vehicle: { fontSize: 14, textAlign: 'center' },
  previewBox: { width: '100%', borderWidth: 1, borderRadius: radius.md, padding: 10, marginTop: 6, gap: 2 },
  previewLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  previewText: { fontSize: 13, fontStyle: 'italic', lineHeight: 18 },
  privacy: { width: '100%', borderWidth: 1, borderRadius: radius.md, padding: 12, flexDirection: 'row', gap: 9, marginTop: 8 }, privacyText: { flex: 1, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 18, marginTop: 16 }, callButton: { width: 112, minHeight: 94, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: 7 }, accept: { backgroundColor: '#10B981' }, decline: { backgroundColor: '#EF4444' }, actionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, pressed: { opacity: 0.72 },
});
