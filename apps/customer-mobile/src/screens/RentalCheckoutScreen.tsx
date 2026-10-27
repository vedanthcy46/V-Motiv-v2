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
} from 'lucide-react-native';

type Props = NativeStackScreenProps<RootStack, 'RentalCheckout'>;

export function RentalCheckoutScreen({ route, navigation }: Props) {
  const { holdCode } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();

  // 15-minute hold timer state
  const [secondsRemaining, setSecondsRemaining] = useState(15 * 60);

  // Driver KYC Form
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('2032-12-31');
  const [dob, setDob] = useState('1998-05-15');
  const [experienceYears, setExperienceYears] = useState('5');

  // Terms Agreement
  const [acceptedTerms, setAcceptedTerms] = useState(false);

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

  const handleCheckoutAndPay = () => {
    Alert.alert(
      'Online checkout is not available yet',
      'This screen no longer creates test KYC documents or simulated payment confirmations. Live booking will be enabled only after secure document upload and a payment provider are configured.'
    );
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
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Secure Checkout</Text>
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
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Driver KYC Section */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <FileCheck2 size={18} color={colors.brandAccent} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              Primary Driver Eligibility
            </Text>
          </View>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            Indian Motor Vehicles Act requires verified driver license before vehicle key handover.
          </Text>

          <View style={styles.formGroup}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>DRIVING LICENSE NUMBER</Text>
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
        </View>

        {/* Payment Provider Selection */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <CreditCard size={18} color={colors.brandAccent} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Payment Method</Text>
          </View>

          <View style={[styles.paymentMethodRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.brandAccent }]}>
            <View
              style={[
                styles.radioSelected,
                { borderColor: isDark ? colors.brandAccent : colors.brandNavy },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.paymentMethodTitle, { color: colors.textPrimary }]}>
                Razorpay Payment Gateway
              </Text>
              <Text style={[styles.paymentMethodDesc, { color: colors.textSecondary }]}>
                Instant UPI (GPay, PhonePe, Paytm), Credit/Debit Card & NetBanking
              </Text>
            </View>
            <Lock size={16} color={colors.success} />
          </View>
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
          accessibilityLabel="Online checkout availability"
          onPress={handleCheckoutAndPay}
          style={({ pressed }) => [
            styles.payButton,
            {
              backgroundColor: isDark ? colors.brandAccent : colors.brandNavy,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Lock size={16} color={isDark ? colors.brandNavy : '#FFFFFF'} />
          <Text
            style={[
              styles.payButtonText,
              { color: isDark ? colors.brandNavy : '#FFFFFF' },
            ]}
          >
            Online checkout coming soon
          </Text>
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
