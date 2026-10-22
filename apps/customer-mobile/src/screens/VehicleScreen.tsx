import React, { useEffect, useState } from 'react';
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
  FileText,
  Fuel,
  Gauge,
  Heart,
  Images,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Zap,
} from 'lucide-react-native';
import { customer } from '../services/customer';
import { useAuth } from '../auth/AuthProvider';
import { color, radius, space } from '../theme';
import { formatPaise } from '../format';
import type { RootStack } from '../navigation/types';
import type { VehicleSummary } from '../types';

type Props = NativeStackScreenProps<RootStack, 'Vehicle'>;

export function VehicleScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { listingId } = route.params;
  const { state } = useAuth();
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
            <ArrowLeft size={22} color={color.white} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={color.yellow} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !item) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={22} color={color.white} />
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
          <ArrowLeft size={22} color={color.white} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={toggleWishlist}
          disabled={wishlistBusy}
          style={styles.wishlistBtn}
        >
          <Heart
            size={22}
            color={item.isWishlisted ? '#EF4444' : color.white}
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
                <ShieldCheck size={13} color={color.yellow} />
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
              <Gauge size={16} color={color.yellow} />
              <View>
                <Text style={styles.specLabel}>Kilometers</Text>
                <Text style={styles.specValue}>{v.odometerKm.toLocaleString('en-IN')} km</Text>
              </View>
            </View>
            <View style={styles.specItem}>
              <Fuel size={16} color={color.yellow} />
              <View>
                <Text style={styles.specLabel}>Fuel Type</Text>
                <Text style={styles.specValue}>{v.fuelType}</Text>
              </View>
            </View>
            <View style={styles.specItem}>
              <Zap size={16} color={color.yellow} />
              <View>
                <Text style={styles.specLabel}>Transmission</Text>
                <Text style={styles.specValue}>{v.transmission}</Text>
              </View>
            </View>
            <View style={styles.specItem}>
              <MapPin size={16} color={color.yellow} />
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
            });
          }}
        >
          <View style={styles.inspectionLeft}>
            <ShieldCheck size={28} color={color.yellow} />
            <View style={styles.inspectionTextContainer}>
              <Text style={styles.inspectionTitle}>Inspection information</Text>
              <Text style={styles.inspectionSnippet} numberOfLines={2}>
                {v.inspectionSummary || 'No customer-visible inspection summary has been published for this listing.'}
              </Text>
            </View>
          </View>
          <ChevronRight size={20} color={color.yellow} />
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
          {withdrawingEnquiry ? <ActivityIndicator size="small" color={color.white} /> : <MessageSquare size={18} color={hasEnquiry ? color.muted : color.white} />}
          <Text style={[styles.enquiryBtnText, hasEnquiry && styles.btnWithdrawnText]}>
            {hasEnquiry ? 'Enquired ✓' : 'Enquire'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.driveBtn, hasTestDrive && styles.driveBtnWithdrawn]}
          activeOpacity={0.8}
          disabled={withdrawingDrive}
          onPress={() => {
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
          {withdrawingDrive ? <ActivityIndicator size="small" color={color.navy} /> : <Calendar size={18} color={hasTestDrive ? color.muted : color.navy} />}
          <Text style={[styles.driveBtnText, hasTestDrive && styles.driveBtnWithdrawnText]}>
            {hasTestDrive ? 'Drive Booked ✓' : 'Book Test Drive'}
          </Text>
        </TouchableOpacity>
      </View>
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
  },
  backBtn: {
    padding: space.xs,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  wishlistBtn: {
    padding: space.xs,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.xl,
  },
  errorTitle: {
    color: color.white,
    fontSize: 18,
    fontWeight: '700',
  },
  errorBody: {
    color: color.muted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: space.xs,
    marginBottom: space.lg,
  },
  backHomeBtn: {
    backgroundColor: color.yellow,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  backHomeText: {
    color: color.navy,
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
    backgroundColor: color.card,
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
    color: color.white,
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
    color: color.white,
    fontSize: 20,
    fontWeight: '800',
  },
  vehicleVariant: {
    color: color.muted,
    fontSize: 13,
    marginTop: 2,
  },
  vehiclePrice: {
    color: color.yellow,
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
    backgroundColor: 'rgba(247, 181, 3, 0.1)',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.25)',
  },
  tagText: {
    color: color.yellow,
    fontSize: 10,
    fontWeight: '700',
  },
  specsCard: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
    marginTop: space.md,
  },
  sectionTitle: {
    color: color.white,
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
    color: color.muted,
    fontSize: 11,
  },
  specValue: {
    color: color.white,
    fontSize: 13,
    fontWeight: '600',
  },
  inspectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(247, 181, 3, 0.08)',
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.25)',
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
    color: color.yellow,
    fontSize: 14,
    fontWeight: '700',
  },
  inspectionSnippet: {
    color: '#D1D5DB',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  featuresCard: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  featureText: {
    color: color.white,
    fontSize: 11,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: color.navy,
    flexDirection: 'row',
    padding: space.md,
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  enquiryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    paddingVertical: space.md,
  },
  enquiryBtnText: {
    color: color.white,
    fontSize: 14,
    fontWeight: '700',
  },
  btnWithdrawn: {
    borderColor: color.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  btnWithdrawnText: {
    color: color.muted,
  },
  driveBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    backgroundColor: color.yellow,
    borderRadius: radius.md,
    paddingVertical: space.md,
  },
  driveBtnText: {
    color: color.navy,
    fontSize: 14,
    fontWeight: '700',
  },
  driveBtnWithdrawn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: color.border,
  },
  driveBtnWithdrawnText: {
    color: color.muted,
  },
});
