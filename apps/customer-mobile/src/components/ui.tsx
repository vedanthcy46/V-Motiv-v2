import React, { useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput,
  type TextInputProps, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandLogo } from './BrandLogo';
import { color, radius, space } from '../theme';

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
  contentStyle,
}: React.PropsWithChildren<{ scroll?: boolean; contentStyle?: any }>) {
  const insets = useSafeAreaInsets();

  if (!scroll) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <View style={[styles.fill, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Math.max(insets.bottom, 20) + 72 },
          contentStyle,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && styles.buttonPressed,
        (disabled || busy) && styles.buttonDisabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? color.navy : color.white} />
      ) : (
        <View style={styles.buttonContent}>
          {icon ? <View style={styles.buttonIcon}>{icon}</View> : null}
          <Text style={[styles.buttonText, variant === 'primary' && styles.primaryText]}>
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

  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={color.muted}
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
          focused && styles.inputFocused,
          props.multiline && styles.multiline,
          Boolean(error) && styles.inputError,
        ]}
        {...props}
      />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
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
  return (
    <View style={styles.empty}>
      {icon ? <View style={styles.emptyIconWrap}>{icon}</View> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{description}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

export function Loading({ label = 'Loading verified vehicles…' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <BrandLogo variant="emblem" size={40} />
      <ActivityIndicator size="small" color={color.yellow} style={{ marginTop: space.sm }} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gap: { gap: space.md },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.canvas },
  fill: { flex: 1 },
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
    minHeight: 50,
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
  primary: {
    backgroundColor: color.yellow,
    borderColor: color.yellow,
    shadowColor: color.yellow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  secondary: {
    backgroundColor: color.raised,
    borderColor: color.border,
  },
  danger: {
    backgroundColor: 'transparent',
    borderColor: color.danger,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: color.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  primaryText: {
    color: color.navy,
  },
  fieldWrap: {
    gap: 6,
  },
  label: {
    color: color.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  labelFocused: {
    color: color.yellow,
  },
  input: {
    minHeight: 50,
    backgroundColor: color.input,
    color: color.text,
    borderRadius: radius.md,
    borderWidth: 1.2,
    borderColor: color.border,
    paddingHorizontal: space.lg,
    fontSize: 15.5,
  },
  inputFocused: {
    borderColor: color.yellow,
    backgroundColor: '#0F2F5E',
  },
  multiline: {
    minHeight: 110,
    paddingTop: space.md,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: color.danger,
  },
  error: {
    color: color.danger,
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
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    marginVertical: space.md,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.raised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  emptyTitle: {
    color: color.text,
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyBody: {
    color: color.textSecondary,
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
    color: color.muted,
    fontSize: 13.5,
    marginTop: space.xs,
  },
});
