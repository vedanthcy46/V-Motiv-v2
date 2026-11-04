import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { color, space } from '../theme';
import {
  LOGO_VIEWBOX, PATH_YELLOW_ARM, PATH_WHITE_BODY, PATH_CAR_ROOF,
  PATH_HEADLIGHT_LEFT, PATH_HEADLIGHT_RIGHT, WORDMARK_VIEWBOX, PATH_EXACT_WORDMARK,
} from './brand/official-logo-paths';
import { safeBottom } from '../layout/safe-layout';

const DURATION = 7000;

/** Native adaptation of the official V Motiv Brand six-scene reveal. */
export function BrandRevealScreen({ onFinish }: { onFinish: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const completed = useRef(false);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  const finish = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    progress.stopAnimation();
    finishRef.current();
  }, [progress]);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (active) setReducedMotion(value); })
      .catch(() => { if (active) setReducedMotion(false); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (reducedMotion === null) return;
    if (reducedMotion) {
      progress.setValue(DURATION);
      const timer = setTimeout(finish, 500);
      return () => clearTimeout(timer);
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: DURATION, duration: DURATION, easing: Easing.linear, useNativeDriver: true,
    });
    animation.start(({ finished }) => { if (finished) finish(); });
    return () => animation.stop();
  }, [finish, progress, reducedMotion]);

  const stageWidth = Math.max(160, Math.min(width - 48, height * 0.72, 520));
  const emblemWidth = stageWidth * 0.68;
  const emblemHeight = emblemWidth * (667.3 / 1000);
  const wordmarkHeight = stageWidth * (126.4 / 624);
  const interpolate = (inputRange: number[], outputRange: number[]) => progress.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
  const reveal = (start: number, end: number) => interpolate([start, end], [0, 1]);

  // The native presentation owns the complete window. Only Skip uses safe-area
  // padding; the background/artwork has no portrait bitmap or inset frame.
  return <Modal visible presentationStyle="fullScreen" animationType="none" statusBarTranslucent navigationBarTranslucent hardwareAccelerated onRequestClose={finish}>
    <StatusBar hidden />
    <View style={styles.fullScreen} accessibilityLabel="V MOTIV brand introduction">
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} accessible={false}>
        <Defs>
          <RadialGradient id="brand-environment" cx="50%" cy="45%" rx="75%" ry="70%">
            <Stop offset="0" stopColor={color.raised} stopOpacity="0.6" />
            <Stop offset="0.55" stopColor={color.navy} stopOpacity="0.35" />
            <Stop offset="1" stopColor={color.canvas} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#brand-environment)" />
      </Svg>

      <Animated.View pointerEvents="none" accessible={false} style={[styles.streak, {
        width: width * 0.2, top: height * 0.44,
        opacity: interpolate([0, 200, 300, 720, 850, DURATION], [0, 0, 1, 1, 0, 0]),
        transform: [{ translateX: interpolate([200, 850], [-width * 0.25, width * 1.1]) }],
      }]} />

      <View style={[styles.stage, { width: stageWidth }]}>
        <Animated.View accessible={false} style={{ width: emblemWidth, height: emblemHeight, transform: [{ scale: interpolate([0, 2200, 2520, 3000], [1, 1, 1.018, 1]) }] }}>
          <Animated.View style={[StyleSheet.absoluteFill, {
            opacity: reveal(800, 1450),
            transform: [{ translateX: interpolate([800, 1450], [8, 0]) }, { translateY: interpolate([800, 1450], [-6, 0]) }],
          }]}>
            <Svg width="100%" height="100%" viewBox={LOGO_VIEWBOX} style={styles.vector}><Path d={PATH_YELLOW_ARM} fill={color.yellow} /></Svg>
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: reveal(1000, 1750), transform: [{ translateY: interpolate([1000, 1750], [6, 0]) }] }]}>
            <Svg width="100%" height="100%" viewBox={LOGO_VIEWBOX} style={styles.vector}><Path d={`${PATH_WHITE_BODY} ${PATH_HEADLIGHT_LEFT} ${PATH_HEADLIGHT_RIGHT}`} fillRule="evenodd" fill={color.white} /></Svg>
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: reveal(1300, 1900), transform: [{ translateY: interpolate([1300, 1900], [-5, 0]) }] }]}>
            <Svg width="100%" height="100%" viewBox={LOGO_VIEWBOX} style={styles.vector}><Path d={PATH_CAR_ROOF} fill={color.white} /></Svg>
          </Animated.View>
        </Animated.View>

        <View accessible accessibilityRole="image" accessibilityLabel="V MOTIV" style={{ width: stageWidth, height: wordmarkHeight, marginTop: space.xxxl, overflow: 'hidden' }}>
          <Animated.View accessible={false} style={{ width: stageWidth, height: wordmarkHeight, overflow: 'hidden', transform: [{ translateX: interpolate([3000, 3800], [-stageWidth, 0]) }] }}>
            <Animated.View style={{ width: stageWidth, height: wordmarkHeight, transform: [{ translateX: interpolate([3000, 3800], [stageWidth, 0]) }] }}>
              <Svg width="100%" height="100%" viewBox={WORDMARK_VIEWBOX}><Path d={PATH_EXACT_WORDMARK} fillRule="evenodd" fill={color.white} /></Svg>
            </Animated.View>
          </Animated.View>
        </View>
        <Animated.View accessible={false} style={[styles.underline, { width: stageWidth, transform: [
          { translateX: interpolate([3600, 4200], [-stageWidth / 2, 0]) },
          { scaleX: reveal(3600, 4200) },
        ] }]} />
        <Animated.Text style={[styles.tagline, { opacity: reveal(4200, 5000), transform: [{ translateY: interpolate([4200, 5000], [5, 0]) }] }]}>YOUR VEHICLE. OUR ACCOUNTABILITY.</Animated.Text>
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel="Skip V MOTIV introduction" onPress={finish}
        style={({ pressed }) => [styles.skip, { right: Math.max(insets.right, space.xl), bottom: safeBottom(insets.bottom, space.xl), opacity: pressed ? 0.65 : 1 }]}>
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  fullScreen: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', backgroundColor: color.canvas, overflow: 'hidden' },
  stage: { alignItems: 'center', justifyContent: 'center' },
  vector: { overflow: 'visible' },
  streak: { position: 'absolute', left: 0, height: 2, backgroundColor: color.yellow },
  underline: { height: 2, marginTop: 10, backgroundColor: color.yellow },
  tagline: { color: color.textSecondary, fontSize: 11, fontWeight: '600', letterSpacing: 1.8, textAlign: 'center', marginTop: space.lg },
  skip: { position: 'absolute', minHeight: 48, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm, borderWidth: 1, borderColor: color.border, borderRadius: 999 },
  skipText: { color: color.textSecondary, fontSize: 13, fontWeight: '600' },
});
