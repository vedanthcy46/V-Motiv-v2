import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
  Recycle,
  Tag,
  Clock,
  KeyRound,
  Menu,
} from 'lucide-react-native';
import { useSidebar } from '../components/AppSidebar';
import { BrandLogo } from '../components/BrandLogo';
import { PriceBlock } from '../components/PriceBlock';
import { NotificationsModal } from '../components/NotificationsModal';
import { MoreServiceTile, ServiceHeroCard } from '../components/HomeServiceCards';
import { comingSoonMessage, isFeatureOpen } from '../constants/features';
import { CustomerButton } from '../components/customer-ui';
import { customer } from '../services/customer';
import { describeAge } from '../services/inventory-offline';
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
import { useAppTheme } from '../theme';
import { useTabScreenBottomPadding } from '../layout/safe-layout';
import { formatPrice } from '../format';
import type { Tabs } from '../navigation/types';
import type { VehicleSummary } from '../types';

export function HomeScreen({ navigation }: BottomTabScreenProps<Tabs, 'Home'>) {
  const tabBottomPadding = useTabScreenBottomPadding();
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

  // Rentals are coming soon (constants/features.ts): the tile is blocked and only explains that. Flip the status there to open it.
  const openRental = () => {
    if (!isFeatureOpen('rental')) {
      const message = comingSoonMessage('rental');
      Alert.alert(message.title, message.body, [{ text: 'Got it' }]);
      return;
    }
    if (state !== 'signed-in') {
      navigation.navigate('Account');
      return;
    }
    root?.navigate('RentalHome');
  };

  const greeting = profile?.displayName
    ? `Hi, ${profile.displayName.split(' ')[0]} 👋`
    : 'Welcome to V MOTIV';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]} edges={['top', 'left', 'right']}>
      <ScrollView
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

        {/* ── Greeting ── */}
        <View style={styles.greetSection}>
          <Text style={[styles.greetText, { color: c.textSecondary }]}>{greeting}</Text>
          <Text accessibilityRole="header" style={[styles.greetTitle, { color: c.textPrimary }]}>
            What would you like to do?
          </Text>
        </View>

        {/* ── Main service ── */}
        <ServiceHeroCard onPress={() => (state === 'signed-in' ? root?.navigate('ServiceHome') : navigation.navigate('Account'))} />

        {/* ── Buy and sell ── */}
        <View style={styles.primaryRow}>
          {/* Buy */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Buy a Car. Explore available cars, see prices and request a test drive."
            onPress={() => navigation.navigate('Explore')}
            style={({ pressed }) => [
              styles.primaryCard,
              { backgroundColor: isDark ? c.surface : c.brandNavy, borderWidth: 1, borderColor: c.border },
              pressed && { opacity: 0.85 },
            ]}
          >
            <CarFront size={36} color={c.brandAccent} accessibilityElementsHidden />
            <Text style={[styles.primaryCardTitle, { color: '#FFFFFF' }]}>Buy a Car</Text>
            <Text style={[styles.primaryCardBody, { color: '#BAC7D9' }]}>
              Explore cars, see prices and request a test drive.
            </Text>
            <View style={styles.primaryCardArrow}>
              <ArrowRight size={20} color={c.brandAccent} accessibilityElementsHidden />
            </View>
          </Pressable>

          {/* Sell */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sell a Car. Tell us about your car and save progress as you go."
            onPress={() => (state === 'signed-in' ? root?.navigate('Sell') : navigation.navigate('Account'))}
            style={({ pressed }) => [
              styles.primaryCard,
              { backgroundColor: c.brandAccent },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Tag size={36} color={c.brandNavy} accessibilityElementsHidden />
            <Text style={[styles.primaryCardTitle, { color: c.brandNavy }]}>Sell a Car</Text>
            <Text style={[styles.primaryCardBody, { color: '#1A2E4C' }]}>
              Tell us about your car. Save progress as you go.
            </Text>
            <View style={styles.primaryCardArrow}>
              <ArrowRight size={20} color={c.brandNavy} accessibilityElementsHidden />
            </View>
          </Pressable>
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
            <CustomerButton title="Resume" onPress={() => (state === 'signed-in' ? root?.navigate('Sell') : navigation.navigate('Account'))} />
          </View>
        )}

        {/* ── More services ── */}
        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: c.textPrimary }]}>
            More services
          </Text>
        </View>
        <View style={styles.secondaryRow}>
          <MoreServiceTile
            featureKey="rental"
            status={isFeatureOpen('rental') ? 'open' : 'coming-soon'}
            title="Rent a Car"
            body="Self-drive rentals"
            Icon={KeyRound}
            onPress={openRental}
          />
          <MoreServiceTile
            featureKey="scrap"
            status={isFeatureOpen('scrap') ? 'open' : 'coming-soon'}
            title="Scrap a Car"
            body="Responsible disposal"
            Icon={Recycle}
            onPress={() => root?.navigate('ScrapRequest')}
          />
        </View>

        {/* ── My requests shortcut ── */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text accessibilityRole="header" style={[styles.cardTitle, { color: c.textPrimary }]}>
            My Requests
          </Text>
          <Text style={[styles.cardBody, { color: c.textSecondary }]}>
            Follow your selling request, enquiries, offers and test drives in Activity.
          </Text>
          <CustomerButton
            secondary
            title={state === 'signed-in' ? 'Open Activity' : 'Sign in to view requests'}
            onPress={() =>
              navigation.navigate(state === 'signed-in' ? 'Activity' : 'Account')
            }
          />
        </View>

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

        {/* ── How selling works ── */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text accessibilityRole="header" style={[styles.cardTitle, { color: c.textPrimary }]}>
            Selling, one step at a time
          </Text>
          <View style={styles.howStep}>
            <View style={[styles.howNum, { backgroundColor: c.brandAccent }]}>
              <Text style={[styles.howNumText, { color: c.brandNavy }]}>1</Text>
            </View>
            <Text style={[styles.howBody, { color: c.textSecondary }]}>Tell us about your car — takes about 5 minutes.</Text>
          </View>
          <View style={styles.howStep}>
            <View style={[styles.howNum, { backgroundColor: c.brandAccent }]}>
              <Text style={[styles.howNumText, { color: c.brandNavy }]}>2</Text>
            </View>
            <Text style={[styles.howBody, { color: c.textSecondary }]}>Our team reviews your request and schedules an inspection.</Text>
          </View>
          <View style={styles.howStep}>
            <View style={[styles.howNum, { backgroundColor: c.brandAccent }]}>
              <Text style={[styles.howNumText, { color: c.brandNavy }]}>3</Text>
            </View>
            <Text style={[styles.howBody, { color: c.textSecondary }]}>Track inspection and offer updates live in Activity.</Text>
          </View>
          <CustomerButton title="Sell your car" onPress={() => (state === 'signed-in' ? root?.navigate('Sell') : navigation.navigate('Account'))} />
        </View>

        {/* ── Support ── */}
        <CustomerButton
          secondary
          title="Get help with your request"
          onPress={() =>
            state === 'signed-in' ? root?.navigate('Support') : navigation.navigate('Account')
          }
        />
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
  greetSection: {
    gap: 6,
  },
  greetText: {
    fontSize: 15,
    fontWeight: '600',
  },
  greetTitle: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '800',
  },
  primaryRow: {
    flexDirection: 'row',
    gap: 14,
  },
  primaryCard: {
    flex: 1,
    borderRadius: 20,
    padding: 20,
    minHeight: 180,
    gap: 8,
    position: 'relative',
  },
  primaryCardTitle: {
    fontSize: 19,
    fontWeight: '800',
    marginTop: 4,
  },
  primaryCardBody: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  primaryCardArrow: {
    alignSelf: 'flex-end',
    marginTop: 4,
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
  sectionMeta: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionLink: {
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 6,
    minHeight: 120,
    position: 'relative',
  },
  secondaryCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  secondaryCardBody: {
    fontSize: 11,
    lineHeight: 15,
  },
  comingSoonBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  comingSoonText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  featuredSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  livePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  featuredServicesContainer: {
    gap: 14,
  },
  featuredCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  featuredCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  featuredIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  featuredCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  tagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  featuredCardSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  featurePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  featurePillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  featuredFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  featuredCtaText: {
    fontSize: 13,
    fontWeight: '700',
  },
  featuredArrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '700',
  },
  cardBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  howStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  howNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  howNumText: {
    fontSize: 13,
    fontWeight: '800',
  },
  howBody: {
    fontSize: 15,
    lineHeight: 22,
    flex: 1,
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
  vehiclePrice: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    paddingVertical: 8,
  },
});
