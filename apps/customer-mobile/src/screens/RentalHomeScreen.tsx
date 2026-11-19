import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../navigation/types';
import { useAppTheme } from '../theme';
import { useAuth } from '../auth/AuthProvider';
import { AuthScreen } from './AuthScreen';
import {
  ArrowLeft,
  CalendarDays,
  Calendar,
  MapPin,
  Clock,
  ShieldCheck,
  Fuel,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  AlertCircle,
  Car,
  KeyRound,
  RotateCcw,
  Plus,
  Minus,
  Check,
  X,
} from 'lucide-react-native';
import {
  fetchRentalHubs,
  fetchCustomerRentals,
  type RentalHub,
  type RentalBookingDetails,
} from '../services/rental-api';
import { kmPackageSummary } from '../services/rental-km';
import { BrandLogo } from '../components/BrandLogo';
import { ComingSoonNotice } from '../components/ComingSoonNotice';
import { isFeatureOpen } from '../constants/features';
import { safeBottom } from '../layout/safe-layout';

type Props = NativeStackScreenProps<RootStack, 'RentalHome'>;

const TIME_SLOTS = [
  '08:00 AM',
  '09:00 AM',
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '01:00 PM',
  '02:00 PM',
  '03:00 PM',
  '04:00 PM',
  '06:00 PM',
  '08:00 PM',
  '10:00 PM',
];

const PRESET_DAYS = [1, 2, 3, 5, 7, 10, 14];

/** Rentals are coming soon (see constants/features.ts): until they are opened, nobody can reach the booking screens from here. */
export function RentalHomeScreen(props: Props) {
  if (!isFeatureOpen('rental')) return <ComingSoonNotice featureKey="rental" onBack={() => props.navigation.goBack()} />;
  return <RentalHomeContent {...props} />;
}

function RentalHomeContent({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const { state: authState } = useAuth();


  const [hubs, setHubs] = useState<RentalHub[]>([]);
  const [selectedHub, setSelectedHub] = useState<RentalHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeRentals, setActiveRentals] = useState<RentalBookingDetails[]>([]);

  // Default dates: tomorrow 10:00 AM to 3 days later 10:00 AM (2 days)
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d;
  });

  const [endDate, setEndDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setHours(10, 0, 0, 0);
    return d;
  });

  const [rentalDays, setRentalDays] = useState<number>(2);

  // Date picker modal state
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [activeDateTab, setActiveDateTab] = useState<'pickup' | 'return'>('pickup');
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());

  useEffect(() => {
    if (authState !== 'signed-in') return undefined;
    let mounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const [hubsList, rentalsList] = await Promise.all([
          fetchRentalHubs().catch(() => []),
          fetchCustomerRentals().catch(() => []),
        ]);
        if (mounted) {
          setHubs(hubsList);
          if (hubsList.length > 0 && !selectedHub) {
            setSelectedHub(hubsList[0] ?? null);
          }
          setActiveRentals(
            rentalsList.filter(
              r => r.status === 'CONFIRMED' || r.status === 'TRIP_ACTIVE' || r.status === 'VEHICLE_COLLECTED'
            )
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, [authState]);

  const totalDurationHours = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)));
  const durationDays = Math.floor(totalDurationHours / 24);
  const remainderHours = totalDurationHours % 24;

  const durationLabel =
    durationDays > 0
      ? `${durationDays} Day${durationDays > 1 ? 's' : ''}${remainderHours > 0 ? ` ${remainderHours} Hr${remainderHours > 1 ? 's' : ''}` : ''}`
      : `${totalDurationHours} Hours`;

  const firstActive = activeRentals.length > 0 ? activeRentals[0] : null;

  // Days adjustment stepper & chips
  const applyDays = (days: number) => {
    if (days < 1) return;
    setRentalDays(days);
    const newEnd = new Date(startDate);
    newEnd.setDate(newEnd.getDate() + days);
    setEndDate(newEnd);
  };

  const handlePrevMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleSelectCalendarDay = (day: number) => {
    const selected = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (selected < now) {
      Alert.alert('Invalid Date', 'Cannot pick dates in the past.');
      return;
    }

    if (activeDateTab === 'pickup') {
      const newStart = new Date(selected);
      newStart.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
      setStartDate(newStart);

      // If new start >= end, automatically advance end date by current rental days
      if (newStart.getTime() >= endDate.getTime()) {
        const newEnd = new Date(newStart);
        newEnd.setDate(newEnd.getDate() + Math.max(1, rentalDays));
        setEndDate(newEnd);
      } else {
        const diffDays = Math.max(1, Math.round((endDate.getTime() - newStart.getTime()) / (24 * 3600 * 1000)));
        setRentalDays(diffDays);
      }
      setActiveDateTab('return');
    } else {
      const newEnd = new Date(selected);
      newEnd.setHours(endDate.getHours(), endDate.getMinutes(), 0, 0);

      if (newEnd.getTime() <= startDate.getTime()) {
        Alert.alert('Invalid Return Date', 'Return date must be after pickup date.');
        return;
      }
      setEndDate(newEnd);
      const diffDays = Math.max(1, Math.round((newEnd.getTime() - startDate.getTime()) / (24 * 3600 * 1000)));
      setRentalDays(diffDays);
    }
  };

  const handleSelectTime = (timeStr: string) => {
    // Parse "10:00 AM" -> 10:00, "02:00 PM" -> 14:00
    const [time, meridian] = timeStr.split(' ');
    if (!time || !meridian) return;
    const parts = time.split(':');
    let h = Number(parts[0]) || 10;
    const m = Number(parts[1]) || 0;
    if (meridian === 'PM' && h < 12) h += 12;
    if (meridian === 'AM' && h === 12) h = 0;

    if (activeDateTab === 'pickup') {
      const newStart = new Date(startDate);
      newStart.setHours(h, m, 0, 0);
      setStartDate(newStart);
      if (newStart.getTime() >= endDate.getTime()) {
        const newEnd = new Date(newStart);
        newEnd.setDate(newEnd.getDate() + Math.max(1, rentalDays));
        setEndDate(newEnd);
      }
    } else {
      const newEnd = new Date(endDate);
      newEnd.setHours(h, m, 0, 0);
      if (newEnd.getTime() <= startDate.getTime()) {
        Alert.alert('Invalid Time', 'Return time must be after pickup time.');
        return;
      }
      setEndDate(newEnd);
    }
  };

  // Calendar matrix calculation
  const calendarData = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sun
    const adjustedFirstDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1; // 0 is Mon
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cells: Array<{ day: number; isPast: boolean; isPickup: boolean; isReturn: boolean; isInRange: boolean }> = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const cellDate = new Date(year, month, i);
      cellDate.setHours(0, 0, 0, 0);

      const startDay = new Date(startDate);
      startDay.setHours(0, 0, 0, 0);

      const endDay = new Date(endDate);
      endDay.setHours(0, 0, 0, 0);

      const isPast = cellDate < today;
      const isPickup = cellDate.getTime() === startDay.getTime();
      const isReturn = cellDate.getTime() === endDay.getTime();
      const isInRange = cellDate > startDay && cellDate < endDay;

      cells.push({ day: i, isPast, isPickup, isReturn, isInRange });
    }

    return { adjustedFirstDay, cells, monthName: calendarMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
  }, [calendarMonth, startDate, endDate]);

  // Signed-out view. It sits below every hook on purpose: returning before a hook changes how many hooks run when the person signs in or out.
  if (authState !== 'signed-in') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingHorizontal: 16,
            paddingBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8, marginRight: 8 }}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <BrandLogo variant="horizontal" size={24} bodyColor={isDark ? '#FFFFFF' : colors.brandNavy} />
          <View style={{ marginLeft: 10, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: isDark ? 'rgba(247, 181, 3, 0.15)' : '#FEF3C7' }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.brandAccent }}>RENTALS</Text>
          </View>
        </View>
        <AuthScreen includeTopInset={false} showHeader={false} />
      </View>
    );
  }

  const handleSearch = () => {
    if (!selectedHub) {
      Alert.alert('Select Location', 'Please choose a pickup hub to browse available rental vehicles.');
      return;
    }
    if (totalDurationHours < 8) {
      Alert.alert('Minimum Duration', 'The minimum rental duration is 8 hours.');
      return;
    }

    navigation.navigate('RentalSearchResults', {
      hubId: selectedHub.id,
      city: selectedHub.city,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
    });
  };

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
            accessibilityLabel="Go back"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <RotateCcw size={20} color={colors.textPrimary} />
          </Pressable>
          <BrandLogo size={28} />
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.headerTitleRow}>
          <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Self-Drive Rental</Text>
          <View style={[styles.badgePill, { backgroundColor: colors.brandAccent + '25' }]}>
            <Sparkles size={12} color={colors.brandAccent} />
            <Text style={[styles.badgeText, { color: isDark ? colors.brandAccent : colors.brandNavy }]}>Fleet V2</Text>
          </View>
        </View>
        <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]}>
          Browse company-managed rental vehicles and date-specific estimated pricing.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: safeBottom(insets.bottom) + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Active Booking Alert Banner */}
        {firstActive && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Active reservation ${firstActive.bookingNumber}. Tap to view details.`}
            onPress={() => navigation.navigate('RentalBookingDetails', { bookingId: firstActive.id })}
            style={[
              styles.activeBanner,
              {
                backgroundColor: isDark ? colors.surfaceSecondary : colors.brandNavy,
                borderColor: colors.brandAccent,
              },
            ]}
          >
            <View style={styles.activeBannerContent}>
              <View
                style={[
                  styles.activeBannerIcon,
                  { backgroundColor: isDark ? colors.surfaceRaised : '#0E284D' },
                ]}
              >
                <KeyRound size={22} color={colors.brandAccent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.activeBannerTitle}>Active Reservation: {firstActive.bookingNumber}</Text>
                <Text style={[styles.activeBannerSubtitle, { color: isDark ? colors.textSecondary : '#D1D5DB' }]}>
                  {firstActive.vehicle?.make} {firstActive.vehicle?.model} · Status:{' '}
                  {firstActive.status.replace('_', ' ')}
                </Text>
              </View>
              <ArrowRight size={18} color={colors.brandAccent} />
            </View>
          </Pressable>
        )}

        {/* Card: Location Selector */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <MapPin size={18} color={colors.brandAccent} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Pickup & Return Hub</Text>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color={colors.brandAccent} style={{ marginVertical: 16 }} />
          ) : hubs.length === 0 ? (
            <View style={[styles.infoBanner, { backgroundColor: colors.surfaceSecondary }]}>
              <AlertCircle size={16} color={colors.textSecondary} />
              <Text style={[styles.infoBannerText, { color: colors.textSecondary }]}>
                No hubs available at this moment. Please check back shortly.
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hubChipsContainer}>
              {hubs.map(hub => {
                const isSelected = selectedHub?.id === hub.id;
                return (
                  <Pressable
                    key={hub.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setSelectedHub(hub)}
                    style={[
                      styles.hubChip,
                      {
                        backgroundColor: isSelected
                          ? (isDark ? colors.brandAccent : colors.brandNavy)
                          : colors.surfaceSecondary,
                        borderColor: isSelected ? colors.brandAccent : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.hubChipText,
                        {
                          color: isSelected
                            ? (isDark ? colors.brandNavy : '#FFFFFF')
                            : colors.textPrimary,
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {hub.name}
                    </Text>
                    <Text
                      style={[
                        styles.hubChipCity,
                        {
                          color: isSelected
                            ? (isDark ? colors.brandNavy : colors.brandAccent)
                            : colors.textMuted,
                        },
                      ]}
                    >
                      {hub.city}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {selectedHub && (
            <View style={[styles.selectedHubDetails, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.hubAddressText, { color: colors.textSecondary }]}>{selectedHub.address}</Text>
              <Text style={[styles.hubHoursText, { color: colors.textMuted }]}>
                Hours: {selectedHub.operatingHours}
              </Text>
            </View>
          )}
        </View>

        {/* Card: Date & Duration Selector */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CalendarDays size={18} color={colors.brandAccent} />
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Rental Duration & Dates</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open calendar modal"
              onPress={() => setDateModalVisible(true)}
              style={[styles.miniCalendarBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <Calendar size={14} color={colors.brandAccent} />
              <Text style={[styles.miniCalendarBtnText, { color: colors.brandAccent }]}>Calendar</Text>
            </Pressable>
          </View>

          {/* Days Stepper Bar */}
          <View style={[styles.stepperContainer, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease rental days"
              onPress={() => applyDays(rentalDays - 1)}
              disabled={rentalDays <= 1}
              style={[
                styles.stepperButton,
                {
                  backgroundColor: colors.surface,
                  opacity: rentalDays <= 1 ? 0.4 : 1,
                },
              ]}
            >
              <Minus size={16} color={colors.textPrimary} />
            </Pressable>

            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={[styles.stepperTitle, { color: colors.textPrimary }]}>
                {rentalDays} {rentalDays === 1 ? 'Day' : 'Days'} of Rental
              </Text>
              <Text style={[styles.stepperSub, { color: colors.brandAccent }]}>
                {kmPackageSummary(selectedHub?.kmPolicy, rentalDays)}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase rental days"
              onPress={() => applyDays(rentalDays + 1)}
              disabled={rentalDays >= 30}
              style={[
                styles.stepperButton,
                {
                  backgroundColor: colors.surface,
                  opacity: rentalDays >= 30 ? 0.4 : 1,
                },
              ]}
            >
              <Plus size={16} color={colors.textPrimary} />
            </Pressable>
          </View>

          {/* Quick Days Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetsRow}
          >
            {PRESET_DAYS.map(d => {
              const isSelected = rentalDays === d;
              return (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => applyDays(d)}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: isSelected
                        ? (isDark ? colors.brandAccent : colors.brandNavy)
                        : colors.surfaceSecondary,
                      borderColor: isSelected ? colors.brandAccent : colors.border,
                      minWidth: 70,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      {
                        color: isSelected
                          ? (isDark ? colors.brandNavy : '#FFFFFF')
                          : colors.textPrimary,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}
                  >
                    {d === 1 ? '24 Hrs' : d === 7 ? '1 Week' : `${d} Days`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Interactive Date & Time Blocks (Tap to Open Picker) */}
          <View style={styles.dateIntervalGrid}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select pickup date and time"
              onPress={() => {
                setActiveDateTab('pickup');
                setDateModalVisible(true);
              }}
              style={({ pressed }) => [
                styles.dateBlock,
                {
                  backgroundColor: colors.surfaceSecondary,
                  borderColor: activeDateTab === 'pickup' && dateModalVisible ? colors.brandAccent : colors.border,
                  borderWidth: 1.5,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[styles.dateBlockLabel, { color: colors.textMuted }]}>PICKUP</Text>
                <Calendar size={11} color={colors.brandAccent} />
              </View>
              <Text style={[styles.dateBlockDate, { color: colors.textPrimary }]}>
                {startDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
              <Text style={[styles.dateBlockTime, { color: colors.brandAccent }]}>
                {startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </Text>
              <Text style={{ fontSize: 9, color: colors.textMuted, marginTop: 2 }}>Tap to adjust ✎</Text>
            </Pressable>

            <View style={styles.durationBadgeContainer}>
              <View
                style={[
                  styles.durationBadge,
                  {
                    backgroundColor: isDark ? colors.surfaceRaised : colors.brandNavy,
                    borderColor: colors.border,
                    borderWidth: isDark ? 1 : 0,
                  },
                ]}
              >
                <Clock size={12} color={colors.brandAccent} />
                <Text style={styles.durationBadgeText}>{durationLabel}</Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select return date and time"
              onPress={() => {
                setActiveDateTab('return');
                setDateModalVisible(true);
              }}
              style={({ pressed }) => [
                styles.dateBlock,
                {
                  backgroundColor: colors.surfaceSecondary,
                  borderColor: activeDateTab === 'return' && dateModalVisible ? colors.brandAccent : colors.border,
                  borderWidth: 1.5,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[styles.dateBlockLabel, { color: colors.textMuted }]}>RETURN</Text>
                <Calendar size={11} color={colors.brandAccent} />
              </View>
              <Text style={[styles.dateBlockDate, { color: colors.textPrimary }]}>
                {endDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
              <Text style={[styles.dateBlockTime, { color: colors.brandAccent }]}>
                {endDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </Text>
              <Text style={{ fontSize: 9, color: colors.textMuted, marginTop: 2 }}>Tap to adjust ✎</Text>
            </Pressable>
          </View>

          {/* Quick Date Picker CTA */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open calendar and time picker"
            onPress={() => setDateModalVisible(true)}
            style={[
              styles.openPickerBar,
              {
                backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(6, 26, 56, 0.06)',
                borderColor: colors.brandAccent,
              },
            ]}
          >
            <Calendar size={15} color={colors.brandAccent} />
            <Text style={[styles.openPickerBarText, { color: colors.textPrimary }]}>
              Choose Custom Calendar Dates & Hours
            </Text>
            <ChevronRight size={16} color={colors.brandAccent} />
          </Pressable>
        </View>

        {/* Transparency & Assurance Pillars */}
        <View style={styles.pillarsGrid}>
          <View style={[styles.pillarItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ShieldCheck size={20} color={colors.success} />
            <Text style={[styles.pillarTitle, { color: colors.textPrimary }]}>Zero Security Risk</Text>
            <Text style={[styles.pillarDesc, { color: colors.textSecondary }]}>
              100% refundable deposit returned via verified banking channel.
            </Text>
          </View>

          <View style={[styles.pillarItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Fuel size={20} color={colors.info} />
            <Text style={[styles.pillarTitle, { color: colors.textPrimary }]}>Fair Fuel Policy</Text>
            <Text style={[styles.pillarDesc, { color: colors.textSecondary }]}>
              Same-to-same fuel policy with verified odometer handover.
            </Text>
          </View>
        </View>

        {/* Regulatory Production Notice */}
        <View style={[styles.regulatoryNotice, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Car size={16} color={colors.textSecondary} />
          <Text style={[styles.regulatoryText, { color: colors.textSecondary }]}>
            Only active hubs with a currently eligible rental vehicle are listed. Availability is rechecked for your selected dates.
          </Text>
        </View>
      </ScrollView>

      {/* Sticky Bottom Search CTA */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: safeBottom(insets.bottom, 16),
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search available cars"
          onPress={handleSearch}
          style={({ pressed }) => [
            styles.ctaButton,
            {
              backgroundColor: isDark ? colors.brandAccent : colors.brandNavy,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Text style={[styles.ctaButtonText, { color: isDark ? colors.brandNavy : '#FFFFFF' }]}>
            Search Available Cars ({durationLabel})
          </Text>
          <ChevronRight size={20} color={isDark ? colors.brandNavy : '#FFFFFF'} />
        </Pressable>
      </View>

      {/* Comprehensive Date & Time Picker Modal */}
      <Modal
        visible={dateModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDateModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.dateModalCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                paddingBottom: safeBottom(insets.bottom, 20),
              },
            ]}
          >
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Choose Rental Dates & Times</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                  {durationLabel}{selectedHub?.kmPolicy?.includedKmPerDay ? ` · ${rentalDays * selectedHub.kmPolicy.includedKmPerDay} km included` : ''}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setDateModalVisible(false)}
                style={[styles.modalCloseBtn, { backgroundColor: colors.surfaceSecondary }]}
              >
                <X size={18} color={colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, gap: 16 }}>
              {/* Pickup / Return Tab Switcher */}
              <View style={[styles.modalTabRow, { backgroundColor: colors.surfaceSecondary }]}>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: activeDateTab === 'pickup' }}
                  onPress={() => setActiveDateTab('pickup')}
                  style={[
                    styles.modalTabBtn,
                    activeDateTab === 'pickup' && {
                      backgroundColor: isDark ? colors.brandAccent : colors.brandNavy,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.modalTabSub,
                      { color: activeDateTab === 'pickup' ? (isDark ? colors.brandNavy : '#FFFFFF') : colors.textMuted },
                    ]}
                  >
                    1. PICKUP
                  </Text>
                  <Text
                    style={[
                      styles.modalTabMain,
                      { color: activeDateTab === 'pickup' ? (isDark ? colors.brandNavy : '#FFFFFF') : colors.textPrimary },
                    ]}
                  >
                    {startDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                  <Text
                    style={[
                      styles.modalTabTime,
                      { color: activeDateTab === 'pickup' ? (isDark ? colors.brandNavy : colors.brandAccent) : colors.brandAccent },
                    ]}
                  >
                    {startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: activeDateTab === 'return' }}
                  onPress={() => setActiveDateTab('return')}
                  style={[
                    styles.modalTabBtn,
                    activeDateTab === 'return' && {
                      backgroundColor: isDark ? colors.brandAccent : colors.brandNavy,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.modalTabSub,
                      { color: activeDateTab === 'return' ? (isDark ? colors.brandNavy : '#FFFFFF') : colors.textMuted },
                    ]}
                  >
                    2. RETURN
                  </Text>
                  <Text
                    style={[
                      styles.modalTabMain,
                      { color: activeDateTab === 'return' ? (isDark ? colors.brandNavy : '#FFFFFF') : colors.textPrimary },
                    ]}
                  >
                    {endDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                  <Text
                    style={[
                      styles.modalTabTime,
                      { color: activeDateTab === 'return' ? (isDark ? colors.brandNavy : colors.brandAccent) : colors.brandAccent },
                    ]}
                  >
                    {endDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </Pressable>
              </View>

              {/* Month Calendar Navigation */}
              <View style={[styles.calendarBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <View style={styles.calendarMonthHeader}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Previous month"
                    onPress={handlePrevMonth}
                    style={[styles.calNavBtn, { backgroundColor: colors.surface }]}
                  >
                    <ChevronLeft size={18} color={colors.textPrimary} />
                  </Pressable>
                  <Text style={[styles.calMonthTitle, { color: colors.textPrimary }]}>
                    {calendarData.monthName}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Next month"
                    onPress={handleNextMonth}
                    style={[styles.calNavBtn, { backgroundColor: colors.surface }]}
                  >
                    <ChevronRight size={18} color={colors.textPrimary} />
                  </Pressable>
                </View>

                {/* Weekday Row */}
                <View style={styles.weekdayRow}>
                  {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(w => (
                    <Text key={w} style={[styles.weekdayText, { color: colors.textMuted }]}>
                      {w}
                    </Text>
                  ))}
                </View>

                {/* Day Grid */}
                <View style={styles.dayGrid}>
                  {Array.from({ length: calendarData.adjustedFirstDay }).map((_, idx) => (
                    <View key={`empty-${idx}`} style={styles.emptyDayCell} />
                  ))}
                  {calendarData.cells.map(c => {
                    return (
                      <Pressable
                        key={c.day}
                        accessibilityRole="button"
                        disabled={c.isPast}
                        onPress={() => handleSelectCalendarDay(c.day)}
                        style={[
                          styles.dayCell,
                          c.isInRange && {
                            backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(6, 26, 56, 0.1)',
                          },
                          (c.isPickup || c.isReturn) && {
                            backgroundColor: isDark ? colors.brandAccent : colors.brandNavy,
                            borderRadius: 18,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayCellText,
                            {
                              color: c.isPast
                                ? colors.textMuted + '60'
                                : (c.isPickup || c.isReturn)
                                ? (isDark ? colors.brandNavy : '#FFFFFF')
                                : colors.textPrimary,
                              fontWeight: (c.isPickup || c.isReturn) ? '800' : '500',
                            },
                          ]}
                        >
                          {c.day}
                        </Text>
                        {c.isPickup && (
                          <Text style={[styles.dayLabelMicro, { color: isDark ? colors.brandNavy : colors.brandAccent }]}>
                            PICK
                          </Text>
                        )}
                        {c.isReturn && (
                          <Text style={[styles.dayLabelMicro, { color: isDark ? colors.brandNavy : colors.brandAccent }]}>
                            RET
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Time Selector for Active Tab */}
              <View>
                <Text style={[styles.timePickerHeading, { color: colors.textSecondary }]}>
                  {activeDateTab === 'pickup' ? 'SELECT PICKUP TIME' : 'SELECT RETURN TIME'}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeSlotRow}>
                  {TIME_SLOTS.map(t => {
                    const activeDate = activeDateTab === 'pickup' ? startDate : endDate;
                    const activeTimeFormatted = activeDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                    const isSelected = activeTimeFormatted.toLowerCase().replace(/\s/g, '') === t.toLowerCase().replace(/\s/g, '');
                    return (
                      <Pressable
                        key={t}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        onPress={() => handleSelectTime(t)}
                        style={[
                          styles.timeSlotChip,
                          {
                            backgroundColor: isSelected
                              ? (isDark ? colors.brandAccent : colors.brandNavy)
                              : colors.surfaceSecondary,
                            borderColor: isSelected ? colors.brandAccent : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.timeSlotText,
                            {
                              color: isSelected
                                ? (isDark ? colors.brandNavy : '#FFFFFF')
                                : colors.textPrimary,
                              fontWeight: isSelected ? '700' : '500',
                            },
                          ]}
                        >
                          {t}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </ScrollView>

            {/* Modal Bottom Confirm Button */}
            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Confirm dates and times"
                onPress={() => setDateModalVisible(false)}
                style={[
                  styles.modalConfirmBtn,
                  { backgroundColor: isDark ? colors.brandAccent : colors.brandNavy },
                ]}
              >
                <Check size={18} color={isDark ? colors.brandNavy : '#FFFFFF'} />
                <Text style={[styles.modalConfirmBtnText, { color: isDark ? colors.brandNavy : '#FFFFFF' }]}>
                  Apply Dates ({durationLabel})
                </Text>
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
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  screenSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  activeBanner: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
  },
  activeBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  activeBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0E284D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  activeBannerSubtitle: {
    fontSize: 12,
    color: '#D1D5DB',
    marginTop: 2,
  },
  card: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  infoBannerText: {
    fontSize: 13,
    flex: 1,
  },
  hubChipsContainer: {
    gap: 10,
    paddingBottom: 4,
  },
  hubChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    minWidth: 130,
  },
  hubChipText: {
    fontSize: 14,
  },
  hubChipCity: {
    fontSize: 11,
    marginTop: 2,
  },
  selectedHubDetails: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
  },
  hubAddressText: {
    fontSize: 12,
    lineHeight: 16,
  },
  hubHoursText: {
    fontSize: 11,
    marginTop: 4,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dateIntervalGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dateBlock: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  dateBlockLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dateBlockDate: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  dateBlockTime: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  durationBadgeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  durationBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pillarsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  pillarItem: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  pillarTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  pillarDesc: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },
  regulatoryNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  regulatoryText: {
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  ctaButton: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  miniCalendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  miniCalendarBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  stepperSub: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  openPickerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  openPickerBarText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  dateModalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTabRow: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    gap: 6,
  },
  modalTabBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalTabSub: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modalTabMain: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  modalTabTime: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  calendarBox: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  calendarMonthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calMonthTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  weekdayText: {
    width: 38,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emptyDayCell: {
    width: '14.28%',
    height: 40,
  },
  dayCell: {
    width: '14.28%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellText: {
    fontSize: 13,
  },
  dayLabelMicro: {
    fontSize: 8,
    fontWeight: '800',
    marginTop: -2,
  },
  timePickerHeading: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  timeSlotRow: {
    gap: 8,
    paddingBottom: 4,
  },
  timeSlotChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  timeSlotText: {
    fontSize: 12,
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  modalConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  modalConfirmBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
