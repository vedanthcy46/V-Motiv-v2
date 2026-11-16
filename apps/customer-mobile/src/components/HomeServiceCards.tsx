import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRight, CheckCircle2, Clock, Lock, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react-native';
import { useAppTheme } from '../theme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { featureBadge, type FeatureKey } from '../constants/features';

/**
 * The main card of the home screen: car service, shown first and largest. A soft ring pulses behind its icon (not when the phone is
 * set to reduce motion).
 */
export function ServiceHeroCard({ onPress }: { onPress: () => void }) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion !== false) return undefined;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.45, 0] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Car Service and Repairs, our main service. Scheduled maintenance, diagnosis, doorstep pickup and live tracking. Book a service."
      onPress={onPress}
      style={({ pressed }) => [styles.hero, { backgroundColor: c.brandNavy, borderColor: c.brandAccent }, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
    >
      <View style={[styles.ribbon, { backgroundColor: c.brandAccent }]}>
        <Text style={[styles.ribbonText, { color: c.brandNavy }]}>{featureBadge('service')}</Text>
      </View>

      <View style={styles.heroTop}>
        <View style={styles.iconWrap}>
          <Animated.View
            pointerEvents="none"
            style={[styles.pulseRing, { borderColor: c.brandAccent, opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
          />
          <View style={[styles.iconBox, { backgroundColor: c.brandAccent }]}>
            <Wrench size={30} color={c.brandNavy} accessibilityElementsHidden />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Car Service & Repairs</Text>
          <Text style={styles.heroBody}>Maintenance, AC, battery and diagnostics, with transparent estimates.</Text>
        </View>
      </View>

      <View style={styles.pillRow}>
        {[
          { Icon: CheckCircle2, label: 'Free pickup & drop', tint: '#10B981' },
          { Icon: ShieldCheck, label: 'Multi-point QC', tint: c.brandAccent },
          { Icon: Clock, label: 'Live tracking', tint: '#BAC7D9' },
        ].map(({ Icon, label, tint }) => (
          <View key={label} style={styles.pill}>
            <Icon size={12} color={tint} accessibilityElementsHidden />
            <Text style={styles.pillText}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.cta, { backgroundColor: c.brandAccent }]}>
        <Text style={[styles.ctaText, { color: c.brandNavy }]}>Book a service</Text>
        <ArrowRight size={18} color={c.brandNavy} accessibilityElementsHidden />
      </View>
    </Pressable>
  );
}

/**
 * A smaller tile for the other services. `coming-soon` tiles are dimmed, carry a lock and cannot be opened: pressing one only explains
 * that it is coming. `open` tiles go to their screen.
 */
export function MoreServiceTile({ featureKey, status, title, body, Icon, onPress }: {
  featureKey: FeatureKey;
  status: 'open' | 'coming-soon';
  title: string;
  body: string;
  Icon: LucideIcon;
  onPress: () => void;
}) {
  const { theme, isDark } = useAppTheme();
  const c = theme.colors;
  const blocked = status === 'coming-soon';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={blocked ? `${title}. Coming soon, not available yet.` : `${title}. ${body}`}
      accessibilityState={{ disabled: blocked }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: blocked ? c.surface : isDark ? '#142742' : '#FFFDF5',
          borderColor: blocked ? c.border : c.brandAccent,
          opacity: blocked ? 0.62 : 1,
        },
        pressed && { opacity: blocked ? 0.5 : 0.78 },
      ]}
    >
      <View style={styles.tileTop}>
        <Icon size={26} color={blocked ? c.textMuted : c.brandAccent} accessibilityElementsHidden />
        {blocked ? <Lock size={15} color={c.textMuted} accessibilityElementsHidden /> : null}
      </View>
      <Text style={[styles.tileTitle, { color: c.textPrimary }]}>{title}</Text>
      <Text style={[styles.tileBody, { color: c.textSecondary }]}>{body}</Text>
      <View style={[styles.badge, { backgroundColor: blocked ? c.surfaceSecondary : c.brandAccent }]}>
        <Text style={[styles.badgeText, { color: blocked ? c.textMuted : c.brandNavy }]}>{featureBadge(featureKey)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 22, borderWidth: 1.5, padding: 18, gap: 14, overflow: 'hidden' },
  ribbon: { position: 'absolute', top: 0, right: 0, paddingHorizontal: 12, paddingVertical: 5, borderBottomLeftRadius: 14 },
  ribbonText: { fontSize: 10.5, fontWeight: '900', letterSpacing: 1 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingRight: 36 },
  iconWrap: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 2 },
  iconBox: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  heroBody: { color: '#BAC7D9', fontSize: 13, lineHeight: 18, marginTop: 3 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  pillText: { color: '#E2E8F0', fontSize: 11.5, fontWeight: '600' },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 13 },
  ctaText: { fontSize: 15, fontWeight: '800' },
  tile: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 14, gap: 6, minHeight: 138 },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileTitle: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  tileBody: { fontSize: 12, lineHeight: 16 },
  badge: { alignSelf: 'flex-start', marginTop: 'auto', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 9.5, fontWeight: '900', letterSpacing: 0.6 },
});
