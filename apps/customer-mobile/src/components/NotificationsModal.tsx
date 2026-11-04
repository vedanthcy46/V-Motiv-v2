import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, ChevronRight, X } from 'lucide-react-native';
import { color, radius, space, useAppTheme, type ThemeColors } from '../theme';
import type { InAppNotification } from '../services/notifications';
import { safeBottom } from '../layout/safe-layout';

export interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
  notifications: InAppNotification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void | Promise<void>;
  onMarkAllAsRead: () => void | Promise<void>;
  onSelectNotification: (notification: InAppNotification) => void | Promise<void>;
  title?: string;
  subtitle?: string;
}

function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return '';
  try {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(dateString).toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function NotificationsModal({
  visible,
  onClose,
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onSelectNotification,
  title = 'Notifications',
  subtitle = 'Alerts & real-time updates',
}: NotificationsModalProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Safe bottom padding guarantees breathing space above Android navigation bar / iOS home bar
  const bottomSafePadding = safeBottom(insets.bottom, 16) + space.md;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.modalContent, { paddingBottom: bottomSafePadding }]}
          onPress={e => e.stopPropagation()}
        >
          {/* Top Grabber Handle */}
          <View style={styles.sheetHandle} />

          {/* Sheet Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderLeft}>
              <View style={styles.bellIconWrap}>
                <Bell color={colors.brandAccent} size={16} />
              </View>
              <View style={{ gap: 2, flexShrink: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={styles.sheetTitle}>{title}</Text>
                  {unreadCount > 0 && (
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{unreadCount} new</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.sheetSubtitle} numberOfLines={1}>{subtitle}</Text>
              </View>
            </View>

            <View style={styles.sheetHeaderRight}>
              {unreadCount > 0 && (
                <Pressable onPress={() => void onMarkAllAsRead()} hitSlop={8}>
                  <Text style={styles.markReadText}>Mark all read</Text>
                </Pressable>
              )}
              <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
                <X color={colors.textMuted} size={18} />
              </Pressable>
            </View>
          </View>

          {/* Notifications Scroll List */}
          <ScrollView
            style={styles.scrollList}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {notifications.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Bell color={colors.textMuted} size={36} />
                <Text style={styles.emptyTitle}>No notifications yet</Text>
                <Text style={styles.emptySubtitle}>
                  Order status updates, offers, and enquiry alerts will appear here in real time.
                </Text>
              </View>
            ) : (
              notifications.map(n => {
                const hasAction = Boolean(n.entityId || n.deepLink);
                return (
                  <Pressable
                    key={n.id}
                    style={({ pressed }) => [
                      styles.card,
                      !n.read && styles.cardUnread,
                      pressed && styles.cardPressed,
                    ]}
                    onPress={() => void onSelectNotification(n)}
                  >
                    <View style={styles.cardTopRow}>
                      <View style={styles.badgeRow}>
                        {!n.read && <View style={styles.unreadDot} />}
                        <View style={styles.categoryBadge}>
                          <Text style={styles.categoryBadgeText}>
                            {n.category || 'UPDATE'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.timestampText}>
                        {formatRelativeTime(n.createdAt)}
                      </Text>
                    </View>

                    <Text style={[styles.cardTitle, !n.read && styles.cardTitleUnread]}>
                      {n.title}
                    </Text>

                    <Text style={styles.cardBody} numberOfLines={3} ellipsizeMode="tail">
                      {n.body}
                    </Text>

                    {hasAction && (
                      <View style={styles.actionRow}>
                        <View style={styles.actionPill}>
                          <Text style={styles.actionPillText}>View Details</Text>
                          <ChevronRight size={13} color={isDark ? colors.brandAccent : colors.brandNavy} />
                        </View>
                      </View>
                    )}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    modalBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderTopWidth: 1,
      borderColor: colors.border,
      maxHeight: '85%',
      paddingHorizontal: space.lg,
      paddingTop: space.md,
      gap: space.sm,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)',
      alignSelf: 'center',
      marginBottom: space.xs,
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: space.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sheetHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      minWidth: 0,
    },
    bellIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.12)' : 'rgba(247, 181, 3, 0.15)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(247, 181, 3, 0.25)' : 'rgba(247, 181, 3, 0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    sheetTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    sheetSubtitle: {
      fontSize: 11,
      color: colors.textMuted,
    },
    countBadge: {
      backgroundColor: colors.brandAccent,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: radius.pill,
    },
    countBadgeText: {
      color: colors.brandNavy,
      fontSize: 10,
      fontWeight: '800',
    },
    sheetHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      flexShrink: 0,
    },
    markReadText: {
      color: isDark ? colors.brandAccent : colors.brandNavy,
      fontSize: 12,
      fontWeight: '700',
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollList: {
      maxHeight: 420,
    },
    scrollContent: {
      paddingBottom: space.sm,
    },
    emptyContainer: {
      paddingVertical: 40,
      alignItems: 'center',
      gap: space.xs,
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
      marginTop: space.sm,
    },
    emptySubtitle: {
      color: colors.textMuted,
      fontSize: 12,
      textAlign: 'center',
      paddingHorizontal: space.lg,
    },
    card: {
      padding: space.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: space.sm,
      gap: 6,
    },
    cardUnread: {
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.08)' : 'rgba(247, 181, 3, 0.12)',
      borderColor: isDark ? 'rgba(247, 181, 3, 0.35)' : 'rgba(247, 181, 3, 0.5)',
    },
    cardPressed: {
      opacity: 0.8,
    },
    cardTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    unreadDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.brandAccent,
    },
    categoryBadge: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    categoryBadgeText: {
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    timestampText: {
      color: colors.textMuted,
      fontSize: 11,
    },
    cardTitle: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '600',
    },
    cardTitleUnread: {
      color: isDark ? colors.brandAccent : colors.brandNavy,
      fontWeight: '800',
    },
    cardBody: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },
    actionRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 2,
    },
    actionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(247, 181, 3, 0.12)' : 'rgba(247, 181, 3, 0.2)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(247, 181, 3, 0.3)' : 'rgba(247, 181, 3, 0.4)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.pill,
    },
    actionPillText: {
      color: isDark ? colors.brandAccent : colors.brandNavy,
      fontSize: 11,
      fontWeight: '700',
    },
  });
