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
  CheckCircle2,
  ChevronRight,
  Headphones,
  LogOut,
  MapPin,
  RotateCcw,
  Shield,
  Trash2,
  User,
} from 'lucide-react-native';
import { BrandLogo } from '../components/BrandLogo';
import { NotificationsModal } from '../components/NotificationsModal';
import {
  fetchUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type InAppNotification,
} from '../services/notifications';
import { useAuth } from '../auth/AuthProvider';
import { AuthScreen } from './AuthScreen';
import { color, radius, space } from '../theme';

export function AccountScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { state, profile, busy: authBusy, signOut, clearSessionData, isInspector, setActiveMode } = useAuth();

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

      if (cat.includes('TEST_DRIVE') || event.includes('TEST_DRIVE')) {
        navigation.navigate('Tabs', { screen: 'Activity' });
        return;
      }

      if (cat.includes('SUPPORT') || event.includes('TICKET') || event.includes('CASE')) {
        if (entityId) {
          navigation.navigate('SupportCaseDetails', { caseId: entityId });
        } else {
          navigation.navigate('Support');
        }
        return;
      }

      navigation.navigate('Tabs', { screen: 'Activity' });
    },
    [navigation]
  );

  if (state !== 'signed-in') {
    return <AuthScreen />;
  }

  function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your V MOTIV account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
          },
        },
      ]
    );
  }

  function handleClearData() {
    Alert.alert(
      'Clear App Data & Switch Account',
      'This will erase all locally cached vehicle drafts, offline inspection data, and disconnect your Google session so you can log in with a different account or session. Do you wish to continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All Data & Sign Out',
          style: 'destructive',
          onPress: async () => {
            await clearSessionData();
          },
        },
      ]
    );
  }

  const initials = profile?.displayName
    ? profile.displayName
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'VM';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Bar with Brand Logo */}
      <View style={styles.topBar}>
        <BrandLogo variant="horizontal" size={24} showTagline={false} />
        <View style={styles.verifiedAccountBadge}>
          <CheckCircle2 size={12} color={color.yellow} />
          <Text style={styles.verifiedAccountText}>VERIFIED</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 20) + 80 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* User Profile Card */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{profile?.displayName || 'V MOTIV Customer'}</Text>
            <Text style={styles.userEmail}>{profile?.email}</Text>
            {profile?.preferredCity ? (
              <View style={styles.cityPill}>
                <MapPin size={11} color={color.yellow} />
                <Text style={styles.cityText}>{profile.preferredCity}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Authorized Staff / Inspector Workspace Switcher */}
        {isInspector ? (
          <View style={styles.inspectorStaffCard}>
            <View style={styles.inspectorStaffBadge}>
              <Text style={styles.inspectorStaffBadgeText}>AUTHORIZED FIELD INSPECTOR</Text>
            </View>
            <Text style={styles.inspectorStaffTitle}>Vehicle Inspection Workspace</Text>
            <Text style={styles.inspectorStaffSub}>
              You are signed in with evaluator privileges. Touch to access assigned jobs and inspection tools.
            </Text>
            <TouchableOpacity
              style={styles.inspectorSwitchButton}
              activeOpacity={0.8}
              onPress={() => setActiveMode('inspector')}
            >
              <Text style={styles.inspectorSwitchButtonText}>Open Inspector Workspace</Text>
              <ChevronRight size={16} color={color.navy} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Section: Account & Preferences */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionHeader}>ACCOUNT & PROFILE</Text>
          <View style={styles.menuGroup}>
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('ProfileEditor')}
            >
              <View style={styles.menuIcon}>
                <User size={19} color={color.yellow} />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.menuTitle}>Personal Details</Text>
                <Text style={styles.menuDesc}>Name, mobile contact number</Text>
              </View>
              <ChevronRight size={16} color={color.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('CitySelection')}
            >
              <View style={styles.menuIcon}>
                <MapPin size={19} color={color.yellow} />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.menuTitle}>Preferred City</Text>
                <Text style={styles.menuDesc}>
                  {profile?.preferredCity || 'Set your primary buying/selling city'}
                </Text>
              </View>
              <ChevronRight size={16} color={color.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('Addresses')}
            >
              <View style={styles.menuIcon}>
                <MapPin size={19} color={color.yellow} />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.menuTitle}>Saved Addresses</Text>
                <Text style={styles.menuDesc}>Inspection & doorstep test drive locations</Text>
              </View>
              <ChevronRight size={16} color={color.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => setNotificationsOpen(true)}
            >
              <View style={styles.menuIcon}>
                <Bell size={19} color={color.yellow} />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.menuTitle}>Notification Inbox</Text>
                <Text style={styles.menuDesc}>Offers, inspection reports & status alerts</Text>
              </View>
              {unreadCount > 0 && (
                <View style={styles.unreadBadgePill}>
                  <Text style={styles.unreadBadgePillText}>{unreadCount} new</Text>
                </View>
              )}
              <ChevronRight size={16} color={color.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, { borderBottomWidth: 0 }]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('MarketingPreferences')}
            >
              <View style={styles.menuIcon}>
                <Bell size={19} color={color.yellow} />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.menuTitle}>Notification Preferences</Text>
                <Text style={styles.menuDesc}>Inventory drops & offer updates</Text>
              </View>
              <ChevronRight size={16} color={color.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Section: Support & Legal */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionHeader}>SUPPORT & PRIVACY</Text>
          <View style={styles.menuGroup}>
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('Support')}
            >
              <View style={styles.menuIcon}>
                <Headphones size={19} color={color.yellow} />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.menuTitle}>Help & Support Desk</Text>
                <Text style={styles.menuDesc}>Report an issue or talk to our operations</Text>
              </View>
              <ChevronRight size={16} color={color.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, { borderBottomWidth: 0 }]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('PrivacySettings')}
            >
              <View style={styles.menuIcon}>
                <Shield size={19} color={color.yellow} />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.menuTitle}>Privacy & Data Protection</Text>
                <Text style={styles.menuDesc}>Customer data terms and export rights</Text>
              </View>
              <ChevronRight size={16} color={color.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Section: Session & Storage Management */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionHeader}>SESSION & STORAGE</Text>
          <View style={styles.menuGroup}>
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
                <Text style={[styles.menuTitle, { color: '#FCA5A5' }]}>Clear Data & Switch Account</Text>
                <Text style={styles.menuDesc}>
                  Wipe device cache, drafts & disconnect Google session
                </Text>
              </View>
              <ChevronRight size={16} color={color.muted} />
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
          <Text style={styles.versionText}>
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
    backgroundColor: color.canvas,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: color.navy,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
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
    color: color.yellow,
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
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: color.border,
    gap: space.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: color.raised,
    borderWidth: 2,
    borderColor: color.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: color.yellow,
    fontSize: 18,
    fontWeight: '900',
  },
  userInfo: {
    flex: 1,
    gap: 3,
  },
  userName: {
    color: color.white,
    fontSize: 17,
    fontWeight: '800',
  },
  userEmail: {
    color: color.textSecondary,
    fontSize: 13,
  },
  cityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: color.input,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  cityText: {
    color: color.yellow,
    fontSize: 11,
    fontWeight: '700',
  },
  sectionWrap: {
    gap: space.sm,
  },
  sectionHeader: {
    color: color.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    paddingLeft: space.xs,
  },
  menuGroup: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    gap: space.md,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    flex: 1,
    gap: 2,
  },
  menuTitle: {
    color: color.white,
    fontSize: 14.5,
    fontWeight: '700',
  },
  menuDesc: {
    color: color.muted,
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
    color: color.muted,
    fontSize: 11.5,
    textAlign: 'center',
  },
  inspectorStaffCard: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.yellow,
    padding: space.lg,
    gap: space.sm,
  },
  inspectorStaffBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(247, 181, 3, 0.14)',
    borderWidth: 1,
    borderColor: color.yellow,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  inspectorStaffBadgeText: {
    color: color.yellow,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  inspectorStaffTitle: {
    color: color.white,
    fontSize: 16,
    fontWeight: '800',
  },
  inspectorStaffSub: {
    color: color.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
  },
  inspectorSwitchButton: {
    marginTop: space.xs,
    backgroundColor: color.yellow,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  inspectorSwitchButtonText: {
    color: color.navy,
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
