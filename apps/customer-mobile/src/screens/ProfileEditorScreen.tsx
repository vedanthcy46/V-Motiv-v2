import React, { useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, Check, ChevronRight } from 'lucide-react-native';
import { customer } from '../services/customer';
import { useAuth } from '../auth/AuthProvider';
import { color, radius, space, useAppTheme, type ThemeColors } from '../theme';
import type { RootStack } from '../navigation/types';
import { KEYBOARD_AVOIDING_BEHAVIOR } from '../layout/safe-layout';

type Props = NativeStackScreenProps<RootStack, 'ProfileEditor'>;

export function ProfileEditorScreen({ navigation }: Props) {
  const { user, refreshProfile } = useAuth();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [phone, setPhone] = useState(user?.phone || '+91');
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    const trimmedName = displayName.trim();
    const cleanPhone = phone.trim().replace(/\D/g, '').replace(/^91/, '');

    if (!trimmedName) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }

    if (!cleanPhone || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      Alert.alert('Invalid Mobile Number', 'Please enter a valid 10-digit Indian mobile number (+91 followed by 10 digits).');
      return;
    }

    setLoading(true);
    try {
      await customer.updateProfile({
        displayName: trimmedName,
        phone: `+91${cleanPhone}`,
      });
      await refreshProfile();
      Alert.alert('Profile Saved', 'Your personal profile has been updated.');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save profile changes.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={KEYBOARD_AVOIDING_BEHAVIOR}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <TouchableOpacity onPress={handleSave} disabled={loading} style={styles.saveBtn}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.brandAccent} />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.formGroup}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Your Name"
              placeholderTextColor={color.muted}
              value={displayName}
              onChangeText={setDisplayName}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Email Address (Google Identity)</Text>
            <TextInput
              style={[styles.input, styles.disabledInput]}
              value={user?.email || ''}
              editable={false}
            />
            <Text style={styles.helperText}>
              Verified by Google Sign-In. Cannot be changed.
            </Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>
              Mobile Contact Number <Text style={{ color: color.yellow }}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="+919876543210"
              placeholderTextColor={color.muted}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            <Text style={styles.helperText}>
              Used for inspection coordination and test-drive confirmations.
            </Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Preferred City</Text>
            <TouchableOpacity
              style={styles.citySelector}
              onPress={() => navigation.navigate('CitySelection')}
            >
              <Text style={styles.cityText}>
                {user?.preferredCity || 'Select your city'}
              </Text>
              <ChevronRight size={18} color={color.muted} />
            </TouchableOpacity>
          </View>
        </ScrollView>
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
      justifyContent: 'space-between',
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      padding: space.xs,
    },
    headerTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    saveBtn: {
      paddingHorizontal: space.sm,
      paddingVertical: space.xs,
    },
    saveBtnText: {
      color: isDark ? colors.brandAccent : colors.brandNavy,
      fontSize: 15,
      fontWeight: '700',
    },
    content: {
      padding: space.md,
    },
    formGroup: {
      marginBottom: space.lg,
    },
    label: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: space.xs,
    },
    input: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.md,
      color: colors.textPrimary,
      fontSize: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    disabledInput: {
      backgroundColor: colors.disabledBackground,
      color: colors.disabledText,
    },
    helperText: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 4,
    },
    citySelector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cityText: {
      color: colors.textPrimary,
      fontSize: 14,
    },
  });
