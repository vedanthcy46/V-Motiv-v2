// ============================================================
// components/KeyboardAwareFormScreen.tsx
// Unified, robust keyboard-aware layout and form components for V MOTIV V2.
// Solves keyboard covering inputs, sticky footer positioning,
// tap persistence, and Android/iOS safe area navigation overlaps.
// ============================================================

import React, { forwardRef, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { AlertCircle } from 'lucide-react-native';
import { color, radius, space, useAppTheme } from '../theme';
import { KEYBOARD_AVOIDING_BEHAVIOR } from '../layout/safe-layout';

// ============================================================
// 1. KeyboardAwareFormScreen
// ============================================================
export interface KeyboardAwareFormScreenProps extends ScrollViewProps {
  /** Optional header (e.g. Back button, Title) pinned at the top */
  header?: React.ReactNode;
  /** Optional footer action bar (e.g. Continue / Submit buttons) */
  footer?: React.ReactNode;
  /** Whether the footer should remain sticky above the keyboard (default: false for long forms) */
  stickyFooter?: boolean;
  /** Custom edges for SafeAreaView (default: top, left, right) */
  edges?: Edge[];
  /** Optional keyboard vertical offset */
  keyboardVerticalOffset?: number;
  /** Container style */
  containerStyle?: StyleProp<ViewStyle>;
  /** ScrollView content container style */
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export const KeyboardAwareFormScreen = forwardRef<ScrollView, KeyboardAwareFormScreenProps>(
  (
    {
      header,
      footer,
      stickyFooter = false,
      edges = ['top', 'left', 'right'],
      keyboardVerticalOffset = Platform.OS === 'ios' ? 12 : 0,
      containerStyle,
      contentContainerStyle,
      children,
      ...scrollViewProps
    },
    ref
  ) => {
    const insets = useSafeAreaInsets();
    const { colors } = useAppTheme();
    const internalScrollRef = useRef<ScrollView>(null);
    const scrollRef = (ref as React.RefObject<ScrollView>) || internalScrollRef;

    // Extra bottom padding for scroll content so the last field can scroll fully above footers/keyboards
    const contentBottomPadding = stickyFooter
      ? space.xl
      : Math.max(insets.bottom, space.md) + (footer ? space.md : space.xl);

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }, containerStyle]} edges={edges}>
        <KeyboardAvoidingView
          // Android must reduce available height; padding alone leaves a
          // bottom CTA and the active field underneath the soft keyboard.
          behavior={KEYBOARD_AVOIDING_BEHAVIOR}
          keyboardVerticalOffset={keyboardVerticalOffset}
          style={styles.keyboardAvoid}
        >
          {/* Optional Fixed Header */}
          {header ? <View style={[styles.headerWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>{header}</View> : null}

          {/* Main Scrollable Content */}
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: contentBottomPadding },
              contentContainerStyle,
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            {...scrollViewProps}
          >
            {children}

            {/* Non-sticky footer rendered at the bottom of the scroll content */}
            {footer && !stickyFooter ? (
              <View style={styles.inScrollFooter}>{footer}</View>
            ) : null}
          </ScrollView>

          {/* Sticky footer rendered outside ScrollView, smoothly anchored above keyboard */}
          {footer && stickyFooter ? (
            <View
              style={[
                styles.stickyFooter,
                {
                  backgroundColor: colors.surface,
                  borderTopColor: colors.border,
                  paddingBottom: Math.max(insets.bottom, space.md),
                },
              ]}
            >
              {footer}
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }
);

KeyboardAwareFormScreen.displayName = 'KeyboardAwareFormScreen';

// ============================================================
// 2. FormField (Input with stable identity, focus glow & ref support)
// ============================================================
export interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export const FormField = forwardRef<TextInput, FormFieldProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      containerStyle,
      style,
      onFocus,
      onBlur,
      ...textInputProps
    },
    ref
  ) => {
    const { colors, isDark } = useAppTheme();
    const [focused, setFocused] = React.useState(false);

    return (
      <View style={[styles.fieldWrap, containerStyle]}>
        <View style={styles.labelRow}>
          <Text style={[styles.fieldLabel, { color: colors.textPrimary }, focused && { color: colors.brandAccent }]}>
            {label}
          </Text>
          {required ? <Text style={[styles.requiredStar, { color: colors.brandAccent }]}> *</Text> : null}
        </View>

        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.fieldInput,
            {
              backgroundColor: colors.surfaceSecondary,
              borderColor: colors.border,
              color: colors.textPrimary,
            },
            focused && {
              borderColor: colors.brandAccent,
              backgroundColor: isDark ? 'rgba(10, 36, 71, 0.95)' : '#FFFFFF',
            },
            textInputProps.multiline && styles.fieldInputMultiline,
            Boolean(error) && styles.fieldInputError,
            style,
          ]}
          {...textInputProps}
        />

        {error ? (
          <View style={styles.errorRow}>
            <AlertCircle size={13} color="#EF4444" />
            <Text accessibilityRole="alert" style={styles.fieldError}>
              {error}
            </Text>
          </View>
        ) : helperText ? (
          <Text style={[styles.fieldHelper, { color: colors.textMuted }]}>{helperText}</Text>
        ) : null}
      </View>
    );
  }
);

FormField.displayName = 'FormField';

// ============================================================
// 3. FormFooter (Standardized Action Buttons)
// ============================================================
export interface FormFooterProps {
  primaryTitle: string;
  onPrimaryPress: () => void;
  primaryDisabled?: boolean;
  primaryBusy?: boolean;
  primaryIcon?: React.ReactNode;
  secondaryTitle?: string;
  onSecondaryPress?: () => void;
  secondaryDisabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function FormFooter({
  primaryTitle,
  onPrimaryPress,
  primaryDisabled,
  primaryBusy,
  primaryIcon,
  secondaryTitle,
  onSecondaryPress,
  secondaryDisabled,
  style,
}: FormFooterProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.footerRow, style]}>
      {secondaryTitle && onSecondaryPress ? (
        <TouchableOpacity
          style={[
            styles.secondaryBtn,
            {
              backgroundColor: colors.surfaceSecondary,
              borderColor: colors.border,
            },
          ]}
          activeOpacity={0.75}
          disabled={secondaryDisabled || primaryBusy}
          onPress={onSecondaryPress}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>{secondaryTitle}</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={[
          styles.primaryBtn,
          { backgroundColor: colors.brandAccent },
          !secondaryTitle && styles.primaryBtnFull,
          (primaryDisabled || primaryBusy) && styles.primaryBtnDisabled,
        ]}
        activeOpacity={0.8}
        disabled={primaryDisabled || primaryBusy}
        onPress={onPrimaryPress}
      >
        {primaryBusy ? (
          <ActivityIndicator color={colors.brandNavy} />
        ) : (
          <View style={styles.primaryContent}>
            {primaryIcon ? <View style={styles.btnIconWrap}>{primaryIcon}</View> : null}
            <Text style={[styles.primaryBtnText, { color: colors.brandNavy }]}>{primaryTitle}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.canvas,
  },
  keyboardAvoid: {
    flex: 1,
  },
  headerWrap: {
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: space.md,
  },
  inScrollFooter: {
    marginTop: space.lg,
  },
  stickyFooter: {
    backgroundColor: color.navy,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  fieldWrap: {
    marginBottom: space.md,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  fieldLabel: {
    color: color.white,
    fontSize: 13,
    fontWeight: '700',
  },
  fieldLabelFocused: {
    color: color.yellow,
  },
  requiredStar: {
    color: color.yellow,
    fontSize: 13,
    fontWeight: '700',
  },
  fieldInput: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    borderWidth: 1.2,
    borderColor: color.border,
    paddingHorizontal: space.md,
    paddingVertical: 11,
    color: color.white,
    fontSize: 14,
  },
  fieldInputFocused: {
    borderColor: color.yellow,
    backgroundColor: 'rgba(10, 36, 71, 0.95)',
  },
  fieldInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: space.md,
  },
  fieldInputError: {
    borderColor: '#EF4444',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  fieldError: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  fieldHelper: {
    color: color.muted,
    fontSize: 12,
    marginTop: 4,
  },
  footerRow: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
  },
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: color.white,
    fontSize: 14,
    fontWeight: '700',
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: color.yellow,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnFull: {
    width: '100%',
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnIconWrap: {
    marginRight: 2,
  },
  primaryBtnText: {
    color: color.navy,
    fontSize: 15,
    fontWeight: '800',
  },
});

// ============================================================
// 4. useKeyboard Hook
// ============================================================
export function useKeyboard() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates ? e.endCoordinates.height : 0);
        setKeyboardVisible(true);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
        setKeyboardVisible(false);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return { keyboardHeight, isKeyboardVisible };
}

// ============================================================
// 5. KeyboardResizeContainer
// ============================================================
export interface KeyboardResizeContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
}

export function KeyboardResizeContainer({
  children,
  style,
  keyboardVerticalOffset = Platform.OS === 'ios' ? 12 : 0,
}: KeyboardResizeContainerProps) {
  return (
    <KeyboardAvoidingView
      behavior={KEYBOARD_AVOIDING_BEHAVIOR}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

