import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../navigation/types';
import { useAppTheme } from '../theme';
import {
  ArrowLeft,
  Fuel,
  Settings2,
  Users,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  Sparkles,
  ChevronRight,
  MapPin,
  Calendar,
} from 'lucide-react-native';
import {
  fetchRentalVehicleDetails,
  createRentalHold,
  type RentalFleetVehicle,
} from '../services/rental-api';
import { useAuth } from '../auth/AuthProvider';
import { CarBrandLogo } from '../components/CarBrandLogo';
import { safeBottom } from '../layout/safe-layout';

type Props = NativeStackScreenProps<RootStack, 'RentalVehicleDetails'>;

export function RentalVehicleDetailsScreen({ route, navigation }: Props) {
  const { vehicleId, startTime, endTime } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const { state: authState } = useAuth();

  const [vehicle, setVehicle] = useState<RentalFleetVehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function loadDetails() {
      try {
        setLoading(true);
        const data = await fetchRentalVehicleDetails(vehicleId, startTime, endTime);
        if (mounted) setVehicle(data);
      } catch (e: any) {
        Alert.alert('Vehicle Error', e?.message || 'Could not load vehicle details.');
        navigation.goBack();
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadDetails();
    return () => {
      mounted = false;
    };
  }, [vehicleId, startTime, endTime]);

  const [reserving, setReserving] = useState(false);

  const handleReserve = async () => {
    if (!vehicle) return;
    if (authState !== 'signed-in') {
      navigation.navigate('Tabs', { screen: 'Account' });
      return;
    }
    try {
      setReserving(true);
      const hubId = vehicle.hub?.id || vehicle.hubId || '';

      const st = startTime ? new Date(startTime).toISOString() : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const et = endTime ? new Date(endTime).toISOString() : new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

      const hold = await createRentalHold({
        vehicleId: vehicle.id,
        hubId,
        startTime: st,
        endTime: et,
      });

      navigation.navigate('RentalCheckout', {
        holdId: hold.id,
        holdCode: hold.holdCode,
        vehicle,
        quoteSnapshot: hold.quoteSnapshot || vehicle.quote,
        startTime: st,
        endTime: et,
        hubName: vehicle.hub?.name || 'Local Hub',
      });
    } catch (e: any) {
      const errMsg =
        e?.message && e.message !== 'INVALID_INPUT'
          ? e.message
          : 'Unable to reserve this vehicle. It may be currently booked or the selected time slot is unavailable. Please choose another date or car.';
      Alert.alert('Reservation Unavailable', errMsg);
    } finally {
      setReserving(false);
    }
  };

  if (loading || !vehicle) {
    return (
      <View style={[styles.loadingCenter, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.brandAccent} />
      </View>
    );
  }

  const images = vehicle.images?.length > 0 ? vehicle.images : [];

  const quote = vehicle.quote;
  const baseFareRupees = quote ? Math.round(Number(quote.baseFarePaise) / 100) : 0;
  const taxRupees = quote ? Math.round(Number(quote.taxPaise) / 100) : 0;
  const depositRupees = Math.round(Number(vehicle.securityDepositPaise) / 100);
  const totalRupees = baseFareRupees + taxRupees + depositRupees;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Back button overlay */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => navigation.goBack()}
        style={[
          styles.floatingBackButton,
          { top: Math.max(insets.top + 8, 20), backgroundColor: colors.surface },
        ]}
      >
        <ArrowLeft size={20} color={colors.textPrimary} />
      </Pressable>

      <ScrollView
        contentContainerStyle={{ paddingBottom: safeBottom(insets.bottom) + 110 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Gallery */}
        <View style={styles.galleryWrapper}>
          {images.length > 0 ? (
            <Image source={{ uri: images[activeImageIndex] }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={styles.noPhotoState} accessibilityLabel="Vehicle photo not available">
              <AlertCircle size={28} color="#FFFFFF" />
              <Text style={styles.noPhotoText}>Vehicle photo pending</Text>
            </View>
          )}
          {images.length > 1 && (
            <View style={styles.dotsRow}>
              {images.map((_, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: idx === activeImageIndex ? colors.brandAccent : 'rgba(255,255,255,0.5)',
                      width: idx === activeImageIndex ? 16 : 6,
                    },
                  ]}
                />
              ))}
            </View>
          )}
        </View>

        <View style={styles.bodyContent}>
          {/* Title Header */}
          <View style={styles.titleSection}>
            <View style={styles.brandRow}>
              <CarBrandLogo brand={vehicle.make} size={32} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.titleMakeModel, { color: colors.textPrimary }]}>
                  {vehicle.make} {vehicle.model}
                </Text>
                <Text style={[styles.titleVariant, { color: colors.textSecondary }]}>
                  {vehicle.variant || vehicle.color} · {vehicle.year}
                </Text>
              </View>
            </View>

            <View style={[styles.hubLocationTag, { backgroundColor: colors.surfaceSecondary }]}>
              <MapPin size={14} color={colors.brandAccent} />
              <Text style={[styles.hubLocationText, { color: colors.textPrimary }]}>
                Pickup at {vehicle.hub?.name}, {vehicle.hub?.city}
              </Text>
            </View>
          </View>

          {/* Quick Specs Badges */}
          <View style={styles.specsGrid}>
            <View style={[styles.specCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Fuel size={20} color={colors.brandAccent} />
              <Text style={[styles.specLabel, { color: colors.textMuted }]}>FUEL</Text>
              <Text style={[styles.specValue, { color: colors.textPrimary }]}>{vehicle.fuelType}</Text>
            </View>

            <View style={[styles.specCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Settings2 size={20} color={colors.brandAccent} />
              <Text style={[styles.specLabel, { color: colors.textMuted }]}>GEARBOX</Text>
              <Text style={[styles.specValue, { color: colors.textPrimary }]}>{vehicle.transmission}</Text>
            </View>

            <View style={[styles.specCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Users size={20} color={colors.brandAccent} />
              <Text style={[styles.specLabel, { color: colors.textMuted }]}>CAPACITY</Text>
              <Text style={[styles.specValue, { color: colors.textPrimary }]}>{vehicle.seats} Seats</Text>
            </View>
          </View>

          {/* Verified Fleet Compliance */}
          <View style={[styles.complianceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.complianceHeader}>
              <ShieldCheck size={20} color={colors.success} />
              <Text style={[styles.complianceTitle, { color: colors.textPrimary }]}>
                Verified Commercial Compliance
              </Text>
            </View>

            <View style={styles.complianceItems}>
              <View style={styles.complianceRow}>
                <CheckCircle2 size={16} color={colors.success} />
                <Text style={[styles.complianceText, { color: colors.textSecondary }]}>
                  Commercial Self-Drive Permit: {vehicle.commercialPermitNumber}
                </Text>
              </View>
              <View style={styles.complianceRow}>
                <CheckCircle2 size={16} color={colors.success} />
                <Text style={[styles.complianceText, { color: colors.textSecondary }]}>
                  Full Comprehensive & Third-Party Insurance Policy
                </Text>
              </View>
              <View style={styles.complianceRow}>
                <CheckCircle2 size={16} color={colors.success} />
                <Text style={[styles.complianceText, { color: colors.textSecondary }]}>
                  Multi-Point Safety Inspected & Sanitized
                </Text>
              </View>
            </View>
          </View>

          {/* Transparent Price Breakdown */}
          {quote && (
            <View style={[styles.pricingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Price Breakdown</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                Complete, upfront pricing with zero surprises.
              </Text>

              <View style={styles.pricingItems}>
                <View style={styles.priceLine}>
                  <Text style={[styles.priceLineLabel, { color: colors.textSecondary }]}>
                    Rental Base Fare ({quote.totalHours} hrs / {quote.billableDays} days)
                  </Text>
                  <Text style={[styles.priceLineValue, { color: colors.textPrimary }]}>
                    ₹{baseFareRupees.toLocaleString('en-IN')}
                  </Text>
                </View>

                <View style={styles.priceLine}>
                  <Text style={[styles.priceLineLabel, { color: colors.textSecondary }]}>
                    Goods & Services Tax (18% GST)
                  </Text>
                  <Text style={[styles.priceLineValue, { color: colors.textPrimary }]}>
                    ₹{taxRupees.toLocaleString('en-IN')}
                  </Text>
                </View>

                <View style={styles.priceLine}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[styles.priceLineLabel, { color: colors.textSecondary }]}>
                      Security Deposit (100% Refundable)
                    </Text>
                    <HelpCircle size={14} color={colors.textMuted} />
                  </View>
                  <Text style={[styles.priceLineValue, { color: colors.success, fontWeight: '700' }]}>
                    ₹{depositRupees.toLocaleString('en-IN')}
                  </Text>
                </View>

                <View style={[styles.priceDivider, { backgroundColor: colors.border }]} />

                <View style={styles.priceLine}>
                  <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>Total Payable</Text>
                  <Text
                    style={[
                      styles.totalValue,
                      { color: isDark ? colors.brandAccent : colors.brandNavy },
                    ]}
                  >
                    ₹{totalRupees.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Rental Terms & Policies */}
          <View style={[styles.termsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Rental Policy</Text>

            <View style={styles.policyRow}>
              <Clock size={16} color={colors.brandAccent} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.policyHeading, { color: colors.textPrimary }]}>Kilometer Allowance</Text>
                <Text style={[styles.policyDesc, { color: colors.textSecondary }]}>
                  {quote?.includedKm || 250} km included. Additional driving is charged at ₹
                  {Math.round(Number(vehicle.extraKmRatePaise) / 100)}/km upon return.
                </Text>
              </View>
            </View>

            <View style={styles.policyRow}>
              <Fuel size={16} color={colors.brandAccent} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.policyHeading, { color: colors.textPrimary }]}>Fuel Policy</Text>
                <Text style={[styles.policyDesc, { color: colors.textSecondary }]}>
                  Same-to-same. Return the vehicle with the same fuel level as recorded at pickup.
                </Text>
              </View>
            </View>

            <View style={styles.policyRow}>
              <ShieldCheck size={16} color={colors.brandAccent} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.policyHeading, { color: colors.textPrimary }]}>Driver Eligibility</Text>
                <Text style={[styles.policyDesc, { color: colors.textSecondary }]}>
                  Driver must be at least 21 years old and hold a valid Indian driving license with min 1 year experience.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sticky Bottom Reserve CTA */}
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
        <View style={styles.bottomBarContent}>
          <View>
            <Text
              style={[
                styles.bottomBarPrice,
                { color: isDark ? colors.brandAccent : colors.brandNavy },
              ]}
            >
              ₹{totalRupees.toLocaleString('en-IN')}
            </Text>
            <Text style={[styles.bottomBarSubtitle, { color: colors.textSecondary }]}>
              Includes ₹{depositRupees.toLocaleString('en-IN')} deposit
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Proceed to rental checkout"
            onPress={handleReserve}
            disabled={reserving}
            style={({ pressed }) => [
              styles.reserveCta,
              {
                backgroundColor: isDark ? colors.brandAccent : colors.brandNavy,
                opacity: (pressed || reserving) ? 0.85 : 1,
              },
            ]}
          >
            {reserving ? (
              <ActivityIndicator size="small" color={isDark ? colors.brandNavy : '#FFFFFF'} />
            ) : (
              <>
                <Text
                  style={[
                    styles.reserveCtaText,
                    { color: isDark ? colors.brandNavy : '#FFFFFF' },
                  ]}
                >
                  Reserve & Checkout
                </Text>
                <ChevronRight size={18} color={isDark ? colors.brandNavy : '#FFFFFF'} />
              </>
            )}
          </Pressable>
        </View>
      </View>
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
  floatingBackButton: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  galleryWrapper: {
    height: 260,
    position: 'relative',
    backgroundColor: '#0E284D',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  noPhotoState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  noPhotoText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  dotsRow: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  bodyContent: {
    padding: 16,
    gap: 16,
  },
  titleSection: {
    gap: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleMakeModel: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  titleVariant: {
    fontSize: 13,
    marginTop: 2,
  },
  hubLocationTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  hubLocationText: {
    fontSize: 12,
    fontWeight: '600',
  },
  specsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  specCard: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  specLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  specValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  complianceCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  complianceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  complianceTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  complianceItems: {
    gap: 8,
  },
  complianceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  complianceText: {
    fontSize: 12,
    flex: 1,
  },
  pricingCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  pricingItems: {
    marginTop: 14,
    gap: 10,
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLineLabel: {
    fontSize: 13,
  },
  priceLineValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  priceDivider: {
    height: 1,
    marginVertical: 4,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '800',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  termsCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    gap: 14,
  },
  policyRow: {
    flexDirection: 'row',
    gap: 10,
  },
  policyHeading: {
    fontSize: 13,
    fontWeight: '700',
  },
  policyDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  bottomBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bottomBarPrice: {
    fontSize: 22,
    fontWeight: '800',
  },
  bottomBarSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  reserveCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
  },
  reserveCtaText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
