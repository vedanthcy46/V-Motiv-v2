import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, CheckCircle2, Clock, FileText, XCircle } from 'lucide-react-native';
import { customer } from '../services/customer';
import { formatPaise, friendlyError } from '../format';
import { radius, space, useAppTheme, type ThemeColors } from '../theme';
import type { RootStack } from '../navigation/types';
import type { CustomerQuotation } from '../types';
import { safeBottom } from '../layout/safe-layout';

type Props = NativeStackScreenProps<RootStack, 'Quotation'>;

const STATUS_COPY: Record<string, { label: string; tone: 'accent' | 'success' | 'error' | 'muted' }> = {
  SENT: { label: 'Awaiting your response', tone: 'accent' },
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  DECLINED: { label: 'Declined', tone: 'error' },
  EXPIRED: { label: 'Expired', tone: 'muted' },
};

/** A quotation from Sales: the price breakdown, and buttons to accept or decline it. */
export function QuotationScreen({ route, navigation }: Props) {
  const { quotationId } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [quote, setQuote] = useState<CustomerQuotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'ACCEPT' | 'DECLINE' | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try { setQuote(await customer.quotation(quotationId)); }
    catch (error) { Alert.alert('Could not load the quotation', friendlyError(error)); }
    finally { setLoading(false); }
  }, [quotationId]);
  useEffect(() => { void load(); }, [load]);

  async function respond(decision: 'ACCEPT' | 'DECLINE') {
    if (busy) return;
    setBusy(decision);
    try {
      await customer.respondToQuotation(quotationId, decision, decision === 'DECLINE' ? reason.trim() || undefined : undefined);
      await load();
      setDeclining(false);
      Alert.alert(
        decision === 'ACCEPT' ? 'Quotation accepted' : 'Quotation declined',
        decision === 'ACCEPT'
          ? 'The car is now reserved for you for 3 days. Your advisor will contact you about the booking payment.'
          : 'Your advisor has been told. You can still browse other cars.',
      );
    } catch (error) {
      Alert.alert('Could not send your answer', friendlyError(error));
      void load();
    } finally {
      setBusy(null);
    }
  }

  function confirmAccept() {
    if (!quote) return;
    Alert.alert('Accept this quotation?', `You agree to buy ${quote.listing?.title ?? 'this car'} for ${formatPaise(quote.finalAmountPaise)}. The car will be reserved for you.`, [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Accept', onPress: () => void respond('ACCEPT') },
    ]);
  }

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
        <ArrowLeft size={22} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Quotation</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (loading) return <SafeAreaView style={styles.container}>{header}<View style={styles.center}><ActivityIndicator size="large" color={colors.brandAccent} /></View></SafeAreaView>;
  if (!quote) return <SafeAreaView style={styles.container}>{header}<View style={styles.center}><Text style={styles.muted}>Quotation not found.</Text></View></SafeAreaView>;

  const copy = STATUS_COPY[quote.status] ?? { label: quote.status, tone: 'muted' as const };
  const toneColor = copy.tone === 'success' ? colors.success : copy.tone === 'error' ? colors.error : copy.tone === 'accent' ? colors.brandAccent : colors.textMuted;
  const vehicle = quote.listing?.vehicle;
  const hasCharges = quote.chargesPaise && quote.chargesPaise !== '0';
  const hasDiscount = quote.discountPaise && quote.discountPaise !== '0';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: safeBottom(insets.bottom, 24) + 120, gap: space.md }} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            {quote.listing?.thumbnail ? <Image source={{ uri: quote.listing.thumbnail }} style={styles.photo} accessibilityLabel={`${quote.listing.title} photo`} /> : null}
            <Text style={styles.carTitle}>{quote.listing?.title ?? 'Vehicle'}</Text>
            {vehicle ? <Text style={styles.muted}>{vehicle.manufacturingYear} · {vehicle.fuelType} · {vehicle.transmission} · {vehicle.odometerKm.toLocaleString('en-IN')} km</Text> : null}
            <View style={[styles.statusPill, { borderColor: toneColor }]}>
              {copy.tone === 'success' ? <CheckCircle2 size={14} color={toneColor} /> : copy.tone === 'error' ? <XCircle size={14} color={toneColor} /> : <Clock size={14} color={toneColor} />}
              <Text style={[styles.statusText, { color: toneColor }]}>{copy.label}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.titleRow}><FileText size={18} color={colors.brandAccent} /><Text style={styles.sectionTitle}>Price breakdown</Text></View>
            <Row styles={styles} label="Base vehicle price" value={formatPaise(quote.basePricePaise)} />
            {hasCharges ? <Row styles={styles} label="Taxes, insurance & transfer" value={`+ ${formatPaise(quote.chargesPaise)}`} /> : null}
            {hasDiscount ? <Row styles={styles} label="Approved discount" value={`- ${formatPaise(quote.discountPaise)}`} tone={colors.success} /> : null}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Final on-road price</Text>
              <Text style={styles.totalValue}>{formatPaise(quote.finalAmountPaise)}</Text>
            </View>
            <Text style={styles.muted}>Valid until {new Date(quote.validUntil).toLocaleDateString('en-IN')}</Text>
            {quote.terms ? <Text style={styles.terms}>{quote.terms}</Text> : null}
          </View>

          {quote.status === 'DECLINED' && quote.customerResponseNotes ? <View style={styles.card}><Text style={styles.sectionTitle}>Your note</Text><Text style={styles.muted}>{quote.customerResponseNotes}</Text></View> : null}
          {quote.status === 'ACCEPTED' ? <View style={styles.card}><Text style={styles.muted}>The car is reserved for you. {quote.authorName ?? 'Your advisor'} will contact you about the booking payment.</Text></View> : null}
          {quote.status === 'EXPIRED' ? <View style={styles.card}><Text style={styles.muted}>This quotation has expired. Ask your advisor for a new one.</Text></View> : null}

          {quote.canRespond && declining ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Why are you declining? (optional)</Text>
              <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="e.g. price is too high" placeholderTextColor={colors.textMuted} maxLength={500} multiline />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {quote.canRespond ? (
        <View style={[styles.footer, { paddingBottom: safeBottom(insets.bottom, 12) }]}>
          {declining ? (
            <>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setDeclining(false)} disabled={busy !== null}><Text style={styles.secondaryText}>Back</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.dangerBtn, busy && { opacity: 0.6 }]} onPress={() => void respond('DECLINE')} disabled={busy !== null}>
                {busy === 'DECLINE' ? <ActivityIndicator color="#fff" /> : <Text style={styles.dangerText}>Confirm decline</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setDeclining(true)} disabled={busy !== null}><Text style={styles.secondaryText}>Decline</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.6 }]} onPress={confirmAccept} disabled={busy !== null}>
                {busy === 'ACCEPT' ? <ActivityIndicator color="#061A38" /> : <Text style={styles.primaryText}>Accept quotation</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Row({ styles, label, value, tone }: { styles: ReturnType<typeof createStyles>; label: string; value: string; tone?: string }) {
  return <View style={styles.row}><Text style={[styles.rowLabel, tone ? { color: tone } : null]}>{label}</Text><Text style={[styles.rowValue, tone ? { color: tone } : null]}>{value}</Text></View>;
}

function createStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, paddingVertical: space.sm },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    card: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
    photo: { width: '100%', height: 170, borderRadius: radius.md, backgroundColor: c.surfaceSecondary },
    carTitle: { fontSize: 20, fontWeight: '800', color: c.textPrimary },
    muted: { fontSize: 13, color: c.textMuted, lineHeight: 19 },
    terms: { fontSize: 12.5, color: c.textMuted, lineHeight: 18, marginTop: space.xs },
    statusPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
    statusText: { fontSize: 12.5, fontWeight: '700' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
    rowLabel: { fontSize: 14, color: c.textMuted, flexShrink: 1 },
    rowValue: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.sm, marginTop: space.xs },
    totalLabel: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    totalValue: { fontSize: 22, fontWeight: '900', color: isDark ? c.brandAccent : c.brandNavy },
    input: { minHeight: 80, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: space.md, color: c.textPrimary, textAlignVertical: 'top', backgroundColor: c.surfaceSecondary },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: space.md, padding: space.lg, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border },
    primaryBtn: { flex: 2, minHeight: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: c.brandAccent },
    primaryText: { fontSize: 15, fontWeight: '800', color: '#061A38' },
    secondaryBtn: { flex: 1, minHeight: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
    secondaryText: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    dangerBtn: { flex: 2, minHeight: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: c.error },
    dangerText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  });
}
