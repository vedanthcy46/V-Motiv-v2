import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandLogo } from './BrandLogo';
import { color, radius, space, useAppTheme } from '../theme';

export {
  KeyboardAwareFormScreen,
  KeyboardResizeContainer,
  FormField,
  FormFooter,
  useKeyboard,
  type KeyboardAwareFormScreenProps,
  type KeyboardResizeContainerProps,
  type FormFieldProps,
  type FormFooterProps,
} from './KeyboardAwareFormScreen';

export function Screen({
  children,
  scroll = true,
  keyboardAvoiding = true,
  keyboardVerticalOffset = Platform.OS === 'ios' ? 12 : 0,
  contentStyle,
  includeTopInset = true,
}: React.PropsWithChildren<{
  scroll?: boolean;
  keyboardAvoiding?: boolean;
  keyboardVerticalOffset?: number;
  contentStyle?: any;
  includeTopInset?: boolean;
}>) {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();

  const content = !scroll ? (
    <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
  ) : (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        { paddingBottom: Math.max(insets.bottom, 20) + 72 },
        contentStyle,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {children}
    </ScrollView>
  );

  return (
    <View
      style={[
        { flex: 1, backgroundColor: theme.colors.background },
        includeTopInset && { paddingTop: insets.top },
      ]}
    >
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={keyboardVerticalOffset}
          style={{ flex: 1 }}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </View>
  );
}

export function BrandHeader({
  eyebrow,
  rightAction,
}: {
  eyebrow?: string;
  rightAction?: React.ReactNode;
}) {
  return (
    <View style={styles.brandContainer}>
      <BrandLogo
        variant="horizontal"
        size={26}
        showTagline={Boolean(eyebrow)}
        taglineText={eyebrow ?? 'YOUR VEHICLE. OUR ACCOUNTABILITY.'}
      />
      {rightAction ? <View style={styles.rightActionWrap}>{rightAction}</View> : null}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
  busy,
  variant = 'primary',
  icon,
  accessibilityHint,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: React.ReactNode;
  accessibilityHint?: string;
}) {
  const { theme } = useAppTheme();
  const c = theme.colors;

  let bg = c.buttonPrimary;
  let textColor = c.buttonPrimaryText;
  let borderColor = c.buttonPrimary;

  if (variant === 'secondary') {
    bg = c.buttonSecondary;
    textColor = c.buttonSecondaryText;
    borderColor = c.buttonSecondaryBorder;
  } else if (variant === 'danger') {
    bg = 'transparent';
    textColor = c.error;
    borderColor = c.error;
  } else if (variant === 'ghost') {
    bg = 'transparent';
    textColor = c.textPrimary;
    borderColor = 'transparent';
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor },
        pressed && styles.buttonPressed,
        (disabled || busy) && styles.buttonDisabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.buttonContent}>
          {icon ? <View style={styles.buttonIcon}>{icon}</View> : null}
          <Text style={[styles.buttonText, { color: textColor }]}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const [focused, setFocused] = useState(false);
  const { theme } = useAppTheme();
  const c = theme.colors;

  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.label, { color: focused ? c.brandAccent : c.textSecondary }]}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.inputPlaceholder}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            backgroundColor: c.inputBackground,
            color: c.textPrimary,
            borderColor: Boolean(error) ? c.error : focused ? c.inputBorderFocused : c.inputBorder,
          },
          props.multiline && styles.multiline,
        ]}
        {...props}
      />
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: c.error }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { theme } = useAppTheme();
  const c = theme.colors;

  return (
    <View
      style={[
        styles.empty,
        {
          backgroundColor: c.surface,
          borderColor: c.border,
        },
      ]}
    >
      {icon ? (
        <View style={[styles.emptyIconWrap, { backgroundColor: c.surfaceSecondary }]}>
          {icon}
        </View>
      ) : null}
      <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: c.textSecondary }]}>{description}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

export function Loading({ label = 'Loading verified vehicles…' }: { label?: string }) {
  const { theme } = useAppTheme();
  const c = theme.colors;

  return (
    <View style={styles.loading}>
      <BrandLogo variant="emblem" size={40} />
      <ActivityIndicator size="small" color={c.brandAccent} style={{ marginTop: space.sm }} />
      <Text style={[styles.muted, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
}

export function useCommonStyles() {
  const { theme } = useAppTheme();
  const c = theme.colors;

  return StyleSheet.create({
    heading: { color: c.textPrimary, fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.3 },
    subheading: { color: c.textPrimary, fontSize: 17, lineHeight: 22, fontWeight: '700' },
    body: { color: c.textSecondary, fontSize: 14.5, lineHeight: 21 },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.lg,
      elevation: 2,
    },
    row: { flexDirection: 'row', alignItems: 'center' },
    between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    gap: { gap: space.md },
  });
}

// Legacy common styles fallback
export const common = StyleSheet.create({
  heading: { color: color.text, fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.3 },
  subheading: { color: color.text, fontSize: 17, lineHeight: 22, fontWeight: '700' },
  body: { color: color.textSecondary, fontSize: 14.5, lineHeight: 21 },
  muted: { color: color.muted, fontSize: 13, lineHeight: 18 },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.lg,
    elevation: 3,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gap: { gap: space.md },
});

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.lg,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    paddingBottom: space.md,
  },
  rightActionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  fieldWrap: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.2,
    paddingHorizontal: space.lg,
    fontSize: 16,
  },
  multiline: {
    minHeight: 110,
    paddingTop: space.md,
    textAlignVertical: 'top',
  },
  error: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
    gap: space.md,
    minHeight: 280,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginVertical: space.md,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 340,
  },
  emptyAction: {
    marginTop: space.sm,
    width: '100%',
    maxWidth: 240,
  },
  loading: {
    flex: 1,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  muted: {
    fontSize: 13.5,
    marginTop: space.xs,
  },
});
