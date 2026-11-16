import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme';
import { FormField } from '../components/KeyboardAwareFormScreen';
import { CustomerButton } from '../components/customer-ui';
import { Card, ChoiceList, Notice, ProgressTrack, ScreenHeader, StatusPill } from '../components/scrap/ScrapUi';
import { isDraftView, scrapApi, type ScrapDetails, type ScrapDraftView } from '../services/scrap-api';
import {
  CERTIFICATE_NAMES, DISPUTE_CATEGORY_LABELS, customerAction, formatPaise, formatPaiseRange, progressStage, scrapErrorMessage, verificationText,
} from '../services/scrap-form';
import {
  DISPUTE_STATUS_TEXT, DOCUMENT_STATUS_TEXT, OBLIGATION_STATUS_TEXT, PAYMENT_STATE_TEXT, PICKUP_STATUS_TEXT, REGISTRATION_TEXT, documentName, formatDate, formatDateTime,
  isClosedStatus, payerText, timeLeftText,
} from '../services/scrap-text';
import type { RootStack } from '../navigation/types';

type Props = NativeStackScreenProps<RootStack, 'ScrapRequestDetails'>;

/** Statuses from which the facility, certificates and registration matter to the customer. */
const SHOW_REGISTRATION = ['SCRAPPING_COMPLETED', 'REGISTRATION_UPDATE_PENDING', 'COMPLETED'];

export function ScrapRequestDetailsScreen({ navigation, route }: Props) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  const { requestId, justSubmitted } = route.params;

  const [data, setData] = useState<ScrapDetails | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [concernOpen, setConcernOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const [description, setDescription] = useState('');
  const busyRef = useRef(false); // a second tap while an action is running does nothing

  const load = useCallback(async (mode: 'first' | 'refresh' = 'first') => {
    if (mode === 'refresh') setRefreshing(true);
    setError('');
    try {
      const view: ScrapDetails | ScrapDraftView = await scrapApi.get(requestId);
      if (isDraftView(view)) { navigation.replace('ScrapRequest', { requestId }); return; }
      setData(view);
    } catch (e) {
      setError(scrapErrorMessage(e, 'We could not load this request.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigation, requestId]);

  // Fresh whenever the screen is shown, so a change made by our team while the app was in the background appears without searching for it.
  useFocusEffect(useCallback(() => { void load(data ? 'refresh' : 'first'); }, [load]));

  const run = async (action: () => Promise<unknown>, after?: () => void) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError('');
    try {
      await action();
      after?.();
      await load('refresh');
    } catch (e) {
      setActionError(scrapErrorMessage(e));
      await load('refresh');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const respond = (decision: 'ACCEPTED' | 'REJECTED') => {
    const offer = data?.offer;
    if (!offer) return;
    const amount = formatPaise(offer.customerPayoutPaise) ?? '';
    Alert.alert(
      decision === 'ACCEPTED' ? `Accept this offer of ${amount}?` : 'Reject this offer?',
      decision === 'ACCEPTED'
        ? `${payerText(offer.payerType, offer.facilityName)}. After you accept we will arrange collection of your vehicle. You can still cancel before it is collected.`
        : 'This will close your request. You can start a new one later.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: decision === 'ACCEPTED' ? 'Accept offer' : 'Reject offer', style: decision === 'ACCEPTED' ? 'default' : 'destructive', onPress: () => void run(() => scrapApi.respondToOffer(requestId, offer.id, decision)) },
      ],
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader title="Scrapping request" onBack={() => navigation.goBack()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.brandAccent} accessibilityLabel="Loading" /></View>
      </View>
    );
  }
  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader title="Scrapping request" onBack={() => navigation.goBack()} />
        <View style={{ padding: 20, gap: 16 }}>
          <Notice tone="danger">{error || 'We could not load this request.'}</Notice>
          <CustomerButton title="Try again" onPress={() => { setLoading(true); void load(); }} />
        </View>
      </View>
    );
  }

  const closed = isClosedStatus(data.status);
  const stage = progressStage(data.status);
  const action = customerAction(data.status);
  const offer = data.offer;
  const offerOpen = offer?.status === 'SENT_TO_CUSTOMER' && data.status === 'OFFER_PENDING_CUSTOMER';
  const estimateText = data.estimate ? formatPaiseRange(data.estimate.minPaise, data.estimate.maxPaise) : null;
  const vehicleName = data.vehicle ? [data.vehicle.manufacturingYear, data.vehicle.make, data.vehicle.model, data.vehicle.variant].filter(Boolean).join(' ') : '';

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title={data.requestNumber} subtitle={vehicleName} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} tintColor={c.brandAccent} />}
      >
        {justSubmitted ? <Notice tone="success">Your request has been submitted. We will review it and keep you updated here and in your notifications.</Notice> : null}
        {error ? <Notice tone="warning" action={{ label: 'Try again', onPress: () => void load('refresh') }}>{error} Showing what we last loaded.</Notice> : null}
        {actionError ? <Notice tone="danger">{actionError}</Notice> : null}

        <Card>
          <StatusPill status={data.status} label={data.statusLabel} />
          <Text style={{ color: c.textPrimary, fontSize: 15, lineHeight: 22 }}>{data.statusDescription}</Text>
          {data.holdNotice ? <Notice tone="warning">{data.holdNotice}</Notice> : null}
          {!closed ? <ProgressTrack stage={stage} /> : null}
        </Card>

        {action === 'PROVIDE_DOCUMENTS' ? (
          <Notice tone="warning">We need some documents from you. They are listed below. Adding them from the app is coming in an update, so our team will contact you about how to send them.</Notice>
        ) : null}

        {offer ? (
          <Card title="Your offer">
            <Text accessibilityLabel={`Offer ${formatPaise(offer.customerPayoutPaise)}`} style={{ color: c.textPrimary, fontSize: 30, fontWeight: '800' }}>{formatPaise(offer.customerPayoutPaise)}</Text>
            <Text style={{ color: c.textSecondary }}>{payerText(offer.payerType, offer.facilityName)}</Text>
            {offerOpen ? <Text style={{ color: c.warning, fontWeight: '700' }}>{timeLeftText(offer.expiresAt)}</Text> : null}
            {offer.status === 'ACCEPTED' ? <Notice tone="success">You accepted this offer.</Notice> : null}
            {offer.status === 'REJECTED' ? <Notice tone="info">You rejected this offer.</Notice> : null}
            {offer.status === 'EXPIRED' ? <Notice tone="warning">This offer has expired. We will get a new quotation for you.</Notice> : null}
            {offerOpen ? (
              <View style={{ gap: 10 }}>
                <CustomerButton title="Accept offer" onPress={() => respond('ACCEPTED')} busy={busy} />
                <CustomerButton title="Reject offer" secondary onPress={() => respond('REJECTED')} disabled={busy} />
                <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Support')} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text style={{ color: c.brandAccent, fontWeight: '800' }}>I have a question about this offer</Text>
                </Pressable>
              </View>
            ) : null}
          </Card>
        ) : data.estimate ? (
          <Card title="Estimate">
            {estimateText ? (
              <>
                <Text accessibilityLabel={`Estimate ${estimateText}`} style={{ color: c.textPrimary, fontSize: 26, fontWeight: '800' }}>{estimateText}</Text>
                <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 19 }}>This is a rough guide, not an offer. The real offer comes after inspection and a quotation from an authorised facility.</Text>
              </>
            ) : (
              <>
                <Text style={{ color: c.textPrimary, fontSize: 18, fontWeight: '800' }}>Quotation required</Text>
                <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 19 }}>We cannot give a reliable estimate for this vehicle yet. We will get a quotation from an authorised scrapping facility.</Text>
              </>
            )}
          </Card>
        ) : null}

        {data.documents.length > 0 ? (
          <Card title="Documents and photos">
            {data.documents.map(document => (
              <View key={document.id} style={{ gap: 2 }}>
                <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{documentName(document.documentType)}</Text>
                <Text style={{ color: document.status === 'REJECTED' ? c.error : c.textSecondary, fontSize: 13.5 }}>{DOCUMENT_STATUS_TEXT[document.status] ?? document.status}</Text>
                {document.rejectionReason ? <Text style={{ color: c.textMuted, fontSize: 13 }}>Why: {document.rejectionReason}</Text> : null}
              </View>
            ))}
          </Card>
        ) : null}

        {data.pickup ? (
          <Card title="Collection">
            <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{formatDateTime(data.pickup.windowStart)} to {formatDateTime(data.pickup.windowEnd)}</Text>
            <Text style={{ color: c.textSecondary }}>{PICKUP_STATUS_TEXT[data.pickup.status] ?? data.pickup.status}</Text>
            {data.pickup.agentName ? <Text style={{ color: c.textSecondary }}>Driver: {data.pickup.agentName}</Text> : null}
            {data.pickup.transportProvider ? <Text style={{ color: c.textMuted, fontSize: 13 }}>Transport: {data.pickup.transportProvider}</Text> : null}
          </Card>
        ) : null}

        {data.certificates.length > 0 || SHOW_REGISTRATION.includes(data.status) ? (
          <Card title="Certificates and registration">
            <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 19 }}>
              The scrapping facility issues these. V MOTIV checks the document it receives. We tell you exactly how far each has been checked.
            </Text>
            {data.certificates.map(certificate => (
              <View key={`${certificate.type}-${certificate.officialReference}`} style={{ gap: 2 }}>
                <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{CERTIFICATE_NAMES[certificate.type] ?? certificate.type}</Text>
                <Text style={{ color: c.textMuted, fontSize: 13 }}>Reference {certificate.officialReference}{certificate.issuedAt ? ` · issued ${formatDate(certificate.issuedAt)}` : ''}</Text>
                <Text style={{ color: certificate.verificationState === 'VERIFIED' ? c.success : c.textSecondary, fontWeight: '600' }}>{verificationText(certificate.verificationState, certificate.verificationMethod)}</Text>
              </View>
            ))}
            {SHOW_REGISTRATION.includes(data.status) ? (
              <View style={{ gap: 2 }}>
                <Text style={{ color: c.textPrimary, fontWeight: '700' }}>Registration update</Text>
                <Text style={{ color: c.textSecondary }}>{REGISTRATION_TEXT[data.registrationStatus] ?? data.registrationStatus}</Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        {data.payment.obligations.length > 0 ? (
          <Card title="Payment">
            {data.payment.obligations.map((obligation, index) => (
              <View key={index} style={{ gap: 2 }}>
                <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{formatPaise(obligation.amountPaise)}</Text>
                <Text style={{ color: c.textSecondary }}>{OBLIGATION_STATUS_TEXT[obligation.status] ?? obligation.status}</Text>
              </View>
            ))}
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{PAYMENT_STATE_TEXT[data.payment.state] ?? data.payment.state}</Text>
          </Card>
        ) : null}

        {data.vehicle ? (
          <Card title="Your vehicle">
            <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{vehicleName}</Text>
            <Text style={{ color: c.textSecondary }}>{data.vehicle.registrationNumber}{data.vehicle.odometerKm ? ` · ${data.vehicle.odometerKm.toLocaleString('en-IN')} km` : ''} · {data.vehicle.fuelType.toLowerCase()}</Text>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{data.vehicle.identityStatus === 'CHECKED_BY_V_MOTIV' ? 'Details checked by V MOTIV' : 'Details as you declared them. We will check them during inspection.'}</Text>
            {data.pickupAddress ? <Text style={{ color: c.textMuted, fontSize: 13 }}>Pickup: {[data.pickupAddress.line1, data.pickupAddress.city, data.pickupAddress.pincode].filter(Boolean).join(', ')}</Text> : null}
          </Card>
        ) : null}

        {data.disputes.length > 0 ? (
          <Card title="Your concerns">
            {data.disputes.map(dispute => (
              <View key={dispute.id} style={{ gap: 2 }}>
                <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{DISPUTE_CATEGORY_LABELS.find(item => item.value === dispute.category)?.label ?? dispute.category}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 13.5 }}>{DISPUTE_STATUS_TEXT[dispute.status] ?? dispute.status} · {formatDate(dispute.createdAt)}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        <Card title="Progress so far">
          {[...data.timeline].reverse().map((entry, index) => (
            <View key={`${entry.at}-${index}`} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: index === 0 ? c.brandAccent : c.border, marginTop: 5 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.textPrimary, fontWeight: index === 0 ? '800' : '600' }}>{entry.label}</Text>
                <Text style={{ color: c.textMuted, fontSize: 12.5 }}>{formatDateTime(entry.at)}</Text>
                {entry.note ? <Text style={{ color: c.textSecondary, fontSize: 13 }}>{entry.note}</Text> : null}
              </View>
            </View>
          ))}
        </Card>

        <View style={{ gap: 10 }}>
          <CustomerButton title="Raise a concern" secondary onPress={() => { setActionError(''); setConcernOpen(true); }} disabled={busy} />
          {!closed ? <CustomerButton title="Cancel request" secondary onPress={() => { setActionError(''); setCancelOpen(true); }} disabled={busy} /> : null}
          <CustomerButton title="Contact support" secondary onPress={() => navigation.navigate('Support')} />
        </View>
        <Text style={{ color: c.textMuted, fontSize: 12.5, lineHeight: 18, textAlign: 'center' }}>
          V MOTIV arranges scrapping with an authorised facility. Certificates and registration updates come from the facility and the authorities, not from V MOTIV.
        </Text>
      </ScrollView>

      <Modal visible={cancelOpen} transparent animationType="slide" onRequestClose={() => setCancelOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: c.background, padding: 16, gap: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
            <Text accessibilityRole="header" style={{ color: c.textPrimary, fontSize: 18, fontWeight: '800' }}>Cancel this request?</Text>
            <FormField label="Why are you cancelling?" required multiline value={cancelReason} onChangeText={setCancelReason} maxLength={500} />
            {actionError ? <Notice tone="danger">{actionError}</Notice> : null}
            <CustomerButton
              title="Cancel request"
              busy={busy}
              disabled={cancelReason.trim().length < 3}
              onPress={() => void run(() => scrapApi.cancel(requestId, cancelReason.trim(), data.version), () => { setCancelOpen(false); setCancelReason(''); })}
            />
            <CustomerButton title="Keep my request" secondary onPress={() => setCancelOpen(false)} disabled={busy} />
          </View>
        </View>
      </Modal>

      <Modal visible={concernOpen} transparent animationType="slide" onRequestClose={() => setConcernOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <ScrollView style={{ maxHeight: '90%' }} contentContainerStyle={{ backgroundColor: c.background, padding: 16, gap: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20 }} keyboardShouldPersistTaps="handled">
            <Text accessibilityRole="header" style={{ color: c.textPrimary, fontSize: 18, fontWeight: '800' }}>Raise a concern</Text>
            <Text style={{ color: c.textSecondary, lineHeight: 20 }}>Tell us what is wrong. Our team will look into it, and your request is paused while they do.</Text>
            <ChoiceList label="What is it about?" options={DISPUTE_CATEGORY_LABELS} value={category} onChange={setCategory} />
            <FormField label="What happened?" required multiline value={description} onChangeText={setDescription} maxLength={2000} helperText="At least 10 characters." />
            {actionError ? <Notice tone="danger">{actionError}</Notice> : null}
            <CustomerButton
              title="Send concern"
              busy={busy}
              disabled={!category || description.trim().length < 10}
              onPress={() => void run(() => scrapApi.raiseConcern(requestId, category!, description.trim()), () => { setConcernOpen(false); setCategory(undefined); setDescription(''); })}
            />
            <CustomerButton title="Close" secondary onPress={() => setConcernOpen(false)} disabled={busy} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
