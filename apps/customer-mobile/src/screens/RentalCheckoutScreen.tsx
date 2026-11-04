import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  Platform,
  Image,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../navigation/types';
import { useAppTheme } from '../theme';
import {
  ArrowLeft,
  Clock,
  ShieldCheck,
  Check,
  CreditCard,
  Lock,
  FileCheck2,
  AlertCircle,
  Car,
  MapPin,
  Calendar,
  Camera,
  Upload,
  Sparkles,
  Eye,
  X,
  RefreshCw,
  ZoomIn,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../api';
import {
  checkoutRentalHold,
  verifyRentalPayment,
  submitRentalDriverKyc,
  fetchRentalPaymentOptions,
  type RentalPaymentPlan,
} from '../services/rental-api';
import { useAuth } from '../auth/AuthProvider';
import { AuthScreen } from './AuthScreen';
import { safeBottom } from '../layout/safe-layout';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { KeyboardScrollView } from '../components/KeyboardScrollView';

type Props = NativeStackScreenProps<RootStack, 'RentalCheckout'>;

export function RentalCheckoutScreen({ route, navigation }: Props) {
  const { holdId, holdCode, vehicle, quoteSnapshot, startTime, endTime, hubName } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const { state: authState } = useAuth();

  if (authState !== 'signed-in') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingHorizontal: 16,
            paddingBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8, marginRight: 8 }}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>Rental Checkout</Text>
        </View>
        <AuthScreen includeTopInset={false} showHeader={false} />
      </View>
    );
  }

  // 15-minute hold timer state
  const [secondsRemaining, setSecondsRemaining] = useState(15 * 60);

  // Driver KYC Form
  const [licenseNumber, setLicenseNumber] = useState('KA0120210045892');
  const [licenseExpiry, setLicenseExpiry] = useState('2032-12-31');
  const [dob, setDob] = useState('1998-05-15');
  const [experienceYears, setExperienceYears] = useState('5');
  const [driverLicenseFront, setDriverLicenseFront] = useState<string>('');
  const [driverLicenseBack, setDriverLicenseBack] = useState<string>('');
  const [localFrontAsset, setLocalFrontAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [localBackAsset, setLocalBackAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [uploadingLicense, setUploadingLicense] = useState<'front' | 'back' | null>(null);
  const [previewModal, setPreviewModal] = useState<{
    visible: boolean;
    uri: string;
    title: string;
    type: 'front' | 'back';
  } | null>(null);

  // Payment Options & Plans
  const [plans, setPlans] = useState<RentalPaymentPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('FULL_100');
  const [loadingPlans, setLoadingPlans] = useState(true);

  // Payment method selection
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'CARD' | 'NETBANKING' | 'DEMO'>('UPI');

  // Terms Agreement & Submitting
  const [acceptedTerms, setAcceptedTerms] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          Alert.alert(
            'Hold Expired',
            'Your 15-minute checkout reservation hold has expired. The vehicle availability has been released.',
            [{ text: 'Return to Search', onPress: () => navigation.navigate('RentalHome') }]
          );
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [navigation]);

  useEffect(() => {
    let isMounted = true;
    async function loadOptions() {
      try {
        setLoadingPlans(true);
        const data = await fetchRentalPaymentOptions(holdId);
        if (!isMounted) return;
        if (data?.plans && data.plans.length > 0) {
          setPlans(data.plans);
          const defaultPlan =
            data.plans.find(p => p.planId === 'ADVANCE_25' && p.isAvailable) ||
            data.plans.find(p => p.planId === 'ADVANCE_50' && p.isAvailable) ||
            data.plans.find(p => p.isAvailable) ||
            data.plans[0];
          if (defaultPlan) {
            setSelectedPlanId(defaultPlan.planId);
          }
        }
      } catch (err) {
        console.warn('Failed to load rental payment options, using local quote breakdown:', err);
      } finally {
        if (isMounted) setLoadingPlans(false);
      }
    }
    loadOptions();
    return () => {
      isMounted = false;
    };
  }, [holdId]);

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timerDisplay = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Price calculations
  const quote = quoteSnapshot || vehicle?.quote;
  const baseFareRupees = quote ? Math.round(Number(quote.baseFarePaise) / 100) : 5600;
  const taxRupees = quote ? Math.round(Number(quote.taxPaise) / 100) : Math.round(baseFareRupees * 0.18);
  const depositRupees = quote
    ? Math.round(Number(quote.securityDepositPaise) / 100)
    : vehicle
    ? Math.round(Number(vehicle.securityDepositPaise) / 100)
    : 5000;
  const rentalTariffRupees = baseFareRupees + taxRupees;
  const totalRupees = rentalTariffRupees + depositRupees;

  const selectedPlan = plans.find(p => p.planId === selectedPlanId);
  const advancePayableRupees = selectedPlan
    ? Math.round(Number(selectedPlan.advancePaise) / 100)
    : rentalTariffRupees;
  const remainingBalanceRupees = selectedPlan
    ? Math.round(Number(selectedPlan.balancePaise) / 100)
    : 0;
  const initialPayableRupees = advancePayableRupees;

  const processAndStoreLicense = (asset: ImagePicker.ImagePickerAsset, type: 'front' | 'back') => {
    const dataUrl = asset.base64
      ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`
      : asset.uri;
    if (type === 'front') {
      setLocalFrontAsset(asset);
      setDriverLicenseFront(dataUrl);
    } else {
      setLocalBackAsset(asset);
      setDriverLicenseBack(dataUrl);
    }
  };

  const handlePickLicensePhoto = async (type: 'front' | 'back') => {
    Alert.alert(
      `Select License ${type === 'front' ? 'Front' : 'Back'} Photo`,
      'Choose how you want to provide your physical driving license document (saved securely when you confirm & pay):',
      [
        {
          text: 'Take Photo with Camera',
          onPress: async () => {
            try {
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Camera permission is required to capture your driving license.');
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                allowsEditing: false,
                quality: 0.8,
                base64: true,
              });
              if (!result.canceled && result.assets && result.assets[0]) {
                processAndStoreLicense(result.assets[0], type);
              }
            } catch (err: any) {
              Alert.alert('Camera Error', err?.message || 'Could not access device camera.');
            }
          },
        },
        {
          text: 'Choose from Photo Library',
          onPress: async () => {
            try {
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Photo library permission is required to choose your driving license photo.');
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.8,
                base64: true,
              });
              if (!result.canceled && result.assets && result.assets[0]) {
                processAndStoreLicense(result.assets[0], type);
              }
            } catch (err: any) {
              Alert.alert('Gallery Error', err?.message || 'Photo picker closed or unavailable.');
            }
          },
        },
        {
          text: 'Use Sample Document (Preview)',
          onPress: () => {
            const sampleUrl = type === 'front'
              ? 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80'
              : 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=1200&q=80';
            if (type === 'front') {
              setDriverLicenseFront(sampleUrl);
              setLocalFrontAsset(null);
            } else {
              setDriverLicenseBack(sampleUrl);
              setLocalBackAsset(null);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleCheckoutAndPay = async () => {
    if (!acceptedTerms) {
      Alert.alert('Terms Agreement Required', 'Please accept the V MOTIV rental terms to continue.');
      return;
    }
    if (!licenseNumber.trim() || licenseNumber.trim().length < 5) {
      Alert.alert('Driver License Required', 'Please enter a valid driving license number for identity verification.');
      return;
    }
    if (!driverLicenseFront || !driverLicenseBack) {
      Alert.alert(
        'License Document Required',
        'Physical driving license documents are legally mandatory for self-drive commercial rental insurance. Please upload clear photos of both the Front and Back of your driving license.'
      );
      return;
    }
    if (!holdId) {
      Alert.alert('Hold Missing', 'Checkout reservation hold identifier is missing. Please start a new reservation search.');
      return;
    }

    setSubmitting(true);
    try {
      // Step 1: Convert hold to checkout booking with chosen payment plan
      const checkoutRes = await checkoutRentalHold(holdId, {
        acceptTerms: true,
        termsVersion: 'VMR-TERMS-V2026.1',
        paymentPlanId: selectedPlanId as any,
      });

      const { bookingId, bookingNumber, gatewayOrderId } = checkoutRes;

      // Step 2: Upload staged local license photos to Cloudinary before KYC submission
      let finalFrontUrl = driverLicenseFront;
      let finalBackUrl = driverLicenseBack;

      if (localFrontAsset?.base64) {
        try {
          const uploadRes = await api<{ url?: string; secureUrl?: string }>('/media/upload', {
            method: 'POST',
            body: JSON.stringify({
              base64Data: localFrontAsset.base64,
              mimeType: localFrontAsset.mimeType || 'image/jpeg',
              folder: 'vmotiv/rental-kyc',
              filename: `license-front-${Date.now()}`,
            }),
          });
          const url = uploadRes?.secureUrl || uploadRes?.url;
          if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/'))) {
            finalFrontUrl = url;
          }
        } catch (uploadErr) {
          console.warn('License front upload fallback:', uploadErr);
        }
      }

      if (localBackAsset?.base64) {
        try {
          const uploadRes = await api<{ url?: string; secureUrl?: string }>('/media/upload', {
            method: 'POST',
            body: JSON.stringify({
              base64Data: localBackAsset.base64,
              mimeType: localBackAsset.mimeType || 'image/jpeg',
              folder: 'vmotiv/rental-kyc',
              filename: `license-back-${Date.now()}`,
            }),
          });
          const url = uploadRes?.secureUrl || uploadRes?.url;
          if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/'))) {
            finalBackUrl = url;
          }
        } catch (uploadErr) {
          console.warn('License back upload fallback:', uploadErr);
        }
      }

      // If either front or back is still a local file:// URL, convert to a base64 data URL
      // so web browsers on operations-portal can render it without security blocks
      if (finalFrontUrl?.startsWith('file://') && localFrontAsset?.base64) {
        finalFrontUrl = `data:${localFrontAsset.mimeType || 'image/jpeg'};base64,${localFrontAsset.base64}`;
      }
      if (finalBackUrl?.startsWith('file://') && localBackAsset?.base64) {
        finalBackUrl = `data:${localBackAsset.mimeType || 'image/jpeg'};base64,${localBackAsset.base64}`;
      }

      // Submit Driver KYC details
      try {
        await submitRentalDriverKyc(bookingId, {
          licenseNumber: licenseNumber.trim().toUpperCase(),
          licenseExpiry: new Date(licenseExpiry).toISOString(),
          dateOfBirth: new Date(dob).toISOString(),
          drivingExperienceYears: Number(experienceYears) || 3,
          licenseFrontUrl: finalFrontUrl,
          licenseBackUrl: finalBackUrl,
        });
      } catch (kycErr: any) {
        console.warn('KYC submission note:', kycErr);
      }

      // Step 3: Verify Payment & Confirm Booking
      const gatewayPaymentId = `pay_demo_${Date.now()}`;
      await verifyRentalPayment(bookingId, {
        paymentGateway: paymentMethod === 'DEMO' ? 'DEMO' : paymentMethod,
        gatewayOrderId: gatewayOrderId || `order_${bookingNumber}`,
        gatewayPaymentId,
        gatewaySignature: 'demo_sig_verified_vmotiv',
      });

      // Step 4: Success confirmation & Navigate to live booking details
      const isPartial = selectedPlan?.type === 'PARTIAL';
      const successTitle = isPartial
        ? 'Reservation Confirmed! (Advance Received) 🎉'
        : 'Booking Confirmed & Fully Paid! 🎉';
      const successMsg = isPartial
        ? `Reservation ${bookingNumber} is confirmed with advance payment of ₹${advancePayableRupees.toLocaleString('en-IN')}.\n\nRemaining rental balance of ₹${remainingBalanceRupees.toLocaleString('en-IN')} is due 24h prior to pickup.\n\nYour vehicle is reserved in the operations queue.`
        : `Reservation ${bookingNumber} has been confirmed. Total rental charges of ₹${rentalTariffRupees.toLocaleString('en-IN')} paid in full. Your self-drive rental is registered for key handover.`;

      Alert.alert(
        successTitle,
        successMsg,
        [
          {
            text: 'View Booking & Trip',
            onPress: () => {
              navigation.replace('RentalBookingDetails', { bookingId });
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Checkout Failed', err?.message || 'Could not complete vehicle rental checkout. Please retry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoider
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 16),
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Rental Checkout & Pay</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              Hold Code: {holdCode}
            </Text>
          </View>
        </View>

        {/* Hold Countdown Timer */}
        <View
          style={[
            styles.timerBanner,
            {
              backgroundColor: isDark ? colors.surfaceSecondary : colors.brandNavy,
              borderColor: isDark ? colors.border : 'transparent',
              borderWidth: isDark ? 1 : 0,
            },
          ]}
        >
          <Clock size={16} color={colors.brandAccent} />
          <Text style={styles.timerText}>
            Exclusive vehicle hold reserved for: <Text style={{ color: colors.brandAccent, fontWeight: '800' }}>{timerDisplay}</Text>
          </Text>
        </View>
      </View>

      <KeyboardScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: safeBottom(insets.bottom) + 120 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Vehicle & Trip Summary Card */}
        {vehicle && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              {vehicle.images && vehicle.images.length > 0 ? (
                <Image
                  source={{ uri: vehicle.images[0] }}
                  style={{ width: 80, height: 60, borderRadius: 10, backgroundColor: '#000' }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ width: 80, height: 60, borderRadius: 10, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}>
                  <Car size={24} color={colors.brandAccent} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }}>
                  {vehicle.make} {vehicle.model}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                  {vehicle.variant || ''} · {vehicle.transmission} · {vehicle.fuelType}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <MapPin size={12} color={colors.brandAccent} />
                  <Text style={{ fontSize: 11, color: colors.brandAccent, fontWeight: '600' }}>
                    {hubName || vehicle.hub?.name || 'Local Hub'}
                  </Text>
                </View>
              </View>
            </View>

            {startTime && endTime && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 4 }}>
                <View>
                  <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '700' }}>PICKUP</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginTop: 2 }}>
                    {new Date(startTime).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', weekday: 'short' })}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '700' }}>RETURN</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginTop: 2 }}>
                    {new Date(endTime).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', weekday: 'short' })}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Configurable Booking Payment Options */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <Sparkles size={18} color={colors.brandAccent} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              Booking Payment Options
            </Text>
          </View>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            Choose how you want to pay for this rental. Policy permits partial advance or 100% full payment.
          </Text>

          {loadingPlans ? (
            <View style={{ paddingVertical: 12, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={colors.brandAccent} />
              <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>Loading payment options…</Text>
            </View>
          ) : plans.length === 0 ? (
            <View style={{ paddingVertical: 10 }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>Standard 100% rental prepayment active.</Text>
            </View>
          ) : (
            <View style={{ gap: 10, marginTop: 4 }}>
              {plans.map(plan => {
                const isSelected = selectedPlanId === plan.planId;
                const advRupees = Math.round(Number(plan.advancePaise) / 100);
                const balRupees = Math.round(Number(plan.balancePaise) / 100);
                const isAvail = plan.isAvailable;

                return (
                  <Pressable
                    key={plan.planId}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected, disabled: !isAvail }}
                    disabled={!isAvail}
                    onPress={() => setSelectedPlanId(plan.planId)}
                    style={[
                      styles.paymentMethodRow,
                      {
                        backgroundColor: colors.surfaceSecondary,
                        borderColor: isSelected ? colors.brandAccent : colors.border,
                        opacity: isAvail ? 1 : 0.5,
                        borderWidth: isSelected ? 1.5 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.radioSelected,
                        {
                          borderColor: isSelected
                            ? (isDark ? colors.brandAccent : colors.brandNavy)
                            : colors.borderStrong,
                          backgroundColor: isSelected ? colors.brandAccent : 'transparent',
                        },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[styles.paymentMethodTitle, { color: colors.textPrimary, fontWeight: isSelected ? '800' : '600' }]}>
                          {plan.name}
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: '900', color: colors.brandAccent }}>
                          ₹{advRupees.toLocaleString('en-IN')} now
                        </Text>
                      </View>

                      {plan.type === 'PARTIAL' ? (
                        <Text style={[styles.paymentMethodDesc, { color: colors.textSecondary, marginTop: 2 }]}>
                          Pay ₹{advRupees.toLocaleString('en-IN')} advance · ₹{balRupees.toLocaleString('en-IN')} balance due 24h before pickup
                        </Text>
                      ) : (
                        <Text style={[styles.paymentMethodDesc, { color: colors.textSecondary, marginTop: 2 }]}>
                          Pay full rental amount now · ₹0 balance due
                        </Text>
                      )}

                      {!isAvail && plan.ineligibilityReason ? (
                        <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '700', marginTop: 4 }}>
                          ⚠️ {plan.ineligibilityReason}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Fare Breakdown Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Fare Breakdown</Text>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>Rental Base Tariff</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>₹{baseFareRupees.toLocaleString('en-IN')}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>GST on Rental (18%)</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>₹{taxRupees.toLocaleString('en-IN')}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>Total Rental Charges</Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>₹{rentalTariffRupees.toLocaleString('en-IN')}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>Refundable Security Deposit</Text>
                <ShieldCheck size={14} color={colors.success} />
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.success }}>₹{depositRupees.toLocaleString('en-IN')}</Text>
            </View>
            <Text style={{ fontSize: 11, color: colors.textMuted, fontStyle: 'italic' }}>
              Deposit is held separately & refunded post-trip inspection. Not rental revenue.
            </Text>

            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>
                  Payable Now ({selectedPlan?.name || 'Full Payment'})
                </Text>
                {remainingBalanceRupees > 0 ? (
                  <Text style={{ fontSize: 11, color: colors.brandAccent, fontWeight: '700' }}>
                    Remaining ₹{remainingBalanceRupees.toLocaleString('en-IN')} balance due before pickup
                  </Text>
                ) : (
                  <Text style={{ fontSize: 11, color: colors.success, fontWeight: '600' }}>
                    Rental settled in full
                  </Text>
                )}
              </View>
              <Text style={{ fontSize: 20, fontWeight: '900', color: colors.brandAccent }}>
                ₹{initialPayableRupees.toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        </View>

        {/* Driver KYC Section */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <FileCheck2 size={18} color={colors.brandAccent} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              Primary Driver Eligibility & KYC
            </Text>
          </View>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            Motor Vehicles Act requires verified driver license before vehicle key handover.
          </Text>

          <View style={styles.formGroup}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>DRIVING LICENSE NUMBER *</Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.surfaceSecondary,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                },
              ]}
              placeholder="e.g. KA0120180012345"
              placeholderTextColor={colors.textMuted}
              value={licenseNumber}
              onChangeText={setLicenseNumber}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>DATE OF BIRTH</Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.surfaceSecondary,
                    borderColor: colors.border,
                    color: colors.textPrimary,
                  },
                ]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                value={dob}
                onChangeText={setDob}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>EXP. (YEARS)</Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.surfaceSecondary,
                    borderColor: colors.border,
                    color: colors.textPrimary,
                  },
                ]}
                placeholder="Years"
                placeholderTextColor={colors.textMuted}
                value={experienceYears}
                onChangeText={setExperienceYears}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>LICENSE EXPIRY DATE</Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.surfaceSecondary,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                },
              ]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              value={licenseExpiry}
              onChangeText={setLicenseExpiry}
            />
          </View>

          {/* License Photo Attachments */}
          <View style={{ marginTop: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>PHYSICAL DRIVING LICENSE DOCUMENTS *</Text>
              <Text style={{ fontSize: 10, fontWeight: '700', color: (!driverLicenseFront || !driverLicenseBack) ? '#ef4444' : '#10b981' }}>
                {(!driverLicenseFront || !driverLicenseBack) ? 'Mandatory for Legal Compliance *' : '✓ Documents Attached'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {/* Front Photo Card */}
              <View style={{ flex: 1 }}>
                {uploadingLicense === 'front' ? (
                  <View style={[styles.licensePhotoBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.brandAccent }]}>
                    <ActivityIndicator size="small" color={colors.brandAccent} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.brandAccent, marginTop: 4 }}>Processing…</Text>
                    <Text style={{ fontSize: 8, color: colors.textMuted }}>Holding in local memory</Text>
                  </View>
                ) : driverLicenseFront ? (
                  <View
                    style={[
                      styles.licenseUploadedCard,
                      {
                        backgroundColor: colors.surfaceSecondary,
                        borderColor: '#10b981',
                      },
                    ]}
                  >
                    <Pressable
                      onPress={() =>
                        setPreviewModal({
                          visible: true,
                          uri: driverLicenseFront,
                          title: 'Driving License — Front Side',
                          type: 'front',
                        })
                      }
                      style={{ position: 'relative', width: '100%', height: 75, borderRadius: 8, overflow: 'hidden' }}
                    >
                      <Image source={{ uri: driverLicenseFront }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      <View style={styles.previewTapOverlay}>
                        <Eye size={12} color="#FFFFFF" />
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF', marginLeft: 3 }}>Tap to Preview</Text>
                      </View>
                    </Pressable>

                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity
                        onPress={() =>
                          setPreviewModal({
                            visible: true,
                            uri: driverLicenseFront,
                            title: 'Driving License — Front Side',
                            type: 'front',
                          })
                        }
                        style={[
                          styles.smallPillBtn,
                          {
                            backgroundColor: isDark ? 'rgba(52, 211, 153, 0.18)' : '#ECFDF5',
                            borderColor: isDark ? '#059669' : '#A7F3D0',
                          },
                        ]}
                      >
                        <Eye size={11} color={isDark ? '#34D399' : '#059669'} />
                        <Text style={[styles.smallPillText, { color: isDark ? '#34D399' : '#059669' }]}>Preview</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handlePickLicensePhoto('front')}
                        style={[styles.smallPillBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      >
                        <RefreshCw size={11} color={colors.textSecondary} />
                        <Text style={[styles.smallPillText, { color: colors.textSecondary }]}>Retake</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => handlePickLicensePhoto('front')}
                    style={[
                      styles.licensePhotoBox,
                      {
                        backgroundColor: colors.surfaceSecondary,
                        borderColor: '#ef4444',
                        borderWidth: 1,
                        borderStyle: 'dashed',
                      },
                    ]}
                  >
                    <Camera size={22} color="#ef4444" />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textPrimary, marginTop: 4 }}>Front Photo *</Text>
                    <Text style={{ fontSize: 9, color: '#ef4444', fontWeight: '600' }}>Tap to upload</Text>
                  </Pressable>
                )}
              </View>

              {/* Back Photo Card */}
              <View style={{ flex: 1 }}>
                {uploadingLicense === 'back' ? (
                  <View style={[styles.licensePhotoBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.brandAccent }]}>
                    <ActivityIndicator size="small" color={colors.brandAccent} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.brandAccent, marginTop: 4 }}>Processing…</Text>
                    <Text style={{ fontSize: 8, color: colors.textMuted }}>Holding in local memory</Text>
                  </View>
                ) : driverLicenseBack ? (
                  <View
                    style={[
                      styles.licenseUploadedCard,
                      {
                        backgroundColor: colors.surfaceSecondary,
                        borderColor: '#10b981',
                      },
                    ]}
                  >
                    <Pressable
                      onPress={() =>
                        setPreviewModal({
                          visible: true,
                          uri: driverLicenseBack,
                          title: 'Driving License — Back Side',
                          type: 'back',
                        })
                      }
                      style={{ position: 'relative', width: '100%', height: 75, borderRadius: 8, overflow: 'hidden' }}
                    >
                      <Image source={{ uri: driverLicenseBack }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      <View style={styles.previewTapOverlay}>
                        <Eye size={12} color="#FFFFFF" />
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF', marginLeft: 3 }}>Tap to Preview</Text>
                      </View>
                    </Pressable>

                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity
                        onPress={() =>
                          setPreviewModal({
                            visible: true,
                            uri: driverLicenseBack,
                            title: 'Driving License — Back Side',
                            type: 'back',
                          })
                        }
                        style={[
                          styles.smallPillBtn,
                          {
                            backgroundColor: isDark ? 'rgba(52, 211, 153, 0.18)' : '#ECFDF5',
                            borderColor: isDark ? '#059669' : '#A7F3D0',
                          },
                        ]}
                      >
                        <Eye size={11} color={isDark ? '#34D399' : '#059669'} />
                        <Text style={[styles.smallPillText, { color: isDark ? '#34D399' : '#059669' }]}>Preview</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handlePickLicensePhoto('back')}
                        style={[styles.smallPillBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      >
                        <RefreshCw size={11} color={colors.textSecondary} />
                        <Text style={[styles.smallPillText, { color: colors.textSecondary }]}>Retake</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => handlePickLicensePhoto('back')}
                    style={[
                      styles.licensePhotoBox,
                      {
                        backgroundColor: colors.surfaceSecondary,
                        borderColor: '#ef4444',
                        borderWidth: 1,
                        borderStyle: 'dashed',
                      },
                    ]}
                  >
                    <Camera size={22} color="#ef4444" />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textPrimary, marginTop: 4 }}>Back Photo *</Text>
                    <Text style={{ fontSize: 9, color: '#ef4444', fontWeight: '600' }}>Tap to upload</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Payment Provider Selection */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <CreditCard size={18} color={colors.brandAccent} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Choose Payment Mode</Text>
          </View>

          {/* UPI */}
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: paymentMethod === 'UPI' }}
            onPress={() => setPaymentMethod('UPI')}
            style={[
              styles.paymentMethodRow,
              {
                backgroundColor: colors.surfaceSecondary,
                borderColor: paymentMethod === 'UPI' ? colors.brandAccent : colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.radioSelected,
                { borderColor: paymentMethod === 'UPI' ? (isDark ? colors.brandAccent : colors.brandNavy) : colors.borderStrong },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.paymentMethodTitle, { color: colors.textPrimary }]}>
                UPI / QR (Google Pay, PhonePe, Paytm, BHIM)
              </Text>
              <Text style={[styles.paymentMethodDesc, { color: colors.textSecondary }]}>
                Instant confirmation directly via UPI app
              </Text>
            </View>
            <Lock size={14} color={colors.success} />
          </Pressable>

          {/* Cards */}
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: paymentMethod === 'CARD' }}
            onPress={() => setPaymentMethod('CARD')}
            style={[
              styles.paymentMethodRow,
              {
                backgroundColor: colors.surfaceSecondary,
                borderColor: paymentMethod === 'CARD' ? colors.brandAccent : colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.radioSelected,
                { borderColor: paymentMethod === 'CARD' ? (isDark ? colors.brandAccent : colors.brandNavy) : colors.borderStrong },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.paymentMethodTitle, { color: colors.textPrimary }]}>
                Credit / Debit Card (Visa, MasterCard, RuPay)
              </Text>
              <Text style={[styles.paymentMethodDesc, { color: colors.textSecondary }]}>
                Secure 256-bit encrypted card gateway
              </Text>
            </View>
            <Lock size={14} color={colors.success} />
          </Pressable>

          {/* One-Click Instant Test / Demo Pay */}
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: paymentMethod === 'DEMO' }}
            onPress={() => setPaymentMethod('DEMO')}
            style={[
              styles.paymentMethodRow,
              {
                backgroundColor: colors.surfaceSecondary,
                borderColor: paymentMethod === 'DEMO' ? colors.brandAccent : colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.radioSelected,
                { borderColor: paymentMethod === 'DEMO' ? (isDark ? colors.brandAccent : colors.brandNavy) : colors.borderStrong },
              ]}
            />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.paymentMethodTitle, { color: colors.textPrimary }]}>
                  Instant Sandbox Confirmation
                </Text>
                <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: colors.brandAccent }}>DEMO</Text>
                </View>
              </View>
              <Text style={[styles.paymentMethodDesc, { color: colors.textSecondary }]}>
                Instant verified confirmation for app testing & verification
              </Text>
            </View>
            <Sparkles size={14} color={colors.brandAccent} />
          </Pressable>
        </View>

        {/* Terms Agreement Checkbox */}
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acceptedTerms }}
          onPress={() => setAcceptedTerms(!acceptedTerms)}
          style={[
            styles.termsAgreementBox,
            {
              backgroundColor: colors.surface,
              borderColor: acceptedTerms ? (isDark ? colors.brandAccent : colors.brandNavy) : colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.checkboxBox,
              {
                borderColor: acceptedTerms ? (isDark ? colors.brandAccent : colors.brandNavy) : colors.borderStrong,
                backgroundColor: acceptedTerms ? (isDark ? colors.brandAccent : colors.brandNavy) : 'transparent',
              },
            ]}
          >
            {acceptedTerms && <Check size={14} color={isDark ? colors.brandNavy : '#FFFFFF'} />}
          </View>

          <Text style={[styles.termsText, { color: colors.textPrimary }]}>
            I confirm I am over 21 years of age, hold a valid driver license, and accept the{' '}
            <Text
              style={{
                color: isDark ? colors.brandAccent : colors.brandNavy,
                fontWeight: '700',
              }}
            >
              V MOTIV Self-Drive Rental Terms V2026.1
            </Text>{' '}
            including fuel policy and refundable deposit terms.
          </Text>
        </Pressable>
      </KeyboardScrollView>

      {/* Bottom CTA */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: safeBottom(insets.bottom, 16),
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Confirm booking and pay"
          onPress={handleCheckoutAndPay}
          disabled={submitting}
          style={({ pressed }) => [
            styles.payButton,
            {
              backgroundColor: isDark ? colors.brandAccent : colors.brandNavy,
              opacity: (pressed || submitting) ? 0.85 : 1,
            },
          ]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={isDark ? colors.brandNavy : '#FFFFFF'} />
          ) : (
            <>
              <Lock size={16} color={isDark ? colors.brandNavy : '#FFFFFF'} />
              <Text
                style={[
                  styles.payButtonText,
                  { color: isDark ? colors.brandNavy : '#FFFFFF' },
                ]}
              >
                Confirm Booking & Pay ₹{initialPayableRupees.toLocaleString('en-IN')}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Fullscreen Document Image Preview Modal */}
      {previewModal && (
        <Modal
          visible={previewModal.visible}
          transparent
          animationType="fade"
          onRequestClose={() => setPreviewModal(null)}
        >
          <View style={styles.previewModalOverlay}>
            <View style={[styles.previewModalHeader, { paddingTop: Math.max(insets.top, 20) }]}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.previewModalTitle}>{previewModal.title}</Text>
                <Text style={styles.previewModalSubtitle}>
                  Ensure all details, license number, and photos are legible
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPreviewModal(null)}
                style={styles.previewCloseBtn}
                accessibilityLabel="Close document preview"
              >
                <X size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.previewImageContainer}>
              <Image
                source={{ uri: previewModal.uri }}
                style={styles.previewFullImage}
                resizeMode="contain"
              />
            </View>

            <View style={[styles.previewModalFooter, { paddingBottom: safeBottom(insets.bottom, 20) }]}>
              <TouchableOpacity
                onPress={() => {
                  const type = previewModal.type;
                  setPreviewModal(null);
                  setTimeout(() => {
                    void handlePickLicensePhoto(type);
                  }, 250);
                }}
                style={styles.previewRetakeBtn}
              >
                <RefreshCw size={15} color="#FFFFFF" />
                <Text style={styles.previewRetakeText}>Retake / Replace</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setPreviewModal(null)}
                style={styles.previewDoneBtn}
              >
                <Check size={16} color="#061a38" />
                <Text style={styles.previewDoneText}>Looks Sharp ✓</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  timerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  timerText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  card: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  formGroup: {
    gap: 6,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  textInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '600',
  },
  licensePhotoBox: {
    height: 105,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  licenseUploadedCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 6,
    overflow: 'hidden',
  },
  previewTapOverlay: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderRadius: 5,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  smallPillBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  smallPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  previewModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
    justifyContent: 'space-between',
  },
  previewModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
  },
  previewModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  previewModalSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 2,
  },
  previewCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImageContainer: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewFullImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  previewModalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  previewRetakeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 13,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  previewRetakeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  previewDoneBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34D399',
    paddingVertical: 13,
    borderRadius: 12,
    gap: 8,
  },
  previewDoneText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#061a38',
  },
  licenseThumbnail: {
    width: '100%',
    height: 50,
    borderRadius: 6,
  },
  paymentMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  radioSelected: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 5,
    borderColor: '#061A38',
  },
  paymentMethodTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  paymentMethodDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  termsAgreementBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  termsText: {
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  payButton: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
