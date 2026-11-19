import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  Bell,
  Bookmark,
  Car,
  QrCode,
  CheckCircle2,
  ChevronRight,
  Headphones,
  LogOut,
  MapPin,
  Moon,
  RotateCcw,
  Shield,
  Smartphone,
  Sun,
  User,
} from 'lucide-react-native';
import { BrandLogo } from '../components/BrandLogo';
import { NotificationsModal } from '../components/NotificationsModal';
import {
  fetchUserNotifications,
  clearAllNotifications,
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
  type InAppNotification,
} from '../services/notifications';
import { useAuth } from '../auth/AuthProvider';
import { AuthScreen } from './AuthScreen';
import { useAppTheme, type ThemeMode, radius, space } from '../theme';
import { useTabBarScroll } from '../components/TabBarVisibility';
import { useTabScreenBottomPadding } from '../layout/safe-layout';

export function AccountScreen() {
  const tabBottomPadding = useTabScreenBottomPadding();
  const tabBarScroll = useTabBarScroll(); // hides the bottom tab bar while scrolling down, shows it on the way up
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { state, profile, busy: authBusy, signOut, clearSessionData, isInspector, setActiveMode } = useAuth();
  const { theme, mode, setMode, isDark } = useAppTheme();
  const c = theme.colors;

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetchUserNotifications(30);
      setNotifications(res.items);
      setUnreadCount(res.unreadCount);
    } catch {
      // Keep existing notifications
    }
  }, []);

  useEffect(() => {
    if (state === 'signed-in') {
      void loadNotifications();
    }
  }, [loadNotifications, state]);

  const handleCustomerNotificationNavigation = useCallback(
    async (n: InAppNotification) => {
      try {
        if (!n.read) {
          void markNotificationRead(n.id);
          setNotifications((prev) =>
            prev.map((item) => (item.id === n.id ? { ...item, read: true } : item))
          );
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      } catch (err) {
        console.warn('[NOTIF_MARK_READ_ERROR]', err);
      }

      setNotificationsOpen(false);

      const event = (n.eventType || '').toUpperCase();
      const cat = (n.category || '').toUpperCase();
      const entityId = n.entityId || (n.deepLink ? n.deepLink.split('/').pop() : undefined);

      // Connect notifications (including a call request) always land in the
      // Garage where the owner can see the relevant QR and request history.
      if (event.includes('CONNECT') || cat.includes('CONNECT') || n.deepLink?.includes('://garage/')) {
        navigation.navigate('Tabs', { screen: 'Garage' });
        return;
      }

      if (n.deepLink) {
        if (n.deepLink.includes('/selling/') && entityId) {
          navigation.navigate('SellingRequestDetails', { leadId: entityId });
          return;
        }
        if (n.deepLink.includes('/vehicles/') && entityId) {
          navigation.navigate('Vehicle', { listingId: entityId });
          return;
        }
        if (n.deepLink.includes('/support/') && entityId) {
          navigation.navigate('SupportCaseDetails', { caseId: entityId });
          return;
        }
      }

      if (
        cat.includes('OFFER') ||
        event.includes('OFFER') ||
        cat.includes('VALUATION') ||
        cat.includes('INSPECTION') ||
        cat.includes('SELLING') ||
        event.includes('LEAD')
      ) {
        if (entityId) {
          navigation.navigate('SellingRequestDetails', { leadId: entityId });
        } else {
          navigation.navigate('Tabs', { screen: 'Activity' });
        }
        return;
      }

      if (
        cat.includes('PURCHASE') ||
        cat.includes('VEHICLE') ||
        event.includes('PRICE') ||
        event.includes('DROP')
      ) {
        if (entityId) {
          navigation.navigate('Vehicle', { listingId: entityId });
        } else {
          navigation.navigate('Tabs', { screen: 'Explore' });
        }
        return;
      }

      navigation.navigate('Tabs', { screen: 'Activity' });
    },
    [navigation]
  );

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out of V MOTIV',
      'Are you sure you want to sign out? Your saved searches, car shortlist and request updates will be accessible when you sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } catch (err: any) {
              Alert.alert('Sign Out Failed', err.message || 'Could not complete sign out.');
            }
          },
        },
      ]
    );
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear Local Cache & Session',
      'This will clear local car drafts, offline search cache and session tokens. Do you want to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Data',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearSessionData();
            } catch (err: any) {
              Alert.alert('Clear Failed', err.message || 'Could not reset session data.');
            }
          },
        },
      ]
    );
  };

  // Not signed-in view
  if (state !== 'signed-in') {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + space.sm, backgroundColor: c.surface, borderBottomColor: c.border }]}>
          <BrandLogo variant="horizontal" size={26} bodyColor={isDark ? '#FFFFFF' : c.brandNavy} />
          <View style={styles.verifiedAccountBadge}>
            <User size={12} color={c.brandAccent} />
            <Text style={[styles.verifiedAccountText, { color: c.brandAccent }]}>SIGN IN</Text>
          </View>
        </View>
        <AuthScreen includeTopInset={false} showHeader={false} />
      </View>
    );
  }

  const initials = (profile?.displayName || 'VM')
    .split(' ')
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();

  const themeOptions: { key: ThemeMode; label: string; desc: string; Icon: any }[] = [
    { key: 'system', label: 'Match System', desc: 'Follows device appearance', Icon: Smartphone },
    { key: 'light', label: 'Light Mode', desc: 'Clean white surfaces', Icon: Sun },
    { key: 'dark', label: 'Dark Mode', desc: 'Deep navy background', Icon: Moon },
  ];

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Top Header */}
      <View style={[styles.topBar, { paddingTop: insets.top + space.sm, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <BrandLogo variant="horizontal" size={26} bodyColor={isDark ? '#FFFFFF' : c.brandNavy} />
        <View style={styles.verifiedAccountBadge}>
          <CheckCircle2 size={12} color={c.brandAccent} />
          <Text style={[styles.verifiedAccountText, { color: c.brandAccent }]}>VERIFIED ACCOUNT</Text>
        </View>
      </View>

      <ScrollView
        {...tabBarScroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* User Profile Card */}
        <View style={[styles.userCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[styles.avatar, { backgroundColor: c.surfaceSecondary, borderColor: c.brandAccent }]}>
            <Text style={[styles.avatarText, { color: c.brandAccent }]}>{initials}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: c.textPrimary }]}>{profile?.displayName || 'V MOTIV Customer'}</Text>
            <Text style={[styles.userEmail, { color: c.textSecondary }]}>{profile?.email}</Text>
            {profile?.preferredCity ? (
              <View style={[styles.cityPill, { backgroundColor: c.surfaceSecondary }]}>
                <MapPin size={11} color={c.brandAccent} />
                <Text style={[styles.cityText, { color: c.brandAccent }]}>{profile.preferredCity}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Authorized Staff / Inspector Workspace Switcher */}
        {isInspector ? (
          <View style={[styles.inspectorStaffCard, { backgroundColor: c.surface, borderColor: c.brandAccent }]}>
            <View style={styles.inspectorStaffBadge}>
              <Text style={styles.inspectorStaffBadgeText}>AUTHORIZED FIELD INSPECTOR</Text>
            </View>
            <Text style={[styles.inspectorStaffTitle, { color: c.textPrimary }]}>Vehicle Inspection Workspace</Text>
            <Text style={[styles.inspectorStaffSub, { color: c.textSecondary }]}>
              You are signed in with evaluator privileges. Touch to access assigned jobs and inspection tools.
            </Text>
            <TouchableOpacity
              style={[styles.inspectorSwitchButton, { backgroundColor: c.brandAccent }]}
              activeOpacity={0.8}
              onPress={() => setActiveMode('inspector')}
            >
              <Text style={[styles.inspectorSwitchButtonText, { color: c.brandNavy }]}>Open Inspector Workspace</Text>
              <ChevronRight size={16} color={c.brandNavy} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Section: Appearance & Display */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionHeader, { color: c.textMuted }]}>APPEARANCE & DISPLAY</Text>
          <View style={[styles.menuGroup, { backgroundColor: c.surface, borderColor: c.border }]}>
            {themeOptions.map((opt, idx) => {
              const selected = mode === opt.key;
              const isLast = idx === themeOptions.length - 1;
              const OptionIcon = opt.Icon;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.menuItem,
                    { borderBottomColor: c.divider },
                    isLast && { borderBottomWidth: 0 },
                    selected && { backgroundColor: c.selected },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => setMode(opt.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${opt.label}. ${opt.desc}`}
                >
                  <View
                    style={[
                      styles.menuIcon,
                      {
                        backgroundColor: selected ? c.brandAccent : c.surfaceSecondary,
                      },
                    ]}
                  >
                    <OptionIcon size={18} color={selected ? c.brandNavy : c.textSecondary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={[styles.menuTitle, { color: c.textPrimary }]}>{opt.label}</Text>
                    <Text style={[styles.menuDesc, { color: c.textSecondary }]}>{opt.desc}</Text>
                  </View>
                  {selected && <CheckCircle2 size={18} color={c.brandAccent} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Section: Account & Preferences */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionHeader, { color: c.textMuted }]}>ACCOUNT & PROFILE</Text>
          <View style={[styles.menuGroup, { backgroundColor: c.surface, borderColor: c.border }]}>
            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: c.divider }]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('Wishlist')}
            >
              <View style={[styles.menuIcon, { backgroundColor: c.surfaceSecondary }]}>
                <Bookmark size={19} color={c.brandAccent} />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: c.textPrimary }]}>Wishlist</Text>
                <Text style={[styles.menuDesc, { color: c.textSecondary }]}>Shortlisted vehicles & saved searches</Text>
              </View>
              <ChevronRight size={16} color={c.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: c.divider }]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('ConnectGuest')}
              accessibilityRole="button"
              accessibilityLabel="Scan V MOTIV Connect QR code"
            >
              <View style={[styles.menuIcon, { backgroundColor: c.surfaceSecondary }]}>
                <QrCode size={19} color={c.brandAccent} />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: c.textPrimary }]}>Scan V MOTIV Connect QR</Text>
                <Text style={[styles.menuDesc, { color: c.textSecondary }]}>Alert a vehicle owner privately — no sign-in needed</Text>
              </View>
              <ChevronRight size={16} color={c.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: c.divider }]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('ProfileEditor')}
            >
              <View style={[styles.menuIcon, { backgroundColor: c.surfaceSecondary }]}>
                <User size={19} color={c.brandAccent} />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: c.textPrimary }]}>Personal Details</Text>
                <Text style={[styles.menuDesc, { color: c.textSecondary }]}>Name, mobile contact number</Text>
              </View>
              <ChevronRight size={16} color={c.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: c.divider }]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('CitySelection')}
            >
              <View style={[styles.menuIcon, { backgroundColor: c.surfaceSecondary }]}>
                <MapPin size={19} color={c.brandAccent} />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: c.textPrimary }]}>Preferred City</Text>
                <Text style={[styles.menuDesc, { color: c.textSecondary }]}>
                  {profile?.preferredCity || 'Set your primary buying/selling city'}
                </Text>
              </View>
              <ChevronRight size={16} color={c.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: c.divider }]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('Addresses')}
            >
              <View style={[styles.menuIcon, { backgroundColor: c.surfaceSecondary }]}>
                <MapPin size={19} color={c.brandAccent} />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: c.textPrimary }]}>Saved Addresses</Text>
                <Text style={[styles.menuDesc, { color: c.textSecondary }]}>Inspection & doorstep test drive locations</Text>
              </View>
              <ChevronRight size={16} color={c.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: c.divider }]}
              activeOpacity={0.7}
              onPress={() => setNotificationsOpen(true)}
            >
              <View style={[styles.menuIcon, { backgroundColor: c.surfaceSecondary }]}>
                <Bell size={19} color={c.brandAccent} />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: c.textPrimary }]}>Notification Inbox</Text>
                <Text style={[styles.menuDesc, { color: c.textSecondary }]}>Offers, inspection reports & status alerts</Text>
              </View>
              {unreadCount > 0 && (
                <View style={styles.unreadBadgePill}>
                  <Text style={styles.unreadBadgePillText}>{unreadCount} new</Text>
                </View>
              )}
              <ChevronRight size={16} color={c.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, { borderBottomWidth: 0 }]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('MarketingPreferences')}
            >
              <View style={[styles.menuIcon, { backgroundColor: c.surfaceSecondary }]}>
                <Bell size={19} color={c.brandAccent} />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: c.textPrimary }]}>Notification Preferences</Text>
                <Text style={[styles.menuDesc, { color: c.textSecondary }]}>Inventory drops & offer updates</Text>
              </View>
              <ChevronRight size={16} color={c.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Section: Support & Legal */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionHeader, { color: c.textMuted }]}>SUPPORT & PRIVACY</Text>
          <View style={[styles.menuGroup, { backgroundColor: c.surface, borderColor: c.border }]}>
            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: c.divider }]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('Support')}
            >
              <View style={[styles.menuIcon, { backgroundColor: c.surfaceSecondary }]}>
                <Headphones size={19} color={c.brandAccent} />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: c.textPrimary }]}>Help & Support Desk</Text>
                <Text style={[styles.menuDesc, { color: c.textSecondary }]}>Report an issue or talk to our operations</Text>
              </View>
              <ChevronRight size={16} color={c.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, { borderBottomWidth: 0 }]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('PrivacySettings')}
            >
              <View style={[styles.menuIcon, { backgroundColor: c.surfaceSecondary }]}>
                <Shield size={19} color={c.brandAccent} />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: c.textPrimary }]}>Privacy & Data Protection</Text>
                <Text style={[styles.menuDesc, { color: c.textSecondary }]}>Customer data terms and export rights</Text>
              </View>
              <ChevronRight size={16} color={c.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Section: Session & Storage Management */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionHeader, { color: c.textMuted }]}>SESSION & STORAGE</Text>
          <View style={[styles.menuGroup, { backgroundColor: c.surface, borderColor: c.border }]}>
            <TouchableOpacity
              style={[styles.menuItem, { borderBottomWidth: 0 }]}
              activeOpacity={0.7}
              onPress={handleClearData}
              disabled={authBusy}
            >
              <View style={[styles.menuIcon, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                <RotateCcw size={19} color="#EF4444" />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: '#EF4444' }]}>Clear Data & Switch Account</Text>
                <Text style={[styles.menuDesc, { color: c.textSecondary }]}>
                  Wipe device cache, drafts & disconnect Google session
                </Text>
              </View>
              <ChevronRight size={16} color={c.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity
          style={styles.signOutBtn}
          activeOpacity={0.8}
          onPress={handleSignOut}
          disabled={authBusy}
        >
          <LogOut size={16} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Brand Footer */}
        <View style={styles.footerWrap}>
          <BrandLogo variant="emblem" size={20} />
          <Text style={[styles.versionText, { color: c.textMuted }]}>
            V MOTIV Customer App · Version 0.1.0 · India
          </Text>
        </View>
      </ScrollView>

      {/* Customer In-App Notifications Modal */}
      <NotificationsModal
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkAsRead={async (id) => {
          await markNotificationRead(id);
          setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, read: true } : n))
          );
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }}
        onMarkAllAsRead={async () => {
          await markAllNotificationsRead();
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
          setUnreadCount(0);
        }}
        onDismiss={async (id) => {
          if (await dismissNotification(id)) {
            const wasUnread = notifications.some((n) => n.id === id && !n.read);
            setNotifications((prev) => prev.filter((n) => n.id !== id));
            if (wasUnread) setUnreadCount((prev) => Math.max(0, prev - 1));
          }
        }}
        onClearAll={async () => {
          if (await clearAllNotifications()) {
            setNotifications([]);
            setUnreadCount(0);
          }
        }}
        onSelectNotification={handleCustomerNotificationNavigation}
        title="Notifications"
        subtitle="Offers, inspection reports & status alerts"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
  },
  verifiedAccountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(247, 181, 3, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(247, 181, 3, 0.3)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  verifiedAccountText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  content: {
    padding: space.lg,
    gap: space.lg,
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    gap: space.md,
    elevation: 2,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '900',
  },
  userInfo: {
    flex: 1,
    gap: 3,
  },
  userName: {
    fontSize: 17,
    fontWeight: '800',
  },
  userEmail: {
    fontSize: 13,
  },
  cityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  cityText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sectionWrap: {
    gap: space.sm,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    paddingLeft: space.xs,
  },
  menuGroup: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    borderBottomWidth: 1,
    gap: space.md,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    flex: 1,
    gap: 2,
  },
  menuTitle: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  menuDesc: {
    fontSize: 12,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    paddingVertical: 14,
    marginTop: space.xs,
  },
  signOutText: {
    color: '#EF4444',
    fontSize: 14.5,
    fontWeight: '800',
  },
  footerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: space.sm,
  },
  versionText: {
    fontSize: 11.5,
    textAlign: 'center',
  },
  inspectorStaffCard: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: space.lg,
    gap: space.sm,
  },
  inspectorStaffBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(247, 181, 3, 0.14)',
    borderWidth: 1,
    borderColor: '#F7B503',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  inspectorStaffBadgeText: {
    color: '#F7B503',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  inspectorStaffTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  inspectorStaffSub: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  inspectorSwitchButton: {
    marginTop: space.xs,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  inspectorSwitchButtonText: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  unreadBadgePill: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
    marginRight: 6,
  },
  unreadBadgePillText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '800',
  },
});
