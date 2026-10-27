// ============================================================
// components/CarBrandLogo.tsx
// Pixel-accurate automotive brand logos using authentic brand assets
// from car-brand-logos with vector SVG fallback for missing makes.
// Fully compatible with Light Mode and Dark Mode.
// ============================================================

import React from 'react';
import {
  Image,
  View,
  StyleSheet,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Path,
  G,
  Circle,
  Rect,
  Polygon,
  Text as SvgText,
} from 'react-native-svg';
import { useAppTheme } from '../theme';

// Authentic car brand logos provided in car-brand-logos / assets/car-brand-logos
const BRAND_IMAGES: Record<string, ImageSourcePropType> = {
  audi: require('../../assets/car-brand-logos/audi-logo.png'),
  bmw: require('../../assets/car-brand-logos/bmw-logo.png'),
  bugatti: require('../../assets/car-brand-logos/bugatti-logo.png'),
  byd: require('../../assets/car-brand-logos/byd-logo.png'),
  citroen: require('../../assets/car-brand-logos/citroen-logo-2022.png'),
  datsun: require('../../assets/car-brand-logos/datsun-logo.png'),
  ferrari: require('../../assets/car-brand-logos/ferrari-logo.png'),
  ford: require('../../assets/car-brand-logos/ford-logo.png'),
  honda: require('../../assets/car-brand-logos/honda.png'),
  hyundai: require('../../assets/car-brand-logos/hyundai-logo.png'),
  jaguar: require('../../assets/car-brand-logos/jaguar-logo.png'),
  jeep: require('../../assets/car-brand-logos/jeep-logo.png'),
  kia: require('../../assets/car-brand-logos/kia-logo.png'),
  lamborghini: require('../../assets/car-brand-logos/lamborghini-logo.png'),
  landrover: require('../../assets/car-brand-logos/land-rover-logo.png'),
  mahindra: require('../../assets/car-brand-logos/mahindra-logo.png'),
  mercedes: require('../../assets/car-brand-logos/mercedes-benz-logo.png'),
  mercedesbenz: require('../../assets/car-brand-logos/mercedes-benz-logo.png'),
  benz: require('../../assets/car-brand-logos/mercedes-benz-logo.png'),
  mg: require('../../assets/car-brand-logos/mg-logo-2021.png'),
  morris: require('../../assets/car-brand-logos/mg-logo-2021.png'),
  morrisgarages: require('../../assets/car-brand-logos/mg-logo-2021.png'),
  nissan: require('../../assets/car-brand-logos/nissan.png'),
  porsche: require('../../assets/car-brand-logos/porsche-logo.png'),
  renault: require('../../assets/car-brand-logos/renault-logo.png'),
  rollsroyce: require('../../assets/car-brand-logos/rolls-royce-logo.png'),
  skoda: require('../../assets/car-brand-logos/skoda-logo.png'),
  suzuki: require('../../assets/car-brand-logos/suzuki.png'),
  marutisuzuki: require('../../assets/car-brand-logos/suzuki.png'),
  maruti: require('../../assets/car-brand-logos/suzuki.png'),
  tata: require('../../assets/car-brand-logos/tata-logo.png'),
  tatamotors: require('../../assets/car-brand-logos/tata-logo.png'),
  toyota: require('../../assets/car-brand-logos/toyota-logo-2005.png'),
  volkswagen: require('../../assets/car-brand-logos/volkswagen-logo-2012.png'),
  vw: require('../../assets/car-brand-logos/volkswagen-logo-2012.png'),
  volvo: require('../../assets/car-brand-logos/volvo-logo-2021.png'),
};

function resolveBrandImage(brandName: string): ImageSourcePropType | null {
  const norm = (brandName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!norm) return null;

  if (BRAND_IMAGES[norm]) return BRAND_IMAGES[norm] ?? null;

  if (norm.includes('suzuki') || norm.includes('maruti')) return BRAND_IMAGES.suzuki ?? null;
  if (norm.includes('tata')) return BRAND_IMAGES.tata ?? null;
  if (norm.includes('mahindra')) return BRAND_IMAGES.mahindra ?? null;
  if (norm.includes('hyundai')) return BRAND_IMAGES.hyundai ?? null;
  if (norm.includes('toyota')) return BRAND_IMAGES.toyota ?? null;
  if (norm.includes('honda')) return BRAND_IMAGES.honda ?? null;
  if (norm.includes('kia')) return BRAND_IMAGES.kia ?? null;
  if (norm.includes('volkswagen') || norm === 'vw') return BRAND_IMAGES.volkswagen ?? null;
  if (norm.includes('skoda')) return BRAND_IMAGES.skoda ?? null;
  if (norm.includes('renault')) return BRAND_IMAGES.renault ?? null;
  if (norm.includes('ford')) return BRAND_IMAGES.ford ?? null;
  if (norm.includes('nissan')) return BRAND_IMAGES.nissan ?? null;
  if (norm.includes('jeep')) return BRAND_IMAGES.jeep ?? null;
  if (norm.includes('citroen')) return BRAND_IMAGES.citroen ?? null;
  if (norm.includes('datsun')) return BRAND_IMAGES.datsun ?? null;
  if (norm.includes('audi')) return BRAND_IMAGES.audi ?? null;
  if (norm.includes('bmw')) return BRAND_IMAGES.bmw ?? null;
  if (norm === 'mg' || norm.includes('morris')) return BRAND_IMAGES.mg ?? null;
  if (norm.includes('volvo')) return BRAND_IMAGES.volvo ?? null;
  if (norm.includes('mercedes') || norm.includes('benz')) return BRAND_IMAGES.mercedesbenz ?? null;
  if (norm.includes('land') && norm.includes('rover')) return BRAND_IMAGES.landrover ?? null;
  if (norm.includes('jaguar')) return BRAND_IMAGES.jaguar ?? null;
  if (norm.includes('porsche')) return BRAND_IMAGES.porsche ?? null;
  if (norm.includes('rolls')) return BRAND_IMAGES.rollsroyce ?? null;
  if (norm.includes('ferrari')) return BRAND_IMAGES.ferrari ?? null;
  if (norm.includes('lamborghini') || norm.includes('lambo')) return BRAND_IMAGES.lamborghini ?? null;
  if (norm.includes('bugatti')) return BRAND_IMAGES.bugatti ?? null;
  if (norm.includes('byd')) return BRAND_IMAGES.byd ?? null;

  return null;
}

export interface CarBrandLogoProps {
  brand: string;
  size?: number;
  width?: number;
  height?: number;
  isSelected?: boolean;
  colorOverride?: string;
  style?: StyleProp<ViewStyle>;
  disableBadgeBg?: boolean;
}

export const CarBrandLogo: React.FC<CarBrandLogoProps> = ({
  brand,
  size = 38,
  width,
  height,
  isSelected = false,
  colorOverride,
  style,
  disableBadgeBg = false,
}) => {
  const { isDark, theme } = useAppTheme();
  const c = theme.colors;

  const brandImage = resolveBrandImage(brand);
  const key = (brand || '').trim().toLowerCase().replace(/[-_\s]+/g, '');

  // If we have an authentic real PNG logo from car-brand-logos:
  if (brandImage) {
    const imgWidth = width ?? (disableBadgeBg ? Math.round(size * 1.15) : Math.round(size * 0.95));
    const imgHeight = height ?? (disableBadgeBg ? Math.round(size * 0.72) : Math.round(size * 0.72));
    const badgeSize = Math.max(size + 6, 36);

    // Monochrome dark logos (Audi black rings, Nissan black text, Citroen black, Volvo, Jaguar, Jeep, Kia)
    // require white tint in dark mode when rendered directly on dark theme cards without white badge backing.
    const isMonochromeDark = ['audi', 'citroen', 'nissan', 'kia', 'volvo', 'jaguar', 'jeep'].some(
      (k) => key.includes(k)
    );
    const activeTintColor = colorOverride ?? (
      disableBadgeBg && isDark && isMonochromeDark
        ? (isSelected ? c.brandAccent : '#FFFFFF')
        : undefined
    );

    return (
      <View
        style={[
          styles.badgeFrame,
          {
            width: disableBadgeBg ? undefined : badgeSize,
            height: disableBadgeBg ? undefined : Math.round(badgeSize * 0.78),
            backgroundColor: disableBadgeBg ? 'transparent' : '#FFFFFF',
            borderWidth: disableBadgeBg ? 0 : 1,
            borderColor: disableBadgeBg
              ? 'transparent'
              : isSelected
              ? 'rgba(6, 26, 56, 0.12)'
              : 'rgba(0, 0, 0, 0.08)',
          },
          style,
        ]}
      >
        <Image
          source={brandImage}
          style={{
            width: imgWidth,
            height: imgHeight,
            tintColor: activeTintColor,
          }}
          resizeMode="contain"
          accessibilityLabel={`${brand} logo`}
        />
      </View>
    );
  }

  // Fallback: Vector SVG for brands like MG, Volvo or custom makes
  const renderVectorFallback = () => {
    // MG (Morris Garages)
    if (key.includes('mg') || key.includes('morris')) {
      const mgColor = isSelected ? '#061A38' : (isDark ? '#F87171' : '#B91C1C');
      return (
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <G>
            <Polygon
              points="30,8 70,8 92,30 92,70 70,92 30,92 8,70 8,30"
              fill="none"
              stroke={mgColor}
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <Polygon
              points="32,14 68,14 86,32 86,68 68,86 32,86 14,68 14,32"
              fill="none"
              stroke={mgColor}
              strokeWidth="1.5"
            />
            <SvgText
              x="50"
              y="60"
              fontSize="34"
              fontWeight="900"
              fontFamily="serif"
              fill={mgColor}
              textAnchor="middle"
              letterSpacing="1"
            >
              MG
            </SvgText>
          </G>
        </Svg>
      );
    }

    // VOLVO
    if (key.includes('volvo')) {
      const volvoBlue = isSelected ? '#061A38' : '#003057';
      const volvoStroke = isSelected ? '#061A38' : (isDark ? '#E2E8F0' : '#475569');
      return (
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <G>
            <Circle cx="46" cy="54" r="34" fill="none" stroke={volvoStroke} strokeWidth="5" />
            <Path
              d="M68 32 L86 14 M74 14 H86 V26"
              fill="none"
              stroke={volvoStroke}
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Rect x="14" y="46" width="64" height="16" rx="2" fill={volvoBlue} />
            <SvgText
              x="46"
              y="58"
              fontSize="11"
              fontWeight="900"
              fontFamily="sans-serif"
              fill="#FFFFFF"
              textAnchor="middle"
              letterSpacing="1"
            >
              VOLVO
            </SvgText>
          </G>
        </Svg>
      );
    }

    // Generic automotive crest fallback for user-typed makes
    const initial = (brand || 'V').trim().charAt(0).toUpperCase();
    const fallbackColor = isSelected ? '#061A38' : (isDark ? '#F7B503' : c.brandNavy);
    return (
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <G>
          <Circle cx="50" cy="50" r="42" fill="none" stroke={fallbackColor} strokeWidth="4" />
          <Polygon
            points="50,14 82,34 82,66 50,86 18,66 18,34"
            fill="none"
            stroke={fallbackColor}
            strokeWidth="2"
            opacity={0.6}
          />
          <SvgText
            x="50"
            y="60"
            fontSize="32"
            fontWeight="900"
            fontFamily="sans-serif"
            fill={fallbackColor}
            textAnchor="middle"
          >
            {initial}
          </SvgText>
        </G>
      </Svg>
    );
  };

  return (
    <View style={[styles.container, style]}>
      {renderVectorFallback()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
});

export default CarBrandLogo;
