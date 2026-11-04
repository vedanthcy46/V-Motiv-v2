import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../navigation/types';
import { useAppTheme } from '../theme';
import {
  ArrowLeft,
  Filter,
  Calendar,
  Fuel,
  Settings2,
  Users,
  Shield,
  ChevronRight,
  Sparkles,
} from 'lucide-react-native';
import {
  searchRentalCars,
  type RentalFleetVehicle,
} from '../services/rental-api';
import { CarBrandLogo } from '../components/CarBrandLogo';
import { safeBottom } from '../layout/safe-layout';

type Props = NativeStackScreenProps<RootStack, 'RentalSearchResults'>;

export function RentalSearchResultsScreen({ route, navigation }: Props) {
  const { hubId, city, startTime, endTime } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();

  const [vehicles, setVehicles] = useState<RentalFleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [fuelFilter, setFuelFilter] = useState<string>('ALL');
  const [transFilter, setTransFilter] = useState<string>('ALL');

  const start = new Date(startTime);
  const end = new Date(endTime);
  const durationHours = Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60)));
  const days = Math.floor(durationHours / 24);
  const hours = durationHours % 24;

  useEffect(() => {
    let active = true;
    async function fetchResults() {
      try {
        setLoading(true);
        const results = await searchRentalCars({
          hubId,
          city,
          startTime,
          endTime,
        });
        if (active) setVehicles(results);
      } catch (err) {
        if (active) setVehicles([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchResults();
    return () => {
      active = false;
    };
  }, [hubId, city, startTime, endTime]);

  const filteredVehicles = vehicles.filter(v => {
    if (fuelFilter !== 'ALL' && v.fuelType.toUpperCase() !== fuelFilter) return false;
    if (transFilter !== 'ALL' && v.transmission.toUpperCase() !== transFilter) return false;
    return true;
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header */}
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
        <View style={styles.headerTop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Available Cars</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              {city || 'Selected Hub'} · {days > 0 ? `${days}d ` : ''}{hours > 0 ? `${hours}h` : ''}
            </Text>
          </View>
        </View>

        {/* Filter Chips */}
        <View style={styles.filtersScroll}>
          <Pressable
            onPress={() => setFuelFilter(f => (f === 'ALL' ? 'PETROL' : f === 'PETROL' ? 'DIESEL' : f === 'DIESEL' ? 'EV' : 'ALL'))}
            style={[
              styles.filterChip,
              {
                backgroundColor: fuelFilter !== 'ALL'
                  ? (isDark ? colors.brandAccent : colors.brandNavy)
                  : colors.surfaceSecondary,
                borderColor: fuelFilter !== 'ALL' ? colors.brandAccent : colors.border,
              },
            ]}
          >
            <Fuel
              size={14}
              color={fuelFilter !== 'ALL' ? (isDark ? colors.brandNavy : colors.brandAccent) : colors.textPrimary}
            />
            <Text
              style={[
                styles.filterChipText,
                {
                  color: fuelFilter !== 'ALL' ? (isDark ? colors.brandNavy : '#FFFFFF') : colors.textPrimary,
                  fontWeight: fuelFilter !== 'ALL' ? '700' : '600',
                },
              ]}
            >
              Fuel: {fuelFilter}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTransFilter(t => (t === 'ALL' ? 'AUTOMATIC' : t === 'AUTOMATIC' ? 'MANUAL' : 'ALL'))}
            style={[
              styles.filterChip,
              {
                backgroundColor: transFilter !== 'ALL'
                  ? (isDark ? colors.brandAccent : colors.brandNavy)
                  : colors.surfaceSecondary,
                borderColor: transFilter !== 'ALL' ? colors.brandAccent : colors.border,
              },
            ]}
          >
            <Settings2
              size={14}
              color={transFilter !== 'ALL' ? (isDark ? colors.brandNavy : colors.brandAccent) : colors.textPrimary}
            />
            <Text
              style={[
                styles.filterChipText,
                {
                  color: transFilter !== 'ALL' ? (isDark ? colors.brandNavy : '#FFFFFF') : colors.textPrimary,
                  fontWeight: transFilter !== 'ALL' ? '700' : '600',
                },
              ]}
            >
              Gear: {transFilter}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Main Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.brandAccent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Scanning fleet availability & pricing...
          </Text>
        </View>
      ) : filteredVehicles.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Calendar size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Cars Available</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            All vehicles at this hub are reserved or undergoing routine maintenance for the requested dates.
          </Text>
          <Pressable
            onPress={() => navigation.goBack()}
            style={[
              styles.modifyButton,
              { backgroundColor: isDark ? colors.brandAccent : colors.brandNavy },
            ]}
          >
            <Text style={[styles.modifyButtonText, { color: isDark ? colors.brandNavy : '#FFFFFF' }]}>
              Adjust Dates / Hub
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredVehicles}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: safeBottom(insets.bottom) + 24 }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const photoUrl = item.images?.[0];
            const totalPaise = Number(item.quote?.totalPayablePaise || item.baseDailyRatePaise);
            const totalRupees = Math.round(totalPaise / 100);
            const depositRupees = Math.round(Number(item.securityDepositPaise) / 100);

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.make} ${item.model}, ${totalRupees} rupees total. Tap for details.`}
                onPress={() =>
                  navigation.navigate('RentalVehicleDetails', {
                    vehicleId: item.id,
                    startTime,
                    endTime,
                  })
                }
                style={[
                  styles.vehicleCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                {/* Image Section */}
                <View style={styles.imageWrapper}>
                  {photoUrl ? (
                    <Image source={{ uri: photoUrl }} style={styles.vehicleImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.noPhotoState} accessibilityLabel="Vehicle photo not available">
                      <Text style={styles.noPhotoText}>Photo pending</Text>
                    </View>
                  )}
                  <View style={[styles.badgeOdometer, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
                    <Text style={styles.badgeOdometerText}>{item.year} Model</Text>
                  </View>
                </View>

                {/* Content Section */}
                <View style={styles.cardBody}>
                  <View style={styles.cardHeaderRow}>
                    <CarBrandLogo brand={item.make} size={28} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.vehicleName, { color: colors.textPrimary }]}>
                        {item.make} {item.model}
                      </Text>
                      <Text style={[styles.vehicleVariant, { color: colors.textMuted }]}>
                        {item.variant || item.color}
                      </Text>
                    </View>
                  </View>

                  {/* Specs Chips */}
                  <View style={styles.specsRow}>
                    <View style={[styles.specChip, { backgroundColor: colors.surfaceSecondary }]}>
                      <Fuel size={12} color={colors.textSecondary} />
                      <Text style={[styles.specChipText, { color: colors.textSecondary }]}>
                        {item.fuelType}
                      </Text>
                    </View>
                    <View style={[styles.specChip, { backgroundColor: colors.surfaceSecondary }]}>
                      <Settings2 size={12} color={colors.textSecondary} />
                      <Text style={[styles.specChipText, { color: colors.textSecondary }]}>
                        {item.transmission}
                      </Text>
                    </View>
                    <View style={[styles.specChip, { backgroundColor: colors.surfaceSecondary }]}>
                      <Users size={12} color={colors.textSecondary} />
                      <Text style={[styles.specChipText, { color: colors.textSecondary }]}>
                        {item.seats} Seats
                      </Text>
                    </View>
                  </View>

                  {/* Km allowance banner */}
                  <View
                    style={[
                      styles.kmAllowanceBanner,
                      {
                        backgroundColor: isDark ? colors.surfaceSecondary : colors.brandAccent + '15',
                        borderColor: isDark ? colors.border : colors.brandAccent + '40',
                        borderWidth: 1,
                      },
                    ]}
                  >
                    <Sparkles size={12} color={colors.brandAccent} />
                    <Text
                      style={[
                        styles.kmAllowanceText,
                        { color: isDark ? colors.textPrimary : colors.brandNavy },
                      ]}
                    >
                      {item.quote?.includedKm || 250} km included · Extra km ₹{Math.round(Number(item.extraKmRatePaise) / 100)}/km
                    </Text>
                  </View>

                  {/* Divider */}
                  <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

                  {/* Price & Action Footer */}
                  <View style={styles.cardFooter}>
                    <View>
                      <View style={styles.priceRow}>
                        <Text
                          style={[
                            styles.priceAmount,
                            { color: isDark ? colors.brandAccent : colors.brandNavy },
                          ]}
                        >
                          ₹{totalRupees.toLocaleString('en-IN')}
                        </Text>
                        <Text style={[styles.priceDuration, { color: colors.textMuted }]}>
                          total
                        </Text>
                      </View>
                      <Text style={[styles.depositNote, { color: colors.textSecondary }]}>
                        Includes ₹{depositRupees.toLocaleString('en-IN')} refundable deposit
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.reserveButton,
                        { backgroundColor: isDark ? colors.brandAccent : colors.brandNavy },
                      ]}
                    >
                      <Text
                        style={[
                          styles.reserveButtonText,
                          { color: isDark ? colors.brandNavy : '#FFFFFF' },
                        ]}
                      >
                        View Details
                      </Text>
                      <ChevronRight size={16} color={isDark ? colors.brandNavy : '#FFFFFF'} />
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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
  filtersScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
    maxWidth: 280,
  },
  modifyButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  modifyButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    gap: 16,
  },
  vehicleCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  imageWrapper: {
    height: 180,
    position: 'relative',
    backgroundColor: '#0E284D',
  },
  vehicleImage: {
    width: '100%',
    height: '100%',
  },
  noPhotoState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotoText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  badgeOdometer: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeOdometerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardBody: {
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleName: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  vehicleVariant: {
    fontSize: 12,
    marginTop: 2,
  },
  specsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  specChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  specChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  kmAllowanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 10,
  },
  kmAllowanceText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardDivider: {
    height: 1,
    marginVertical: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  priceAmount: {
    fontSize: 20,
    fontWeight: '800',
  },
  priceDuration: {
    fontSize: 12,
  },
  depositNote: {
    fontSize: 10,
    marginTop: 2,
  },
  reserveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  reserveButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
