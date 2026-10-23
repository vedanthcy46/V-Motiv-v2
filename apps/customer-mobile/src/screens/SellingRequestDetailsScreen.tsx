import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clock,
  MapPin,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from 'lucide-react-native';
import { customer } from '../services/customer';
import { formatPaise } from '../format';
import { color, radius, space } from '../theme';
import type { RootStack } from '../navigation/types';
import type { AcquisitionOffer, SellingRequest } from '../types';

type Props = NativeStackScreenProps<RootStack, 'SellingRequestDetails'>;

const TIMELINE_STEPS = [
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'QUALIFYING', label: 'Under Review' },
  { key: 'INSPECTION_SCHEDULED', label: 'Inspection' },
  { key: 'OFFER_PENDING', label: 'Valuation' },
  { key: 'OFFERED', label: 'Offer Made' },
  { key: 'ACCEPTED', label: 'Completed' },
];

export function SellingRequestDetailsScreen({ route, navigation }: Props) {
  const { leadId } = route.params;
  const [lead, setLead] = useState<SellingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [declineModalVisible, setDeclineModalVisible] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<AcquisitionOffer | null>(null);
  const [declineReason, setDeclineReason] = useState('');

  function loadLead() {
    setLoading(true);
    customer
      .sellingRequest(leadId)
      .then(setLead)
      .catch((err) => {
        Alert.alert('Error', err.message || 'Failed to load request details');
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadLead();
  }, [leadId]);

  async function handleAcceptOffer(offer: AcquisitionOffer) {
    Alert.alert(
      'Accept Acquisition Offer',
      `Are you sure you want to accept the offer of ${formatPaise(offer.offerAmountPaise)}? Once accepted, our operations team will coordinate payment and vehicle transfer.`,
      [
        { text: 'Review Again', style: 'cancel' },
        {
          text: 'Confirm & Accept',
          style: 'default',
          onPress: async () => {
            setActionLoading(true);
            try {
              await customer.acceptOffer(offer.id, offer.version);
              Alert.alert('Offer accepted', 'Your response was recorded. Operations will contact you about the next verified handover and payment steps.');
              loadLead();
            } catch (err: any) {
              Alert.alert('Unable to Accept', err.message || 'Offer could not be accepted. It may have expired or been updated.');
              loadLead();
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  }

  async function handleDeclineOffer() {
    if (!selectedOffer) return;
    setActionLoading(true);
    try {
      await customer.declineOffer(selectedOffer.id, {
        version: selectedOffer.version,
        reason: declineReason.trim() || undefined,
      });
      setDeclineModalVisible(false);
      setDeclineReason('');
      Alert.alert('Offer Declined', 'We have recorded your response. A representative may reach out if a revised offer can be considered.');
      loadLead();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to decline offer');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancelRequest() {
    Alert.alert(
      'Cancel Selling Request',
      'Are you sure you want to cancel this selling request?',
      [
        { text: 'Keep Request', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await customer.cancelSellingRequest(leadId, 'Cancelled by customer');
              Alert.alert('Cancelled', 'Your selling request has been cancelled.');
              loadLead();
            } catch (err: any) {
              Alert.alert('Unable to Cancel', err.message || 'This request cannot be cancelled at this stage.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={22} color={color.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Selling Request</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={color.yellow} />
        </View>
      </SafeAreaView>
    );
  }

  if (!lead) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={22} color={color.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Selling Request</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>Request details not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const activeOffer = lead.offers?.find((o) => o.status === 'OFFERED');
  const acceptedOffer = lead.offers?.find((o) => o.status === 'ACCEPTED');
  const isCancellable = ['SUBMITTED', 'QUALIFYING', 'INSPECTION_SCHEDULED'].includes(lead.status);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={color.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Selling Request</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Car Header */}
        <View style={styles.carHeaderCard}>
          <Text style={styles.carTitle}>
            {lead.manufacturingYear} {lead.make} {lead.model}
          </Text>
          {lead.variant ? <Text style={styles.carVariant}>{lead.variant}</Text> : null}
          <View style={styles.refRow}>
            <Text style={styles.refLabel}>Reference:</Text>
            <Text style={styles.refCode}>{lead.referenceCode.slice(0, 8).toUpperCase()}</Text>
          </View>
        </View>

        {/* Status Timeline */}
        <View style={styles.timelineCard}>
          <Text style={styles.sectionTitle}>Request Status</Text>
          <View style={styles.timelineRow}>
            {TIMELINE_STEPS.map((step, idx) => {
              const currentStepIdx = TIMELINE_STEPS.findIndex((s) => s.key === lead.status);
              const isPast = idx < currentStepIdx;
              const isCurrent = idx === currentStepIdx;
              return (
                <View key={step.key} style={styles.timelineStep}>
                  <View
                    style={[
                      styles.stepDot,
                      isPast && styles.stepDotDone,
                      isCurrent && styles.stepDotActive,
                    ]}
                  >
                    {isPast ? <CheckCircle size={14} color={color.navy} /> : null}
                  </View>
                  <Text
                    style={[
                      styles.stepLabel,
                      (isPast || isCurrent) && styles.stepLabelActive,
                    ]}
                  >
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Active Acquisition Offer Card */}
        {activeOffer ? (
          <View style={styles.offerCard}>
            <View style={styles.offerBadge}>
              <Text style={styles.offerBadgeText}>FINAL ACQUISITION OFFER</Text>
            </View>
            <Text style={styles.offerPrice}>{formatPaise(activeOffer.offerAmountPaise)}</Text>
            <Text style={styles.offerValidity}>
              Valid until: {new Date(activeOffer.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
            {activeOffer.terms ? (
              <Text style={styles.offerTerms}>{activeOffer.terms}</Text>
            ) : null}

            <View style={styles.offerActions}>
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={() => handleAcceptOffer(activeOffer)}
                disabled={actionLoading}
              >
                <ThumbsUp size={18} color={color.navy} />
                <Text style={styles.acceptBtnText}>Accept Offer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.declineBtn}
                onPress={() => {
                  setSelectedOffer(activeOffer);
                  setDeclineModalVisible(true);
                }}
                disabled={actionLoading}
              >
                <ThumbsDown size={18} color="#EF4444" />
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {acceptedOffer ? (
          <View style={styles.acceptedBanner}>
            <CheckCircle size={24} color="#22C55E" />
            <View style={styles.acceptedBannerText}>
              <Text style={styles.acceptedTitle}>Offer Accepted ({formatPaise(acceptedOffer.offerAmountPaise)})</Text>
              <Text style={styles.acceptedSubtitle}>
                Your acceptance is recorded. Operations will contact you with verified documentation and payment next steps.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Evaluation / Inspection Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Evaluation & Inspection</Text>
          {lead.inspectionDate ? (
            <View style={styles.infoRow}>
              <Calendar size={18} color={color.yellow} />
              <Text style={styles.infoText}>
                Date: {lead.inspectionDate.slice(0, 10)}
              </Text>
            </View>
          ) : null}
          {lead.inspectionTimeSlot ? (
            <View style={styles.infoRow}>
              <Clock size={18} color={color.yellow} />
              <Text style={styles.infoText}>Slot: {lead.inspectionTimeSlot}</Text>
            </View>
          ) : null}
          <View style={styles.infoRow}>
            <MapPin size={18} color={color.yellow} />
            <Text style={styles.infoText}>
              Location: {lead.inspectionLocationType === 'HOME' ? `Doorstep (${lead.inspectionAddress || lead.city})` : `V MOTIV Hub (${lead.city})`}
            </Text>
          </View>
        </View>

        {/* Vehicle Specs Submitted */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Submitted Specifications</Text>
          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Odometer</Text>
              <Text style={styles.gridValue}>{lead.odometerKm.toLocaleString()} km</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Fuel Type</Text>
              <Text style={styles.gridValue}>{lead.fuelType}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Transmission</Text>
              <Text style={styles.gridValue}>{lead.transmission}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Ownership</Text>
              <Text style={styles.gridValue}>{lead.ownershipCount ? `${lead.ownershipCount} Owner` : '1st Owner'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Accident Free</Text>
              <Text style={styles.gridValue}>{lead.accidentHistory === 'NO' ? 'Yes' : 'Not sure'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Service History</Text>
              <Text style={styles.gridValue}>{lead.serviceHistory || 'Standard'}</Text>
            </View>
          </View>
        </View>

        {/* Cancellation Option */}
        {isCancellable ? (
          <TouchableOpacity
            style={styles.cancelActionBtn}
            onPress={handleCancelRequest}
            disabled={actionLoading}
          >
            <XCircle size={18} color="#EF4444" />
            <Text style={styles.cancelActionBtnText}>Cancel Selling Request</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {/* Decline Feedback Modal */}
      <Modal
        visible={declineModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeclineModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Decline Offer</Text>
            <Text style={styles.modalSubtitle}>
              Please tell us why you are declining so we can review alternative possibilities:
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Expected a higher price, sold elsewhere"
              placeholderTextColor={color.muted}
              multiline
              numberOfLines={4}
              value={declineReason}
              onChangeText={setDeclineReason}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalBackBtn}
                onPress={() => setDeclineModalVisible(false)}
              >
                <Text style={styles.modalBackBtnText}>Keep Offer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalDeclineConfirmBtn}
                onPress={handleDeclineOffer}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color={color.white} />
                ) : (
                  <Text style={styles.modalDeclineConfirmBtnText}>Decline Offer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  backBtn: {
    padding: space.xs,
  },
  headerTitle: {
    color: color.white,
    fontSize: 16,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: color.muted,
    fontSize: 14,
  },
  content: {
    padding: space.md,
    paddingBottom: space.xxl,
  },
  carHeaderCard: {
    backgroundColor: color.navy,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
    marginBottom: space.md,
  },
  carTitle: {
    color: color.white,
    fontSize: 18,
    fontWeight: '700',
  },
  carVariant: {
    color: color.muted,
    fontSize: 13,
    marginTop: 2,
  },
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.sm,
  },
  refLabel: {
    color: color.muted,
    fontSize: 12,
  },
  refCode: {
    color: color.yellow,
    fontSize: 12,
    fontWeight: '700',
  },
  timelineCard: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
    marginBottom: space.md,
  },
  sectionTitle: {
    color: color.white,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: space.sm,
  },
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  timelineStep: {
    alignItems: 'center',
    flex: 1,
  },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: color.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepDotDone: {
    backgroundColor: '#22C55E',
  },
  stepDotActive: {
    backgroundColor: color.yellow,
    borderWidth: 2,
    borderColor: color.white,
  },
  stepLabel: {
    color: color.muted,
    fontSize: 9,
    textAlign: 'center',
  },
  stepLabelActive: {
    color: color.white,
    fontWeight: '700',
  },
  offerCard: {
    backgroundColor: 'rgba(247, 181, 3, 0.1)',
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 2,
    borderColor: color.yellow,
    marginBottom: space.md,
    alignItems: 'center',
  },
  offerBadge: {
    backgroundColor: color.yellow,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    marginBottom: space.xs,
  },
  offerBadgeText: {
    color: color.navy,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  offerPrice: {
    color: color.white,
    fontSize: 28,
    fontWeight: '800',
    marginVertical: space.xs,
  },
  offerValidity: {
    color: color.muted,
    fontSize: 12,
    marginBottom: space.sm,
  },
  offerTerms: {
    color: '#D1D5DB',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: space.md,
    lineHeight: 18,
  },
  offerActions: {
    flexDirection: 'row',
    gap: space.md,
    width: '100%',
  },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    backgroundColor: color.yellow,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  acceptBtnText: {
    color: color.navy,
    fontSize: 14,
    fontWeight: '700',
  },
  declineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  declineBtnText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  acceptedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#22C55E',
    marginBottom: space.md,
  },
  acceptedBannerText: {
    flex: 1,
    marginLeft: space.sm,
  },
  acceptedTitle: {
    color: '#22C55E',
    fontSize: 15,
    fontWeight: '700',
  },
  acceptedSubtitle: {
    color: '#D1D5DB',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 18,
  },
  card: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
    marginBottom: space.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
  infoText: {
    color: '#E5E7EB',
    fontSize: 13,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  gridItem: {
    width: '45%',
  },
  gridLabel: {
    color: color.muted,
    fontSize: 11,
  },
  gridValue: {
    color: color.white,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  cancelActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.md,
    marginTop: space.sm,
  },
  cancelActionBtnText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.lg,
  },
  modalContent: {
    backgroundColor: color.card,
    borderRadius: radius.lg,
    padding: space.lg,
    width: '100%',
    borderWidth: 1,
    borderColor: color.border,
  },
  modalTitle: {
    color: color.white,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: space.xs,
  },
  modalSubtitle: {
    color: color.muted,
    fontSize: 13,
    marginBottom: space.md,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: color.canvas,
    borderRadius: radius.md,
    padding: space.md,
    color: color.white,
    fontSize: 13,
    borderWidth: 1,
    borderColor: color.border,
    textAlignVertical: 'top',
    height: 100,
    marginBottom: space.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: space.md,
    justifyContent: 'flex-end',
  },
  modalBackBtn: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  modalBackBtnText: {
    color: color.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  modalDeclineConfirmBtn: {
    backgroundColor: '#EF4444',
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  modalDeclineConfirmBtnText: {
    color: color.white,
    fontSize: 14,
    fontWeight: '700',
  },
});
