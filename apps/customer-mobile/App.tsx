import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StatusBar as NativeStatusBar, View } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme, type LinkingOptions } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { CustomerNavigator } from './src/navigation/CustomerNavigator';
import { InspectorScreen } from './src/screens/InspectorScreen';
import { InspectorMfaEnrollmentScreen } from './src/screens/InspectorMfaEnrollmentScreen';
import { inspectorNeedsMfaEnrollment } from './src/auth/mfa-enrollment';
import { readEnrolledFactorCount } from './src/auth/mfa-enrollment-service';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { ThemeProvider, useAppTheme } from './src/theme';
import { BrandRevealScreen } from './src/components/BrandRevealScreen';
import { AppIntroScreen } from './src/components/AppIntroScreen';
import { hasSeenAppIntro, markAppIntroSeen } from './src/services/app-intro';
import { ConnectIncomingCallOverlay } from './src/components/ConnectIncomingCallOverlay';
import { PaymentStatusHost } from './src/components/PaymentStatusHost';
import { UpdateAvailableCard } from './src/components/UpdateAvailableCard';
import { SidebarProvider } from './src/components/AppSidebar';
import { navigationRef } from './src/navigation/navigationRef';
import type { RootStack } from './src/navigation/types';

const linking: LinkingOptions<RootStack> = {
  prefixes: ['vmotiv://'],
  config: {
    screens: {
      Tabs: { screens: { Home: '', Explore: 'explore', Saved: 'saved', Garage: 'garage/:vehicleId?', Activity: 'activity', Account: 'account' } },
      ConnectGuest: {
        path: 'connect/scan',
        parse: { token: (token: string) => token },
      },
      Vehicle: 'vehicles/:listingId',
      Quotation: 'quotations/:quotationId',
      Support: 'support',
      PrivacySettings: 'privacy',
    },
  },
};

function Root() {
  const { state, profile, isInspector, activeMode } = useAuth();
  const { theme } = useAppTheme();
  // How many second factors the signed-in inspector has (null = not checked / unknown, which never blocks).
  const [enrolledFactorCount, setEnrolledFactorCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    if (state === 'signed-in' && isInspector) {
      void readEnrolledFactorCount().then(count => {
        if (active) setEnrolledFactorCount(count);
      });
    } else {
      setEnrolledFactorCount(null);
    }
    return () => {
      active = false;
    };
  }, [state, isInspector]);

  if (state === 'booting') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center' }}>
        <ActivityIndicator accessibilityLabel="Restoring account" color={theme.colors.brandAccent} />
      </View>
    );
  }

  // First login of a field inspector: a phone second factor must be added before anything else.
  if (inspectorNeedsMfaEnrollment({ signedIn: state === 'signed-in', isInspector, enrolledFactorCount })) {
    return <InspectorMfaEnrollmentScreen />;
  }

  // If authenticated as an Inspector and in inspector mode, redirect to Inspector Portal
  if (state === 'signed-in' && isInspector && activeMode === 'inspector') {
    return <InspectorScreen />;
  }

  // Discovery is public. Authentication is requested only from actions that create or expose customer data.
  if (state === 'signed-in' && (!profile?.termsAcceptedAt || !profile?.phone) && !isInspector) {
    return <OnboardingScreen />;
  }

  return (
    <SidebarProvider>
      <CustomerNavigator />
      {state === 'signed-in' ? <ConnectIncomingCallOverlay /> : null}
      <PaymentStatusHost />
      <UpdateAvailableCard />
    </SidebarProvider>
  );
}

function MainContent({ onFinishReveal }: { onFinishReveal: () => void }) {
  // brand -> (checking whether the introduction was seen) -> introduction, first launch only -> app
  const [stage, setStage] = useState<'brand' | 'checking' | 'intro' | 'app'>('brand');
  const { theme, isDark } = useAppTheme();

  useEffect(() => {
    if (stage !== 'checking') return undefined;
    let active = true;
    void hasSeenAppIntro().then(seen => { if (active) setStage(seen ? 'app' : 'intro'); });
    return () => { active = false; };
  }, [stage]);

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
      {stage === 'app' ? (
        <AuthProvider>
          <NavigationContainer<RootStack> ref={navigationRef} theme={navTheme} linking={linking}>
            <Root />
          </NavigationContainer>
        </AuthProvider>
      ) : stage === 'intro' ? (
        <AppIntroScreen
          onFinish={() => {
            void markAppIntroSeen();
            setStage('app');
          }}
        />
      ) : stage === 'checking' ? (
        <View style={{ flex: 1, backgroundColor: theme.colors.background }} />
      ) : (
        <BrandRevealScreen
          onFinish={() => {
            setStage('checking');
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
