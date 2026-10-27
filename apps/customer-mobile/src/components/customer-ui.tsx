import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

// Customer surfaces are scoped so field-inspection screens keep their existing theme.
export const customerColors = { background: '#F4F6FA', surface: '#FFFFFF', ink: '#061A38', secondary: '#495B73', border: '#A2AFC0', accent: '#F7B503', selected: '#FFF5D6', error: '#AC2635' };
export const customerStyles = StyleSheet.create({
  title: { fontSize: 28, lineHeight: 36, fontWeight: '800', color: customerColors.ink },
  heading: { fontSize: 22, lineHeight: 30, fontWeight: '700', color: customerColors.ink },
  body: { fontSize: 17, lineHeight: 26, color: customerColors.secondary },
  meta: { fontSize: 14, lineHeight: 21, color: customerColors.secondary },
  card: { backgroundColor: customerColors.surface, padding: 20, borderRadius: 20, gap: 12, borderWidth: 1, borderColor: '#D8DFE8' },
  content: { padding: 20, gap: 24, width: '100%', maxWidth: 720, alignSelf: 'center' },
});

export function CustomerButton({ title, onPress, secondary = false, busy = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; busy?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 56, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: customerColors.ink, backgroundColor: secondary ? customerColors.surface : customerColors.accent, opacity: disabled || busy ? 0.55 : pressed ? 0.8 : 1, alignItems: 'center', justifyContent: 'center' })}>
    {busy ? <ActivityIndicator color={customerColors.ink} accessibilityLabel="Working" /> : <Text style={{ fontSize: 17, lineHeight: 24, fontWeight: '700', color: customerColors.ink, textAlign: 'center' }}>{title}</Text>}
  </Pressable>;
}

export function CustomerField({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return <View style={{ gap: 8 }}><Text style={{ ...customerStyles.body, color: customerColors.ink, fontWeight: '600' }}>{label}</Text>
    {hint ? <Text style={customerStyles.meta}>{hint}</Text> : null}
    <TextInput {...props} accessibilityLabel={label} accessibilityHint={hint} placeholderTextColor={customerColors.secondary}
      style={[{ minHeight: 56, backgroundColor: customerColors.surface, color: customerColors.ink, borderWidth: 1, borderColor: customerColors.border, borderRadius: 12, padding: 16, fontSize: 18, textAlignVertical: props.multiline ? 'top' : 'center' }, props.style]} />
  </View>;
}

export function CustomerChoice({ label, selected, onPress, swatch }: { label: string; selected: boolean; onPress: () => void; swatch?: string }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 60, padding: 16, borderWidth: selected ? 2 : 1, borderColor: selected ? customerColors.ink : customerColors.border, borderRadius: 14, backgroundColor: selected ? customerColors.selected : customerColors.surface, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}>
    {swatch ? <View accessible={false} style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: customerColors.secondary, backgroundColor: swatch }} /> : null}
    <Text style={{ ...customerStyles.body, color: customerColors.ink, flex: 1 }}>{label}</Text><Text accessible={false} style={{ color: customerColors.ink, fontSize: 22 }}>{selected ? '●' : '○'}</Text>
  </Pressable>;
}
