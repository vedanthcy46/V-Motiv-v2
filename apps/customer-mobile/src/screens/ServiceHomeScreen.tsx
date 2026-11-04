import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Car,
  Check,
  CheckCircle,
  ChevronRight,
  CircleDot,
  Clock,
  Cpu,
  Disc,
  HelpCircle,
  MapPin,
  Plus,
  RefreshCw,
  Shield,
  Truck,
  Wind,
  Wrench,
  Zap,
} from 'lucide-react-native';
import { useAppTheme, radius, space } from '../theme';
import { useAuth } from '../auth/AuthProvider';
import { CarBrandLogo } from '../components/CarBrandLogo';
import { BrandLogo } from '../components/BrandLogo';
import { AuthScreen } from './AuthScreen';
import { useKeyboard } from '../components/KeyboardAwareFormScreen';
import { customer } from '../services/customer';
import type { CustomerAddress } from '../types';
import {
  createCustomerVehicle,
  createServiceRequest,
  fetchCategoryPaymentOptions,
  fetchCustomerVehicles,
  fetchServiceCategories,
  fetchServiceHubs,
  fetchServiceTemplate,
  fetchSlotAvailability,
  type CustomerVehicle,
  type ServiceCategoryPaymentOptionsResponse,
  type ServiceHub,
  type ServiceIssueCategory,
  type ServiceIssueQuestion,
  type ServiceIssueTemplate,
  type ServicePaymentOption,
  type SlotCapacity,
} from '../services/service-api';

const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  REGULAR_SERVICE: Wrench,
  AC_SERVICE: Wind,
  BATTERY_STARTING: Zap,
  BRAKE_ISSUE: Disc,
  TYRES_WHEELS: CircleDot,
  NOISE_VIBRATION: Activity,
  ENGINE_OVERHEATING: AlertTriangle,
  ELECTRICAL_ISSUE: Cpu,
  BODY_PAINT: Shield,
  OTHER_PROBLEM: HelpCircle,
};

export function ServiceHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const preselectedVehicleId = route.params?.preselectedVehicleId as string | undefined;
  const { state: authState, profile } = useAuth();
  const userCity = profile?.preferredCity || 'Bengaluru';
  const { theme, isDark } = useAppTheme();
  const c = {
    ...theme.colors,
    text: theme.colors.textPrimary,
    textMuted: theme.colors.textSecondary,
    accent: theme.colors.brandAccent,
  };

  if (authState !== 'signed-in') {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <View
          style={{
            paddingTop: insets.top + space.sm,
            paddingHorizontal: 16,
            paddingBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: c.surface,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8, marginRight: 8 }}>
            <ArrowLeft size={22} color={c.text} />
          </TouchableOpacity>
          <BrandLogo variant="horizontal" size={24} bodyColor={isDark ? '#FFFFFF' : c.brandNavy} />
          <View style={{ marginLeft: 10, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: isDark ? 'rgba(247, 181, 3, 0.15)' : '#FEF3C7' }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: c.accent }}>SERVICE</Text>
          </View>
        </View>
        <AuthScreen includeTopInset={false} showHeader={false} />
      </View>
    );
  }

  // Wizard Steps: 1: Car, 2: Issue, 3: Questions, 4: Fulfillment, 5: Slot, 6: Review
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { isKeyboardVisible } = useKeyboard();

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [step]);

  // Data
  const [vehicles, setVehicles] = useState<CustomerVehicle[]>([]);
  const [categories, setCategories] = useState<ServiceIssueCategory[]>([]);
  const [hubs, setHubs] = useState<ServiceHub[]>([]);
  const [slots, setSlots] = useState<SlotCapacity[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Form Selections
  const [selectedVehicle, setSelectedVehicle] = useState<CustomerVehicle | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ServiceIssueCategory | null>(null);
  const [template, setTemplate] = useState<ServiceIssueTemplate | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [customSymptoms, setCustomSymptoms] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<'PICKUP_AND_RETURN' | 'SELF_DROP_AT_HUB'>('PICKUP_AND_RETURN');
  const [selectedHub, setSelectedHub] = useState<ServiceHub | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlotTime, setSelectedSlotTime] = useState<string>('');
  const [paymentOptionsResponse, setPaymentOptionsResponse] = useState<ServiceCategoryPaymentOptionsResponse | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('ZERO_UPFRONT');
  const [loadingPaymentOptions, setLoadingPaymentOptions] = useState(false);
  const [pickupAddress, setPickupAddress] = useState({
    line1: '',
    line2: '',
    city: userCity,
    pincode: userCity.toLowerCase().includes('chennai') ? '600032' : '560103',
    instructions: '',
  });
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [syncingAddresses, setSyncingAddresses] = useState(false);

  const syncSavedAddresses = useCallback(async (autoSelectIfEmpty = false) => {
    setSyncingAddresses(true);
    try {
      const list = await customer.addresses();
      const addrList = Array.isArray(list) ? list : [];
      setSavedAddresses(addrList);
      if (autoSelectIfEmpty && addrList.length > 0 && addrList[0]) {
        const first = addrList[0];
        setPickupAddress(prev => {
          if (!prev.line1.trim()) {
            return {
              ...prev,
              line1: first.addressLine,
              city: first.city || prev.city,
              pincode: first.pincode || prev.pincode,
            };
          }
          return prev;
        });
      }
    } catch (err: any) {
      console.warn('[SYNC_ADDRESSES_ERROR]', err?.message || err);
    } finally {
      setSyncingAddresses(false);
    }
  }, []);

  const applySavedAddress = (sa: CustomerAddress) => {
    setPickupAddress(prev => ({
      ...prev,
      line1: sa.addressLine,
      city: sa.city || prev.city,
      pincode: sa.pincode || prev.pincode,
    }));
  };

  const cityHubs = useMemo(() => {
    if (!hubs.length) return [];
    const normalized = (userCity || '').toLowerCase().trim();
    const filtered = hubs.filter(h => {
      const hCity = h.city.toLowerCase().trim();
      if (hCity === normalized) return true;
      if ((normalized.includes('bengaluru') || normalized.includes('bangalore')) &&
          (hCity.includes('bengaluru') || hCity.includes('bangalore'))) return true;
      return false;
    });
    return filtered.length > 0 ? filtered : hubs;
  }, [hubs, userCity]);

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      const [vList, cList, hList] = await Promise.all([
        fetchCustomerVehicles().catch(err => {
          console.warn('[SERVICE_HOME_VEHICLES_WARN]', err?.message || err);
          return [];
        }),
        fetchServiceCategories(),
        fetchServiceHubs(),
      ]);
      setVehicles(vList);
      setCategories(cList);
      setHubs(hList);

      void syncSavedAddresses(true);

      if (vList.length > 0) {
        if (preselectedVehicleId) {
          const match = vList.find(v => v.id === preselectedVehicleId);
          setSelectedVehicle(match || vList[0] || null);
        } else {
          const preferred = vList.find(v => v.isPreferred);
          setSelectedVehicle(preferred || vList[0] || null);
        }
      }
      if (hList.length > 0) {
        const normalized = (userCity || '').toLowerCase().trim();
        const cityMatch = hList.find(h => {
          const hCity = h.city.toLowerCase().trim();
          return hCity === normalized ||
            ((normalized.includes('bengaluru') || normalized.includes('bangalore')) &&
             (hCity.includes('bengaluru') || hCity.includes('bangalore')));
        });
        setSelectedHub(cityMatch || hList[0] || null);
      }

      // Default date to tomorrow
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);
      setSelectedDate(tomorrowStr);
    } catch (err: any) {
      console.warn('[SERVICE_HOME_INIT_ERROR]', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, [preselectedVehicleId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Load template when category is selected
  const handleSelectCategory = async (cat: ServiceIssueCategory) => {
    setSelectedCategory(cat);
    setLoading(true);
    try {
      const t = await fetchServiceTemplate(cat.categoryKey);
      setTemplate(t);
      setStep(3); // Move to questions
    } catch (err: any) {
      Alert.alert('Error', 'Could not load service details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load slots when hub or date changes
  useEffect(() => {
    if (selectedHub && selectedDate) {
      setLoadingSlots(true);
      fetchSlotAvailability(selectedHub.id, selectedDate)
        .then(res => {
          setSlots(res);
          const firstAvail = res.find(s => s.isAvailable);
          if (firstAvail) setSelectedSlotTime(firstAvail.slotTime);
        })
        .catch(err => console.warn('[SLOTS_ERROR]', err))
        .finally(() => setLoadingSlots(false));
    }
  }, [selectedHub, selectedDate]);

  const handleAnswerChange = (questionId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleNextFromQuestions = () => {
    if (!template) return;
    // Check required questions
    for (const q of template.questions) {
      if (q.required && (answers[q.stableId] === undefined || answers[q.stableId] === '')) {
        Alert.alert('Required Question', `Please answer: "${q.label}"`);
        return;
      }
    }
    setStep(4); // Move to fulfillment
  };

  const loadPaymentOptions = useCallback(async (catKey: string, hubId?: string) => {
    setLoadingPaymentOptions(true);
    try {
      const res = await fetchCategoryPaymentOptions(catKey, hubId);
      setPaymentOptionsResponse(res);
      if (res.options && res.options.length > 0) {
        const rec = res.options.find(o => o.isRecommended) || res.options[0];
        const initialPlanId = rec?.planId || (rec as any)?.id || 'ZERO_UPFRONT';
        setSelectedPlanId(initialPlanId);
      }
    } catch (err) {
      console.warn('Failed to load category payment options', err);
    } finally {
      setLoadingPaymentOptions(false);
    }
  }, []);

  const handleBookService = async () => {
    if (!selectedVehicle || !selectedHub || !selectedCategory) return;
    if (fulfillmentType === 'PICKUP_AND_RETURN' && (!pickupAddress.line1.trim() || !pickupAddress.pincode.trim())) {
      Alert.alert('Address Required', 'Please provide your complete pickup address and pincode.');
      return;
    }
    if (!selectedSlotTime) {
      Alert.alert('Slot Required', 'Please select a preferred appointment time slot.');
      return;
    }

    setSubmitting(true);
    try {
      const selectedPlan = paymentOptionsResponse?.options?.find(o => (o.planId || (o as any).id) === selectedPlanId);
      const payNowPaise = selectedPlan?.payNowPaise ? BigInt(selectedPlan.payNowPaise) : 0n;

      let gatewayOrderId: string | undefined;
      let gatewayPaymentId: string | undefined;
      let gatewaySignature: string | undefined;
      let paymentGateway: string | undefined;

      if (payNowPaise > 0n) {
        paymentGateway = 'DEMO';
        gatewayOrderId = `order_demo_srv_${Date.now()}`;
        gatewayPaymentId = `pay_demo_srv_${Date.now()}`;
        gatewaySignature = 'demo_sig_verified_vmotiv';
      }

      const cleanPickupAddress = fulfillmentType === 'PICKUP_AND_RETURN' && pickupAddress?.line1?.trim()
        ? {
            line1: pickupAddress.line1.trim(),
            line2: pickupAddress.line2?.trim() || undefined,
            city: pickupAddress.city?.trim() || userCity,
            pincode: pickupAddress.pincode ? pickupAddress.pincode.replace(/\s+/g, '').trim() : (userCity.toLowerCase().includes('chennai') ? '600032' : '560103'),
            instructions: pickupAddress.instructions?.trim() || undefined,
          }
        : undefined;

      const result = await createServiceRequest({
        vehicleId: selectedVehicle.id,
        hubId: selectedHub.id,
        categoryKey: selectedCategory.categoryKey,
        customerSymptoms: customSymptoms.trim() || selectedCategory.title,
        questionAnswers: answers,
        fulfillmentType,
        scheduledDate: selectedDate,
        scheduledTimeSlot: selectedSlotTime,
        pickupAddress: cleanPickupAddress,
        paymentPlanId: selectedPlanId,
        paymentGateway,
        gatewayOrderId,
        gatewayPaymentId,
        gatewaySignature,
      });

      const payNowRupees = Math.round(Number(payNowPaise) / 100);
      const balanceRupees = selectedPlan ? Math.round(Number(selectedPlan.balancePaise) / 100) : 0;
      const successMsg = payNowRupees > 0
        ? `Your request #${result.requestNumber} has been confirmed with initial payment of ₹${payNowRupees.toLocaleString('en-IN')}.\n\nRemaining balance: ₹${balanceRupees.toLocaleString('en-IN')}.\nOur service advisor will coordinate vehicle arrival.`
        : `Your request #${result.requestNumber} has been received. Our service advisor will coordinate shortly.`;

      Alert.alert(
        'Service Booked!',
        successMsg,
        [
          {
            text: 'Track Request',
            onPress: () => {
              navigation.replace('ServiceRequestDetails', { requestId: result.id });
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Booking Error', err?.message || 'Could not complete your service booking.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep1Car = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: c.text }]}>1. Select Your Vehicle</Text>
      <Text style={[styles.stepSubtitle, { color: c.textMuted }]}>
        Choose the vehicle you want to book for servicing.
      </Text>

      {vehicles.length === 0 ? (
        <View style={[styles.noCarBox, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Car size={36} color={c.accent} />
          <Text style={[styles.noCarTitle, { color: c.text }]}>No cars in your garage</Text>
          <Text style={[styles.noCarText, { color: c.textMuted }]}>
            Add your car now to proceed with booking your service.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('MyGarage')}
            style={[styles.smallActionBtn, { backgroundColor: c.accent }]}
          >
            <Plus size={16} color="#061A38" />
            <Text style={styles.smallActionBtnText}>Add Car to Garage</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.carListWrap}>
          {vehicles.map((v, vIdx) => {
            const isSelected = selectedVehicle?.id === v.id;
            return (
              <TouchableOpacity
                key={v.id || `veh-${vIdx}`}
                onPress={() => setSelectedVehicle(v)}
                style={[
                  styles.carSelectCard,
                  {
                    backgroundColor: isSelected ? (isDark ? '#162C4E' : '#FFF9E6') : c.surface,
                    borderColor: isSelected ? c.accent : c.border,
                  },
                ]}
              >
                <View style={styles.carSelectLeft}>
                  <CarBrandLogo brand={v.make} size={28} />
                  <View>
                    <Text style={[styles.carSelectTitle, { color: c.text }]}>
                      {v.make} {v.model} ({v.year})
                    </Text>
                    <Text style={[styles.carSelectSub, { color: c.textMuted }]}>
                      {v.registrationNumber || v.fuelType} · {v.odometerKm ? `${v.odometerKm.toLocaleString()} km` : 'No odo'}
                    </Text>
                  </View>
                </View>
                {isSelected && (
                  <View style={[styles.checkCircle, { backgroundColor: c.accent }]}>
                    <Check size={14} color="#061A38" strokeWidth={3} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {selectedVehicle && (
        <TouchableOpacity
          onPress={() => setStep(2)}
          style={[styles.continueBtn, { backgroundColor: c.accent }]}
        >
          <Text style={styles.continueBtnText}>Next: What's the Issue?</Text>
          <ChevronRight size={18} color="#061A38" />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderStep2Category = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: c.text }]}>2. What's wrong with your car?</Text>
      <Text style={[styles.stepSubtitle, { color: c.textMuted }]}>
        Select the symptom or maintenance package needed.
      </Text>

      <View style={styles.categoriesGrid}>
        {categories.map((cat, cIdx) => {
          const IconComponent = CATEGORY_ICON_MAP[cat.categoryKey] || Wrench;
          return (
            <TouchableOpacity
              key={cat.categoryKey || `cat-${cIdx}`}
              onPress={() => handleSelectCategory(cat)}
              style={[
                styles.categoryCard,
                { backgroundColor: c.surface, borderColor: c.border },
              ]}
            >
              <View style={[styles.catIconWrap, { backgroundColor: isDark ? '#142742' : '#EFF6FF' }]}>
                <IconComponent size={24} color={c.accent} />
              </View>
              <View style={styles.catInfoWrap}>
                <Text style={[styles.catTitle, { color: c.text }]}>{cat.title}</Text>
                <Text style={[styles.catDesc, { color: c.textMuted }]} numberOfLines={2}>
                  {cat.description}
                </Text>

                {cat.fixedPackageAvailable && cat.packagePricePaise && (
                  <View style={[styles.pricePill, { backgroundColor: isDark ? '#1C3B24' : '#E8F5E9' }]}>
                    <Text style={styles.pricePillText}>
                      Fixed Package: ₹{(Number(cat.packagePricePaise) / 100).toLocaleString('en-IN')}
                    </Text>
                  </View>
                )}
                {!cat.fixedPackageAvailable && (
                  <View style={[styles.diagPill, { backgroundColor: isDark ? '#232D3F' : '#F1F5F9' }]}>
                    <Text style={[styles.diagPillText, { color: c.textMuted }]}>
                      Inspection & Free Estimate
                    </Text>
                  </View>
                )}
              </View>
              <ChevronRight size={18} color={c.textMuted} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderStep3Questions = () => {
    if (!template) return null;
    return (
      <View style={styles.stepContainer}>
        <View style={styles.templateHeader}>
          <Text style={[styles.stepTitle, { color: c.text }]}>{template.title}</Text>
          <Text style={[styles.stepSubtitle, { color: c.textMuted }]}>
            {template.description}
          </Text>
        </View>

        {/* Package Features List if configured */}
        {template.fixedPackageAvailable && template.packageFeatures && (
          <View style={[styles.packageBox, { backgroundColor: isDark ? '#162C4E' : '#F8FAFC', borderColor: c.border }]}>
            <Text style={[styles.packageBoxTitle, { color: c.text }]}>What’s Included:</Text>
            {template.packageFeatures.map((feat, i) => (
              <View key={`pkg-feat-${i}-${feat}`} style={styles.packageItemRow}>
                <CheckCircle size={14} color="#10B981" />
                <Text style={[styles.packageItemText, { color: c.text }]}>{feat}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Dynamic Questions */}
        <View style={styles.questionsList}>
          {template.questions.map((q, idx) => (
            <View key={q.stableId || `q-${idx}`} style={[styles.questionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={styles.questionHeader}>
                <Text style={[styles.questionNumber, { color: c.accent }]}>Q{idx + 1}</Text>
                <Text style={[styles.questionLabel, { color: c.text }]}>
                  {q.label} {q.required && '*'}
                </Text>
              </View>
              {q.explanation && (
                <Text style={[styles.questionExplanation, { color: c.textMuted }]}>
                  {q.explanation}
                </Text>
              )}

              {/* SINGLE_SELECT */}
              {q.responseType === 'SINGLE_SELECT' && q.options && (
                <View style={styles.optionsWrap}>
                  {q.options.map((opt, optIdx) => {
                    const isSelected = answers[q.stableId] === opt;
                    return (
                      <TouchableOpacity
                        key={`sopt-${optIdx}-${opt}`}
                        onPress={() => handleAnswerChange(q.stableId, opt)}
                        style={[
                          styles.optionBtn,
                          {
                            backgroundColor: isSelected ? (isDark ? '#1C3B5E' : '#FFF9E6') : c.background,
                            borderColor: isSelected ? c.accent : c.border,
                          },
                        ]}
                      >
                        <Text style={[styles.optionBtnText, { color: isSelected ? (isDark ? '#FFFFFF' : '#061A38') : c.text }]}>
                          {opt}
                        </Text>
                        {isSelected && <Check size={14} color={c.accent} strokeWidth={3} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* MULTI_SELECT */}
              {q.responseType === 'MULTI_SELECT' && q.options && (
                <View style={styles.optionsWrap}>
                  {q.options.map((opt, optIdx) => {
                    const currentList: string[] = answers[q.stableId] || [];
                    const isSelected = currentList.includes(opt);
                    const toggle = () => {
                      if (isSelected) {
                        handleAnswerChange(q.stableId, currentList.filter(x => x !== opt));
                      } else {
                        handleAnswerChange(q.stableId, [...currentList, opt]);
                      }
                    };
                    return (
                      <TouchableOpacity
                        key={`mopt-${optIdx}-${opt}`}
                        onPress={toggle}
                        style={[
                          styles.optionBtn,
                          {
                            backgroundColor: isSelected ? (isDark ? '#1C3B5E' : '#FFF9E6') : c.background,
                            borderColor: isSelected ? c.accent : c.border,
                          },
                        ]}
                      >
                        <Text style={[styles.optionBtnText, { color: isSelected ? (isDark ? '#FFFFFF' : '#061A38') : c.text }]}>
                          {opt}
                        </Text>
                        {isSelected && <Check size={14} color={c.accent} strokeWidth={3} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* NUMBER */}
              {q.responseType === 'NUMBER' && (
                <TextInput
                  value={answers[q.stableId]?.toString() || ''}
                  onChangeText={txt => handleAnswerChange(q.stableId, txt)}
                  keyboardType="number-pad"
                  placeholder="Enter value"
                  placeholderTextColor={c.textMuted}
                  style={[styles.input, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
                />
              )}

              {/* TEXT */}
              {q.responseType === 'TEXT' && (
                <TextInput
                  value={answers[q.stableId] || ''}
                  onChangeText={txt => handleAnswerChange(q.stableId, txt)}
                  placeholder="Type your notes or observations here..."
                  placeholderTextColor={c.textMuted}
                  multiline
                  numberOfLines={3}
                  style={[styles.textArea, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
                />
              )}

              {/* BOOLEAN */}
              {q.responseType === 'BOOLEAN' && (
                <View style={styles.booleanRow}>
                  {['Yes', 'No'].map(val => {
                    const boolVal = val === 'Yes';
                    const isSelected = answers[q.stableId] === boolVal;
                    return (
                      <TouchableOpacity
                        key={val}
                        onPress={() => handleAnswerChange(q.stableId, boolVal)}
                        style={[
                          styles.booleanBtn,
                          {
                            backgroundColor: isSelected ? c.accent : c.background,
                            borderColor: isSelected ? c.accent : c.border,
                          },
                        ]}
                      >
                        <Text style={[styles.booleanBtnText, { color: isSelected ? '#061A38' : c.text }]}>
                          {val}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          ))}

          {/* Additional Custom Symptoms Box */}
          <View style={[styles.questionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.questionLabel, { color: c.text }]}>
              Additional Notes or Specific Instructions
            </Text>
            <TextInput
              value={customSymptoms}
              onChangeText={setCustomSymptoms}
              placeholder="e.g. Please also check the horn sound and windscreen wipers..."
              placeholderTextColor={c.textMuted}
              multiline
              numberOfLines={3}
              style={[styles.textArea, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
            />
          </View>
        </View>

        <TouchableOpacity
          onPress={handleNextFromQuestions}
          style={[styles.continueBtn, { backgroundColor: c.accent }]}
        >
          <Text style={styles.continueBtnText}>Next: Pickup or Hub Drop</Text>
          <ChevronRight size={18} color="#061A38" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderStep4Fulfillment = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: c.text }]}>4. How would you like to handover?</Text>
      <Text style={[styles.stepSubtitle, { color: c.textMuted }]}>
        Choose hassle-free doorstep pickup or drop off yourself at our service hub.
      </Text>

      {/* Option A: Pickup & Return */}
      <TouchableOpacity
        onPress={() => setFulfillmentType('PICKUP_AND_RETURN')}
        style={[
          styles.fulfillCard,
          {
            backgroundColor: fulfillmentType === 'PICKUP_AND_RETURN' ? (isDark ? '#162C4E' : '#FFF9E6') : c.surface,
            borderColor: fulfillmentType === 'PICKUP_AND_RETURN' ? c.accent : c.border,
          },
        ]}
      >
        <View style={styles.fulfillHeader}>
          <View style={[styles.fulfillIconCircle, { backgroundColor: isDark ? '#1E3A63' : '#EDF2F7' }]}>
            <Truck size={22} color={c.accent} />
          </View>
          <View style={styles.fulfillTextWrap}>
            <Text style={[styles.fulfillTitle, { color: c.text }]}>Doorstep Pickup & Return</Text>
            <Text style={[styles.fulfillSubtitle, { color: c.textMuted }]}>
              Our driver collects your vehicle from your home/office and returns it post-service.
            </Text>
          </View>
        </View>
        <View style={styles.fulfillFeeRow}>
          <Text style={[styles.feeText, { color: c.text }]}>Logistics & Sanitization: ₹499</Text>
        </View>
      </TouchableOpacity>

      {/* Option B: Self Drop at Hub */}
      <TouchableOpacity
        onPress={() => setFulfillmentType('SELF_DROP_AT_HUB')}
        style={[
          styles.fulfillCard,
          {
            backgroundColor: fulfillmentType === 'SELF_DROP_AT_HUB' ? (isDark ? '#162C4E' : '#FFF9E6') : c.surface,
            borderColor: fulfillmentType === 'SELF_DROP_AT_HUB' ? c.accent : c.border,
          },
        ]}
      >
        <View style={styles.fulfillHeader}>
          <View style={[styles.fulfillIconCircle, { backgroundColor: isDark ? '#1E3A63' : '#EDF2F7' }]}>
            <MapPin size={22} color={c.accent} />
          </View>
          <View style={styles.fulfillTextWrap}>
            <Text style={[styles.fulfillTitle, { color: c.text }]}>Self-Drop at Service Hub</Text>
            <Text style={[styles.fulfillSubtitle, { color: c.textMuted }]}>
              Drive in to your nearest authorized V MOTIV service center.
            </Text>
          </View>
        </View>
        <View style={styles.fulfillFeeRow}>
          <Text style={[styles.freeFeeText, { color: '#10B981' }]}>FREE DROP-OFF</Text>
        </View>
      </TouchableOpacity>

      {/* Address Form if Pickup */}
      {fulfillmentType === 'PICKUP_AND_RETURN' && (
        <View style={[styles.addressBox, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MapPin size={16} color={c.accent} />
              <Text style={[styles.addressBoxTitle, { color: c.text, marginBottom: 0 }]}>Doorstep Pickup & Return Address</Text>
            </View>
            <TouchableOpacity
              onPress={() => void syncSavedAddresses(false)}
              disabled={syncingAddresses}
              accessibilityRole="button"
              accessibilityLabel="Sync saved addresses"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 8,
                backgroundColor: isDark ? '#1E3A63' : '#EDF2F7',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
              }}
            >
              {syncingAddresses ? (
                <ActivityIndicator size="small" color={c.accent} />
              ) : (
                <RefreshCw size={13} color={c.accent} />
              )}
              <Text style={{ fontSize: 12, fontWeight: '700', color: c.accent }}>
                {syncingAddresses ? 'Syncing…' : 'Sync Saved'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Saved Addresses quick-selection bar */}
          {savedAddresses.length > 0 ? (
            <View style={{ marginBottom: space.sm, paddingBottom: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                Saved Addresses (Tap to Auto-Fill):
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
              >
                {savedAddresses.map((sa, saIdx) => {
                  const isSelected = pickupAddress.line1 === sa.addressLine && (!sa.pincode || pickupAddress.pincode === sa.pincode);
                  return (
                    <TouchableOpacity
                      key={sa.id || `sa-${saIdx}`}
                      onPress={() => applySavedAddress(sa)}
                      accessibilityRole="button"
                      accessibilityLabel={`Use saved address ${sa.label}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 6,
                        paddingHorizontal: 11,
                        borderRadius: 20,
                        backgroundColor: isSelected
                          ? (isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7')
                          : (isDark ? '#162C4E' : '#F1F5F9'),
                        borderWidth: 1.5,
                        borderColor: isSelected ? c.accent : (isDark ? '#244577' : '#E2E8F0'),
                      }}
                    >
                      <MapPin size={12} color={isSelected ? c.accent : c.textMuted} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? c.accent : c.text }}>
                        {sa.label || 'Saved'}
                      </Text>
                      <Text style={{ fontSize: 11, color: c.textMuted }}>
                        ({sa.city}{sa.pincode ? ` - ${sa.pincode}` : ''})
                      </Text>
                      {isSelected && <Check size={12} color={c.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ) : (
            <View style={{ marginBottom: 10, padding: 8, borderRadius: 6, backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC' }}>
              <Text style={{ fontSize: 11, color: c.textMuted }}>
                No saved address detected on your profile. Fill in below or tap "Sync Saved" to refresh.
              </Text>
            </View>
          )}

          <TextInput
            value={pickupAddress.line1}
            onChangeText={txt => setPickupAddress(prev => ({ ...prev, line1: txt }))}
            placeholder="House / Flat No., Building, Street *"
            placeholderTextColor={c.textMuted}
            style={[styles.input, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
          />
          <TextInput
            value={pickupAddress.line2}
            onChangeText={txt => setPickupAddress(prev => ({ ...prev, line2: txt }))}
            placeholder="Locality / Landmark"
            placeholderTextColor={c.textMuted}
            style={[styles.input, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
          />
          <View style={styles.inputRow}>
            <View style={styles.inputHalf}>
              <TextInput
                value={pickupAddress.city}
                onChangeText={txt => setPickupAddress(prev => ({ ...prev, city: txt }))}
                placeholder="City"
                placeholderTextColor={c.textMuted}
                style={[styles.input, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
              />
            </View>
            <View style={styles.inputHalf}>
              <TextInput
                value={pickupAddress.pincode}
                onChangeText={txt => setPickupAddress(prev => ({ ...prev, pincode: txt }))}
                placeholder="Pincode *"
                keyboardType="number-pad"
                placeholderTextColor={c.textMuted}
                style={[styles.input, { backgroundColor: c.background, color: c.text, borderColor: c.border }]}
              />
            </View>
          </View>
        </View>
      )}

      {/* Hub Selector */}
      <View style={[styles.addressBox, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[styles.addressBoxTitle, { color: c.text }]}>Service Hub Location</Text>
        <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: space.sm }}>
          Available service centers in {userCity}:
        </Text>
        {cityHubs.map((h: ServiceHub, hIdx) => {
          const isSelected = selectedHub?.id === h.id;
          return (
            <TouchableOpacity
              key={h.id || `hub-${hIdx}`}
              onPress={() => setSelectedHub(h)}
              style={[
                styles.hubOption,
                {
                  backgroundColor: isSelected ? (isDark ? '#1C3B5E' : '#FFF9E6') : c.background,
                  borderColor: isSelected ? c.accent : c.border,
                },
              ]}
            >
              <View style={styles.hubOptionTextWrap}>
                <Text style={[styles.hubOptionName, { color: c.text }]}>{h.name}</Text>
                <Text style={[styles.hubOptionAddress, { color: c.textMuted }]}>{h.address}</Text>
                <Text style={[styles.hubOptionHours, { color: c.textMuted }]}>Hours: {h.operatingHours}</Text>
              </View>
              {isSelected && <Check size={16} color={c.accent} strokeWidth={3} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        onPress={() => setStep(5)}
        style={[styles.continueBtn, { backgroundColor: c.accent }]}
      >
        <Text style={styles.continueBtnText}>Next: Schedule Appointment</Text>
        <ChevronRight size={18} color="#061A38" />
      </TouchableOpacity>
    </View>
  );

  const renderStep5Schedule = () => {
    // Generate next 6 dates
    const dateOptions: Array<{ dateStr: string; label: string; day: string }> = [];
    for (let i = 1; i <= 6; i++) {
      const d = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
      const str = d.toISOString().slice(0, 10);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dateOptions.push({ dateStr: str, label: monthDay, day: dayName });
    }

    return (
      <View style={styles.stepContainer}>
        <Text style={[styles.stepTitle, { color: c.text }]}>5. Choose Date & Time</Text>
        <Text style={[styles.stepSubtitle, { color: c.textMuted }]}>
          Select your preferred appointment date and arrival time window.
        </Text>

        {/* Date Selector Row */}
        <Text style={[styles.label, { color: c.text }]}>Select Date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
          {dateOptions.map((opt, dIdx) => {
            const isSelected = selectedDate === opt.dateStr;
            return (
              <TouchableOpacity
                key={opt.dateStr || `date-${dIdx}`}
                onPress={() => setSelectedDate(opt.dateStr)}
                style={[
                  styles.datePill,
                  {
                    backgroundColor: isSelected ? c.accent : c.surface,
                    borderColor: isSelected ? c.accent : c.border,
                  },
                ]}
              >
                <Text style={[styles.dateDay, { color: isSelected ? '#061A38' : c.textMuted }]}>
                  {opt.day}
                </Text>
                <Text style={[styles.dateLabel, { color: isSelected ? '#061A38' : c.text }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Time Slots */}
        <Text style={[styles.label, { color: c.text, marginTop: space.lg }]}>
          Available Time Slots
        </Text>

        {loadingSlots ? (
          <ActivityIndicator size="small" color={c.accent} style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.slotsGrid}>
            {slots.map((s, sIdx) => {
              const isSelected = selectedSlotTime === s.slotTime;
              const disabled = !s.isAvailable;
              return (
                <TouchableOpacity
                  key={s.slotTime || `slot-${sIdx}`}
                  disabled={disabled}
                  onPress={() => setSelectedSlotTime(s.slotTime)}
                  style={[
                    styles.slotCard,
                    {
                      backgroundColor: isSelected ? (isDark ? '#1C3B5E' : '#FFF9E6') : c.surface,
                      borderColor: isSelected ? c.accent : c.border,
                      opacity: disabled ? 0.4 : 1,
                    },
                  ]}
                >
                  <Clock size={16} color={isSelected ? c.accent : c.textMuted} />
                  <Text style={[styles.slotTimeText, { color: isSelected ? (isDark ? '#FFFFFF' : '#061A38') : c.text }]}>
                    {s.slotTime}
                  </Text>
                  <Text style={[styles.slotCapText, { color: s.isAvailable ? '#10B981' : '#EF4444' }]}>
                    {s.isAvailable ? `${s.availableCount} bays left` : 'Full'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TouchableOpacity
          onPress={() => {
            if (selectedCategory) {
              void loadPaymentOptions(selectedCategory.categoryKey, selectedHub?.id);
            }
            setStep(6);
          }}
          style={[styles.continueBtn, { backgroundColor: c.accent, marginTop: space.xl }]}
        >
          <Text style={styles.continueBtnText}>Next: Review & Payment Options</Text>
          <ChevronRight size={18} color="#061A38" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderStep6Review = () => {
    if (!selectedVehicle || !selectedCategory || !selectedHub) return null;
    const isPackage = paymentOptionsResponse?.fixedPackageAvailable ?? (selectedCategory.fixedPackageAvailable && selectedCategory.packagePricePaise);
    const effectivePricePaise = paymentOptionsResponse?.packagePricePaise ?? selectedCategory.packagePricePaise;
    const packageAmount = isPackage && effectivePricePaise ? Number(effectivePricePaise) / 100 : 0;
    const pickupFee = fulfillmentType === 'PICKUP_AND_RETURN' ? 499 : 0;
    const totalEst = packageAmount + pickupFee;

    const availableOptions = paymentOptionsResponse?.options || [
      {
        planId: 'ZERO_UPFRONT',
        title: 'Zero Upfront Booking',
        description: 'Pay ₹0 today. Full inspection and estimate approval before work commences. Settle at workshop.',
        payNowPaise: '0',
        balancePaise: isPackage ? String(totalEst * 100) : '0',
        isRecommended: true,
      },
      {
        planId: 'PARTIAL_ADVANCE_25',
        title: 'Priority Advance (25%)',
        description: 'Pay 25% today to lock bay and technician priority. Remaining balance settled post-service.',
        percentage: 25,
        payNowPaise: isPackage ? String(Math.round(totalEst * 25)) : '12500',
        balancePaise: isPackage ? String(Math.round(totalEst * 75)) : '37500',
      },
      {
        planId: 'FULL_PAYMENT_100',
        title: 'Full Advance Payment (100%)',
        description: 'Pay 100% upfront for express vehicle release without checkout delays.',
        percentage: 100,
        payNowPaise: isPackage ? String(totalEst * 100) : '50000',
        balancePaise: '0',
      },
    ];

    const currentSelectedPlan = availableOptions.find(o => (o.planId || (o as any).id) === selectedPlanId) || availableOptions[0];
    const payNowRupees = currentSelectedPlan ? Math.round(Number(currentSelectedPlan.payNowPaise) / 100) : 0;
    const balanceRupees = currentSelectedPlan ? Math.round(Number(currentSelectedPlan.balancePaise) / 100) : 0;

    return (
      <View style={styles.stepContainer}>
        <Text style={[styles.stepTitle, { color: c.text }]}>6. Summary & Payment Options</Text>
        <Text style={[styles.stepSubtitle, { color: c.textMuted }]}>
          Review booking details and select your payment plan before confirming.
        </Text>

        {/* Appointment Card */}
        <View style={[styles.reviewCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.reviewRow}>
            <Text style={[styles.reviewLabel, { color: c.textMuted }]}>Vehicle</Text>
            <Text style={[styles.reviewValue, { color: c.text }]}>
              {selectedVehicle.make} {selectedVehicle.model} ({selectedVehicle.year})
            </Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={[styles.reviewLabel, { color: c.textMuted }]}>Service</Text>
            <Text style={[styles.reviewValue, { color: c.text }]}>{selectedCategory.title}</Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={[styles.reviewLabel, { color: c.textMuted }]}>Handover Mode</Text>
            <Text style={[styles.reviewValue, { color: c.text }]}>
              {fulfillmentType === 'PICKUP_AND_RETURN' ? 'Doorstep Pickup & Return' : 'Self-Drop at Hub'}
            </Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={[styles.reviewLabel, { color: c.textMuted }]}>Hub</Text>
            <Text style={[styles.reviewValue, { color: c.text }]}>{selectedHub.name}</Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={[styles.reviewLabel, { color: c.textMuted }]}>Appointment</Text>
            <Text style={[styles.reviewValue, { color: c.text }]}>
              {selectedDate} · {selectedSlotTime}
            </Text>
          </View>

          {/* Pricing Breakdown */}
          <View style={[styles.priceBreakdown, { borderTopColor: c.border }]}>
            {isPackage ? (
              <View style={styles.priceRow}>
                <Text style={[styles.priceItemLabel, { color: c.text }]}>Service Package Fee</Text>
                <Text style={[styles.priceItemVal, { color: c.text }]}>₹{packageAmount.toLocaleString('en-IN')}</Text>
              </View>
            ) : (
              <View style={styles.priceRow}>
                <Text style={[styles.priceItemLabel, { color: c.text }]}>Inspection & Diagnosis</Text>
                <Text style={[styles.priceItemVal, { color: '#10B981' }]}>Included / Estimate Post-Check</Text>
              </View>
            )}

            {fulfillmentType === 'PICKUP_AND_RETURN' && (
              <View style={styles.priceRow}>
                <Text style={[styles.priceItemLabel, { color: c.text }]}>Doorstep Pickup & Return</Text>
                <Text style={[styles.priceItemVal, { color: c.text }]}>₹499</Text>
              </View>
            )}

            {isPackage && (
              <View style={[styles.totalRow, { borderTopColor: c.border }]}>
                <Text style={[styles.totalLabel, { color: c.text }]}>Total Configured Price</Text>
                <Text style={[styles.totalVal, { color: c.accent }]}>₹{totalEst.toLocaleString('en-IN')}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Included Deliverables if any */}
        {selectedCategory.packageFeatures && selectedCategory.packageFeatures.length > 0 && (
          <View style={[styles.reviewCard, { backgroundColor: c.surface, borderColor: c.border, padding: 14 }]}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.accent, marginBottom: 8, textTransform: 'uppercase' }}>
              Included in this Package
            </Text>
            {selectedCategory.packageFeatures.map((feat, idx) => (
              <View key={`sel-feat-${idx}-${feat}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <CheckCircle size={14} color="#10B981" />
                <Text style={{ fontSize: 12, color: c.text }}>{feat}</Text>
              </View>
            ))}
          </View>
        )}

        {/* PAYMENT OPTIONS SELECTOR */}
        <View style={{ marginTop: 6 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 4 }}>
            Choose Booking Payment Option
          </Text>
          <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 12 }}>
            Select an authorized advance payment plan or choose zero upfront booking.
          </Text>

          {loadingPaymentOptions ? (
            <ActivityIndicator size="small" color={c.accent} style={{ padding: 20 }} />
          ) : (
            <View style={{ gap: 10 }}>
              {availableOptions.map((opt, optIdx) => {
                const planKey = opt.planId || (opt as any).id || `plan-${optIdx}`;
                const isSelected = (selectedPlanId || 'ZERO_UPFRONT') === planKey;
                const optPayNow = Math.round(Number(opt.payNowPaise) / 100);
                const optBal = Math.round(Number(opt.balancePaise) / 100);

                return (
                  <TouchableOpacity
                    key={planKey}
                    activeOpacity={0.8}
                    onPress={() => setSelectedPlanId(planKey)}
                    style={{
                      backgroundColor: isSelected ? 'rgba(247, 181, 3, 0.08)' : c.surface,
                      borderWidth: isSelected ? 2 : 1,
                      borderColor: isSelected ? c.accent : c.border,
                      borderRadius: 10,
                      padding: 14,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            borderWidth: 2,
                            borderColor: isSelected ? c.accent : c.textMuted,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {isSelected && (
                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} />
                          )}
                        </View>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>
                          {opt.title}
                        </Text>
                      </View>
                      {opt.isRecommended && (
                        <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#10B981' }}>POPULAR</Text>
                        </View>
                      )}
                    </View>

                    <Text style={{ fontSize: 12, color: c.textMuted, marginLeft: 26, marginBottom: 8, lineHeight: 16 }}>
                      {opt.description}
                    </Text>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginLeft: 26, paddingTop: 6, borderTopWidth: 1, borderTopColor: isSelected ? 'rgba(247, 181, 3, 0.2)' : c.border }}>
                      <Text style={{ fontSize: 12, color: c.textMuted }}>
                        Pay Now: <Text style={{ fontWeight: '800', color: '#10B981' }}>₹{optPayNow.toLocaleString('en-IN')}</Text>
                      </Text>
                      <Text style={{ fontSize: 12, color: c.textMuted }}>
                        Balance Later: <Text style={{ fontWeight: '700', color: optBal > 0 ? c.text : '#10B981' }}>₹{optBal.toLocaleString('en-IN')}</Text>
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Selected Plan Summary Banner */}
        <View style={{ backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F3F4F6', borderRadius: 8, padding: 14, marginTop: 14, borderWidth: 1, borderColor: c.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ fontSize: 13, color: c.textMuted }}>Total Payable Today:</Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#10B981' }}>₹{payNowRupees.toLocaleString('en-IN')}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: c.textMuted }}>Remaining Due on Completion:</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: balanceRupees > 0 ? c.text : '#10B981' }}>₹{balanceRupees.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleBookService}
          disabled={submitting}
          style={[styles.confirmBtn, { backgroundColor: c.accent, marginTop: 16 }]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#061A38" />
          ) : (
            <Text style={styles.confirmBtnText}>
              {payNowRupees > 0
                ? `Pay ₹${payNowRupees.toLocaleString('en-IN')} & Confirm Service`
                : 'Confirm & Book Service (₹0 Upfront)'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={() => {
            if (step > 1) setStep(step - 1);
            else navigation.goBack();
          }}
          style={[styles.iconBtn, { backgroundColor: c.surface }]}
        >
          <ArrowLeft size={20} color={c.text} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: c.text }]}>Book Car Service</Text>
        <View style={styles.stepBadge}>
          <Text style={[styles.stepBadgeText, { color: c.textMuted }]}>
            Step {step} of 6
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: isKeyboardVisible ? 240 : 120 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={true}
        >
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={c.accent} />
              <Text style={[styles.loadingText, { color: c.textMuted }]}>Loading service options...</Text>
            </View>
          ) : (
            <>
              {step === 1 && renderStep1Car()}
              {step === 2 && renderStep2Category()}
              {step === 3 && renderStep3Questions()}
              {step === 4 && renderStep4Fulfillment()}
              {step === 5 && renderStep5Schedule()}
              {step === 6 && renderStep6Review()}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  stepBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    padding: space.lg,
    paddingBottom: 40,
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  stepContainer: {
    gap: space.md,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  stepSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  noCarBox: {
    padding: 24,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: 12,
    marginVertical: 12,
  },
  noCarTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  noCarText: {
    fontSize: 13,
    textAlign: 'center',
  },
  smallActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  smallActionBtnText: {
    color: '#061A38',
    fontSize: 13,
    fontWeight: '700',
  },
  carListWrap: {
    gap: 10,
    marginVertical: 8,
  },
  carSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  carSelectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  carSelectTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  carSelectSub: {
    fontSize: 12,
    marginTop: 2,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: radius.pill,
    marginTop: space.lg,
  },
  continueBtnText: {
    color: '#061A38',
    fontSize: 15,
    fontWeight: '700',
  },
  categoriesGrid: {
    gap: 12,
    marginTop: 8,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 12,
  },
  catIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catInfoWrap: {
    flex: 1,
    gap: 4,
  },
  catTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  catDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  pricePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  pricePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
  diagPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  diagPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  templateHeader: {
    gap: 4,
  },
  packageBox: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 8,
  },
  packageBoxTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  packageItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  packageItemText: {
    fontSize: 13,
  },
  questionsList: {
    gap: space.md,
    marginTop: 8,
  },
  questionCard: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 8,
  },
  questionHeader: {
    flexDirection: 'row',
    gap: 6,
  },
  questionNumber: {
    fontSize: 14,
    fontWeight: '700',
  },
  questionLabel: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  questionExplanation: {
    fontSize: 12,
  },
  optionsWrap: {
    gap: 8,
    marginTop: 4,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  optionBtnText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  booleanRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  booleanBtn: {
    flex: 1,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  booleanBtnText: {
    fontSize: 14,
    fontWeight: '600',
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
  fulfillCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    gap: 8,
  },
  fulfillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fulfillIconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fulfillTextWrap: {
    flex: 1,
  },
  fulfillTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  fulfillSubtitle: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  fulfillFeeRow: {
    alignSelf: 'flex-start',
    paddingTop: 4,
  },
  feeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  freeFeeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  addressBox: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 10,
  },
  addressBoxTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputHalf: {
    flex: 1,
  },
  hubOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
  },
  hubOptionTextWrap: {
    flex: 1,
    gap: 2,
  },
  hubOptionName: {
    fontSize: 14,
    fontWeight: '700',
  },
  hubOptionAddress: {
    fontSize: 12,
  },
  hubOptionHours: {
    fontSize: 11,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  dateScroll: {
    gap: 10,
  },
  datePill: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 80,
  },
  dateDay: {
    fontSize: 12,
    fontWeight: '600',
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  slotCard: {
    width: '48%',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  slotTimeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  slotCapText: {
    fontSize: 11,
    fontWeight: '600',
  },
  reviewCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 12,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewLabel: {
    fontSize: 13,
  },
  reviewValue: {
    fontSize: 14,
    fontWeight: '600',
    maxWidth: '65%',
    textAlign: 'right',
  },
  priceBreakdown: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    gap: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  priceItemLabel: {
    fontSize: 13,
  },
  priceItemVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  totalVal: {
    fontSize: 17,
    fontWeight: '800',
  },
  confirmBtn: {
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
  },
  confirmBtnText: {
    color: '#061A38',
    fontSize: 16,
    fontWeight: '700',
  },
});
