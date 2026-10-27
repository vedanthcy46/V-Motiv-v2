import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { useNavigation } from '@react-navigation/native';
import {
  ArrowLeft,
  Calendar,
  Car,
  Check,
  ChevronRight,
  Clock,
  Edit2,
  Gauge,
  Plus,
  Radio,
  Search,
  Star,
  Trash2,
  Wrench,
  X,
  Zap,
} from 'lucide-react-native';
import { useAppTheme, radius, space } from '../theme';
import { CarBrandLogo } from '../components/CarBrandLogo';
import { useKeyboard } from '../components/KeyboardAwareFormScreen';
import {
  archiveCustomerVehicle,
  createCustomerVehicle,
  fetchCustomerVehicles,
  updateCustomerVehicle,
  type CustomerVehicle,
} from '../services/service-api';
import {
  CAR_COLOURS,
  CAR_MAKES,
  MODELS_BY_MAKE,
  OWNERSHIP_TYPES,
  QUICK_YEARS,
  FUEL_TYPES,
  TRANSMISSIONS,
} from '../constants/car-catalog';

export function MyGarageScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { theme, isDark } = useAppTheme();
  const c = {
    ...theme.colors,
    text: theme.colors.textPrimary,
    textMuted: theme.colors.textSecondary,
    accent: theme.colors.brandAccent,
  };

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vehicles, setVehicles] = useState<CustomerVehicle[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<CustomerVehicle | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const modalScrollRef = useRef<ScrollView>(null);
  const { keyboardHeight, isKeyboardVisible } = useKeyboard();
  const screenHeight = Dimensions.get('window').height;

  const handleInputFocus = useCallback((yOffset: number) => {
    setTimeout(() => {
      modalScrollRef.current?.scrollTo({ y: yOffset, animated: true });
    }, 120);
  }, []);

  const activeSheetHeight = isKeyboardVisible
    ? Math.max(340, screenHeight - keyboardHeight - insets.top - (Platform.OS === 'ios' ? 20 : 30))
    : Math.min(screenHeight * 0.9, 780);

  // Form State
  const [makeSearch, setMakeSearch] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('2023');
  const [variant, setVariant] = useState('');
  const [fuelType, setFuelType] = useState('PETROL');
  const [transmission, setTransmission] = useState('MANUAL');
  const [color, setColor] = useState('White');
  const [regNumber, setRegNumber] = useState('');
  const [odometer, setOdometer] = useState('');
  const [ownership, setOwnership] = useState('OWNER');
  const [notes, setNotes] = useState('');

  const filteredMakes = useMemo(() => {
    const q = makeSearch.trim().toLowerCase();
    if (!q) return CAR_MAKES;
    return CAR_MAKES.filter(m => m.name.toLowerCase().includes(q));
  }, [makeSearch]);

  const suggestedModels = useMemo(() => {
    if (!make) return [];
    return MODELS_BY_MAKE[make] || [];
  }, [make]);

  const loadVehicles = useCallback(async () => {
    try {
      const data = await fetchCustomerVehicles();
      setVehicles(data);
    } catch (err: any) {
      console.warn('[GARAGE_FETCH_ERROR]', err?.message || err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadVehicles();
  }, [loadVehicles]);

  const openAddModal = () => {
    setEditingVehicle(null);
    setMakeSearch('');
    setMake('');
    setModel('');
    setYear('2023');
    setVariant('');
    setFuelType('PETROL');
    setTransmission('MANUAL');
    setColor('White');
    setRegNumber('');
    setOdometer('');
    setOwnership('OWNER');
    setNotes('');
    setModalVisible(true);
  };

  const openEditModal = (v: CustomerVehicle) => {
    setEditingVehicle(v);
    setMakeSearch('');
    setMake(v.make);
    setModel(v.model);
    setYear(v.year.toString());
    setVariant(v.variant || '');
    setFuelType(v.fuelType);
    setTransmission(v.transmission);
    setColor(v.color || 'White');
    setRegNumber(v.registrationNumber || '');
    setOdometer(v.odometerKm ? v.odometerKm.toString() : '');
    setOwnership(v.declaredOwnership || 'OWNER');
    setNotes(v.notes || '');
    setModalVisible(true);
  };

  const handleSaveVehicle = async () => {
    if (!make.trim()) {
      Alert.alert('Select Brand', 'Please select a car brand/make.');
      return;
    }
    if (!model.trim()) {
      Alert.alert('Enter Model', 'Please select or type your car model.');
      return;
    }
    const yearNum = parseInt(year, 10);
    const currentYear = new Date().getFullYear();
    if (!year.trim() || isNaN(yearNum) || yearNum < 1980 || yearNum > currentYear + 1) {
      Alert.alert(
        'Invalid Year',
        `Please select or type a valid 4-digit manufacturing year between 1980 and ${currentYear + 1}.`
      );
      return;
    }

    setSubmitting(true);
    try {
      if (editingVehicle) {
        await updateCustomerVehicle(editingVehicle.id, {
          variant: variant.trim() || undefined,
          color: color.trim() || undefined,
          registrationNumber: regNumber.trim().toUpperCase() || undefined,
          odometerKm: odometer ? parseInt(odometer, 10) : undefined,
          declaredOwnership: ownership,
          notes: notes.trim() || undefined,
        });
        Alert.alert('Vehicle Updated', 'Your car details have been saved.');
      } else {
        await createCustomerVehicle({
          make: make.trim(),
          model: model.trim(),
          year: yearNum,
          variant: variant.trim() || undefined,
          fuelType,
          transmission,
          color: color.trim() || undefined,
          registrationNumber: regNumber.trim().toUpperCase() || undefined,
          odometerKm: odometer ? parseInt(odometer, 10) : undefined,
          declaredOwnership: ownership,
          notes: notes.trim() || undefined,
        });
        Alert.alert('Car Added', 'Your car has been added to My Garage.');
      }
      setModalVisible(false);
      void loadVehicles();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not save vehicle.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetPreferred = async (vehicle: CustomerVehicle) => {
    if (vehicle.isPreferred) return;
    try {
      await updateCustomerVehicle(vehicle.id, { isPreferred: true });
      void loadVehicles();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to set as default car.');
    }
  };

  const handleArchive = (vehicle: CustomerVehicle) => {
    Alert.alert(
      'Archive Car',
      `Are you sure you want to remove ${vehicle.make} ${vehicle.model} from your active garage? Your service and invoice history will remain preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveCustomerVehicle(vehicle.id);
              void loadVehicles();
            } catch (err: any) {
              Alert.alert('Cannot Archive', err?.message || 'Failed to archive vehicle.');
            }
          },
        },
      ]
    );
  };

  const canGoBack = navigation.canGoBack();

  return (
    <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top }]}>
      {/* Top Navigation Bar */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <View style={styles.headerLeft}>
          {canGoBack && (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[styles.backBtn, { backgroundColor: c.surface }]}
            >
              <ArrowLeft size={20} color={c.text} />
            </TouchableOpacity>
          )}
          <Text style={[styles.headerTitle, { color: c.text }]}>My Garage</Text>
        </View>
        <TouchableOpacity
          onPress={openAddModal}
          style={[styles.addBtn, { backgroundColor: c.accent }]}
        >
          <Plus size={18} color="#061A38" />
          <Text style={styles.addBtnText}>Add Car</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={c.accent} />
            <Text style={[styles.loadingText, { color: c.textMuted }]}>Loading your garage...</Text>
          </View>
        ) : vehicles.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? '#162C4E' : '#EBF3FF' }]}>
              <Car size={40} color={c.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: c.text }]}>Your Garage is Empty</Text>
            <Text style={[styles.emptyDesc, { color: c.textMuted }]}>
              Add your cars to book seamless maintenance, monitor service history, and track live repair progress.
            </Text>
            <TouchableOpacity
              onPress={openAddModal}
              style={[styles.primaryActionBtn, { backgroundColor: c.accent }]}
            >
              <Plus size={20} color="#061A38" />
              <Text style={styles.primaryActionBtnText}>Add Your First Car</Text>
            </TouchableOpacity>
          </View>
        ) : (
          vehicles.map(v => (
            <View key={v.id} style={[styles.carCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              {/* Card Header */}
              <View style={styles.carHeaderRow}>
                <View style={styles.carBrandWrap}>
                  <CarBrandLogo brand={v.make} size={32} />
                  <View style={styles.carTitleWrap}>
                    <Text style={[styles.carTitle, { color: c.text }]}>
                      {v.make} {v.model}
                    </Text>
                    <Text style={[styles.carSubtitle, { color: c.textMuted }]}>
                      {v.year} {v.variant ? `· ${v.variant}` : ''}
                    </Text>
                  </View>
                </View>

                {v.isPreferred ? (
                  <View style={[styles.preferredPill, { backgroundColor: isDark ? '#1C3B24' : '#E8F5E9' }]}>
                    <Star size={12} color="#10B981" fill="#10B981" />
                    <Text style={styles.preferredText}>Default</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => handleSetPreferred(v)}
                    style={[styles.setDefaultBtn, { borderColor: c.border }]}
                  >
                    <Text style={[styles.setDefaultText, { color: c.textMuted }]}>Set Default</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Badges / Specs Row */}
              <View style={styles.specChipsRow}>
                {v.registrationNumber && (
                  <View style={[styles.specChip, { backgroundColor: isDark ? '#162C4E' : '#F1F5F9' }]}>
                    <Text style={[styles.specChipText, { color: c.text }]}>{v.registrationNumber}</Text>
                  </View>
                )}
                <View style={[styles.specChip, { backgroundColor: isDark ? '#162C4E' : '#F1F5F9' }]}>
                  <Text style={[styles.specChipText, { color: c.text }]}>{v.fuelType}</Text>
                </View>
                <View style={[styles.specChip, { backgroundColor: isDark ? '#162C4E' : '#F1F5F9' }]}>
                  <Text style={[styles.specChipText, { color: c.text }]}>{v.transmission}</Text>
                </View>
                {v.odometerKm && (
                  <View style={[styles.specChip, { backgroundColor: isDark ? '#162C4E' : '#F1F5F9' }]}>
                    <Text style={[styles.specChipText, { color: c.text }]}>{v.odometerKm.toLocaleString('en-IN')} km</Text>
                  </View>
                )}
                {v.color && (
                  <View style={[styles.specChip, { backgroundColor: isDark ? '#162C4E' : '#F1F5F9' }]}>
                    <Text style={[styles.specChipText, { color: c.text }]}>{v.color}</Text>
                  </View>
                )}
              </View>

              {/* Maintenance Metrics */}
              <View style={[styles.infoGrid, { borderTopColor: c.border }]}>
                <View style={styles.infoCol}>
                  <View style={styles.infoIconRow}>
                    <Clock size={14} color={c.textMuted} />
                    <Text style={[styles.infoLabel, { color: c.textMuted }]}>Next Service</Text>
                  </View>
                  <Text style={[styles.infoValue, { color: c.text }]}>
                    {v.nextServiceDueKm ? `At ${v.nextServiceDueKm.toLocaleString('en-IN')} km` : 'Every 10,000 km'}
                  </Text>
                </View>
              </View>

              {/* Active Service Banner */}
              {v.activeServiceRequest && (
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('ServiceRequestDetails', {
                      requestId: v.activeServiceRequest!.id,
                    })
                  }
                  style={[styles.activeBanner, { backgroundColor: isDark ? '#1A3358' : '#FFF9E6', borderColor: '#F7B503' }]}
                >
                  <View style={styles.activeBannerLeft}>
                    <Wrench size={16} color="#F7B503" />
                    <View style={styles.activeBannerTextWrap}>
                      <Text style={[styles.activeBannerTitle, { color: c.text }]}>
                        Service Active: {v.activeServiceRequest.status.replace(/_/g, ' ')}
                      </Text>
                      <Text style={[styles.activeBannerSub, { color: c.textMuted }]}>
                        {v.activeServiceRequest.requestNumber} · {v.activeServiceRequest.scheduledDate}
                      </Text>
                    </View>
                  </View>
                  <ChevronRight size={18} color="#F7B503" />
                </TouchableOpacity>
              )}

              {/* Card Actions */}
              <View style={[styles.cardFooter, { borderTopColor: c.border }]}>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('ServiceHome', { preselectedVehicleId: v.id })
                  }
                  style={[styles.bookServiceBtn, { backgroundColor: c.accent }]}
                >
                  <Wrench size={16} color="#061A38" />
                  <Text style={styles.bookServiceBtnText}>Book Service</Text>
                </TouchableOpacity>

                <View style={styles.subActionsRow}>
                  <TouchableOpacity
                    onPress={() => openEditModal(v)}
                    style={[styles.iconActionBtn, { borderColor: c.border }]}
                  >
                    <Edit2 size={16} color={c.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleArchive(v)}
                    style={[styles.iconActionBtn, { borderColor: c.border }]}
                  >
                    <Trash2 size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}

        {/* V MOTIV Connect™ Card (Part 3 Telematics Placeholder) */}
        <View style={[styles.connectCard, { backgroundColor: c.surface, borderColor: isDark ? '#1F3F6D' : '#DCE7F5' }]}>
          <View style={styles.connectHeaderRow}>
            <View style={styles.connectTitleRow}>
              <View style={[styles.connectIconWrap, { backgroundColor: '#F7B503' }]}>
                <Radio size={18} color="#061A38" />
              </View>
              <View>
                <Text style={[styles.connectTitle, { color: c.text }]}>V MOTIV Connect™</Text>
                <Text style={[styles.connectSubtitle, { color: c.textMuted }]}>
                  OBD-II Smart Vehicle Telematics
                </Text>
              </View>
            </View>
            <View style={[styles.connectBadge, { backgroundColor: isDark ? '#2A2E3D' : '#F1F5F9' }]}>
              <Text style={[styles.connectBadgeText, { color: c.textMuted }]}>COMING IN PART 3</Text>
            </View>
          </View>

          <Text style={[styles.connectDesc, { color: c.textMuted }]}>
            Live engine health diagnostics, instant battery voltage alerts, automated service reminders, and driving insights delivered straight to your phone.
          </Text>

          <View style={[styles.connectBtnDisabled, { backgroundColor: isDark ? '#14253E' : '#EDF2F7' }]}>
            <Zap size={14} color={c.textMuted} />
            <Text style={[styles.connectBtnDisabledText, { color: c.textMuted }]}>
              Hardware Pairing Reserved for Part 3
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Add / Edit Vehicle Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
        statusBarTranslucent={true}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setModalVisible(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
            style={[
              styles.keyboardAvoidWrap,
              Platform.OS === 'android' && isKeyboardVisible ? { marginBottom: keyboardHeight } : null,
            ]}
          >
            <View
              style={[
                styles.modalSheet,
                {
                  backgroundColor: c.surface,
                  height: activeSheetHeight,
                  paddingBottom: isKeyboardVisible ? 10 : Math.max(insets.bottom, 16),
                },
              ]}
            >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.text }]}>
                {editingVehicle ? 'Edit Vehicle Details' : 'Add Car to My Garage'}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={[styles.modalCloseText, { color: c.accent }]}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={modalScrollRef}
              style={styles.modalBody}
              contentContainerStyle={[
                styles.modalScrollContent,
                { paddingBottom: isKeyboardVisible ? 240 : 40 },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={true}
              automaticallyAdjustKeyboardInsets={true}
            >
              {/* SECTION 1: Brand Selection with Authentic Logos */}
              <View style={styles.formSection}>
                <Text style={[styles.label, { color: c.text }]}>Brand / Make *</Text>

                {make === '' ? (
                  <>
                    {/* Brand Search Box */}
                    <View style={[styles.searchBox, { backgroundColor: isDark ? '#142742' : '#F1F5F9', borderColor: c.border }]}>
                      <Search size={16} color={c.textMuted} />
                      <TextInput
                        style={[styles.searchInput, { color: c.text }]}
                        placeholder="Search brand (e.g. Maruti, Hyundai, Tata, BYD)..."
                        placeholderTextColor={c.textMuted}
                        value={makeSearch}
                        onChangeText={setMakeSearch}
                        onFocus={() => handleInputFocus(0)}
                        autoCapitalize="words"
                        returnKeyType="search"
                      />
                    </View>

                    {/* 28 Brands Grid (Authentic Brand Logos) */}
                    <View style={styles.brandGrid}>
                      {filteredMakes.map(m => (
                        <TouchableOpacity
                          key={m.name}
                          onPress={() => {
                            setMake(m.name);
                            setModel('');
                            setMakeSearch('');
                          }}
                          style={[
                            styles.brandCard,
                            {
                              backgroundColor: isDark ? '#162C4E' : '#FFFFFF',
                              borderColor: isDark ? 'rgba(255,255,255,0.12)' : c.border,
                            },
                          ]}
                        >
                          <CarBrandLogo brand={m.name} size={36} disableBadgeBg />
                          <Text numberOfLines={1} style={[styles.brandCardText, { color: c.text }]}>
                            {m.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      {filteredMakes.length === 0 && (
                        <Text style={[styles.noResults, { color: c.textMuted }]}>
                          No brands match "{makeSearch}". Type custom name below:
                        </Text>
                      )}
                    </View>

                    {makeSearch.trim() !== '' && filteredMakes.length === 0 && (
                      <TouchableOpacity
                        style={[styles.customBrandBtn, { borderColor: c.accent, backgroundColor: isDark ? '#162C4E' : '#FFF9E6' }]}
                        onPress={() => {
                          setMake(makeSearch.trim());
                          setMakeSearch('');
                        }}
                      >
                        <Text style={[styles.customBrandBtnText, { color: c.accent }]}>
                          Use "{makeSearch.trim()}" as Brand
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  /* Once selected: Collapse/close all brands and show selected brand card with Change button */
                  <View style={[styles.selectedBrandBanner, { backgroundColor: isDark ? '#162C4E' : '#FFF9E6', borderColor: c.accent }]}>
                    <View style={styles.selectedBrandLeft}>
                      <CarBrandLogo brand={make} size={36} isSelected={true} />
                      <View style={{ marginLeft: 12 }}>
                        <Text style={[styles.selectedBrandLabel, { color: c.textMuted }]}>Selected Brand</Text>
                        <Text style={[styles.selectedBrandName, { color: c.text }]}>{make}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        setMake('');
                        setModel('');
                        setMakeSearch('');
                      }}
                      style={[styles.changeBrandBtn, { backgroundColor: isDark ? '#0F2038' : '#FFFFFF', borderColor: c.border }]}
                    >
                      <Text style={[styles.changeBrandText, { color: c.accent }]}>Change</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* SECTION 2: Model Selection */}
              {make !== '' && (
                <View style={styles.formSection}>
                  <Text style={[styles.label, { color: c.text }]}>Car Model *</Text>
                  {suggestedModels.length > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.modelsRow}
                    >
                      {suggestedModels.map(m => {
                        const isSelected = model.toLowerCase() === m.toLowerCase();
                        return (
                          <TouchableOpacity
                            key={m}
                            onPress={() => setModel(m)}
                            style={[
                              styles.modelChip,
                              {
                                backgroundColor: isSelected ? c.accent : (isDark ? '#162C4E' : '#F1F5F9'),
                                borderColor: isSelected ? c.accent : c.border,
                              },
                            ]}
                          >
                            <Text style={[styles.modelChipText, { color: isSelected ? '#061A38' : c.text }]}>
                              {m}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}
                  <TextInput
                    value={model}
                    onChangeText={setModel}
                    onFocus={() => handleInputFocus(120)}
                    placeholder="e.g. Creta, Swift, Nexon, Innova Crysta..."
                    placeholderTextColor={c.textMuted}
                    style={[styles.input, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
                  />
                </View>
              )}

              {/* SECTION 3: Manufacturing Year (Quick Chips + Manual Type Input) */}
              <View style={styles.formSection}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.label, { color: c.text }]}>Manufacturing Year *</Text>
                  {year !== '' && (
                    <View style={[styles.selectedYearBadge, { backgroundColor: isDark ? '#1C3B24' : '#E8F5E9' }]}>
                      <Text style={styles.selectedYearBadgeText}>
                        Year: {year}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Quick Selection Chips */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.yearsRow}
                >
                  {QUICK_YEARS.map(y => {
                    const isSelected = year === y;
                    return (
                      <TouchableOpacity
                        key={y}
                        onPress={() => setYear(y)}
                        style={[
                          styles.yearChip,
                          {
                            backgroundColor: isSelected ? c.accent : (isDark ? '#162C4E' : '#F1F5F9'),
                            borderColor: isSelected ? c.accent : c.border,
                          },
                        ]}
                      >
                        <Text style={[styles.yearChipText, { color: isSelected ? '#061A38' : c.text }]}>
                          {y}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Manual Manufacture Year Input */}
                <View style={[styles.manualYearBox, { backgroundColor: c.background, borderColor: c.border }]}>
                  <Calendar size={18} color={c.textMuted} />
                  <TextInput
                    value={year}
                    onChangeText={txt => {
                      const cleaned = txt.replace(/[^0-9]/g, '').slice(0, 4);
                      setYear(cleaned);
                    }}
                    onFocus={() => handleInputFocus(220)}
                    keyboardType="number-pad"
                    maxLength={4}
                    placeholder="Or type manufacture year manually (e.g. 2018)"
                    placeholderTextColor={c.textMuted}
                    style={[styles.manualYearInput, { color: c.text }]}
                  />
                  {year !== '' && (
                    <TouchableOpacity
                      onPress={() => setYear('')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={16} color={c.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* SECTION 4: Fuel Type */}
              <View style={styles.formSection}>
                <Text style={[styles.label, { color: c.text }]}>Fuel Type</Text>
                <View style={styles.pillSelectorRow}>
                  {FUEL_TYPES.map(f => {
                    const isSelected = fuelType === f.value;
                    return (
                      <TouchableOpacity
                        key={f.value}
                        onPress={() => setFuelType(f.value)}
                        style={[
                          styles.pillOption,
                          {
                            backgroundColor: isSelected ? c.accent : (isDark ? '#162C4E' : '#F1F5F9'),
                            borderColor: isSelected ? c.accent : c.border,
                          },
                        ]}
                      >
                        <Text style={[styles.pillOptionText, { color: isSelected ? '#061A38' : c.text }]}>
                          {f.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* SECTION 5: Transmission */}
              <View style={styles.formSection}>
                <Text style={[styles.label, { color: c.text }]}>Transmission</Text>
                <View style={styles.pillSelectorRow}>
                  {TRANSMISSIONS.map(t => {
                    const isSelected = transmission === t.value;
                    return (
                      <TouchableOpacity
                        key={t.value}
                        onPress={() => setTransmission(t.value)}
                        style={[
                          styles.pillOption,
                          {
                            backgroundColor: isSelected ? c.accent : (isDark ? '#162C4E' : '#F1F5F9'),
                            borderColor: isSelected ? c.accent : c.border,
                          },
                        ]}
                      >
                        <Text style={[styles.pillOptionText, { color: isSelected ? '#061A38' : c.text }]}>
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* SECTION 6: Vehicle Colour (Visual Swatches) */}
              <View style={styles.formSection}>
                <Text style={[styles.label, { color: c.text }]}>Vehicle Colour</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.colorsRow}
                >
                  {CAR_COLOURS.map(item => {
                    const isSelected = color.toLowerCase() === item.name.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={item.name}
                        onPress={() => setColor(item.name)}
                        style={styles.colorSwatchWrap}
                      >
                        <View
                          style={[
                            styles.colorCircle,
                            {
                              backgroundColor: item.hex,
                              borderColor: isSelected
                                ? c.accent
                                : (item.borderOnly ? (isDark ? '#555' : '#D1D5DB') : 'rgba(0,0,0,0.12)'),
                              borderWidth: isSelected ? 3 : 1.5,
                              transform: [{ scale: isSelected ? 1.08 : 1 }],
                            },
                          ]}
                        >
                          {isSelected && (
                            <Check
                              size={14}
                              color={item.hex === '#FFFFFF' || item.hex === '#C0C0C0' || item.hex === '#C89B3C' ? '#061A38' : '#FFFFFF'}
                              strokeWidth={3}
                            />
                          )}
                        </View>
                        <Text numberOfLines={1} style={[styles.colorName, { color: isSelected ? c.accent : c.textMuted }]}>
                          {item.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <TextInput
                  value={color}
                  onChangeText={setColor}
                  onFocus={() => handleInputFocus(380)}
                  placeholder="Or enter custom colour (e.g. Polar White, Abyss Black)"
                  placeholderTextColor={c.textMuted}
                  style={[styles.input, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
                />
              </View>

              {/* SECTION 7: Registration Number & Current Odometer */}
              <View style={styles.inputRow}>
                <View style={styles.inputHalf}>
                  <Text style={[styles.label, { color: c.text }]}>Registration Number</Text>
                  <TextInput
                    value={regNumber}
                    onChangeText={txt => setRegNumber(txt.toUpperCase())}
                    onFocus={() => handleInputFocus(500)}
                    autoCapitalize="characters"
                    placeholder="TN 09 BK 1234"
                    placeholderTextColor={c.textMuted}
                    style={[styles.input, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
                  />
                </View>
                <View style={styles.inputHalf}>
                  <Text style={[styles.label, { color: c.text }]}>Current Odometer (km)</Text>
                  <TextInput
                    value={odometer}
                    onChangeText={setOdometer}
                    onFocus={() => handleInputFocus(560)}
                    keyboardType="number-pad"
                    placeholder="e.g. 28000"
                    placeholderTextColor={c.textMuted}
                    style={[styles.input, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
                  />
                </View>
              </View>

              {/* SECTION 8: Ownership Status */}
              <View style={styles.formSection}>
                <Text style={[styles.label, { color: c.text }]}>Ownership Relationship</Text>
                <View style={styles.pillSelectorRow}>
                  {OWNERSHIP_TYPES.map(o => {
                    const isSelected = ownership === o.value;
                    return (
                      <TouchableOpacity
                        key={o.value}
                        onPress={() => setOwnership(o.value)}
                        style={[
                          styles.pillOption,
                          {
                            backgroundColor: isSelected ? c.accent : (isDark ? '#162C4E' : '#F1F5F9'),
                            borderColor: isSelected ? c.accent : c.border,
                          },
                        ]}
                      >
                        <Text style={[styles.pillOptionText, { color: isSelected ? '#061A38' : c.text }]}>
                          {o.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* SECTION 9: Notes */}
              <View style={styles.formSection}>
                <Text style={[styles.label, { color: c.text }]}>Notes / Special Preferences</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  onFocus={() => handleInputFocus(720)}
                  placeholder="e.g. Prefers synthetic oil, custom sound system installed..."
                  placeholderTextColor={c.textMuted}
                  multiline
                  numberOfLines={3}
                  style={[styles.textArea, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
                />
              </View>

              {/* Save Button */}
              <TouchableOpacity
                onPress={handleSaveVehicle}
                disabled={submitting}
                style={[styles.saveBtn, { backgroundColor: c.accent }]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#061A38" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {editingVehicle ? 'Update Vehicle' : 'Save Car to Garage'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#061A38',
  },
  scrollContent: {
    padding: space.lg,
    gap: space.lg,
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyBox: {
    padding: 32,
    borderRadius: radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    gap: 16,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  emptyDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: radius.pill,
    marginTop: 8,
  },
  primaryActionBtnText: {
    color: '#061A38',
    fontSize: 15,
    fontWeight: '700',
  },
  carCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.lg,
    gap: space.md,
  },
  carHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  carBrandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  carTitleWrap: {
    gap: 2,
  },
  carTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  carSubtitle: {
    fontSize: 13,
  },
  preferredPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  preferredText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
  setDefaultBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  setDefaultText: {
    fontSize: 11,
    fontWeight: '600',
  },
  specChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  specChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  specChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoGrid: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.md,
  },
  infoCol: {
    flex: 1,
    gap: 4,
  },
  infoIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  activeBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  activeBannerTextWrap: {
    flex: 1,
  },
  activeBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  activeBannerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.md,
  },
  bookServiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  bookServiceBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#061A38',
  },
  subActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconActionBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.lg,
    gap: 12,
  },
  connectHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  connectTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  connectSubtitle: {
    fontSize: 12,
  },
  connectBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  connectBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  connectDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  connectBtnDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  connectBtnDisabledText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  keyboardAvoidWrap: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: space.lg,
    width: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalBody: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: 40,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  selectedYearBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  selectedYearBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
  manualYearBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  manualYearInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  formSection: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  brandGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  brandCard: {
    width: '23%',
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    gap: 4,
  },
  brandCardText: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  noResults: {
    fontSize: 13,
    marginVertical: 12,
  },
  customBrandBtn: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 6,
  },
  customBrandBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  selectedBrandBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  selectedBrandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectedBrandLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  selectedBrandName: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 2,
  },
  changeBrandBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  changeBrandText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modelsRow: {
    gap: 8,
    paddingBottom: 8,
  },
  modelChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  modelChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  yearsRow: {
    gap: 8,
    paddingBottom: 4,
  },
  yearChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  yearChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pillSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pillOption: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pillOptionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  colorsRow: {
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  colorSwatchWrap: {
    alignItems: 'center',
    gap: 4,
  },
  colorCircle: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  colorName: {
    fontSize: 10,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  inputHalf: {
    flex: 1,
  },
  input: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  textArea: {
    minHeight: 70,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  saveBtn: {
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  saveBtnText: {
    color: '#061A38',
    fontSize: 15,
    fontWeight: '700',
  },
});
