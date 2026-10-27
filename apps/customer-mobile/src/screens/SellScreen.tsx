import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Home,
  IndianRupee,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react-native';
import { customer } from '../services/customer';
import { useAuth } from '../auth/AuthProvider';
import { color, radius, space } from '../theme';
import { friendlyError } from '../format';
import type { CustomerAddress, SupportedCity } from '../types';

// ─── Draft ─────────────────────────────────────────────────────────────────
const DRAFT_KEY = 'vmotiv.v2.sell-draft';

// ─── Static data ───────────────────────────────────────────────────────────
const FUEL_TYPES = [
  { value: 'PETROL', label: 'Petrol' },
  { value: 'DIESEL', label: 'Diesel' },
  { value: 'CNG', label: 'CNG' },
  { value: 'ELECTRIC', label: 'Electric' },
  { value: 'HYBRID', label: 'Hybrid' },
];

const TRANSMISSIONS = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'AUTOMATIC', label: 'Automatic' },
];

const OWNERSHIPS = [
  { value: '1', label: '1st Owner' },
  { value: '2', label: '2nd Owner' },
  { value: '3', label: '3rd Owner' },
  { value: '4', label: '4+ Owners' },
];

const TIME_SLOTS = ['10:00-12:00', '12:00-14:00', '14:00-16:00', '16:00-18:00'] as const;

// ─── Car brands (Indian market — text labels, no external images needed) ───
const MAKES = [
  { name: 'Maruti Suzuki', emoji: '🚗' },
  { name: 'Hyundai', emoji: '🚙' },
  { name: 'Tata', emoji: '🚘' },
  { name: 'Mahindra', emoji: '🛻' },
  { name: 'Honda', emoji: '🚗' },
  { name: 'Toyota', emoji: '🚙' },
  { name: 'Kia', emoji: '🚗' },
  { name: 'Renault', emoji: '🚙' },
  { name: 'Skoda', emoji: '🚗' },
  { name: 'Volkswagen', emoji: '🚗' },
  { name: 'Ford', emoji: '🚙' },
  { name: 'MG', emoji: '🚗' },
  { name: 'Jeep', emoji: '🛻' },
  { name: 'BMW', emoji: '🚗' },
  { name: 'Mercedes', emoji: '🚙' },
  { name: 'Audi', emoji: '🚗' },
];

// Popular models per make for fast selection
const MODELS_BY_MAKE: Record<string, string[]> = {
  'Maruti Suzuki': ['Swift', 'Baleno', 'Dzire', 'Vitara Brezza', 'Ertiga', 'Alto', 'WagonR', 'Celerio', 'Ciaz', 'S-Cross', 'Ignis', 'XL6', 'Grand Vitara', 'Fronx', 'Jimny'],
  'Hyundai': ['Creta', 'Venue', 'i20', 'i10', 'Verna', 'Tucson', 'Alcazar', 'Aura', 'Exter', 'Grand i10 Nios'],
  'Tata': ['Nexon', 'Harrier', 'Safari', 'Altroz', 'Tiago', 'Tigor', 'Punch', 'Curvv', 'Nexon EV', 'Tiago EV'],
  'Mahindra': ['XUV700', 'XUV300', 'Thar', 'Scorpio', 'Bolero', 'KUV100', 'Marazzo', 'Alturas G4', 'XUV400', 'BE 6e'],
  'Honda': ['City', 'Amaze', 'Jazz', 'WR-V', 'Elevate', 'BR-V'],
  'Toyota': ['Innova Crysta', 'Fortuner', 'Corolla', 'Camry', 'Urban Cruiser', 'Glanza', 'Hyryder', 'Vellfire'],
  'Kia': ['Seltos', 'Sonet', 'Carens', 'EV6'],
  'Renault': ['Kwid', 'Triber', 'Duster', 'Kiger'],
  'Skoda': ['Octavia', 'Superb', 'Kushaq', 'Slavia', 'Kodiaq'],
  'Volkswagen': ['Polo', 'Vento', 'Taigun', 'Virtus', 'Tiguan'],
  'Ford': ['EcoSport', 'Figo', 'Aspire', 'Endeavour', 'Freestyle'],
  'MG': ['Hector', 'Gloster', 'Astor', 'ZS EV', 'Comet EV'],
  'Jeep': ['Compass', 'Wrangler', 'Grand Cherokee', 'Meridian'],
  'BMW': ['3 Series', '5 Series', 'X1', 'X3', 'X5', '7 Series'],
  'Mercedes': ['C-Class', 'E-Class', 'GLA', 'GLC', 'GLE', 'S-Class'],
  'Audi': ['A4', 'A6', 'Q3', 'Q5', 'Q7', 'A8'],
};

// Colour options with swatch hex values
const COLOUR_OPTIONS = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Silver', hex: '#C0C0C0' },
  { name: 'Grey', hex: '#808080' },
  { name: 'Black', hex: '#1A1A1A' },
  { name: 'Red', hex: '#CC2200' },
  { name: 'Blue', hex: '#1A4DA0' },
  { name: 'Dark Blue', hex: '#0A1F5C' },
  { name: 'Brown', hex: '#7B4F2E' },
  { name: 'Maroon', hex: '#6B1414' },
  { name: 'Gold', hex: '#C89B3C' },
  { name: 'Green', hex: '#2E6B3C' },
  { name: 'Orange', hex: '#D45A00' },
];

// Generate year list from current year down to 1990
const currentYear = new Date().getFullYear();
const YEARS: string[] = [];
for (let y = currentYear + 1; y >= 1990; y--) YEARS.push(String(y));

function generateMutationKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Sub-components ────────────────────────────────────────────────────────

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

// ─── Main component ────────────────────────────────────────────────────────

export function SellScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [cities, setCities] = useState<SupportedCity[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submittedLead, setSubmittedLead] = useState<any | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(generateMutationKey);
  const scrollRef = useRef<ScrollView>(null);

  // Brand search filter
  const [makeSearch, setMakeSearch] = useState('');

  // Step 1 – vehicle identity
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [variant, setVariant] = useState('');
  const [manufacturingYear, setManufacturingYear] = useState('');

  // Step 2 – running & ownership
  const [odometerKm, setOdometerKm] = useState('');
  const [fuelType, setFuelType] = useState('PETROL');
  const [transmission, setTransmission] = useState('MANUAL');
  const [ownershipCount, setOwnershipCount] = useState('1');
  const [registrationYear, setRegistrationYear] = useState('');
  const [registrationCity, setRegistrationCity] = useState('');
  const [colorName, setColorName] = useState('');

  // Step 3 – condition
  const [loanOutstanding, setLoanOutstanding] = useState(false);
  const [accidentHistory, setAccidentHistory] = useState<'NO' | 'YES' | 'NOT_SURE'>('NO');
  const [serviceHistory, setServiceHistory] = useState<'COMPLETE' | 'PARTIAL' | 'NOT_SURE'>('COMPLETE');
  const [sellerNotes, setSellerNotes] = useState('');

  // Step 4 – price
  const [expectedLakhs, setExpectedLakhs] = useState('');

  // Step 5 – contact & location
  const [sellerName, setSellerName] = useState(user?.displayName || '');
  const [sellerPhone, setSellerPhone] = useState(user?.phone?.replace(/^\+91/, '') || '');
  const [city, setCity] = useState(user?.preferredCity || '');
  const [pincode, setPincode] = useState('');

  // Step 6 – inspection
  const [inspectionLocationType, setInspectionLocationType] = useState<'HUB' | 'HOME'>('HUB');
  const [inspectionDate, setInspectionDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [inspectionTimeSlot, setInspectionTimeSlot] = useState<typeof TIME_SLOTS[number]>('10:00-12:00');
  const [inspectionAddress, setInspectionAddress] = useState('');

  // Scroll to top on step change
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    setError('');
  }, [step]);

  // Hydrate draft
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!raw) return;
      try {
        const d = JSON.parse(raw);
        if (d.make) setMake(d.make);
        if (d.model) setModel(d.model);
        if (d.variant) setVariant(d.variant);
        if (d.manufacturingYear) setManufacturingYear(d.manufacturingYear);
        if (d.odometerKm) setOdometerKm(d.odometerKm);
        if (d.fuelType) setFuelType(d.fuelType);
        if (d.transmission) setTransmission(d.transmission);
        if (d.ownershipCount) setOwnershipCount(d.ownershipCount);
        if (d.registrationYear) setRegistrationYear(d.registrationYear);
        if (d.registrationCity) setRegistrationCity(d.registrationCity);
        if (d.colorName) setColorName(d.colorName);
        if (d.loanOutstanding !== undefined) setLoanOutstanding(d.loanOutstanding);
        if (d.accidentHistory) setAccidentHistory(d.accidentHistory);
        if (d.serviceHistory) setServiceHistory(d.serviceHistory);
        if (d.sellerNotes) setSellerNotes(d.sellerNotes);
        if (d.expectedLakhs) setExpectedLakhs(d.expectedLakhs);
        if (d.sellerName) setSellerName(d.sellerName);
        if (d.sellerPhone) setSellerPhone(d.sellerPhone);
        if (d.city) setCity(d.city);
        if (d.pincode) setPincode(d.pincode);
        if (d.inspectionLocationType) setInspectionLocationType(d.inspectionLocationType);
        if (d.inspectionDate) setInspectionDate(d.inspectionDate);
        if (d.inspectionTimeSlot) setInspectionTimeSlot(d.inspectionTimeSlot);
        if (d.inspectionAddress) setInspectionAddress(d.inspectionAddress);
      } catch {}
    });

    customer.cities().then(setCities).catch(() => {});
    customer.addresses().then((data) => setSavedAddresses(data as CustomerAddress[])).catch(() => {});
  }, []);

  // Auto-save draft (debounced)
  useEffect(() => {
    if (submittedLead) return;
    const timer = setTimeout(() => {
      const draft = {
        make, model, variant, manufacturingYear, odometerKm, fuelType, transmission,
        ownershipCount, registrationYear, registrationCity, colorName, loanOutstanding,
        accidentHistory, serviceHistory, sellerNotes, expectedLakhs, sellerName,
        sellerPhone, city, pincode, inspectionLocationType, inspectionDate,
        inspectionTimeSlot, inspectionAddress,
      };
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [
    make, model, variant, manufacturingYear, odometerKm, fuelType, transmission,
    ownershipCount, registrationYear, registrationCity, colorName, loanOutstanding,
    accidentHistory, serviceHistory, sellerNotes, expectedLakhs, sellerName,
    sellerPhone, city, pincode, inspectionLocationType, inspectionDate,
    inspectionTimeSlot, inspectionAddress, submittedLead,
  ]);

  const validateStep = (s: number): boolean => {
    setError('');
    if (s === 1) {
      const y = Number(manufacturingYear);
      if (!make.trim() || !model.trim()) {
        setError('Please select a brand and enter the model name.');
        return false;
      }
      if (!y || y < 1990 || y > currentYear + 1) {
        setError('Please select a valid manufacturing year.');
        return false;
      }
    }
    if (s === 2) {
      const odo = Number(odometerKm);
      if (isNaN(odo) || odo < 0) {
        setError('Please enter a valid odometer reading in kilometres.');
        return false;
      }
    }
    if (s === 5) {
      if (!sellerName.trim() || !/^[6-9]\d{9}$/.test(sellerPhone.trim())) {
        setError('Please enter your full name and a valid 10-digit Indian mobile number.');
        return false;
      }
      if (!city.trim() || (cities.length > 0 && !cities.some((c) => c.name.toLowerCase() === city.toLowerCase()))) {
        setError('Please select a supported city from the list.');
        return false;
      }
      if (!/^\d{6}$/.test(pincode.trim())) {
        setError('Please enter a valid 6-digit postal pincode.');
        return false;
      }
    }
    if (s === 6) {
      if (inspectionLocationType === 'HOME' && (!inspectionAddress.trim() || inspectionAddress.trim().length < 10)) {
        setError('Please enter your full doorstep address (at least 10 characters).');
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(step)) setStep((curr) => Math.min(7, curr + 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(5) || !validateStep(6)) return;
    setBusy(true);
    setError('');
    try {
      const year = Number(manufacturingYear.toString().trim());
      const odo = Number(odometerKm.toString().replace(/,/g, '').trim());
      const parsedLakhs = expectedLakhs ? parseFloat(expectedLakhs) : NaN;
      const expectedPaise = !isNaN(parsedLakhs) && parsedLakhs > 0 ? Math.round(parsedLakhs * 10_000_000) : undefined;
      const cleanPhone = sellerPhone.replace(/\D/g, '').replace(/^91/, '');
      const formattedPhone = cleanPhone.length === 10 ? `+91${cleanPhone}` : `+91${sellerPhone.trim().replace(/^\+91/, '')}`;

      const result = await customer.sell({
        sellerName: sellerName.trim(),
        sellerPhone: formattedPhone,
        city: city.trim(),
        pincode: pincode.trim(),
        make: make.trim(),
        model: model.trim(),
        variant: variant.trim() || undefined,
        manufacturingYear: year,
        fuelType: fuelType.toUpperCase(),
        transmission: transmission.toUpperCase(),
        odometerKm: odo,
        expectedPricePaise: expectedPaise,
        ownershipCount: Number(ownershipCount) || 1,
        registrationYear: registrationYear && !isNaN(Number(registrationYear)) ? Number(registrationYear) : undefined,
        color: colorName.trim() || undefined,
        registrationCity: registrationCity.trim() || undefined,
        loanOutstanding,
        accidentHistory,
        serviceHistory,
        sellerNotes: sellerNotes.trim() || undefined,
        inspectionDate,
        inspectionTimeSlot,
        inspectionLocationType,
        inspectionAddress: inspectionLocationType === 'HOME' ? inspectionAddress.trim() : undefined,
        idempotencyKey,
      });

      setSubmittedLead(result);
      await AsyncStorage.removeItem(DRAFT_KEY);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (submittedLead) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.successContainer}>
          <CheckCircle2 size={72} color="#22C55E" />
          <Text style={styles.successTitle}>Request Submitted!</Text>
          <Text style={styles.successRef}>
            Ref: {submittedLead.referenceCode?.slice(0, 8).toUpperCase()}
          </Text>
          <Text style={styles.successBody}>
            We have scheduled your evaluation for {submittedLead.manufacturingYear} {submittedLead.make}{' '}
            {submittedLead.model} on {inspectionDate}, {inspectionTimeSlot}.
          </Text>
          <View style={styles.successActions}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('Tabs', { screen: 'Activity' })}
            >
              <Text style={styles.primaryBtnText}>View in Activity</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                setSubmittedLead(null);
                setStep(1);
                setIdempotencyKey(generateMutationKey());
              }}
            >
              <Text style={styles.secondaryBtnText}>Sell Another Vehicle</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Filtered makes for search ─────────────────────────────────────────────
  const filteredMakes = makeSearch.trim()
    ? MAKES.filter((m) => m.name.toLowerCase().includes(makeSearch.toLowerCase()))
    : MAKES;

  const suggestedModels = make ? (MODELS_BY_MAKE[make] || []) : [];

  // ── Wizard ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={step > 1 ? 'Back' : 'Close'}
            onPress={() => (step > 1 ? setStep(step - 1) : navigation.goBack())}
            style={styles.backBtn}
          >
            <ChevronLeft size={24} color={color.white} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Sell Your Car</Text>
            <Text style={styles.stepCounter}>Step {step} of 7</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* Progress bar */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(step / 7) * 100}%` as any }]} />
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, space.md) + 80 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* ══════════════════════════════════════════════════
              STEP 1 — Vehicle Brand, Model, Year
          ══════════════════════════════════════════════════ */}
          {step === 1 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>What car are you selling?</Text>
              <Text style={styles.stepDesc}>Select a brand, then tell us the model and year.</Text>

              {/* Brand grid */}
              <View style={styles.fieldGroup}>
                <SectionLabel>Brand / Make *</SectionLabel>

                {/* Search box */}
                <View style={styles.searchBox}>
                  <Search size={16} color={color.muted} accessibilityElementsHidden />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search brand…"
                    placeholderTextColor={color.muted}
                    value={makeSearch}
                    onChangeText={setMakeSearch}
                    autoCapitalize="words"
                    returnKeyType="search"
                    accessibilityLabel="Search car brand"
                  />
                </View>

                <View style={styles.brandGrid}>
                  {filteredMakes.map((m) => {
                    const selected = make === m.name;
                    return (
                      <Pressable
                        key={m.name}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={m.name}
                        onPress={() => {
                          setMake(m.name);
                          setModel(''); // reset model when brand changes
                          setMakeSearch('');
                        }}
                        style={({ pressed }) => [
                          styles.brandCard,
                          selected && styles.brandCardSelected,
                          pressed && { opacity: 0.75 },
                        ]}
                      >
                        <Text style={styles.brandEmoji}>{m.emoji}</Text>
                        <Text
                          style={[styles.brandName, selected && styles.brandNameSelected]}
                          numberOfLines={2}
                          adjustsFontSizeToFit
                        >
                          {m.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {filteredMakes.length === 0 && (
                    <Text style={styles.noResults}>
                      No brands match "{makeSearch}". You can type it directly in the model field below.
                    </Text>
                  )}
                </View>

                {/* If brand not in list, allow free-text */}
                {makeSearch.trim() !== '' && filteredMakes.length === 0 && (
                  <TouchableOpacity
                    style={styles.freeTextBtn}
                    onPress={() => {
                      setMake(makeSearch.trim());
                      setMakeSearch('');
                    }}
                  >
                    <Text style={styles.freeTextBtnLabel}>Use "{makeSearch.trim()}" as brand</Text>
                  </TouchableOpacity>
                )}

                {make !== '' && (
                  <View style={styles.selectedChip}>
                    <Text style={styles.selectedChipText}>✓ {make}</Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Clear brand selection"
                      onPress={() => { setMake(''); setModel(''); }}
                    >
                      <Text style={styles.selectedChipClear}>✕</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Model */}
              <View style={styles.fieldGroup}>
                <SectionLabel>Model *</SectionLabel>

                {/* Suggested model pills */}
                {suggestedModels.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingBottom: 10, paddingTop: 2 }}
                  >
                    {suggestedModels.map((m) => (
                      <TouchableOpacity
                        key={m}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: model === m }}
                        accessibilityLabel={m}
                        style={[styles.modelPill, model === m && styles.modelPillActive]}
                        onPress={() => setModel(m)}
                      >
                        <Text style={[styles.modelPillText, model === m && styles.modelPillTextActive]}>
                          {m}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                <TextInput
                  style={styles.input}
                  placeholder={
                    make
                      ? `e.g. ${suggestedModels[0] || 'Nexon, Creta, Swift'}`
                      : 'Select a brand first, then enter model'
                  }
                  placeholderTextColor={color.muted}
                  value={model}
                  onChangeText={setModel}
                  autoCapitalize="words"
                  returnKeyType="next"
                  accessibilityLabel="Car model"
                />
              </View>

              {/* Variant */}
              <View style={styles.fieldGroup}>
                <SectionLabel>Variant (optional)</SectionLabel>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. XZ+ (O), SX AT, ZXi"
                  placeholderTextColor={color.muted}
                  value={variant}
                  onChangeText={setVariant}
                  autoCapitalize="characters"
                  returnKeyType="next"
                  accessibilityLabel="Car variant"
                />
              </View>

              {/* Manufacturing Year */}
              <View style={styles.fieldGroup}>
                <SectionLabel>Manufacturing Year *</SectionLabel>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                >
                  {YEARS.slice(0, 20).map((y) => (
                    <TouchableOpacity
                      key={y}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: manufacturingYear === y }}
                      accessibilityLabel={y}
                      style={[styles.yearPill, manufacturingYear === y && styles.yearPillActive]}
                      onPress={() => setManufacturingYear(y)}
                    >
                      <Text style={[styles.yearPillText, manufacturingYear === y && styles.yearPillTextActive]}>
                        {y}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TextInput
                  style={[styles.input, { marginTop: 8 }]}
                  placeholder="Or type year e.g. 2019"
                  placeholderTextColor={color.muted}
                  keyboardType="number-pad"
                  maxLength={4}
                  value={manufacturingYear}
                  onChangeText={setManufacturingYear}
                  returnKeyType="done"
                  accessibilityLabel="Manufacturing year"
                />
              </View>
            </View>
          )}

          {/* ══════════════════════════════════════════════════
              STEP 2 — Running & Ownership
          ══════════════════════════════════════════════════ */}
          {step === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Running & Ownership</Text>
              <Text style={styles.stepDesc}>Mileage, fuel, transmission and colour.</Text>

              <View style={styles.fieldGroup}>
                <SectionLabel>Kilometres Driven (Odometer) *</SectionLabel>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 28000"
                  placeholderTextColor={color.muted}
                  keyboardType="number-pad"
                  value={odometerKm}
                  onChangeText={setOdometerKm}
                  returnKeyType="done"
                  accessibilityLabel="Kilometres driven"
                />
              </View>

              <View style={styles.fieldGroup}>
                <SectionLabel>Fuel Type *</SectionLabel>
                <View style={styles.pillRow}>
                  {FUEL_TYPES.map((f) => (
                    <Pill key={f.value} label={f.label} active={fuelType === f.value} onPress={() => setFuelType(f.value)} />
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <SectionLabel>Transmission *</SectionLabel>
                <View style={styles.pillRow}>
                  {TRANSMISSIONS.map((t) => (
                    <Pill key={t.value} label={t.label} active={transmission === t.value} onPress={() => setTransmission(t.value)} />
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <SectionLabel>Number of Owners</SectionLabel>
                <View style={styles.pillRow}>
                  {OWNERSHIPS.map((o) => (
                    <Pill key={o.value} label={o.label} active={ownershipCount === o.value} onPress={() => setOwnershipCount(o.value)} />
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <SectionLabel>Exterior Colour</SectionLabel>
                <View style={styles.colourGrid}>
                  {COLOUR_OPTIONS.map((col) => {
                    const selected = colorName === col.name;
                    return (
                      <Pressable
                        key={col.name}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={col.name}
                        onPress={() => setColorName(col.name)}
                        style={({ pressed }) => [
                          styles.colourItem,
                          selected && styles.colourItemSelected,
                          pressed && { opacity: 0.75 },
                        ]}
                      >
                        <View
                          style={[
                            styles.colourSwatch,
                            { backgroundColor: col.hex },
                            col.hex === '#FFFFFF' && styles.colourSwatchBordered,
                          ]}
                        />
                        <Text style={[styles.colourName, selected && styles.colourNameSelected]} numberOfLines={1}>
                          {col.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput
                  style={[styles.input, { marginTop: 10 }]}
                  placeholder="Or type colour (e.g. Pearl White)"
                  placeholderTextColor={color.muted}
                  value={colorName}
                  onChangeText={setColorName}
                  autoCapitalize="words"
                  returnKeyType="done"
                  accessibilityLabel="Exterior colour"
                />
              </View>

              <View style={styles.twoCol}>
                <View style={styles.col}>
                  <SectionLabel>Registration City</SectionLabel>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Bengaluru"
                    placeholderTextColor={color.muted}
                    value={registrationCity}
                    onChangeText={setRegistrationCity}
                    autoCapitalize="words"
                    returnKeyType="next"
                    accessibilityLabel="Registration city"
                  />
                </View>
                <View style={styles.col}>
                  <SectionLabel>Reg. Year</SectionLabel>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 2020"
                    placeholderTextColor={color.muted}
                    keyboardType="number-pad"
                    maxLength={4}
                    value={registrationYear}
                    onChangeText={setRegistrationYear}
                    returnKeyType="done"
                    accessibilityLabel="Registration year"
                  />
                </View>
              </View>
            </View>
          )}

          {/* ══════════════════════════════════════════════════
              STEP 3 — Condition & History
          ══════════════════════════════════════════════════ */}
          {step === 3 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Condition & History</Text>
              <Text style={styles.stepDesc}>
                Transparency helps us make a firm, higher initial offer.
              </Text>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Existing Bank Loan / Hypothecation</Text>
                  <Text style={styles.helperText}>
                    Is there an outstanding loan to clear before NOC?
                  </Text>
                </View>
                <Switch
                  value={loanOutstanding}
                  onValueChange={setLoanOutstanding}
                  trackColor={{ false: color.border, true: color.yellow }}
                  thumbColor={color.white}
                  accessibilityLabel="Loan outstanding"
                />
              </View>

              <View style={styles.fieldGroup}>
                <SectionLabel>Accident History</SectionLabel>
                <View style={styles.pillRow}>
                  {[
                    { value: 'NO', label: 'No accidents' },
                    { value: 'YES', label: 'Minor repairs / bodywork' },
                    { value: 'NOT_SURE', label: 'Not sure' },
                  ].map((a) => (
                    <Pill
                      key={a.value}
                      label={a.label}
                      active={accidentHistory === a.value}
                      onPress={() => setAccidentHistory(a.value as any)}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <SectionLabel>Service History</SectionLabel>
                <View style={styles.pillRow}>
                  {[
                    { value: 'COMPLETE', label: 'Complete record' },
                    { value: 'PARTIAL', label: 'Partial' },
                    { value: 'NOT_SURE', label: 'Not available' },
                  ].map((s) => (
                    <Pill
                      key={s.value}
                      label={s.label}
                      active={serviceHistory === s.value}
                      onPress={() => setServiceHistory(s.value as any)}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <SectionLabel>Additional Notes (optional)</SectionLabel>
                <TextInput
                  style={[styles.input, { height: 100, textAlignVertical: 'top', paddingTop: 12 }]}
                  placeholder="e.g. New Michelin tyres, ceramic coated, single driver"
                  placeholderTextColor={color.muted}
                  multiline
                  numberOfLines={4}
                  value={sellerNotes}
                  onChangeText={setSellerNotes}
                  returnKeyType="default"
                  accessibilityLabel="Seller notes"
                />
              </View>
            </View>
          )}

          {/* ══════════════════════════════════════════════════
              STEP 4 — Expected Price
          ══════════════════════════════════════════════════ */}
          {step === 4 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Expected Price</Text>
              <Text style={styles.stepDesc}>
                What is your approximate expected selling price? (Optional)
              </Text>

              <View style={styles.priceCard}>
                <IndianRupee size={28} color={color.yellow} accessibilityElementsHidden />
                <View style={styles.priceInputWrapper}>
                  <TextInput
                    style={styles.priceInput}
                    placeholder="e.g. 8.50"
                    placeholderTextColor={color.muted}
                    keyboardType="decimal-pad"
                    value={expectedLakhs}
                    onChangeText={setExpectedLakhs}
                    returnKeyType="done"
                    accessibilityLabel="Expected price in lakhs"
                  />
                  <Text style={styles.priceSuffix}>Lakhs (₹)</Text>
                </View>
              </View>

              {expectedLakhs ? (
                <Text style={styles.priceFormatted}>
                  ≈ ₹{(Number(expectedLakhs) * 100000).toLocaleString('en-IN')}
                </Text>
              ) : null}

              <View style={styles.assuranceBox}>
                <Sparkles size={20} color={color.yellow} accessibilityElementsHidden />
                <Text style={styles.assuranceBoxText}>
                  Your expected price is a seller preference, not a valuation. V MOTIV reviews all
                  submitted details before any inspection or offer is created.
                </Text>
              </View>
            </View>
          )}

          {/* ══════════════════════════════════════════════════
              STEP 5 — Contact & Location
          ══════════════════════════════════════════════════ */}
          {step === 5 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Contact & Location</Text>
              <Text style={styles.stepDesc}>
                Where should our team coordinate your vehicle evaluation?
              </Text>

              <View style={styles.fieldGroup}>
                <SectionLabel>Full Name *</SectionLabel>
                <TextInput
                  style={styles.input}
                  placeholder="Full name"
                  placeholderTextColor={color.muted}
                  value={sellerName}
                  onChangeText={setSellerName}
                  autoCapitalize="words"
                  returnKeyType="next"
                  accessibilityLabel="Full name"
                />
              </View>

              <View style={styles.fieldGroup}>
                <SectionLabel>Mobile Number *</SectionLabel>
                <View style={styles.phoneWrapper}>
                  <Text style={styles.prefix}>+91</Text>
                  <TextInput
                    style={[styles.input, { flex: 1, borderWidth: 0, paddingLeft: 8 }]}
                    placeholder="9876543210"
                    placeholderTextColor={color.muted}
                    keyboardType="phone-pad"
                    maxLength={10}
                    value={sellerPhone}
                    onChangeText={setSellerPhone}
                    returnKeyType="next"
                    accessibilityLabel="Mobile number"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <SectionLabel>City *</SectionLabel>
                <View style={styles.pillRow}>
                  {cities.map((c) => (
                    <Pill
                      key={c.id}
                      label={c.name}
                      active={city.toLowerCase() === c.name.toLowerCase()}
                      onPress={() => setCity(c.name)}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <SectionLabel>Postal Pincode *</SectionLabel>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 560001"
                  placeholderTextColor={color.muted}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={pincode}
                  onChangeText={setPincode}
                  returnKeyType="done"
                  accessibilityLabel="Postal pincode"
                />
              </View>
            </View>
          )}

          {/* ══════════════════════════════════════════════════
              STEP 6 — Inspection Appointment
          ══════════════════════════════════════════════════ */}
          {step === 6 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Evaluation Appointment</Text>
              <Text style={styles.stepDesc}>Choose your convenient inspection slot.</Text>

              <View style={styles.fieldGroup}>
                <SectionLabel>Inspection Location</SectionLabel>
                <View style={styles.pillRow}>
                  <Pill
                    label="V MOTIV Hub (Faster)"
                    active={inspectionLocationType === 'HUB'}
                    onPress={() => setInspectionLocationType('HUB')}
                  />
                  <Pill
                    label="Doorstep Inspection"
                    active={inspectionLocationType === 'HOME'}
                    onPress={() => setInspectionLocationType('HOME')}
                  />
                </View>
              </View>

              {inspectionLocationType === 'HOME' && (
                <View style={styles.fieldGroup}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <SectionLabel>Doorstep Address *</SectionLabel>
                  </View>

                  {savedAddresses.length > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingBottom: 10 }}
                    >
                      {savedAddresses.map((sa) => (
                        <TouchableOpacity
                          key={sa.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Use saved address: ${sa.label}`}
                          style={styles.savedAddressChip}
                          onPress={() => {
                            setInspectionAddress(`${sa.addressLine}, ${sa.city} - ${sa.pincode}`);
                            setCity(sa.city);
                            setPincode(sa.pincode);
                          }}
                        >
                          <Home size={12} color={color.yellow} accessibilityElementsHidden />
                          <Text style={styles.savedAddressLabel}>{sa.label}</Text>
                          <Text style={styles.savedAddressCity}>({sa.city})</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}

                  <TextInput
                    style={[styles.input, { height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
                    placeholder="Building, street, landmark, city"
                    placeholderTextColor={color.muted}
                    multiline
                    value={inspectionAddress}
                    onChangeText={setInspectionAddress}
                    returnKeyType="default"
                    accessibilityLabel="Doorstep address"
                  />
                </View>
              )}

              <View style={styles.fieldGroup}>
                <SectionLabel>Preferred Date</SectionLabel>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={color.muted}
                  value={inspectionDate}
                  onChangeText={setInspectionDate}
                  returnKeyType="done"
                  accessibilityLabel="Preferred date"
                />
                <Text style={styles.helperText}>Minimum 2 business days from today.</Text>
              </View>

              <View style={styles.fieldGroup}>
                <SectionLabel>Preferred Time Slot</SectionLabel>
                <View style={styles.pillRow}>
                  {TIME_SLOTS.map((slot) => (
                    <Pill
                      key={slot}
                      label={slot}
                      active={inspectionTimeSlot === slot}
                      onPress={() => setInspectionTimeSlot(slot)}
                    />
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* ══════════════════════════════════════════════════
              STEP 7 — Review & Submit
          ══════════════════════════════════════════════════ */}
          {step === 7 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Review & Confirm</Text>
              <Text style={styles.stepDesc}>Review your details before submitting.</Text>

              <View style={styles.summaryBox}>
                <ReviewRow label="Car" value={`${manufacturingYear} ${make} ${model}${variant ? ` ${variant}` : ''}`} />
                <ReviewRow label="Colour" value={colorName || '—'} />
                <ReviewRow label="Odometer" value={`${Number(odometerKm || 0).toLocaleString('en-IN')} km`} />
                <ReviewRow label="Fuel & Trans" value={`${fuelType} · ${transmission}`} />
                <ReviewRow label="Owners" value={`${ownershipCount} owner${Number(ownershipCount) > 1 ? 's' : ''}`} />
                <ReviewRow label="Loan" value={loanOutstanding ? 'Yes — outstanding' : 'No loan'} />
                <ReviewRow label="Expected Price" value={expectedLakhs ? `₹${expectedLakhs} Lakhs` : 'V MOTIV Evaluation'} />
                <ReviewRow label="Contact" value={`${sellerName} · +91 ${sellerPhone}`} />
                <ReviewRow label="City" value={city} />
                <ReviewRow label="Evaluation" value={`${inspectionDate} (${inspectionTimeSlot}) · ${inspectionLocationType === 'HUB' ? 'Hub' : 'Doorstep'}`} />
              </View>

              <View style={styles.noticeBox}>
                <ShieldCheck size={20} color="#22C55E" accessibilityElementsHidden />
                <Text style={styles.noticeBoxText}>
                  Your request is submitted for operations review. If an authorized acquisition offer is
                  created later, you can review, accept, or decline it in Activity.
                </Text>
              </View>
            </View>
          )}

          {/* Error */}
          {error ? (
            <View style={styles.errorBox}>
              <Text accessibilityRole="alert" style={styles.errorText}>
                {error}
              </Text>
            </View>
          ) : null}

          {/* Action buttons */}
          <View style={styles.actionButtons}>
            {step > 1 && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Back"
                style={styles.backButton}
                onPress={() => setStep(step - 1)}
                disabled={busy}
              >
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={step === 7 ? 'Submit Selling Request' : 'Continue'}
              style={[styles.nextButton, step === 1 && { flex: 1 }]}
              onPress={step === 7 ? handleSubmit : handleNext}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color={color.navy} />
              ) : (
                <Text style={styles.nextButtonText}>
                  {step === 7 ? 'Submit Selling Request' : step === 6 ? 'Review & Submit' : 'Continue'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Small helper component ─────────────────────────────────────────────────
function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryVal} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ── StyleSheet ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    color: color.white,
    fontSize: 17,
    fontWeight: '700',
  },
  stepCounter: {
    color: color.muted,
    fontSize: 12,
    marginTop: 2,
  },
  progressBar: {
    height: 4,
    backgroundColor: color.border,
  },
  progressFill: {
    height: '100%',
    backgroundColor: color.yellow,
  },
  content: {
    padding: space.lg,
    gap: 0,
  },
  stepContent: {
    gap: 20,
  },
  stepTitle: {
    color: color.white,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 30,
  },
  stepDesc: {
    color: color.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: -8,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: color.white,
    fontSize: 14,
    fontWeight: '600',
  },
  helperText: {
    color: color.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  input: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 14,
    color: color.white,
    fontSize: 16,
    borderWidth: 1,
    borderColor: color.border,
    minHeight: 52,
  },

  /* brand grid */
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.md,
    gap: 10,
    height: 48,
  },
  searchInput: {
    flex: 1,
    color: color.white,
    fontSize: 15,
  },
  brandGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  brandCard: {
    width: '30%',
    minWidth: 96,
    flex: 1,
    backgroundColor: color.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    minHeight: 80,
    justifyContent: 'center',
  },
  brandCardSelected: {
    backgroundColor: color.yellow,
    borderColor: color.yellow,
  },
  brandEmoji: {
    fontSize: 24,
  },
  brandName: {
    color: color.white,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  brandNameSelected: {
    color: color.navy,
  },
  noResults: {
    color: color.muted,
    fontSize: 13,
    paddingVertical: 8,
  },
  freeTextBtn: {
    backgroundColor: 'rgba(247,181,3,0.12)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(247,181,3,0.3)',
    padding: space.md,
    alignItems: 'center',
  },
  freeTextBtnLabel: {
    color: color.yellow,
    fontSize: 14,
    fontWeight: '600',
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.yellow,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    gap: 10,
  },
  selectedChipText: {
    color: color.navy,
    fontSize: 14,
    fontWeight: '700',
  },
  selectedChipClear: {
    color: color.navy,
    fontSize: 16,
    fontWeight: '800',
  },

  /* model pills */
  modelPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
  },
  modelPillActive: {
    backgroundColor: color.yellow,
    borderColor: color.yellow,
  },
  modelPillText: {
    color: color.white,
    fontSize: 13,
    fontWeight: '600',
  },
  modelPillTextActive: {
    color: color.navy,
    fontWeight: '700',
  },

  /* year pills */
  yearPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    minWidth: 64,
    alignItems: 'center',
  },
  yearPillActive: {
    backgroundColor: color.yellow,
    borderColor: color.yellow,
  },
  yearPillText: {
    color: color.white,
    fontSize: 15,
    fontWeight: '600',
  },
  yearPillTextActive: {
    color: color.navy,
    fontWeight: '800',
  },

  /* colour grid */
  colourGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colourItem: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    width: '22%',
    minWidth: 70,
  },
  colourItemSelected: {
    borderColor: color.yellow,
    backgroundColor: 'rgba(247,181,3,0.08)',
  },
  colourSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  colourSwatchBordered: {
    borderWidth: 1,
    borderColor: color.border,
  },
  colourName: {
    color: color.muted,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  colourNameSelected: {
    color: color.yellow,
    fontWeight: '700',
  },

  /* pill row */
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
  },
  pillActive: {
    backgroundColor: color.yellow,
    borderColor: color.yellow,
  },
  pillText: {
    color: color.white,
    fontSize: 13,
    fontWeight: '600',
  },
  pillTextActive: {
    color: color.navy,
    fontWeight: '700',
  },

  /* two-column layout */
  twoCol: {
    flexDirection: 'row',
    gap: space.md,
  },
  col: {
    flex: 1,
    gap: 8,
  },

  /* switch */
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.card,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    gap: 12,
  },

  /* price */
  priceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.lg,
    borderWidth: 2,
    borderColor: color.yellow,
    gap: space.sm,
  },
  priceInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceInput: {
    flex: 1,
    color: color.white,
    fontSize: 30,
    fontWeight: '800',
  },
  priceSuffix: {
    color: color.muted,
    fontSize: 15,
    fontWeight: '600',
  },
  priceFormatted: {
    color: color.yellow,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  assuranceBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    backgroundColor: 'rgba(247,181,3,0.08)',
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: 'rgba(247,181,3,0.2)',
  },
  assuranceBoxText: {
    color: '#D1D5DB',
    fontSize: 13,
    flex: 1,
    lineHeight: 19,
  },

  /* phone field */
  phoneWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    paddingLeft: space.md,
    minHeight: 52,
  },
  prefix: {
    color: color.muted,
    fontSize: 16,
    fontWeight: '700',
  },

  /* saved address chips */
  savedAddressChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: color.navy,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  savedAddressLabel: {
    color: color.white,
    fontSize: 13,
    fontWeight: '700',
  },
  savedAddressCity: {
    color: color.muted,
    fontSize: 11,
  },

  /* summary */
  summaryBox: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
    gap: 12,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryLabel: {
    color: color.muted,
    fontSize: 13,
    flexShrink: 0,
    width: 110,
  },
  summaryVal: {
    color: color.white,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  noticeBoxText: {
    color: '#D1D5DB',
    fontSize: 13,
    flex: 1,
    lineHeight: 19,
  },

  /* error */
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    padding: space.md,
    marginTop: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    lineHeight: 20,
  },

  /* action buttons */
  actionButtons: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: 24,
  },
  backButton: {
    paddingVertical: 16,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  backButtonText: {
    color: color.white,
    fontSize: 15,
    fontWeight: '600',
  },
  nextButton: {
    flex: 1,
    backgroundColor: color.yellow,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  nextButtonText: {
    color: color.navy,
    fontSize: 16,
    fontWeight: '800',
  },

  /* success */
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.xl,
    gap: 12,
  },
  successTitle: {
    color: color.white,
    fontSize: 26,
    fontWeight: '800',
    marginTop: space.md,
  },
  successRef: {
    color: color.yellow,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  successBody: {
    color: color.muted,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: space.md,
  },
  successActions: {
    width: '100%',
    gap: space.sm,
  },
  primaryBtn: {
    backgroundColor: color.yellow,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    minHeight: 56,
  },
  primaryBtnText: {
    color: color.navy,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryBtn: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    minHeight: 56,
  },
  secondaryBtnText: {
    color: color.white,
    fontSize: 15,
    fontWeight: '600',
  },
});
