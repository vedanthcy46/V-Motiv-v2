import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const THEME_STORAGE_KEY = 'vmotiv.v2.theme-preference';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface AppThemeColors {
  // Backgrounds & Surfaces
  background: string;
  surface: string;
  surfaceSecondary: string;
  surfaceRaised: string;
  card: string;
  cardSecondary: string;

  // Typography
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;

  // Brand Foundations
  brandAccent: string; // Signature Yellow #F7B503
  brandAccentPressed: string; // #D99D00
  brandNavy: string; // Navy #061A38

  // Borders & Dividers
  border: string;
  borderStrong: string;
  divider: string;

  // Inputs
  inputBackground: string;
  inputBorder: string;
  inputBorderFocused: string;
  inputPlaceholder: string;

  // Buttons
  buttonPrimary: string;
  buttonPrimaryText: string;
  buttonSecondary: string;
  buttonSecondaryText: string;
  buttonSecondaryBorder: string;

  // Status & Feedback
  success: string;
  successBackground: string;
  warning: string;
  warningBackground: string;
  error: string;
  errorBackground: string;
  info: string;
  infoBackground: string;

  // Selection & States
  selected: string;
  selectedBorder: string;
  disabledText: string;
  disabledBackground: string;
  overlay: string;
  badgeBackground: string;
  badgeText: string;

  // Navigation & System Bars
  statusBar: 'light' | 'dark';
  navBar: string;
  tabBar: string;
  tabBarActive: string;
  tabBarInactive: string;
  tabBarBorder: string;
}

export const lightColors: AppThemeColors = {
  background: '#F6F8FC',
  surface: '#FFFFFF',
  surfaceSecondary: '#EDF2F8',
  surfaceRaised: '#FFFFFF',
  card: '#FFFFFF',
  cardSecondary: '#EDF2F8',

  textPrimary: '#061A38',
  textSecondary: '#627086',
  textMuted: '#8E9CAE',
  textInverse: '#FFFFFF',

  brandAccent: '#F7B503',
  brandAccentPressed: '#D99D00',
  brandNavy: '#061A38',

  border: '#E2E7F0',
  borderStrong: '#CBD5E1',
  divider: '#E2E7F0',

  inputBackground: '#FFFFFF',
  inputBorder: '#CBD5E1',
  inputBorderFocused: '#061A38',
  inputPlaceholder: '#8E9CAE',

  buttonPrimary: '#F7B503',
  buttonPrimaryText: '#061A38',
  buttonSecondary: '#FFFFFF',
  buttonSecondaryText: '#061A38',
  buttonSecondaryBorder: '#CBD5E1',

  success: '#16A34A',
  successBackground: 'rgba(22, 163, 74, 0.1)',
  warning: '#D97706',
  warningBackground: 'rgba(217, 119, 6, 0.1)',
  error: '#DC2626',
  errorBackground: 'rgba(220, 38, 38, 0.1)',
  info: '#2563EB',
  infoBackground: 'rgba(37, 99, 235, 0.1)',

  selected: '#FFF5D6',
  selectedBorder: '#F7B503',
  disabledText: '#94A3B8',
  disabledBackground: '#E2E8F0',
  overlay: 'rgba(6, 26, 56, 0.45)',
  badgeBackground: '#EDF2F8',
  badgeText: '#061A38',

  statusBar: 'dark',
  navBar: '#F6F8FC',
  tabBar: '#FFFFFF',
  tabBarActive: '#061A38',
  tabBarInactive: '#627086',
  tabBarBorder: '#E2E7F0',
};

export const darkColors: AppThemeColors = {
  background: '#071426',
  surface: '#112744',
  surfaceSecondary: '#182F4D',
  surfaceRaised: '#1E3557',
  card: '#112744',
  cardSecondary: '#182F4D',

  textPrimary: '#FFFFFF',
  textSecondary: '#BAC7D9',
  textMuted: '#6B7F99',
  textInverse: '#061A38',

  brandAccent: '#F7B503',
  brandAccentPressed: '#D99D00',
  brandNavy: '#061A38',

  border: '#29405F',
  borderStrong: '#375378',
  divider: '#1E3557',

  inputBackground: '#152D4A',
  inputBorder: '#29405F',
  inputBorderFocused: '#F7B503',
  inputPlaceholder: '#6B7F99',

  buttonPrimary: '#F7B503',
  buttonPrimaryText: '#061A38',
  buttonSecondary: '#112744',
  buttonSecondaryText: '#FFFFFF',
  buttonSecondaryBorder: '#29405F',

  success: '#34D399',
  successBackground: 'rgba(52, 211, 153, 0.14)',
  warning: '#FBBF24',
  warningBackground: 'rgba(251, 191, 36, 0.14)',
  error: '#F87171',
  errorBackground: 'rgba(248, 113, 113, 0.14)',
  info: '#60A5FA',
  infoBackground: 'rgba(96, 165, 250, 0.14)',

  selected: 'rgba(247, 181, 3, 0.16)',
  selectedBorder: '#F7B503',
  disabledText: '#64748B',
  disabledBackground: '#1E293B',
  overlay: 'rgba(2, 11, 24, 0.86)',
  badgeBackground: '#182F4D',
  badgeText: '#BAC7D9',

  statusBar: 'light',
  navBar: '#071426',
  tabBar: '#0A1C33',
  tabBarActive: '#F7B503',
  tabBarInactive: '#6B7F99',
  tabBarBorder: '#1A3557',
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  card: 20,
  pill: 999,
} as const;

export interface AppTheme {
  mode: ThemeMode;
  isDark: boolean;
  colors: AppThemeColors;
  space: typeof space;
  radius: typeof radius;
}

export type ThemeColors = AppThemeColors;

interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  theme: AppTheme;
  colors: AppThemeColors;
  setMode: (mode: ThemeMode) => Promise<void>;
}

const defaultTheme: AppTheme = {
  mode: 'system',
  isDark: true,
  colors: darkColors,
  space,
  radius,
};

const ThemeContext = createContext<ThemeContextType>({
  mode: 'system',
  isDark: true,
  theme: defaultTheme,
  colors: darkColors,
  setMode: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setModeState(stored);
        }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  const isDark = useMemo(() => {
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    return systemScheme === 'light' ? false : true;
  }, [mode, systemScheme]);

  const colors = isDark ? darkColors : lightColors;

  const theme = useMemo<AppTheme>(
    () => ({
      mode,
      isDark,
      colors,
      space,
      radius,
    }),
    [mode, isDark, colors]
  );

  const setMode = async (newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
    } catch {}
  };

  const contextValue = useMemo(
    () => ({
      mode,
      isDark,
      theme,
      colors,
      setMode,
    }),
    [mode, isDark, theme, colors]
  );

  return React.createElement(ThemeContext.Provider, { value: contextValue }, children);
}

export function useAppTheme() {
  return useContext(ThemeContext);
}

// Backward-compatible static/legacy color export matching existing components
export const color = {
  canvas: '#071426',
  navy: '#061A38',
  surface: '#112744',
  card: '#112744',
  raised: '#1E3557',
  border: '#29405F',
  input: '#152D4A',
  yellow: '#F7B503',
  yellowPressed: '#D99D00',
  white: '#FFFFFF',
  text: '#FFFFFF',
  textSecondary: '#BAC7D9',
  muted: '#6B7F99',
  success: '#34D399',
  danger: '#F87171',
  overlay: 'rgba(2, 11, 24, 0.86)',
} as const;
