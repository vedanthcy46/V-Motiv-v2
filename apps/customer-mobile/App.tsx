import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StatusBar as NativeStatusBar, View } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme, type LinkingOptions } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { CustomerNavigator } from './src/navigation/CustomerNavigator';
import { InspectorScreen } from './src/screens/InspectorScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { ThemeProvider, useAppTheme } from './src/theme';
import { BrandRevealScreen } from './src/components/BrandRevealScreen';
import type { RootStack } from './src/navigation/types';

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
  const { state, profile, isInspector, activeMode } = useAuth();
  const { theme } = useAppTheme();

  if (state === 'booting') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center' }}>
        <ActivityIndicator accessibilityLabel="Restoring account" color={theme.colors.brandAccent} />
      </View>
    );
  }

  // If authenticated as an Inspector and in inspector mode, redirect to Inspector Portal
  if (state === 'signed-in' && isInspector && activeMode === 'inspector') {
    return <InspectorScreen />;
  }

  // Discovery is public. Authentication is requested only from actions that create or expose customer data.
  if (state === 'signed-in' && (!profile?.termsAcceptedAt || !profile?.phone) && !isInspector) {
    return <OnboardingScreen />;
  }

  return <CustomerNavigator />;
}

function MainContent({ onFinishReveal }: { onFinishReveal: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const { theme, isDark } = useAppTheme();

  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.brandAccent,
        background: theme.colors.background,
        card: theme.colors.tabBar,
        text: theme.colors.textPrimary,
        border: theme.colors.border,
        notification: theme.colors.brandAccent,
      },
    };
  }, [isDark, theme.colors]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NativeStatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.surface}
        translucent={Platform.OS === 'android'}
      />
      {revealed ? (
        <AuthProvider>
          <NavigationContainer<RootStack> theme={navTheme} linking={linking}>
            <Root />
          </NavigationContainer>
        </AuthProvider>
      ) : (
        <BrandRevealScreen
          onFinish={() => {
            setRevealed(true);
            onFinishReveal();
          }}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <MainContent onFinishReveal={() => {}} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
