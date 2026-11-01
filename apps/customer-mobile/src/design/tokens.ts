// ============================================================================
// apps/customer-mobile/src/design/tokens.ts
// V MOTIV V2 — Adaptive Liquid Glass Design System Tokens
// ============================================================================

import { Platform } from 'react-native';

export const brandTokens = {
  navy: '#061A38',
  navyDark: '#041024',
  navyLight: '#0E2850',
  yellow: '#F7B503',
  yellowPressed: '#D99D00',
  yellowGlow: 'rgba(247, 181, 3, 0.35)',
  white: '#FFFFFF',
} as const;

export const glassTokens = {
  light: {
    // Translucent glass fill with specular diffusion
    background: 'rgba(255, 255, 255, 0.78)',
    backgroundElevated: 'rgba(255, 255, 255, 0.88)',
    backgroundSubtle: 'rgba(255, 255, 255, 0.60)',
    // Glass rim perimeter and top edge specular reflection
    border: 'rgba(226, 232, 240, 0.85)',
    borderRim: 'rgba(255, 255, 255, 0.95)',
    borderActive: '#F7B503',
    // Solid fallback for Accessibility reduceTransparency
    fallbackSolid: '#FFFFFF',
    fallbackSolidElevated: '#F8FAFC',
    // Blur intensity
    blurIntensity: 45,
    blurIntensityElevated: 65,
    // Tint overlay for native BlurView
    blurTint: 'light' as const,
    // Specular highlight gradient [start, end]
    rimGradient: ['rgba(255, 255, 255, 0.9)', 'rgba(255, 255, 255, 0.2)'] as const,
  },
  dark: {
    // Deep liquid obsidian navy glass fill
    background: 'rgba(14, 35, 67, 0.76)',
    backgroundElevated: 'rgba(20, 46, 84, 0.86)',
    backgroundSubtle: 'rgba(10, 26, 50, 0.62)',
    // Glass rim perimeter with subtle brand yellow specular refraction
    border: 'rgba(255, 255, 255, 0.12)',
    borderRim: 'rgba(247, 181, 3, 0.26)',
    borderActive: '#F7B503',
    // Solid fallback for Accessibility reduceTransparency
    fallbackSolid: '#112744',
    fallbackSolidElevated: '#183359',
    // Blur intensity
    blurIntensity: 55,
    blurIntensityElevated: 75,
    // Tint overlay for native BlurView
    blurTint: 'dark' as const,
    // Specular highlight gradient [start, end]
    rimGradient: ['rgba(247, 181, 3, 0.25)', 'rgba(255, 255, 255, 0.04)'] as const,
  },
} as const;

export const elevationTokens = {
  none: {
    elevation: 0,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  subtle: {
    elevation: 3,
    shadowColor: '#061A38',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  card: {
    elevation: 6,
    shadowColor: '#061A38',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  elevatedGlass: {
    elevation: 12,
    shadowColor: '#061A38',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
  },
  floatingNav: {
    elevation: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
  },
} as const;

export const typographyTokens = {
  display: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800' as const,
    letterSpacing: -0.6,
  },
  title1: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700' as const,
    letterSpacing: -0.4,
  },
  title2: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  title3: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600' as const,
    letterSpacing: -0.1,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
  },
  bodyBold: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700' as const,
  },
  callout: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500' as const,
  },
  caption: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '500' as const,
  },
  micro: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '700' as const,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
  },
} as const;

export const motionTokens = {
  duration: {
    instant: 0,
    fast: 160,
    normal: 260,
    slow: 400,
  },
  // Scale factor on press interactions
  pressScale: 0.97,
  // Minimum accessible touch target in dp
  minTouchTarget: 44,
} as const;
