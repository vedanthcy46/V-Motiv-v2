import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../navigation/types';
import { useAppTheme } from '../theme';
import {
  CalendarDays,
  MapPin,
  Clock,
  ShieldCheck,
  Fuel,
  Sparkles,
  ChevronRight,
  ArrowRight,
  AlertCircle,
  Car,
  KeyRound,
  RotateCcw,
} from 'lucide-react-native';
import {
  fetchRentalHubs,
  fetchCustomerRentals,
  type RentalHub,
  type RentalBookingDetails,
} from '../services/rental-api';
import { BrandLogo } from '../components/BrandLogo';

type Props = NativeStackScreenProps<RootStack, 'RentalHome'>;

export function RentalHomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();

  const [hubs, setHubs] = useState<RentalHub[]>([]);
  const [selectedHub, setSelectedHub] = useState<RentalHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeRentals, setActiveRentals] = useState<RentalBookingDetails[]>([]);

  // Default dates: tomorrow 10:00 AM to day after tomorrow 10:00 AM (48 hours)
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

  useEffect(() => {
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
  }, []);

  const totalDurationHours = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)));
  const durationDays = Math.floor(totalDurationHours / 24);
  const remainderHours = totalDurationHours % 24;

  const durationLabel =
    durationDays > 0
      ? `${durationDays} Day${durationDays > 1 ? 's' : ''}${remainderHours > 0 ? ` ${remainderHours} Hr${remainderHours > 1 ? 's' : ''}` : ''}`
      : `${totalDurationHours} Hours`;

  const firstActive = activeRentals.length > 0 ? activeRentals[0] : null;

  // Quick preset helper
  const applyPreset = (daysToAdd: number) => {
    const newStart = new Date();
    newStart.setDate(newStart.getDate() + 1);
    newStart.setHours(10, 0, 0, 0);

    const newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + daysToAdd);

    setStartDate(newStart);
    setEndDate(newEnd);
  };

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
          { paddingBottom: insets.bottom + 100 },
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

        {/* Card: Date & Time Selector */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <CalendarDays size={18} color={colors.brandAccent} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Trip Dates & Time</Text>
          </View>

          {/* Quick Presets */}
          <View style={styles.presetsRow}>
            <Pressable
              onPress={() => applyPreset(1)}
              style={[styles.presetChip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <Text style={[styles.presetChipText, { color: colors.textPrimary }]}>24 Hours</Text>
            </Pressable>
            <Pressable
              onPress={() => applyPreset(2)}
              style={[styles.presetChip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <Text style={[styles.presetChipText, { color: colors.textPrimary }]}>2 Days</Text>
            </Pressable>
            <Pressable
              onPress={() => applyPreset(3)}
              style={[styles.presetChip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <Text style={[styles.presetChipText, { color: colors.textPrimary }]}>Weekend</Text>
            </Pressable>
            <Pressable
              onPress={() => applyPreset(7)}
              style={[styles.presetChip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <Text style={[styles.presetChipText, { color: colors.textPrimary }]}>1 Week</Text>
            </Pressable>
          </View>

          {/* Date summaries */}
          <View style={styles.dateIntervalGrid}>
            <View style={[styles.dateBlock, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.dateBlockLabel, { color: colors.textMuted }]}>PICKUP</Text>
              <Text style={[styles.dateBlockDate, { color: colors.textPrimary }]}>
                {startDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
              <Text style={[styles.dateBlockTime, { color: colors.brandAccent }]}>
                {startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </Text>
            </View>

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

            <View style={[styles.dateBlock, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.dateBlockLabel, { color: colors.textMuted }]}>RETURN</Text>
              <Text style={[styles.dateBlockDate, { color: colors.textPrimary }]}>
                {endDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
              <Text style={[styles.dateBlockTime, { color: colors.brandAccent }]}>
                {endDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </Text>
            </View>
          </View>
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
            paddingBottom: Math.max(insets.bottom, 16),
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
            Search Available Cars
          </Text>
          <ChevronRight size={20} color={isDark ? colors.brandNavy : '#FFFFFF'} />
        </Pressable>
      </View>
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
});
