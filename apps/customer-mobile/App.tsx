import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DarkTheme, type LinkingOptions } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { CustomerNavigator } from './src/navigation/CustomerNavigator';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { color } from './src/theme';
import { BrandRevealScreen } from './src/components/BrandRevealScreen';
import type { RootStack } from './src/navigation/types';

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, primary: color.yellow, background: color.canvas, card: color.navy, text: color.text, border: color.border, notification: color.yellow } };
const linking: LinkingOptions<RootStack> = {
  prefixes: ['vmotiv://'],
  config: {
    screens: {
      Tabs: { screens: { Home: '', Explore: 'explore', Saved: 'saved', Activity: 'activity', Account: 'account' } },
      Vehicle: 'vehicles/:listingId',
      Support: 'support',
      PrivacySettings: 'privacy',
    },
  },
};

function Root() {
  const { state, profile } = useAuth();
  if (state === 'booting') return <View style={{ flex: 1, backgroundColor: color.canvas, justifyContent: 'center' }}><ActivityIndicator accessibilityLabel="Restoring account" color={color.yellow} /></View>;
  // Discovery is public. Authentication is requested only from actions that create or expose customer data.
  if (state === 'signed-in' && !profile?.termsAcceptedAt) return <OnboardingScreen />;
  return <CustomerNavigator />;
}

export default function App() {
  const [revealed, setRevealed] = useState(false);
  return <SafeAreaProvider>{revealed ? <AuthProvider><NavigationContainer<RootStack> theme={theme} linking={linking}><StatusBar style="light" /><Root /></NavigationContainer></AuthProvider> : <BrandRevealScreen onFinish={() => setRevealed(true)} />}</SafeAreaProvider>;
}
