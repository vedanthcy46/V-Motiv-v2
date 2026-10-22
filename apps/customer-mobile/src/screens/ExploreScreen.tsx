import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
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
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Bookmark, Filter, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { BrandHeader, EmptyState, Loading, PrimaryButton, Screen, common } from '../components/ui';
import { VehicleCard } from '../components/VehicleCard';
import { customer } from '../services/customer';
import type { RootStack, Tabs } from '../navigation/types';
import type { SupportedCity, VehicleSummary } from '../types';
import { color, radius, space } from '../theme';
import { friendlyError } from '../format';
import { useAuth } from '../auth/AuthProvider';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<Tabs, 'Explore'>,
  NativeStackNavigationProp<RootStack>
>;

export function ExploreScreen({ navigation }: { navigation: Nav }) {
  const insets = useSafeAreaInsets();
  const { state } = useAuth();
  const [items, setItems] = useState<VehicleSummary[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'price_asc' | 'year_desc'>('newest');
  const [city, setCity] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [transmission, setTransmission] = useState('');
  const [cities, setCities] = useState<SupportedCity[]>([]);
  const [saveMessage, setSaveMessage] = useState('');
  const [savingSearch, setSavingSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
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

  const toggleWishlist = async (item: VehicleSummary) => {
    setItems((current) =>
      current.map((val) => (val.id === item.id ? { ...val, isWishlisted: !val.isWishlisted } : val))
    );
    try {
      if (item.isWishlisted) {
        await customer.removeWishlist(item.id);
      } else {
        await customer.addWishlist(item.id);
      }
    } catch {
      setItems((current) =>
        current.map((val) => (val.id === item.id ? item : val))
      );
    }
  };

  const resetFilters = () => {
    setSearch('');
    setCity('');
    setFuelType('');
    setTransmission('');
    setSort('newest');
  };

  const hasActiveFilters = Boolean(search || city || fuelType || transmission || sort !== 'newest');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Fixed Search & Filters Header — positioned outside FlatList so typing never loses focus or dismisses keyboard */}
      <View style={styles.header}>
        <BrandHeader
          eyebrow="CERTIFIED INVENTORY"
          rightAction={
            hasActiveFilters ? (
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={resetFilters}
                activeOpacity={0.7}
              >
                <RotateCcw size={13} color={color.yellow} />
                <Text style={styles.resetBtnText}>Reset</Text>
              </TouchableOpacity>
            ) : null
          }
        />

        {/* Search Input Bar */}
        <View style={styles.searchBar}>
          <Search color={color.muted} size={18} />
          <TextInput
            accessibilityLabel="Search make or model"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => void load()}
            returnKeyType="search"
            placeholder="Search Honda, Hyundai, Innova…"
            placeholderTextColor={color.muted}
            style={styles.searchInput}
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={10}>
              <X size={16} color={color.muted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Quick Filter Horizontal Scroll */}
        <View style={styles.filtersScrollWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.filterPillsRow}
          >
            {/* Sort Pill */}
            {([
              { value: 'newest', label: 'Newest' },
              { value: 'price_asc', label: 'Lowest Price' },
              { value: 'year_desc', label: 'Latest Year' },
            ] as const).map((opt) => {
              const active = sort === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setSort(opt.value)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Fuel Filters */}
            {['PETROL', 'DIESEL'].map((fuel) => {
              const active = fuelType === fuel;
              return (
                <TouchableOpacity
                  key={fuel}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setFuelType(active ? '' : fuel)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
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
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setTransmission(active ? '' : trans)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {trans === 'MANUAL' ? 'Manual' : 'Automatic'}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Cities */}
            {cities.map((c) => {
              const active = city === c.name;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setCity(active ? '' : c.name)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Results Count & Save search bar */}
        <View style={styles.countRow}>
          <Text style={styles.countText}>
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
              <Bookmark size={13} color={color.yellow} />
              <Text style={styles.saveSearchText}>Save search</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {saveMessage ? (
          <Text style={saveMessage.includes('saved') ? styles.successText : styles.errorText}>
            {saveMessage}
          </Text>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
            tintColor={color.yellow}
            colors={[color.yellow]}
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
        renderItem={({ item }) => (
          <VehicleCard
            vehicle={item}
            onOpen={() => navigation.navigate('Vehicle', { listingId: item.id })}
            onSave={() =>
              state === 'signed-in'
                ? void toggleWishlist(item)
                : navigation.navigate('Tabs', { screen: 'Account' })
            }
            onBook={() =>
              state === 'signed-in'
                ? navigation.navigate('TestDrive', { listingId: item.id, title: item.title })
                : navigation.navigate('Tabs', { screen: 'Account' })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.canvas,
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
    backgroundColor: 'rgba(247, 181, 3, 0.1)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.3)',
  },
  resetBtnText: {
    color: color.yellow,
    fontSize: 12,
    fontWeight: '700',
  },
  searchBar: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: color.input,
    borderWidth: 1.2,
    borderColor: color.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  searchInput: {
    flex: 1,
    color: color.text,
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
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: 'rgba(247, 181, 3, 0.15)',
    borderColor: color.yellow,
  },
  pillText: {
    color: color.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  pillTextActive: {
    color: color.yellow,
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
    color: color.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  saveSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  saveSearchText: {
    color: color.yellow,
    fontSize: 12.5,
    fontWeight: '700',
  },
  separator: {
    height: space.lg,
  },
  errorText: {
    color: color.danger,
    fontSize: 13,
  },
  successText: {
    color: color.success,
    fontSize: 13,
    fontWeight: '700',
  },
});
