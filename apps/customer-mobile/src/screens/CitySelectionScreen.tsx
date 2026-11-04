import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, Check, MapPin, Search } from 'lucide-react-native';
import { customer } from '../services/customer';
import { useAuth } from '../auth/AuthProvider';
import { color, radius, space, useAppTheme, type ThemeColors } from '../theme';
import type { RootStack } from '../navigation/types';
import type { SupportedCity } from '../types';

type Props = NativeStackScreenProps<RootStack, 'CitySelection'>;

export function CitySelectionScreen({ navigation }: Props) {
  const { user, refreshProfile } = useAuth();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [cities, setCities] = useState<SupportedCity[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    customer.cities()
      .then(setCities)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = cities.filter(c =>
    c.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  async function selectCity(cityName: string) {
    setUpdating(cityName);
    try {
      if (user) {
        await customer.updateProfile({ preferredCity: cityName });
        await refreshProfile();
      }
      navigation.goBack();
    } catch {
      navigation.goBack();
    } finally {
      setUpdating(null);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Your City</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={{ flex: 1 }}
      >
        <View style={styles.searchBox}>
          <Search size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            placeholder="Search city (e.g. Bengaluru, Hyderabad)"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            style={styles.input}
          />
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={colors.brandAccent} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const isSelected = user?.preferredCity?.toLowerCase() === item.name.toLowerCase();
              return (
                <TouchableOpacity
                  style={[styles.cityRow, isSelected && styles.cityRowSelected]}
                  onPress={() => selectCity(item.name)}
                  disabled={Boolean(updating)}
                >
                  <View style={styles.cityLeft}>
                    <MapPin size={18} color={isSelected ? colors.brandAccent : colors.textMuted} />
                    <Text style={[styles.cityName, isSelected && styles.cityNameSelected]}>
                      {item.name}
                    </Text>
                  </View>
                  {updating === item.name ? (
                    <ActivityIndicator size="small" color={colors.brandAccent} />
                  ) : isSelected ? (
                    <Check size={18} color={colors.brandAccent} />
                  ) : null}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No supported cities found matching '{search}'</Text>
              </View>
            }
          />
        )}
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
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      margin: space.md,
      paddingHorizontal: space.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchIcon: {
      marginRight: space.sm,
    },
    input: {
      flex: 1,
      paddingVertical: space.md,
      color: colors.textPrimary,
      fontSize: 14,
    },
    loader: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    list: {
      paddingHorizontal: space.md,
    },
    cityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: space.md,
      paddingHorizontal: space.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      marginBottom: space.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cityRowSelected: {
      borderColor: colors.brandAccent,
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.08)' : '#FFFBEB',
    },
    cityLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    cityName: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    cityNameSelected: {
      color: isDark ? colors.brandAccent : colors.brandNavy,
      fontWeight: '700',
    },
    empty: {
      paddingVertical: space.xxl,
      alignItems: 'center',
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 14,
    },
  });
