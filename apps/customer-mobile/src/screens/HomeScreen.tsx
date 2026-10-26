import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  ArrowRight,
  Bell,
  Bookmark,
  Calendar,
  CarFront,
  CheckCircle2,
  ChevronRight,
  Clock,
  Gauge,
  Headphones,
  MapPin,
  ShieldCheck,
  Sparkles,
} from 'lucide-react-native';
import { BrandLogo } from '../components/BrandLogo';
import { NotificationsModal } from '../components/NotificationsModal';
import { customer } from '../services/customer';
import {
  fetchUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerForPushNotificationsAsync,
  type InAppNotification,
} from '../services/notifications';
import { useAuth } from '../auth/AuthProvider';
import { color, radius, space } from '../theme';
import { formatPrice } from '../format';
import type { Tabs } from '../navigation/types';
import type { VehicleSummary } from '../types';

type Props = BottomTabScreenProps<Tabs, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { state, profile, user } = useAuth();
  const [featured, setFeatured] = useState<VehicleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetchUserNotifications(30);
      setNotifications(res.items);
      setUnreadCount(res.unreadCount);
    } catch {
      // Keep existing notifications if network hiccup
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [res] = await Promise.all([
        customer.inventory({ limit: 6, sort: 'newest' }),
        loadNotifications(),
      ]);
      setFeatured(res.items);
    } catch {
      // Keep previous data if network hiccup
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadNotifications]);

  useEffect(() => {
    void loadData();
    if (state === 'signed-in') {
      void registerForPushNotificationsAsync('CUSTOMER');
    }
  }, [loadData, state]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData();
    void loadNotifications();
  }, [loadData, loadNotifications]);

  const handleCustomerNotificationNavigation = useCallback(
    async (n: InAppNotification) => {
      try {
        if (!n.read) {
          void markNotificationRead(n.id);
          setNotifications((prev) =>
            prev.map((item) => (item.id === n.id ? { ...item, read: true } : item))
          );
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      } catch (err) {
        console.warn('[NOTIF_MARK_READ_ERROR]', err);
      }

      setNotificationsOpen(false);

      const rootNav = (navigation.getParent() as any) || navigation;
      const event = (n.eventType || '').toUpperCase();
      const cat = (n.category || '').toUpperCase();
      const entityId = n.entityId || (n.deepLink ? n.deepLink.split('/').pop() : undefined);

      if (n.deepLink) {
        if (n.deepLink.includes('/selling/') && entityId) {
          rootNav.navigate('SellingRequestDetails', { leadId: entityId });
          return;
        }
        if (n.deepLink.includes('/vehicles/') && entityId) {
          rootNav.navigate('Vehicle', { listingId: entityId });
          return;
        }
        if (n.deepLink.includes('/support/') && entityId) {
          rootNav.navigate('SupportCaseDetails', { caseId: entityId });
          return;
        }
      }

      if (
        cat.includes('OFFER') ||
        event.includes('OFFER') ||
        cat.includes('VALUATION') ||
        cat.includes('INSPECTION') ||
        cat.includes('SELLING') ||
        event.includes('LEAD')
      ) {
        if (entityId) {
          rootNav.navigate('SellingRequestDetails', { leadId: entityId });
        } else {
          navigation.navigate('Activity');
        }
        return;
      }

      if (
        cat.includes('PURCHASE') ||
        cat.includes('VEHICLE') ||
        event.includes('PRICE') ||
        event.includes('DROP')
      ) {
        if (entityId) {
          rootNav.navigate('Vehicle', { listingId: entityId });
        } else {
          navigation.navigate('Explore');
        }
        return;
      }

      if (cat.includes('TEST_DRIVE') || event.includes('TEST_DRIVE')) {
        navigation.navigate('Activity');
        return;
      }

      if (cat.includes('SUPPORT') || event.includes('TICKET') || event.includes('CASE')) {
        if (entityId) {
          rootNav.navigate('SupportCaseDetails', { caseId: entityId });
        } else {
          rootNav.navigate('Support');
        }
        return;
      }

      navigation.navigate('Activity');
    },
    [navigation]
  );

  const cityName = profile?.preferredCity || user?.preferredCity || 'All Cities';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Navbar with Official Brand Logo, City Selector, and Notification Bell */}
      <View style={styles.topBar}>
        <BrandLogo
          variant="horizontal"
          size={24}
          showTagline={true}
          taglineText="YOUR NEXT CHAPTER"
        />

        <View style={styles.topBarActions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Change city. Currently selected: ${cityName}`}
            style={styles.cityPill}
            activeOpacity={0.75}
            onPress={() => (navigation.getParent() as any)?.navigate('CitySelection')}
          >
            <MapPin size={13} color={color.yellow} />
            <Text style={styles.cityText} numberOfLines={1}>
              {cityName}
            </Text>
            <ChevronRight size={13} color={color.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            style={styles.bellButton}
            activeOpacity={0.75}
            onPress={() => setNotificationsOpen(true)}
          >
            <Bell size={19} color={color.text} />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 20) + 84 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={color.yellow}
            colors={[color.yellow]}
          />
        }
      >
        {/* Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Sparkles size={12} color={color.navy} />
            <Text style={styles.heroBadgeText}>100% VERIFIED INVENTORY</Text>
          </View>
          <Text style={styles.heroTitle}>Buy or sell used cars with total certainty.</Text>
          <Text style={styles.heroSubtitle}>
            Every car undergoes our strict 180-point inspection. Fixed prices, transparent history, doorstep test drives, and direct buying offers.
          </Text>

          <View style={styles.heroActions}>
            <TouchableOpacity
              style={styles.heroPrimaryBtn}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Explore')}
            >
              <CarFront size={16} color={color.navy} />
              <Text style={styles.heroPrimaryBtnText}>Browse Cars</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.heroSecondaryBtn}
              activeOpacity={0.8}
              onPress={() => {
                if (state !== 'signed-in') {
                  navigation.navigate('Account');
                } else {
                  (navigation.getParent() as any)?.navigate('Sell');
                }
              }}
            >
              <Text style={styles.heroSecondaryBtnText}>Sell Your Car</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 3 Pillar Value Props */}
        <View style={styles.propRow}>
          <View style={styles.propCard}>
            <View style={styles.propIconWrap}>
              <ShieldCheck size={20} color={color.yellow} />
            </View>
            <Text style={styles.propTitle}>180-Pt Inspection</Text>
            <Text style={styles.propDesc}>Every system checked and scored</Text>
          </View>

          <View style={styles.propCard}>
            <View style={styles.propIconWrap}>
              <CheckCircle2 size={20} color={color.yellow} />
            </View>
            <Text style={styles.propTitle}>Direct Offers</Text>
            <Text style={styles.propDesc}>Fair algorithmic used car offers</Text>
          </View>

          <View style={styles.propCard}>
            <View style={styles.propIconWrap}>
              <Calendar size={20} color={color.yellow} />
            </View>
            <Text style={styles.propTitle}>Test Drive</Text>
            <Text style={styles.propDesc}>Doorstep or at V Motiv Hub</Text>
          </View>
        </View>

        {/* Featured Inventory Section */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Featured Arrivals</Text>
            <Text style={styles.sectionSubtitle}>Recent certified vehicles ready for test drive</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Explore')}
            style={styles.viewAllBtn}
          >
            <Text style={styles.viewAllText}>View All</Text>
            <ChevronRight size={14} color={color.yellow} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="small" color={color.yellow} />
            <Text style={styles.loaderText}>Loading verified cars…</Text>
          </View>
        ) : featured.length === 0 ? (
          <View style={styles.emptyFeatured}>
            <Text style={styles.emptyFeaturedTitle}>No vehicles published right now</Text>
            <Text style={styles.emptyFeaturedDesc}>Pull down to refresh or check back shortly.</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featuredCarousel}
          >
            {featured.map((item) => {
              const image = item.media[0]?.url;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.featuredCard}
                  activeOpacity={0.88}
                  onPress={() =>
                    (navigation.getParent() as any)?.navigate('Vehicle', { listingId: item.id })
                  }
                >
                  <View style={styles.featuredImgWrap}>
                    {image ? (
                      <Image source={{ uri: image }} style={styles.featuredImg} resizeMode="cover" />
                    ) : (
                      <View style={[styles.featuredImg, styles.imagePlaceholder]}>
                        <CarFront size={28} color={color.muted} />
                        <Text style={styles.imagePlaceholderText}>Photos pending</Text>
                      </View>
                    )}
                    <View style={styles.miniVerifiedBadge}>
                      <Text style={styles.miniVerifiedText}>VERIFIED</Text>
                    </View>
                  </View>

                  <View style={styles.featuredInfo}>
                    <Text style={styles.featuredTitle} numberOfLines={1}>
                      {item.vehicle.make} {item.vehicle.model}
                    </Text>
                    <Text style={styles.featuredVariant} numberOfLines={1}>
                      {item.vehicle.manufacturingYear} · {item.vehicle.variant || 'Standard'}
                    </Text>

                    <View style={styles.featuredSpecs}>
                      <View style={styles.specItem}>
                        <Gauge size={11} color={color.muted} />
                        <Text style={styles.featuredSpecText}>
                          {item.vehicle.odometerKm.toLocaleString('en-IN')} km
                        </Text>
                      </View>
                      <Text style={styles.specDivider}>•</Text>
                      <Text style={styles.featuredSpecText}>{item.vehicle.fuelType}</Text>
                    </View>

                    <Text style={styles.featuredPrice}>{formatPrice(item.pricePaise)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Sell Car Hero Banner */}
        <TouchableOpacity
          style={styles.sellBanner}
          activeOpacity={0.9}
          onPress={() => {
            if (state !== 'signed-in') {
              navigation.navigate('Account');
            } else {
              (navigation.getParent() as any)?.navigate('Sell');
            }
          }}
        >
          <View style={styles.sellBannerContent}>
            <View style={styles.sellBadge}>
              <Text style={styles.sellBadgeText}>SELL WITH V MOTIV</Text>
            </View>
            <Text style={styles.sellBannerTitle}>Selling your car in India?</Text>
            <Text style={styles.sellBannerSubtitle}>
              Get a genuine, transparent offer with free doorstep evaluation. Zero haggling, instant paperwork.
            </Text>
            <View style={styles.sellLinkRow}>
              <Text style={styles.sellLinkText}>Evaluate My Car Free</Text>
              <ArrowRight size={14} color={color.navy} />
            </View>
          </View>
        </TouchableOpacity>

        {/* Quick Help & Tracking Cards */}
        <View style={styles.quickGrid}>
          <TouchableOpacity
            style={styles.quickCard}
            activeOpacity={0.8}
            onPress={() => {
              if (state !== 'signed-in') {
                navigation.navigate('Account');
              } else {
                navigation.navigate('Activity');
              }
            }}
          >
            <View style={styles.quickIconWrap}>
              <Clock size={18} color={color.yellow} />
            </View>
            <Text style={styles.quickTitle}>Track Enquiries</Text>
            <Text style={styles.quickDesc}>Test drives, selling leads, and offers</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickCard}
            activeOpacity={0.8}
            onPress={() => {
              if (state !== 'signed-in') {
                navigation.navigate('Account');
              } else {
                (navigation.getParent() as any)?.navigate('Support');
              }
            }}
          >
            <View style={styles.quickIconWrap}>
              <Headphones size={18} color={color.yellow} />
            </View>
            <Text style={styles.quickTitle}>Customer Support</Text>
            <Text style={styles.quickDesc}>Live help, vehicle reports & questions</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Customer In-App Notifications Modal */}
      <NotificationsModal
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkAsRead={async (id) => {
          await markNotificationRead(id);
          setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, read: true } : n))
          );
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }}
        onMarkAllAsRead={async () => {
          await markAllNotificationsRead();
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
          setUnreadCount(0);
        }}
        onSelectNotification={handleCustomerNotificationNavigation}
        title="Notifications"
        subtitle="Offers, inspections & status updates"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.canvas,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    backgroundColor: color.navy,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.border,
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: color.navy,
  },
  bellBadgeText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '800',
  },
  cityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: color.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: color.border,
    maxWidth: 150,
  },
  cityText: {
    color: color.text,
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    padding: space.lg,
    gap: space.lg,
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
  },
  heroCard: {
    backgroundColor: color.navy,
    borderRadius: radius.lg,
    padding: space.xl,
    borderWidth: 1.2,
    borderColor: color.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: color.yellow,
    paddingHorizontal: space.sm,
    paddingVertical: 3.5,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    marginBottom: space.md,
  },
  heroBadgeText: {
    color: color.navy,
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  heroTitle: {
    color: color.white,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    color: color.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: space.xs,
    marginBottom: space.lg,
  },
  heroActions: {
    flexDirection: 'row',
    gap: space.md,
  },
  heroPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: color.yellow,
    paddingVertical: 13,
    borderRadius: radius.md,
  },
  heroPrimaryBtnText: {
    color: color.navy,
    fontSize: 14,
    fontWeight: '800',
  },
  heroSecondaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.raised,
    borderWidth: 1,
    borderColor: color.border,
    paddingVertical: 13,
    borderRadius: radius.md,
  },
  heroSecondaryBtnText: {
    color: color.text,
    fontSize: 14,
    fontWeight: '700',
  },
  propRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  propCard: {
    flex: 1,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
  },
  propIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.raised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  propTitle: {
    color: color.white,
    fontSize: 11.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  propDesc: {
    color: color.muted,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: space.xs,
  },
  sectionTitle: {
    color: color.white,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    color: color.muted,
    fontSize: 12,
    marginTop: 2,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
  },
  viewAllText: {
    color: color.yellow,
    fontSize: 13,
    fontWeight: '700',
  },
  loaderWrap: {
    paddingVertical: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  loaderText: {
    color: color.muted,
    fontSize: 13,
  },
  emptyFeatured: {
    backgroundColor: color.surface,
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
  },
  emptyFeaturedTitle: {
    color: color.text,
    fontSize: 15,
    fontWeight: '700',
  },
  emptyFeaturedDesc: {
    color: color.muted,
    fontSize: 13,
    marginTop: 4,
  },
  featuredCarousel: {
    gap: space.md,
    paddingRight: space.md,
  },
  featuredCard: {
    width: 228,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 2,
  },
  featuredImgWrap: {
    width: '100%',
    height: 135,
    backgroundColor: color.navy,
    position: 'relative',
  },
  featuredImg: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#092144',
    gap: 4,
  },
  imagePlaceholderText: {
    color: color.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  miniVerifiedBadge: {
    position: 'absolute',
    left: 8,
    top: 8,
    backgroundColor: 'rgba(2, 11, 24, 0.85)',
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.5)',
  },
  miniVerifiedText: {
    color: color.yellow,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  featuredInfo: {
    padding: space.md,
    gap: 2,
  },
  featuredTitle: {
    color: color.white,
    fontSize: 15,
    fontWeight: '800',
  },
  featuredVariant: {
    color: color.muted,
    fontSize: 12,
  },
  featuredSpecs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  specItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  specDivider: {
    color: color.muted,
    fontSize: 10,
  },
  featuredSpecText: {
    color: color.textSecondary,
    fontSize: 11.5,
  },
  featuredPrice: {
    color: color.yellow,
    fontSize: 16.5,
    fontWeight: '900',
    marginTop: 6,
  },
  sellBanner: {
    backgroundColor: '#122E58',
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1.2,
    borderColor: 'rgba(247, 181, 3, 0.35)',
  },
  sellBannerContent: {
    gap: 6,
  },
  sellBadge: {
    backgroundColor: 'rgba(247, 181, 3, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  sellBadgeText: {
    color: color.yellow,
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  sellBannerTitle: {
    color: color.white,
    fontSize: 17,
    fontWeight: '800',
  },
  sellBannerSubtitle: {
    color: color.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  sellLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: color.yellow,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  sellLinkText: {
    color: color.navy,
    fontSize: 12.5,
    fontWeight: '800',
  },
  quickGrid: {
    flexDirection: 'row',
    gap: space.md,
  },
  quickCard: {
    flex: 1,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
    gap: 4,
  },
  quickIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.raised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  quickTitle: {
    color: color.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  quickDesc: {
    color: color.muted,
    fontSize: 11,
    lineHeight: 15,
  },
});
