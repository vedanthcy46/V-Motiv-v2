import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../navigation/types';
import { useAppTheme } from '../theme';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Car,
  MapPin,
  Calendar,
  ShieldCheck,
  AlertCircle,
  PhoneCall,
  RotateCcw,
  Fuel,
  Sparkles,
  ChevronRight,
  FileCheck,
} from 'lucide-react-native';
import {
  fetchRentalBookingDetails,
  cancelRentalBooking,
  requestRentalExtension,
  type RentalBookingDetails,
} from '../services/rental-api';
import { CarBrandLogo } from '../components/CarBrandLogo';

type Props = NativeStackScreenProps<RootStack, 'RentalBookingDetails'>;

export function RentalBookingDetailsScreen({ route, navigation }: Props) {
  const { bookingId } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();

  const [booking, setBooking] = useState<RentalBookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  // Extension Modal State
  const [extensionModalVisible, setExtensionModalVisible] = useState(false);
  const [extensionHours, setExtensionHours] = useState('4');
  const [requestingExtension, setRequestingExtension] = useState(false);

  const loadDetails = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchRentalBookingDetails(bookingId);
      setBooking(data);
    } catch (e: any) {
      Alert.alert('Booking Error', e?.message || 'Could not load rental booking.');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const handleCancel = () => {
    Alert.alert(
      'Cancel Reservation',
      'Are you sure you want to cancel this booking? Refund will be calculated server-side according to the cancellation policy.',
      [
        { text: 'Keep Reservation', style: 'cancel' },
        {
          text: 'Cancel Booking',
          style: 'destructive',
          onPress: async () => {
            try {
              setCancelling(true);
              const res = await cancelRentalBooking(bookingId, 'Customer requested cancellation via mobile app');
              const refundRupees = Math.round(Number(res.calculatedRefundPaise) / 100);
              Alert.alert(
                'Booking Cancelled',
                `Your booking has been cancelled. An approved refund of ₹${refundRupees.toLocaleString('en-IN')} has been queued for bank transfer.`
              );
              loadDetails();
            } catch (err: any) {
              Alert.alert('Cancellation Error', err?.message || 'Could not cancel booking.');
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  const handleExtension = async () => {
    if (!booking) return;
    const extraHrs = parseInt(extensionHours, 10);
    if (isNaN(extraHrs) || extraHrs <= 0) {
      Alert.alert('Invalid Duration', 'Please enter a valid number of hours.');
      return;
    }

    try {
      setRequestingExtension(true);
      const currentEnd = new Date(booking.endTime);
      const newEnd = new Date(currentEnd.getTime() + extraHrs * 60 * 60 * 1000);

      await requestRentalExtension(booking.id, newEnd.toISOString());
      setExtensionModalVisible(false);
      Alert.alert(
        'Extension Requested',
        `Your request to extend rental by ${extraHrs} hours has been submitted. Operations will confirm vehicle availability shortly.`
      );
      loadDetails();
    } catch (err: any) {
      Alert.alert('Extension Unavailable', err?.message || 'Could not request trip extension.');
    } finally {
      setRequestingExtension(false);
    }
  };

  if (loading || !booking) {
    return (
      <View style={[styles.loadingCenter, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.brandAccent} />
      </View>
    );
  }

  const startDate = new Date(booking.startTime);
  const endDate = new Date(booking.endTime);
  const totalRupees = Math.round(Number(booking.totalPayablePaise) / 100);
  const depositRupees = Math.round(Number(booking.securityDepositPaise) / 100);

  const isCancellable = booking.status === 'CONFIRMED' || booking.status === 'PENDING_PAYMENT';
  const isActiveTrip = booking.status === 'TRIP_ACTIVE' || booking.status === 'VEHICLE_COLLECTED';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 16),
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Rental Details</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              Booking Ref: {booking.bookingNumber}
            </Text>
          </View>
        </View>

        {/* Status Pill */}
        <View
          style={[
            styles.statusBanner,
            {
              backgroundColor: isDark ? colors.surfaceSecondary : colors.brandNavy,
              borderColor: isDark ? colors.border : 'transparent',
              borderWidth: isDark ? 1 : 0,
            },
          ]}
        >
          <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
          <Text style={styles.statusBannerText}>
            Status: {booking.status.replace(/_/g, ' ')}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Driver KYC Status Banner */}
        <View
          style={[
            styles.kycBanner,
            {
              backgroundColor:
                booking.kycStatus === 'VERIFIED'
                  ? (isDark ? 'rgba(52, 211, 153, 0.14)' : '#ECFDF5')
                  : (isDark ? 'rgba(251, 191, 36, 0.14)' : '#FFFBEB'),
              borderColor:
                booking.kycStatus === 'VERIFIED'
                  ? (isDark ? '#34D399' : '#10B981')
                  : (isDark ? '#FBBF24' : '#F59E0B'),
            },
          ]}
        >
          {booking.kycStatus === 'VERIFIED' ? (
            <ShieldCheck size={20} color={isDark ? '#34D399' : '#10B981'} />
          ) : (
            <AlertCircle size={20} color={isDark ? '#FBBF24' : '#F59E0B'} />
          )}
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.kycTitle,
                {
                  color:
                    booking.kycStatus === 'VERIFIED'
                      ? (isDark ? '#34D399' : '#065F46')
                      : (isDark ? '#FBBF24' : '#92400E'),
                },
              ]}
            >
              {booking.kycStatus === 'VERIFIED' ? 'Driver KYC Approved' : 'Driver KYC Verification In Progress'}
            </Text>
            <Text
              style={[
                styles.kycSubtitle,
                {
                  color:
                    booking.kycStatus === 'VERIFIED'
                      ? (isDark ? '#E6F9F0' : '#047857')
                      : (isDark ? '#FFF3D6' : '#B45309'),
                },
              ]}
            >
              {booking.kycStatus === 'VERIFIED'
                ? 'Your driving license has been verified. Keys will be handed over at hub.'
                : 'Staff will complete license physical verification at the pickup hub.'}
            </Text>
          </View>
        </View>

        {/* Vehicle Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <CarBrandLogo brand={booking.vehicle?.make || 'Toyota'} size={28} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.vehicleMakeModel, { color: colors.textPrimary }]}>
                {booking.vehicle?.make} {booking.vehicle?.model}
              </Text>
              <Text style={[styles.vehicleReg, { color: colors.textMuted }]}>
                {booking.vehicle?.registrationNumber || 'Commercial Self-Drive'} · {booking.vehicle?.fuelType}
              </Text>
            </View>
          </View>

          <View style={[styles.intervalRow, { backgroundColor: colors.surfaceSecondary }]}>
            <View style={styles.intervalBlock}>
              <Text style={[styles.intervalLabel, { color: colors.textMuted }]}>PICKUP</Text>
              <Text style={[styles.intervalDate, { color: colors.textPrimary }]}>
                {startDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
              <Text style={[styles.intervalTime, { color: colors.brandAccent }]}>
                {startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </Text>
              <Text style={[styles.intervalHub, { color: colors.textSecondary }]}>
                {booking.pickupHub?.name}
              </Text>
            </View>

            <View style={[styles.intervalDivider, { backgroundColor: colors.border }]} />

            <View style={styles.intervalBlock}>
              <Text style={[styles.intervalLabel, { color: colors.textMuted }]}>RETURN</Text>
              <Text style={[styles.intervalDate, { color: colors.textPrimary }]}>
                {endDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
              <Text style={[styles.intervalTime, { color: colors.brandAccent }]}>
                {endDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </Text>
              <Text style={[styles.intervalHub, { color: colors.textSecondary }]}>
                {booking.returnHub?.name}
              </Text>
            </View>
          </View>
        </View>

        {/* Custody Handover & Return Evidence */}
        {booking.trip && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Vehicle Custody Report
            </Text>

            <View style={styles.evidenceRow}>
              <View style={[styles.evidenceBox, { backgroundColor: colors.surfaceSecondary }]}>
                <Text style={[styles.evidenceLabel, { color: colors.textMuted }]}>PICKUP ODOMETER</Text>
                <Text style={[styles.evidenceValue, { color: colors.textPrimary }]}>
                  {booking.trip.pickupOdometerKm} km
                </Text>
                <Text style={[styles.evidenceSub, { color: colors.textSecondary }]}>
                  Fuel: {booking.trip.pickupFuelPercent}%
                </Text>
              </View>

              {booking.trip.returnOdometerKm != null && (
                <View style={[styles.evidenceBox, { backgroundColor: colors.surfaceSecondary }]}>
                  <Text style={[styles.evidenceLabel, { color: colors.textMuted }]}>RETURN ODOMETER</Text>
                  <Text style={[styles.evidenceValue, { color: colors.textPrimary }]}>
                    {booking.trip.returnOdometerKm} km
                  </Text>
                  <Text style={[styles.evidenceSub, { color: colors.textSecondary }]}>
                    Fuel: {booking.trip.returnFuelPercent}%
                  </Text>
                </View>
              )}
            </View>

            {/* Excess Km / Settlement Info */}
            {booking.trip.isSettled && (
              <View
                style={[
                  styles.settlementBanner,
                  {
                    backgroundColor: isDark ? 'rgba(52, 211, 153, 0.14)' : '#ECFDF5',
                    borderColor: isDark ? '#34D399' : '#A7F3D0',
                    borderWidth: 1,
                  },
                ]}
              >
                <CheckCircle2 size={18} color={isDark ? '#34D399' : '#10B981'} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: isDark ? '#34D399' : '#065F46',
                    }}
                  >
                    Trip Settled & Inspected
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: isDark ? '#E6F9F0' : '#047857',
                      marginTop: 2,
                    }}
                  >
                    Excess Km: {booking.trip.excessKm} km · Deposit Refund: ₹
                    {Math.round(Number(booking.trip.depositRefundPaise) / 100).toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Roadside Assistance & Support */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <PhoneCall size={18} color={colors.brandAccent} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              24/7 Roadside Assistance
            </Text>
          </View>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            In case of emergency, flat tyre, or mechanical breakdown, contact our dedicated fleet command centre.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Call roadside assistance"
            onPress={() => Alert.alert('Emergency Assistance', 'Connecting to 24/7 V MOTIV Fleet Support at 1800-VMOTIV-911')}
            style={[
              styles.rsaButton,
              {
                backgroundColor: colors.surfaceSecondary,
                borderColor: isDark ? colors.borderStrong : colors.border,
              },
            ]}
          >
            <PhoneCall size={16} color={isDark ? colors.brandAccent : colors.brandNavy} />
            <Text
              style={[
                styles.rsaButtonText,
                { color: isDark ? colors.brandAccent : colors.brandNavy },
              ]}
            >
              Call Emergency Helpline (1800-866-848)
            </Text>
          </Pressable>
        </View>

        {/* Action Buttons: Extension & Cancellation */}
        {isActiveTrip && (
          <Pressable
            onPress={() => setExtensionModalVisible(true)}
            style={[
              styles.actionButton,
              { backgroundColor: isDark ? colors.brandAccent : colors.brandNavy },
            ]}
          >
            <Clock size={16} color={isDark ? colors.brandNavy : '#FFFFFF'} />
            <Text
              style={[
                styles.actionButtonText,
                { color: isDark ? colors.brandNavy : '#FFFFFF' },
              ]}
            >
              Extend Rental Period
            </Text>
          </Pressable>
        )}

        {isCancellable && (
          <Pressable
            onPress={handleCancel}
            disabled={cancelling}
            style={[styles.cancelButton, { borderColor: colors.error || '#EF4444' }]}
          >
            {cancelling ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <Text style={[styles.cancelButtonText, { color: colors.error || '#EF4444' }]}>
                Cancel Reservation
              </Text>
            )}
          </Pressable>
        )}
      </ScrollView>

      {/* Extension Modal */}
      <Modal visible={extensionModalVisible} transparent animationType="slide">
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Extend Rental Period
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Subject to vehicle availability and turnaround buffer. Additional hours will be billed at standard hourly rates.
            </Text>

            <View style={styles.formGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>ADDITIONAL HOURS</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: colors.surfaceSecondary,
                    borderColor: colors.border,
                    color: colors.textPrimary,
                  },
                ]}
                keyboardType="numeric"
                value={extensionHours}
                onChangeText={setExtensionHours}
              />
            </View>

            <View style={styles.modalButtonsRow}>
              <Pressable
                onPress={() => setExtensionModalVisible(false)}
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.textPrimary }]}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleExtension}
                disabled={requestingExtension}
                style={[
                  styles.modalConfirmBtn,
                  { backgroundColor: isDark ? colors.brandAccent : colors.brandNavy },
                ]}
              >
                {requestingExtension ? (
                  <ActivityIndicator size="small" color={isDark ? colors.brandNavy : '#FFFFFF'} />
                ) : (
                  <Text
                    style={[
                      styles.modalConfirmText,
                      { color: isDark ? colors.brandNavy : '#FFFFFF' },
                    ]}
                  >
                    Confirm Extension
                  </Text>
                )}
              </Pressable>
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
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  statusBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  kycBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  kycTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  kycSubtitle: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  card: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleMakeModel: {
    fontSize: 17,
    fontWeight: '800',
  },
  vehicleReg: {
    fontSize: 12,
    marginTop: 2,
  },
  intervalRow: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  intervalBlock: {
    flex: 1,
    alignItems: 'center',
  },
  intervalLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  intervalDate: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  intervalTime: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  intervalHub: {
    fontSize: 11,
    marginTop: 2,
  },
  intervalDivider: {
    width: 1,
    height: 40,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  evidenceRow: {
    flexDirection: 'row',
    gap: 12,
  },
  evidenceBox: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  evidenceLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  evidenceValue: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  evidenceSub: {
    fontSize: 11,
    marginTop: 2,
  },
  settlementBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  rsaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  rsaButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionButton: {
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cancelButton: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  formGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '700',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
