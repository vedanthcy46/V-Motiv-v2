import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme';
import { storeLink, useAppUpdate } from '../services/app-update';

/**
 * "Update available" card. Mount once near the app root. It appears when the backend's app config names a newer version
 * than the one running (for example the app is 1.0.0 and the backend now says 1.0.1). "Later" hides it for a day; when the
 * app is older than the minimum supported version it becomes a full-screen requirement that cannot be dismissed.
 */
export function UpdateAvailableCard() {
  const { theme } = useAppTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const { update, dismiss, openStore } = useAppUpdate();
  if (update.kind === 'none') return null;

  const required = update.kind === 'required';
  const canOpen = Boolean(storeLink({ url: update.url }));
  const body = (
    <View accessibilityLiveRegion="polite" style={[styles.card, { backgroundColor: c.surface, borderColor: required ? c.error : c.brandAccent }]}>
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: c.brandAccent + '33' }]}><Text style={styles.badgeText}>⬆</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.textPrimary }]}>{required ? 'Update required' : 'Update available'}</Text>
          <Text style={[styles.sub, { color: c.textSecondary }]}>
            Version {update.latest} is available. You have {update.current}.
          </Text>
        </View>
      </View>
      {required ? <Text style={[styles.note, { color: c.textSecondary }]}>This version is no longer supported. Please update to keep using V MOTIV.</Text> : null}
      {update.notes ? <Text style={[styles.note, { color: c.textMuted }]}>What's new: {update.notes}</Text> : null}
      <View style={styles.actions}>
        {canOpen ? (
          <Pressable accessibilityRole="button" onPress={openStore} style={[styles.button, { backgroundColor: c.brandAccent }]}>
            <Text style={[styles.buttonText, { color: '#061A38' }]}>Update now</Text>
          </Pressable>
        ) : (
          <Text style={[styles.note, { color: c.textSecondary, flex: 1 }]}>Open the App Store and update V MOTIV.</Text>
        )}
        {!required ? (
          <Pressable accessibilityRole="button" onPress={dismiss} style={[styles.button, { borderColor: c.border, borderWidth: 1 }]}>
            <Text style={[styles.buttonText, { color: c.textPrimary }]}>Later</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  if (required) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={styles.backdrop}>{body}</View>
      </Modal>
    );
  }
  return <View pointerEvents="box-none" style={[styles.floating, { bottom: insets.bottom + 16 }]}>{body}</View>;
}

const styles = StyleSheet.create({
  floating: { position: 'absolute', left: 16, right: 16, zIndex: 50, elevation: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(2, 11, 24, 0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, alignSelf: 'center', borderRadius: 16, borderWidth: 1, padding: 16, gap: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 20, fontWeight: '800', color: '#D99D00' },
  title: { fontSize: 16, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 2 },
  note: { fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4, alignItems: 'center' },
  button: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonText: { fontSize: 14, fontWeight: '800' },
});
