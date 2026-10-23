import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react-native';
import { customer } from '../services/customer';
import { useAuth } from '../auth/AuthProvider';
import { color, radius, space } from '../theme';
import { friendlyError } from '../format';
import type { CustomerAddress, SupportedCity } from '../types';

const DRAFT_KEY = 'vmotiv.v2.sell-draft';

const FUEL_TYPES = ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID'];
const TRANSMISSIONS = ['MANUAL', 'AUTOMATIC'];
const OWNERSHIPS = [
  { value: '1', label: '1st Owner' },
  { value: '2', label: '2nd Owner' },
  { value: '3', label: '3rd Owner' },
  { value: '4', label: '4+ Owners' },
];
const TIME_SLOTS = ['10:00-12:00', '12:00-14:00', '14:00-16:00', '16:00-18:00'] as const;

function generateMutationKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${Math.random().toString(36).slice(2, 9)}`;
}

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  // Form state
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [variant, setVariant] = useState('');
  const [manufacturingYear, setManufacturingYear] = useState('');

  const [odometerKm, setOdometerKm] = useState('');
  const [fuelType, setFuelType] = useState('PETROL');
  const [transmission, setTransmission] = useState('MANUAL');
  const [ownershipCount, setOwnershipCount] = useState('1');
  const [registrationYear, setRegistrationYear] = useState('');
  const [registrationCity, setRegistrationCity] = useState('');
  const [colorName, setColorName] = useState('');

  const [loanOutstanding, setLoanOutstanding] = useState(false);
  const [accidentHistory, setAccidentHistory] = useState<'NO' | 'YES' | 'NOT_SURE'>('NO');
  const [serviceHistory, setServiceHistory] = useState<'COMPLETE' | 'PARTIAL' | 'NOT_SURE'>('COMPLETE');
  const [sellerNotes, setSellerNotes] = useState('');

  const [expectedLakhs, setExpectedLakhs] = useState('');

  const [sellerName, setSellerName] = useState(user?.displayName || '');
  const [sellerPhone, setSellerPhone] = useState(user?.phone?.replace(/^\+91/, '') || '');
  const [city, setCity] = useState(user?.preferredCity || '');
  const [pincode, setPincode] = useState('');

  // Inspection booking
  const [inspectionLocationType, setInspectionLocationType] = useState<'HUB' | 'HOME'>('HUB');
  const [inspectionDate, setInspectionDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [inspectionTimeSlot, setInspectionTimeSlot] = useState<typeof TIME_SLOTS[number]>('10:00-12:00');
  const [inspectionAddress, setInspectionAddress] = useState('');

  // Hydrate draft
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (raw) {
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
      }
    });

    customer
      .cities()
      .then(setCities)
      .catch(() => {});
    customer
      .addresses()
      .then((data) => setSavedAddresses(data as CustomerAddress[]))
      .catch(() => {});
  }, []);

  // Auto-save draft (debounced 600ms so typing is never blocked by native storage I/O)
  useEffect(() => {
    if (submittedLead) return;
    const timer = setTimeout(() => {
      const draft = {
        make,
        model,
        variant,
        manufacturingYear,
        odometerKm,
        fuelType,
        transmission,
        ownershipCount,
        registrationYear,
        registrationCity,
        colorName,
        loanOutstanding,
        accidentHistory,
        serviceHistory,
        sellerNotes,
        expectedLakhs,
        sellerName,
        sellerPhone,
        city,
        pincode,
        inspectionLocationType,
        inspectionDate,
        inspectionTimeSlot,
        inspectionAddress,
      };
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [
    make,
    model,
    variant,
    manufacturingYear,
    odometerKm,
    fuelType,
    transmission,
    ownershipCount,
    registrationYear,
    registrationCity,
    colorName,
    loanOutstanding,
    accidentHistory,
    serviceHistory,
    sellerNotes,
    expectedLakhs,
    sellerName,
    sellerPhone,
    city,
    pincode,
    inspectionLocationType,
    inspectionDate,
    inspectionTimeSlot,
    inspectionAddress,
    submittedLead,
  ]);

  const validateStep = (s: number): boolean => {
    setError('');
    if (s === 1) {
      const y = Number(manufacturingYear);
      if (!make.trim() || !model.trim() || !y || y < 1980 || y > new Date().getFullYear() + 1) {
        setError('Please enter valid Make, Model, and Manufacturing Year (1980 - present).');
        return false;
      }
    }
    if (s === 2) {
      const odo = Number(odometerKm);
      if (isNaN(odo) || odo < 0) {
        setError('Please enter a valid odometer reading in kilometers.');
        return false;
      }
    }
    if (s === 5) {
      if (!sellerName.trim() || !/^[6-9]\d{9}$/.test(sellerPhone.trim())) {
        setError('Please enter your full name and a valid 10-digit Indian mobile number.');
        return false;
      }
      if (
        !city.trim() ||
        (cities.length > 0 && !cities.some((c) => c.name.toLowerCase() === city.toLowerCase()))
      ) {
        setError('Please select a supported city from the list.');
        return false;
      }
      if (!/^\d{6}$/.test(pincode.trim())) {
        setError('Please enter a valid 6-digit postal pincode.');
        return false;
      }
    }
    if (s === 6) {
      if (inspectionLocationType === 'HOME') {
        if (!inspectionAddress.trim() || inspectionAddress.trim().length < 10) {
          setError('Please enter a complete doorstep address for inspection (minimum 10 characters).');
          return false;
        }
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((curr) => Math.min(7, curr + 1));
    }
  };

  const handleSubmit = async () => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(5) || !validateStep(6)) {
      return;
    }
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

  if (submittedLead) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.successContainer}>
          <CheckCircle2 size={64} color="#22C55E" />
          <Text style={styles.successTitle}>Request Submitted!</Text>
          <Text style={styles.successRef}>
            Reference: {submittedLead.referenceCode?.slice(0, 8).toUpperCase()}
          </Text>
          <Text style={styles.successBody}>
            We have scheduled your car evaluation for {submittedLead.manufacturingYear} {submittedLead.make}{' '}
            {submittedLead.model} on {inspectionDate}, {inspectionTimeSlot}.
          </Text>
          <View style={styles.successActions}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                navigation.navigate('Tabs', { screen: 'Activity' });
              }}
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => (step > 1 ? setStep(step - 1) : navigation.goBack())}
            style={styles.backBtn}
          >
            <ChevronLeft size={24} color={color.white} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Sell Your Car</Text>
            <Text style={styles.stepCounter}>Step {step} of 7</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(step / 7) * 100}%` }]} />
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, space.md) + 60 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* STEP 1: Basic Identity */}
          {step === 1 && (
            <View>
              <Text style={styles.stepTitle}>Vehicle Identity</Text>
              <Text style={styles.stepDesc}>Enter the foundational vehicle specifications.</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Make / Brand *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Tata, Hyundai, Maruti Suzuki"
                  placeholderTextColor={color.muted}
                  value={make}
                  onChangeText={setMake}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Model *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Nexon, Creta, Swift"
                  placeholderTextColor={color.muted}
                  value={model}
                  onChangeText={setModel}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Variant</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. XZ+ (O), SX AT, ZXi"
                  placeholderTextColor={color.muted}
                  value={variant}
                  onChangeText={setVariant}
                  autoCapitalize="characters"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Manufacturing Year *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 2022"
                  placeholderTextColor={color.muted}
                  keyboardType="number-pad"
                  maxLength={4}
                  value={manufacturingYear}
                  onChangeText={setManufacturingYear}
                  returnKeyType="done"
                />
              </View>
            </View>
          )}

          {/* STEP 2: Running & Ownership */}
          {step === 2 && (
            <View>
              <Text style={styles.stepTitle}>Running & Ownership</Text>
              <Text style={styles.stepDesc}>Mileage, fuel, and transmission profile.</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Kilometers Driven (Odometer) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 28000"
                  placeholderTextColor={color.muted}
                  keyboardType="number-pad"
                  value={odometerKm}
                  onChangeText={setOdometerKm}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Fuel Type *</Text>
                <View style={styles.pillRow}>
                  {FUEL_TYPES.map((f) => (
                    <TouchableOpacity
                      key={f}
                      style={[styles.pill, fuelType === f && styles.pillActive]}
                      onPress={() => setFuelType(f)}
                    >
                      <Text style={[styles.pillText, fuelType === f && styles.pillTextActive]}>
                        {f}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Transmission *</Text>
                <View style={styles.pillRow}>
                  {TRANSMISSIONS.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.pill, transmission === t && styles.pillActive]}
                      onPress={() => setTransmission(t)}
                    >
                      <Text style={[styles.pillText, transmission === t && styles.pillTextActive]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Number of Owners</Text>
                <View style={styles.pillRow}>
                  {OWNERSHIPS.map((o) => (
                    <TouchableOpacity
                      key={o.value}
                      style={[styles.pill, ownershipCount === o.value && styles.pillActive]}
                      onPress={() => setOwnershipCount(o.value)}
                    >
                      <Text style={[styles.pillText, ownershipCount === o.value && styles.pillTextActive]}>
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.twoCol}>
                <View style={styles.col}>
                  <Text style={styles.label}>Registration City</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Bengaluru"
                    placeholderTextColor={color.muted}
                    value={registrationCity}
                    onChangeText={setRegistrationCity}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Exterior Colour</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. White"
                    placeholderTextColor={color.muted}
                    value={colorName}
                    onChangeText={setColorName}
                    autoCapitalize="words"
                    returnKeyType="done"
                  />
                </View>
              </View>
            </View>
          )}

          {/* STEP 3: Vehicle Condition */}
          {step === 3 && (
            <View>
              <Text style={styles.stepTitle}>Condition & History</Text>
              <Text style={styles.stepDesc}>Transparency helps us make a firm, higher initial offer.</Text>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Existing Bank Loan / Hypothecation</Text>
                  <Text style={styles.helperText}>Is there an outstanding loan to clear before NOC?</Text>
                </View>
                <Switch
                  value={loanOutstanding}
                  onValueChange={setLoanOutstanding}
                  trackColor={{ false: color.border, true: color.yellow }}
                  thumbColor={color.white}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Accidental Impact History</Text>
                <View style={styles.pillRow}>
                  {[
                    { value: 'NO', label: 'Never in Accident' },
                    { value: 'YES', label: 'Minor Repairs / Bodywork' },
                    { value: 'NOT_SURE', label: 'Not Sure' },
                  ].map((a) => (
                    <TouchableOpacity
                      key={a.value}
                      style={[styles.pill, accidentHistory === a.value && styles.pillActive]}
                      onPress={() => setAccidentHistory(a.value as any)}
                    >
                      <Text style={[styles.pillText, accidentHistory === a.value && styles.pillTextActive]}>
                        {a.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Authorized Service History</Text>
                <View style={styles.pillRow}>
                  {[
                    { value: 'COMPLETE', label: 'Complete Record' },
                    { value: 'PARTIAL', label: 'Partial' },
                    { value: 'NOT_SURE', label: 'Not Available' },
                  ].map((s) => (
                    <TouchableOpacity
                      key={s.value}
                      style={[styles.pill, serviceHistory === s.value && styles.pillActive]}
                      onPress={() => setServiceHistory(s.value as any)}
                    >
                      <Text style={[styles.pillText, serviceHistory === s.value && styles.pillTextActive]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Additional Seller Notes (Optional)</Text>
                <TextInput
                  style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
                  placeholder="e.g. New Michelin tyres installed, ceramic coated, single driver."
                  placeholderTextColor={color.muted}
                  multiline
                  numberOfLines={3}
                  value={sellerNotes}
                  onChangeText={setSellerNotes}
                  returnKeyType="default"
                />
              </View>
            </View>
          )}

          {/* STEP 4: Valuation & Expected Price */}
          {step === 4 && (
            <View>
              <Text style={styles.stepTitle}>Valuation & Pricing</Text>
              <Text style={styles.stepDesc}>What is your approximate expected selling price?</Text>

              <View style={styles.priceCard}>
                <IndianRupee size={28} color={color.yellow} />
                <View style={styles.priceInputWrapper}>
                  <TextInput
                    style={styles.priceInput}
                    placeholder="e.g. 8.50"
                    placeholderTextColor={color.muted}
                    keyboardType="decimal-pad"
                    value={expectedLakhs}
                    onChangeText={setExpectedLakhs}
                    returnKeyType="done"
                  />
                  <Text style={styles.priceSuffix}>Lakhs (₹)</Text>
                </View>
              </View>

              {expectedLakhs ? (
                <Text style={styles.priceFormatted}>
                  Approx: ₹{(Number(expectedLakhs) * 100000).toLocaleString('en-IN')}
                </Text>
              ) : null}

              <View style={styles.assuranceBox}>
                <Sparkles size={20} color={color.yellow} />
                <Text style={styles.assuranceBoxText}>
                  Your expected price is a seller preference, not a valuation. V MOTIV reviews the submitted details
                  before any inspection appointment or authorized offer is created.
                </Text>
              </View>
            </View>
          )}

          {/* STEP 5: Contact & Location */}
          {step === 5 && (
            <View>
              <Text style={styles.stepTitle}>Contact & Location</Text>
              <Text style={styles.stepDesc}>Where should our team coordinate the vehicle handover?</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Full Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Full name"
                  placeholderTextColor={color.muted}
                  value={sellerName}
                  onChangeText={setSellerName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Mobile Number *</Text>
                <View style={styles.phoneWrapper}>
                  <Text style={styles.prefix}>+91</Text>
                  <TextInput
                    style={[styles.input, { flex: 1, borderWidth: 0 }]}
                    placeholder="9876543210"
                    placeholderTextColor={color.muted}
                    keyboardType="phone-pad"
                    maxLength={10}
                    value={sellerPhone}
                    onChangeText={setSellerPhone}
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Supported City *</Text>
                <View style={styles.pillRow}>
                  {cities.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.pill, city.toLowerCase() === c.name.toLowerCase() && styles.pillActive]}
                      onPress={() => setCity(c.name)}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          city.toLowerCase() === c.name.toLowerCase() && styles.pillTextActive,
                        ]}
                      >
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Postal Pincode *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 560001"
                  placeholderTextColor={color.muted}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={pincode}
                  onChangeText={setPincode}
                  returnKeyType="done"
                />
              </View>
            </View>
          )}

          {/* STEP 6: Inspection Appointment */}
          {step === 6 && (
            <View>
              <Text style={styles.stepTitle}>Evaluation Appointment</Text>
              <Text style={styles.stepDesc}>Choose your convenient inspection slot.</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Inspection Location</Text>
                <View style={styles.pillRow}>
                  <TouchableOpacity
                    style={[styles.pill, inspectionLocationType === 'HUB' && styles.pillActive]}
                    onPress={() => setInspectionLocationType('HUB')}
                  >
                    <Text style={[styles.pillText, inspectionLocationType === 'HUB' && styles.pillTextActive]}>
                      V MOTIV Hub (Faster)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pill, inspectionLocationType === 'HOME' && styles.pillActive]}
                    onPress={() => setInspectionLocationType('HOME')}
                  >
                    <Text style={[styles.pillText, inspectionLocationType === 'HOME' && styles.pillTextActive]}>
                      Doorstep Inspection
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {inspectionLocationType === 'HOME' ? (
                <View style={styles.fieldGroup}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={styles.label}>Doorstep Address *</Text>
                    {savedAddresses.length > 0 && (
                      <Text style={{ fontSize: 11, color: color.yellow, fontWeight: '600' }}>Tap to auto-fill</Text>
                    )}
                  </View>

                  {savedAddresses.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
                      {savedAddresses.map((sa) => (
                        <TouchableOpacity
                          key={sa.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            backgroundColor: color.navy,
                            borderWidth: 1,
                            borderColor: color.border,
                            borderRadius: radius.md,
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                          }}
                          onPress={() => {
                            setInspectionAddress(`${sa.addressLine}, ${sa.city} - ${sa.pincode}`);
                            setCity(sa.city);
                            setPincode(sa.pincode);
                          }}
                        >
                          <Home size={13} color={color.yellow} />
                          <Text style={{ color: color.white, fontSize: 12, fontWeight: '700' }}>{sa.label}</Text>
                          <Text style={{ color: color.muted, fontSize: 11 }}>({sa.city})</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}

                  <TextInput
                    style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                    placeholder="Building, street, landmark"
                    placeholderTextColor={color.muted}
                    multiline
                    value={inspectionAddress}
                    onChangeText={setInspectionAddress}
                    returnKeyType="default"
                  />
                </View>
              ) : null}

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Preferred Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={color.muted}
                  value={inspectionDate}
                  onChangeText={setInspectionDate}
                  returnKeyType="done"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Preferred Time Slot</Text>
                <View style={styles.pillRow}>
                  {TIME_SLOTS.map((slot) => (
                    <TouchableOpacity
                      key={slot}
                      style={[styles.pill, inspectionTimeSlot === slot && styles.pillActive]}
                      onPress={() => setInspectionTimeSlot(slot)}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          inspectionTimeSlot === slot && styles.pillTextActive,
                        ]}
                      >
                        {slot}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* STEP 7: Final Review & Submit */}
          {step === 7 && (
            <View>
              <Text style={styles.stepTitle}>Review & Confirm</Text>
              <Text style={styles.stepDesc}>Review vehicle specifications before submitting.</Text>

              <View style={styles.summaryBox}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Car:</Text>
                  <Text style={styles.summaryVal}>
                    {manufacturingYear} {make} {model} {variant}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Odometer:</Text>
                  <Text style={styles.summaryVal}>{Number(odometerKm).toLocaleString('en-IN')} km</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Fuel & Trans:</Text>
                  <Text style={styles.summaryVal}>
                    {fuelType} · {transmission}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Expected Price:</Text>
                  <Text style={styles.summaryVal}>
                    {expectedLakhs ? `₹${expectedLakhs} Lakhs` : 'V MOTIV Evaluation'}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Evaluation:</Text>
                  <Text style={styles.summaryVal}>
                    {inspectionDate} ({inspectionTimeSlot}) · {inspectionLocationType}
                  </Text>
                </View>
              </View>

              <View style={styles.noticeBox}>
                <ShieldCheck size={20} color="#22C55E" />
                <Text style={styles.noticeBoxText}>
                  Your request is submitted for operations review. If an authorized acquisition offer is later created,
                  you can review, accept, or decline it in Activity.
                </Text>
              </View>
            </View>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Footer Action Buttons */}
          <View style={styles.actionButtons}>
            {step > 1 ? (
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setStep(step - 1)}
                disabled={busy}
              >
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
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
    paddingVertical: space.sm,
  },
  backBtn: {
    padding: space.xs,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    color: color.white,
    fontSize: 16,
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
    width: '100%',
  },
  progressFill: {
    height: '100%',
    backgroundColor: color.yellow,
  },
  content: {
    padding: space.md,
    paddingBottom: space.xxxl,
  },
  stepTitle: {
    color: color.white,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  stepDesc: {
    color: color.muted,
    fontSize: 13,
    marginBottom: space.lg,
  },
  fieldGroup: {
    marginBottom: space.md,
  },
  label: {
    color: color.white,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: space.xs,
  },
  helperText: {
    color: color.muted,
    fontSize: 11,
    marginTop: 2,
  },
  input: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.md,
    color: color.white,
    fontSize: 14,
    borderWidth: 1,
    borderColor: color.border,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  pill: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
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
    fontSize: 12,
    fontWeight: '600',
  },
  pillTextActive: {
    color: color.navy,
    fontWeight: '700',
  },
  twoCol: {
    flexDirection: 'row',
    gap: space.md,
  },
  col: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.card,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    marginBottom: space.md,
  },
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
    fontSize: 28,
    fontWeight: '800',
  },
  priceSuffix: {
    color: color.muted,
    fontSize: 16,
    fontWeight: '600',
  },
  priceFormatted: {
    color: color.yellow,
    fontSize: 14,
    fontWeight: '700',
    marginTop: space.sm,
    textAlign: 'center',
  },
  assuranceBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    backgroundColor: 'rgba(247, 181, 3, 0.08)',
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.lg,
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.2)',
  },
  assuranceBoxText: {
    color: '#D1D5DB',
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
  phoneWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    paddingLeft: space.md,
  },
  prefix: {
    color: color.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  summaryBox: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
    gap: space.sm,
    marginBottom: space.md,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    color: color.muted,
    fontSize: 13,
  },
  summaryVal: {
    color: color.white,
    fontSize: 13,
    fontWeight: '600',
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  noticeBoxText: {
    color: '#D1D5DB',
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    marginVertical: space.sm,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.lg,
  },
  backButton: {
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: color.white,
    fontSize: 14,
    fontWeight: '600',
  },
  nextButton: {
    flex: 1,
    backgroundColor: color.yellow,
    paddingVertical: space.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    color: color.navy,
    fontSize: 15,
    fontWeight: '700',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.xl,
  },
  successTitle: {
    color: color.white,
    fontSize: 22,
    fontWeight: '800',
    marginTop: space.lg,
  },
  successRef: {
    color: color.yellow,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  successBody: {
    color: color.muted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: space.md,
    lineHeight: 22,
    marginBottom: space.xl,
  },
  successActions: {
    width: '100%',
    gap: space.sm,
  },
  primaryBtn: {
    backgroundColor: color.yellow,
    paddingVertical: space.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: color.navy,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    paddingVertical: space.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: color.white,
    fontSize: 14,
    fontWeight: '600',
  },
});
