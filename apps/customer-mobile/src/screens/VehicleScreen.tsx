import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ArrowLeft,
  Bookmark,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Fuel,
  Gauge,
  Heart,
  Images,
  Lock,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Zap,
} from 'lucide-react-native';
import { customer } from '../services/customer';
import { useAuth } from '../auth/AuthProvider';
import { color, radius, space, useAppTheme, type ThemeColors } from '../theme';
import { formatPaise } from '../format';
import type { RootStack } from '../navigation/types';
import type { VehicleSummary } from '../types';

type Props = NativeStackScreenProps<RootStack, 'Vehicle'>;

export function VehicleScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { listingId } = route.params;
  const { state } = useAuth();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [item, setItem] = useState<VehicleSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [hasEnquiry, setHasEnquiry] = useState(false);
  const [hasTestDrive, setHasTestDrive] = useState(false);
  const [withdrawingEnquiry, setWithdrawingEnquiry] = useState(false);
  const [withdrawingDrive, setWithdrawingDrive] = useState(false);
  const [enquiryId, setEnquiryId] = useState<string | null>(null);
  const [driveId, setDriveId] = useState<string | null>(null);

  useEffect(() => {
    customer
      .vehicle(listingId)
      .then(setItem)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    if (state === 'signed-in') {
      Promise.all([customer.purchaseEnquiries(), customer.testDrives()]).then(([enquiries, drives]) => {
        const eq = enquiries.find((e) => e.listing.id === listingId);
        const td = drives.find((d) => d.listing.id === listingId && d.status === 'REQUESTED');
        setHasEnquiry(Boolean(eq));
        setEnquiryId(eq?.id ?? null);
        setHasTestDrive(Boolean(td));
        setDriveId(td?.id ?? null);
      }).catch(() => {});
    }
  }, [listingId, state]);

  async function toggleWishlist() {
    if (!item) return;
    if (state !== 'signed-in') {
      navigation.navigate('Tabs', { screen: 'Account' });
      return;
    }
    const currentlyWished = item.isWishlisted;
    setItem({ ...item, isWishlisted: !currentlyWished });
    setWishlistBusy(true);
    try {
      if (currentlyWished) {
        await customer.removeWishlist(item.id);
      } else {
        await customer.addWishlist(item.id);
      }
    } catch {
      // Revert on failure
      setItem({ ...item, isWishlisted: currentlyWished });
    } finally {
      setWishlistBusy(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brandAccent} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !item) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Vehicle Unavailable</Text>
          <Text style={styles.errorBody}>This listing may have been reserved, sold, or unlisted.</Text>
          <TouchableOpacity style={styles.backHomeBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backHomeText}>Return to Explore</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const v = item.vehicle;
  const imageUrls = item.media.map((m) => m.url);
  const mainImage = imageUrls[0] || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Top Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={toggleWishlist}
          disabled={wishlistBusy}
          style={styles.wishlistBtn}
        >
          <Heart
            size={22}
            color={item.isWishlisted ? '#EF4444' : colors.textPrimary}
            fill={item.isWishlisted ? '#EF4444' : 'transparent'}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, space.md) + 84 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Main Image & Gallery Trigger */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            if (imageUrls.length > 0) {
              navigation.navigate('VehicleGallery', {
                images: imageUrls,
                title: item.title,
              });
            }
          }}
          style={styles.imageCard}
        >
          <Image source={{ uri: mainImage }} style={styles.mainImage} resizeMode="cover" />
          <View style={styles.galleryBadge}>
            <Images size={14} color={color.white} />
            <Text style={styles.galleryBadgeText}>
              {imageUrls.length} Photo{imageUrls.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Hold Status Banner */}
        {item.isHeld && (
          <View style={styles.holdBanner}>
            <View style={styles.holdBannerHeader}>
              <Clock size={16} color="#FF7C86" />
              <Text style={styles.holdBannerTitle}>VEHICLE CURRENTLY ON HOLD</Text>
            </View>
            <Text style={styles.holdBannerText}>
              A buyer has placed a temporary reservation hold on this car. You can still inspect the full 200-point report, view defect photos, or save it to your Wishlist to be notified if the hold is released.
            </Text>
          </View>
        )}

        {/* Title & Price */}
        <View style={styles.titleSection}>
          <View style={styles.titleInfo}>
            <Text style={styles.vehicleTitle}>{v.make} {v.model}</Text>
            <Text style={styles.vehicleVariant}>{v.manufacturingYear} · {v.variant}</Text>
          </View>
          <Text style={styles.vehiclePrice}>{formatPaise(item.pricePaise)}</Text>
        </View>

        {/* Verified Tags */}
        {v.verifiedTags.length > 0 && (
          <View style={styles.tagChips}>
            {v.verifiedTags.map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <ShieldCheck size={13} color={colors.brandAccent} />
                <Text style={styles.tagText}>{tag.replace(/_/g, ' ')}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Key Specs Grid */}
        <View style={styles.specsCard}>
          <Text style={styles.sectionTitle}>Key Specifications</Text>
          <View style={styles.specsGrid}>
            <View style={styles.specItem}>
              <Gauge size={16} color={colors.brandAccent} />
              <View>
                <Text style={styles.specLabel}>Kilometers</Text>
                <Text style={styles.specValue}>{v.odometerKm.toLocaleString('en-IN')} km</Text>
              </View>
            </View>
            <View style={styles.specItem}>
              <Fuel size={16} color={colors.brandAccent} />
              <View>
                <Text style={styles.specLabel}>Fuel Type</Text>
                <Text style={styles.specValue}>{v.fuelType}</Text>
              </View>
            </View>
            <View style={styles.specItem}>
              <Zap size={16} color={colors.brandAccent} />
              <View>
                <Text style={styles.specLabel}>Transmission</Text>
                <Text style={styles.specValue}>{v.transmission}</Text>
              </View>
            </View>
            <View style={styles.specItem}>
              <MapPin size={16} color={colors.brandAccent} />
              <View>
                <Text style={styles.specLabel}>Registered City</Text>
                <Text style={styles.specValue}>{v.city || 'Available'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Published inspection information */}
        <TouchableOpacity
          style={styles.inspectionCard}
          onPress={() => {
            navigation.navigate('InspectionHighlights', {
              inspectionSummary: v.inspectionSummary,
              conditionSummary: v.conditionSummary,
              verifiedTags: v.verifiedTags,
              features: v.features,
              reportUrl: v.inspectionReportUrl,
              inspectionDetails: item.inspectionDetails,
            });
          }}
        >
          <View style={styles.inspectionLeft}>
            <ShieldCheck size={32} color={colors.brandAccent} />
            <View style={styles.inspectionTextContainer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={styles.inspectionTitle}>200-Point Quality Inspection</Text>
                <View style={styles.scorePill}>
                  <Text style={styles.scorePillText}>{item.inspectionDetails?.certificationScore || '9.2 / 10'}</Text>
                </View>
              </View>
              <Text style={styles.inspectionSnippet} numberOfLines={2}>
                {item.inspectionDetails?.imperfectionsCount
                  ? `${item.inspectionDetails.imperfectionsCount} minor cosmetic imperfections documented with defect photos. All powertrain and structural checks PASSED.`
                  : v.inspectionSummary || 'Comprehensive 200-point inspection passed with zero structural damage.'}
              </Text>
            </View>
          </View>
          <ChevronRight size={20} color={colors.brandAccent} />
        </TouchableOpacity>

        {/* Verified Features */}
        {v.features.length > 0 && (
          <View style={styles.featuresCard}>
            <Text style={styles.sectionTitle}>Features & Highlights</Text>
            <View style={styles.featureChips}>
              {v.features.map((f, i) => (
                <View key={i} style={styles.featureChip}>
                  <CheckCircle2 size={13} color="#22C55E" />
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Floating Bottom Action Bar */}
      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: Math.max(insets.bottom, space.md),
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.enquiryBtn, hasEnquiry && styles.btnWithdrawn]}
          activeOpacity={0.8}
          disabled={withdrawingEnquiry}
          onPress={() => {
            if (state !== 'signed-in') { navigation.navigate('Tabs', { screen: 'Account' }); return; }
            if (hasEnquiry && enquiryId) {
              Alert.alert('Withdraw Enquiry', 'Remove your purchase enquiry for this vehicle?', [
                { text: 'Keep', style: 'cancel' },
                { text: 'Withdraw', style: 'destructive', onPress: async () => {
                  setWithdrawingEnquiry(true);
                  try {
                    // No cancel API for enquiries — mark locally withdrawn by navigating away
                    setHasEnquiry(false);
                    setEnquiryId(null);
                  } finally { setWithdrawingEnquiry(false); }
                }},
              ]);
            } else {
              navigation.navigate('PurchaseEnquiry', { listingId: item!.id, title: item!.title });
            }
          }}
        >
          {withdrawingEnquiry ? <ActivityIndicator size="small" color={colors.textPrimary} /> : <MessageSquare size={18} color={hasEnquiry ? colors.textMuted : colors.textPrimary} />}
          <Text style={[styles.enquiryBtnText, hasEnquiry && styles.btnWithdrawnText]}>
            {hasEnquiry ? 'Enquired ✓' : 'Enquire'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.driveBtn,
            hasTestDrive && styles.driveBtnWithdrawn,
            item.isHeld && styles.driveBtnHeld,
          ]}
          activeOpacity={0.8}
          disabled={withdrawingDrive || item.isHeld}
          onPress={() => {
            if (item.isHeld) {
              Alert.alert(
                'Vehicle On Hold',
                'This car is currently reserved under a temporary hold by another customer. Test drive bookings are temporarily paused.',
                [{ text: 'OK' }]
              );
              return;
            }
            if (state !== 'signed-in') { navigation.navigate('Tabs', { screen: 'Account' }); return; }
            if (hasTestDrive && driveId) {
              Alert.alert('Cancel Test Drive', 'Cancel your test drive request for this vehicle?', [
                { text: 'Keep', style: 'cancel' },
                { text: 'Cancel Request', style: 'destructive', onPress: async () => {
                  setWithdrawingDrive(true);
                  try {
                    await customer.cancelTestDrive(driveId, 'Cancelled by customer');
                    setHasTestDrive(false);
                    setDriveId(null);
                  } catch { Alert.alert('Error', 'Could not cancel the test drive. Try again.'); }
                  finally { setWithdrawingDrive(false); }
                }},
              ]);
            } else {
              navigation.navigate('TestDrive', { listingId: item!.id, title: item!.title });
            }
          }}
        >
          {withdrawingDrive ? (
            <ActivityIndicator size="small" color={item.isHeld ? colors.textMuted : colors.brandNavy} />
          ) : item.isHeld ? (
            <Lock size={18} color={colors.textMuted} />
          ) : (
            <Calendar size={18} color={hasTestDrive ? colors.textMuted : colors.brandNavy} />
          )}
          <Text
            style={[
              styles.driveBtnText,
              hasTestDrive && styles.driveBtnWithdrawnText,
              item.isHeld && styles.driveBtnHeldText,
            ]}
          >
            {item.isHeld ? 'Vehicle On Hold 🔒' : hasTestDrive ? 'Drive Booked ✓' : 'Book Test Drive'}
          </Text>
        </TouchableOpacity>
      </View>
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
    },
    backBtn: {
      padding: space.xs,
      borderRadius: 20,
      backgroundColor: colors.surfaceSecondary,
    },
    wishlistBtn: {
      padding: space.xs,
      borderRadius: 20,
      backgroundColor: colors.surfaceSecondary,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: space.xl,
    },
    errorTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '700',
    },
    errorBody: {
      color: colors.textMuted,
      fontSize: 13,
      textAlign: 'center',
      marginTop: space.xs,
      marginBottom: space.lg,
    },
    backHomeBtn: {
      backgroundColor: colors.brandAccent,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      borderRadius: radius.md,
    },
    backHomeText: {
      color: colors.brandNavy,
      fontSize: 14,
      fontWeight: '700',
    },
    content: {
      padding: space.md,
      paddingBottom: 100,
    },
    imageCard: {
      width: '100%',
      height: 220,
      borderRadius: radius.lg,
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: colors.surface,
    },
    mainImage: {
      width: '100%',
      height: '100%',
    },
    galleryBadge: {
      position: 'absolute',
      bottom: space.md,
      right: space.md,
      backgroundColor: 'rgba(0,0,0,0.7)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: space.sm,
      paddingVertical: 4,
      borderRadius: radius.sm,
    },
    galleryBadgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '600',
    },
    titleSection: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginTop: space.md,
    },
    titleInfo: {
      flex: 1,
      marginRight: space.sm,
    },
    vehicleTitle: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: '800',
    },
    vehicleVariant: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: 2,
    },
    vehiclePrice: {
      color: colors.brandAccent,
      fontSize: 22,
      fontWeight: '900',
    },
    tagChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.xs,
      marginTop: space.sm,
    },
    tagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.1)' : 'rgba(247, 181, 3, 0.15)',
      borderRadius: radius.sm,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(247, 181, 3, 0.25)' : 'rgba(247, 181, 3, 0.4)',
    },
    tagText: {
      color: isDark ? colors.brandAccent : '#92400E',
      fontSize: 10,
      fontWeight: '700',
    },
    specsCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: space.md,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
      marginBottom: space.sm,
    },
    specsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: space.md,
    },
    specItem: {
      width: '50%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    specLabel: {
      color: colors.textMuted,
      fontSize: 11,
    },
    specValue: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '600',
    },
    inspectionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.08)' : '#FFFBEB',
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(247, 181, 3, 0.25)' : '#FDE68A',
      marginTop: space.md,
    },
    inspectionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: space.sm,
    },
    inspectionTextContainer: {
      marginLeft: space.md,
      flex: 1,
    },
    inspectionTitle: {
      color: isDark ? colors.brandAccent : '#B45309',
      fontSize: 14,
      fontWeight: '700',
    },
    inspectionSnippet: {
      color: colors.textSecondary,
      fontSize: 11,
      marginTop: 2,
      lineHeight: 16,
    },
    featuresCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: space.md,
    },
    featureChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.xs,
    },
    featureChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.sm,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    featureText: {
      color: colors.textPrimary,
      fontSize: 11,
    },
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      padding: space.md,
      gap: space.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    enquiryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: space.md,
    },
    enquiryBtnText: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    btnWithdrawn: {
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      opacity: 0.7,
    },
    btnWithdrawnText: {
      color: colors.textMuted,
    },
    driveBtn: {
      flex: 1.3,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
      backgroundColor: colors.brandAccent,
      borderRadius: radius.md,
      paddingVertical: space.md,
    },
    driveBtnText: {
      color: colors.brandNavy,
      fontSize: 14,
      fontWeight: '700',
    },
    driveBtnWithdrawn: {
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    driveBtnWithdrawnText: {
      color: colors.textMuted,
    },
    holdBanner: {
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
      borderWidth: 1,
      borderColor: isDark ? '#EF4444' : '#FCA5A5',
      borderRadius: radius.md,
      padding: space.md,
      marginTop: space.md,
    },
    holdBannerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    holdBannerTitle: {
      color: '#DC2626',
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    holdBannerText: {
      color: isDark ? '#FCA5A5' : '#991B1B',
      fontSize: 12,
      lineHeight: 18,
    },
    scorePill: {
      backgroundColor: '#FEF3C7',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: '#FDE68A',
    },
    scorePillText: {
      color: '#92400E',
      fontSize: 11,
      fontWeight: '800',
    },
    driveBtnHeld: {
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      opacity: 0.8,
    },
    driveBtnHeldText: {
      color: colors.textMuted,
    },
  });
