import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Bookmark, RotateCcw, Search, X } from 'lucide-react-native';
import { BrandHeader, EmptyState, Loading, PrimaryButton } from '../components/ui';
import { VehicleCard } from '../components/VehicleCard';
import { customer } from '../services/customer';
import type { RootStack, Tabs } from '../navigation/types';
import type { SupportedCity, VehicleSummary } from '../types';
import { useAppTheme, radius, space } from '../theme';
import { friendlyError } from '../format';
import { useAuth } from '../auth/AuthProvider';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<Tabs, 'Explore'>,
  NativeStackNavigationProp<RootStack>
>;

export function ExploreScreen({ navigation }: { navigation: Nav }) {
  const insets = useSafeAreaInsets();
  const { state } = useAuth();
  const { theme } = useAppTheme();
  const c = theme.colors;

  const [items, setItems] = useState<VehicleSummary[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'price_asc' | 'year_desc'>('newest');
  const [city, setCity] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [transmission, setTransmission] = useState('');
  const [cities, setCities] = useState<SupportedCity[]>([]);
  const [activeDriveIds, setActiveDriveIds] = useState<Set<string>>(new Set());
  const [saveMessage, setSaveMessage] = useState('');
  const requestId = useRef(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (term = search) => {
      const current = ++requestId.current;
      try {
        setError('');
        const result = await customer.inventory({
          search: term,
          sort,
          city: city || undefined,
          fuelType: fuelType || undefined,
          transmission: transmission || undefined,
        });
        if (current === requestId.current) setItems(result.items);
      } catch (e) {
        if (current === requestId.current) setError(friendlyError(e));
      } finally {
        if (current === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [search, sort, city, fuelType, transmission]
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(search), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search, sort, city, fuelType, transmission]);

  useEffect(() => {
    void customer.cities().then(setCities).catch(() => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (state === 'signed-in') {
        customer
          .testDrives()
          .then((drives) => {
            setActiveDriveIds(
              new Set(
                drives.filter((d) => d.status === 'REQUESTED').map((d) => d.listing.id)
              )
            );
          })
          .catch(() => undefined);
      } else {
        setActiveDriveIds(new Set());
      }
    }, [state])
  );

  const toggleWishlist = async (listing: VehicleSummary) => {
    try {
      if (listing.isWishlisted) {
        await customer.removeWishlist(listing.id);
        setItems((prev) =>
          prev.map((item) => (item.id === listing.id ? { ...item, isWishlisted: false } : item))
        );
      } else {
        await customer.addWishlist(listing.id);
        setItems((prev) =>
          prev.map((item) => (item.id === listing.id ? { ...item, isWishlisted: true } : item))
        );
      }
    } catch {
      // Ignored
    }
  };

  const hasActiveFilters = Boolean(search || city || fuelType || transmission || sort !== 'newest');

  const resetFilters = () => {
    setSearch('');
    setCity('');
    setFuelType('');
    setTransmission('');
    setSort('newest');
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top }]}>
      {/* Top Header & Search Controls */}
      <View style={styles.header}>
        <BrandHeader
          eyebrow="VERIFIED INVENTORY"
          rightAction={
            hasActiveFilters ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Reset all filters"
                style={[styles.resetBtn, { backgroundColor: c.selected, borderColor: c.brandAccent }]}
                onPress={resetFilters}
              >
                <RotateCcw size={12} color={c.brandAccent} />
                <Text style={[styles.resetBtnText, { color: c.brandAccent }]}>Reset</Text>
              </TouchableOpacity>
            ) : null
          }
        />

        {/* Search Bar */}
        <View style={[styles.searchBar, { backgroundColor: c.inputBackground, borderColor: c.inputBorder }]}>
          <Search size={18} color={c.textMuted} />
          <TextInput
            accessibilityLabel="Search by make, model, variant"
            placeholder="Search Nexon, Swift, Creta, city…"
            placeholderTextColor={c.inputPlaceholder}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            style={[styles.searchInput, { color: c.textPrimary }]}
          />
          {search ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Clear search text"
              onPress={() => setSearch('')}
            >
              <X size={16} color={c.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter Quick-Pills Row */}
        <View style={styles.filtersScrollWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterPillsRow}
          >
            {/* Sort Options */}
            <TouchableOpacity
              style={[
                styles.pill,
                { backgroundColor: c.surface, borderColor: c.border },
                sort === 'price_asc' && [styles.pillActive, { backgroundColor: c.selected, borderColor: c.brandAccent }],
              ]}
              onPress={() => setSort(sort === 'price_asc' ? 'newest' : 'price_asc')}
              activeOpacity={0.75}
            >
              <Text style={[styles.pillText, { color: c.textSecondary }, sort === 'price_asc' && [styles.pillTextActive, { color: c.brandAccent }]]}>
                Price: Low to High
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.pill,
                { backgroundColor: c.surface, borderColor: c.border },
                sort === 'year_desc' && [styles.pillActive, { backgroundColor: c.selected, borderColor: c.brandAccent }],
              ]}
              onPress={() => setSort(sort === 'year_desc' ? 'newest' : 'year_desc')}
              activeOpacity={0.75}
            >
              <Text style={[styles.pillText, { color: c.textSecondary }, sort === 'year_desc' && [styles.pillTextActive, { color: c.brandAccent }]]}>
                Newest Year
              </Text>
            </TouchableOpacity>

            {/* Fuel Filters */}
            {['PETROL', 'DIESEL'].map((fuel) => {
              const active = fuelType === fuel;
              return (
                <TouchableOpacity
                  key={fuel}
                  style={[
                    styles.pill,
                    { backgroundColor: c.surface, borderColor: c.border },
                    active && [styles.pillActive, { backgroundColor: c.selected, borderColor: c.brandAccent }],
                  ]}
                  onPress={() => setFuelType(active ? '' : fuel)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.pillText, { color: c.textSecondary }, active && [styles.pillTextActive, { color: c.brandAccent }]]}>
                    {fuel === 'PETROL' ? 'Petrol' : 'Diesel'}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Transmission Filters */}
            {['MANUAL', 'AUTOMATIC'].map((trans) => {
              const active = transmission === trans;
              return (
                <TouchableOpacity
                  key={trans}
                  style={[
                    styles.pill,
                    { backgroundColor: c.surface, borderColor: c.border },
                    active && [styles.pillActive, { backgroundColor: c.selected, borderColor: c.brandAccent }],
                  ]}
                  onPress={() => setTransmission(active ? '' : trans)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.pillText, { color: c.textSecondary }, active && [styles.pillTextActive, { color: c.brandAccent }]]}>
                    {trans === 'MANUAL' ? 'Manual' : 'Automatic'}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Cities */}
            {cities.map((ci) => {
              const active = city === ci.name;
              return (
                <TouchableOpacity
                  key={ci.id}
                  style={[
                    styles.pill,
                    { backgroundColor: c.surface, borderColor: c.border },
                    active && [styles.pillActive, { backgroundColor: c.selected, borderColor: c.brandAccent }],
                  ]}
                  onPress={() => setCity(active ? '' : ci.name)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.pillText, { color: c.textSecondary }, active && [styles.pillTextActive, { color: c.brandAccent }]]}>
                    {ci.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Results Count & Save search bar */}
        <View style={styles.countRow}>
          <Text style={[styles.countText, { color: c.textMuted }]}>
            {loading ? 'Searching…' : `${items.length} verified ${items.length === 1 ? 'car' : 'cars'} available`}
          </Text>
          {search.trim().length > 0 ? (
            <TouchableOpacity
              style={styles.saveSearchBtn}
              onPress={() => {
                if (state !== 'signed-in') {
                  navigation.navigate('Tabs', { screen: 'Account' });
                } else {
                  void customer
                    .saveSearch({
                      name: search.trim(),
                      query: { search: search.trim(), sort, city: city || undefined },
                    })
                    .then(() => setSaveMessage('Search saved to account.'))
                    .catch((err) => setSaveMessage(friendlyError(err)));
                }
              }}
            >
              <Bookmark size={13} color={c.brandAccent} />
              <Text style={[styles.saveSearchText, { color: c.brandAccent }]}>Save search</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {saveMessage ? (
          <Text style={[saveMessage.includes('saved') ? styles.successText : styles.errorText, { color: saveMessage.includes('saved') ? c.success : c.error }]}>
            {saveMessage}
          </Text>
        ) : null}

        {error ? <Text style={[styles.errorText, { color: c.error }]}>{error}</Text> : null}
      </View>

      <FlatList
        data={loading ? [] : items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 20) + 84 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.brandAccent}
            colors={[c.brandAccent]}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        ListEmptyComponent={
          loading ? (
            <Loading label="Fetching verified vehicle inventory…" />
          ) : (
            <EmptyState
              title="No cars match your criteria"
              description="Try adjusting your fuel, transmission, or city filters to view other certified vehicles."
              action={
                hasActiveFilters ? (
                  <PrimaryButton
                    title="Clear All Filters"
                    variant="secondary"
                    onPress={resetFilters}
                  />
                ) : null
              }
            />
          )
        }
        renderItem={({ item }) => {
          const hasDrive = activeDriveIds.has(item.id);
          return (
            <VehicleCard
              vehicle={item}
              hasTestDrive={hasDrive}
              onOpen={() => navigation.navigate('Vehicle', { listingId: item.id })}
              onSave={() =>
                state === 'signed-in'
                  ? void toggleWishlist(item)
                  : navigation.navigate('Tabs', { screen: 'Account' })
              }
              onBook={() => {
                if (state !== 'signed-in') {
                  navigation.navigate('Tabs', { screen: 'Account' });
                } else if (hasDrive) {
                  navigation.navigate('Tabs', { screen: 'Activity' });
                } else {
                  navigation.navigate('TestDrive', { listingId: item.id, title: item.title });
                }
              }}
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.md,
    marginBottom: space.sm,
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  searchBar: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
  },
  filtersScrollWrap: {
    marginHorizontal: -space.lg,
  },
  filterPillsRow: {
    paddingHorizontal: space.lg,
    gap: space.sm,
    paddingVertical: 2,
  },
  pill: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {},
  pillText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  pillTextActive: {
    fontWeight: '800',
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: space.xs,
  },
  countText: {
    fontSize: 13,
    fontWeight: '700',
  },
  saveSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  saveSearchText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  separator: {
    height: space.lg,
  },
  errorText: {
    fontSize: 13,
  },
  successText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
