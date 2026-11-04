// ============================================================
// components/KeyboardAwareSheet.tsx
// Bottom-sheet modal that follows the same layout rules as every screen:
//  - lifts above the soft keyboard and shrinks so it never exceeds the visible area,
//  - body scrolls, header and action footer stay pinned,
//  - footer/body clear the system navigation buttons with dynamic padding.
// ============================================================

import React, { forwardRef } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ModalProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { safeBottom } from '../layout/safe-layout';
import { KeyboardAvoider } from './KeyboardAvoider';
import { sheetMaxHeight } from '../layout/insets-math';
import { radius, space, useAppTheme } from '../theme';
import { useKeyboard } from './KeyboardAwareFormScreen';
import { KeyboardScrollView } from './KeyboardScrollView';

export interface KeyboardAwareSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  closeLabel?: string;
  /** Block backdrop/back/close while an action is running. */
  locked?: boolean;
  animationType?: ModalProps['animationType'];
  /** Pinned action area under the scrolling body (buttons). */
  footer?: React.ReactNode;
  bodyStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export const KeyboardAwareSheet = forwardRef<ScrollView, KeyboardAwareSheetProps>(function KeyboardAwareSheet(
  { visible, onClose, title, closeLabel = 'Close', locked = false, animationType = 'slide', footer, bodyStyle, children },
  ref,
) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { colors } = useAppTheme();
  const { keyboardHeight, isKeyboardVisible } = useKeyboard();

  const requestClose = () => {
    if (locked) return;
    Keyboard.dismiss();
    onClose();
  };

  // Keyboard covers the system navigation area, so only reserve the inset when it is hidden.
  const bottomPad = isKeyboardVisible ? space.sm : safeBottom(insets.bottom, space.md) + space.xs;
  const maxHeight = sheetMaxHeight(windowHeight, insets.top, isKeyboardVisible ? keyboardHeight : 0);

  return (
    <Modal
      visible={visible}
      animationType={animationType}
      transparent
      statusBarTranslucent
      onRequestClose={requestClose}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Dismiss"
          style={StyleSheet.absoluteFill}
          onPress={requestClose}
        />
        <KeyboardAvoider style={styles.avoider}>
          <View style={[styles.sheet, { backgroundColor: colors.surface, maxHeight }]}>
            {title ? (
              <View style={styles.header}>
                <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
                  {title}
                </Text>
                <TouchableOpacity
                  onPress={requestClose}
                  disabled={locked}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={closeLabel}
                >
                  <Text style={[styles.close, { color: colors.brandAccent }]}>{closeLabel}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <KeyboardScrollView
              ref={ref}
              style={styles.body}
              contentContainerStyle={[
                styles.bodyContent,
                !footer && { paddingBottom: bottomPad + space.md },
                bodyStyle,
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {children}
            </KeyboardScrollView>

            {footer ? (
              <View
                style={[
                  styles.footer,
                  { borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: bottomPad },
                ]}
              >
                {footer}
              </View>
            ) : null}
          </View>
        </KeyboardAvoider>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'flex-end' },
  avoider: { width: '100%' },
  sheet: {
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  title: { fontSize: 17, fontWeight: '700', flexShrink: 1, paddingRight: space.md },
  close: { fontSize: 14, fontWeight: '700' },
  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.md },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
