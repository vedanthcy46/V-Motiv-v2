import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  BackHandler,
  Keyboard,
  Linking,
  Modal,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Menu,
  X,
  House,
  CarFront,
  KeyRound,
  Wrench,
  Tag,
  Warehouse,
  ClipboardList,
  Bookmark,
  MapPin,
  PhoneCall,
  CircleUserRound,
  ChevronRight,
  ShieldCheck,
  LogOut,
  LogIn,
  Sparkles,
} from 'lucide-react-native';
import { useAppTheme } from '../theme';
import { useAuth } from '../auth/AuthProvider';
import { navigate, navigateToTab } from '../navigation/navigationRef';
import type { Tabs, RootStack } from '../navigation/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(320, SCREEN_WIDTH * 0.82);

// ─────────────────────────────────────────────────────────────
// SIDEBAR CONTEXT
// ─────────────────────────────────────────────────────────────
interface SidebarContextType {
  isOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  isKeyboardVisible: boolean;
}

const SidebarContext = createContext<SidebarContextType>({
  isOpen: false,
  openSidebar: () => {},
  closeSidebar: () => {},
  toggleSidebar: () => {},
  isKeyboardVisible: false,
});

export const useSidebar = () => useContext(SidebarContext);

// ─────────────────────────────────────────────────────────────
// SIDEBAR PROVIDER
// ─────────────────────────────────────────────────────────────
interface SidebarProviderProps {
  children: ReactNode;
}

export function SidebarProvider({ children }: SidebarProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useAppTheme();
  const { state, profile, signOut } = useAuth();

  // Animation values
  const drawerAnim = useRef(new Animated.Value(0)).current;

  // Track virtual keyboard visibility (Keyboard Aware)
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false),
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const openSidebar = useCallback(() => {
    // Dismiss any active keyboard first before opening drawer
    Keyboard.dismiss();
    setIsOpen(true);
    Animated.spring(drawerAnim, {
      toValue: 1,
      damping: 24,
      mass: 0.8,
      stiffness: 220,
      useNativeDriver: true,
    }).start();
  }, [drawerAnim]);

  const closeSidebar = useCallback(() => {
    Animated.timing(drawerAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setIsOpen(false);
    });
  }, [drawerAnim]);

  const toggleSidebar = useCallback(() => {
    if (isOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }, [isOpen, openSidebar, closeSidebar]);

  // Intercept Android hardware back button (Navigation Button Aware)
  useEffect(() => {
    if (!isOpen) return;
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSidebar();
      return true;
    });
    return () => backSub.remove();
  }, [isOpen, closeSidebar]);

  const contextValue = useMemo<SidebarContextType>(
    () => ({
      isOpen,
      openSidebar,
      closeSidebar,
      toggleSidebar,
      isKeyboardVisible,
    }),
    [isOpen, openSidebar, closeSidebar, toggleSidebar, isKeyboardVisible],
  );

  // Backdrop opacity interpolation
  const backdropOpacity = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.65],
  });

  // Drawer slide translateX interpolation
  const drawerTranslateX = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-DRAWER_WIDTH, 0],
  });

  // Floating trigger button positioning (Navigation Button Aware & Keyboard Aware):
  // Safe bounds: below system top bar/headers and above bottom tabs / Android 3-button navigation bar
  const minTriggerY = insets.top + 70;
  const maxTriggerY = Math.max(minTriggerY + 120, SCREEN_HEIGHT - insets.bottom - 130);
  const defaultTriggerY = Math.min(Math.max(Math.round(SCREEN_HEIGHT * 0.4), minTriggerY), maxTriggerY);

  const [triggerY, setTriggerY] = useState(defaultTriggerY);
  const triggerYRef = useRef(defaultTriggerY);

  // Keep trigger within valid bounds if insets change (e.g., orientation or system bar changes)
  useEffect(() => {
    if (triggerYRef.current < minTriggerY) {
      triggerYRef.current = minTriggerY;
      setTriggerY(minTriggerY);
    } else if (triggerYRef.current > maxTriggerY) {
      triggerYRef.current = maxTriggerY;
      setTriggerY(maxTriggerY);
    }
  }, [minTriggerY, maxTriggerY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) => {
          // Claim gesture if user drags vertically by > 5px or drags right by > 12px
          return Math.abs(gesture.dy) > 5 || gesture.dx > 12;
        },
        onPanResponderMove: (_, gesture) => {
          // If flicked/swiped right towards center of screen, open sidebar
          if (gesture.dx > 35) {
            openSidebar();
            return;
          }
          const nextY = Math.min(Math.max(triggerYRef.current + gesture.dy, minTriggerY), maxTriggerY);
          setTriggerY(nextY);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > 30) {
            openSidebar();
            return;
          }
          const nextY = Math.min(Math.max(triggerYRef.current + gesture.dy, minTriggerY), maxTriggerY);
          triggerYRef.current = nextY;
          setTriggerY(nextY);
        },
      }),
    [openSidebar, minTriggerY, maxTriggerY],
  );

  const { state: authState } = useAuth();

  const handleNavToTab = (tab: keyof Tabs) => {
    closeSidebar();
    setTimeout(() => {
      if (authState !== 'signed-in' && tab !== 'Explore') {
        navigateToTab('Account');
        return;
      }
      navigateToTab(tab);
    }, 150);
  };

  const handleNavToStack = (route: keyof RootStack, params?: any) => {
    closeSidebar();
    setTimeout(() => {
      const allowedWithoutAuth = ['Vehicle', 'VehicleGallery', 'InspectionHighlights', 'CitySelection'];
      if (authState !== 'signed-in' && !allowedWithoutAuth.includes(route)) {
        navigateToTab('Account');
        return;
      }
      navigate(route, params);
    }, 150);
  };

  const handleCallHelpline = () => {
    closeSidebar();
    Linking.openURL('tel:1800866848').catch(() => {});
  };

  return (
    <SidebarContext.Provider value={contextValue}>
      <View style={styles.container}>
        {/* Main app screens */}
        {children}

        {/* ── Floating Sidebar Trigger Handle (Navigation Button Aware & Keyboard Aware) ── */}
        {!isOpen && !isKeyboardVisible && (
          <View
            {...panResponder.panHandlers}
            style={[
              styles.floatingTrigger,
              {
                top: triggerY,
                backgroundColor: isDark ? 'rgba(14, 35, 67, 0.94)' : 'rgba(6, 26, 56, 0.96)',
                borderColor: isDark ? 'rgba(247, 181, 3, 0.45)' : 'rgba(247, 181, 3, 0.6)',
                shadowColor: '#000',
              },
            ]}
          >
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Open Navigation Sidebar"
              accessibilityHint="Opens the main navigation menu, or drag vertically to reposition"
              onPress={openSidebar}
              activeOpacity={0.8}
              style={styles.triggerTouchable}
            >
              <View style={styles.triggerInner}>
                <Menu size={18} color="#F7B503" />
                <View style={styles.triggerDot} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Sliding Navigation Drawer Modal ── */}
        {isOpen && (
          <Modal
            transparent
            visible={isOpen}
            animationType="none"
            onRequestClose={closeSidebar}
          >
            <View style={styles.drawerModalContainer}>
              {/* Dimmed backdrop */}
              <Animated.View
                style={[
                  styles.backdrop,
                  {
                    opacity: backdropOpacity,
                  },
                ]}
              >
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={closeSidebar}
                  accessibilityLabel="Close navigation drawer"
                />
              </Animated.View>

              {/* Drawer Sheet */}
              <Animated.View
                style={[
                  styles.drawerSheet,
                  {
                    width: DRAWER_WIDTH,
                    backgroundColor: isDark ? '#08172c' : '#FFFFFF',
                    borderRightColor: isDark ? 'rgba(247, 181, 3, 0.2)' : 'rgba(226, 232, 240, 0.95)',
                    transform: [{ translateX: drawerTranslateX }],
                    paddingTop: Math.max(insets.top, 16),
                    paddingBottom: Math.max(insets.bottom, 16),
                  },
                ]}
              >
                {/* ── Drawer Header ── */}
                <View
                  style={[
                    styles.drawerHeader,
                    {
                      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.brandRow}>
                      <Text style={[styles.brandTitle, { color: isDark ? '#FFFFFF' : '#061A38' }]}>
                        V MOTIV
                      </Text>
                      <View style={styles.brandPill}>
                        <Text style={styles.brandPillText}>AUTO</Text>
                      </View>
                    </View>
                    <Text style={styles.brandTagline}>All-in-One Mobility Ecosystem</Text>
                  </View>

                  <TouchableOpacity
                    onPress={closeSidebar}
                    style={[
                      styles.closeButton,
                      {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                      },
                    ]}
                    accessibilityLabel="Close menu"
                  >
                    <X size={18} color={isDark ? '#F8FAFC' : '#0F172A'} />
                  </TouchableOpacity>
                </View>

                {/* ── User Profile Snapshot ── */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => handleNavToTab('Account')}
                  style={[
                    styles.profileCard,
                    {
                      backgroundColor: isDark ? 'rgba(14, 35, 67, 0.7)' : '#F8FAFC',
                      borderColor: isDark ? 'rgba(247, 181, 3, 0.25)' : '#E2E8F0',
                    },
                  ]}
                >
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarInitial}>
                      {profile?.displayName ? profile.displayName.charAt(0).toUpperCase() : 'V'}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.profileName, { color: isDark ? '#FFFFFF' : '#061A38' }]} numberOfLines={1}>
                      {profile?.displayName || 'V MOTIV Explorer'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      {state === 'signed-in' ? (
                        <>
                          <ShieldCheck size={12} color="#10B981" />
                          <Text style={styles.profileBadgeText}>Verified Member</Text>
                        </>
                      ) : (
                        <>
                          <Sparkles size={12} color="#F7B503" />
                          <Text style={[styles.profileBadgeText, { color: '#F7B503' }]}>Guest · Tap to Sign In</Text>
                        </>
                      )}
                    </View>
                    {profile?.preferredCity ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                        <MapPin size={10} color="#F7B503" />
                        <Text style={[styles.profileCityText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                          {profile.preferredCity}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <ChevronRight size={16} color={isDark ? '#94A3B8' : '#64748B'} />
                </TouchableOpacity>

                {/* ── Scrollable Navigation Items (Navigation Aware) ── */}
                <ScrollView
                  style={styles.navScroll}
                  contentContainerStyle={styles.navScrollContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  {/* SECTION 1: CORE VEHICLE SERVICES */}
                  <Text style={[styles.sectionHeading, { color: isDark ? '#F7B503' : '#B45309' }]}>
                    AUTOMOTIVE SERVICES
                  </Text>

                  <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleNavToTab('Home')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.navIconBox, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' }]}>
                      <House size={18} color="#3B82F6" />
                    </View>
                    <View style={styles.navTextBox}>
                      <Text style={[styles.navTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>Home</Text>
                      <Text style={styles.navSubtitle}>Dashboard & featured deals</Text>
                    </View>
                    <ChevronRight size={15} color={isDark ? '#64748B' : '#94A3B8'} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleNavToTab('Explore')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.navIconBox, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5' }]}>
                      <CarFront size={18} color="#10B981" />
                    </View>
                    <View style={styles.navTextBox}>
                      <Text style={[styles.navTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>Buy Pre-Owned Fleet</Text>
                      <Text style={styles.navSubtitle}>200-point certified cars</Text>
                    </View>
                    <ChevronRight size={15} color={isDark ? '#64748B' : '#94A3B8'} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleNavToStack('RentalHome')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.navIconBox, { backgroundColor: isDark ? 'rgba(247, 181, 3, 0.15)' : '#FFFBEB' }]}>
                      <KeyRound size={18} color="#F7B503" />
                    </View>
                    <View style={styles.navTextBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.navTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>Self-Drive Rentals</Text>
                        <View style={styles.popularBadge}>
                          <Text style={styles.popularBadgeText}>NEW</Text>
                        </View>
                      </View>
                      <Text style={styles.navSubtitle}>Hourly & daily fleet cars</Text>
                    </View>
                    <ChevronRight size={15} color={isDark ? '#64748B' : '#94A3B8'} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleNavToStack('ServiceHome')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.navIconBox, { backgroundColor: isDark ? 'rgba(168, 85, 247, 0.15)' : '#FAF5FF' }]}>
                      <Wrench size={18} color="#A855F7" />
                    </View>
                    <View style={styles.navTextBox}>
                      <Text style={[styles.navTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>Service & Repairs</Text>
                      <Text style={styles.navSubtitle}>Maintenance, RSA & parts</Text>
                    </View>
                    <ChevronRight size={15} color={isDark ? '#64748B' : '#94A3B8'} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleNavToStack('Sell')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.navIconBox, { backgroundColor: isDark ? 'rgba(236, 72, 153, 0.15)' : '#FDF2F8' }]}>
                      <Tag size={18} color="#EC4899" />
                    </View>
                    <View style={styles.navTextBox}>
                      <Text style={[styles.navTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>Sell Your Car</Text>
                      <Text style={styles.navSubtitle}>Instant free valuation</Text>
                    </View>
                    <ChevronRight size={15} color={isDark ? '#64748B' : '#94A3B8'} />
                  </TouchableOpacity>

                  {/* SECTION 2: MY MOBILITY */}
                  <Text style={[styles.sectionHeading, { color: isDark ? '#94A3B8' : '#64748B', marginTop: 14 }]}>
                    MY MOBILITY
                  </Text>

                  <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleNavToTab('Garage')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.navIconBox, { backgroundColor: isDark ? 'rgba(14, 165, 233, 0.15)' : '#F0F9FF' }]}>
                      <Warehouse size={18} color="#0EA5E9" />
                    </View>
                    <View style={styles.navTextBox}>
                      <Text style={[styles.navTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>My Garage</Text>
                      <Text style={styles.navSubtitle}>Vehicle docs & service logs</Text>
                    </View>
                    <ChevronRight size={15} color={isDark ? '#64748B' : '#94A3B8'} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleNavToTab('Activity')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.navIconBox, { backgroundColor: isDark ? 'rgba(20, 184, 166, 0.15)' : '#F0FDFA' }]}>
                      <ClipboardList size={18} color="#14B8A6" />
                    </View>
                    <View style={styles.navTextBox}>
                      <Text style={[styles.navTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>Activity & Bookings</Text>
                      <Text style={styles.navSubtitle}>Rentals, test drives & jobs</Text>
                    </View>
                    <ChevronRight size={15} color={isDark ? '#64748B' : '#94A3B8'} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleNavToStack('Wishlist')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.navIconBox, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2' }]}>
                      <Bookmark size={18} color="#EF4444" />
                    </View>
                    <View style={styles.navTextBox}>
                      <Text style={[styles.navTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>Saved Cars Wishlist</Text>
                      <Text style={styles.navSubtitle}>Favorite shortlisted vehicles</Text>
                    </View>
                    <ChevronRight size={15} color={isDark ? '#64748B' : '#94A3B8'} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleNavToStack('Addresses')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.navIconBox, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.15)' : '#F5F3FF' }]}>
                      <MapPin size={18} color="#8B5CF6" />
                    </View>
                    <View style={styles.navTextBox}>
                      <Text style={[styles.navTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>Saved Hub Addresses</Text>
                      <Text style={styles.navSubtitle}>Pickup & doorstep delivery</Text>
                    </View>
                    <ChevronRight size={15} color={isDark ? '#64748B' : '#94A3B8'} />
                  </TouchableOpacity>

                  {/* SECTION 3: SUPPORT & PREFERENCES */}
                  <Text style={[styles.sectionHeading, { color: isDark ? '#94A3B8' : '#64748B', marginTop: 14 }]}>
                    ASSISTANCE & SETTINGS
                  </Text>

                  <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleNavToStack('CitySelection')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.navIconBox, { backgroundColor: isDark ? 'rgba(247, 181, 3, 0.15)' : '#FFFBEB' }]}>
                      <MapPin size={18} color="#F7B503" />
                    </View>
                    <View style={styles.navTextBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.navTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>Explore City</Text>
                        {profile?.preferredCity ? (
                          <View style={styles.cityPill}>
                            <Text style={styles.cityPillText}>{profile.preferredCity}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.navSubtitle}>Hubs & inventory locations</Text>
                    </View>
                    <ChevronRight size={15} color={isDark ? '#64748B' : '#94A3B8'} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleNavToStack('Support')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.navIconBox, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB' }]}>
                      <PhoneCall size={18} color="#F59E0B" />
                    </View>
                    <View style={styles.navTextBox}>
                      <Text style={[styles.navTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>24/7 Roadside Assistance</Text>
                      <Text style={styles.navSubtitle}>Emergency helpline & support</Text>
                    </View>
                    <ChevronRight size={15} color={isDark ? '#64748B' : '#94A3B8'} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleNavToTab('Account')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.navIconBox, { backgroundColor: isDark ? 'rgba(100, 116, 139, 0.15)' : '#F1F5F9' }]}>
                      <CircleUserRound size={18} color="#64748B" />
                    </View>
                    <View style={styles.navTextBox}>
                      <Text style={[styles.navTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>Profile & Settings</Text>
                      <Text style={styles.navSubtitle}>Security, terms & privacy</Text>
                    </View>
                    <ChevronRight size={15} color={isDark ? '#64748B' : '#94A3B8'} />
                  </TouchableOpacity>
                </ScrollView>

                {/* ── Drawer Footer (Navigation Button Aware) ── */}
                <View
                  style={[
                    styles.drawerFooter,
                    {
                      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                    },
                  ]}
                >
                  {/* Roadside Emergency Quick Call */}
                  <TouchableOpacity
                    onPress={handleCallHelpline}
                    activeOpacity={0.8}
                    style={[
                      styles.helplineBtn,
                      {
                        backgroundColor: isDark ? 'rgba(247, 181, 3, 0.12)' : '#FEF3C7',
                        borderColor: isDark ? 'rgba(247, 181, 3, 0.35)' : '#FDE68A',
                      },
                    ]}
                  >
                    <PhoneCall size={14} color="#D97706" />
                    <Text style={styles.helplineText}>Fleet Emergency: 1800-866-848</Text>
                  </TouchableOpacity>

                  {/* Auth Action Button */}
                  {state === 'signed-in' ? (
                    <TouchableOpacity
                      onPress={() => {
                        closeSidebar();
                        void signOut();
                      }}
                      style={styles.authActionBtn}
                      activeOpacity={0.75}
                    >
                      <LogOut size={14} color={isDark ? '#94A3B8' : '#64748B'} />
                      <Text style={[styles.authActionText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                        Sign Out
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleNavToTab('Account')}
                      style={styles.authActionBtn}
                      activeOpacity={0.75}
                    >
                      <LogIn size={14} color="#F7B503" />
                      <Text style={[styles.authActionText, { color: '#F7B503', fontWeight: '700' }]}>
                        Sign In / Register
                      </Text>
                    </TouchableOpacity>
                  )}

                  <Text style={styles.appVersionText}>V MOTIV Customer App · v2.4.0</Text>
                </View>
              </Animated.View>
            </View>
          </Modal>
        )}
      </View>
    </SidebarContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  floatingTrigger: {
    position: 'absolute',
    left: 0,
    width: 38,
    height: 48,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    borderWidth: 1.5,
    borderLeftWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 12,
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  triggerInner: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  triggerTouchable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#F7B503',
    marginTop: 3,
  },
  drawerModalContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
  },
  drawerSheet: {
    height: '100%',
    borderRightWidth: 1,
    elevation: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    display: 'flex',
    flexDirection: 'column',
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  brandPill: {
    backgroundColor: '#F7B503',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  brandPillText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#061A38',
    letterSpacing: 0.5,
  },
  brandTagline: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '500',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F7B503',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '800',
    color: '#061A38',
  },
  profileName: {
    fontSize: 13,
    fontWeight: '700',
  },
  profileBadgeText: {
    fontSize: 10,
    color: '#10B981',
    fontWeight: '600',
  },
  profileCityText: {
    fontSize: 10,
    fontWeight: '600',
  },
  cityPill: {
    backgroundColor: 'rgba(247, 181, 3, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  cityPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D97706',
  },
  navScroll: {
    flex: 1,
  },
  navScrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginLeft: 6,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  navIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  navTextBox: {
    flex: 1,
  },
  navTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  navSubtitle: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  popularBadge: {
    backgroundColor: '#F7B503',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  popularBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#061A38',
  },
  drawerFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  helplineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  helplineText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  authActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  authActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  appVersionText: {
    fontSize: 9,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
  },
});
