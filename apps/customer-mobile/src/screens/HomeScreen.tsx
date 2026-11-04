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
  CalendarDays,
  Wrench,
  Recycle,
  Tag,
  Clock,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  KeyRound,
  Menu,
} from 'lucide-react-native';
import { useSidebar } from '../components/AppSidebar';
import { BrandLogo } from '../components/BrandLogo';
import { NotificationsModal } from '../components/NotificationsModal';
import { CustomerButton } from '../components/customer-ui';
import { customer } from '../services/customer';
import { readSellDraft, sellDraftKey } from '../services/sell-draft';
import {
  fetchUserNotifications,
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

const SECONDARY_SERVICES = [
  { title: 'Car Service', body: 'Maintenance & repairs', Icon: Wrench },
  { title: 'Rent a Car', body: 'Short or long term', Icon: CalendarDays },
  { title: 'Scrap a Car', body: 'Responsible disposal', Icon: Recycle },
];

export function HomeScreen({ navigation }: BottomTabScreenProps<Tabs, 'Home'>) {
  const tabBottomPadding = useTabScreenBottomPadding();
  const { state, profile } = useAuth();
  const { openSidebar } = useSidebar();
  const { theme, isDark } = useAppTheme();
  const c = theme.colors;

  const [cars, setCars] = useState<VehicleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
          if (active) setCars(result.items);
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
      setCars((await customer.inventory({ limit: 4, sort: 'newest' })).items);
    } catch {
      setError('Could not load cars. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const comingSoon = (title: string) =>
    Alert.alert(
      `${title} — Coming Soon`,
      'This service is being planned. Bookings are not yet available.\n\nYou can still buy or sell a car with V MOTIV today.',
      [{ text: 'Got it' }],
    );

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

        {/* ── Primary action cards ── */}
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

        {/* ── Secondary services ── */}
        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: c.textPrimary }]}>
            More services
          </Text>
          <Text style={[styles.sectionMeta, { color: c.textMuted }]}>Coming soon</Text>
        </View>
        <View style={styles.secondaryRow}>
          {SECONDARY_SERVICES.map(({ title, body, Icon }) => {
            const isCarService = title === 'Car Service';
            const isRental = title === 'Rent a Car';
            const isLive = isCarService || isRental;
            return (
              <Pressable
                key={title}
                accessibilityRole="button"
                accessibilityLabel={
                  isCarService
                    ? 'Car Service. Book maintenance & repairs.'
                    : isRental
                    ? 'Rent a Car. Self-drive advance rental.'
                    : `${title}. Coming soon.`
                }
                onPress={() => {
                  if (state !== 'signed-in') {
                    navigation.navigate('Account');
                    return;
                  }
                  if (isCarService) {
                    root?.navigate('ServiceHome');
                  } else if (isRental) {
                    root?.navigate('RentalHome');
                  } else {
                    comingSoon(title);
                  }
                }}
                style={({ pressed }) => [
                  styles.secondaryCard,
                  {
                    backgroundColor: isLive ? (isDark ? '#142742' : '#FFFDF5') : c.surface,
                    borderColor: isLive ? c.brandAccent : c.border,
                  },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Icon size={26} color={isLive ? c.brandAccent : c.textSecondary} accessibilityElementsHidden />
                <Text style={[styles.secondaryCardTitle, { color: c.textPrimary }]}>{title}</Text>
                <Text style={[styles.secondaryCardBody, { color: c.textSecondary }]}>{body}</Text>
                <View style={[styles.comingSoonBadge, { backgroundColor: isLive ? c.brandAccent : c.surfaceSecondary }]}>
                  <Text style={[styles.comingSoonText, { color: isLive ? c.brandNavy : c.textMuted }]}>
                    {isCarService ? 'BOOK' : isRental ? 'RENT' : 'SOON'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* ── Featured Live Services (Bigger Cards for Service & Rental) ── */}
        <View style={styles.featuredSectionHeader}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: c.textPrimary }]}>
            Vehicle Services & Rentals
          </Text>
          <View style={[styles.livePill, { backgroundColor: c.brandAccent + '25' }]}>
            <Sparkles size={12} color={c.brandAccent} />
            <Text style={[styles.livePillText, { color: isDark ? c.brandAccent : c.brandNavy }]}>LIVE</Text>
          </View>
        </View>

        <View style={styles.featuredServicesContainer}>
          {/* Bigger Card 1: Car Service */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Car Service and Repairs. Scheduled maintenance, diagnosis, doorstep pickup and live tracking. Book now."
            onPress={() => (state === 'signed-in' ? root?.navigate('ServiceHome') : navigation.navigate('Account'))}
            style={({ pressed }) => [
              styles.featuredCard,
              {
                backgroundColor: isDark ? '#0F213D' : '#FFFFFF',
                borderColor: isDark ? c.border : c.border,
              },
              pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
            ]}
          >
            <View style={styles.featuredCardHeader}>
              <View style={[styles.featuredIconBox, { backgroundColor: c.brandAccent + '22' }]}>
                <Wrench size={26} color={c.brandAccent} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={styles.featuredTitleRow}>
                  <Text style={[styles.featuredCardTitle, { color: c.textPrimary }]}>
                    Car Service & Repairs
                  </Text>
                  <View style={[styles.tagBadge, { backgroundColor: '#10B98120' }]}>
                    <Text style={[styles.tagBadgeText, { color: '#10B981' }]}>DOORSTEP</Text>
                  </View>
                </View>
                <Text style={[styles.featuredCardSubtitle, { color: c.textSecondary }]}>
                  Scheduled service, AC repair, battery & diagnostics with transparent estimates
                </Text>
              </View>
            </View>

            {/* Feature Highlights Pills */}
            <View style={styles.featurePillsRow}>
              <View style={[styles.featurePill, { backgroundColor: c.surfaceSecondary }]}>
                <CheckCircle2 size={12} color="#10B981" />
                <Text style={[styles.featurePillText, { color: c.textSecondary }]}>Free Pickup & Drop</Text>
              </View>
              <View style={[styles.featurePill, { backgroundColor: c.surfaceSecondary }]}>
                <ShieldCheck size={12} color={c.brandAccent} />
                <Text style={[styles.featurePillText, { color: c.textSecondary }]}>Multi-Point QC</Text>
              </View>
              <View style={[styles.featurePill, { backgroundColor: c.surfaceSecondary }]}>
                <Clock size={12} color={c.textMuted} />
                <Text style={[styles.featurePillText, { color: c.textSecondary }]}>Live Tracking</Text>
              </View>
            </View>

            {/* Bottom Action Footer */}
            <View style={[styles.featuredFooter, { borderTopColor: isDark ? '#1C3154' : c.border }]}>
              <Text style={[styles.featuredCtaText, { color: isDark ? c.brandAccent : c.brandNavy }]}>
                Book Service Appointment
              </Text>
              <View
                style={[
                  styles.featuredArrowCircle,
                  { backgroundColor: isDark ? c.brandAccent : c.brandNavy },
                ]}
              >
                <ArrowRight size={16} color={isDark ? c.brandNavy : '#FFFFFF'} />
              </View>
            </View>
          </Pressable>

          {/* Bigger Card 2: Self-Drive Car Rental */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Self-Drive Car Rental. Browse vehicles and date-specific estimates."
            onPress={() => (state === 'signed-in' ? root?.navigate('RentalHome') : navigation.navigate('Account'))}
            style={({ pressed }) => [
              styles.featuredCard,
              {
                backgroundColor: isDark ? '#091A33' : '#FFFFFF',
                borderColor: isDark ? c.border : c.border,
                borderWidth: 1,
              },
              pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
            ]}
          >
            <View style={styles.featuredCardHeader}>
              <View style={[styles.featuredIconBox, { backgroundColor: c.brandAccent + '22' }]}>
                <KeyRound size={26} color={c.brandAccent} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={styles.featuredTitleRow}>
                  <Text style={[styles.featuredCardTitle, { color: c.textPrimary }]}>
                    Self-Drive Car Rental
                  </Text>
                  <View style={[styles.tagBadge, { backgroundColor: c.brandAccent + '25' }]}>
                    <Text style={[styles.tagBadgeText, { color: isDark ? c.brandAccent : c.brandNavy }]}>
                      DATE-SPECIFIC
                    </Text>
                  </View>
                </View>
                <Text style={[styles.featuredCardSubtitle, { color: c.textSecondary }]}>
                  Browse eligible fleet vehicles, active hubs and date-specific estimates
                </Text>
              </View>
            </View>

            {/* Feature Highlights Pills */}
            <View style={styles.featurePillsRow}>
              <View style={[styles.featurePill, { backgroundColor: c.surfaceSecondary }]}>
                <CheckCircle2 size={12} color={c.brandAccent} />
                <Text style={[styles.featurePillText, { color: c.textSecondary }]}>Eligible fleet only</Text>
              </View>
              <View style={[styles.featurePill, { backgroundColor: c.surfaceSecondary }]}>
                <ShieldCheck size={12} color={c.success} />
                <Text style={[styles.featurePillText, { color: c.textSecondary }]}>Date availability</Text>
              </View>
              <View style={[styles.featurePill, { backgroundColor: c.surfaceSecondary }]}>
                <Clock size={12} color={c.brandAccent} />
                <Text style={[styles.featurePillText, { color: c.textSecondary }]}>Upfront estimate</Text>
              </View>
            </View>

            {/* Bottom Action Footer */}
            <View style={[styles.featuredFooter, { borderTopColor: isDark ? '#1C3154' : c.border }]}>
              <Text style={[styles.featuredCtaText, { color: isDark ? c.brandAccent : c.brandNavy }]}>
                Explore Rental Fleet
              </Text>
              <View
                style={[
                  styles.featuredArrowCircle,
                  { backgroundColor: isDark ? c.brandAccent : c.brandNavy },
                ]}
              >
                <ArrowRight size={16} color={isDark ? c.brandNavy : '#FFFFFF'} />
              </View>
            </View>
          </Pressable>
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
              <Text style={[styles.vehiclePrice, { color: c.textPrimary }]}>{formatPrice(car.pricePaise)}</Text>
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
