import React from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Bookmark, CarFront, CircleUserRound, ClipboardList, House, Warehouse } from 'lucide-react-native';
import { ExploreScreen } from '../screens/ExploreScreen';
import { SellScreen } from '../screens/SellScreen';
import { WishlistScreen } from '../screens/WishlistScreen';
import { RequestsScreen } from '../screens/RequestsScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { VehicleScreen } from '../screens/VehicleScreen';
import { TestDriveScreen } from '../screens/TestDriveScreen';
import { TestDriveDetailsScreen } from '../screens/TestDriveDetailsScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { SupportScreen } from '../screens/SupportScreen';
import { VehicleGalleryScreen } from '../screens/VehicleGalleryScreen';
import { InspectionHighlightsScreen } from '../screens/InspectionHighlightsScreen';
import { CitySelectionScreen } from '../screens/CitySelectionScreen';
import { SellingRequestDetailsScreen } from '../screens/SellingRequestDetailsScreen';
import { PurchaseEnquiryScreen } from '../screens/PurchaseEnquiryScreen';
import { PurchaseEnquiryDetailsScreen } from '../screens/PurchaseEnquiryDetailsScreen';
import { ProfileEditorScreen } from '../screens/ProfileEditorScreen';
import { MarketingPreferencesScreen } from '../screens/MarketingPreferencesScreen';
import { PrivacySettingsScreen } from '../screens/PrivacySettingsScreen';
import { AddressesScreen } from '../screens/AddressesScreen';
import { SupportCaseDetailsScreen } from '../screens/SupportCaseDetailsScreen';
import { MyGarageScreen } from '../screens/MyGarageScreen';
import { ServiceHomeScreen } from '../screens/ServiceHomeScreen';
import { ServiceRequestDetailsScreen } from '../screens/ServiceRequestDetailsScreen';
import { RentalHomeScreen } from '../screens/RentalHomeScreen';
import { RentalSearchResultsScreen } from '../screens/RentalSearchResultsScreen';
import { RentalVehicleDetailsScreen } from '../screens/RentalVehicleDetailsScreen';
import { RentalCheckoutScreen } from '../screens/RentalCheckoutScreen';
import { RentalBookingDetailsScreen } from '../screens/RentalBookingDetailsScreen';
import { useAppTheme } from '../theme';
import type { RootStack, Tabs } from './types';

const Tab = createBottomTabNavigator<Tabs>();
const Stack = createNativeStackNavigator<RootStack>();
const icons = {
  Home: House,
  Explore: CarFront,
  Garage: Warehouse,
  Activity: ClipboardList,
  Account: CircleUserRound,
};

function CustomerTabs() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useAppTheme();
  const c = theme.colors;

  // Spinny-like floating bottom bar positioning:
  // Floats above device safe area with rounded capsule corners, subtle border, and deep elevated shadow
  const bottomFloatingInset = Math.max(insets.bottom, Platform.OS === 'android' ? 14 : 12);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: isDark ? '#F7B503' : c.tabBarActive,
        tabBarInactiveTintColor: isDark ? '#8FA3BF' : c.tabBarInactive,
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: bottomFloatingInset,
          height: 64,
          borderRadius: 32,
          backgroundColor: isDark ? 'rgba(14, 35, 67, 0.95)' : 'rgba(255, 255, 255, 0.97)',
          borderColor: isDark ? 'rgba(247, 181, 3, 0.22)' : 'rgba(226, 232, 240, 0.95)',
          borderWidth: 1,
          borderTopWidth: 1,
          borderTopColor: isDark ? 'rgba(247, 181, 3, 0.22)' : 'rgba(226, 232, 240, 0.95)',
          paddingTop: 8,
          paddingBottom: 8,
          elevation: 14,
          shadowColor: isDark ? '#000000' : '#061A38',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.45 : 0.12,
          shadowRadius: 16,
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '700', marginTop: 2 },
        tabBarIcon: ({ color: iconColor, size }) => {
          const Icon = icons[route.name as keyof typeof icons] || House;
          return <Icon accessibilityElementsHidden size={22} color={iconColor} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen
        name="Garage"
        component={MyGarageScreen}
        options={{ tabBarLabel: 'Garage' }}
      />
      <Tab.Screen name="Activity" component={RequestsScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

export function CustomerNavigator() {
  const { theme } = useAppTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Tabs" component={CustomerTabs} />
      <Stack.Screen name="Vehicle" component={VehicleScreen} />
      <Stack.Screen
        name="VehicleGallery"
        component={VehicleGalleryScreen}
        options={{ presentation: 'fullScreenModal', animation: 'fade' }}
      />
      <Stack.Screen
        name="InspectionHighlights"
        component={InspectionHighlightsScreen}
        options={{ presentation: 'card', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="CitySelection"
        component={CitySelectionScreen}
        options={{ presentation: 'card', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="SellingRequestDetails" component={SellingRequestDetailsScreen} />
      <Stack.Screen name="PurchaseEnquiryDetails" component={PurchaseEnquiryDetailsScreen} />
      <Stack.Screen
        name="PurchaseEnquiry"
        component={PurchaseEnquiryScreen}
        options={{ presentation: 'card', animation: 'slide_from_bottom', gestureEnabled: false }}
      />
      <Stack.Screen name="ProfileEditor" component={ProfileEditorScreen} />
      <Stack.Screen name="MarketingPreferences" component={MarketingPreferencesScreen} />
      <Stack.Screen name="PrivacySettings" component={PrivacySettingsScreen} />
      <Stack.Screen
        name="Addresses"
        component={AddressesScreen}
        options={{ presentation: 'card', animation: 'slide_from_bottom', gestureEnabled: false }}
      />
      <Stack.Screen name="SupportCaseDetails" component={SupportCaseDetailsScreen} />
      <Stack.Screen name="TestDriveDetails" component={TestDriveDetailsScreen} />
      <Stack.Screen
        name="TestDrive"
        component={TestDriveScreen}
        options={{ presentation: 'card', animation: 'slide_from_bottom', gestureEnabled: false }}
      />
      <Stack.Screen
        name="Sell"
        component={SellScreen}
        options={{ presentation: 'card', animation: 'slide_from_bottom', gestureEnabled: false }}
      />
      <Stack.Screen
        name="Support"
        component={SupportScreen}
        options={{ presentation: 'card', animation: 'slide_from_bottom', gestureEnabled: false }}
      />
      <Stack.Screen
        name="Wishlist"
        component={WishlistScreen}
        options={{ presentation: 'card', animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="MyGarage"
        component={MyGarageScreen}
        options={{ presentation: 'card', animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="ServiceHome"
        component={ServiceHomeScreen}
        options={{ presentation: 'card', animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="ServiceRequestDetails"
        component={ServiceRequestDetailsScreen}
        options={{ presentation: 'card', animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="RentalHome"
        component={RentalHomeScreen}
        options={{ presentation: 'card', animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="RentalSearchResults"
        component={RentalSearchResultsScreen}
        options={{ presentation: 'card', animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="RentalVehicleDetails"
        component={RentalVehicleDetailsScreen}
        options={{ presentation: 'card', animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="RentalCheckout"
        component={RentalCheckoutScreen}
        options={{ presentation: 'card', animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="RentalBookingDetails"
        component={RentalBookingDetailsScreen}
        options={{ presentation: 'card', animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
