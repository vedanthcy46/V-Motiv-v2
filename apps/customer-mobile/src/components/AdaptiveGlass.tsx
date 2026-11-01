// ============================================================================
// apps/customer-mobile/src/components/AdaptiveGlass.tsx
// V MOTIV V2 — Cross-Platform Adaptive Liquid Glass Surface
// Pure native-safe implementation with zero unlinked native module dependencies
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
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
 * - Utilizes high-performance translucent fills with specular perimeter borders and hardware elevation.
 * - 100% native safe: requires no uncompiled native view managers, ensuring instant compatibility
 *   across Android development builds, Expo Go, and iOS.
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
  let elevationStyle: ViewStyle = elevationTokens.card;
  let cornerRadius: number = radius.card;

  switch (variant) {
    case 'elevated':
      bg = tokens.backgroundElevated;
      elevationStyle = elevationTokens.elevatedGlass;
      break;
    case 'subtle':
      bg = tokens.backgroundSubtle;
      elevationStyle = elevationTokens.subtle;
      break;
    case 'floatingNav':
      bg = tokens.backgroundElevated;
      elevationStyle = elevationTokens.floatingNav;
      cornerRadius = radius.pill;
      break;
    case 'modal':
      bg = tokens.backgroundElevated;
      elevationStyle = elevationTokens.elevatedGlass;
      cornerRadius = radius.lg;
      break;
    default:
      bg = tokens.background;
      elevationStyle = elevationTokens.card;
      cornerRadius = radius.card;
      break;
  }

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
        <View
          style={[
            styles.rimSpecular,
            {
              backgroundColor: effectiveDark
                ? 'rgba(247, 181, 3, 0.28)'
                : 'rgba(255, 255, 255, 0.90)',
              borderTopLeftRadius: cornerRadius,
              borderTopRightRadius: cornerRadius,
            },
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
