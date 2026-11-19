import React from 'react';
import { StyleSheet, View } from 'react-native';

/** Opacity of each strip of the fade, top to bottom. The top is almost clear, so the picture or video stays fully visible. */
const STRIPS = [0.04, 0.12, 0.24, 0.38, 0.52, 0.64];

/**
 * A soft fade from clear to navy at the bottom of a picture or video, so words laid over it are readable without a solid box covering it.
 * Made of stacked strips of rising opacity (no gradient module is needed). Place it inside a positioned card; it does not take touches.
 */
export function CaptionScrim({ height }: { height: number }) {
  return (
    <View pointerEvents="none" style={[styles.scrim, { height }]}>
      {STRIPS.map(alpha => <View key={alpha} style={{ flex: 1, backgroundColor: `rgba(6,26,56,${alpha})` }} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
