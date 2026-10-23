import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  AlertCircle,
  ArrowLeft,
  Building,
  CheckCircle2,
  Home,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react-native';
import { customer } from '../services/customer';
import { useAuth } from '../auth/AuthProvider';
import type { CustomerAddress } from '../types';
import { color, radius, space } from '../theme';
import { friendlyError } from '../format';

const PRESET_LABELS = ['Home', 'Office', 'Other'] as const;

export function AddressesScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const { user } = useAuth();

  const [items, setItems] = useState<CustomerAddress[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [label, setLabel] = useState('Home');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState(user?.preferredCity || '');
  const [pincode, setPincode] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await customer.addresses();
      setItems(data);
      if (data.length === 0) {
        setShowAddForm(true);
      }
      setError('');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const save = async () => {
    Keyboard.dismiss();
    if (addressLine.trim().length < 10) {
      setError('Please enter a detailed address line (at least 10 characters).');
      return;
    }
    if (city.trim().length < 2) {
      setError('Please enter a valid city name.');
      return;
    }
    if (!/^\d{6}$/.test(pincode.trim())) {
      setError('Please enter a valid 6-digit Indian pincode.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const created = await customer.createAddress({
        label: label.trim() || 'Address',
        addressLine: addressLine.trim(),
        city: city.trim(),
        pincode: pincode.trim(),
      });
      // Instant optimistic UI update — zero lag
      if (created) {
        setItems((prev) => [created as CustomerAddress, ...prev.filter((x) => x.id !== (created as any).id)]);
      }
      setAddressLine('');
      setPincode('');
      setShowAddForm(false);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string, labelText: string) => {
    Alert.alert(
      'Remove Address',
      `Are you sure you want to remove "${labelText}"? This does not alter existing test-drive or inspection bookings.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await customer.removeAddress(id);
              load();
            } catch (e) {
              setError(friendlyError(e));
            }
          },
        },
      ]
    );
  };

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
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <ArrowLeft size={22} color={color.white} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Saved Addresses</Text>
            <Text style={styles.headerSubtitle}>
              For doorstep test drives & evaluation
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addToggleBtn}
            onPress={() => setShowAddForm(!showAddForm)}
          >
            <Plus
              size={20}
              color={showAddForm ? color.yellow : color.white}
              style={showAddForm ? { transform: [{ rotate: '45deg' }] } : undefined}
            />
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, space.md) + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Add Address Form */}
          {showAddForm && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Add New Address</Text>

              <Text style={styles.fieldLabel}>Label</Text>
              <View style={styles.labelPills}>
                {PRESET_LABELS.map((p) => {
                  const isSelected = p === label;
                  return (
                    <TouchableOpacity
                      key={p}
                      activeOpacity={0.8}
                      style={[styles.labelPill, isSelected && styles.labelPillActive]}
                      onPress={() => setLabel(p)}
                    >
                      {p === 'Home' ? (
                        <Home
                          size={14}
                          color={isSelected ? color.navy : color.muted}
                        />
                      ) : p === 'Office' ? (
                        <Building
                          size={14}
                          color={isSelected ? color.navy : color.muted}
                        />
                      ) : (
                        <MapPin
                          size={14}
                          color={isSelected ? color.navy : color.muted}
                        />
                      )}
                      <Text
                        style={[
                          styles.labelPillText,
                          isSelected && styles.labelPillTextActive,
                        ]}
                      >
                        {p}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Address Line *</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="House / Flat No., Society / Apartment, Street, Landmark"
                placeholderTextColor={color.muted}
                value={addressLine}
                onChangeText={setAddressLine}
                maxLength={300}
              />

              <View style={styles.row}>
                <View style={{ flex: 1.2 }}>
                  <Text style={styles.fieldLabel}>City *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Pune, Mumbai"
                    placeholderTextColor={color.muted}
                    value={city}
                    onChangeText={setCity}
                    maxLength={100}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Pincode *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="6 digits"
                    placeholderTextColor={color.muted}
                    keyboardType="number-pad"
                    value={pincode}
                    onChangeText={setPincode}
                    maxLength={6}
                  />
                </View>
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <AlertCircle size={15} color="#EF4444" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.saveBtn}
                activeOpacity={0.8}
                disabled={busy}
                onPress={save}
              >
                {busy ? (
                  <ActivityIndicator color={color.navy} />
                ) : (
                  <>
                    <CheckCircle2 size={16} color={color.navy} />
                    <Text style={styles.saveBtnText}>Save Address</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* List of Saved Addresses */}
          <View style={styles.listSection}>
            <Text style={styles.sectionHeading}>Your Locations</Text>
            {loading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color={color.yellow} />
              </View>
            ) : items.length === 0 && !showAddForm ? (
              <View style={styles.emptyCard}>
                <MapPin size={48} color={color.muted} />
                <Text style={styles.emptyTitle}>No Saved Addresses</Text>
                <Text style={styles.emptyDesc}>
                  Add an address to make booking home test drives and car valuation appointments quick and easy.
                </Text>
                <TouchableOpacity
                  style={styles.addFirstBtn}
                  onPress={() => setShowAddForm(true)}
                >
                  <Plus size={16} color={color.navy} />
                  <Text style={styles.addFirstBtnText}>Add Your First Address</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: space.sm }}>
                {items.map((item) => (
                  <View key={item.id} style={styles.addressCard}>
                    <View style={styles.addressTop}>
                      <View style={styles.labelBadge}>
                        {item.label.toLowerCase() === 'home' ? (
                          <Home size={14} color={color.yellow} />
                        ) : item.label.toLowerCase() === 'office' ? (
                          <Building size={14} color={color.yellow} />
                        ) : (
                          <MapPin size={14} color={color.yellow} />
                        )}
                        <Text style={styles.labelBadgeText}>{item.label}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => remove(item.id, item.label)}
                        style={styles.deleteBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Trash2 size={16} color="#EF4444" />
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.addressText}>{item.addressLine}</Text>
                    <Text style={styles.cityPincodeText}>
                      {item.city} — {item.pincode}
                    </Text>
                  </View>
                ))}
              </View>
            )}
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
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  backBtn: {
    padding: space.xs,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: space.sm,
  },
  headerTitle: {
    color: color.white,
    fontSize: 17,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: color.muted,
    fontSize: 12,
    marginTop: 2,
  },
  addToggleBtn: {
    padding: space.xs,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  content: {
    padding: space.md,
  },
  formCard: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.3)',
    marginBottom: space.lg,
  },
  formTitle: {
    color: color.white,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: space.sm,
  },
  fieldLabel: {
    color: color.muted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: space.sm,
  },
  labelPills: {
    flexDirection: 'row',
    gap: space.xs,
  },
  labelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: color.border,
  },
  labelPillActive: {
    backgroundColor: color.yellow,
    borderColor: color.yellow,
  },
  labelPillText: {
    color: color.white,
    fontSize: 12,
    fontWeight: '600',
  },
  labelPillTextActive: {
    color: color.navy,
    fontWeight: '700',
  },
  textArea: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.md,
    color: color.white,
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 70,
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    color: color.white,
    fontSize: 13,
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
    marginTop: space.md,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    flex: 1,
  },
  saveBtn: {
    backgroundColor: color.yellow,
    borderRadius: radius.sm,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    marginTop: space.md,
  },
  saveBtnText: {
    color: color.navy,
    fontSize: 14,
    fontWeight: '800',
  },
  listSection: {
    marginTop: space.xs,
  },
  sectionHeading: {
    color: color.white,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: space.sm,
  },
  centerBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color.border,
  },
  emptyTitle: {
    color: color.white,
    fontSize: 16,
    fontWeight: '800',
    marginTop: space.md,
  },
  emptyDesc: {
    color: color.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
    marginBottom: space.lg,
  },
  addFirstBtn: {
    backgroundColor: color.yellow,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  addFirstBtnText: {
    color: color.navy,
    fontSize: 13,
    fontWeight: '800',
  },
  addressCard: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
  },
  addressTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
  labelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(247, 181, 3, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.25)',
  },
  labelBadgeText: {
    color: color.yellow,
    fontSize: 11,
    fontWeight: '700',
  },
  deleteBtn: {
    padding: 4,
  },
  addressText: {
    color: color.white,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  cityPincodeText: {
    color: color.muted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
});
