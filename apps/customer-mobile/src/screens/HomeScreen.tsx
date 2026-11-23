import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  ArrowRight,
  Bell,
  CarFront,
  Clock,
  KeyRound,
  Menu,
  Recycle,
  Tag,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';
import { useSidebar } from '../components/AppSidebar';
import { BrandLogo } from '../components/BrandLogo';
import { HomeBanners } from '../components/HomeBanners';
import { HubMedia } from '../components/HubMedia';
import { useTabBarScroll } from '../components/TabBarVisibility';
import { PriceBlock } from '../components/PriceBlock';
import { openAppLink } from '../services/notifications';
import { NotificationsModal } from '../components/NotificationsModal';
import { comingSoonMessage, isFeatureOpen } from '../constants/features';
import { CustomerButton } from '../components/customer-ui';
import { customer } from '../services/customer';
import { describeAge } from '../services/inventory-offline';
import { destinationForItem, destinationForScreen, type Destination, type HomeItem, type ScreenName } from '../services/home-content';
import { readSellDraft, sellDraftKey } from '../services/sell-draft';
import {
  fetchUserNotifications,
  clearAllNotifications,
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
  type InAppNotification,
} from '../services/notifications';
import { useAuth } from '../auth/AuthProvider';
import { useHomeContent } from '../hooks/useHomeContent';
import { useRatingPrompt } from '../hooks/useRatingPrompt';
import { useAppTheme } from '../theme';
import { useTabScreenBottomPadding } from '../layout/safe-layout';
import { formatPrice } from '../format';
import type { Tabs } from '../navigation/types';
import type { VehicleSummary } from '../types';

/**
 * Service is the main thing people come for, so it gets a full-width card of its own. The other four are equal tiles in one row below it, each
 * with a one-word label (the full name is read out by screen readers) so a label can never be cut off on a small phone.
 */
const SERVICE_ACTION: { screen: ScreenName; title: string; hint: string; Icon: LucideIcon } = { screen: 'SERVICE', title: 'Car Service', hint: 'Book repairs and maintenance', Icon: Wrench };
const OTHER_ACTIONS: Array<{ screen: ScreenName; label: string; full: string; Icon: LucideIcon; feature?: 'rental' }> = [
  { screen: 'BUY', label: 'Buy', full: 'Buy a car', Icon: CarFront },
  { screen: 'SELL', label: 'Sell', full: 'Sell a car', Icon: Tag },
  { screen: 'RENTAL', label: 'Rent', full: 'Rent a car', Icon: KeyRound, feature: 'rental' },
  { screen: 'SCRAP', label: 'Scrap', full: 'Scrap a car', Icon: Recycle },
];

export function HomeScreen({ navigation }: BottomTabScreenProps<Tabs, 'Home'>) {
  const tabBottomPadding = useTabScreenBottomPadding();
  const tabBarScroll = useTabBarScroll(); // hides the bottom tab bar while scrolling down, shows it on the way up
  const { state, profile } = useAuth();
  const { openSidebar } = useSidebar();
  const { theme, isDark } = useAppTheme();
  const c = theme.colors;

  const [cars, setCars] = useState<VehicleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  const [draft, setDraft] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const root = navigation.getParent();
  // Banners and hub media managed by Operations. Empty until something is published, in which case those sections are simply not shown.
  const home = useHomeContent(profile?.preferredCity?.trim() ?? '');
  // Now and then, politely, asks signed-in people to rate the app (rules in services/rating-prompt.ts).
  useRatingPrompt(state === 'signed-in');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setError('');
      setNotifications([]);
      setUnread(0);
      setDraft(false);

      customer
        .inventory({ limit: 4, sort: 'newest' })
        .then((result) => {
          if (!active) return;
          setCars(result.items);
          setOfflineSince(result.fromCache ? result.syncedAt ?? 0 : null);
        })
        .catch(() => {
          if (active) setError('Could not load cars. Pull down to refresh.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      readSellDraft(sellDraftKey(profile?.id))
        .then((value) => {
          if (active) setDraft(Boolean(value));
        })
        .catch(() => {});

      if (state === 'signed-in') {
        fetchUserNotifications(30).then((result) => {
          if (active) {
            setNotifications(result.items);
            setUnread(result.unreadCount);
          }
        });
      }

      return () => {
        active = false;
      };
    }, [profile?.id, state]),
  );

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await customer.inventory({ limit: 4, sort: 'newest' });
      setCars(result.items);
      setOfflineSince(result.fromCache ? result.syncedAt ?? 0 : null);
    } catch {
      setError('Could not load cars. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const ctx = { signedIn: state === 'signed-in', rentalOpen: isFeatureOpen('rental') };

  /** Carries out a tap from the quick actions or a banner. Where each one leads is decided in services/home-content.ts. */
  const go = (destination: Destination) => {
    const navigator = root as unknown as { navigate: (name: string, params?: unknown) => void } | undefined;
    switch (destination.type) {
      case 'signin':
        navigation.navigate('Account');
        return;
      case 'tab':
        navigation.navigate(destination.name);
        return;
      case 'root':
        navigator?.navigate(destination.name);
        return;
      case 'vehicle':
        navigator?.navigate('Vehicle', { listingId: destination.listingId });
        return;
      case 'url':
        void Linking.openURL(destination.url).catch(() => Alert.alert('Could not open the link', 'Please try again later.'));
        return;
      case 'comingSoon': {
        const message = comingSoonMessage(destination.feature);
        Alert.alert(message.title, message.body, [{ text: 'Got it' }]);
        return;
      }
      case 'none':
        return;
    }
  };

  const greeting = profile?.displayName
    ? `Hi, ${profile.displayName.split(' ')[0]} 👋`
    : 'Welcome to V MOTIV';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]} edges={['top', 'left', 'right']}>
      <ScrollView
        {...tabBarScroll}
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBottomPadding }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={c.brandAccent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Top bar ── */}
        <View style={[styles.topBar, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open navigation menu"
              onPress={openSidebar}
              style={({ pressed }) => [{ padding: 4, marginLeft: -4, borderRadius: 8 }, pressed && { opacity: 0.6 }]}
            >
              <Menu size={22} color={isDark ? '#F7B503' : c.textPrimary} />
            </Pressable>
            <BrandLogo size={28} bodyColor={isDark ? '#FFFFFF' : c.brandNavy} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
            onPress={() =>
              state === 'signed-in' ? setNotificationsOpen(true) : navigation.navigate('Account')
            }
            style={({ pressed }) => [styles.bellBtn, pressed && { opacity: 0.6 }]}
          >
            <Bell size={24} color={isDark ? '#FFFFFF' : c.textPrimary} />
            {unread > 0 && (
              <View style={[styles.badge, { backgroundColor: c.brandAccent }]}>
                <Text style={[styles.badgeText, { color: c.brandNavy }]}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <Text accessibilityRole="header" style={[styles.greetText, { color: c.textPrimary }]}>{greeting}</Text>

        {/* ── Promotional banners (managed by Operations) ── */}
        <HomeBanners items={home.banners} onOpen={(item) => go(destinationForItem(item, ctx))} />

        {/* ── What would you like to do: Service is the main card, then one row of four ── */}
        <View style={{ gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${SERVICE_ACTION.title}. ${SERVICE_ACTION.hint}`}
            onPress={() => go(destinationForScreen(SERVICE_ACTION.screen, ctx))}
            style={({ pressed }) => [styles.serviceCard, { backgroundColor: c.brandAccent }, pressed && { opacity: 0.92 }]}
          >
            <View style={[styles.serviceIcon, { backgroundColor: c.brandNavy }]}>
              <SERVICE_ACTION.Icon size={28} color={c.brandAccent} accessibilityElementsHidden />
            </View>
            <View style={styles.serviceText}>
              <Text style={[styles.serviceTitle, { color: c.brandNavy }]}>{SERVICE_ACTION.title}</Text>
              <Text numberOfLines={2} style={[styles.serviceHint, { color: c.brandNavy }]}>{SERVICE_ACTION.hint}</Text>
            </View>
            <View style={[styles.serviceArrow, { backgroundColor: c.brandNavy }]}>
              <ArrowRight size={18} color={c.brandAccent} accessibilityElementsHidden />
            </View>
          </Pressable>

          <View style={styles.tileRow}>
            {OTHER_ACTIONS.map(({ screen, label, full, Icon, feature }) => {
              const soon = feature ? !isFeatureOpen(feature) : false;
              return (
                <Pressable
                  key={screen}
                  accessibilityRole="button"
                  accessibilityLabel={`${full}${soon ? ', coming soon' : ''}`}
                  onPress={() => go(destinationForScreen(screen, ctx))}
                  style={({ pressed }) => [styles.tile, { backgroundColor: c.surface, borderColor: c.border }, pressed && { opacity: 0.8 }]}
                >
                  <View style={[styles.tileIcon, { backgroundColor: isDark ? 'rgba(247,181,3,0.16)' : '#FFF5D6', opacity: soon ? 0.6 : 1 }]}>
                    <Icon size={24} color={isDark ? c.brandAccent : c.brandNavy} accessibilityElementsHidden />
                  </View>
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.tileLabel, { color: c.textPrimary }]}>{label}</Text>
                  {soon ? <View style={[styles.soon, { backgroundColor: c.brandAccent }]}><Text style={[styles.soonText, { color: c.brandNavy }]}>SOON</Text></View> : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Draft resume ── */}
        {draft && (
          <View style={[styles.draftCard, { backgroundColor: c.surface, borderColor: c.brandAccent }]}>
            <View style={styles.draftLeft}>
              <Clock size={20} color={c.brandAccent} accessibilityElementsHidden />
              <View style={{ flex: 1 }}>
                <Text style={[styles.draftTitle, { color: c.textPrimary }]}>Your sell form is saved</Text>
                <Text style={[styles.draftBody, { color: c.textSecondary }]}>Continue from where you left off.</Text>
              </View>
            </View>
            <CustomerButton title="Resume" onPress={() => go(destinationForScreen('SELL', ctx))} />
          </View>
        )}

        {/* ── Hub photos and videos (managed by Operations) ── */}
        <HubMedia videos={home.hubVideos} photos={home.hubPhotos} />

        {/* ── Recently listed ── */}
        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: c.textPrimary }]}>
            Recently listed
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Explore all cars"
            onPress={() => navigation.navigate('Explore')}
          >
            <Text style={[styles.sectionLink, { color: c.textPrimary }]}>See all</Text>
          </Pressable>
        </View>

        {loading && <ActivityIndicator accessibilityLabel="Loading cars" color={c.brandAccent} style={{ marginVertical: 12 }} />}

        {offlineSince !== null ? (
          <Text accessibilityRole="alert" style={[styles.emptyText, { color: c.textMuted }]}>
            You're offline - showing saved cars (updated {describeAge(offlineSince)}).
          </Text>
        ) : null}

        {error ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text accessibilityRole="alert" style={[styles.cardBody, { color: c.error }]}>
              {error}
            </Text>
            <CustomerButton secondary title="Try again" onPress={() => void refresh()} />
          </View>
        ) : null}

        {!loading && !error && cars.length === 0 && (
          <Text style={[styles.emptyText, { color: c.textMuted }]}>No cars published right now. Check back soon.</Text>
        )}

        {cars.map((car) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${car.title}, priced at ${formatPrice(car.pricePaise)}`}
            key={car.id}
            onPress={() => root?.navigate('Vehicle', { listingId: car.id })}
            style={({ pressed }) => [
              styles.vehicleCard,
              { backgroundColor: c.surface, borderColor: c.border },
              pressed && { opacity: 0.82 },
            ]}
          >
            {car.media[0]?.url ? (
              <Image
                source={{ uri: car.media[0].url }}
                accessibilityLabel={car.title}
                style={styles.vehicleImage}
              />
            ) : (
              <View style={[styles.vehicleImagePlaceholder, { backgroundColor: c.surfaceSecondary }]}>
                <CarFront size={40} color={c.textMuted} accessibilityElementsHidden />
                <Text style={[styles.vehicleImagePlaceholderText, { color: c.textMuted }]}>No photo</Text>
              </View>
            )}
            <View style={styles.vehicleInfo}>
              <Text style={[styles.vehicleTitle, { color: c.textPrimary }]}>
                {car.vehicle.make} {car.vehicle.model}
              </Text>
              <Text style={[styles.vehicleMeta, { color: c.textSecondary }]}>
                {car.vehicle.manufacturingYear}
                {car.vehicle.variant ? ` · ${car.vehicle.variant}` : ''}
              </Text>
              <Text style={[styles.vehicleSpec, { color: c.textMuted }]}>
                {car.vehicle.odometerKm.toLocaleString('en-IN')} km · {car.vehicle.fuelType} ·{' '}
                {car.vehicle.transmission}
              </Text>
              <PriceBlock align="left" pricePaise={car.pricePaise} originalPricePaise={car.originalPricePaise} discountPercent={car.discountPercent} />
            </View>
          </Pressable>
        ))}

        {!loading && cars.length > 0 && (
          <CustomerButton
            secondary
            title="Explore all cars"
            onPress={() => navigation.navigate('Explore')}
          />
        )}
      </ScrollView>

      <NotificationsModal
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        unreadCount={unread}
        onMarkAsRead={async (id) => {
          if (await markNotificationRead(id)) {
            setNotifications((items) => items.map((n) => (n.id === id ? { ...n, read: true } : n)));
            setUnread((n) => Math.max(0, n - 1));
          }
        }}
        onMarkAllAsRead={async () => {
          if (await markAllNotificationsRead()) {
            setNotifications((items) => items.map((n) => ({ ...n, read: true })));
            setUnread(0);
          }
        }}
        onDismiss={async (id) => {
          if (await dismissNotification(id)) {
            const wasUnread = notifications.some((n) => n.id === id && !n.read);
            setNotifications((items) => items.filter((n) => n.id !== id));
            if (wasUnread) setUnread((n) => Math.max(0, n - 1));
          }
        }}
        onClearAll={async () => {
          if (await clearAllNotifications()) {
            setNotifications([]);
            setUnread(0);
          }
        }}
        onSelectNotification={async (n) => {
          setNotificationsOpen(false);
          const selling = /^vmotiv:\/\/selling\/([a-zA-Z0-9-]+)$/.exec(n.deepLink || '');
          const vehicle = /^vmotiv:\/\/vehicles\/([a-zA-Z0-9-]+)$/.exec(n.deepLink || '');
          if (selling) root?.navigate('SellingRequestDetails', { leadId: selling[1] });
          else if (vehicle) root?.navigate('Vehicle', { listingId: vehicle[1] });
          else if (openAppLink(n.deepLink)) return;
          else navigation.navigate('Activity');
        }}
        title="Notifications"
        subtitle="Your request updates"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    padding: 20,
    gap: 20,
    paddingBottom: 110,
  },
  topBar: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  bellBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  greetText: {
    fontSize: 20,
    fontWeight: '800',
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 92,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  serviceIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceText: {
    flex: 1,
    gap: 2,
  },
  serviceTitle: {
    fontSize: 19,
    fontWeight: '800',
  },
  serviceHint: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '600',
  },
  serviceArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tile: {
    flex: 1,
    minHeight: 96,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tileIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  soon: {
    position: 'absolute',
    top: 6,
    right: 6,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  soonText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  draftCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
  },
  draftLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
  },
  draftTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  draftBody: {
    fontSize: 14,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
  },
  sectionLink: {
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  cardBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  vehicleCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  vehicleImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  vehicleImagePlaceholder: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  vehicleImagePlaceholderText: {
    fontSize: 12,
  },
  vehicleInfo: {
    padding: 16,
    gap: 4,
  },
  vehicleTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  vehicleMeta: {
    fontSize: 14,
    fontWeight: '500',
  },
  vehicleSpec: {
    fontSize: 13,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    paddingVertical: 8,
  },
});
