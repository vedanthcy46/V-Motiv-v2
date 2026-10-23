import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, Bell, Mail, ShieldCheck } from 'lucide-react-native';
import { customer } from '../services/customer';
import { useAuth } from '../auth/AuthProvider';
import { color, radius, space } from '../theme';
import type { RootStack } from '../navigation/types';

type Props = NativeStackScreenProps<RootStack, 'MarketingPreferences'>;

export function MarketingPreferencesScreen({ navigation }: Props) {
  const { user, refreshProfile } = useAuth();
  const [marketingConsent, setMarketingConsent] = useState(user?.marketingConsent || false);
  const [loading, setLoading] = useState(false);

  async function handleToggle(value: boolean) {
    setMarketingConsent(value);
    setLoading(true);
    try {
      await customer.updateProfile({ marketingConsent: value });
      await refreshProfile();
    } catch (err: any) {
      setMarketingConsent(!value);
      Alert.alert('Error', err.message || 'Failed to update marketing preferences.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={color.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Communication Preferences</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.iconContainer}>
              <Mail size={22} color={color.yellow} />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.optionTitle}>Promotional & Inventory Updates</Text>
              <Text style={styles.optionDesc}>
                Receive optional updates about published inventory and V MOTIV services. You can change this preference at any time.
              </Text>
            </View>
            <Switch
              value={marketingConsent}
              onValueChange={handleToggle}
              trackColor={{ false: color.border, true: color.yellow }}
              thumbColor={color.white}
              disabled={loading}
            />
          </View>
        </View>

        <View style={styles.noticeCard}>
          <ShieldCheck size={24} color="#22C55E" />
          <View style={styles.noticeTextContainer}>
            <Text style={styles.noticeTitle}>Transactional Communications</Text>
            <Text style={styles.noticeDesc}>
              Account, request-receipt, and offer-update messages are transactional and are not controlled by this preference. A request receipt is not a booking confirmation.
            </Text>
          </View>
        </View>
      </ScrollView>
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
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  backBtn: {
    padding: space.xs,
  },
  headerTitle: {
    color: color.white,
    fontSize: 16,
    fontWeight: '700',
  },
  content: {
    padding: space.md,
  },
  card: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border,
    marginBottom: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    marginRight: space.md,
  },
  textContainer: {
    flex: 1,
    marginRight: space.sm,
  },
  optionTitle: {
    color: color.white,
    fontSize: 14,
    fontWeight: '700',
  },
  optionDesc: {
    color: color.muted,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  noticeTextContainer: {
    flex: 1,
    marginLeft: space.md,
  },
  noticeTitle: {
    color: '#22C55E',
    fontSize: 14,
    fontWeight: '700',
  },
  noticeDesc: {
    color: '#D1D5DB',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },
});
