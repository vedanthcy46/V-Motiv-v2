import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  HelpCircle,
  LifeBuoy,
  MessageSquare,
  Plus,
  ShieldCheck,
} from 'lucide-react-native';
import { customer } from '../services/customer';
import type { SupportCase } from '../types';
import { color, radius, space, useAppTheme, type ThemeColors } from '../theme';
import { friendlyError } from '../format';

const CATEGORIES = [
  { key: 'BUYING', label: 'Buying Enquiry' },
  { key: 'SELLING', label: 'Car Selling' },
  { key: 'INSPECTION', label: 'Inspection' },
  { key: 'PAYMENT_REFUND', label: 'Payment & Refund' },
  { key: 'DELIVERY', label: 'Vehicle Delivery' },
  { key: 'OWNERSHIP_TRANSFER', label: 'RC & Transfer' },
  { key: 'ACCOUNT', label: 'Account Access' },
  { key: 'PRIVACY', label: 'Privacy & Data' },
  { key: 'OTHER', label: 'General Query' },
] as const;

type CategoryType = typeof CATEGORIES[number]['key'];

export function SupportScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const scrollRef = useRef<ScrollView>(null);

  const [activeTab, setActiveTab] = useState<'CASES' | 'NEW'>('CASES');
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<CategoryType>('BUYING');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await customer.supportCases();
      setCases(data);
      if (data.length === 0) {
        setActiveTab('NEW');
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

  const submit = async () => {
    if (subject.trim().length < 3) {
      setError('Please add a concise subject (at least 3 characters).');
      return;
    }
    if (description.trim().length < 10) {
      setError('Please describe your question or issue in detail (at least 10 characters).');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await customer.createSupportCase({
        subject: subject.trim(),
        category,
        description: description.trim(),
      });
      setSubject('');
      setDescription('');
      setSuccessMsg('Support case submitted! A specialist will review it promptly.');
      await load();
      setActiveTab('CASES');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'position'}
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
            <Text style={styles.headerTitle}>Customer Concierge</Text>
            <Text style={styles.headerSubtitle}>Direct support & enquiries</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.tabBtn, activeTab === 'CASES' && styles.tabBtnActive]}
            onPress={() => {
              setActiveTab('CASES');
              setSuccessMsg('');
            }}
          >
            <MessageSquare
              size={15}
              color={activeTab === 'CASES' ? colors.brandAccent : colors.textMuted}
            />
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'CASES' && styles.tabBtnTextActive,
              ]}
            >
              My Cases ({cases.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.tabBtn, activeTab === 'NEW' && styles.tabBtnActive]}
            onPress={() => {
              setActiveTab('NEW');
              setSuccessMsg('');
            }}
          >
            <Plus
              size={15}
              color={activeTab === 'NEW' ? colors.brandAccent : colors.textMuted}
            />
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'NEW' && styles.tabBtnTextActive,
              ]}
            >
              New Request
            </Text>
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
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          {successMsg ? (
            <View style={styles.successBanner}>
              <CheckCircle2 size={16} color="#22C55E" />
              <Text style={styles.successText}>{successMsg}</Text>
            </View>
          ) : null}

          {/* TAB 1: Existing Cases */}
          {activeTab === 'CASES' && (
            <View>
              {loading ? (
                <View style={styles.centerBox}>
                  <ActivityIndicator size="large" color={color.yellow} />
                </View>
              ) : cases.length === 0 ? (
                <View style={styles.emptyCard}>
                  <LifeBuoy size={48} color={color.muted} />
                  <Text style={styles.emptyTitle}>No Active Support Cases</Text>
                  <Text style={styles.emptyDesc}>
                    Need assistance with test drives, valuation, payment, or ownership transfers? Create a case and our operations team will assist you.
                  </Text>
                  <TouchableOpacity
                    style={styles.createCaseBtn}
                    onPress={() => setActiveTab('NEW')}
                  >
                    <Plus size={16} color={color.navy} />
                    <Text style={styles.createCaseBtnText}>Create a Case</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ gap: space.md }}>
                  {cases.map((c) => {
                    const isOpen = c.status === 'OPEN' || c.status === 'IN_PROGRESS';
                    return (
                      <TouchableOpacity
                        key={c.id}
                        activeOpacity={0.8}
                        style={styles.caseCard}
                        onPress={() =>
                          navigation.navigate('SupportCaseDetails', { caseId: c.id })
                        }
                      >
                        <View style={styles.caseTopRow}>
                          <View
                            style={[
                              styles.statusBadge,
                              isOpen ? styles.statusOpen : styles.statusClosed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                isOpen
                                  ? styles.statusOpenText
                                  : styles.statusClosedText,
                              ]}
                            >
                              {c.status.replace(/_/g, ' ')}
                            </Text>
                          </View>
                          <Text style={styles.refCode}>
                            #{c.referenceCode.slice(0, 8).toUpperCase()}
                          </Text>
                        </View>

                        <Text style={styles.caseSubject}>{c.subject}</Text>
                        <Text style={styles.caseCategory}>
                          Category: {c.category.replace(/_/g, ' ')}
                        </Text>

                        {c.description ? (
                          <Text style={styles.caseDesc} numberOfLines={2}>
                            {c.description}
                          </Text>
                        ) : null}

                        <View style={styles.caseFooter}>
                          <Text style={styles.caseDate}>
                            Created{' '}
                            {new Date(c.createdAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </Text>
                          <View style={styles.viewRow}>
                            <Text style={styles.viewText}>View thread</Text>
                            <ChevronRight size={14} color={color.yellow} />
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* TAB 2: New Request Form */}
          {activeTab === 'NEW' && (
            <View>
              <View style={styles.banner}>
                <ShieldCheck size={18} color={color.yellow} />
                <Text style={styles.bannerText}>
                  Your message is routed directly to V MOTIV concierge operations. Every case is tracked with end-to-end updates.
                </Text>
              </View>

              <Text style={styles.fieldLabel}>Category *</Text>
              <View style={styles.categoryPills}>
                {CATEGORIES.map((cat) => {
                  const isSelected = cat.key === category;
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      activeOpacity={0.8}
                      style={[
                        styles.catPill,
                        isSelected && styles.catPillActive,
                      ]}
                      onPress={() => setCategory(cat.key)}
                    >
                      <Text
                        style={[
                          styles.catText,
                          isSelected && styles.catTextActive,
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Subject *</Text>
              <TextInput
                style={styles.input}
                placeholder="Brief summary of your query"
                placeholderTextColor={color.muted}
                value={subject}
                onChangeText={setSubject}
                onFocus={() => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))}
                maxLength={120}
              />

              <Text style={styles.fieldLabel}>Details & Vehicle Reference *</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={4}
                placeholder="Include vehicle make/model, booking reference, or any specific concern..."
                placeholderTextColor={color.muted}
                value={description}
                onChangeText={setDescription}
                onFocus={() => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))}
                maxLength={2000}
              />

              {error ? (
                <View style={styles.errorBox}>
                  <AlertCircle size={15} color="#EF4444" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.submitBtn}
                activeOpacity={0.8}
                disabled={busy}
                onPress={submit}
              >
                {busy ? (
                  <ActivityIndicator color={color.navy} />
                ) : (
                  <>
                    <CheckCircle2 size={18} color={color.navy} />
                    <Text style={styles.submitBtnText}>Submit Support Case</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
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
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 20,
      backgroundColor: colors.surfaceSecondary,
      alignItems: 'center',
      justifyContent: 'center',
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
    tabBar: {
      flexDirection: 'row',
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      gap: space.sm,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tabBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabBtnActive: {
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.12)' : 'rgba(247, 181, 3, 0.15)',
      borderColor: colors.brandAccent,
    },
    tabBtnText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    tabBtnTextActive: {
      color: isDark ? colors.brandAccent : colors.brandNavy,
    },
    content: {
      padding: space.md,
    },
    successBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: 1,
      borderColor: 'rgba(34, 197, 94, 0.3)',
      marginBottom: space.md,
    },
    successText: {
      color: '#22C55E',
      fontSize: 13,
      fontWeight: '600',
      flex: 1,
    },
    banner: {
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
    bannerText: {
      color: colors.textSecondary,
      fontSize: 12,
      flex: 1,
      lineHeight: 18,
    },
    centerBox: {
      paddingVertical: 60,
      alignItems: 'center',
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: space.xl,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '800',
      marginTop: space.md,
    },
    emptyDesc: {
      color: colors.textMuted,
      fontSize: 13,
      textAlign: 'center',
      marginTop: space.xs,
      lineHeight: 20,
      marginBottom: space.lg,
    },
    createCaseBtn: {
      backgroundColor: colors.brandAccent,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      borderRadius: radius.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    createCaseBtnText: {
      color: colors.brandNavy,
      fontSize: 14,
      fontWeight: '800',
    },
    caseCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: space.lg,
      paddingVertical: space.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    caseTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: space.sm,
    },
    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.pill,
    },
    statusOpen: {
      backgroundColor: 'rgba(34, 197, 94, 0.15)',
    },
    statusClosed: {
      backgroundColor: colors.surfaceSecondary,
    },
    statusBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    statusOpenText: {
      color: '#22C55E',
    },
    statusClosedText: {
      color: colors.textMuted,
    },
    refCode: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    caseSubject: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 22,
      marginBottom: 4,
    },
    caseCategory: {
      color: colors.textSecondary,
      fontSize: 12,
      marginBottom: space.xs,
    },
    caseDesc: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginVertical: 4,
    },
    caseFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: space.md,
      paddingTop: space.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    caseDate: {
      color: colors.textMuted,
      fontSize: 11,
    },
    viewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    viewText: {
      color: isDark ? colors.brandAccent : colors.brandNavy,
      fontSize: 12,
      fontWeight: '700',
    },
    fieldLabel: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '700',
      marginBottom: space.xs,
      marginTop: space.md,
    },
    categoryPills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.xs,
      marginBottom: space.xs,
    },
    catPill: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    catPillActive: {
      backgroundColor: colors.brandAccent,
      borderColor: colors.brandAccent,
    },
    catText: {
      color: colors.textPrimary,
      fontSize: 11,
      fontWeight: '600',
    },
    catTextActive: {
      color: colors.brandNavy,
      fontWeight: '800',
    },
    input: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space.md,
      color: colors.textPrimary,
      fontSize: 13,
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
      minHeight: 110,
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
    submitBtn: {
      backgroundColor: colors.brandAccent,
      borderRadius: radius.md,
      paddingVertical: space.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
      marginTop: space.lg,
    },
    submitBtnText: {
      color: colors.brandNavy,
      fontSize: 15,
      fontWeight: '800',
    },
  });
