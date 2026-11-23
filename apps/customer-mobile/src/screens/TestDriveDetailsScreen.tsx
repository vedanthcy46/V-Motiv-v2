import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CarFront,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  FileText,
  Fuel,
  Gauge,
  HelpCircle,
  MapPin,
  Phone,
  ShieldCheck,
  User,
  XCircle,
  Zap,
} from 'lucide-react-native';
import { customer } from '../services/customer';
import { formatPaise } from '../format';
import { color, radius, space, useAppTheme, type ThemeColors } from '../theme';
import type { RootStack } from '../navigation/types';
import type { TestDrive } from '../types';
import { safeBottom } from '../layout/safe-layout';
import { INSPECTION_POINTS } from '../constants/inspection';

type Props = NativeStackScreenProps<RootStack, 'TestDriveDetails'>;

const TIMELINE_STEPS = [
  { key: 'REQUESTED', label: 'Requested', desc: 'Slot booked & queued for verification' },
  { key: 'CONFIRMED', label: 'Confirmed', desc: 'Vehicle prepped & executive assigned' },
  { key: 'COMPLETED', label: 'Completed', desc: 'Test drive experience concluded' },
];

export function TestDriveDetailsScreen({ route, navigation }: Props) {
  const { driveId } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [drive, setDrive] = useState<TestDrive | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  function loadDrive() {
    setLoading(true);
    customer
      .testDrive(driveId)
      .then(setDrive)
      .catch((err) => {
        Alert.alert('Error', err.message || 'Failed to load test drive details');
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadDrive();
  }, [driveId]);

  function handleCallExecutive(phone?: string | null) {
    const target = phone || '+918000000000';
    Linking.openURL(`tel:${target}`).catch(() => {
      Alert.alert('Unable to Call', `Please dial ${target} directly.`);
    });
  }

  function handleCancelDrive() {
    Alert.alert(
      'Cancel Test Drive',
      'Are you sure you want to cancel your upcoming test drive reservation?',
      [
        { text: 'Keep Reservation', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await customer.cancelTestDrive(driveId, 'Cancelled by customer');
              Alert.alert('Drive Cancelled', 'Your test drive booking has been cancelled.');
              loadDrive();
            } catch (err: any) {
              Alert.alert('Unable to Cancel', err.message || 'Test drive could not be cancelled.');
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
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Test Drive Booking</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brandAccent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!drive) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Test Drive</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <AlertCircle size={44} color={colors.textMuted} />
          <Text style={styles.errorTitle}>Test Drive Not Found</Text>
          <Text style={styles.errorSub}>Could not load booking details for this test drive.</Text>
          <TouchableOpacity style={styles.backHomeBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backHomeBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isCancelled = drive.status === 'CANCELLED' || drive.status === 'NO_SHOW';
  const currentStepIndex =
    drive.status === 'COMPLETED'
      ? 2
      : drive.status === 'CONFIRMED'
      ? 1
      : 0;

  const vehicle = drive.listing?.vehicle;
  const mainImage = drive.listing?.media?.[0]?.url || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800';

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Test Drive Booking</Text>
          <Text style={styles.refText}>ID: #{drive.id.slice(0, 8).toUpperCase()}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: safeBottom(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Callout Banner */}
        {isCancelled ? (
          <View style={styles.cancelledBanner}>
            <XCircle size={22} color="#EF4444" />
            <View style={{ flex: 1, marginLeft: space.sm }}>
              <Text style={styles.cancelledTitle}>Booking Cancelled</Text>
              <Text style={styles.cancelledSub}>
                {drive.cancelledAt
                  ? `Cancelled on ${new Date(drive.cancelledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : 'This test drive reservation was cancelled.'}
              </Text>
            </View>
          </View>
        ) : drive.status === 'COMPLETED' ? (
          <View style={styles.completedBanner}>
            <CheckCircle2 size={22} color="#10B981" />
            <View style={{ flex: 1, marginLeft: space.sm }}>
              <Text style={styles.completedTitle}>Test Drive Completed</Text>
              <Text style={styles.completedSub}>
                We hope you enjoyed driving this car. Feel free to request a custom retail quotation or contact our team.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.confirmedBanner}>
            <Clock size={20} color={isDark ? colors.brandAccent : '#B45309'} />
            <View style={{ flex: 1, marginLeft: space.sm }}>
              <Text style={styles.confirmedTitle}>
                {drive.status === 'CONFIRMED' ? 'Test Drive Confirmed' : 'Booking Received & Under Review'}
              </Text>
              <Text style={styles.confirmedSub}>
                {drive.status === 'CONFIRMED'
                  ? 'Your test drive slot is locked. Your specialist is assigned with the prepped car.'
                  : 'We are verifying car availability and scheduling an executive for your selected slot.'}
              </Text>
            </View>
          </View>
        )}

        {/* 3-Stage Workflow Stepper */}
        {!isCancelled && (
          <View style={styles.stepperCard}>
            <Text style={styles.sectionTitle}>Booking Workflow</Text>
            <View style={styles.stepperContainer}>
              {TIMELINE_STEPS.map((step, idx) => {
                const isPassed = idx < currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                const isPending = idx > currentStepIndex;

                return (
                  <View key={step.key} style={styles.stepperRow}>
                    <View style={styles.stepIndicatorCol}>
                      <View
                        style={[
                          styles.stepDot,
                          isPassed && styles.stepDotPassed,
                          isCurrent && styles.stepDotCurrent,
                          isPending && styles.stepDotPending,
                        ]}
                      >
                        {isPassed ? (
                          <CheckCircle2 size={15} color="#FFFFFF" />
                        ) : (
                          <Text
                            style={[
                              styles.stepDotNum,
                              isCurrent && styles.stepDotNumCurrent,
                              isPending && styles.stepDotNumPending,
                            ]}
                          >
                            {idx + 1}
                          </Text>
                        )}
                      </View>
                      {idx < TIMELINE_STEPS.length - 1 && (
                        <View
                          style={[
                            styles.stepConnector,
                            idx < currentStepIndex ? styles.stepConnectorPassed : styles.stepConnectorPending,
                          ]}
                        />
                      )}
                    </View>
                    <View style={styles.stepContentCol}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text
                          style={[
                            styles.stepLabel,
                            isCurrent && styles.stepLabelCurrent,
                            isPending && styles.stepLabelPending,
                          ]}
                        >
                          {step.label}
                        </Text>
                        {isCurrent && (
                          <View style={styles.inProgressPill}>
                            <Text style={styles.inProgressPillText}>IN PROGRESS</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.stepDesc}>{step.desc}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Vehicle Preview Card */}
        {drive.listing && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Vehicle', { listingId: drive.listing.id })}
            style={styles.vehicleCard}
          >
            <Image source={{ uri: mainImage }} style={styles.vehicleThumb} resizeMode="cover" />
            <View style={styles.vehicleInfo}>
              <Text style={styles.vehicleTitle} numberOfLines={1}>
                {drive.listing.title}
              </Text>
              <Text style={styles.vehiclePrice}>{formatPaise(drive.listing.pricePaise)}</Text>
              {vehicle && (
                <View style={styles.vehicleSpecsRow}>
                  <Text style={styles.vehicleSpecsText}>
                    {vehicle.manufacturingYear} · {vehicle.fuelType} · {vehicle.transmission}
                  </Text>
                </View>
              )}
              <View style={styles.viewCarRow}>
                <Text style={styles.viewCarText}>View Car Details & {INSPECTION_POINTS}-Pt Report</Text>
                <ChevronRight size={14} color={colors.brandAccent} />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Appointment Slot Details Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Slot & Location Details</Text>

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Calendar size={18} color={colors.brandAccent} />
            </View>
            <View style={styles.infoTextCol}>
              <Text style={styles.infoLabel}>Scheduled Date</Text>
              <Text style={styles.infoValue}>
                {new Date(drive.requestedDate).toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Clock size={18} color={colors.brandAccent} />
            </View>
            <View style={styles.infoTextCol}>
              <Text style={styles.infoLabel}>Time Slot</Text>
              <Text style={styles.infoValue}>{drive.timeSlot}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <MapPin size={18} color={colors.brandAccent} />
            </View>
            <View style={styles.infoTextCol}>
              <Text style={styles.infoLabel}>
                {drive.locationPreference === 'HOME' ? 'Doorstep Delivery Address' : 'Experience Hub Location'}
              </Text>
              <Text style={styles.infoValue}>
                {drive.locationPreference === 'HOME'
                  ? drive.address || `Doorstep delivery in ${drive.serviceCity}`
                  : `V MOTIV Hub · ${drive.serviceCity}`}
              </Text>
            </View>
          </View>

          {drive.customerNotes ? (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <View style={styles.infoIconBox}>
                  <FileText size={18} color={colors.brandAccent} />
                </View>
                <View style={styles.infoTextCol}>
                  <Text style={styles.infoLabel}>Special Instructions</Text>
                  <Text style={styles.infoValue}>{drive.customerNotes}</Text>
                </View>
              </View>
            </>
          ) : null}
        </View>

        {/* Who will take the customer on the drive: real data only, nothing invented. */}
        {!isCancelled && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Your test drive specialist</Text>
            {drive.executive ? (
              <View style={styles.pilotRow}>
                <View style={styles.pilotAvatar}>
                  <User size={24} color={colors.brandNavy} />
                </View>
                <View style={{ flex: 1, marginLeft: space.sm }}>
                  <Text style={styles.pilotName}>{drive.executive.name}</Text>
                  <Text style={styles.pilotRole}>V MOTIV test drive specialist</Text>
                </View>
                {drive.executive.phone ? (
                  <TouchableOpacity
                    style={styles.callPilotBtn}
                    accessibilityLabel={`Call ${drive.executive.name}`}
                    onPress={() => handleCallExecutive(drive.executive!.phone)}
                  >
                    <Phone size={16} color={colors.brandNavy} />
                    <Text style={styles.callPilotBtnText}>Call</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <Text style={styles.pilotRole}>
                A specialist is assigned when our team confirms your slot. You will get a notification with their name.
              </Text>
            )}
          </View>
        )}

        {/* Pre-Drive Checklist */}
        <View style={styles.checklistCard}>
          <Text style={styles.sectionTitle}>Test Drive Checklist</Text>
          <View style={styles.checklistItem}>
            <CheckCircle2 size={16} color="#10B981" />
            <Text style={styles.checklistText}>
              Keep your original physical Driving License ready for verification.
            </Text>
          </View>
          <View style={styles.checklistItem}>
            <CheckCircle2 size={16} color="#10B981" />
            <Text style={styles.checklistText}>
              Includes a 15–20 minute route testing city handling, highway acceleration, and braking.
            </Text>
          </View>
          <View style={styles.checklistItem}>
            <CheckCircle2 size={16} color="#10B981" />
            <Text style={styles.checklistText}>
              Sanitized vehicle with complete fuel prepped before departure.
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          {drive.listing && (
            <TouchableOpacity
              style={styles.enquiryActionBtn}
              onPress={() =>
                navigation.navigate('PurchaseEnquiry', {
                  listingId: drive.listing.id,
                  title: drive.listing.title,
                })
              }
            >
              <FileText size={18} color={colors.brandNavy} />
              <Text style={styles.enquiryActionText}>Request Custom Quotation / Enquire</Text>
            </TouchableOpacity>
          )}

          {!isCancelled && drive.status !== 'COMPLETED' && (
            <TouchableOpacity
              style={styles.cancelActionBtn}
              disabled={actionLoading}
              onPress={handleCancelDrive}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <>
                  <XCircle size={18} color="#EF4444" />
                  <Text style={styles.cancelActionText}>Cancel Test Drive Reservation</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
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
      backgroundColor: colors.surface,
    },
    backBtn: {
      padding: space.xs,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceSecondary,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    refText: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '600',
      marginTop: 2,
    },
    content: {
      padding: space.md,
      gap: space.md,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: space.xl,
    },
    errorTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textPrimary,
      marginTop: space.sm,
    },
    errorSub: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 4,
      textAlign: 'center',
    },
    backHomeBtn: {
      marginTop: space.lg,
      backgroundColor: colors.brandAccent,
      paddingHorizontal: space.lg,
      paddingVertical: space.sm,
      borderRadius: radius.md,
    },
    backHomeBtnText: {
      color: colors.brandNavy,
      fontWeight: '700',
      fontSize: 14,
    },
    confirmedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: space.md,
      borderRadius: radius.md,
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.12)' : '#FEF3C7',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(247, 181, 3, 0.3)' : '#FDE68A',
    },
    confirmedTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: isDark ? colors.brandAccent : '#92400E',
    },
    confirmedSub: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : '#78350F',
      marginTop: 2,
      lineHeight: 17,
    },
    completedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: space.md,
      borderRadius: radius.md,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
    },
    completedTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: isDark ? '#34D399' : '#065F46',
    },
    completedSub: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : '#047857',
      marginTop: 2,
      lineHeight: 17,
    },
    cancelledBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: space.md,
      borderRadius: radius.md,
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA',
    },
    cancelledTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: isDark ? '#F87171' : '#991B1B',
    },
    cancelledSub: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : '#B91C1C',
      marginTop: 2,
    },
    stepperCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: space.md,
      letterSpacing: 0.3,
    },
    stepperContainer: {
      gap: 0,
    },
    stepperRow: {
      flexDirection: 'row',
      minHeight: 52,
    },
    stepIndicatorCol: {
      alignItems: 'center',
      width: 32,
    },
    stepDot: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepDotPassed: {
      backgroundColor: '#10B981',
    },
    stepDotCurrent: {
      backgroundColor: colors.brandAccent,
    },
    stepDotPending: {
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    stepDotNum: {
      fontSize: 12,
      fontWeight: '700',
    },
    stepDotNumCurrent: {
      color: colors.brandNavy,
    },
    stepDotNumPending: {
      color: colors.textMuted,
    },
    stepConnector: {
      width: 2,
      flex: 1,
      marginVertical: 4,
    },
    stepConnectorPassed: {
      backgroundColor: '#10B981',
    },
    stepConnectorPending: {
      backgroundColor: colors.border,
    },
    stepContentCol: {
      flex: 1,
      marginLeft: space.sm,
      paddingBottom: space.md,
    },
    stepLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    stepLabelCurrent: {
      color: colors.brandAccent,
    },
    stepLabelPending: {
      color: colors.textMuted,
    },
    inProgressPill: {
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.2)' : '#FEF3C7',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
    },
    inProgressPillText: {
      fontSize: 9,
      fontWeight: '800',
      color: isDark ? colors.brandAccent : '#92400E',
    },
    stepDesc: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
      lineHeight: 16,
    },
    vehicleCard: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: space.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    vehicleThumb: {
      width: 88,
      height: 72,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceSecondary,
    },
    vehicleInfo: {
      flex: 1,
      marginLeft: space.md,
      justifyContent: 'center',
    },
    vehicleTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    vehiclePrice: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.brandAccent,
      marginTop: 2,
    },
    vehicleSpecsRow: {
      marginTop: 2,
    },
    vehicleSpecsText: {
      fontSize: 11,
      color: colors.textMuted,
    },
    viewCarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      marginTop: 4,
    },
    viewCarText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.brandAccent,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    infoIconBox: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceSecondary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: space.md,
    },
    infoTextCol: {
      flex: 1,
    },
    infoLabel: {
      fontSize: 11,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      fontWeight: '600',
    },
    infoValue: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 2,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: space.sm,
    },
    pilotRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    pilotAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.brandAccent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pilotName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    pilotRole: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 1,
    },
    callPilotBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.brandAccent,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.md,
    },
    callPilotBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.brandNavy,
    },
    checklistCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    checklistItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      marginBottom: space.sm,
    },
    checklistText: {
      flex: 1,
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    actionsContainer: {
      gap: space.sm,
      marginTop: space.xs,
    },
    enquiryActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
      backgroundColor: colors.brandAccent,
      paddingVertical: space.md,
      borderRadius: radius.md,
    },
    enquiryActionText: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.brandNavy,
    },
    cancelActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(239, 68, 68, 0.4)' : '#FCA5A5',
      paddingVertical: space.md,
      borderRadius: radius.md,
    },
    cancelActionText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#EF4444',
    },
  });
