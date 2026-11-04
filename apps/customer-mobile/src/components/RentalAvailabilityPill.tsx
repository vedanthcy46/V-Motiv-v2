import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  availabilityShortLabel,
  availabilityTone,
  type AvailabilityTone,
  type RentalAvailability,
} from '../services/rental-availability';

const TONES: Record<AvailabilityTone, { bg: string; fg: string }> = {
  ok: { bg: '#10B981', fg: '#FFFFFF' },
  warn: { bg: '#F59E0B', fg: '#1F2937' },
  danger: { bg: '#DC2626', fg: '#FFFFFF' },
  muted: { bg: '#6B7280', fg: '#FFFFFF' },
};

/** Status pill for a rental car over the customer's chosen dates (On hold / Booked / In trip / ...). */
export function RentalAvailabilityPill({
  availability,
  style,
}: {
  availability?: RentalAvailability | null;
  style?: StyleProp<ViewStyle>;
}) {
  const tone = TONES[availabilityTone(availability)];
  return (
    <View
      accessible
      accessibilityLabel={`Availability: ${availabilityShortLabel(availability)}`}
      style={[styles.pill, { backgroundColor: tone.bg }, style]}
    >
      <Text style={[styles.text, { color: tone.fg }]}>{availabilityShortLabel(availability).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  text: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 },
});
