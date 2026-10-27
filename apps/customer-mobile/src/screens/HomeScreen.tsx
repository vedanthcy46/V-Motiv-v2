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
import { ArrowRight, Bell, CarFront, CalendarDays, Wrench, Recycle, Tag, Clock } from 'lucide-react-native';
import { BrandLogo } from '../components/BrandLogo';
import { NotificationsModal } from '../components/NotificationsModal';
import { CustomerButton, customerColors as c } from '../components/customer-ui';
import { customer } from '../services/customer';
import { readSellDraft, sellDraftKey } from '../services/sell-draft';
import {
  fetchUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type InAppNotification,
} from '../services/notifications';
import { useAuth } from '../auth/AuthProvider';
import { formatPrice } from '../format';
import type { Tabs } from '../navigation/types';
import type { VehicleSummary } from '../types';

const SECONDARY_SERVICES = [
  { title: 'Car Service', body: 'Maintenance & repairs', Icon: Wrench },
  { title: 'Rent a Car', body: 'Short or long term', Icon: CalendarDays },
  { title: 'Scrap a Car', body: 'Responsible disposal', Icon: Recycle },
];

export function HomeScreen({ navigation }: BottomTabScreenProps<Tabs, 'Home'>) {
  const { state, profile } = useAuth();
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
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Top bar ── */}
        <View style={s.topBar}>
          <BrandLogo size={28} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
            onPress={() =>
              state === 'signed-in' ? setNotificationsOpen(true) : navigation.navigate('Account')
            }
            style={({ pressed }) => [s.bellBtn, pressed && { opacity: 0.6 }]}
          >
            <Bell size={24} color="#FFFFFF" />
            {unread > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* ── Greeting ── */}
        <View style={s.greetSection}>
          <Text style={s.greetText}>{greeting}</Text>
          <Text accessibilityRole="header" style={s.greetTitle}>
            What would you like to do?
          </Text>
        </View>

        {/* ── Primary action cards ── */}
        <View style={s.primaryRow}>
          {/* Buy */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Buy a Car. Explore available cars, see prices and request a test drive."
            onPress={() => navigation.navigate('Explore')}
            style={({ pressed }) => [s.primaryCard, s.buyCard, pressed && { opacity: 0.85 }]}
          >
            <CarFront size={36} color={c.accent} accessibilityElementsHidden />
            <Text style={[s.primaryCardTitle, { color: '#FFFFFF' }]}>Buy a Car</Text>
            <Text style={[s.primaryCardBody, { color: '#B8C8E0' }]}>
              Explore cars, see prices and request a test drive.
            </Text>
            <View style={s.primaryCardArrow}>
              <ArrowRight size={20} color={c.accent} accessibilityElementsHidden />
            </View>
          </Pressable>

          {/* Sell */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sell a Car. Tell us about your car and save progress as you go."
            onPress={() => root?.navigate('Sell')}
            style={({ pressed }) => [s.primaryCard, s.sellCard, pressed && { opacity: 0.85 }]}
          >
            <Tag size={36} color={c.ink} accessibilityElementsHidden />
            <Text style={[s.primaryCardTitle, { color: c.ink }]}>Sell a Car</Text>
            <Text style={[s.primaryCardBody, { color: '#3A5070' }]}>
              Tell us about your car. Save progress as you go.
            </Text>
            <View style={s.primaryCardArrow}>
              <ArrowRight size={20} color={c.ink} accessibilityElementsHidden />
            </View>
          </Pressable>
        </View>

        {/* ── Draft resume ── */}
        {draft && (
          <View style={s.draftCard}>
            <View style={s.draftLeft}>
              <Clock size={20} color={c.accent} accessibilityElementsHidden />
              <View style={{ flex: 1 }}>
                <Text style={s.draftTitle}>Your sell form is saved</Text>
                <Text style={s.draftBody}>Continue from where you left off.</Text>
              </View>
            </View>
            <CustomerButton title="Resume" onPress={() => root?.navigate('Sell')} />
          </View>
        )}

        {/* ── Secondary services ── */}
        <View style={s.sectionHeader}>
          <Text accessibilityRole="header" style={s.sectionTitle}>
            More services
          </Text>
          <Text style={s.sectionMeta}>Coming soon</Text>
        </View>
        <View style={s.secondaryRow}>
          {SECONDARY_SERVICES.map(({ title, body, Icon }) => (
            <Pressable
              key={title}
              accessibilityRole="button"
              accessibilityLabel={`${title}. Coming soon.`}
              onPress={() => comingSoon(title)}
              style={({ pressed }) => [s.secondaryCard, pressed && { opacity: 0.75 }]}
            >
              <Icon size={26} color={c.secondary} accessibilityElementsHidden />
              <Text style={s.secondaryCardTitle}>{title}</Text>
              <Text style={s.secondaryCardBody}>{body}</Text>
              <View style={s.comingSoonBadge}>
                <Text style={s.comingSoonText}>SOON</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* ── My requests shortcut ── */}
        <View style={s.card}>
          <Text accessibilityRole="header" style={s.cardTitle}>
            My Requests
          </Text>
          <Text style={s.cardBody}>
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
        <View style={s.sectionHeader}>
          <Text accessibilityRole="header" style={s.sectionTitle}>
            Recently listed
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Explore all cars"
            onPress={() => navigation.navigate('Explore')}
          >
            <Text style={s.sectionLink}>See all</Text>
          </Pressable>
        </View>

        {loading && <ActivityIndicator accessibilityLabel="Loading cars" color={c.ink} style={{ marginVertical: 12 }} />}

        {error ? (
          <View style={s.card}>
            <Text accessibilityRole="alert" style={s.cardBody}>
              {error}
            </Text>
            <CustomerButton secondary title="Try again" onPress={() => void refresh()} />
          </View>
        ) : null}

        {!loading && !error && cars.length === 0 && (
          <Text style={s.emptyText}>No cars published right now. Check back soon.</Text>
        )}

        {cars.map((car) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${car.title}, priced at ${formatPrice(car.pricePaise)}`}
            key={car.id}
            onPress={() => root?.navigate('Vehicle', { listingId: car.id })}
            style={({ pressed }) => [s.vehicleCard, pressed && { opacity: 0.82 }]}
          >
            {car.media[0]?.url ? (
              <Image
                source={{ uri: car.media[0].url }}
                accessibilityLabel={car.title}
                style={s.vehicleImage}
              />
            ) : (
              <View style={s.vehicleImagePlaceholder}>
                <CarFront size={40} color={c.secondary} accessibilityElementsHidden />
                <Text style={s.vehicleImagePlaceholderText}>No photo</Text>
              </View>
            )}
            <View style={s.vehicleInfo}>
              <Text style={s.vehicleTitle}>
                {car.vehicle.make} {car.vehicle.model}
              </Text>
              <Text style={s.vehicleMeta}>
                {car.vehicle.manufacturingYear}
                {car.vehicle.variant ? ` · ${car.vehicle.variant}` : ''}
              </Text>
              <Text style={s.vehicleSpec}>
                {car.vehicle.odometerKm.toLocaleString('en-IN')} km · {car.vehicle.fuelType} ·{' '}
                {car.vehicle.transmission}
              </Text>
              <Text style={s.vehiclePrice}>{formatPrice(car.pricePaise)}</Text>
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
        <View style={s.card}>
          <Text accessibilityRole="header" style={s.cardTitle}>
            Selling, one step at a time
          </Text>
          <View style={s.howStep}>
            <View style={s.howNum}><Text style={s.howNumText}>1</Text></View>
            <Text style={s.howBody}>Tell us about your car — takes about 5 minutes.</Text>
          </View>
          <View style={s.howStep}>
            <View style={s.howNum}><Text style={s.howNumText}>2</Text></View>
            <Text style={s.howBody}>Our team reviews your request and schedules an inspection.</Text>
          </View>
          <View style={s.howStep}>
            <View style={s.howNum}><Text style={s.howNumText}>3</Text></View>
            <Text style={s.howBody}>Track inspection and offer updates live in Activity.</Text>
          </View>
          <CustomerButton title="Sell your car" onPress={() => root?.navigate('Sell')} />
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

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: c.background,
  },
  scroll: {
    padding: 20,
    gap: 20,
    paddingBottom: 40,
  },

  /* top bar */
  topBar: {
    backgroundColor: c.ink,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    backgroundColor: c.accent,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: c.ink,
    fontSize: 10,
    fontWeight: '800',
  },

  /* greeting */
  greetSection: {
    gap: 6,
  },
  greetText: {
    fontSize: 15,
    color: c.secondary,
    fontWeight: '500',
  },
  greetTitle: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '800',
    color: c.ink,
  },

  /* primary cards */
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
  buyCard: {
    backgroundColor: c.ink,
  },
  sellCard: {
    backgroundColor: c.accent,
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

  /* draft */
  draftCard: {
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.accent,
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
    color: c.ink,
  },
  draftBody: {
    fontSize: 14,
    color: c.secondary,
    marginTop: 2,
  },

  /* section header */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: c.ink,
  },
  sectionMeta: {
    fontSize: 13,
    color: c.secondary,
    fontWeight: '600',
  },
  sectionLink: {
    fontSize: 14,
    color: c.ink,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  /* secondary cards */
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryCard: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D8DFE8',
    padding: 14,
    gap: 6,
    minHeight: 120,
    position: 'relative',
  },
  secondaryCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: c.ink,
    marginTop: 4,
  },
  secondaryCardBody: {
    fontSize: 11,
    color: c.secondary,
    lineHeight: 15,
  },
  comingSoonBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#EBF0F7',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  comingSoonText: {
    fontSize: 9,
    fontWeight: '800',
    color: c.secondary,
    letterSpacing: 0.5,
  },

  /* shared card */
  card: {
    backgroundColor: c.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D8DFE8',
    padding: 20,
    gap: 12,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: c.ink,
  },
  cardBody: {
    fontSize: 15,
    lineHeight: 22,
    color: c.secondary,
  },

  /* how selling works */
  howStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  howNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  howNumText: {
    fontSize: 13,
    fontWeight: '800',
    color: c.ink,
  },
  howBody: {
    fontSize: 15,
    lineHeight: 22,
    color: c.secondary,
    flex: 1,
  },

  /* vehicle cards */
  vehicleCard: {
    backgroundColor: c.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D8DFE8',
    overflow: 'hidden',
  },
  vehicleImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  vehicleImagePlaceholder: {
    minHeight: 140,
    backgroundColor: '#EBF0F7',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  vehicleImagePlaceholderText: {
    fontSize: 12,
    color: c.secondary,
  },
  vehicleInfo: {
    padding: 16,
    gap: 4,
  },
  vehicleTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: c.ink,
  },
  vehicleMeta: {
    fontSize: 14,
    color: c.secondary,
    fontWeight: '500',
  },
  vehicleSpec: {
    fontSize: 13,
    color: c.secondary,
  },
  vehiclePrice: {
    fontSize: 18,
    fontWeight: '800',
    color: c.ink,
    marginTop: 4,
  },

  /* empty */
  emptyText: {
    fontSize: 15,
    color: c.secondary,
    textAlign: 'center',
    paddingVertical: 8,
  },
});
