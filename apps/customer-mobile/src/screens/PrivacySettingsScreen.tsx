import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStackScreenBottomPadding } from '../layout/safe-layout';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, Database, FileCheck, Lock, Shield } from 'lucide-react-native';
import { useAuth } from '../auth/AuthProvider';
import { color, radius, space, useAppTheme, type ThemeColors } from '../theme';
import type { RootStack } from '../navigation/types';
import { customer } from '../services/customer';
import { friendlyError } from '../format';

type Props = NativeStackScreenProps<RootStack, 'PrivacySettings'>;

export function PrivacySettingsScreen({ navigation }: Props) {
  const bottomPadding = useStackScreenBottomPadding();
  const { user } = useAuth();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [message, setMessage] = useState('');
  const requestPrivacy = (requestType: 'DATA_ACCESS' | 'ACCOUNT_DELETION') => Alert.alert(requestType === 'ACCOUNT_DELETION' ? 'Request account deletion review?' : 'Request account data?', requestType === 'ACCOUNT_DELETION' ? 'This creates a review request. It does not immediately delete records that V MOTIV must retain.' : 'This creates a request for available account data. Support will review it before responding.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Submit request', onPress: () => void customer.createPrivacyRequest(requestType).then(() => setMessage(requestType === 'ACCOUNT_DELETION' ? 'Deletion review request submitted.' : 'Data-access request submitted.')).catch(error => setMessage(friendlyError(error))) }]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy & Terms</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}>
        <View style={styles.card}>
          <View style={styles.iconRow}>
            <FileCheck size={20} color={colors.brandAccent} />
            <Text style={styles.cardTitle}>Terms of Service</Text>
          </View>
          <Text style={styles.bodyText}>
            Version: {user?.termsVersion || 'v1.0 (Standard Customer Agreement)'}
          </Text>
          <Text style={styles.bodyText}>
            Accepted At: {user?.termsAcceptedAt ? new Date(user.termsAcceptedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Verified upon sign-in'}
          </Text>
          <Text style={[styles.bodyText, { marginTop: space.sm, color: colors.textMuted, lineHeight: 18 }]}>
            Applies to customer account, vehicle enquiry, test-drive request and selling-request use of this application.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.iconRow}>
            <Lock size={20} color={colors.brandAccent} />
            <Text style={styles.cardTitle}>Identity & Authentication</Text>
          </View>
          <Text style={[styles.bodyText, { color: colors.textMuted, lineHeight: 18 }]}>
            Your login identity is securely verified through Google Sign-In and Firebase Authentication. We never store or handle your Google account passwords.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.iconRow}>
            <Database size={20} color={colors.brandAccent} />
            <Text style={styles.cardTitle}>Data Isolation & Privacy</Text>
          </View>
          <Text style={[styles.bodyText, { color: colors.textMuted, lineHeight: 18 }]}>
            Customer records are scoped to the authenticated account in the V MOTIV application. You can submit data-access or account-deletion review requests below.
          </Text>
        </View>

        <View style={styles.actionCard}>
          <Shield size={20} color={colors.textMuted} />
          <View style={styles.actionTextContainer}>
            <Text style={styles.actionTitle}>Privacy requests</Text>
            <Text style={styles.actionDesc}>
              Requests are reviewed before action. Deletion is not immediate because legitimate business records may require retention.
            </Text>
          </View>
          <TouchableOpacity style={styles.supportLink} onPress={() => requestPrivacy('DATA_ACCESS')}><Text style={styles.supportLinkText}>Request my data</Text></TouchableOpacity>
          <TouchableOpacity style={styles.supportLink} onPress={() => requestPrivacy('ACCOUNT_DELETION')}><Text style={[styles.supportLinkText, { color: colors.error }]}>Request deletion review</Text></TouchableOpacity>
          {message ? <Text accessibilityRole="alert" style={[styles.actionDesc, { color: message.includes('submitted') ? (isDark ? colors.brandAccent : colors.brandNavy) : colors.error }]}>{message}</Text> : null}
        </View>
      </ScrollView>
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
    content: {
      padding: space.md,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: space.md,
    },
    iconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      marginBottom: space.sm,
    },
    cardTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    bodyText: {
      color: colors.textSecondary,
      fontSize: 13,
      marginBottom: 4,
    },
    actionCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: space.md,
    },
    actionTextContainer: {
      marginVertical: space.sm,
    },
    actionTitle: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '700',
    },
    actionDesc: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 4,
      lineHeight: 18,
    },
    supportLink: {
      alignSelf: 'flex-start',
      marginTop: space.xs,
    },
    supportLinkText: {
      color: isDark ? colors.brandAccent : colors.brandNavy,
      fontSize: 13,
      fontWeight: '700',
    },
  });
