import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, ShieldCheck, X } from 'lucide-react-native';
import { useAppTheme, radius, space } from '../theme';

type Props = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onScanned: (value: string) => void;
};

export function ConnectQrScannerModal({
  visible,
  title = 'Scan V MOTIV Connect QR',
  subtitle = 'Point your camera at the official vehicle sticker.',
  onClose,
  onScanned,
}: Props) {
  const { theme, isDark } = useAppTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (visible) setLocked(false);
  }, [visible]);

  const onBarcodeScanned = useCallback((result: { data: string }) => {
    if (locked || !result.data) return;
    setLocked(true);
    onScanned(result.data);
  }, [locked, onScanned]);

  const close = () => {
    setLocked(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.scrim}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={styles.header}>
            <View style={[styles.icon, { backgroundColor: 'rgba(247,181,3,0.14)' }]}>
              <Camera size={22} color={theme.colors.brandAccent} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{title}</Text>
              <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>{subtitle}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close QR scanner" hitSlop={10} onPress={close} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
              <X size={22} color={theme.colors.textPrimary} />
            </Pressable>
          </View>

          {!permission ? (
            <View style={styles.permissionBox}><ActivityIndicator color={theme.colors.brandAccent} /></View>
          ) : !permission.granted ? (
            <View style={[styles.permissionBox, { backgroundColor: isDark ? '#14253E' : '#F6F9FD' }]}>
              <ShieldCheck size={30} color={theme.colors.brandAccent} />
              <Text style={[styles.permissionTitle, { color: theme.colors.textPrimary }]}>Camera permission needed</Text>
              <Text style={[styles.permissionText, { color: theme.colors.textSecondary }]}>Your camera is used only to read the sticker you choose to scan.</Text>
              <Pressable accessibilityRole="button" onPress={() => void requestPermission()} style={({ pressed }) => [styles.allowButton, { backgroundColor: theme.colors.brandAccent }, pressed && styles.pressed]}>
                <Text style={[styles.allowText, { color: theme.colors.brandNavy }]}>Allow camera</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.cameraWrap}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={locked ? undefined : onBarcodeScanned}
              />
              <View pointerEvents="none" style={styles.viewfinder}>
                <View style={styles.frame} />
                <Text style={styles.helper}>Align the complete QR code inside the frame</Text>
              </View>
            </View>
          )}
          <Text style={[styles.privacy, { color: theme.colors.textSecondary }]}>The QR value is verified securely. It never reveals an owner’s number or address.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, borderWidth: 1, padding: space.lg, gap: space.md },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 }, title: { fontSize: 16, fontWeight: '800' }, subtitle: { fontSize: 12, lineHeight: 17 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  cameraWrap: { height: 340, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#020B18' },
  viewfinder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(2,11,24,0.18)' },
  frame: { width: 218, height: 218, borderRadius: radius.md, borderWidth: 2, borderColor: '#F7B503', backgroundColor: 'transparent' },
  helper: { marginTop: 18, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, overflow: 'hidden', color: '#FFFFFF', fontSize: 12, fontWeight: '700', backgroundColor: 'rgba(2,11,24,0.72)' },
  permissionBox: { minHeight: 260, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: 12 },
  permissionTitle: { fontSize: 16, fontWeight: '800' }, permissionText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  allowButton: { minHeight: 48, borderRadius: radius.pill, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  allowText: { fontSize: 14, fontWeight: '800' }, privacy: { fontSize: 11.5, lineHeight: 17, textAlign: 'center' }, pressed: { opacity: 0.72 },
});
