import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Home,
  MapPin,
  Sparkles,
} from 'lucide-react-native';
import type { RootStack } from '../navigation/types';
import { customer } from '../services/customer';
import { color, radius, space, useAppTheme, type ThemeColors } from '../theme';
import { friendlyError } from '../format';
import type { CustomerAddress, SupportedCity } from '../types';
import { KEYBOARD_AVOIDING_BEHAVIOR } from '../layout/safe-layout';

const SLOTS = ['10:00-12:00', '12:00-14:00', '15:00-17:00'] as const;

export function TestDriveScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'TestDrive'>) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const scrollRef = useRef<ScrollView>(null);
  const { listingId, title } = route.params;

  const dates = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const d = new Date();
      d.setDate(d.getDate() + index + 1);
      return d;
    });
  }, []);

  const [date, setDate] = useState(() => (dates[0] ? dates[0].toISOString().slice(0, 10) : ''));
  const [slot, setSlot] = useState<string>(SLOTS[0]);
  const [cities, setCities] = useState<SupportedCity[]>([]);
  const [serviceCity, setServiceCity] = useState('');
  const [locationPreference, setLocationPreference] = useState<'HUB' | 'HOME'>('HUB');
  const [address, setAddress] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    customer
      .cities()
      .then((res) => {
        setCities(res);
        if (res.length > 0 && !serviceCity && res[0]?.name) {
          setServiceCity(res[0].name);
        }
      })
      .catch(() => setError('Supported locations could not be loaded.'));
    customer
      .addresses()
      .then((data) => setSavedAddresses(data as CustomerAddress[]))
      .catch(() => undefined);
  }, []);

  const submit = async () => {
    if (!serviceCity) {
      setError('Select a supported city before submitting.');
      return;
    }
    if (locationPreference === 'HOME' && address.trim().length < 10) {
      setError('Please provide a complete doorstep delivery address (minimum 10 characters).');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await customer.bookTestDrive({
        listingId,
        requestedDate: date,
        timeSlot: slot,
        serviceCity,
        locationPreference,
        address: address.trim() || undefined,
        customerNotes: notes.trim() || undefined,
      });
      navigation.replace('Tabs', { screen: 'Activity' });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={KEYBOARD_AVOIDING_BEHAVIOR}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Book a Test Drive</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: space.xl },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Assurance banner */}
          <View style={styles.assuranceBanner}>
            <Sparkles size={18} color={color.yellow} />
            <Text style={styles.assuranceText}>
              Experience the vehicle firsthand. Zero pressure, sanitized, and accompanied by a certified V MOTIV vehicle specialist.
            </Text>
          </View>

          {/* Date Picker */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Calendar size={16} color={color.yellow} />
              <Text style={styles.sectionTitle}>Preferred Date</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dateList}
            >
              {dates.map((d) => {
                const id = d.toISOString().slice(0, 10);
                const isSelected = id === date;
                const dayName = d.toLocaleDateString('en-IN', { weekday: 'short' });
                const dayNum = d.toLocaleDateString('en-IN', { day: 'numeric' });
                const monthName = d.toLocaleDateString('en-IN', { month: 'short' });

                return (
                  <TouchableOpacity
                    key={id}
                    activeOpacity={0.8}
                    style={[styles.dateCard, isSelected && styles.dateCardActive]}
                    onPress={() => setDate(id)}
                  >
                    <Text style={[styles.dayName, isSelected && styles.dayNameActive]}>
                      {dayName}
                    </Text>
                    <Text style={[styles.dayNum, isSelected && styles.dayNumActive]}>
                      {dayNum}
                    </Text>
                    <Text style={[styles.monthName, isSelected && styles.monthNameActive]}>
                      {monthName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Time Slot */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Clock size={16} color={color.yellow} />
              <Text style={styles.sectionTitle}>Preferred Time Slot</Text>
            </View>
            <View style={styles.slotGrid}>
              {SLOTS.map((s) => {
                const isSelected = s === slot;
                const formatted = s.replace('-', ' to ');
                return (
                  <TouchableOpacity
                    key={s}
                    activeOpacity={0.8}
                    style={[styles.slotPill, isSelected && styles.slotPillActive]}
                    onPress={() => setSlot(s)}
                  >
                    <Text style={[styles.slotText, isSelected && styles.slotTextActive]}>
                      {formatted}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Location Preference */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MapPin size={16} color={color.yellow} />
              <Text style={styles.sectionTitle}>Experience Location</Text>
            </View>
            <View style={styles.locationToggle}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[
                  styles.locationCard,
                  locationPreference === 'HUB' && styles.locationCardActive,
                ]}
                onPress={() => setLocationPreference('HUB')}
              >
                <Building2
                  size={20}
                  color={locationPreference === 'HUB' ? color.yellow : color.muted}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.locationCardTitle,
                      locationPreference === 'HUB' && styles.locationCardTitleActive,
                    ]}
                  >
                    V MOTIV Hub
                  </Text>
                  <Text style={styles.locationCardDesc}>
                    Visit our state-of-the-art inspection center
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                style={[
                  styles.locationCard,
                  locationPreference === 'HOME' && styles.locationCardActive,
                ]}
                onPress={() => setLocationPreference('HOME')}
              >
                <Home
                  size={20}
                  color={locationPreference === 'HOME' ? color.yellow : color.muted}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.locationCardTitle,
                      locationPreference === 'HOME' && styles.locationCardTitleActive,
                    ]}
                  >
                    Doorstep Test Drive
                  </Text>
                  <Text style={styles.locationCardDesc}>
                    We bring the car directly to your residence
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Service City */}
          <View style={styles.section}>
            <Text style={styles.inputLabel}>City *</Text>
            <View style={styles.cityPills}>
              {cities.map((c) => {
                const isSelected = c.name === serviceCity;
                return (
                  <TouchableOpacity
                    key={c.id}
                    activeOpacity={0.8}
                    style={[styles.cityPill, isSelected && styles.cityPillActive]}
                    onPress={() => setServiceCity(c.name)}
                  >
                    <Text style={[styles.cityText, isSelected && styles.cityTextActive]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Address if HOME */}
          {locationPreference === 'HOME' && (
            <View style={styles.section}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.xs }}>
                <Text style={styles.inputLabel}>Doorstep Address *</Text>
                {savedAddresses.length > 0 && (
                  <Text style={{ fontSize: 11, color: color.yellow, fontWeight: '600' }}>Tap saved address to auto-fill</Text>
                )}
              </View>

              {savedAddresses.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
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
                        setAddress(`${sa.addressLine}, ${sa.city} - ${sa.pincode}`);
                        if (cities.some((c) => c.name.toLowerCase() === sa.city.toLowerCase())) {
                          setServiceCity(sa.city);
                        }
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
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="House / Flat No., Society / Building, Landmark, City & Pincode"
                placeholderTextColor={color.muted}
                value={address}
                onChangeText={setAddress}
                onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                maxLength={300}
              />
            </View>
          )}

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.inputLabel}>Special Instructions or Timing Notes (Optional)</Text>
            <TextInput
              style={[styles.textArea, { minHeight: 70 }]}
              multiline
              numberOfLines={2}
              placeholder="e.g. Please bring registration papers or test highway speed"
              placeholderTextColor={color.muted}
              value={notes}
              onChangeText={setNotes}
              onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
              maxLength={400}
            />
          </View>

          {/* Error Banner */}
          {error ? (
            <View style={styles.errorBox}>
              <AlertCircle size={16} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Floating Action Button */}
        <View
          style={[
            styles.bottomBar,
            { paddingBottom: Math.max(insets.bottom, space.md) },
          ]}
        >
          <TouchableOpacity
            style={styles.submitBtn}
            disabled={busy}
            activeOpacity={0.8}
            onPress={submit}
          >
            {busy ? (
              <ActivityIndicator color={color.navy} />
            ) : (
              <>
                <CheckCircle2 size={18} color={color.navy} />
                <Text style={styles.submitBtnText}>Confirm Test Drive Request</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      padding: space.xs,
      borderRadius: 20,
      backgroundColor: colors.surfaceSecondary,
    },
    headerTitleWrap: {
      flex: 1,
      marginLeft: space.sm,
    },
    headerTitle: {
      color: colors.textPrimary,
      fontSize: 17,
      fontWeight: '800',
    },
    headerSubtitle: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    content: {
      padding: space.md,
    },
    assuranceBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.08)' : '#FFFBEB',
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(247, 181, 3, 0.25)' : '#FDE68A',
      marginBottom: space.lg,
    },
    assuranceText: {
      color: colors.textSecondary,
      fontSize: 12,
      flex: 1,
      lineHeight: 18,
    },
    section: {
      marginBottom: space.lg,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      marginBottom: space.sm,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    inputLabel: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: space.xs,
    },
    dateList: {
      gap: space.sm,
      paddingVertical: 2,
    },
    dateCard: {
      width: 64,
      paddingVertical: 12,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateCardActive: {
      backgroundColor: colors.brandAccent,
      borderColor: colors.brandAccent,
    },
    dayName: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    dayNameActive: {
      color: colors.brandNavy,
    },
    dayNum: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '800',
      marginVertical: 2,
    },
    dayNumActive: {
      color: colors.brandNavy,
    },
    monthName: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '600',
    },
    monthNameActive: {
      color: colors.brandNavy,
    },
    slotGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.sm,
    },
    slotPill: {
      flex: 1,
      minWidth: 100,
      paddingVertical: space.sm,
      paddingHorizontal: space.sm,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    slotPillActive: {
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.15)' : 'rgba(247, 181, 3, 0.2)',
      borderColor: colors.brandAccent,
    },
    slotText: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: '600',
    },
    slotTextActive: {
      color: isDark ? colors.brandAccent : colors.brandNavy,
      fontWeight: '700',
    },
    locationToggle: {
      gap: space.sm,
    },
    locationCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    locationCardActive: {
      borderColor: colors.brandAccent,
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.08)' : '#FFFBEB',
    },
    locationCardTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    locationCardTitleActive: {
      color: isDark ? colors.brandAccent : colors.brandNavy,
    },
    locationCardDesc: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    cityPills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.xs,
    },
    cityPill: {
      paddingHorizontal: space.md,
      paddingVertical: 8,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cityPillActive: {
      backgroundColor: colors.brandAccent,
      borderColor: colors.brandAccent,
    },
    cityText: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: '600',
    },
    cityTextActive: {
      color: colors.brandNavy,
      fontWeight: '700',
    },
    textArea: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space.md,
      color: colors.textPrimary,
      fontSize: 13,
      textAlignVertical: 'top',
      minHeight: 80,
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
      marginTop: space.sm,
    },
    errorText: {
      color: '#EF4444',
      fontSize: 12,
      flex: 1,
    },
    bottomBar: {
      backgroundColor: colors.surface,
      paddingHorizontal: space.md,
      paddingTop: space.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    submitBtn: {
      backgroundColor: colors.brandAccent,
      borderRadius: radius.md,
      paddingVertical: space.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
    },
    submitBtnText: {
      color: colors.brandNavy,
      fontSize: 15,
      fontWeight: '800',
    },
  });
