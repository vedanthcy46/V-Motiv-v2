import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronRight,
  FileCheck,
  LogOut,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react-native';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../auth/AuthProvider';
import { customer } from '../services/customer';
import { color, radius, space, useAppTheme, type ThemeColors } from '../theme';
import { friendlyError } from '../format';
import type { SupportedCity } from '../types';
import { safeBottom } from '../layout/safe-layout';
import { KeyboardAvoider } from '../components/KeyboardAvoider';

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile, signOut } = useAuth();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [phone, setPhone] = useState(profile?.phone?.replace(/^\+91/, '') ?? '');
  const [cities, setCities] = useState<SupportedCity[]>([]);
  const [preferredCity, setPreferredCity] = useState(profile?.preferredCity ?? '');
  const [marketing, setMarketing] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void customer
      .cities()
      .then((c) => {
        setCities(c);
        if (!preferredCity && c.length > 0 && c[0]?.name) {
          setPreferredCity(c[0].name);
        }
      })
      .catch(() => undefined);
  }, []);

  const continueApp = async () => {
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (!cleanPhone) {
      setError('Mobile number is required to proceed.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      setError('Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
      return;
    }
    if (!accepted) {
      setError('Please accept the Terms of Service & Privacy Notice to proceed.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await customer.updateProfile({
        phone: `+91${cleanPhone}`,
        preferredCity: preferredCity || undefined,
        marketingConsent: marketing,
        termsVersion: 'customer-v2-2026-10',
      });
      await refreshProfile();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoider
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: safeBottom(insets.bottom, space.md) + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand Emblem */}
          <View style={styles.brandHeader}>
            <BrandLogo variant="horizontal" size={38} />
            <Text style={styles.badgePill}>VERIFIED ACCOUNT</Text>
          </View>

          <Text style={styles.welcomeTitle}>Welcome aboard</Text>
          <Text style={styles.welcomeSubtitle}>
            Configure your customer preferences to personalise your verified car buying and selling experience.
          </Text>

          {/* Section: Mobile */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Phone size={16} color={colors.brandAccent} />
              <Text style={styles.cardTitle}>
                Mobile Number <Text style={{ color: colors.brandAccent }}>*</Text>
              </Text>
            </View>
            <Text style={styles.cardDesc}>
              Required for test drive coordination, inspection appointments, and booking status updates.
            </Text>
            <View style={styles.phoneInputRow}>
              <View style={styles.countryCodeBadge}>
                <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                placeholder="98765 43210"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={(text) => {
                  const cleaned = text.replace(/\D/g, '').slice(0, 10);
                  setPhone(cleaned);
                  if (error) setError('');
                }}
                maxLength={10}
              />
            </View>
          </View>

          {/* Section: City */}
          {cities.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <MapPin size={16} color={colors.brandAccent} />
                <Text style={styles.cardTitle}>Preferred City</Text>
              </View>
              <Text style={styles.cardDesc}>
                Filters verified inventory and local hub availability.
              </Text>
              <View style={styles.cityGrid}>
                {cities.map((city) => {
                  const isSelected = preferredCity === city.name;
                  return (
                    <TouchableOpacity
                      key={city.id}
                      activeOpacity={0.8}
                      style={[
                        styles.cityChip,
                        isSelected && styles.cityChipActive,
                      ]}
                      onPress={() => setPreferredCity(city.name)}
                    >
                      <Text
                        style={[
                          styles.cityChipText,
                          isSelected && styles.cityChipTextActive,
                        ]}
                      >
                        {city.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Section: Terms & Conditions */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <FileCheck size={16} color={colors.brandAccent} />
              <Text style={styles.cardTitle}>Terms & Privacy Notice *</Text>
            </View>
            <Text style={styles.cardDesc}>
              By proceeding, you agree to the V MOTIV Customer Terms of Service and acknowledge the Customer Privacy Policy.
            </Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>I accept the Terms and Privacy Policy</Text>
              <Switch
                value={accepted}
                onValueChange={setAccepted}
                trackColor={{ false: colors.border, true: colors.brandAccent }}
                thumbColor={isDark ? '#FFFFFF' : '#FFFFFF'}
              />
            </View>
          </View>

          {/* Section: Marketing */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Bell size={16} color={colors.brandAccent} />
              <Text style={styles.cardTitle}>Promotional Updates (Optional)</Text>
            </View>
            <Text style={styles.cardDesc}>
              Receive exclusive alerts on premium price drops, fresh verified arrivals, and special seasonal valuation offers.
            </Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Enable promotional alerts</Text>
              <Switch
                value={marketing}
                onValueChange={setMarketing}
                trackColor={{ false: colors.border, true: colors.brandAccent }}
                thumbColor={isDark ? '#FFFFFF' : '#FFFFFF'}
              />
            </View>
          </View>

          {/* Error Message */}
          {error ? (
            <View style={styles.errorBox}>
              <AlertCircle size={15} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Continue Button */}
          <TouchableOpacity
            style={styles.continueBtn}
            disabled={busy}
            activeOpacity={0.8}
            onPress={continueApp}
          >
            {busy ? (
              <ActivityIndicator color={colors.brandNavy} />
            ) : (
              <>
                <Text style={styles.continueBtnText}>Continue to V MOTIV</Text>
                <ChevronRight size={18} color={colors.brandNavy} />
              </>
            )}
          </TouchableOpacity>

          {/* Sign Out Button */}
          <TouchableOpacity
            style={styles.signOutBtn}
            activeOpacity={0.7}
            onPress={() => void signOut()}
          >
            <LogOut size={14} color={colors.textMuted} />
            <Text style={styles.signOutBtnText}>Sign out of this Google Account</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: space.lg,
    },
    brandHeader: {
      alignItems: 'center',
      marginBottom: space.lg,
      gap: space.xs,
    },
    badgePill: {
      color: isDark ? colors.brandAccent : '#92400E',
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1.5,
      marginTop: 4,
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.1)' : 'rgba(247, 181, 3, 0.15)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    welcomeTitle: {
      color: colors.textPrimary,
      fontSize: 24,
      fontWeight: '900',
      textAlign: 'center',
    },
    welcomeSubtitle: {
      color: colors.textMuted,
      fontSize: 13,
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 20,
      marginBottom: space.xl,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: space.md,
    },
    cardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    cardTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    cardDesc: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      marginBottom: space.sm,
    },
    phoneInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    countryCodeBadge: {
      backgroundColor: colors.surfaceSecondary,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    countryCodeText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '700',
    },
    phoneInput: {
      flex: 1,
      backgroundColor: colors.surfaceSecondary,
      paddingHorizontal: space.md,
      paddingVertical: 10,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.textPrimary,
      fontSize: 14,
    },
    cityGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.xs,
    },
    cityChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cityChipActive: {
      backgroundColor: colors.brandAccent,
      borderColor: colors.brandAccent,
    },
    cityChipText: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: '600',
    },
    cityChipTextActive: {
      color: colors.brandNavy,
      fontWeight: '800',
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: space.xs,
    },
    switchLabel: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '600',
      flex: 1,
      marginRight: space.sm,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      borderRadius: radius.sm,
      padding: space.sm,
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.25)',
      marginBottom: space.md,
    },
    errorText: {
      color: '#EF4444',
      fontSize: 12,
      flex: 1,
    },
    continueBtn: {
      backgroundColor: colors.brandAccent,
      borderRadius: radius.md,
      paddingVertical: space.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
      marginTop: space.sm,
    },
    continueBtnText: {
      color: colors.brandNavy,
      fontSize: 15,
      fontWeight: '800',
    },
    signOutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: space.md,
      marginTop: space.xs,
    },
    signOutBtnText: {
      color: colors.textMuted,
      fontSize: 12,
    },
  });
