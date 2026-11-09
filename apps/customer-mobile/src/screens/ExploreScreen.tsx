import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
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
import {
  ArrowLeft,
  ArrowUpDown,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Filter,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react-native';
import { BrandHeader, EmptyState, Loading, PrimaryButton } from '../components/ui';
import { VehicleCard } from '../components/VehicleCard';
import { customer } from '../services/customer';
import { describeAge } from '../services/inventory-offline';
import type { RootStack, Tabs } from '../navigation/types';
import type { SupportedCity, VehicleSummary } from '../types';
import { useAppTheme, radius, space } from '../theme';
import { buildKmOptions, buildPriceOptions, buildYearOptions, priceBoundsFromKey, type InventoryFacets } from '../services/inventory-facets';
import { useTabScreenBottomPadding, safeBottom } from '../layout/safe-layout';
import { friendlyError } from '../format';
import { useAuth } from '../auth/AuthProvider';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { KeyboardScrollView } from '../components/KeyboardScrollView';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<Tabs, 'Explore'>,
  NativeStackNavigationProp<RootStack>
>;

type FilterCategoryKey =
  | 'PRICE'
  | 'BRANDS'
  | 'YEAR'
  | 'KMS'
  | 'FUEL'
  | 'BODY'
  | 'TRANSMISSION'
  | 'CATEGORY'
  | 'COLOR'
  | 'FEATURES';

interface CategoryItem {
  key: FilterCategoryKey;
  label: string;
  isNew?: boolean;
}

const FILTER_CATEGORIES: CategoryItem[] = [
  { key: 'PRICE', label: 'Price Range' },
  { key: 'BRANDS', label: 'Brands + Models' },
  { key: 'YEAR', label: 'Year' },
  { key: 'KMS', label: 'Kms Driven' },
  { key: 'FUEL', label: 'Fuel Type' },
  { key: 'BODY', label: 'Body Type' },
  { key: 'TRANSMISSION', label: 'Transmission' },
  { key: 'CATEGORY', label: 'Car Category' },
  { key: 'COLOR', label: 'Color' },
  { key: 'FEATURES', label: 'Safety & Features', isNew: true },
];

const PRICE_PRESETS = [
  { key: 'UNDER_3L', label: 'Under ₹3 Lakh', sub: 'Budget cars' },
  { key: '3L_6L', label: '₹3 - 6 Lakh', sub: 'Most popular' },
  { key: '6L_10L', label: '₹6 - 10 Lakh', sub: 'Mid-tier & compact SUVs' },
  { key: '10L_15L', label: '₹10 - 15 Lakh', sub: 'Premium SUVs & sedans' },
  { key: 'ABOVE_15L', label: 'Above ₹15 Lakh', sub: 'Luxury & executive' },
];

const POPULAR_BRANDS = [
  'Maruti Suzuki',
  'Hyundai',
  'Tata',
  'Mahindra',
  'Honda',
  'Toyota',
  'Kia',
  'Volkswagen',
  'Skoda',
  'Renault',
  'Nissan',
  'MG',
  'Ford',
];

const DEFAULT_MODELS_BY_BRAND: Record<string, string[]> = {
  'Maruti Suzuki': ['Swift', 'Baleno', 'Dzire', 'Brezza', 'Ertiga', 'Wagon R', 'Alto', 'Grand Vitara', 'Fronx', 'Ciaz', 'XL6', 'Ignis', 'S-Presso'],
  'Hyundai': ['Creta', 'i20', 'Venue', 'Verna', 'Grand i10', 'Aura', 'Tucson', 'Alcazar', 'Exter', 'Santro', 'i10 Active'],
  'Tata': ['Nexon', 'Punch', 'Harrier', 'Safari', 'Altroz', 'Tiago', 'Tigor', 'Curvv', 'Nexon EV'],
  'Mahindra': ['Thar', 'Scorpio', 'Scorpio-N', 'XUV700', 'XUV300', 'XUV3XO', 'Bolero', 'XUV400'],
  'Honda': ['City', 'Amaze', 'Elevate', 'WR-V', 'Jazz', 'Civic', 'CR-V'],
  'Toyota': ['Innova', 'Innova Crysta', 'Innova Hycross', 'Fortuner', 'Urban Cruiser', 'Glanza', 'Hyryder', 'Yaris'],
  'Kia': ['Seltos', 'Sonet', 'Carens', 'Carnival', 'EV6'],
  'Volkswagen': ['Polo', 'Vento', 'Taigun', 'Virtus', 'Tiguan'],
  'Skoda': ['Slavia', 'Kushaq', 'Rapid', 'Octavia', 'Superb'],
  'Renault': ['Kwid', 'Triber', 'Kiger', 'Duster'],
  'Nissan': ['Magnite', 'Kicks', 'Sunny', 'Micra'],
  'MG': ['Hector', 'Astor', 'ZS EV', 'Comet EV'],
  'Ford': ['EcoSport', 'Endeavour', 'Figo', 'Aspire'],
};

const YEAR_OPTIONS = [
  { value: 2023, label: '2023 & newer' },
  { value: 2021, label: '2021 & newer' },
  { value: 2019, label: '2019 & newer' },
  { value: 2017, label: '2017 & newer' },
  { value: 2014, label: '2014 & newer' },
];

const KMS_OPTIONS = [
  { value: 25000, label: 'Up to 25,000 km' },
  { value: 50000, label: 'Up to 50,000 km' },
  { value: 75000, label: 'Up to 75,000 km' },
  { value: 100000, label: 'Up to 1,00,000 km' },
];

const FUEL_OPTIONS = [
  { key: 'PETROL', label: 'Petrol' },
  { key: 'DIESEL', label: 'Diesel' },
  { key: 'CNG', label: 'CNG' },
  { key: 'ELECTRIC', label: 'Electric (EV)' },
  { key: 'HYBRID', label: 'Hybrid' },
];

const BODY_OPTIONS = [
  { key: 'HATCHBACK', label: 'Hatchback', icon: '🚗' },
  { key: 'SEDAN', label: 'Sedan', icon: '🚘' },
  { key: 'SUV', label: 'SUV', icon: '🚙' },
  { key: 'MUV', label: 'MUV / 7-Seater', icon: '🚐' },
  { key: 'COUPE', label: 'Coupe / Luxury', icon: '🏎️' },
  { key: 'CONVERTIBLE', label: 'Convertible', icon: '🚗' },
];

const COLOR_OPTIONS = [
  { name: 'White', hex: '#FFFFFF', border: '#CBD5E1' },
  { name: 'Silver', hex: '#E2E8F0', border: '#94A3B8' },
  { name: 'Grey', hex: '#64748B', border: '#475569' },
  { name: 'Black', hex: '#0F172A', border: '#334155' },
  { name: 'Red', hex: '#EF4444', border: '#DC2626' },
  { name: 'Blue', hex: '#3B82F6', border: '#2563EB' },
  { name: 'Brown', hex: '#92400E', border: '#78350F' },
];

const FEATURE_OPTIONS = [
  'Sunroof',
  'Airbags (6+)',
  'Cruise Control',
  '360° Camera',
  'Touchscreen Audio',
  'Navigation',
  'Ventilated Seats',
  'Push Button Start',
  'Leather Seats',
];

function getPriceBounds(range: string): { minPricePaise?: number; maxPricePaise?: number } {
  // Buckets built from the real stock range carry their bounds in the key ('P:min:max').
  if (range.startsWith('P:')) return priceBoundsFromKey(range);
  switch (range) {
    case 'UNDER_3L':
      return { maxPricePaise: 30000000 };
    case '3L_6L':
      return { minPricePaise: 30000000, maxPricePaise: 60000000 };
    case '6L_10L':
      return { minPricePaise: 60000000, maxPricePaise: 100000000 };
    case '10L_15L':
      return { minPricePaise: 100000000, maxPricePaise: 150000000 };
    case 'ABOVE_15L':
      return { minPricePaise: 150000000 };
    default:
      return {};
  }
}

export function ExploreScreen({ navigation }: { navigation: Nav }) {
  const tabBottomPadding = useTabScreenBottomPadding();
  const insets = useSafeAreaInsets();
  const { state } = useAuth();
  const { theme, isDark } = useAppTheme();
  const c = theme.colors;

  const [items, setItems] = useState<VehicleSummary[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'price_asc' | 'price_desc' | 'year_desc'>('newest');
  const [city, setCity] = useState('');
  const [priceRange, setPriceRange] = useState('');
  const [brands, setBrands] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [minYear, setMinYear] = useState<number | null>(null);
  const [maxKm, setMaxKm] = useState<number | null>(null);
  const [fuelType, setFuelType] = useState('');
  const [bodyType, setBodyType] = useState('');
  const [transmission, setTransmission] = useState('');
  const [color, setColor] = useState('');
  const [category, setCategory] = useState('');
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  // Spinny Filter Modal
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState<FilterCategoryKey>('PRICE');
  const [brandSearch, setBrandSearch] = useState('');

  // Staged Filter States
  const [stagedPriceRange, setStagedPriceRange] = useState('');
  const [stagedBrands, setStagedBrands] = useState<string[]>([]);
  const [stagedModels, setStagedModels] = useState<string[]>([]);
  const [stagedMinYear, setStagedMinYear] = useState<number | null>(null);
  const [stagedMaxKm, setStagedMaxKm] = useState<number | null>(null);
  const [stagedFuelType, setStagedFuelType] = useState('');
  const [stagedBodyType, setStagedBodyType] = useState('');
  const [stagedTransmission, setStagedTransmission] = useState('');
  const [stagedColor, setStagedColor] = useState('');
  const [stagedCategory, setStagedCategory] = useState('');
  const [stagedFeatures, setStagedFeatures] = useState<string[]>([]);

  const [cities, setCities] = useState<SupportedCity[]>([]);
  const [masterDataList, setMasterDataList] = useState<Array<{ id: string; category: string; code: string; name: string; parentCode: string | null }>>([]);
  // Real option lists, counts and ranges from the whole inventory (not just the first page).
  const [facets, setFacets] = useState<InventoryFacets | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeDriveIds, setActiveDriveIds] = useState<Set<string>>(new Set());
  const [saveMessage, setSaveMessage] = useState('');
  const requestId = useRef(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  // Set while the list comes from the copy saved on the device (the server could not be reached).
  const [offlineSince, setOfflineSince] = useState<number | null>(null);

  // Live Inventory Counts by Brand & Model (matching available inventory)
  const inventoryBrandCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (facets?.makes ?? []).forEach((m) => { counts[m.value.toLowerCase()] = m.count; });
    return counts;
  }, [facets]);

  const inventoryModelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (facets?.models ?? []).forEach((m) => { counts[m.value.toLowerCase()] = (counts[m.value.toLowerCase()] || 0) + m.count; });
    return counts;
  }, [facets]);

  // Dynamic Master Data matching Admin Portal + Available Inventory
  const availableBrands = useMemo(() => {
    const fromMaster = masterDataList
      .filter((i) => i.category === 'MAKE')
      .map((i) => i.name.trim());
    const fromInventory = (facets?.makes ?? []).map((m) => m.value);
    const combined = Array.from(new Set([...fromInventory, ...(fromMaster.length > 0 ? fromMaster : POPULAR_BRANDS)]));
    // Prioritize brands with available cars in inventory
    return combined.sort((a, b) => {
      const countA = inventoryBrandCounts[a.toLowerCase()] || 0;
      const countB = inventoryBrandCounts[b.toLowerCase()] || 0;
      if (countA > 0 && countB === 0) return -1;
      if (countB > 0 && countA === 0) return 1;
      if (countA !== countB) return countB - countA;
      return a.localeCompare(b);
    });
  }, [masterDataList, facets, inventoryBrandCounts]);

  const availableModels = useMemo(() => {
    const map: Record<string, string[]> = {};
    // The bundled model list is only a fallback for when the Admin portal has no models yet.
    if (!masterDataList.some((i) => i.category === 'MODEL')) {
      Object.entries(DEFAULT_MODELS_BY_BRAND).forEach(([k, list]) => {
        map[k] = [...list];
      });
    }
    // Models present in active inventory (real counts come from the facets endpoint)
    (facets?.models ?? []).forEach(({ make, value: model }) => {
      const brandKey = Object.keys(map).find((k) => k.toLowerCase() === make.toLowerCase()) || make;
      if (!map[brandKey]) map[brandKey] = [];
      if (!map[brandKey].some((m) => m.toLowerCase() === model.toLowerCase())) map[brandKey].unshift(model);
    });
    // Merge master data
    masterDataList
      .filter((i) => i.category === 'MODEL')
      .forEach((m) => {
        const parentMake = m.parentCode
          ? masterDataList.find((make) => make.code === m.parentCode || make.name.toLowerCase() === m.parentCode?.toLowerCase())?.name || m.parentCode
          : 'Other';
        if (!map[parentMake]) map[parentMake] = [];
        if (!map[parentMake].includes(m.name)) map[parentMake].push(m.name);
      });
    return map;
  }, [masterDataList, facets]);

  const availableBodyTypes = useMemo(() => {
    const fromMaster = masterDataList.filter((i) => i.category === 'BODY_TYPE');
    if (fromMaster.length > 0) {
      return fromMaster.map((i) => ({
        key: i.code,
        label: i.name,
        icon: BODY_OPTIONS.find((b) => b.key === i.code)?.icon || '🚗',
      }));
    }
    return BODY_OPTIONS;
  }, [masterDataList]);

  const availableFuelTypes = useMemo(() => {
    const fromMaster = masterDataList.filter((i) => i.category === 'FUEL_TYPE');
    if (fromMaster.length > 0) {
      return fromMaster.map((i) => ({
        key: i.code,
        label: i.name,
      }));
    }
    return FUEL_OPTIONS;
  }, [masterDataList]);

  const availableTransmissions = useMemo(() => {
    const fromMaster = masterDataList.filter((i) => i.category === 'TRANSMISSION');
    if (fromMaster.length > 0) {
      return fromMaster.map((i) => ({
        key: i.code,
        label: i.name,
      }));
    }
    return [
      { key: 'MANUAL', label: 'Manual' },
      { key: 'AUTOMATIC', label: 'Automatic' },
    ];
  }, [masterDataList]);

  // Filter options built from what is really in stock (ranges, features, colours) with the old fixed lists only as a fallback.
  const priceOptions = useMemo(() => {
    const built = buildPriceOptions(facets?.ranges.price ?? null).filter((o) => o.minPricePaise !== undefined || o.maxPricePaise !== undefined);
    return built.length > 0 ? built.map((o) => ({ key: o.key, label: o.label, sub: '' })) : PRICE_PRESETS;
  }, [facets]);
  const yearOptions = useMemo(() => {
    const built = buildYearOptions(facets?.ranges.year ?? null);
    return built.length > 0 ? built : YEAR_OPTIONS;
  }, [facets]);
  const kmOptions = useMemo(() => {
    const built = buildKmOptions(facets?.ranges.odometerKm ?? null);
    return built.length > 0 ? built : KMS_OPTIONS;
  }, [facets]);
  const featureOptions = useMemo(() => {
    const names = (facets?.features ?? []).map((x) => x.value);
    return names.length > 0 ? names : FEATURE_OPTIONS;
  }, [facets]);
  const colorOptions = useMemo(() => {
    const inStock = facets?.colors ?? [];
    if (inStock.length === 0) return COLOR_OPTIONS;
    return inStock.map((entry) => {
      const known = COLOR_OPTIONS.find((o) => o.name.toLowerCase() === entry.value.toLowerCase());
      return known ?? { name: entry.value, hex: '#9CA3AF', border: '#6B7280' };
    });
  }, [facets]);

  const load = useCallback(
    async (term = search, pageToLoad = 1) => {
      const current = ++requestId.current;
      try {
        setError('');
        const priceBounds = getPriceBounds(priceRange);
        const result = await customer.inventory({
          search: term,
          sort,
          city: city || undefined,
          fuelType: fuelType || undefined,
          transmission: transmission || undefined,
          make: brands.length > 0 ? brands.join(',') : undefined,
          model: models.length > 0 ? models.join(',') : undefined,
          bodyType: bodyType || undefined,
          color: color || undefined,
          minYear: minYear || undefined,
          maxOdometerKm: maxKm || undefined,
          features: selectedFeatures.length > 0 ? selectedFeatures.join('|') : undefined,
          page: pageToLoad,
          limit: 20,
          ...priceBounds,
        });
        if (current === requestId.current) {
          setOfflineSince(result.fromCache ? result.syncedAt ?? 0 : null);
          setItems((prev) =>
            pageToLoad === 1 ? result.items : [...prev, ...result.items.filter((next) => !prev.some((p) => p.id === next.id))],
          );
          setPage(result.page);
          setHasMore(result.page < result.totalPages);
        }
      } catch (e) {
        if (current === requestId.current) setError(friendlyError(e));
      } finally {
        if (current === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [search, sort, city, priceRange, brands, models, minYear, maxKm, fuelType, bodyType, transmission, color, selectedFeatures]
  );

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      await load(search, page + 1);
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, hasMore, load, search, page]);

  // Facets follow the filters being edited (staged while the filter sheet is open, applied otherwise).
  const facetParams = useMemo(() => {
    const open = filterModalVisible;
    const price = getPriceBounds(open ? stagedPriceRange : priceRange);
    const list = (staged: string[], applied: string[]) => (open ? staged : applied);
    const feats = list(stagedFeatures, selectedFeatures);
    const makeList = list(stagedBrands, brands);
    const modelList = list(stagedModels, models);
    return {
      search: open ? undefined : search || undefined,
      city: city || undefined,
      fuelType: (open ? stagedFuelType : fuelType) || undefined,
      transmission: (open ? stagedTransmission : transmission) || undefined,
      bodyType: (open ? stagedBodyType : bodyType) || undefined,
      color: (open ? stagedColor : color) || undefined,
      make: makeList.length > 0 ? makeList.join(',') : undefined,
      model: modelList.length > 0 ? modelList.join(',') : undefined,
      features: feats.length > 0 ? feats.join('|') : undefined,
      minYear: (open ? stagedMinYear : minYear) || undefined,
      maxOdometerKm: (open ? stagedMaxKm : maxKm) || undefined,
      ...price,
    };
  }, [filterModalVisible, stagedPriceRange, priceRange, stagedFeatures, selectedFeatures, stagedBrands, brands, stagedModels, models, stagedFuelType, fuelType, stagedTransmission, transmission, stagedBodyType, bodyType, stagedColor, color, stagedMinYear, minYear, stagedMaxKm, maxKm, city, search]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void customer.inventoryFacets(facetParams as Record<string, string | number | undefined>).then((result) => { if (active) setFacets(result); }).catch(() => undefined);
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [facetParams]);

  useEffect(() => {
    const timer = setTimeout(() => void load(search), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search, sort, city, priceRange, brands, models, minYear, maxKm, fuelType, bodyType, transmission, color, selectedFeatures]);

  useEffect(() => {
    void customer.cities().then(setCities).catch(() => undefined);
    void customer.masterData().then(setMasterDataList).catch(() => undefined);
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

  const activeFilterCount = [
    Boolean(priceRange),
    brands.length > 0,
    models.length > 0,
    Boolean(minYear),
    Boolean(maxKm),
    Boolean(fuelType),
    Boolean(bodyType),
    Boolean(transmission),
    Boolean(color),
    Boolean(category),
    selectedFeatures.length > 0,
    Boolean(city),
  ].filter(Boolean).length;

  const hasActiveFilters = Boolean(search || activeFilterCount > 0 || sort !== 'newest');

  const resetFilters = () => {
    setSearch('');
    setCity('');
    setPriceRange('');
    setBrands([]);
    setModels([]);
    setMinYear(null);
    setMaxKm(null);
    setFuelType('');
    setBodyType('');
    setTransmission('');
    setColor('');
    setCategory('');
    setSelectedFeatures([]);
    setSort('newest');
  };

  const openFilterModal = (cat: FilterCategoryKey = 'PRICE') => {
    setStagedPriceRange(priceRange);
    setStagedBrands([...brands]);
    setStagedModels([...models]);
    setStagedMinYear(minYear);
    setStagedMaxKm(maxKm);
    setStagedFuelType(fuelType);
    setStagedBodyType(bodyType);
    setStagedTransmission(transmission);
    setStagedColor(color);
    setStagedCategory(category);
    setStagedFeatures([...selectedFeatures]);
    setActiveCategory(cat);
    setBrandSearch('');
    setFilterModalVisible(true);
  };

  const handleClearAllStaged = () => {
    setStagedPriceRange('');
    setStagedBrands([]);
    setStagedModels([]);
    setStagedMinYear(null);
    setStagedMaxKm(null);
    setStagedFuelType('');
    setStagedBodyType('');
    setStagedTransmission('');
    setStagedColor('');
    setStagedCategory('');
    setStagedFeatures([]);
  };

  const handleApplyStaged = () => {
    setPriceRange(stagedPriceRange);
    setBrands([...stagedBrands]);
    setModels([...stagedModels]);
    setMinYear(stagedMinYear);
    setMaxKm(stagedMaxKm);
    setFuelType(stagedFuelType);
    setBodyType(stagedBodyType);
    setTransmission(stagedTransmission);
    setColor(stagedColor);
    setCategory(stagedCategory);
    setSelectedFeatures([...stagedFeatures]);
    setFilterModalVisible(false);
  };

  const cycleSort = () => {
    const sequence: Array<'newest' | 'price_asc' | 'price_desc' | 'year_desc'> = [
      'newest',
      'price_asc',
      'price_desc',
      'year_desc',
    ];
    const nextIdx = (sequence.indexOf(sort) + 1) % sequence.length;
    setSort(sequence[nextIdx] ?? 'newest');
  };

  const sortLabels = {
    newest: 'Recommended',
    price_asc: 'Price: Low to High',
    price_desc: 'Price: High to Low',
    year_desc: 'Newest Year',
  };

  // Helper to check if a specific category in modal has staged filter active
  const isCategoryStaged = (cat: FilterCategoryKey): boolean => {
    switch (cat) {
      case 'PRICE':
        return Boolean(stagedPriceRange);
      case 'BRANDS':
        return stagedBrands.length > 0 || stagedModels.length > 0;
      case 'YEAR':
        return Boolean(stagedMinYear);
      case 'KMS':
        return Boolean(stagedMaxKm);
      case 'FUEL':
        return Boolean(stagedFuelType);
      case 'BODY':
        return Boolean(stagedBodyType);
      case 'TRANSMISSION':
        return Boolean(stagedTransmission);
      case 'CATEGORY':
        return Boolean(stagedCategory);
      case 'COLOR':
        return Boolean(stagedColor);
      case 'FEATURES':
        return stagedFeatures.length > 0;
      default:
        return false;
    }
  };

  const filteredBrands = useMemo(() => {
    const q = brandSearch.trim().toLowerCase();
    if (!q) return availableBrands;
    return availableBrands.filter((b) => b.toLowerCase().includes(q));
  }, [availableBrands, brandSearch]);

  const displayModels = useMemo(() => {
    const q = brandSearch.trim().toLowerCase();
    let modelPool: string[] = [];
    if (stagedBrands.length > 0) {
      stagedBrands.forEach((b) => {
        const matchingKey = Object.keys(availableModels).find(
          (k) => k.toLowerCase() === b.toLowerCase()
        );
        const list = matchingKey ? availableModels[matchingKey] || [] : [];
        list.forEach((m) => {
          if (!modelPool.some((x) => x.toLowerCase() === m.toLowerCase())) {
            modelPool.push(m);
          }
        });
      });
    } else {
      Object.values(availableModels).forEach((list) => {
        list.forEach((m) => {
          if (!modelPool.some((x) => x.toLowerCase() === m.toLowerCase())) {
            modelPool.push(m);
          }
        });
      });
    }

    // Sort models with inventory at the top
    modelPool.sort((a, b) => {
      const countA = inventoryModelCounts[a.toLowerCase()] || 0;
      const countB = inventoryModelCounts[b.toLowerCase()] || 0;
      if (countA > 0 && countB === 0) return -1;
      if (countB > 0 && countA === 0) return 1;
      if (countA !== countB) return countB - countA;
      return a.localeCompare(b);
    });

    if (!q) return modelPool;
    return modelPool.filter((m) => m.toLowerCase().includes(q));
  }, [stagedBrands, availableModels, brandSearch, inventoryModelCounts]);

  // Live matching count based on available inventory while in filter modal
  const stagedMatchingCount = useMemo(() => facets?.total ?? items.length, [facets, items.length]);

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

        {/* Spinny-Style Filter Quick-Pills Row */}
        <View style={styles.filtersScrollWrap}>
          <KeyboardScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterPillsRow}
          >
            {/* 1. Main Filter Button with Badge */}
            <TouchableOpacity
              style={[
                styles.spinnyMainFilterPill,
                activeFilterCount > 0 && styles.spinnyMainFilterPillActive,
              ]}
              onPress={() => openFilterModal('PRICE')}
              activeOpacity={0.8}
            >
              <SlidersHorizontal size={14} color={activeFilterCount > 0 ? '#FFFFFF' : '#8B5CF6'} />
              <Text style={[styles.spinnyMainFilterText, activeFilterCount > 0 && { color: '#FFFFFF' }]}>
                Filter {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
              </Text>
            </TouchableOpacity>

            {/* 2. Recommended / Featured Pill */}
            <TouchableOpacity
              style={[
                styles.pill,
                { backgroundColor: c.surface, borderColor: c.border },
                sort === 'newest' && [styles.pillActive, { backgroundColor: c.selected, borderColor: '#8B5CF6' }],
              ]}
              onPress={() => setSort('newest')}
              activeOpacity={0.75}
            >
              <Sparkles size={12} color={sort === 'newest' ? '#8B5CF6' : c.textMuted} />
              <Text style={[styles.pillText, { color: c.textSecondary }, sort === 'newest' && [styles.pillTextActive, { color: '#8B5CF6' }]]}>
                Recommended
              </Text>
            </TouchableOpacity>

            {/* 3. Sort Pill */}
            <TouchableOpacity
              style={[
                styles.pill,
                { backgroundColor: c.surface, borderColor: c.border },
                sort !== 'newest' && [styles.pillActive, { backgroundColor: c.selected, borderColor: '#8B5CF6' }],
              ]}
              onPress={cycleSort}
              activeOpacity={0.75}
            >
              <ArrowUpDown size={12} color={sort !== 'newest' ? '#8B5CF6' : c.textMuted} />
              <Text style={[styles.pillText, { color: c.textSecondary }, sort !== 'newest' && [styles.pillTextActive, { color: '#8B5CF6' }]]}>
                Sort{sort !== 'newest' ? `: ${sortLabels[sort]}` : ''}
              </Text>
            </TouchableOpacity>

            {/* 3b. Brands & Models Pill */}
            <TouchableOpacity
              style={[
                styles.pill,
                { backgroundColor: c.surface, borderColor: c.border },
                (brands.length > 0 || models.length > 0) && [styles.pillActive, { backgroundColor: c.selected, borderColor: '#8B5CF6' }],
              ]}
              onPress={() => openFilterModal('BRANDS')}
              activeOpacity={0.75}
            >
              <Text style={[styles.pillText, { color: c.textSecondary }, (brands.length > 0 || models.length > 0) && [styles.pillTextActive, { color: '#8B5CF6' }]]}>
                {brands.length > 0
                  ? brands.length === 1
                    ? brands[0]
                    : `${brands[0]} +${brands.length - 1}`
                  : models.length > 0
                  ? models.length === 1
                    ? models[0]
                    : `${models[0]} +${models.length - 1}`
                  : 'Brands & Models'}
              </Text>
              <ChevronDown size={13} color={(brands.length > 0 || models.length > 0) ? '#8B5CF6' : c.textMuted} />
            </TouchableOpacity>

            {/* 4. Price Range Pill */}
            <TouchableOpacity
              style={[
                styles.pill,
                { backgroundColor: c.surface, borderColor: c.border },
                Boolean(priceRange) && [styles.pillActive, { backgroundColor: c.selected, borderColor: '#8B5CF6' }],
              ]}
              onPress={() => openFilterModal('PRICE')}
              activeOpacity={0.75}
            >
              <Text style={[styles.pillText, { color: c.textSecondary }, Boolean(priceRange) && [styles.pillTextActive, { color: '#8B5CF6' }]]}>
                {priceRange ? priceOptions.find((p) => p.key === priceRange)?.label || 'Price' : 'Price Range'}
              </Text>
              <ChevronDown size={13} color={priceRange ? '#8B5CF6' : c.textMuted} />
            </TouchableOpacity>

            {/* 5. Year Pill */}
            <TouchableOpacity
              style={[
                styles.pill,
                { backgroundColor: c.surface, borderColor: c.border },
                Boolean(minYear) && [styles.pillActive, { backgroundColor: c.selected, borderColor: '#8B5CF6' }],
              ]}
              onPress={() => openFilterModal('YEAR')}
              activeOpacity={0.75}
            >
              <Text style={[styles.pillText, { color: c.textSecondary }, Boolean(minYear) && [styles.pillTextActive, { color: '#8B5CF6' }]]}>
                {minYear ? `${minYear}+` : 'Year'}
              </Text>
              <ChevronDown size={13} color={minYear ? '#8B5CF6' : c.textMuted} />
            </TouchableOpacity>

            {/* 6. Transmission Pill */}
            <TouchableOpacity
              style={[
                styles.pill,
                { backgroundColor: c.surface, borderColor: c.border },
                Boolean(transmission) && [styles.pillActive, { backgroundColor: c.selected, borderColor: '#8B5CF6' }],
              ]}
              onPress={() => openFilterModal('TRANSMISSION')}
              activeOpacity={0.75}
            >
              <Text style={[styles.pillText, { color: c.textSecondary }, Boolean(transmission) && [styles.pillTextActive, { color: '#8B5CF6' }]]}>
                {transmission ? transmission.charAt(0) + transmission.slice(1).toLowerCase() : 'Transmission'}
              </Text>
              <ChevronDown size={13} color={transmission ? '#8B5CF6' : c.textMuted} />
            </TouchableOpacity>

            {/* 7. Body Type Pill */}
            <TouchableOpacity
              style={[
                styles.pill,
                { backgroundColor: c.surface, borderColor: c.border },
                Boolean(bodyType) && [styles.pillActive, { backgroundColor: c.selected, borderColor: '#8B5CF6' }],
              ]}
              onPress={() => openFilterModal('BODY')}
              activeOpacity={0.75}
            >
              <Text style={[styles.pillText, { color: c.textSecondary }, Boolean(bodyType) && [styles.pillTextActive, { color: '#8B5CF6' }]]}>
                {bodyType || 'Body Type'}
              </Text>
              <ChevronDown size={13} color={bodyType ? '#8B5CF6' : c.textMuted} />
            </TouchableOpacity>

            {/* 8. Fuel Pill */}
            <TouchableOpacity
              style={[
                styles.pill,
                { backgroundColor: c.surface, borderColor: c.border },
                Boolean(fuelType) && [styles.pillActive, { backgroundColor: c.selected, borderColor: '#8B5CF6' }],
              ]}
              onPress={() => openFilterModal('FUEL')}
              activeOpacity={0.75}
            >
              <Text style={[styles.pillText, { color: c.textSecondary }, Boolean(fuelType) && [styles.pillTextActive, { color: '#8B5CF6' }]]}>
                {fuelType ? fuelType.charAt(0) + fuelType.slice(1).toLowerCase() : 'Fuel Type'}
              </Text>
              <ChevronDown size={13} color={fuelType ? '#8B5CF6' : c.textMuted} />
            </TouchableOpacity>

            {/* 9. Color Pill */}
            <TouchableOpacity
              style={[
                styles.pill,
                { backgroundColor: c.surface, borderColor: c.border },
                Boolean(color) && [styles.pillActive, { backgroundColor: c.selected, borderColor: '#8B5CF6' }],
              ]}
              onPress={() => openFilterModal('COLOR')}
              activeOpacity={0.75}
            >
              <Text style={[styles.pillText, { color: c.textSecondary }, Boolean(color) && [styles.pillTextActive, { color: '#8B5CF6' }]]}>
                {color || 'Color'}
              </Text>
              <ChevronDown size={13} color={color ? '#8B5CF6' : c.textMuted} />
            </TouchableOpacity>

            {/* 10. City Selection */}
            {cities.map((ci) => {
              const active = city === ci.name;
              return (
                <TouchableOpacity
                  key={ci.id}
                  style={[
                    styles.pill,
                    { backgroundColor: c.surface, borderColor: c.border },
                    active && [styles.pillActive, { backgroundColor: c.selected, borderColor: '#8B5CF6' }],
                  ]}
                  onPress={() => setCity(active ? '' : ci.name)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.pillText, { color: c.textSecondary }, active && [styles.pillTextActive, { color: '#8B5CF6' }]]}>
                    {ci.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </KeyboardScrollView>
        </View>

        {/* Spinny-Style Results Count Banner */}
        <View style={styles.spinnyCountRow}>
          <Text style={[styles.spinnyCountText, { color: c.textPrimary }]}>
            <Text style={{ fontWeight: '800' }}>{items.length}</Text> Used cars in {city || 'Bangalore'}
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
              <Text style={[styles.saveSearchText, { color: c.brandAccent }]}>Save</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {saveMessage ? (
          <Text style={[saveMessage.includes('saved') ? styles.successText : styles.errorText, { color: saveMessage.includes('saved') ? c.success : c.error }]}>
            {saveMessage}
          </Text>
        ) : null}

        {offlineSince !== null ? (
          <Text accessibilityRole="alert" style={[styles.errorText, { color: c.textMuted }]}>
            You're offline - showing saved cars (updated {describeAge(offlineSince)}). Pull down to refresh when you're back online.
          </Text>
        ) : null}

        {error ? <Text style={[styles.errorText, { color: c.error }]}>{error}</Text> : null}
      </View>

      {/* Car Cards List */}
      <FlatList
        data={loading ? [] : items}
        keyExtractor={(item) => item.id}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <Loading label="Loading more cars…" /> : null}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBottomPadding },
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
              description="Try adjusting your brand, budget, fuel, or city filters to view other certified vehicles."
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

      {/* ========================================================= */}
      {/* FULL SPINNY FILTER MODAL (MATCHING SCREENSHOT 3)           */}
      {/* ========================================================= */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View
          style={[
            styles.modalRoot,
            {
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
              paddingTop: Platform.OS === 'android' ? Math.max(insets.top, 24) : insets.top,
            },
          ]}
        >
          <KeyboardAvoider
            style={{ flex: 1 }}
          >
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity
                  onPress={() => setFilterModalVisible(false)}
                  hitSlop={12}
                  accessibilityLabel="Close filter"
                >
                  <ArrowLeft size={22} color={c.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.modalTitle, { color: c.textPrimary }]}>Filter</Text>
              </View>

              <TouchableOpacity onPress={handleClearAllStaged} hitSlop={12}>
                <Text style={styles.clearAllBtnText}>CLEAR ALL</Text>
              </TouchableOpacity>
            </View>

            {/* 2-Column Split Body */}
            <View style={styles.modalBodyRow}>
              {/* Left Column: Categories List */}
              <View style={[styles.modalLeftCol, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderRightColor: c.border }]}>
                <KeyboardScrollView showsVerticalScrollIndicator={false}>
                  {FILTER_CATEGORIES.map((cat) => {
                    const isActive = activeCategory === cat.key;
                    const hasSelection = isCategoryStaged(cat.key);

                    return (
                      <TouchableOpacity
                        key={cat.key}
                        style={[
                          styles.categoryItem,
                          isActive && [
                            styles.categoryItemActive,
                            { backgroundColor: isDark ? '#0F172A' : '#FFFFFF' },
                          ],
                        ]}
                        onPress={() => setActiveCategory(cat.key)}
                        activeOpacity={0.7}
                      >
                        {isActive && <View style={styles.categoryLeftIndicator} />}
                        <View style={{ flex: 1, paddingVertical: 14, paddingRight: 8 }}>
                          <Text
                            style={[
                              styles.categoryLabel,
                              { color: isActive ? '#8B5CF6' : c.textSecondary },
                              isActive && styles.categoryLabelActive,
                            ]}
                            numberOfLines={2}
                          >
                            {cat.label}
                          </Text>
                          {cat.isNew && (
                            <View style={styles.newBadgePill}>
                              <Text style={styles.newBadgeText}>NEW</Text>
                            </View>
                          )}
                        </View>
                        {hasSelection && <View style={styles.categorySelectionDot} />}
                      </TouchableOpacity>
                    );
                  })}
                </KeyboardScrollView>
              </View>

              {/* Right Pane: Filter Options Content */}
              <View style={[styles.modalRightPane, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}>
                <KeyboardScrollView
                  contentContainerStyle={styles.rightPaneScroll}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                >
                  {/* 1. PRICE RANGE */}
                  {activeCategory === 'PRICE' && (
                    <View style={styles.paneSection}>
                      <Text style={[styles.paneSectionHeading, { color: c.textPrimary }]}>Select Price Range</Text>
                      {priceOptions.map((p) => {
                        const selected = stagedPriceRange === p.key;
                        return (
                          <TouchableOpacity
                            key={p.key}
                            style={[
                              styles.optionRow,
                              selected && [styles.optionRowSelected, { borderColor: '#8B5CF6', backgroundColor: isDark ? 'rgba(139, 92, 246, 0.1)' : '#F5F3FF' }],
                            ]}
                            onPress={() => setStagedPriceRange(selected ? '' : p.key)}
                            activeOpacity={0.7}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.optionTitle, { color: c.textPrimary }, selected && { color: '#8B5CF6', fontWeight: '800' }]}>
                                {p.label}
                              </Text>
                              <Text style={[styles.optionSub, { color: c.textMuted }]}>{p.sub}</Text>
                            </View>
                            <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
                              {selected && <View style={styles.radioInnerDot} />}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {/* 2. BRANDS + MODELS (MULTI-SELECT) */}
                  {activeCategory === 'BRANDS' && (
                    <View style={styles.paneSection}>
                      <Text style={[styles.paneSectionHeading, { color: c.textPrimary }]}>Brands & Models</Text>
                      <View style={[styles.modalSearchBox, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: c.border }]}>
                        <Search size={16} color={c.textMuted} />
                        <TextInput
                          placeholder="Search brands or models…"
                          placeholderTextColor={c.inputPlaceholder}
                          value={brandSearch}
                          onChangeText={setBrandSearch}
                          style={[styles.modalSearchInput, { color: c.textPrimary }]}
                        />
                        {brandSearch ? (
                          <TouchableOpacity onPress={() => setBrandSearch('')}>
                            <X size={15} color={c.textMuted} />
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      {/* Brands Subsection */}
                      <Text style={[styles.paneSubSectionHeading, { color: c.textSecondary }]}>
                        Brands {stagedBrands.length > 0 ? `(${stagedBrands.length} selected)` : ''}
                      </Text>
                      {filteredBrands.map((bName) => {
                        const selected = stagedBrands.some((b) => b.toLowerCase() === bName.toLowerCase());
                        const count = inventoryBrandCounts[bName.toLowerCase()] || 0;
                        return (
                          <TouchableOpacity
                            key={bName}
                            style={[
                              styles.checkboxRow,
                              selected && [styles.checkboxRowSelected, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.1)' : '#F5F3FF' }],
                            ]}
                            onPress={() => {
                              setStagedBrands((prev) =>
                                prev.some((b) => b.toLowerCase() === bName.toLowerCase())
                                  ? prev.filter((b) => b.toLowerCase() !== bName.toLowerCase())
                                  : [...prev, bName]
                              );
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.checkboxBox, selected && styles.checkboxBoxSelected]}>
                              {selected && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
                            </View>
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={[styles.checkboxLabel, { color: c.textPrimary }, selected && { color: '#8B5CF6', fontWeight: '800' }]}>
                                {bName}
                              </Text>
                              {count > 0 ? (
                                <View style={[styles.countBadge, { backgroundColor: selected ? '#8B5CF6' : (isDark ? '#334155' : '#E2E8F0') }]}>
                                  <Text style={[styles.countBadgeText, { color: selected ? '#FFFFFF' : c.textSecondary }]}>
                                    {count} {count === 1 ? 'car' : 'cars'}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}

                      {/* Models Subsection */}
                      {displayModels.length > 0 && (
                        <>
                          <Text style={[styles.paneSubSectionHeading, { color: c.textSecondary, marginTop: 14 }]}>
                            Models {stagedModels.length > 0 ? `(${stagedModels.length} selected)` : ''}
                          </Text>
                          {displayModels.map((mName) => {
                            const selected = stagedModels.some((m) => m.toLowerCase() === mName.toLowerCase());
                            const count = inventoryModelCounts[mName.toLowerCase()] || 0;
                            return (
                              <TouchableOpacity
                                key={mName}
                                style={[
                                  styles.checkboxRow,
                                  selected && [styles.checkboxRowSelected, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.1)' : '#F5F3FF' }],
                                ]}
                                onPress={() => {
                                  setStagedModels((prev) =>
                                    prev.some((m) => m.toLowerCase() === mName.toLowerCase())
                                      ? prev.filter((m) => m.toLowerCase() !== mName.toLowerCase())
                                      : [...prev, mName]
                                  );
                                }}
                                activeOpacity={0.7}
                              >
                                <View style={[styles.checkboxBox, selected && styles.checkboxBoxSelected]}>
                                  {selected && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
                                </View>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <Text style={[styles.checkboxLabel, { color: c.textPrimary }, selected && { color: '#8B5CF6', fontWeight: '800' }]}>
                                    {mName}
                                  </Text>
                                  {count > 0 ? (
                                    <View style={[styles.countBadge, { backgroundColor: selected ? '#8B5CF6' : (isDark ? '#334155' : '#E2E8F0') }]}>
                                      <Text style={[styles.countBadgeText, { color: selected ? '#FFFFFF' : c.textSecondary }]}>
                                        {count} {count === 1 ? 'car' : 'cars'}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </>
                      )}
                    </View>
                  )}

                  {/* 3. YEAR */}
                  {activeCategory === 'YEAR' && (
                    <View style={styles.paneSection}>
                      <Text style={[styles.paneSectionHeading, { color: c.textPrimary }]}>Manufacturing Year</Text>
                      {yearOptions.map((y) => {
                        const selected = stagedMinYear === y.value;
                        return (
                          <TouchableOpacity
                            key={y.value}
                            style={[
                              styles.optionRow,
                              selected && [styles.optionRowSelected, { borderColor: '#8B5CF6', backgroundColor: isDark ? 'rgba(139, 92, 246, 0.1)' : '#F5F3FF' }],
                            ]}
                            onPress={() => setStagedMinYear(selected ? null : y.value)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.optionTitle, { color: c.textPrimary }, selected && { color: '#8B5CF6', fontWeight: '800' }]}>
                              {y.label}
                            </Text>
                            <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
                              {selected && <View style={styles.radioInnerDot} />}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {/* 4. KMS DRIVEN */}
                  {activeCategory === 'KMS' && (
                    <View style={styles.paneSection}>
                      <Text style={[styles.paneSectionHeading, { color: c.textPrimary }]}>Kilometres Driven</Text>
                      {kmOptions.map((k) => {
                        const selected = stagedMaxKm === k.value;
                        return (
                          <TouchableOpacity
                            key={k.value}
                            style={[
                              styles.optionRow,
                              selected && [styles.optionRowSelected, { borderColor: '#8B5CF6', backgroundColor: isDark ? 'rgba(139, 92, 246, 0.1)' : '#F5F3FF' }],
                            ]}
                            onPress={() => setStagedMaxKm(selected ? null : k.value)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.optionTitle, { color: c.textPrimary }, selected && { color: '#8B5CF6', fontWeight: '800' }]}>
                              {k.label}
                            </Text>
                            <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
                              {selected && <View style={styles.radioInnerDot} />}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {/* 5. FUEL TYPE (DYNAMIC MASTER DATA) */}
                  {activeCategory === 'FUEL' && (
                    <View style={styles.paneSection}>
                      <Text style={[styles.paneSectionHeading, { color: c.textPrimary }]}>Fuel Type</Text>
                      {availableFuelTypes.map((f) => {
                        const selected = stagedFuelType === f.key;
                        return (
                          <TouchableOpacity
                            key={f.key}
                            style={[
                              styles.checkboxRow,
                              selected && [styles.checkboxRowSelected, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.1)' : '#F5F3FF' }],
                            ]}
                            onPress={() => setStagedFuelType(selected ? '' : f.key)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.checkboxBox, selected && styles.checkboxBoxSelected]}>
                              {selected && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
                            </View>
                            <Text style={[styles.checkboxLabel, { color: c.textPrimary }, selected && { color: '#8B5CF6', fontWeight: '800' }]}>
                              {f.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {/* 6. BODY TYPE (DYNAMIC MASTER DATA) */}
                  {activeCategory === 'BODY' && (
                    <View style={styles.paneSection}>
                      <Text style={[styles.paneSectionHeading, { color: c.textPrimary }]}>Body Type</Text>
                      <View style={styles.chipsGrid}>
                        {availableBodyTypes.map((b) => {
                          const selected = stagedBodyType === b.key;
                          return (
                            <TouchableOpacity
                              key={b.key}
                              style={[
                                styles.bodyChipCard,
                                { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: c.border },
                                selected && [styles.bodyChipCardSelected, { borderColor: '#8B5CF6', backgroundColor: isDark ? 'rgba(139, 92, 246, 0.15)' : '#F5F3FF' }],
                              ]}
                              onPress={() => setStagedBodyType(selected ? '' : b.key)}
                              activeOpacity={0.7}
                            >
                              <Text style={{ fontSize: 24 }}>{b.icon}</Text>
                              <Text style={[styles.bodyChipLabel, { color: c.textPrimary }, selected && { color: '#8B5CF6', fontWeight: '800' }]}>
                                {b.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* 7. TRANSMISSION (DYNAMIC MASTER DATA) */}
                  {activeCategory === 'TRANSMISSION' && (
                    <View style={styles.paneSection}>
                      <Text style={[styles.paneSectionHeading, { color: c.textPrimary }]}>Transmission</Text>
                      {availableTransmissions.map((trans) => {
                        const selected = stagedTransmission === trans.key;
                        return (
                          <TouchableOpacity
                            key={trans.key}
                            style={[
                              styles.optionRow,
                              selected && [styles.optionRowSelected, { borderColor: '#8B5CF6', backgroundColor: isDark ? 'rgba(139, 92, 246, 0.1)' : '#F5F3FF' }],
                            ]}
                            onPress={() => setStagedTransmission(selected ? '' : trans.key)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.optionTitle, { color: c.textPrimary }, selected && { color: '#8B5CF6', fontWeight: '800' }]}>
                              {trans.label}
                            </Text>
                            <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
                              {selected && <View style={styles.radioInnerDot} />}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {/* 8. CAR CATEGORY */}
                  {activeCategory === 'CATEGORY' && (
                    <View style={styles.paneSection}>
                      <Text style={[styles.paneSectionHeading, { color: c.textPrimary }]}>V MOTIV Curations</Text>
                      {[
                        { key: 'ASSURED', title: 'V MOTIV Assured', desc: '180-pt certified with warranty' },
                        { key: 'PREMIUM', title: 'Premium Selection', desc: 'Single owner under 40k km' },
                        { key: 'BUDGET', title: 'Super Value', desc: 'Certified value under ₹6 Lakh' },
                      ].map((catItem) => {
                        const selected = stagedCategory === catItem.key;
                        return (
                          <TouchableOpacity
                            key={catItem.key}
                            style={[
                              styles.optionRow,
                              selected && [styles.optionRowSelected, { borderColor: '#8B5CF6', backgroundColor: isDark ? 'rgba(139, 92, 246, 0.1)' : '#F5F3FF' }],
                            ]}
                            onPress={() => setStagedCategory(selected ? '' : catItem.key)}
                            activeOpacity={0.7}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.optionTitle, { color: c.textPrimary }, selected && { color: '#8B5CF6', fontWeight: '800' }]}>
                                {catItem.title}
                              </Text>
                              <Text style={[styles.optionSub, { color: c.textMuted }]}>{catItem.desc}</Text>
                            </View>
                            <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
                              {selected && <View style={styles.radioInnerDot} />}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {/* 9. COLOR */}
                  {activeCategory === 'COLOR' && (
                    <View style={styles.paneSection}>
                      <Text style={[styles.paneSectionHeading, { color: c.textPrimary }]}>Exterior Color</Text>
                      {colorOptions.map((col) => {
                        const selected = stagedColor === col.name;
                        return (
                          <TouchableOpacity
                            key={col.name}
                            style={[
                              styles.checkboxRow,
                              selected && [styles.checkboxRowSelected, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.1)' : '#F5F3FF' }],
                            ]}
                            onPress={() => setStagedColor(selected ? '' : col.name)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.colorSwatchCircle, { backgroundColor: col.hex, borderColor: col.border }]} />
                            <Text style={[styles.checkboxLabel, { color: c.textPrimary }, selected && { color: '#8B5CF6', fontWeight: '800' }]}>
                              {col.name}
                            </Text>
                            {selected && (
                              <View style={{ marginLeft: 'auto' }}>
                                <Check size={16} color="#8B5CF6" />
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {/* 10. SAFETY & FEATURES */}
                  {activeCategory === 'FEATURES' && (
                    <View style={styles.paneSection}>
                      <Text style={[styles.paneSectionHeading, { color: c.textPrimary }]}>Features & Equipment</Text>
                      {featureOptions.map((feat) => {
                        const selected = stagedFeatures.includes(feat);
                        return (
                          <TouchableOpacity
                            key={feat}
                            style={[
                              styles.checkboxRow,
                              selected && [styles.checkboxRowSelected, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.1)' : '#F5F3FF' }],
                            ]}
                            onPress={() => {
                              if (selected) {
                                setStagedFeatures(stagedFeatures.filter((f) => f !== feat));
                              } else {
                                setStagedFeatures([...stagedFeatures, feat]);
                              }
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.checkboxBox, selected && styles.checkboxBoxSelected]}>
                              {selected && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
                            </View>
                            <Text style={[styles.checkboxLabel, { color: c.textPrimary }, selected && { color: '#8B5CF6', fontWeight: '800' }]}>
                              {feat}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </KeyboardScrollView>
              </View>
            </View>

            {/* Modal Sticky Bottom Bar with Vibrant Red/Magenta APPLY Button */}
            <View
              style={[
                styles.modalFooter,
                {
                  borderTopColor: c.border,
                  backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                  paddingBottom: safeBottom(insets.bottom, Platform.OS === 'android' ? 20 : 12),
                },
              ]}
            >
              <TouchableOpacity
                style={styles.spinnyApplyButton}
                onPress={handleApplyStaged}
                activeOpacity={0.85}
              >
                <Text style={styles.spinnyApplyButtonText}>
                  APPLY ({stagedMatchingCount} {stagedMatchingCount === 1 ? 'CAR' : 'CARS'})
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoider>
        </View>
      </Modal>
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
    gap: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  spinnyMainFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1.2,
    borderColor: '#8B5CF6',
    backgroundColor: '#F5F3FF',
  },
  spinnyMainFilterPillActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  spinnyMainFilterText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8B5CF6',
  },
  pill: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillActive: {},
  pillText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  pillTextActive: {
    fontWeight: '800',
  },
  spinnyCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: 4,
  },
  spinnyCountText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  saveSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
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

  // ==========================================
  // Spinny Filter Modal Styles
  // ==========================================
  modalRoot: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  clearAllBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8B5CF6',
    letterSpacing: 0.5,
  },
  modalBodyRow: {
    flex: 1,
    flexDirection: 'row',
  },
  modalLeftCol: {
    width: '38%',
    borderRightWidth: 1,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 6,
    position: 'relative',
  },
  categoryItemActive: {},
  categoryLeftIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3.5,
    backgroundColor: '#8B5CF6',
  },
  categoryLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 18,
  },
  categoryLabelActive: {
    fontWeight: '800',
  },
  categorySelectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8B5CF6',
    marginRight: 6,
  },
  newBadgePill: {
    backgroundColor: '#10B981',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  newBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  modalRightPane: {
    width: '62%',
  },
  rightPaneScroll: {
    padding: 16,
    paddingBottom: 36,
  },
  paneSection: {
    gap: 10,
  },
  paneSectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  paneSubSectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  optionRowSelected: {},
  optionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  optionSub: {
    fontSize: 11,
    marginTop: 2,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: '#8B5CF6',
  },
  radioInnerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#8B5CF6',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 6,
    gap: 10,
  },
  checkboxRowSelected: {},
  checkboxBox: {
    width: 19,
    height: 19,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxSelected: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  checkboxLabel: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 8,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 8,
  },
  chipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bodyChipCard: {
    width: '47%',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  bodyChipCardSelected: {},
  bodyChipLabel: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  colorSwatchCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  spinnyApplyButton: {
    backgroundColor: '#E11D48',
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  spinnyApplyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
