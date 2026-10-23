import React, { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Bookmark, CarFront, Clock, Search, Trash2 } from 'lucide-react-native';
import { BrandHeader, EmptyState, Loading, PrimaryButton, Screen, common } from '../components/ui';
import { VehicleCard } from '../components/VehicleCard';
import { customer } from '../services/customer';
import type { RootStack, Tabs } from '../navigation/types';
import type { SavedSearch, VehicleSummary } from '../types';
import { friendlyError } from '../format';
import { color, radius, space } from '../theme';
import { useAuth } from '../auth/AuthProvider';
import { AuthScreen } from './AuthScreen';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<Tabs, 'Saved'>,
  NativeStackNavigationProp<RootStack>
>;

export function WishlistScreen({ navigation }: { navigation: Nav }) {
  const { state } = useAuth();
  const [items, setItems] = useState<VehicleSummary[]>([]);
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [activeDriveIds, setActiveDriveIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
      setRefreshing(false);
    }
  }, [state]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (state !== 'signed-in') {
    return <AuthScreen />;
  }

  return (
    <Screen>
      <BrandHeader eyebrow="SAVED GARAGE" />

      <View style={styles.header}>
        <Text style={common.heading}>Your Saved Vehicles</Text>
        <Text style={common.body}>
          Shortlist cars, monitor price updates, or jump right into your saved searches.
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text accessibilityRole="alert" style={styles.errorText}>
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
          icon={<Bookmark size={28} color={color.yellow} />}
          action={
            <PrimaryButton
              title="Explore Inventory"
              onPress={() => navigation.navigate('Explore')}
            />
          }
        />
      ) : (
        <View style={styles.list}>
          {/* Saved Searches Section */}
          {searches.length > 0 ? (
            <View style={styles.sectionWrap}>
              <View style={styles.sectionHeader}>
                <Search size={15} color={color.yellow} />
                <Text style={styles.sectionTitle}>Saved Searches ({searches.length})</Text>
              </View>

              <View style={styles.searchesList}>
                {searches.map((item) => (
                  <View key={item.id} style={styles.searchCard}>
                    <View style={styles.searchCardInfo}>
                      <Text style={styles.searchCardName}>{item.name}</Text>
                      <View style={styles.searchCardMeta}>
                        <Clock size={11} color={color.muted} />
                        <Text style={styles.searchCardDate}>
                          Saved on {new Date(item.createdAt).toLocaleDateString('en-IN')}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Remove saved search ${item.name}`}
                      onPress={() => void customer.removeSavedSearch(item.id).then(load)}
                      style={styles.deleteBtn}
                    >
                      <Trash2 size={15} color="#EF4444" />
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
                <CarFront size={15} color={color.yellow} />
                <Text style={styles.sectionTitle}>Shortlisted Vehicles ({items.length})</Text>
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
    color: color.white,
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
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
  },
  searchCardInfo: {
    flex: 1,
    gap: 4,
  },
  searchCardName: {
    color: color.text,
    fontSize: 15,
    fontWeight: '700',
  },
  searchCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchCardDate: {
    color: color.muted,
    fontSize: 12,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  vehiclesList: {
    gap: space.lg,
  },
  errorBox: {
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    padding: space.md,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: color.danger,
    marginVertical: space.xs,
  },
  errorText: {
    color: color.danger,
    fontSize: 13,
    fontWeight: '600',
  },
});
