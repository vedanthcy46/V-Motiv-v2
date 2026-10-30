import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  CheckCircle2,
  Clock,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from 'lucide-react-native';
import { customer } from '../services/customer';
import { formatPaise } from '../format';
import { color, radius, space, useAppTheme, type ThemeColors } from '../theme';
import { useKeyboard } from '../components/KeyboardAwareFormScreen';
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

const CANCEL_REASONS = [
  'Changed my mind',
  'Sold to private buyer',
  'Price expectation',
  'Rescheduling inspection',
  'Other reason',
];

export function SellingRequestDetailsScreen({ route, navigation }: Props) {
  const { leadId } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [lead, setLead] = useState<SellingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [declineModalVisible, setDeclineModalVisible] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<AcquisitionOffer | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const { height: windowHeight } = useWindowDimensions();
  const cancelScrollRef = useRef<ScrollView>(null);
  const declineScrollRef = useRef<ScrollView>(null);
  const { keyboardHeight, isKeyboardVisible } = useKeyboard();

  const dynamicModalMaxHeight = useMemo(() => {
    if (isKeyboardVisible) {
      const kbH = keyboardHeight > 0 ? keyboardHeight : 280;
      return Math.max(260, windowHeight - kbH - insets.top - 40);
    }
    return Math.min(windowHeight * 0.85, 600);
  }, [isKeyboardVisible, keyboardHeight, windowHeight, insets.top]);

  useEffect(() => {
    if (isKeyboardVisible && cancelModalVisible) {
      const timer = setTimeout(() => {
        cancelScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isKeyboardVisible, cancelModalVisible]);

  useEffect(() => {
    if (isKeyboardVisible && declineModalVisible) {
      const timer = setTimeout(() => {
        declineScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isKeyboardVisible, declineModalVisible]);

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

  function handleOpenCancelModal() {
    setCancelReason('');
    setCancelModalVisible(true);
  }

  async function handleConfirmCancel() {
    setActionLoading(true);
    try {
      await customer.cancelSellingRequest(
        leadId,
        cancelReason.trim() || 'Cancelled by customer'
      );
      setCancelModalVisible(false);
      Alert.alert('Request Cancelled', 'Your selling request has been cancelled.');
      loadLead();
    } catch (err: any) {
      Alert.alert('Unable to Cancel', err.message || 'This request cannot be cancelled at this stage.');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Selling Request</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brandAccent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!lead) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.textPrimary} />
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
  const isInspectionCompleted = Boolean(
    lead.inspection?.isCompleted ||
    ['OFFER_PENDING', 'OFFERED', 'ACCEPTED'].includes(lead.status)
  );
  const isCancellable = ['SUBMITTED', 'QUALIFYING', 'INSPECTION_SCHEDULED'].includes(lead.status) && !isInspectionCompleted;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Selling Request</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 48,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Car Header */}
        <View style={styles.carHeaderCard}>
          <Text style={styles.carTitle}>
            {lead.manufacturingYear} {lead.make} {lead.model}
          </Text>
          {lead.variant ? <Text style={styles.carVariant}>{lead.variant}</Text> : null}
          <View style={styles.refRow}>
            {lead.registrationNumber ? (
              <View style={styles.regPlateBadge}>
                <Text style={styles.regPlateBadgeText}>{lead.registrationNumber}</Text>
              </View>
            ) : null}
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

        {/* Valuation in Progress Callout */}
        {lead.status === 'OFFER_PENDING' && !activeOffer && (
          <View style={styles.valuationCallout}>
            <View style={styles.valuationIconWrap}>
              <Clock size={20} color={isDark ? '#FEF08A' : '#B45309'} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.valuationCalloutTitle}>Acquisition Offer in Preparation</Text>
              <Text style={styles.valuationCalloutSub}>
                Inspection is complete! Our pricing experts are reviewing the technical report and physical condition data to formulate your guaranteed acquisition purchase offer.
              </Text>
            </View>
          </View>
        )}

        {/* Evaluation / Inspection Card */}
        <View style={[styles.card, isInspectionCompleted && styles.inspectionDoneCard]}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.sectionTitle}>Evaluation & Inspection</Text>
            {isInspectionCompleted ? (
              <View style={styles.completedBadgePill}>
                <CheckCircle2 size={13} color="#10B981" />
                <Text style={styles.completedBadgePillText}>INSPECTION COMPLETED</Text>
              </View>
            ) : (
              <View style={styles.scheduledBadgePill}>
                <Clock size={13} color={isDark ? '#FEF08A' : '#B45309'} />
                <Text style={styles.scheduledBadgePillText}>SCHEDULED</Text>
              </View>
            )}
          </View>

          {isInspectionCompleted ? (
            <View style={styles.inspectionDoneBanner}>
              <View style={styles.doneBannerIconWrap}>
                <ShieldCheck size={22} color="#10B981" />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.inspectionDoneTitle}>180-Point Inspection Completed & Certified</Text>
                <Text style={styles.inspectionDoneSub}>
                  Our certified technician has completed the physical evaluation. Observations, vehicle condition ratings, and photographic evidence have been verified and sealed.
                </Text>
                {lead.inspection?.completedAt ? (
                  <Text style={styles.inspectionDoneDate}>
                    Certified on: {new Date(lead.inspection.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

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
              <Text style={styles.gridLabel}>Reg. Plate</Text>
              <Text style={[styles.gridValue, styles.regPlateVal]}>{lead.registrationNumber || 'Pending verification'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Variant</Text>
              <Text style={styles.gridValue}>{lead.variant || 'Standard'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Exterior Colour</Text>
              <Text style={styles.gridValue}>{lead.color || 'Standard'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Reg. / Mfg Year</Text>
              <Text style={styles.gridValue}>
                {lead.registrationYear ? `${lead.registrationYear} (Mfg ${lead.manufacturingYear})` : `${lead.manufacturingYear}`}
              </Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Registered City</Text>
              <Text style={styles.gridValue}>{lead.registrationCity || lead.city}</Text>
            </View>
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
              <Text style={styles.gridValue}>
                {lead.ownershipCount ? `${lead.ownershipCount}${lead.ownershipCount === 1 ? 'st' : lead.ownershipCount === 2 ? 'nd' : lead.ownershipCount === 3 ? 'rd' : 'th'} Owner` : '1st Owner'}
              </Text>
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
            onPress={handleOpenCancelModal}
            disabled={actionLoading}
          >
            <XCircle size={18} color="#EF4444" />
            <Text style={styles.cancelActionBtnText}>Cancel Selling Request</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {/* Cancel Selling Request Modal */}
      <Modal
        visible={cancelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!actionLoading) {
            Keyboard.dismiss();
            setCancelModalVisible(false);
          }
        }}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!actionLoading) {
                Keyboard.dismiss();
                setCancelModalVisible(false);
              }
            }}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
            style={[
              styles.keyboardAvoidWrap,
              isKeyboardVisible
                ? {
                    justifyContent: 'flex-end',
                    marginBottom: Platform.OS === 'android' ? keyboardHeight : 0,
                    paddingBottom: 12,
                  }
                : {
                    justifyContent: 'center',
                  },
            ]}
          >
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  maxHeight: dynamicModalMaxHeight,
                },
              ]}
            >
              <ScrollView
                ref={cancelScrollRef}
                bounces={false}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets={true}
                style={{ flexShrink: 1 }}
                contentContainerStyle={styles.modalScrollContent}
              >
                <View style={styles.modalHeaderRow}>
                  <View style={styles.modalIconWrap}>
                    <AlertCircle size={22} color="#EF4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                      Cancel Selling Request?
                    </Text>
                    <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
                      Please let us know why you are cancelling your selling request:
                    </Text>
                  </View>
                </View>

                {/* Quick reason chips */}
                <Text style={[styles.reasonSectionLabel, { color: colors.textSecondary }]}>
                  Select a reason:
                </Text>
                <View style={styles.reasonChipsRow}>
                  {CANCEL_REASONS.map((r) => {
                    const selected = cancelReason === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        activeOpacity={0.7}
                        onPress={() => setCancelReason(r)}
                        style={[
                          styles.reasonChip,
                          {
                            backgroundColor: selected
                              ? (isDark ? 'rgba(247, 181, 3, 0.15)' : '#FFFBEB')
                              : colors.surfaceSecondary,
                            borderColor: selected ? colors.brandAccent : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.reasonChipText,
                            {
                              color: selected
                                ? (isDark ? '#F7B503' : '#9A6500')
                                : colors.textSecondary,
                              fontWeight: selected ? '700' : '600',
                            },
                          ]}
                        >
                          {r}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.reasonSectionLabel, { color: colors.textSecondary }]}>
                  Additional details (optional):
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      backgroundColor: colors.surfaceSecondary,
                      color: colors.textPrimary,
                      borderColor: colors.border,
                    },
                  ]}
                  placeholder="e.g. Sold elsewhere or reconsidering timing…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                  value={cancelReason}
                  onChangeText={setCancelReason}
                  onFocus={() => {
                    setTimeout(() => {
                      cancelScrollRef.current?.scrollToEnd({ animated: true });
                    }, 120);
                    setTimeout(() => {
                      cancelScrollRef.current?.scrollToEnd({ animated: true });
                    }, 350);
                  }}
                />
              </ScrollView>

              <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.modalBackBtn, { borderColor: colors.border }]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setCancelModalVisible(false);
                  }}
                  disabled={actionLoading}
                >
                  <Text style={[styles.modalBackBtnText, { color: colors.textPrimary }]}>
                    Keep Request
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalCancelConfirmBtn}
                  onPress={handleConfirmCancel}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalCancelConfirmBtnText}>Cancel Request</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Decline Feedback Modal */}
      <Modal
        visible={declineModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!actionLoading) {
            Keyboard.dismiss();
            setDeclineModalVisible(false);
          }
        }}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!actionLoading) {
                Keyboard.dismiss();
                setDeclineModalVisible(false);
              }
            }}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
            style={[
              styles.keyboardAvoidWrap,
              isKeyboardVisible
                ? {
                    justifyContent: 'flex-end',
                    marginBottom: Platform.OS === 'android' ? keyboardHeight : 0,
                    paddingBottom: 12,
                  }
                : {
                    justifyContent: 'center',
                  },
            ]}
          >
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  maxHeight: dynamicModalMaxHeight,
                },
              ]}
            >
              <ScrollView
                ref={declineScrollRef}
                bounces={false}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets={true}
                style={{ flexShrink: 1 }}
                contentContainerStyle={styles.modalScrollContent}
              >
                <View style={styles.modalHeaderRow}>
                  <View style={[styles.modalIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                    <ThumbsDown size={20} color="#EF4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                      Decline Acquisition Offer
                    </Text>
                    <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
                      Please tell us why you are declining so our valuation team can review:
                    </Text>
                  </View>
                </View>

                <Text style={[styles.reasonSectionLabel, { color: colors.textSecondary }]}>
                  Reason for declining:
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      backgroundColor: colors.surfaceSecondary,
                      color: colors.textPrimary,
                      borderColor: colors.border,
                    },
                  ]}
                  placeholder="e.g. Expected a higher price, sold elsewhere…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                  value={declineReason}
                  onChangeText={setDeclineReason}
                  onFocus={() => {
                    setTimeout(() => {
                      declineScrollRef.current?.scrollToEnd({ animated: true });
                    }, 120);
                    setTimeout(() => {
                      declineScrollRef.current?.scrollToEnd({ animated: true });
                    }, 350);
                  }}
                />
              </ScrollView>

              <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.modalBackBtn, { borderColor: colors.border }]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setDeclineModalVisible(false);
                  }}
                  disabled={actionLoading}
                >
                  <Text style={[styles.modalBackBtnText, { color: colors.textPrimary }]}>
                    Keep Offer
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalDeclineConfirmBtn}
                  onPress={handleDeclineOffer}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalDeclineConfirmBtnText}>Decline Offer</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      padding: space.xs,
    },
    headerTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorText: {
      color: colors.textMuted,
      fontSize: 14,
    },
    content: {
      padding: space.md,
      paddingBottom: space.xxl,
    },
    carHeaderCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: space.md,
    },
    carTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '700',
    },
    carVariant: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: 2,
    },
    refRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      marginTop: space.sm,
    },
    regPlateBadge: {
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.12)' : 'rgba(11, 37, 69, 0.08)',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(247, 181, 3, 0.35)' : 'rgba(11, 37, 69, 0.25)',
      marginRight: 6,
    },
    regPlateBadgeText: {
      color: isDark ? colors.brandAccent : colors.brandNavy,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    refLabel: {
      color: colors.textMuted,
      fontSize: 12,
    },
    refCode: {
      color: colors.brandAccent,
      fontSize: 12,
      fontWeight: '700',
    },
    timelineCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: space.md,
    },
    sectionTitle: {
      color: colors.textPrimary,
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
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 4,
    },
    stepDotDone: {
      backgroundColor: '#22C55E',
    },
    stepDotActive: {
      backgroundColor: colors.brandAccent,
      borderWidth: 2,
      borderColor: colors.brandNavy,
    },
    stepLabel: {
      color: colors.textMuted,
      fontSize: 9,
      textAlign: 'center',
    },
    stepLabelActive: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    offerCard: {
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.1)' : 'rgba(247, 181, 3, 0.15)',
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 2,
      borderColor: colors.brandAccent,
      marginBottom: space.md,
      alignItems: 'center',
    },
    offerBadge: {
      backgroundColor: colors.brandAccent,
      paddingHorizontal: space.sm,
      paddingVertical: 4,
      borderRadius: radius.sm,
      marginBottom: space.xs,
    },
    offerBadgeText: {
      color: colors.brandNavy,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    offerPrice: {
      color: colors.textPrimary,
      fontSize: 28,
      fontWeight: '800',
      marginVertical: space.xs,
    },
    offerValidity: {
      color: colors.textMuted,
      fontSize: 12,
      marginBottom: space.sm,
    },
    offerTerms: {
      color: colors.textSecondary,
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
      backgroundColor: colors.brandAccent,
      paddingVertical: space.md,
      borderRadius: radius.md,
    },
    acceptBtnText: {
      color: colors.brandNavy,
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
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 2,
      lineHeight: 18,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: space.md,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: space.sm,
    },
    inspectionDoneCard: {
      borderColor: isDark ? 'rgba(16, 185, 129, 0.4)' : 'rgba(16, 185, 129, 0.35)',
    },
    completedBadgePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.pill,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
      borderWidth: 1,
      borderColor: 'rgba(16, 185, 129, 0.35)',
    },
    completedBadgePillText: {
      color: '#10B981',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    scheduledBadgePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.pill,
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.14)' : 'rgba(247, 181, 3, 0.1)',
      borderWidth: 1,
      borderColor: 'rgba(247, 181, 3, 0.35)',
    },
    scheduledBadgePillText: {
      color: isDark ? '#FEF08A' : '#B45309',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    inspectionDoneBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.md,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.08)',
      borderWidth: 1,
      borderColor: 'rgba(16, 185, 129, 0.3)',
      borderRadius: radius.md,
      padding: space.md,
      marginBottom: space.md,
    },
    doneBannerIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    inspectionDoneTitle: {
      color: '#10B981',
      fontWeight: '700',
      fontSize: 14,
    },
    inspectionDoneSub: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
    },
    inspectionDoneDate: {
      color: colors.textMuted,
      fontSize: 11,
      fontStyle: 'italic',
      marginTop: 2,
    },
    valuationCallout: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.md,
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.12)' : 'rgba(247, 181, 3, 0.08)',
      borderWidth: 1,
      borderColor: 'rgba(247, 181, 3, 0.35)',
      borderRadius: radius.md,
      padding: space.md,
      marginBottom: space.md,
    },
    valuationIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.2)' : 'rgba(247, 181, 3, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    valuationCalloutTitle: {
      color: isDark ? '#FEF08A' : '#B45309',
      fontWeight: '700',
      fontSize: 14,
    },
    valuationCalloutSub: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      marginBottom: space.sm,
    },
    infoText: {
      color: colors.textSecondary,
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
      color: colors.textMuted,
      fontSize: 11,
    },
    gridValue: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 2,
    },
    regPlateVal: {
      fontWeight: '700',
      letterSpacing: 0.3,
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
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: space.md,
      paddingVertical: space.md,
    },
    keyboardAvoidWrap: {
      width: '100%',
      maxWidth: 440,
      flex: 1,
      alignItems: 'center',
    },
    modalCard: {
      width: '100%',
      maxWidth: 440,
      borderRadius: radius.card,
      borderWidth: 1,
      overflow: 'hidden',
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      flexShrink: 1,
    },
    modalScrollContent: {
      paddingHorizontal: space.lg,
      paddingTop: space.lg,
      paddingBottom: space.md,
    },
    modalFooter: {
      flexDirection: 'row',
      gap: space.md,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      borderTopWidth: 1,
      alignItems: 'center',
    },
    modalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: space.sm,
    },
    modalIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    modalTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 2,
    },
    modalSubtitle: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    reasonSectionLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      marginTop: space.sm,
      marginBottom: 6,
    },
    reasonChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: space.xs,
    },
    reasonChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
    },
    reasonChipSelected: {
      borderColor: colors.brandAccent,
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.15)' : '#FFFBEB',
    },
    reasonChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    reasonChipTextSelected: {
      color: isDark ? '#F7B503' : '#9A6500',
      fontWeight: '700',
    },
    modalInput: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      padding: space.md,
      color: colors.textPrimary,
      fontSize: 13,
      borderWidth: 1,
      borderColor: colors.border,
      textAlignVertical: 'top',
      minHeight: 72,
      marginBottom: space.sm,
    },
    modalBackBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: radius.md,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalBackBtnText: {
      fontSize: 14,
      fontWeight: '600',
    },
    modalCancelConfirmBtn: {
      flex: 1,
      backgroundColor: '#EF4444',
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalCancelConfirmBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    modalDeclineConfirmBtn: {
      flex: 1,
      backgroundColor: '#EF4444',
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalDeclineConfirmBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
  });
