import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
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
import { CarBrandLogo } from '../components/CarBrandLogo';
import {
  cancelServiceRequest,
  fetchCustomerServiceRequest,
  respondToServiceEstimate,
  type ServiceRequestDetails,
} from '../services/service-api';

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

  // Cancel Modal State
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const loadDetails = useCallback(async () => {
    if (!requestId) return;
    try {
      const data = await fetchCustomerServiceRequest(requestId);
      setRequest(data);
    } catch (err: any) {
      console.warn('[SERVICE_DETAILS_ERROR]', err?.message || err);
      Alert.alert('Error', 'Could not load service request details.');
    } finally {
      setLoading(false);
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
    const activeEstimate = request?.estimates.find(e => e.status === 'SENT_TO_CUSTOMER');
    if (!activeEstimate) return;

    setRespondingToEstimate(true);
    try {
      await respondToServiceEstimate(activeEstimate.id, decision, estimateNotes);
      Alert.alert(
        decision === 'APPROVE' ? 'Estimate Approved' : 'Estimate Declined',
        decision === 'APPROVE'
          ? 'Work will now proceed. Our service advisor will keep you updated.'
          : 'Our service advisor has been notified and will contact you.'
      );
      setEstimateModalVisible(false);
      setEstimateNotes('');
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
  const canCancel = ['SUBMITTED', 'APPOINTMENT_SCHEDULED'].includes(request.status);

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

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
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
                  {activeEstimate.status.replace(/_/g, ' ')}
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

            {activeEstimate.status === 'SENT_TO_CUSTOMER' ? (
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
      </ScrollView>

      {/* Estimate Breakdown & Approval Modal */}
      <Modal
        visible={estimateModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEstimateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.text }]}>Itemized Estimate Review</Text>
              <TouchableOpacity onPress={() => setEstimateModalVisible(false)}>
                <Text style={[styles.modalClose, { color: c.accent }]}>Close</Text>
              </TouchableOpacity>
            </View>

            {activeEstimate && (
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {/* Items Table */}
                <View style={[styles.itemsTable, { borderColor: c.border }]}>
                  {activeEstimate.items.map((item, idx) => (
                    <View key={item.id} style={[styles.tableRow, { borderBottomColor: c.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemName, { color: c.text }]}>{item.description}</Text>
                        <Text style={[styles.itemCat, { color: c.textMuted }]}>
                          {item.category} {item.quantity > 1 ? `· Qty: ${item.quantity}` : ''}
                        </Text>
                      </View>
                      <Text style={[styles.itemPrice, { color: c.text }]}>
                        ₹{(Number(item.totalPricePaise) / 100).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  ))}
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
                    <Text style={[styles.totalLabel, { color: c.text }]}>Total Amount</Text>
                    <Text style={[styles.totalVal, { color: c.accent }]}>
                      ₹{(Number(activeEstimate.totalAmountPaise) / 100).toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>

                {/* Response Actions if Pending */}
                {activeEstimate.status === 'SENT_TO_CUSTOMER' && (
                  <View style={styles.decisionWrap}>
                    <Text style={[styles.decisionPrompt, { color: c.text }]}>Customer Decision:</Text>
                    <TextInput
                      value={estimateNotes}
                      onChangeText={setEstimateNotes}
                      placeholder="Optional notes or questions for service advisor..."
                      placeholderTextColor={c.textMuted}
                      style={[styles.notesInput, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
                    />

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
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Cancellation Modal */}
      <Modal
        visible={cancelModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setCancelModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.cancelSheet, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Cancel Service Booking?</Text>
            <Text style={[styles.cancelPromptText, { color: c.textMuted }]}>
              Please provide a brief reason for cancelling. Your vehicle slot will be released.
            </Text>
            <TextInput
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="e.g. Schedule changed / Will book next week"
              placeholderTextColor={c.textMuted}
              style={[styles.notesInput, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
            />
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
                onPress={() => setCancelModalVisible(false)}
                style={[styles.cancelDismissBtn, { borderColor: c.border }]}
              >
                <Text style={[styles.cancelDismissText, { color: c.text }]}>Keep Booking</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    width: 40,
    height: 40,
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
    maxHeight: 500,
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
    margin: 20,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: 12,
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
