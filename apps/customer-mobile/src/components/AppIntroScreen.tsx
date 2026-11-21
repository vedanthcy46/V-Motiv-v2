import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, CarFront, KeyRound, Lock, Recycle, Wrench, type LucideIcon } from 'lucide-react-native';
import { color, space } from '../theme';
import { safeBottom } from '../layout/safe-layout';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { INTRO_FEATURES, featureBadge, type FeatureKey } from '../constants/features';

const SCENE_MS = 3400;

const ICONS: Record<Exclude<FeatureKey, 'sell'>, LucideIcon> = {
  service: Wrench,
  buy: CarFront,
  rental: KeyRound,
  scrap: Recycle,
};

/**
 * The opening introduction: four short animated scenes (service first, then buy, rentals and scrap), shown once on first launch.
 * Tap anywhere or press Next to move on, Skip to leave. With "reduce motion" on, nothing moves and nothing advances by itself.
 */
export function AppIntroScreen({ onFinish }: { onFinish: () => void }) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const last = INTRO_FEATURES.length - 1;
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinish();
  }, [onFinish]);

  const next = useCallback(() => {
    setIndex(current => (current >= last ? current : current + 1));
  }, [last]);

  // Move on by itself, except on the last scene (so "coming soon" can be read) and when the person asked for less motion.
  useEffect(() => {
    if (reducedMotion !== false || index >= last) return undefined;
    const timer = setTimeout(next, SCENE_MS);
    return () => clearTimeout(timer);
  }, [index, last, next, reducedMotion]);

  if (reducedMotion === null) return <View style={styles.root} />; // wait for the phone's answer before showing anything

  const feature = INTRO_FEATURES[index]!;
  const isLast = index === last;

  return (
    <View style={styles.root} accessibilityLabel="Introduction to V MOTIV">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next"
        onPress={isLast ? finish : next}
        style={StyleSheet.absoluteFill}
      />

      <View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + space.md }]}>
        <View style={styles.progressRow} accessible accessibilityLabel={`Step ${index + 1} of ${INTRO_FEATURES.length}`}>
          {INTRO_FEATURES.map((item, position) => (
            <ProgressSegment
              key={item.key}
              state={position < index ? 'done' : position === index ? 'active' : 'todo'}
              animate={reducedMotion === false && !isLast}
            />
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip introduction"
          onPress={finish}
          hitSlop={10}
          style={({ pressed }) => [styles.skip, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <IntroScene key={feature.key} featureKey={feature.key} title={feature.title} body={feature.body} reducedMotion={reducedMotion} />

      <View pointerEvents="box-none" style={[styles.bottom, { paddingBottom: safeBottom(insets.bottom, space.xl) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Get started' : 'Next'}
          onPress={isLast ? finish : next}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.buttonText}>{isLast ? 'Get started' : 'Next'}</Text>
          <ArrowRight size={18} color={color.navy} accessibilityElementsHidden />
        </Pressable>
      </View>
    </View>
  );
}

function ProgressSegment({ state, animate }: { state: 'done' | 'active' | 'todo'; animate: boolean }) {
  const fill = useRef(new Animated.Value(state === 'done' ? 1 : 0)).current;
  useEffect(() => {
    if (state === 'done') { fill.setValue(1); return undefined; }
    if (state === 'todo') { fill.setValue(0); return undefined; }
    if (!animate) { fill.setValue(1); return undefined; }
    fill.setValue(0);
    const animation = Animated.timing(fill, { toValue: 1, duration: SCENE_MS, easing: Easing.linear, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [animate, fill, state]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.segment}>
      <Animated.View style={[styles.segmentFill, { width }]} />
    </View>
  );
}

/** One scene. It is remounted for each feature, so its entrance plays every time. */
function IntroScene({ featureKey, title, body, reducedMotion }: { featureKey: Exclude<FeatureKey, 'sell'>; title: string; body: string; reducedMotion: boolean }) {
  const Icon = ICONS[featureKey];
  const blocked = featureKey === 'rental';
  const main = featureKey === 'service';

  const enter = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current; // the icon pops in
  const special = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current; // what makes this scene's icon move in its own way
  const text = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const badge = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) return undefined;
    const entrance = Animated.parallel([
      Animated.spring(enter, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }),
      Animated.timing(special, {
        toValue: 1,
        duration: featureKey === 'scrap' ? 1100 : featureKey === 'buy' ? 750 : 900,
        easing: featureKey === 'buy' ? Easing.out(Easing.back(1.2)) : Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(280),
        Animated.timing(text, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(750),
        Animated.spring(badge, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      ]),
    ]);
    entrance.start();
    const pulse = Animated.loop(Animated.timing(ring, { toValue: 1, duration: 2000, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    pulse.start();
    return () => { entrance.stop(); pulse.stop(); };
  }, [badge, enter, featureKey, reducedMotion, ring, special, text]);

  const iconTransform = useMemo(() => {
    const base = [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }];
    switch (featureKey) {
      case 'service': // the wrench swings into place
        return [...base, { rotate: special.interpolate({ inputRange: [0, 1], outputRange: ['-50deg', '0deg'] }) }];
      case 'buy': // the car drives in
        return [...base, { translateX: special.interpolate({ inputRange: [0, 1], outputRange: [170, 0] }) }];
      case 'rental': // the key rattles, then rests: it is locked for now
        return [...base, { rotate: special.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: ['0deg', '-12deg', '12deg', '-6deg', '0deg'] }) }];
      default: // scrap: the recycle mark makes one full turn
        return [...base, { rotate: special.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }];
    }
  }, [enter, featureKey, special]);

  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.4, 0] });
  const label = featureBadge(featureKey);

  return (
    <View pointerEvents="none" style={styles.scene}>
      <View style={styles.stage}>
        {!reducedMotion ? (
          <Animated.View style={[styles.ring, { borderColor: blocked ? color.muted : color.yellow, opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
        ) : null}
        <Animated.View
          accessible={false}
          style={[styles.iconCircle, blocked ? styles.iconCircleBlocked : styles.iconCircleOpen, { opacity: enter, transform: iconTransform }]}
        >
          <Icon size={72} color={blocked ? color.muted : color.navy} />
        </Animated.View>
        {blocked ? (
          <Animated.View style={[styles.lock, { opacity: badge, transform: [{ scale: badge }] }]}>
            <Lock size={20} color={color.white} />
          </Animated.View>
        ) : null}
      </View>

      <Animated.View style={{ opacity: badge, transform: [{ scale: badge.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
        <View style={[styles.badge, blocked ? styles.badgeBlocked : styles.badgeOpen]}>
          <Text style={[styles.badgeText, { color: blocked ? color.textSecondary : color.navy }]}>{main ? 'MAIN SERVICE' : label}</Text>
        </View>
      </Animated.View>

      <Animated.View style={[styles.copy, { opacity: text, transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.xl, gap: space.md },
  progressRow: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  segmentFill: { height: 3, backgroundColor: color.yellow },
  skip: { alignSelf: 'flex-end', minHeight: 40, justifyContent: 'center', paddingHorizontal: space.md },
  skipText: { color: color.textSecondary, fontSize: 14, fontWeight: '700' },
  scene: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxxl, gap: space.xl },
  stage: { width: 190, height: 190, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 2 },
  iconCircle: { width: 150, height: 150, borderRadius: 75, alignItems: 'center', justifyContent: 'center' },
  iconCircleOpen: { backgroundColor: color.yellow },
  iconCircleBlocked: { backgroundColor: color.raised, borderWidth: 2, borderColor: color.border },
  lock: { position: 'absolute', right: 14, bottom: 14, width: 44, height: 44, borderRadius: 22, backgroundColor: color.navy, borderWidth: 2, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  badgeOpen: { backgroundColor: color.yellow },
  badgeBlocked: { backgroundColor: color.raised, borderWidth: 1, borderColor: color.border },
  badgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  copy: { alignItems: 'center', gap: space.md },
  title: { color: color.white, fontSize: 28, fontWeight: '800', textAlign: 'center', lineHeight: 34 },
  body: { color: color.textSecondary, fontSize: 16, lineHeight: 23, textAlign: 'center', maxWidth: 340 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: space.xl },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 54, borderRadius: 16, backgroundColor: color.yellow },
  buttonText: { color: color.navy, fontSize: 16, fontWeight: '800' },
});
