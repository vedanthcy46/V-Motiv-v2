// ============================================================================
// apps/customer-mobile/src/components/AdaptiveGlass.tsx
// V MOTIV V2 — Cross-Platform Adaptive Liquid Glass Surface
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme, radius } from '../theme';
import { glassTokens, elevationTokens } from '../design/tokens';

export type GlassVariant = 'surface' | 'elevated' | 'subtle' | 'floatingNav' | 'modal';

export interface AdaptiveGlassProps {
  children?: React.ReactNode;
  variant?: GlassVariant;
  intensity?: number;
  tint?: 'light' | 'dark' | 'auto';
  rim?: boolean;
  rimBorderColor?: string;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * AdaptiveGlass provides a native-feeling Liquid Glass surface.
 * - On iOS: uses BlurView with an inner specular gradient rim for authentic refraction.
 * - On Android: renders a tinted translucent surface with subtle specular border and native elevation.
 * - Accessibility: respects isReduceTransparencyEnabled by falling back to solid opaque backgrounds.
 */
export const AdaptiveGlass: React.FC<AdaptiveGlassProps> = ({
  children,
  variant = 'surface',
  intensity,
  tint = 'auto',
  rim = true,
  rimBorderColor,
  style,
  containerStyle,
  testID,
}) => {
  const { isDark } = useAppTheme();
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => {
        if (mounted) setReduceTransparency(enabled);
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (enabled) => setReduceTransparency(enabled)
    );

    return () => {
      mounted = false;
      sub?.remove();
    };
  }, []);

  const effectiveDark = tint === 'auto' ? isDark : tint === 'dark';
  const tokens = effectiveDark ? glassTokens.dark : glassTokens.light;

  // Determine base tokens based on variant
  let bg: string = tokens.background;
  let defaultIntensity: number = tokens.blurIntensity;
  let elevationStyle: ViewStyle = elevationTokens.card;
  let cornerRadius: number = radius.card;

  switch (variant) {
    case 'elevated':
      bg = tokens.backgroundElevated;
      defaultIntensity = tokens.blurIntensityElevated;
      elevationStyle = elevationTokens.elevatedGlass;
      break;
    case 'subtle':
      bg = tokens.backgroundSubtle;
      defaultIntensity = 28;
      elevationStyle = elevationTokens.subtle;
      break;
    case 'floatingNav':
      bg = tokens.backgroundElevated;
      defaultIntensity = tokens.blurIntensityElevated;
      elevationStyle = elevationTokens.floatingNav;
      cornerRadius = radius.pill;
      break;
    case 'modal':
      bg = tokens.backgroundElevated;
      defaultIntensity = 80;
      elevationStyle = elevationTokens.elevatedGlass;
      cornerRadius = radius.lg;
      break;
    default:
      bg = tokens.background;
      defaultIntensity = tokens.blurIntensity;
      elevationStyle = elevationTokens.card;
      cornerRadius = radius.card;
      break;
  }

  const effectiveIntensity = intensity ?? defaultIntensity;
  const borderColor = rimBorderColor ?? tokens.border;

  // If user requested reduced transparency, fall back to solid opaque view
  if (reduceTransparency) {
    return (
      <View
        testID={testID}
        style={[
          styles.container,
          elevationStyle,
          {
            backgroundColor: variant === 'elevated' ? tokens.fallbackSolidElevated : tokens.fallbackSolid,
            borderRadius: cornerRadius,
            borderColor: effectiveDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
            borderWidth: 1,
          },
          containerStyle,
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  // iOS: True Native BlurView with layered specular highlight
  if (Platform.OS === 'ios') {
    return (
      <View
        testID={testID}
        style={[
          styles.container,
          elevationStyle,
          { borderRadius: cornerRadius },
          containerStyle,
        ]}
      >
        <BlurView
          intensity={effectiveIntensity}
          tint={tokens.blurTint}
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: cornerRadius,
              backgroundColor: bg,
              borderColor,
              borderWidth: 1,
              overflow: 'hidden',
            },
          ]}
        >
          {rim && (
            <LinearGradient
              colors={tokens.rimGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[
                styles.rimSpecular,
                { borderTopLeftRadius: cornerRadius, borderTopRightRadius: cornerRadius },
              ]}
              pointerEvents="none"
            />
          )}
        </BlurView>
        <View style={[styles.innerContent, style]}>{children}</View>
      </View>
    );
  }

  // Android & Web: Performant tinted translucent glass with specular border + elevation
  return (
    <View
      testID={testID}
      style={[
        styles.container,
        elevationStyle,
        {
          borderRadius: cornerRadius,
          backgroundColor: bg,
          borderColor,
          borderWidth: 1.2,
          overflow: 'hidden',
        },
        containerStyle,
      ]}
    >
      {rim && (
        <LinearGradient
          colors={tokens.rimGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[
            styles.rimSpecular,
            { borderTopLeftRadius: cornerRadius, borderTopRightRadius: cornerRadius },
          ]}
          pointerEvents="none"
        />
      )}
      <View style={[styles.innerContent, style]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  innerContent: {
    zIndex: 1,
  },
  rimSpecular: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    zIndex: 2,
  },
});
