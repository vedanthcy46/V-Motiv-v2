import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Keyboard,
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
  Plus,
  Minus,
  X,
  Eye,
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

  // Document & Evidence Image Preview Modal
  const [previewDocModal, setPreviewDocModal] = useState<{
    visible: boolean;
    uri: string;
    title: string;
  } | null>(null);

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

  const isTripSettled =
    booking.status === 'SETTLED' ||
    booking.status === 'RETURN_INSPECTED' ||
    Boolean(booking.trip?.isSettled) ||
    booking.trip?.returnOdometerKm != null;

  const pickupOdo = Number(booking.trip?.pickupOdometerKm ?? 0);
  const returnOdo = Number(booking.trip?.returnOdometerKm ?? 0);
  const totalDistanceKm = returnOdo > pickupOdo ? returnOdo - pickupOdo : 0;
  const freeAllowanceKm = booking.includedKm || (booking.pricingSnapshot?.includedKm ?? 250);
  const excessKm = booking.trip?.excessKm ?? Math.max(0, totalDistanceKm - freeAllowanceKm);

  const securityDeposit = Math.round(Number(booking.securityDepositPaise || 0) / 100);
  const excessKmCharge = Math.round(Number(booking.trip?.excessKmChargePaise || 0) / 100);
  const fuelRefillCharge = Math.round(Number(booking.trip?.fuelRefillChargePaise || 0) / 100);
  const damageCharge = Math.round(Number(booking.trip?.damageChargePaise || 0) / 100);
  const lateReturnCharge = Math.round(Number(booking.trip?.lateReturnChargePaise || 0) / 100);
  const totalExtraCharges = Math.round(
    Number(
      booking.trip?.totalAdditionalChargesPaise != null && Number(booking.trip.totalAdditionalChargesPaise) > 0
        ? Number(booking.trip.totalAdditionalChargesPaise) / 100
        : excessKmCharge + fuelRefillCharge + damageCharge + lateReturnCharge
    )
  );

  const netRefund = booking.trip?.depositRefundPaise != null
    ? Math.round(Number(booking.trip.depositRefundPaise) / 100)
    : Math.max(0, securityDeposit - totalExtraCharges);

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

        {/* Uploaded Driver License KYC Documents Preview */}
        {booking.driverVerification && (booking.driverVerification.licenseFrontUrl || booking.driverVerification.licenseBackUrl) && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <FileCheck size={18} color={booking.kycStatus === 'VERIFIED' ? (isDark ? '#34D399' : '#059669') : colors.brandAccent} />
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                  Driver License Documents
                </Text>
              </View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted }}>
                {booking.driverVerification.licenseNumber || 'Physical ID'}
              </Text>
            </View>

            <Text style={{ fontSize: 11, color: colors.textSecondary }}>
              Mandatory physical driving license submitted for hub custody verification. Tap any document to preview in full size.
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
              {booking.driverVerification.licenseFrontUrl ? (
                <Pressable
                  onPress={() =>
                    setPreviewDocModal({
                      visible: true,
                      uri: booking.driverVerification!.licenseFrontUrl,
                      title: 'Driver License — Front Side',
                    })
                  }
                  style={[styles.docPreviewCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                >
                  <Image
                    source={{ uri: booking.driverVerification.licenseFrontUrl }}
                    style={{ width: '100%', height: 85, borderRadius: 8 }}
                    resizeMode="cover"
                  />
                  <View style={styles.docPreviewBadge}>
                    <Eye size={11} color="#FFFFFF" />
                    <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF', marginLeft: 3 }}>Front · Tap to Preview</Text>
                  </View>
                </Pressable>
              ) : null}

              {booking.driverVerification.licenseBackUrl ? (
                <Pressable
                  onPress={() =>
                    setPreviewDocModal({
                      visible: true,
                      uri: booking.driverVerification!.licenseBackUrl,
                      title: 'Driver License — Back Side',
                    })
                  }
                  style={[styles.docPreviewCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                >
                  <Image
                    source={{ uri: booking.driverVerification.licenseBackUrl }}
                    style={{ width: '100%', height: 85, borderRadius: 8 }}
                    resizeMode="cover"
                  />
                  <View style={styles.docPreviewBadge}>
                    <Eye size={11} color="#FFFFFF" />
                    <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF', marginLeft: 3 }}>Back · Tap to Preview</Text>
                  </View>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}

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

        {/* Custody Handover & Return Evidence / Final Settlement */}
        {booking.trip && (
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: isTripSettled ? (isDark ? '#059669' : '#10B981') : colors.border,
                borderWidth: isTripSettled ? 1.5 : 1,
              },
            ]}
          >
            {isTripSettled ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircle2 size={16} color={isDark ? '#34D399' : '#059669'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary, letterSpacing: 0.2 }}>
                        Final Settlement & Refund Statement
                      </Text>
                      <Text style={{ fontSize: 11, color: isDark ? '#34D399' : '#059669', fontWeight: '600' }}>
                        Trip Completed & Handover Reconciled
                      </Text>
                    </View>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5' }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#34D399' : '#065F46', textTransform: 'uppercase' }}>
                      {booking.status}
                    </Text>
                  </View>
                </View>

                {/* Telemetry Grid */}
                <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 10, padding: 12, marginBottom: 12 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    Kilometre & Fuel Telemetry Report
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '600' }}>START ODO</Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary, marginTop: 2 }}>{pickupOdo} km</Text>
                      <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 1 }}>Fuel: {booking.trip.pickupFuelPercent}%</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '600' }}>RETURN ODO</Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary, marginTop: 2 }}>{returnOdo} km</Text>
                      <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 1 }}>Fuel: {booking.trip.returnFuelPercent}%</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '600' }}>TOTAL DRIVEN</Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.brandAccent, marginTop: 2 }}>{totalDistanceKm} km</Text>
                      <Text style={{ fontSize: 10, color: excessKm > 0 ? '#EF4444' : (isDark ? '#34D399' : '#059669'), fontWeight: '700', marginTop: 1 }}>
                        {excessKm > 0 ? `+${excessKm} km excess` : `${freeAllowanceKm} km free`}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Financial Charges & Deductions Itemized Breakdown */}
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    Itemized Deductions & Charges
                  </Text>
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>Initial Security Deposit Paid</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>₹{securityDeposit.toLocaleString('en-IN')}</Text>
                    </View>

                    {excessKmCharge > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#EF4444' }}>Excess Km Surcharge ({excessKm} km)</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>- ₹{excessKmCharge.toLocaleString('en-IN')}</Text>
                      </View>
                    )}

                    {fuelRefillCharge > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#EF4444' }}>Fuel Refill / Deficiency Charge</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>- ₹{fuelRefillCharge.toLocaleString('en-IN')}</Text>
                      </View>
                    )}

                    {damageCharge > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#EF4444' }}>Vehicle Damage Assessment</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>- ₹{damageCharge.toLocaleString('en-IN')}</Text>
                      </View>
                    )}

                    {lateReturnCharge > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#EF4444' }}>Late Return Charge</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>- ₹{lateReturnCharge.toLocaleString('en-IN')}</Text>
                      </View>
                    )}

                    {totalExtraCharges === 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: isDark ? '#34D399' : '#059669' }}>Extra Deductions</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#34D399' : '#059669' }}>₹0 (Full deposit eligible)</Text>
                      </View>
                    )}

                    <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>Total Extra Charges</Text>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: totalExtraCharges > 0 ? '#EF4444' : colors.textPrimary }}>
                        {totalExtraCharges > 0 ? `- ₹${totalExtraCharges.toLocaleString('en-IN')}` : '₹0'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Net Deposit Refund / Balance Card */}
                <View
                  style={{
                    backgroundColor: netRefund >= 0
                      ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5')
                      : (isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2'),
                    borderColor: netRefund >= 0
                      ? (isDark ? '#059669' : '#A7F3D0')
                      : (isDark ? '#DC2626' : '#FECACA'),
                    borderWidth: 1,
                    borderRadius: 10,
                    padding: 14,
                    marginBottom: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: netRefund >= 0 ? (isDark ? '#34D399' : '#065F46') : '#DC2626', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {netRefund >= 0 ? '✓ Net Security Deposit Refund' : '⚠ Outstanding Balance Due'}
                      </Text>
                      <Text style={{ fontSize: 11, color: netRefund >= 0 ? (isDark ? '#A7F3D0' : '#047857') : '#B91C1C', marginTop: 2 }}>
                        {netRefund >= 0 ? 'Refund processed to original payment method' : 'Deductions exceeded security deposit amount'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: netRefund >= 0 ? (isDark ? '#34D399' : '#059669') : '#DC2626' }}>
                      ₹{Math.abs(netRefund).toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>

                {/* Return Inspection Photos */}
                {booking.trip.returnPhotos && booking.trip.returnPhotos.length > 0 && (
                  <View style={{ marginTop: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                      Return Inspection Evidence ({booking.trip.returnPhotos.length} photos)
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {booking.trip.returnPhotos.map((photoUrl, pIdx) => (
                        <Pressable
                          key={pIdx}
                          onPress={() =>
                            setPreviewDocModal({
                              visible: true,
                              uri: photoUrl,
                              title: `Return Inspection Photo #${pIdx + 1}`,
                            })
                          }
                          style={{ borderRadius: 8, overflow: 'hidden' }}
                        >
                          <Image
                            source={{ uri: photoUrl }}
                            style={{ width: 85, height: 85, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
                            resizeMode="cover"
                          />
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Return Notes */}
                {booking.trip.returnNotes ? (
                  <View style={{ marginTop: 8, padding: 10, backgroundColor: colors.surfaceSecondary, borderRadius: 8 }}>
                    <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase' }}>Hub Inspection Remarks</Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>{booking.trip.returnNotes}</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
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

                {booking.trip.pickupPhotos && booking.trip.pickupPhotos.length > 0 && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                      Departure Handover Photos ({booking.trip.pickupPhotos.length})
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {booking.trip.pickupPhotos.map((photoUrl, pIdx) => (
                        <Pressable
                          key={pIdx}
                          onPress={() =>
                            setPreviewDocModal({
                              visible: true,
                              uri: photoUrl,
                              title: `Departure Handover Photo #${pIdx + 1}`,
                            })
                          }
                          style={{ borderRadius: 8, overflow: 'hidden' }}
                        >
                          <Image
                            source={{ uri: photoUrl }}
                            style={{ width: 85, height: 85, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
                            resizeMode="cover"
                          />
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
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

      {/* Extension Modal (Keyboard-Aware & Navigation-Aware Bottom Sheet) */}
      <Modal
        visible={extensionModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setExtensionModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              Keyboard.dismiss();
              setExtensionModalVisible(false);
            }}
          />

          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.surface,
                paddingBottom: Math.max(insets.bottom + 12, 28),
                borderTopColor: colors.border,
                borderTopWidth: 1,
              },
            ]}
          >
            {/* Sheet Handle */}
            <View style={styles.sheetHandleWrap}>
              <View style={[styles.sheetHandle, { backgroundColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)' }]} />
            </View>

            {/* Header with Title & Close button */}
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Clock size={18} color={colors.brandAccent} />
                  <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                    Extend Rental Period
                  </Text>
                </View>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary, marginTop: 3 }]}>
                  Keep your {booking.vehicle?.make} {booking.vehicle?.model} longer without interrupting your trip.
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setExtensionModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close extension sheet"
                style={[styles.modalCloseBtn, { backgroundColor: colors.surfaceSecondary }]}
              >
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 14 }}
            >
              {/* Quick Hours Presets */}
              <View>
                <Text style={[styles.inputLabel, { color: colors.textSecondary, marginBottom: 8 }]}>
                  QUICK EXTENSION DURATION
                </Text>
                <View style={styles.presetChipsRow}>
                  {[3, 6, 12, 24, 48].map(hrs => {
                    const isSelected = extensionHours === String(hrs);
                    const label = hrs >= 24 ? `+${hrs / 24}d (${hrs}h)` : `+${hrs} hrs`;
                    return (
                      <TouchableOpacity
                        key={hrs}
                        onPress={() => {
                          setExtensionHours(String(hrs));
                          Keyboard.dismiss();
                        }}
                        style={[
                          styles.presetChip,
                          {
                            backgroundColor: isSelected
                              ? (isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7')
                              : colors.surfaceSecondary,
                            borderColor: isSelected ? colors.brandAccent : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.presetChipText,
                            {
                              color: isSelected ? colors.brandAccent : colors.textPrimary,
                              fontWeight: isSelected ? '800' : '600',
                            },
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Stepper + Numeric Input */}
              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  HOURS TO EXTEND
                </Text>
                <View style={styles.stepperRow}>
                  <TouchableOpacity
                    onPress={() => {
                      const cur = parseInt(extensionHours, 10) || 1;
                      if (cur > 1) setExtensionHours(String(cur - 1));
                    }}
                    style={[styles.stepperBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                  >
                    <Minus size={18} color={colors.textPrimary} />
                  </TouchableOpacity>

                  <TextInput
                    style={[
                      styles.modalInput,
                      {
                        backgroundColor: colors.surfaceSecondary,
                        borderColor: colors.border,
                        color: colors.textPrimary,
                      },
                    ]}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    value={extensionHours}
                    onChangeText={txt => {
                      const clean = txt.replace(/[^0-9]/g, '');
                      setExtensionHours(clean);
                    }}
                  />

                  <TouchableOpacity
                    onPress={() => {
                      const cur = parseInt(extensionHours, 10) || 0;
                      if (cur < 168) setExtensionHours(String(cur + 1));
                    }}
                    style={[styles.stepperBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                  >
                    <Plus size={18} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Live Preview Card */}
              <View
                style={[
                  styles.previewCard,
                  {
                    backgroundColor: colors.surfaceSecondary,
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  },
                ]}
              >
                <View style={styles.previewRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.previewLabel, { color: colors.textMuted }]}>CURRENT RETURN</Text>
                    <Text style={[styles.previewTime, { color: colors.textSecondary }]}>
                      {endDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}, {endDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </Text>
                  </View>

                  <View style={{ paddingHorizontal: 6, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 16, color: colors.brandAccent }}>→</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.previewLabel, { color: colors.brandAccent }]}>NEW RETURN</Text>
                    <Text style={[styles.previewTime, { color: colors.textPrimary, fontWeight: '800' }]}>
                      {new Date(endDate.getTime() + (parseInt(extensionHours, 10) || 0) * 3600 * 1000).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}, {new Date(endDate.getTime() + (parseInt(extensionHours, 10) || 0) * 3600 * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </Text>
                  </View>
                </View>

                {/* Estimated Rate Notice */}
                <View style={[styles.estimateRow, { borderTopColor: colors.border }]}>
                  <Sparkles size={13} color={colors.brandAccent} />
                  <Text style={[styles.estimateText, { color: colors.textSecondary }]}>
                    Estimated Fare: ~₹{Math.round(((parseInt(extensionHours, 10) || 0) * (Number(booking.vehicle?.baseHourlyRatePaise || (Number(booking.vehicle?.baseDailyRatePaise || 280000) / 24))) / 100)).toLocaleString('en-IN')} (subject to availability)
                  </Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.modalButtonsRow}>
                <TouchableOpacity
                  onPress={() => setExtensionModalVisible(false)}
                  style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.modalCancelText, { color: colors.textPrimary }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleExtension}
                  disabled={requestingExtension || !extensionHours || parseInt(extensionHours, 10) <= 0}
                  style={[
                    styles.modalConfirmBtn,
                    {
                      backgroundColor: isDark ? colors.brandAccent : colors.brandNavy,
                      opacity: (!extensionHours || parseInt(extensionHours, 10) <= 0) ? 0.6 : 1,
                    },
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
                      Request Extension
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Fullscreen Document & Inspection Image Preview Modal */}
      {previewDocModal && (
        <Modal
          visible={previewDocModal.visible}
          transparent
          animationType="fade"
          onRequestClose={() => setPreviewDocModal(null)}
        >
          <View style={styles.previewModalOverlay}>
            <View style={[styles.previewModalHeader, { paddingTop: Math.max(insets.top, 20) }]}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.previewModalTitle}>{previewDocModal.title}</Text>
                <Text style={styles.previewModalSubtitle}>
                  High-resolution document & vehicle inspection record
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPreviewDocModal(null)}
                style={styles.previewCloseBtn}
                accessibilityLabel="Close image preview"
              >
                <X size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.previewImageContainer}>
              <Image
                source={{ uri: previewDocModal.uri }}
                style={styles.previewFullImage}
                resizeMode="contain"
              />
            </View>

            <View style={[styles.previewModalFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
              <TouchableOpacity
                onPress={() => setPreviewDocModal(null)}
                style={styles.previewDoneBtn}
              >
                <CheckCircle2 size={16} color="#061a38" />
                <Text style={styles.previewDoneText}>Close Preview</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
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
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 20,
  },
  sheetHandleWrap: {
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 4,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
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
    letterSpacing: 0.4,
  },
  presetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  presetChipText: {
    fontSize: 12,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalInput: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
  },
  previewCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  previewTime: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  estimateText: {
    fontSize: 11,
    fontWeight: '600',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
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
  },
  docPreviewCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  docPreviewBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderRadius: 5,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
    justifyContent: 'space-between',
  },
  previewModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
  },
  previewModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  previewModalSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 2,
  },
  previewCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImageContainer: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewFullImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  previewModalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  previewDoneBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34D399',
    paddingVertical: 13,
    borderRadius: 12,
    gap: 8,
  },
  previewDoneText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#061a38',
  },
});
