// ============================================================
// components/BrandLogo.tsx
// Pixel-accurate official V MOTIV vector brand logo components.
// Uses official vector paths from V Motiv Brand design system.
// ============================================================

import React from 'react';
import { View, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import {
  LOGO_VIEWBOX,
  PATH_YELLOW_ARM,
  PATH_WHITE_BODY,
  PATH_CAR_ROOF,
  PATH_HEADLIGHT_LEFT,
  PATH_HEADLIGHT_RIGHT,
  WORDMARK_VIEWBOX,
  PATH_EXACT_WORDMARK,
} from './brand/official-logo-paths';
import { useAppTheme } from '../theme';

export interface BrandLogoProps {
  variant?: 'emblem' | 'wordmark' | 'fullLockup' | 'horizontal';
  size?: number; // base height in dp
  showTagline?: boolean;
  taglineText?: string;
  accentColor?: string;
  bodyColor?: string;
  style?: StyleProp<ViewStyle>;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'horizontal',
  size = 32,
  showTagline = false,
  taglineText = 'YOUR NEXT CHAPTER',
  accentColor,
  bodyColor: explicitBodyColor,
  style,
}) => {
  const { theme, isDark } = useAppTheme();
  const effectiveAccent = accentColor ?? theme.colors.brandAccent;
  const effectiveBody = explicitBodyColor ?? (isDark ? '#FFFFFF' : theme.colors.brandNavy);
  const emblemHeight = size;
  const emblemWidth = emblemHeight * (1000 / 667.3);

  const emblemSvg = (
    <Svg width={emblemWidth} height={emblemHeight} viewBox={LOGO_VIEWBOX}>
      <G>
        {/* Car body with integrated dual headlight cutouts */}
        <Path
          d={`${PATH_WHITE_BODY} ${PATH_HEADLIGHT_LEFT} ${PATH_HEADLIGHT_RIGHT}`}
          fill={effectiveBody}
          fillRule="evenodd"
        />
        {/* Yellow power slash arm */}
        <Path d={PATH_YELLOW_ARM} fill={effectiveAccent} />
        {/* Aerodynamic visor/roof */}
        <Path d={PATH_CAR_ROOF} fill={effectiveBody} />
      </G>
    </Svg>
  );

  if (variant === 'emblem') {
    return <View style={[styles.inline, style]}>{emblemSvg}</View>;
  }

  const wordmarkHeight = size * 0.46;
  const wordmarkWidth = wordmarkHeight * (624 / 126.4);

  const wordmarkSvg = (
    <Svg width={wordmarkWidth} height={wordmarkHeight} viewBox={WORDMARK_VIEWBOX}>
      <Path d={PATH_EXACT_WORDMARK} fill={effectiveBody} fillRule="evenodd" />
    </Svg>
  );

  if (variant === 'wordmark') {
    return <View style={[styles.inline, style]}>{wordmarkSvg}</View>;
  }

  if (variant === 'horizontal') {
    return (
      <View style={[styles.horizontalRow, style]}>
        {emblemSvg}
        <View style={styles.horizontalTextWrap}>
          {wordmarkSvg}
          {showTagline && <Text style={[styles.taglineSmall, { color: isDark ? '#8A9EB8' : '#627086' }]}>{taglineText}</Text>}
        </View>
      </View>
    );
  }

  // Full vertical lockup (for Welcome/Splash/Auth Hero)
  const lockupEmblemHeight = size * 1.25;
  const lockupEmblemWidth = lockupEmblemHeight * (1000 / 667.3);
  const lockupWordmarkHeight = size * 0.52;
  const lockupWordmarkWidth = lockupWordmarkHeight * (624 / 126.4);

  return (
    <View style={[styles.lockupContainer, style]}>
      <Svg width={lockupEmblemWidth} height={lockupEmblemHeight} viewBox={LOGO_VIEWBOX}>
        <G>
          <Path
            d={`${PATH_WHITE_BODY} ${PATH_HEADLIGHT_LEFT} ${PATH_HEADLIGHT_RIGHT}`}
            fill={effectiveBody}
            fillRule="evenodd"
          />
          <Path d={PATH_YELLOW_ARM} fill={effectiveAccent} />
          <Path d={PATH_CAR_ROOF} fill={effectiveBody} />
        </G>
      </Svg>

      <View style={[styles.wordmarkWrap, { width: lockupWordmarkWidth }]}>
        <Svg width={lockupWordmarkWidth} height={lockupWordmarkHeight} viewBox={WORDMARK_VIEWBOX}>
          <Path d={PATH_EXACT_WORDMARK} fill={effectiveBody} fillRule="evenodd" />
        </Svg>
        <View style={[styles.accentLine, { backgroundColor: effectiveAccent, width: lockupWordmarkWidth * 0.7 }]} />
      </View>

      {showTagline && <Text style={[styles.tagline, { color: isDark ? '#8A9EB8' : '#627086' }]}>{taglineText}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  inline: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  horizontalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  horizontalTextWrap: {
    justifyContent: 'center',
    gap: 3,
  },
  lockupContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  wordmarkWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  accentLine: {
    height: 2.5,
    borderRadius: 2,
  },
  tagline: {
    color: '#8A9EB8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  taglineSmall: {
    color: '#8A9EB8',
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
