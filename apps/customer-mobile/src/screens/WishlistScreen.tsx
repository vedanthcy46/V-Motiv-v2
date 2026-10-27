import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, Bookmark, CarFront, Clock, Search, Trash2 } from 'lucide-react-native';
import { BrandHeader, EmptyState, Loading, PrimaryButton, Screen, useCommonStyles } from '../components/ui';
import { BrandLogo } from '../components/BrandLogo';
import { VehicleCard } from '../components/VehicleCard';
import { customer } from '../services/customer';
import type { RootStack, Tabs } from '../navigation/types';
import type { SavedSearch, VehicleSummary } from '../types';
import { friendlyError } from '../format';
import { useAppTheme, radius, space } from '../theme';
import { useAuth } from '../auth/AuthProvider';
import { AuthScreen } from './AuthScreen';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<Tabs, 'Saved'>,
  NativeStackNavigationProp<RootStack>
>;

export function WishlistScreen({ navigation }: { navigation: Nav }) {
  const insets = useSafeAreaInsets();
  const { state } = useAuth();
  const { theme, isDark } = useAppTheme();
  const c = theme.colors;
  const common = useCommonStyles();

  const [items, setItems] = useState<VehicleSummary[]>([]);
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [activeDriveIds, setActiveDriveIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (state !== 'signed-in') return;
    try {
      setError('');
      const [vehicles, saved, drives] = await Promise.all([
        customer.wishlist(),
        customer.savedSearches(),
        customer.testDrives(),
      ]);
      setItems(vehicles);
      setSearches(saved);
      setActiveDriveIds(
        new Set(
          drives
            .filter((d) => d.status === 'REQUESTED')
            .map((d) => d.listing.id)
        )
      );
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [state]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (state !== 'signed-in') {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + space.sm, backgroundColor: c.surface, borderBottomColor: c.border }]}>
          <BrandLogo variant="horizontal" size={26} bodyColor={isDark ? '#FFFFFF' : c.brandNavy} />
          <View style={styles.tabBadge}>
            <Text style={[styles.tabBadgeText, { color: c.brandAccent }]}>SAVED</Text>
          </View>
        </View>
        <AuthScreen includeTopInset={false} showHeader={false} />
      </View>
    );
  }

  return (
    <Screen>
      <View style={styles.navRow}>
        {navigation.canGoBack() && (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[styles.backBtn, { backgroundColor: c.surface }]}
          >
            <ArrowLeft size={20} color={c.textPrimary} />
          </TouchableOpacity>
        )}
        <View style={styles.brandHeaderWrap}>
          <BrandHeader eyebrow="SAVED GARAGE" />
        </View>
      </View>

      <View style={styles.header}>
        <Text style={[common.heading, { color: c.textPrimary }]}>Your Saved Vehicles</Text>
        <Text style={[common.body, { color: c.textSecondary }]}>
          Shortlist cars, monitor price updates, or jump right into your saved searches.
        </Text>
      </View>

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: c.errorBackground, borderLeftColor: c.error }]}>
          <Text accessibilityRole="alert" style={[styles.errorText, { color: c.error }]}>
            {error}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <Loading label="Loading your saved cars…" />
      ) : items.length === 0 && searches.length === 0 ? (
        <EmptyState
          title="Your garage is empty"
          description="Bookmark cars while exploring inventory to compare specs and book test drives."
          icon={<Bookmark size={28} color={c.brandAccent} />}
          action={
            <PrimaryButton
              title="Explore Inventory"
              onPress={() => navigation.navigate('Tabs', { screen: 'Explore' })}
            />
          }
        />
      ) : (
        <View style={styles.list}>
          {/* Saved Searches Section */}
          {searches.length > 0 ? (
            <View style={styles.sectionWrap}>
              <View style={styles.sectionHeader}>
                <Search size={15} color={c.brandAccent} />
                <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Saved Searches ({searches.length})</Text>
              </View>

              <View style={styles.searchesList}>
                {searches.map((item) => (
                  <View key={item.id} style={[styles.searchCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <View style={styles.searchCardInfo}>
                      <Text style={[styles.searchCardName, { color: c.textPrimary }]}>{item.name}</Text>
                      <View style={styles.searchCardMeta}>
                        <Clock size={11} color={c.textMuted} />
                        <Text style={[styles.searchCardDate, { color: c.textMuted }]}>
                          Saved on {new Date(item.createdAt).toLocaleDateString('en-IN')}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Remove saved search ${item.name}`}
                      onPress={() => void customer.removeSavedSearch(item.id).then(load)}
                      style={[styles.deleteBtn, { backgroundColor: c.errorBackground, borderColor: c.error }]}
                    >
                      <Trash2 size={15} color={c.error} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Saved Vehicles Section */}
          {items.length > 0 ? (
            <View style={styles.sectionWrap}>
              <View style={styles.sectionHeader}>
                <CarFront size={15} color={c.brandAccent} />
                <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Shortlisted Vehicles ({items.length})</Text>
              </View>

              <View style={styles.vehiclesList}>
                {items.map((item) => {
                  const hasDrive = activeDriveIds.has(item.id);
                  return (
                    <VehicleCard
                      key={item.id}
                      vehicle={item}
                      hasTestDrive={hasDrive}
                      onOpen={() => navigation.navigate('Vehicle', { listingId: item.id })}
                      onSave={() => void customer.removeWishlist(item.id).then(load)}
                      onBook={() => {
                        if (hasDrive) {
                          navigation.navigate('Tabs', { screen: 'Activity' });
                        } else {
                          navigation.navigate('TestDrive', {
                            listingId: item.id,
                            title: item.title,
                          });
                        }
                      }}
                    />
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
  },
  tabBadge: {
    backgroundColor: 'rgba(247, 181, 3, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.3)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tabBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: space.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandHeaderWrap: {
    flex: 1,
  },
  header: {
    gap: 4,
    marginBottom: space.sm,
  },
  list: {
    gap: space.xl,
  },
  sectionWrap: {
    gap: space.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  searchesList: {
    gap: space.sm,
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
  },
  searchCardInfo: {
    flex: 1,
    gap: 4,
  },
  searchCardName: {
    fontSize: 15,
    fontWeight: '700',
  },
  searchCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchCardDate: {
    fontSize: 12,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  vehiclesList: {
    gap: space.lg,
  },
  errorBox: {
    padding: space.md,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    marginVertical: space.xs,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
