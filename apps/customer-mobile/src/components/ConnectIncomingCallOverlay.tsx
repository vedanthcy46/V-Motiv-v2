import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { Phone, PhoneOff, ShieldCheck } from 'lucide-react-native';
import { useAuth } from '../auth/AuthProvider';
import { fetchIncomingConnectCalls, respondToIncomingConnectCall, type IncomingConnectCall } from '../services/connect-api';
import { radius, space, useAppTheme } from '../theme';
import { ConnectVoiceCall } from './ConnectVoiceCall';

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
    const interval = setInterval(() => void refresh(), 8_000);
    return () => clearInterval(interval);
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
      setCall(null);
      if (decision === 'ACCEPT') {
        setActiveCallId(call.callSessionId);
      }
    } catch (error: any) {
      Alert.alert('Unable to update request', error?.message || 'Please try again.');
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  if (activeCallId) return <ConnectVoiceCall callSessionId={activeCallId} onClose={() => setActiveCallId(null)} />;
  if (!call) return null;
  const vehicle = call.link.vehicle;
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => void respond('DECLINE')}>
      <View style={styles.scrim}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: 'rgba(247,181,3,0.16)' }]}><Phone size={34} color={theme.colors.brandAccent} /></View>
          <Text style={[styles.eyebrow, { color: theme.colors.brandAccent }]}>V MOTIV CONNECT</Text>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Incoming vehicle request</Text>
          <Text style={[styles.vehicle, { color: theme.colors.textSecondary }]}>{vehicle.year} {vehicle.make} {vehicle.model}</Text>
          <View style={[styles.privacy, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
            <ShieldCheck size={16} color="#10B981" />
            <Text style={[styles.privacyText, { color: theme.colors.textSecondary }]}>The passerby cannot see your phone number or identity.</Text>
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Decline incoming V MOTIV Connect request" disabled={busy} onPress={() => void respond('DECLINE')} style={({ pressed }) => [styles.callButton, styles.decline, (pressed || busy) && styles.pressed]}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <PhoneOff size={25} color="#FFFFFF" />}
              <Text style={styles.actionText}>Decline</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Accept incoming V MOTIV Connect request" disabled={busy} onPress={() => void respond('ACCEPT')} style={({ pressed }) => [styles.callButton, styles.accept, (pressed || busy) && styles.pressed]}>
              {busy ? <ActivityIndicator color="#061A38" /> : <Phone size={25} color="#061A38" />}
              <Text style={[styles.actionText, { color: '#061A38' }]}>Pick up</Text>
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
  privacy: { width: '100%', borderWidth: 1, borderRadius: radius.md, padding: 12, flexDirection: 'row', gap: 9, marginTop: 8 }, privacyText: { flex: 1, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 18, marginTop: 16 }, callButton: { width: 112, minHeight: 94, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: 7 }, accept: { backgroundColor: '#10B981' }, decline: { backgroundColor: '#EF4444' }, actionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, pressed: { opacity: 0.72 },
});
