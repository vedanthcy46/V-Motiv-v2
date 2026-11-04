import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  MapPin,
  Phone,
  ShieldCheck,
  Truck,
  Wrench,
  XCircle,
} from 'lucide-react-native';
import { useAppTheme, radius, space } from '../theme';
import { SandboxPaymentBanner } from '../components/SandboxPaymentBanner';
import { CarBrandLogo } from '../components/CarBrandLogo';
import {
  cancelServiceRequest,
  fetchCustomerServiceRequest,
  respondToServiceEstimate,
  verifyServicePayment,
  type ServiceRequestDetails,
} from '../services/service-api';
import { KeyboardAwareSheet } from '../components/KeyboardAwareSheet';
import type { EstimateDeclineReason } from '../services/service-api';
import { previewApprovedTotals } from '../services/estimate-totals';
import { safeBottom } from '../layout/safe-layout';
import { KeyboardScrollView } from '../components/KeyboardScrollView';

export function ServiceRequestDetailsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const requestId = route.params?.requestId as string;
  const { theme, isDark } = useAppTheme();
  const c = {
    ...theme.colors,
    text: theme.colors.textPrimary,
    textMuted: theme.colors.textSecondary,
    accent: theme.colors.brandAccent,
  };

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [request, setRequest] = useState<ServiceRequestDetails | null>(null);

  // Estimate Modal State
  const [estimateModalVisible, setEstimateModalVisible] = useState(false);
  const [respondingToEstimate, setRespondingToEstimate] = useState(false);
  const [estimateNotes, setEstimateNotes] = useState('');
  const [declineReason, setDeclineReason] = useState<EstimateDeclineReason | null>(null);
  // Optional (recommended) estimate items the customer chooses to defer while approving.
  const [deferredItemIds, setDeferredItemIds] = useState<string[]>([]);

  // Cancel Modal State
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Pay Balance Modal State
  const [payBalanceModalVisible, setPayBalanceModalVisible] = useState(false);
  const [payingBalance, setPayingBalance] = useState(false);
  const [customPayAmountRupees, setCustomPayAmountRupees] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<'RAZORPAY_UPI' | 'RAZORPAY_CARD' | 'NET_BANKING'>('RAZORPAY_UPI');
  const estimateScrollRef = useRef<ScrollView>(null);
  const paymentScrollRef = useRef<ScrollView>(null);
  const cancelScrollRef = useRef<ScrollView>(null);

  const loadDetails = useCallback(async (isSilent = false) => {
    if (!requestId) return;
    try {
      if (!isSilent) setLoading(true);
      const data = await fetchCustomerServiceRequest(requestId);
      setRequest(data);
    } catch (err: any) {
      console.warn('[SERVICE_DETAILS_ERROR]', err?.message || err);
      if (!isSilent) Alert.alert('Error', 'Could not load service request details.');
    } finally {
      if (!isSilent) setLoading(false);
      setRefreshing(false);
    }
  }, [requestId]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadDetails();
  }, [loadDetails]);

  const handleEstimateDecision = async (decision: 'APPROVE' | 'DECLINE') => {
    // The live estimate: awaiting the customer, or declined and still open for reconsideration.
    const activeEstimate =
      request?.estimates.find(e => e.status === 'SENT_TO_CUSTOMER') ||
      (request?.status === 'ESTIMATE_REJECTED' ? request.estimates.find(e => e.status === 'DECLINED') : undefined);
    if (!activeEstimate || request?.status === 'CANCELLED') return;

    setRespondingToEstimate(true);
    try {
      await respondToServiceEstimate(
        activeEstimate.id,
        decision,
        estimateNotes,
        decision === 'DECLINE' ? declineReason ?? undefined : undefined,
        decision === 'APPROVE' ? deferredItemIds : undefined,
      );
      Alert.alert(
        decision === 'APPROVE' ? 'Estimate Approved' : 'Estimate Declined',
        decision === 'APPROVE'
          ? 'Work will now proceed. Our service advisor will keep you updated.'
          : 'Our service advisor has been notified. You can reconsider anytime, or they may send you a revised estimate.'
      );
      setEstimateModalVisible(false);
      setEstimateNotes('');
      setDeclineReason(null);
      setDeferredItemIds([]);
      void loadDetails();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to submit estimate response.');
    } finally {
      setRespondingToEstimate(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!cancelReason.trim()) {
      Alert.alert('Reason Required', 'Please provide a reason for cancellation.');
      return;
    }
    setCancelling(true);
    try {
      await cancelServiceRequest(requestId, cancelReason.trim());
      Alert.alert('Service Cancelled', 'Your service booking has been cancelled.');
      setCancelModalVisible(false);
      void loadDetails();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not cancel request.');
    } finally {
      setCancelling(false);
    }
  };

  const handlePayBalance = async () => {
    if (!request) return;
    const outstandingRupees = Math.round(Number(request.outstandingBalancePaise || 0) / 100);
    const amountToPay = customPayAmountRupees > 0 ? customPayAmountRupees : outstandingRupees;
    if (amountToPay <= 0) {
      Alert.alert('Invalid Amount', 'Please specify a valid payment amount.');
      return;
    }

    setPayingBalance(true);
    try {
      const gatewayPaymentId = `pay_demo_srv_${Date.now()}`;
      const gatewayOrderId = `order_demo_srv_${Date.now()}`;
      const gatewaySignature = 'demo_sig_verified_vmotiv';

      await verifyServicePayment(request.id, {
        gatewayOrderId,
        gatewayPaymentId,
        gatewaySignature,
        amountPaise: (BigInt(amountToPay) * 100n).toString(),
        paymentGateway: 'DEMO',
        installmentType: amountToPay >= outstandingRupees ? 'FINAL_BALANCE' : 'INTERMEDIATE_ADVANCE',
      });

      Alert.alert(
        'Payment Successful! 🎉',
        `Payment of ₹${amountToPay.toLocaleString('en-IN')} has been verified. Transaction ID: ${gatewayPaymentId}.`,
        [
          {
            text: 'OK',
            onPress: () => {
              setPayBalanceModalVisible(false);
              void loadDetails();
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Payment Error', err?.message || 'Payment verification could not be completed.');
    } finally {
      setPayingBalance(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centerBox, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={c.accent} />
        <Text style={[styles.loadingText, { color: c.textMuted }]}>Loading tracking details...</Text>
      </View>
    );
  }

  if (!request) {
    return (
      <View style={[styles.centerBox, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <Text style={[styles.loadingText, { color: c.text }]}>Service request not found.</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.smallBtn, { backgroundColor: c.accent }]}
        >
          <Text style={styles.smallBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activeEstimate = request.estimates.find(e => e.status === 'SENT_TO_CUSTOMER') || request.estimates[0];
  // Estimate workflow state. A cancelled job never offers review/approval, a declined estimate can be
  // reconsidered until the workshop sends a revised one, and an expired estimate needs a new version.
  const isRequestCancelled = request.status === 'CANCELLED';
  const isNegotiating = !isRequestCancelled && request.status === 'ESTIMATE_REJECTED' && activeEstimate?.status === 'DECLINED';
  const isEstimateExpired = Boolean(activeEstimate && new Date(activeEstimate.validUntil).getTime() < Date.now());
  const canRespondToEstimate =
    !isRequestCancelled && !isEstimateExpired && Boolean(activeEstimate) &&
    (activeEstimate!.status === 'SENT_TO_CUSTOMER' || isNegotiating);
  const estimateStatusLabel = isRequestCancelled
    ? 'WITHDRAWN'
    : isEstimateExpired && activeEstimate?.status === 'SENT_TO_CUSTOMER'
      ? 'EXPIRED'
      : activeEstimate?.status === 'DECLINED'
        ? 'DECLINED'
        : (activeEstimate?.status || '').replace(/_/g, ' ');
  const canCancel = ['SUBMITTED', 'APPOINTMENT_SCHEDULED', 'ESTIMATE_PENDING_APPROVAL', 'ESTIMATE_REJECTED'].includes(request.status);

  return (
    <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.iconBtn, { backgroundColor: c.surface }]}
        >
          <ArrowLeft size={20} color={c.text} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.headerTitle, { color: c.text }]}>{request.requestNumber}</Text>
          <Text style={[styles.headerSub, { color: c.textMuted }]}>
            {request.categoryKey.replace(/_/g, ' ')}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: isDark ? '#162C4E' : '#EBF3FF' }]}>
          <Text style={[styles.statusBadgeText, { color: c.accent }]}>
            {request.status.replace(/_/g, ' ')}
          </Text>
        </View>
      </View>

      <KeyboardScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: safeBottom(insets.bottom, space.md) + space.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Safety Alert Banner if Critical */}
        {request.emergencySafetyFlag && (
          <View style={[styles.safetyBanner, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}>
            <AlertTriangle size={20} color="#DC2626" />
            <View style={styles.safetyBannerTextWrap}>
              <Text style={styles.safetyBannerTitle}>Safety Critical Advisory</Text>
              <Text style={styles.safetyBannerDesc}>
                Vehicle symptoms indicate critical safety risk. Do not drive on public roads if brakes or engine overheat. Flatbed towing is strongly recommended.
              </Text>
            </View>
          </View>
        )}

        {/* Vehicle & Hub Card */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.cardHeader}>
            <CarBrandLogo brand={request.vehicle.make} size={28} />
            <View style={styles.cardTitleWrap}>
              <Text style={[styles.carName, { color: c.text }]}>
                {request.vehicle.make} {request.vehicle.model} ({request.vehicle.year})
              </Text>
              <Text style={[styles.carSub, { color: c.textMuted }]}>
                {request.vehicle.registrationNumber || 'No plate'} · {request.vehicle.fuelType}
              </Text>
            </View>
          </View>

          <View style={[styles.gridRow, { borderTopColor: c.border }]}>
            <View style={styles.gridCol}>
              <View style={styles.iconRow}>
                <Calendar size={14} color={c.textMuted} />
                <Text style={[styles.gridLabel, { color: c.textMuted }]}>Date & Slot</Text>
              </View>
              <Text style={[styles.gridVal, { color: c.text }]}>
                {request.scheduledDate} ({request.scheduledTimeSlot})
              </Text>
            </View>

            <View style={styles.gridCol}>
              <View style={styles.iconRow}>
                <Truck size={14} color={c.textMuted} />
                <Text style={[styles.gridLabel, { color: c.textMuted }]}>Handover</Text>
              </View>
              <Text style={[styles.gridVal, { color: c.text }]}>
                {request.fulfillmentType === 'PICKUP_AND_RETURN' ? 'Doorstep Pickup' : 'Self-Drop Hub'}
              </Text>
            </View>
          </View>

          <View style={[styles.hubRow, { borderTopColor: c.border }]}>
            <MapPin size={16} color={c.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.hubName, { color: c.text }]}>{request.hub.name}</Text>
              <Text style={[styles.hubAddress, { color: c.textMuted }]}>{request.hub.address}</Text>
            </View>
          </View>
        </View>

        {/* Estimate Review Card (If Sent to Customer) */}
        {activeEstimate && (
          <View style={[styles.estimateCard, { backgroundColor: c.surface, borderColor: activeEstimate.status === 'SENT_TO_CUSTOMER' ? c.accent : c.border }]}>
            <View style={styles.estHeaderRow}>
              <View style={styles.estTitleRow}>
                <FileText size={20} color={c.accent} />
                <Text style={[styles.estTitle, { color: c.text }]}>
                  Service Estimate (v{activeEstimate.version})
                </Text>
              </View>
              <View style={[styles.estStatusPill, { backgroundColor: activeEstimate.status === 'APPROVED' ? '#E8F5E9' : '#FFF9E6' }]}>
                <Text style={[styles.estStatusText, { color: activeEstimate.status === 'APPROVED' ? '#10B981' : '#F7B503' }]}>
                  {estimateStatusLabel}
                </Text>
              </View>
            </View>

            <View style={styles.estAmountRow}>
              <Text style={[styles.estAmountLabel, { color: c.textMuted }]}>Total Estimated Cost:</Text>
              <Text style={[styles.estAmountVal, { color: c.text }]}>
                ₹{(Number(activeEstimate.totalAmountPaise) / 100).toLocaleString('en-IN')}
              </Text>
            </View>

            {activeEstimate.customerNotes && (
              <Text style={[styles.estNotes, { color: c.textMuted }]}>
                Advisor Note: {activeEstimate.customerNotes}
              </Text>
            )}

            {isRequestCancelled ? (
              <Text style={[styles.estNotes, { color: c.textMuted }]}>
                This service was cancelled, so the estimate was withdrawn. No action is needed.
              </Text>
            ) : isEstimateExpired && activeEstimate.status === 'SENT_TO_CUSTOMER' ? (
              <Text style={[styles.estNotes, { color: '#B45309' }]}>
                This estimate has expired. Your service advisor will send an updated estimate.
              </Text>
            ) : isNegotiating ? (
              <View style={{ gap: 10 }}>
                <Text style={[styles.estNotes, { color: c.text }]}>
                  You declined this estimate{activeEstimate.responseNotes ? ` (${activeEstimate.responseNotes})` : ''}. Our service advisor will contact you to discuss options or send a revised estimate. You can also change your mind below.
                </Text>
                <TouchableOpacity
                  onPress={() => setEstimateModalVisible(true)}
                  style={[styles.reviewEstBtn, { backgroundColor: c.accent }]}
                >
                  <Text style={styles.reviewEstBtnText}>Reconsider & Approve</Text>
                  <ChevronRight size={16} color="#061A38" />
                </TouchableOpacity>
              </View>
            ) : activeEstimate.status === 'SENT_TO_CUSTOMER' ? (
              <TouchableOpacity
                onPress={() => setEstimateModalVisible(true)}
                style={[styles.reviewEstBtn, { backgroundColor: c.accent }]}
              >
                <Text style={styles.reviewEstBtnText}>Review & Approve Estimate</Text>
                <ChevronRight size={16} color="#061A38" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => setEstimateModalVisible(true)}
                style={[styles.viewEstBtn, { borderColor: c.border }]}
              >
                <Text style={[styles.viewEstBtnText, { color: c.text }]}>View Itemized Breakdown</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Custody Check-In Sheet (If Checked In) */}
        {request.custodyRecords.length > 0 && (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.cardHeader}>
              <ShieldCheck size={20} color="#10B981" />
              <Text style={[styles.sectionTitle, { color: c.text }]}>Vehicle Custody Verification</Text>
            </View>

            {request.custodyRecords.map(cr => (
              <View key={cr.id} style={styles.custodyBlock}>
                <View style={styles.custodyRow}>
                  <Text style={[styles.custodyLabel, { color: c.textMuted }]}>Type:</Text>
                  <Text style={[styles.custodyVal, { color: c.text }]}>{cr.type.replace(/_/g, ' ')}</Text>
                </View>
                <View style={styles.custodyRow}>
                  <Text style={[styles.custodyLabel, { color: c.textMuted }]}>Recorded Odometer:</Text>
                  <Text style={[styles.custodyVal, { color: c.text }]}>{cr.odometerKm.toLocaleString()} km</Text>
                </View>
                <View style={styles.custodyRow}>
                  <Text style={[styles.custodyLabel, { color: c.textMuted }]}>Fuel / Charge Level:</Text>
                  <Text style={[styles.custodyVal, { color: c.text }]}>{cr.fuelChargeLevel}</Text>
                </View>
                <View style={styles.custodyRow}>
                  <Text style={[styles.custodyLabel, { color: c.textMuted }]}>Keys Received:</Text>
                  <Text style={[styles.custodyVal, { color: c.text }]}>{cr.keyCount}</Text>
                </View>
                {cr.preExistingDamageNotes && (
                  <View style={styles.custodyRow}>
                    <Text style={[styles.custodyLabel, { color: c.textMuted }]}>Pre-Existing Damages:</Text>
                    <Text style={[styles.custodyVal, { color: c.text }]}>{cr.preExistingDamageNotes}</Text>
                  </View>
                )}
                <View style={styles.custodyRow}>
                  <Text style={[styles.custodyLabel, { color: c.textMuted }]}>Handover By:</Text>
                  <Text style={[styles.custodyVal, { color: c.text }]}>{cr.handoverByPerson}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Technical Diagnosis Summary (If Done) */}
        {request.diagnoses.length > 0 && (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.cardHeader}>
              <Wrench size={20} color={c.accent} />
              <Text style={[styles.sectionTitle, { color: c.text }]}>Technician Diagnosis</Text>
            </View>
            {request.diagnoses.map(d => (
              <View key={d.id} style={styles.diagBlock}>
                <Text style={[styles.diagSummary, { color: c.text }]}>{d.diagnosticSummary}</Text>
                <Text style={[styles.diagFindings, { color: c.textMuted }]}>{d.detailedFindings}</Text>
                <View style={styles.diagActionBox}>
                  <Text style={[styles.diagActionLabel, { color: c.textMuted }]}>Recommended Action:</Text>
                  <Text style={[styles.diagActionText, { color: c.text }]}>{d.recommendedAction}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Billing & Payment Card */}
        {(() => {
          const verifiedPaid = Math.round(Number(request.verifiedPaidPaise || 0) / 100);
          const outstanding = Math.round(Number(request.outstandingBalancePaise || 0) / 100);
          const latestInvoice = request.invoices && request.invoices.length > 0 ? request.invoices[0] : null;
          const pStatus = request.servicePaymentStatus || (outstanding === 0 && verifiedPaid > 0 ? 'PAID_IN_FULL' : (verifiedPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID'));

          let pBadgeColor = '#EF4444';
          let pBadgeBg = 'rgba(239, 68, 68, 0.15)';
          let pBadgeText = 'PAYMENT PENDING';
          const isCancelled = request.status === 'CANCELLED';
          if (pStatus === 'PAID_IN_FULL' || (outstanding === 0 && verifiedPaid > 0)) {
            pBadgeColor = '#10B981';
            pBadgeBg = 'rgba(16, 185, 129, 0.15)';
            pBadgeText = 'PAID IN FULL';
          } else if (pStatus === 'PARTIALLY_PAID' || verifiedPaid > 0) {
            pBadgeColor = '#F59E0B';
            pBadgeBg = 'rgba(245, 158, 11, 0.15)';
            pBadgeText = 'PARTIALLY PAID';
          }
          if (isCancelled) {
            pBadgeColor = verifiedPaid > 0 ? '#F59E0B' : '#6B7280';
            pBadgeBg = verifiedPaid > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(107, 114, 128, 0.15)';
            pBadgeText = verifiedPaid > 0 ? 'CANCELLED · REFUND DUE' : 'CANCELLED';
          }

          return (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <CreditCard size={20} color={c.accent} />
                  <Text style={[styles.sectionTitle, { color: c.text }]}>Billing & Payment</Text>
                </View>
                <View style={{ backgroundColor: pBadgeBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: `${pBadgeColor}40` }}>
                  <Text style={{ color: pBadgeColor, fontSize: 11, fontWeight: '700' }}>{pBadgeText}</Text>
                </View>
              </View>

              {/* Tax Invoice Details if Issued */}
              {latestInvoice && (
                <View style={{ backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F9FAFB', padding: 12, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: c.border }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: c.accent }}>
                      Tax Invoice #{latestInvoice.invoiceNumber}
                    </Text>
                    <Text style={{ fontSize: 11, color: c.textMuted }}>
                      {new Date(latestInvoice.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: c.textMuted }}>Subtotal:</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: c.text }}>₹{Math.round(Number(latestInvoice.subtotalPaise) / 100).toLocaleString('en-IN')}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: c.textMuted }}>Prepayments Credited:</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#10B981' }}>-₹{(Math.round(Number(latestInvoice.priorPaymentsCreditedPaise) / 100) + Math.round(Number(latestInvoice.diagnosticFeeCreditPaise) / 100)).toLocaleString('en-IN')}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: c.textMuted }}>GST (18%):</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: c.text }}>₹{(Math.round(Number(latestInvoice.cgstPaise) / 100) + Math.round(Number(latestInvoice.sgstPaise) / 100)).toLocaleString('en-IN')}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: c.border, paddingTop: 6, marginTop: 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>Net Invoice Total:</Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: c.accent }}>₹{Math.round(Number(latestInvoice.totalAmountPaise) / 100).toLocaleString('en-IN')}</Text>
                  </View>
                </View>
              )}

              {/* KPI Numbers */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F3F4F6', padding: 12, borderRadius: 8 }}>
                  <Text style={{ fontSize: 11, color: c.textMuted, fontWeight: '600', textTransform: 'uppercase' }}>Verified Paid</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#10B981', marginTop: 2 }}>₹{verifiedPaid.toLocaleString('en-IN')}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F3F4F6', padding: 12, borderRadius: 8 }}>
                  <Text style={{ fontSize: 11, color: c.textMuted, fontWeight: '600', textTransform: 'uppercase' }}>Balance Due</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: !isCancelled && outstanding > 0 ? '#EF4444' : '#10B981', marginTop: 2 }}>₹{(isCancelled ? 0 : outstanding).toLocaleString('en-IN')}</Text>
                </View>
              </View>

              {isCancelled && (
                <View style={{ backgroundColor: isDark ? 'rgba(245, 158, 11, 0.08)' : '#FFFBEB', borderColor: 'rgba(245, 158, 11, 0.35)', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>
                    This booking was cancelled. No payment is pending.
                  </Text>
                  {verifiedPaid > 0 ? (
                    <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>
                      The ₹{verifiedPaid.toLocaleString('en-IN')} you paid will be refunded to your original payment method.
                    </Text>
                  ) : null}
                </View>
              )}

              {/* Action Button: Pay Remaining Balance */}
              {!isCancelled && outstanding > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setCustomPayAmountRupees(outstanding);
                    setPayBalanceModalVisible(true);
                  }}
                  style={{
                    backgroundColor: c.accent,
                    paddingVertical: 12,
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                  }}
                >
                  <CreditCard size={18} color="#061A38" />
                  <Text style={{ color: '#061A38', fontWeight: '800', fontSize: 14 }}>
                    Pay Remaining Balance (₹{outstanding.toLocaleString('en-IN')})
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

        {/* Transaction History Card */}
        {request.payments && request.payments.length > 0 && (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[styles.sectionTitle, { color: c.text }]}>Transaction Records ({request.payments.length})</Text>
            </View>
            {request.payments.map((p, idx) => {
              const pAmt = Math.round(Number(p.amountPaise) / 100);
              return (
                <View
                  key={p.id || idx}
                  style={{
                    paddingVertical: 10,
                    borderBottomWidth: idx < request.payments.length - 1 ? 1 : 0,
                    borderBottomColor: c.border,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>
                      {p.type.replace(/_/g, ' ')}
                    </Text>
                    <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
                      {p.paymentGateway || 'RAZORPAY'} · {p.gatewayPaymentId || 'Counter'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: c.text }}>
                      ₹{pAmt.toLocaleString('en-IN')}
                    </Text>
                    <View style={{ marginTop: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: p.status === 'PAID_VERIFIED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: p.status === 'PAID_VERIFIED' ? '#10B981' : '#F59E0B' }}>
                        {p.status}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Live Service Timeline */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.text, marginBottom: 12 }]}>
            Service Activity Timeline
          </Text>

          {request.historyEvents.map((evt, idx) => {
            const isLast = idx === request.historyEvents.length - 1;
            return (
              <View key={evt.id} style={styles.timelineRow}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, { backgroundColor: isLast ? c.accent : '#10B981' }]} />
                  {!isLast && <View style={[styles.timelineLine, { backgroundColor: c.border }]} />}
                </View>
                <View style={styles.timelineRight}>
                  <Text style={[styles.timelineTitle, { color: c.text }]}>{evt.title}</Text>
                  <Text style={[styles.timelineDesc, { color: c.textMuted }]}>{evt.description}</Text>
                  <Text style={[styles.timelineTime, { color: c.textMuted }]}>
                    {new Date(evt.createdAt).toLocaleString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Cancellation Option */}
        {canCancel && (
          <TouchableOpacity
            onPress={() => setCancelModalVisible(true)}
            style={[styles.cancelBtn, { borderColor: '#EF4444' }]}
          >
            <XCircle size={16} color="#EF4444" />
            <Text style={styles.cancelBtnText}>Cancel Service Request</Text>
          </TouchableOpacity>
        )}
      </KeyboardScrollView>

      {/* Estimate Breakdown & Approval Modal */}
      <KeyboardAwareSheet
        ref={estimateScrollRef}
        visible={estimateModalVisible}
        onClose={() => setEstimateModalVisible(false)}
        locked={respondingToEstimate}
        title="Itemized Estimate Review"
        footer={
          activeEstimate && canRespondToEstimate ? (
            <View style={styles.decisionBtnsRow}>
              <TouchableOpacity
                onPress={() => handleEstimateDecision('APPROVE')}
                disabled={respondingToEstimate}
                style={[styles.approveBtn, { backgroundColor: '#10B981' }]}
              >
                {respondingToEstimate ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.approveBtnText}>Approve & Proceed</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleEstimateDecision('DECLINE')}
                disabled={respondingToEstimate}
                style={[styles.declineBtn, { borderColor: '#EF4444' }]}
              >
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
            </View>
          ) : undefined
        }
      >
        {activeEstimate && (
          <>
        {/* Items Table */}
        <View style={[styles.itemsTable, { borderColor: c.border }]}>
          {activeEstimate.items.map((item) => {
            const optional = !item.isMandatory;
            const deferred = canRespondToEstimate ? deferredItemIds.includes(item.id) : item.isApprovedByCustomer === false;
            return (
              <View key={item.id} style={[styles.tableRow, { borderBottomColor: c.border, opacity: deferred ? 0.55 : 1 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: c.text, textDecorationLine: deferred ? 'line-through' : 'none' }]}>{item.description}</Text>
                  <Text style={[styles.itemCat, { color: c.textMuted }]}>
                    {item.category} {item.quantity > 1 ? `· Qty: ${item.quantity}` : ''}
                    {' · '}
                    {deferred && !canRespondToEstimate ? 'Deferred by you' : optional ? 'Recommended (optional)' : 'Required'}
                  </Text>
                </View>
                {canRespondToEstimate && optional ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Switch
                      accessibilityLabel={`Include ${item.description}`}
                      value={!deferred}
                      onValueChange={(include) =>
                        setDeferredItemIds((prev) => (include ? prev.filter((id) => id !== item.id) : [...prev, item.id]))
                      }
                      trackColor={{ false: '#9CA3AF', true: c.accent }}
                    />
                    <Text style={[styles.itemPrice, { color: c.text }]}>
                      ₹{(Number(item.totalPricePaise) / 100).toLocaleString('en-IN')}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.itemPrice, { color: c.text }]}>
                    ₹{(Number(item.totalPricePaise) / 100).toLocaleString('en-IN')}
                  </Text>
                )}
              </View>
            );
          })}
        </View>

        {/* Subtotals & Taxes */}
        <View style={styles.breakdownBox}>
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, { color: c.textMuted }]}>Parts & Labour Subtotal</Text>
            <Text style={[styles.breakdownVal, { color: c.text }]}>
              ₹{(Number(activeEstimate.subtotalPaise) / 100).toLocaleString('en-IN')}
            </Text>
          </View>

          {Number(activeEstimate.pickupDropFeePaise) > 0 && (
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: c.textMuted }]}>Doorstep Logistics Fee</Text>
              <Text style={[styles.breakdownVal, { color: c.text }]}>
                ₹{(Number(activeEstimate.pickupDropFeePaise) / 100).toLocaleString('en-IN')}
              </Text>
            </View>
          )}

          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, { color: c.textMuted }]}>GST (18% Central + State)</Text>
            <Text style={[styles.breakdownVal, { color: c.text }]}>
              ₹{((Number(activeEstimate.cgstPaise) + Number(activeEstimate.sgstPaise)) / 100).toLocaleString('en-IN')}
            </Text>
          </View>

          <View style={[styles.totalRow, { borderTopColor: c.border }]}>
            <Text style={[styles.totalLabel, { color: c.text }]}>
              {canRespondToEstimate && deferredItemIds.length > 0 ? 'Your Total' : 'Total Amount'}
            </Text>
            <Text style={[styles.totalVal, { color: c.accent }]}>
              ₹{(
                canRespondToEstimate && deferredItemIds.length > 0
                  ? Number(previewApprovedTotals(activeEstimate.items, new Set(deferredItemIds), activeEstimate.pickupDropFeePaise, activeEstimate.diagnosticFeePaise, activeEstimate.discountPaise).totalPaise) / 100
                  : Number(activeEstimate.totalAmountPaise) / 100
              ).toLocaleString('en-IN')}
            </Text>
          </View>
        </View>

            {canRespondToEstimate && (
              <View style={styles.decisionWrap}>
                <Text style={[styles.decisionPrompt, { color: c.text }]}>Your decision</Text>
                <Text style={{ fontSize: 12, color: c.textMuted, marginBottom: 6 }}>
                  If you decline, tell us why so the workshop can offer a better option.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {([
                    ['TOO_EXPENSIVE', 'Too expensive'],
                    ['WANT_SECOND_OPINION', 'Want a second opinion'],
                    ['NOT_NEEDED_NOW', 'Not needed now'],
                    ['OTHER', 'Other'],
                  ] as Array<[EstimateDeclineReason, string]>).map(([code, label]) => {
                    const active = declineReason === code;
                    return (
                      <TouchableOpacity
                        key={code}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => setDeclineReason(active ? null : code)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? c.accent : c.border,
                          backgroundColor: active ? 'rgba(247, 181, 3, 0.15)' : 'transparent',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: c.text }}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  value={estimateNotes}
                  onChangeText={setEstimateNotes}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  placeholder="Optional notes or questions for service advisor..."
                  placeholderTextColor={c.textMuted}
                  style={[styles.notesInput, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
                />
              </View>
            )}
          </>
        )}
      </KeyboardAwareSheet>

      {/* Cancellation Modal */}
      <KeyboardAwareSheet
        ref={cancelScrollRef}
        visible={cancelModalVisible}
        onClose={() => setCancelModalVisible(false)}
        locked={cancelling}
        animationType="fade"
        title="Cancel Service Booking?"
        closeLabel="Keep"
        footer={
          <View style={styles.decisionBtnsRow}>
            <TouchableOpacity
              onPress={handleCancelRequest}
              disabled={cancelling}
              style={[styles.confirmCancelBtn, { backgroundColor: '#EF4444' }]}
            >
              {cancelling ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmCancelBtnText}>Yes, Cancel</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Keyboard.dismiss();
                setCancelModalVisible(false);
              }}
              style={[styles.cancelDismissBtn, { borderColor: c.border }]}
            >
              <Text style={[styles.cancelDismissText, { color: c.text }]}>Keep Booking</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <Text style={[styles.cancelPromptText, { color: c.textMuted }]}>
          Please provide a brief reason for cancelling. Your vehicle slot will be released.
        </Text>
        <TextInput
          value={cancelReason}
          onChangeText={setCancelReason}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          placeholder="e.g. Schedule changed / Will book next week"
          placeholderTextColor={c.textMuted}
          style={[styles.notesInput, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
        />
      </KeyboardAwareSheet>

      {/* Pay Balance Modal */}
      <KeyboardAwareSheet
        ref={paymentScrollRef}
        visible={payBalanceModalVisible}
        onClose={() => setPayBalanceModalVisible(false)}
        locked={payingBalance}
        title="Settle Outstanding Balance"
        footer={
          <TouchableOpacity
            onPress={handlePayBalance}
            disabled={payingBalance || customPayAmountRupees <= 0}
            style={{
              backgroundColor: c.accent,
              paddingVertical: 14,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {payingBalance ? (
              <ActivityIndicator size="small" color="#061A38" />
            ) : (
              <Text style={{ color: '#061A38', fontWeight: '800', fontSize: 15 }}>
                Authorize & Pay ₹{customPayAmountRupees.toLocaleString('en-IN')}
              </Text>
            )}
          </TouchableOpacity>
        }
      >
        <SandboxPaymentBanner />
        <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 12 }}>
          Make an immediate secure payment via Razorpay UPI, Card, or Net Banking to settle your service balance.
        </Text>

        <Text style={{ fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 4 }}>
          Amount to Pay (₹)
        </Text>
        <TextInput
          style={{
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F3F4F6',
            color: c.text,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 8,
            padding: 12,
            fontSize: 16,
            fontWeight: '700',
            marginBottom: 16,
          }}
          keyboardType="numeric"
          value={String(customPayAmountRupees)}
          onChangeText={t => setCustomPayAmountRupees(Number(t) || 0)}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />

        <View style={{ gap: 8, marginBottom: 20 }}>
          {[
            { id: 'RAZORPAY_UPI', label: 'UPI (GPay / PhonePe / Paytm)' },
            { id: 'RAZORPAY_CARD', label: 'Credit / Debit Card' },
            { id: 'NET_BANKING', label: 'Net Banking' },
          ].map(opt => (
            <TouchableOpacity
              key={opt.id}
              onPress={() => setPayMethod(opt.id as any)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: payMethod === opt.id ? c.accent : c.border,
                backgroundColor: payMethod === opt.id ? 'rgba(247, 181, 3, 0.1)' : 'transparent',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: payMethod === opt.id ? '700' : '500', color: c.text }}>
                {opt.label}
              </Text>
              {payMethod === opt.id && <CheckCircle size={16} color={c.accent} />}
            </TouchableOpacity>
          ))}
        </View>
      </KeyboardAwareSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  smallBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  smallBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#061A38',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 11,
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  scrollContent: {
    padding: space.lg,
    gap: space.lg,
  },
  safetyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  safetyBannerTextWrap: {
    flex: 1,
  },
  safetyBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 2,
  },
  safetyBannerDesc: {
    fontSize: 12,
    color: '#B91C1C',
    lineHeight: 16,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardTitleWrap: {
    flex: 1,
  },
  carName: {
    fontSize: 16,
    fontWeight: '700',
  },
  carSub: {
    fontSize: 12,
    marginTop: 2,
  },
  gridRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  gridCol: {
    flex: 1,
    gap: 4,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gridLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
  },
  gridVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  hubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  hubName: {
    fontSize: 13,
    fontWeight: '700',
  },
  hubAddress: {
    fontSize: 11,
  },
  estimateCard: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: space.md,
    gap: 12,
  },
  estHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  estTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  estTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  estStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  estStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  estAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  estAmountLabel: {
    fontSize: 13,
  },
  estAmountVal: {
    fontSize: 18,
    fontWeight: '800',
  },
  estNotes: {
    fontSize: 12,
    lineHeight: 16,
  },
  reviewEstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  reviewEstBtnText: {
    color: '#061A38',
    fontSize: 14,
    fontWeight: '700',
  },
  viewEstBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginTop: 4,
  },
  viewEstBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  custodyBlock: {
    gap: 6,
  },
  custodyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  custodyLabel: {
    fontSize: 13,
  },
  custodyVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  diagBlock: {
    gap: 6,
  },
  diagSummary: {
    fontSize: 14,
    fontWeight: '700',
  },
  diagFindings: {
    fontSize: 13,
    lineHeight: 18,
  },
  diagActionBox: {
    padding: 10,
    borderRadius: radius.md,
    gap: 4,
  },
  diagActionLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  diagActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 20,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginVertical: 4,
  },
  timelineRight: {
    flex: 1,
    paddingBottom: 16,
    gap: 2,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  timelineDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  timelineTime: {
    fontSize: 11,
    marginTop: 2,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginVertical: 8,
  },
  cancelBtnText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    maxHeight: '90%',
    flexShrink: 1,
    padding: space.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalClose: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalScroll: {
    flexShrink: 1,
    maxHeight: 500,
  },
  modalScrollContent: {
    paddingBottom: space.md,
  },
  paymentScrollContent: {
    padding: space.lg,
    paddingBottom: space.xl,
  },
  paymentScroll: {
    flexShrink: 1,
  },
  itemsTable: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemCat: {
    fontSize: 11,
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '700',
  },
  breakdownBox: {
    gap: 8,
    marginVertical: 14,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownLabel: {
    fontSize: 13,
  },
  breakdownVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  totalVal: {
    fontSize: 17,
    fontWeight: '800',
  },
  decisionWrap: {
    gap: 10,
    marginTop: 8,
    marginBottom: 20,
  },
  decisionPrompt: {
    fontSize: 14,
    fontWeight: '700',
  },
  notesInput: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  decisionBtnsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  approveBtn: {
    flex: 2,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  declineBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtnText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  cancelSheet: {
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: space.lg,
    gap: 12,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: '55%',
  },
  cancelScroll: {
    flexGrow: 0,
  },
  cancelPromptText: {
    fontSize: 13,
    lineHeight: 18,
  },
  confirmCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  cancelDismissBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelDismissText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
