import React from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Bookmark, CarFront, CircleUserRound, ClipboardList, House } from 'lucide-react-native';
import { ExploreScreen } from '../screens/ExploreScreen';
import { SellScreen } from '../screens/SellScreen';
import { WishlistScreen } from '../screens/WishlistScreen';
import { RequestsScreen } from '../screens/RequestsScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { VehicleScreen } from '../screens/VehicleScreen';
import { TestDriveScreen } from '../screens/TestDriveScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { SupportScreen } from '../screens/SupportScreen';
import { VehicleGalleryScreen } from '../screens/VehicleGalleryScreen';
import { InspectionHighlightsScreen } from '../screens/InspectionHighlightsScreen';
import { CitySelectionScreen } from '../screens/CitySelectionScreen';
import { SellingRequestDetailsScreen } from '../screens/SellingRequestDetailsScreen';
import { PurchaseEnquiryScreen } from '../screens/PurchaseEnquiryScreen';
import { ProfileEditorScreen } from '../screens/ProfileEditorScreen';
import { MarketingPreferencesScreen } from '../screens/MarketingPreferencesScreen';
import { PrivacySettingsScreen } from '../screens/PrivacySettingsScreen';
import { AddressesScreen } from '../screens/AddressesScreen';
import { SupportCaseDetailsScreen } from '../screens/SupportCaseDetailsScreen';
import { color } from '../theme';
import type { RootStack, Tabs } from './types';

const Tab = createBottomTabNavigator<Tabs>();
const Stack = createNativeStackNavigator<RootStack>();
const icons = { Home: House, Explore: CarFront, Saved: Bookmark, Activity: ClipboardList, Account: CircleUserRound };

function CustomerTabs() {
  const insets = useSafeAreaInsets();
  // Safe bottom inset accounts for Android 3-button bar (~48dp), gesture bar (~20-24dp), or iOS home indicator (~34dp)
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8);
  const tabHeight = 56 + bottomInset;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: color.yellow,
        tabBarInactiveTintColor: color.muted,
        tabBarStyle: {
          backgroundColor: color.navy,
          borderTopColor: color.border,
          borderTopWidth: 1,
          height: tabHeight,
          paddingTop: 6,
          paddingBottom: bottomInset,
          elevation: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarIcon: ({ color: iconColor, size }) => {
          const Icon = icons[route.name];
          return <Icon accessibilityElementsHidden size={size} color={iconColor} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen name="Saved" component={WishlistScreen} />
      <Tab.Screen name="Activity" component={RequestsScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

export function CustomerNavigator() {
  return <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas }, animation: 'slide_from_right' }}>
    <Stack.Screen name="Tabs" component={CustomerTabs} />
    <Stack.Screen name="Vehicle" component={VehicleScreen} />
    <Stack.Screen name="VehicleGallery" component={VehicleGalleryScreen} options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
    <Stack.Screen name="InspectionHighlights" component={InspectionHighlightsScreen} options={{ presentation: 'card', animation: 'slide_from_bottom' }} />
    <Stack.Screen name="CitySelection" component={CitySelectionScreen} options={{ presentation: 'card', animation: 'slide_from_bottom' }} />
    <Stack.Screen name="SellingRequestDetails" component={SellingRequestDetailsScreen} />
    <Stack.Screen name="PurchaseEnquiry" component={PurchaseEnquiryScreen} options={{ presentation: 'card', animation: 'slide_from_bottom', gestureEnabled: false }} />
    <Stack.Screen name="ProfileEditor" component={ProfileEditorScreen} />
    <Stack.Screen name="MarketingPreferences" component={MarketingPreferencesScreen} />
    <Stack.Screen name="PrivacySettings" component={PrivacySettingsScreen} />
    <Stack.Screen name="Addresses" component={AddressesScreen} options={{ presentation: 'card', animation: 'slide_from_bottom', gestureEnabled: false }} />
    <Stack.Screen name="SupportCaseDetails" component={SupportCaseDetailsScreen} />
    <Stack.Screen name="TestDrive" component={TestDriveScreen} options={{ presentation: 'card', animation: 'slide_from_bottom', gestureEnabled: false }} />
    <Stack.Screen name="Sell" component={SellScreen} options={{ presentation: 'card', animation: 'slide_from_bottom', gestureEnabled: false }} />
    <Stack.Screen name="Support" component={SupportScreen} options={{ presentation: 'card', animation: 'slide_from_bottom', gestureEnabled: false }} />
  </Stack.Navigator>;
}
