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
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AlertCircle,
  ArrowLeft,
  Headphones,
  Send,
  ShieldCheck,
  User,
} from 'lucide-react-native';
import { customer } from '../services/customer';
import type { SupportCaseDetail } from '../types';
import type { RootStack } from '../navigation/types';
import { color, radius, space, useAppTheme, type ThemeColors } from '../theme';
import { friendlyError } from '../format';

type Props = NativeStackScreenProps<RootStack, 'SupportCaseDetails'>;

export function SupportCaseDetailsScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const scrollViewRef = useRef<ScrollView>(null);

  const [detail, setDetail] = useState<SupportCaseDetail | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await customer.supportCase(route.params.caseId);
      setDetail(res);
      setError('');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [route.params.caseId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const reply = async () => {
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    try {
      await customer.replySupportCase(route.params.caseId, body.trim());
      setBody('');
      await load();
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 200);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.brandAccent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.centerBox}>
          <Text style={styles.notFoundText}>Support case not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOpen = detail.status === 'OPEN' || detail.status === 'IN_PROGRESS';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
            <Text style={styles.headerTitle} numberOfLines={1}>
              {detail.subject}
            </Text>
            <Text style={styles.headerSubtitle}>
              #{detail.referenceCode.slice(0, 8).toUpperCase()} ·{' '}
              {detail.category.replace(/_/g, ' ')}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              isOpen ? styles.statusOpen : styles.statusClosed,
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                isOpen ? styles.statusOpenText : styles.statusClosedText,
              ]}
            >
              {detail.status.replace(/_/g, ' ')}
            </Text>
          </View>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: space.lg },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          {/* Original Case Inquiry Card */}
          <View style={styles.originalCard}>
            <View style={styles.originalCardHeader}>
              <User size={16} color={color.yellow} />
              <Text style={styles.originalCardAuthor}>Original Request</Text>
              <Text style={styles.originalCardDate}>
                {new Date(detail.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </View>
            <Text style={styles.originalDescription}>{detail.description}</Text>
          </View>

          {/* Messages Separator */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Conversation Thread</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Conversation Replies */}
          {detail.replies.length === 0 ? (
            <View style={styles.noRepliesBox}>
              <Headphones size={28} color={color.muted} />
              <Text style={styles.noRepliesTitle}>Awaiting Response</Text>
              <Text style={styles.noRepliesDesc}>
                A customer support representative will review this thread and reply here soon.
              </Text>
            </View>
          ) : (
            detail.replies.map((r) => {
              const isMe = r.authorType === 'CUSTOMER';
              return (
                <View
                  key={r.id}
                  style={[
                    styles.bubbleContainer,
                    isMe ? styles.bubbleMe : styles.bubbleSupport,
                  ]}
                >
                  <View style={styles.bubbleAuthorRow}>
                    {!isMe && <ShieldCheck size={14} color={color.yellow} />}
                    <Text
                      style={[
                        styles.bubbleAuthor,
                        !isMe && { color: color.yellow },
                      ]}
                    >
                      {isMe ? 'You' : 'V MOTIV Concierge'}
                    </Text>
                    <Text style={styles.bubbleTime}>
                      {new Date(r.createdAt).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <Text style={styles.bubbleText}>{r.body}</Text>
                </View>
              );
            })
          )}

          {error ? (
            <View style={styles.errorBox}>
              <AlertCircle size={15} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Message Composer */}
        <View
          style={[
            styles.composerBar,
            { paddingBottom: Math.max(insets.bottom, space.md) },
          ]}
        >
          <TextInput
            style={styles.composerInput}
            placeholder="Type your reply..."
            placeholderTextColor={color.muted}
            value={body}
            onChangeText={setBody}
            onFocus={() => requestAnimationFrame(() => {
              setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), Platform.OS === 'android' ? 180 : 0);
            })}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!body.trim() || busy) && styles.sendBtnDisabled,
            ]}
            disabled={!body.trim() || busy}
            activeOpacity={0.8}
            onPress={reply}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.brandNavy} />
            ) : (
              <Send size={18} color={colors.brandNavy} />
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
      width: 44,
      height: 44,
      borderRadius: 20,
      backgroundColor: colors.surfaceSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: {
      flex: 1,
      marginHorizontal: space.sm,
    },
    headerTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '800',
    },
    headerSubtitle: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
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
    centerBox: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    notFoundText: {
      color: colors.textMuted,
      fontSize: 14,
    },
    content: {
      padding: space.md,
    },
    originalCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: space.lg,
      paddingVertical: space.lg,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(247, 181, 3, 0.25)' : 'rgba(247, 181, 3, 0.4)',
    },
    originalCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      marginBottom: space.sm,
    },
    originalCardAuthor: {
      color: isDark ? colors.brandAccent : colors.brandNavy,
      fontSize: 12,
      fontWeight: '700',
      flex: 1,
    },
    originalCardDate: {
      color: colors.textMuted,
      fontSize: 11,
    },
    originalDescription: {
      color: colors.textPrimary,
      fontSize: 14,
      lineHeight: 22,
      marginTop: 2,
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: space.lg,
      gap: space.sm,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    noRepliesBox: {
      alignItems: 'center',
      paddingVertical: 36,
    },
    noRepliesTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
      marginTop: space.sm,
    },
    noRepliesDesc: {
      color: colors.textMuted,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 4,
      maxWidth: 260,
    },
    bubbleContainer: {
      maxWidth: '85%',
      borderRadius: radius.md,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      marginBottom: space.md,
    },
    bubbleMe: {
      alignSelf: 'flex-end',
      backgroundColor: isDark ? colors.surfaceSecondary : '#EFF6FF',
      borderTopRightRadius: 2,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(247, 181, 3, 0.3)' : '#BFDBFE',
    },
    bubbleSupport: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surface,
      borderTopLeftRadius: 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bubbleAuthorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 4,
    },
    bubbleAuthor: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    bubbleTime: {
      color: colors.textMuted,
      fontSize: 10,
      marginLeft: 'auto',
    },
    bubbleText: {
      color: colors.textPrimary,
      fontSize: 13,
      lineHeight: 19,
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
      marginVertical: space.sm,
    },
    errorText: {
      color: '#EF4444',
      fontSize: 12,
      flex: 1,
    },
    composerBar: {
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingHorizontal: space.md,
      paddingTop: space.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    composerInput: {
      flex: 1,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: space.md,
      paddingVertical: 10,
      color: colors.textPrimary,
      fontSize: 13,
      maxHeight: 100,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.brandAccent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendBtnDisabled: {
      opacity: 0.4,
    },
  });
