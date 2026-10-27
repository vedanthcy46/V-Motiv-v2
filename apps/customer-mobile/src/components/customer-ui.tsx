import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useAppTheme } from '../theme';

// Legacy fallback object
export const customerColors = {
  background: '#F6F8FC',
  surface: '#FFFFFF',
  ink: '#061A38',
  secondary: '#627086',
  border: '#E2E7F0',
  accent: '#F7B503',
  selected: '#FFF5D6',
  error: '#DC2626',
};

export const customerStyles = StyleSheet.create({
  title: { fontSize: 28, lineHeight: 36, fontWeight: '800', color: customerColors.ink },
  heading: { fontSize: 22, lineHeight: 30, fontWeight: '700', color: customerColors.ink },
  body: { fontSize: 17, lineHeight: 26, color: customerColors.secondary },
  meta: { fontSize: 14, lineHeight: 21, color: customerColors.secondary },
  card: { backgroundColor: customerColors.surface, padding: 20, borderRadius: 20, gap: 12, borderWidth: 1, borderColor: '#D8DFE8' },
  content: { padding: 20, gap: 24, width: '100%', maxWidth: 720, alignSelf: 'center' },
});

export function useCustomerStyles() {
  const { theme } = useAppTheme();
  const c = theme.colors;

  return {
    colors: c,
    styles: StyleSheet.create({
      title: { fontSize: 28, lineHeight: 36, fontWeight: '800', color: c.textPrimary },
      heading: { fontSize: 22, lineHeight: 30, fontWeight: '700', color: c.textPrimary },
      body: { fontSize: 17, lineHeight: 26, color: c.textSecondary },
      meta: { fontSize: 14, lineHeight: 21, color: c.textMuted },
      card: { backgroundColor: c.surface, padding: 20, borderRadius: 20, gap: 12, borderWidth: 1, borderColor: c.border },
      content: { padding: 20, gap: 24, width: '100%', maxWidth: 720, alignSelf: 'center' },
    }),
  };
}

export function CustomerButton({
  title,
  onPress,
  secondary = false,
  busy = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  const { theme } = useAppTheme();
  const c = theme.colors;

  const bg = secondary ? c.buttonSecondary : c.buttonPrimary;
  const textColor = secondary ? c.buttonSecondaryText : c.buttonPrimaryText;
  const borderColor = secondary ? c.buttonSecondaryBorder : c.buttonPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 56,
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor,
        backgroundColor: bg,
        opacity: disabled || busy ? 0.55 : pressed ? 0.8 : 1,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      {busy ? (
        <ActivityIndicator color={textColor} accessibilityLabel="Working" />
      ) : (
        <Text style={{ fontSize: 17, lineHeight: 24, fontWeight: '700', color: textColor, textAlign: 'center' }}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function CustomerField({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  const { theme } = useAppTheme();
  const c = theme.colors;

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 17, lineHeight: 24, color: c.textPrimary, fontWeight: '600' }}>
        {label}
      </Text>
      {hint ? (
        <Text style={{ fontSize: 14, lineHeight: 20, color: c.textMuted }}>{hint}</Text>
      ) : null}
      <TextInput
        {...props}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={c.inputPlaceholder}
        style={[
          {
            minHeight: 56,
            backgroundColor: c.inputBackground,
            color: c.textPrimary,
            borderWidth: 1,
            borderColor: c.inputBorder,
            borderRadius: 12,
            padding: 16,
            fontSize: 18,
            textAlignVertical: props.multiline ? 'top' : 'center',
          },
          props.style,
        ]}
      />
    </View>
  );
}

export function CustomerChoice({
  label,
  selected,
  onPress,
  swatch,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  swatch?: string;
}) {
  const { theme } = useAppTheme();
  const c = theme.colors;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 60,
        padding: 16,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? c.brandAccent : c.border,
        borderRadius: 14,
        backgroundColor: selected ? c.selected : c.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {swatch ? (
        <View
          accessible={false}
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: c.borderStrong,
            backgroundColor: swatch,
          }}
        />
      ) : null}
      <Text style={{ fontSize: 17, lineHeight: 24, color: c.textPrimary, flex: 1 }}>{label}</Text>
      <Text accessible={false} style={{ color: selected ? c.brandAccent : c.textMuted, fontSize: 22 }}>
        {selected ? '●' : '○'}
      </Text>
    </Pressable>
  );
}
