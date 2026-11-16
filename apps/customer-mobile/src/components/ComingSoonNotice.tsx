import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Lock } from 'lucide-react-native';
import { useAppTheme } from '../theme';
import { CustomerButton } from './customer-ui';
import { comingSoonMessage, type FeatureKey } from '../constants/features';

/** A whole screen that says a service is not open yet. Used where a blocked service could still be reached (a link, an old shortcut). */
export function ComingSoonNotice({ featureKey, onBack }: { featureKey: FeatureKey; onBack: () => void }) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const message = comingSoonMessage(featureKey);
  return (
    <View style={[styles.root, { backgroundColor: c.background, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.back}>
        <ArrowLeft size={22} color={c.textPrimary} />
      </Pressable>
      <View style={styles.center}>
        <View style={[styles.iconCircle, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Lock size={34} color={c.brandAccent} accessibilityElementsHidden />
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: c.textPrimary }]}>{message.title}</Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>{message.body}</Text>
      </View>
      <CustomerButton title="Back to home" onPress={onBack} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  iconCircle: { width: 84, height: 84, borderRadius: 42, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 14.5, lineHeight: 21, textAlign: 'center', maxWidth: 340 },
});
