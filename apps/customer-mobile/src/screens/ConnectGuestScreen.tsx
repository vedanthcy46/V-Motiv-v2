import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AlertTriangle, ArrowLeft, Car, Camera, Lightbulb, MessageSquare, PhoneCall, ShieldCheck } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConnectQrScannerModal } from '../components/ConnectQrScannerModal';
import { getConnectWebUrl, lookupPublicConnectVehicle, parseConnectQr, requestPublicConnectCall, sendPublicConnectAlert, type PublicConnectVehicle } from '../services/connect-public';
import { radius, space, useAppTheme } from '../theme';

const REASONS = [
  { key: 'BLOCKING_ACCESS', label: 'Vehicle is blocking access', Icon: Car },
  { key: 'LIGHTS_ON', label: 'Lights are left on', Icon: Lightbulb },
  { key: 'SAFETY_CONCERN', label: 'Vehicle needs attention', Icon: AlertTriangle },
  { key: 'OTHER', label: 'Other concern', Icon: MessageSquare },
] as const;

export function ConnectGuestScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useAppTheme();
  const [scannerVisible, setScannerVisible] = useState(!route.params?.token);
  const [token, setToken] = useState<string | null>(route.params?.token || null);
  const [vehicle, setVehicle] = useState<PublicConnectVehicle | null>(null);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]['key']>('BLOCKING_ACCESS');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const resolveToken = useCallback((value: string) => {
    const parsed = parseConnectQr(value);
    setScannerVisible(false);
    if (!parsed) {
      Alert.alert('Not a V MOTIV Connect QR', 'Scan an official V MOTIV Connect sticker or paste its full public link.');
      return;
    }
    setToken(parsed.token);
  }, []);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    setLoading(true);
    setVehicle(null);
    void lookupPublicConnectVehicle(token)
      .then(value => { if (mounted) setVehicle(value); })
      .catch((error: Error) => {
        if (!mounted) return;
        const webUrl = getConnectWebUrl(token);
        Alert.alert(
          'Could not open Connect in this app',
          error.message,
          webUrl ? [{ text: 'Open secure web page', onPress: () => void Linking.openURL(webUrl) }, { text: 'Close', style: 'cancel' }] : [{ text: 'Close' }],
        );
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [token]);

  const sendAlert = async () => {
    if (!token || !vehicle) return;
    setSending(true);
    try {
      await sendPublicConnectAlert(token, reason, message.trim() || undefined);
      Alert.alert('Owner alerted', 'Your privacy-protected alert has been sent. The owner’s number and identity were not shared.');
      setMessage('');
    } catch (error: any) {
      Alert.alert('Alert not sent', error?.message || 'Please try again in a moment.');
    } finally { setSending(false); }
  };

  const requestCall = async () => {
    if (!token || !vehicle) return;
    setSending(true);
    try {
      const result = await requestPublicConnectCall(token);
      Alert.alert('Call request sent', `The owner has been notified. Call status: ${result.status}. Personal phone numbers are not shared.`);
    } catch (error: any) {
      Alert.alert('Calling unavailable', error?.message || 'Send a private alert instead.');
    } finally { setSending(false); }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}> 
      <View style={[styles.header, { borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation.goBack()} hitSlop={10} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><ArrowLeft size={22} color={theme.colors.textPrimary} /></Pressable>
        <View style={styles.headerCopy}><Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>V MOTIV Connect</Text><Text style={[styles.headerSub, { color: theme.colors.textSecondary }]}>Public, privacy-protected vehicle alert</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Scan another QR code" onPress={() => setScannerVisible(true)} style={({ pressed }) => [styles.scanButton, { borderColor: theme.colors.brandAccent }, pressed && styles.pressed]}><Camera size={18} color={theme.colors.brandAccent} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 28 }]}>
        {!token ? (
          <View style={[styles.empty, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Camera size={34} color={theme.colors.brandAccent} /><Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>Scan a vehicle QR sticker</Text><Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>No sign-in is required. The owner’s contact details stay private.</Text><Pressable accessibilityRole="button" onPress={() => setScannerVisible(true)} style={({ pressed }) => [styles.primary, { backgroundColor: theme.colors.brandAccent }, pressed && styles.pressed]}><Text style={[styles.primaryText, { color: theme.colors.brandNavy }]}>Open scanner</Text></Pressable></View>
        ) : loading ? (
          <View style={styles.loading}><ActivityIndicator color={theme.colors.brandAccent} /><Text style={{ color: theme.colors.textSecondary }}>Looking up secure vehicle identity…</Text></View>
        ) : vehicle ? (
          <>
            <View style={[styles.vehicleCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><View style={[styles.vehicleIcon, { backgroundColor: isDark ? '#14253E' : '#F6F9FD' }]}><Car size={28} color={theme.colors.brandAccent} /></View><Text style={[styles.vehicleName, { color: theme.colors.textPrimary }]}>{vehicle.nickname}</Text><Text style={[styles.vehicleMeta, { color: theme.colors.textSecondary }]}>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' · ')}</Text><View style={styles.privacyRow}><ShieldCheck size={15} color="#10B981" /><Text style={[styles.privacyText, { color: theme.colors.textSecondary }]}>Owner details are protected</Text></View></View>
            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>Notify the owner</Text><Text style={[styles.cardSub, { color: theme.colors.textSecondary }]}>Choose the reason, then add a short optional message.</Text><View style={styles.reasonGrid}>{REASONS.map(item => { const selected = reason === item.key; const Icon = item.Icon; return <Pressable key={item.key} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setReason(item.key)} style={({ pressed }) => [styles.reason, { backgroundColor: selected ? 'rgba(247,181,3,0.13)' : (isDark ? '#14253E' : '#F6F9FD'), borderColor: selected ? theme.colors.brandAccent : theme.colors.border }, pressed && styles.pressed]}><Icon size={18} color={selected ? theme.colors.brandAccent : theme.colors.textSecondary} /><Text style={[styles.reasonText, { color: theme.colors.textPrimary }]}>{item.label}</Text></Pressable>; })}</View><Text style={[styles.label, { color: theme.colors.textPrimary }]}>Optional message</Text><TextInput value={message} onChangeText={setMessage} maxLength={280} multiline placeholder="Example: Your headlights appear to be on." placeholderTextColor={theme.colors.textMuted} style={[styles.input, { borderColor: theme.colors.border, backgroundColor: isDark ? '#14253E' : '#F6F9FD', color: theme.colors.textPrimary }]} /><Text style={[styles.counter, { color: theme.colors.textSecondary }]}>{message.length}/280</Text><Pressable accessibilityRole="button" disabled={sending || !vehicle.messagingEnabled} onPress={() => void sendAlert()} style={({ pressed }) => [styles.primary, { backgroundColor: vehicle.messagingEnabled ? theme.colors.brandAccent : theme.colors.border }, (pressed || sending) && styles.pressed]}><MessageSquare size={18} color={theme.colors.brandNavy} /><Text style={[styles.primaryText, { color: theme.colors.brandNavy }]}>{sending ? 'Sending…' : vehicle.messagingEnabled ? 'Send private alert' : 'Messaging unavailable'}</Text></Pressable>{vehicle.callingEnabled ? <Pressable accessibilityRole="button" disabled={sending} onPress={() => void requestCall()} style={({ pressed }) => [styles.secondary, { borderColor: theme.colors.border }, (pressed || sending) && styles.pressed]}><PhoneCall size={18} color={theme.colors.brandAccent} /><Text style={[styles.secondaryText, { color: theme.colors.textPrimary }]}>Request privacy-preserving call</Text></Pressable> : null}</View>
            <View style={[styles.notice, { backgroundColor: isDark ? '#2B2310' : '#FFF9E6', borderColor: 'rgba(247,181,3,0.38)' }]}><AlertTriangle size={18} color="#D97706" /><Text style={[styles.noticeText, { color: theme.colors.textPrimary }]}>For accidents, medical emergencies, or criminal threats, call 112 immediately. Do not wait for an owner response.</Text></View>
          </>
        ) : null}
      </ScrollView>
      <ConnectQrScannerModal visible={scannerVisible} onClose={() => setScannerVisible(false)} onScanned={resolveToken} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 }, header: { minHeight: 68, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, gap: 12 }, back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 }, headerCopy: { flex: 1, gap: 2 }, headerTitle: { fontSize: 17, fontWeight: '800' }, headerSub: { fontSize: 11.5 }, scanButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, content: { padding: space.lg, gap: space.lg, maxWidth: 720, width: '100%', alignSelf: 'center' }, loading: { paddingVertical: 72, alignItems: 'center', gap: 14 }, empty: { borderWidth: 1, padding: space.xl, borderRadius: radius.lg, alignItems: 'center', gap: 13 }, emptyTitle: { fontSize: 18, fontWeight: '800' }, emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center' }, vehicleCard: { borderWidth: 1, borderRadius: radius.lg, padding: space.xl, alignItems: 'center', gap: 8 }, vehicleIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' }, vehicleName: { fontSize: 20, fontWeight: '800', textAlign: 'center' }, vehicleMeta: { fontSize: 13, textAlign: 'center' }, privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }, privacyText: { fontSize: 12, fontWeight: '700' }, card: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: 12 }, cardTitle: { fontSize: 17, fontWeight: '800' }, cardSub: { fontSize: 13, lineHeight: 19 }, reasonGrid: { gap: 8 }, reason: { minHeight: 50, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, reasonText: { fontSize: 13, fontWeight: '700', flex: 1 }, label: { fontSize: 13, fontWeight: '800', marginTop: 2 }, input: { minHeight: 92, borderWidth: 1, borderRadius: radius.md, padding: 12, textAlignVertical: 'top', fontSize: 14 }, counter: { fontSize: 11, textAlign: 'right', marginTop: -7 }, primary: { minHeight: 48, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 }, primaryText: { fontSize: 14, fontWeight: '800' }, secondary: { minHeight: 48, borderWidth: 1, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 }, secondaryText: { fontSize: 14, fontWeight: '800' }, notice: { padding: 14, gap: 10, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row' }, noticeText: { flex: 1, fontSize: 12, lineHeight: 18 }, pressed: { opacity: 0.72 },
});
