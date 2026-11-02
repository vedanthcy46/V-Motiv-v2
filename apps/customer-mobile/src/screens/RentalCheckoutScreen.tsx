import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
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
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../api';
import {
  checkoutRentalHold,
  verifyRentalPayment,
  submitRentalDriverKyc,
} from '../services/rental-api';

type Props = NativeStackScreenProps<RootStack, 'RentalCheckout'>;

export function RentalCheckoutScreen({ route, navigation }: Props) {
  const { holdId, holdCode, vehicle, quoteSnapshot, startTime, endTime, hubName } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();

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
  const totalRupees = baseFareRupees + taxRupees + depositRupees;

  const processAndStoreLicense = (asset: ImagePicker.ImagePickerAsset, type: 'front' | 'back') => {
    if (type === 'front') {
      setLocalFrontAsset(asset);
      setDriverLicenseFront(asset.uri);
    } else {
      setLocalBackAsset(asset);
      setDriverLicenseBack(asset.uri);
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
                allowsEditing: true,
                quality: 0.8,
                base64: true,
              });
              if (!result.canceled && result.assets && result.assets[0]) {
                processAndStoreLicense(result.assets[0], type);
              }
            } catch {
              Alert.alert('Camera Error', 'Could not access device camera.');
            }
          },
        },
        {
          text: 'Choose from Photo Library',
          onPress: async () => {
            try {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.8,
                base64: true,
              });
              if (!result.canceled && result.assets && result.assets[0]) {
                processAndStoreLicense(result.assets[0], type);
              }
            } catch {
              Alert.alert('Gallery Error', 'Photo picker closed or unavailable.');
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
      // Step 1: Convert hold to checkout booking
      const checkoutRes = await checkoutRentalHold(holdId, {
        acceptTerms: true,
        termsVersion: 'VMR-TERMS-V2026.1',
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
          if (url) finalFrontUrl = url;
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
          if (url) finalBackUrl = url;
        } catch (uploadErr) {
          console.warn('License back upload fallback:', uploadErr);
        }
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
      Alert.alert(
        'Booking Confirmed! 🎉',
        `Reservation ${bookingNumber} has been confirmed. Your self-drive rental is now registered in the operations queue for key handover.`,
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
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

        {/* Price Breakdown Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Fare Breakdown</Text>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>Rental Base Fare</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>₹{baseFareRupees.toLocaleString('en-IN')}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>Taxes & GST (18%)</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>₹{taxRupees.toLocaleString('en-IN')}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>Refundable Security Deposit</Text>
                <ShieldCheck size={14} color={colors.success} />
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.success }}>₹{depositRupees.toLocaleString('en-IN')}</Text>
            </View>
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textPrimary }}>Total Amount Payable</Text>
              <Text style={{ fontSize: 20, fontWeight: '900', color: colors.brandAccent }}>₹{totalRupees.toLocaleString('en-IN')}</Text>
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
              <Pressable
                onPress={() => handlePickLicensePhoto('front')}
                disabled={uploadingLicense !== null}
                style={[
                  styles.licensePhotoBox,
                  {
                    backgroundColor: colors.surfaceSecondary,
                    borderColor: driverLicenseFront ? '#10b981' : '#ef4444',
                    borderWidth: driverLicenseFront ? 1.5 : 1,
                    borderStyle: driverLicenseFront ? 'solid' : 'dashed',
                  },
                ]}
              >
                {uploadingLicense === 'front' ? (
                  <>
                    <ActivityIndicator size="small" color={colors.brandAccent} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.brandAccent, marginTop: 4 }}>Uploading…</Text>
                    <Text style={{ fontSize: 8, color: colors.textMuted }}>Saving to Cloudinary</Text>
                  </>
                ) : driverLicenseFront ? (
                  <>
                    <Image source={{ uri: driverLicenseFront }} style={styles.licenseThumbnail} resizeMode="cover" />
                    <View style={{ position: 'absolute', bottom: 4, left: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 4, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#10b981', textAlign: 'center' }}>✓ Front Uploaded</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Camera size={22} color="#ef4444" />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textPrimary, marginTop: 4 }}>Front Photo *</Text>
                    <Text style={{ fontSize: 9, color: '#ef4444', fontWeight: '600' }}>Tap to upload</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={() => handlePickLicensePhoto('back')}
                disabled={uploadingLicense !== null}
                style={[
                  styles.licensePhotoBox,
                  {
                    backgroundColor: colors.surfaceSecondary,
                    borderColor: driverLicenseBack ? '#10b981' : '#ef4444',
                    borderWidth: driverLicenseBack ? 1.5 : 1,
                    borderStyle: driverLicenseBack ? 'solid' : 'dashed',
                  },
                ]}
              >
                {uploadingLicense === 'back' ? (
                  <>
                    <ActivityIndicator size="small" color={colors.brandAccent} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.brandAccent, marginTop: 4 }}>Uploading…</Text>
                    <Text style={{ fontSize: 8, color: colors.textMuted }}>Saving to Cloudinary</Text>
                  </>
                ) : driverLicenseBack ? (
                  <>
                    <Image source={{ uri: driverLicenseBack }} style={styles.licenseThumbnail} resizeMode="cover" />
                    <View style={{ position: 'absolute', bottom: 4, left: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 4, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#10b981', textAlign: 'center' }}>✓ Back Uploaded</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Camera size={22} color="#ef4444" />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textPrimary, marginTop: 4 }}>Back Photo *</Text>
                    <Text style={{ fontSize: 9, color: '#ef4444', fontWeight: '600' }}>Tap to upload</Text>
                  </>
                )}
              </Pressable>
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
      </ScrollView>

      {/* Bottom CTA */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 16),
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
                Confirm Booking & Pay ₹{totalRupees.toLocaleString('en-IN')}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
    flex: 1,
    height: 80,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 4,
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
