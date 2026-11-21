import React, { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { AppState, FlatList, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useAppTheme } from '../theme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { PAUSE_AFTER_TOUCH_MS, indexFromOffset, isTileActive, nextIndex, offsetForIndex, shouldAutoAdvance, spanOf } from '../services/carousel';

/**
 * A swipeable row that snaps one item at a time, with position dots. With `autoAdvanceMs` it also moves on by itself, wrapping back to the first
 * item after the last. It stops for a while after the person touches it, and while Home is not the screen being looked at or the app is in
 * the background. When the phone is set to reduce motion it still moves on, but jumps instead of sliding.
 */
export function Carousel<T>({
  data, keyOf, itemWidth, gap = 0, inset = 0, autoAdvanceMs, dots = 'below', style, renderItem,
}: {
  data: T[];
  keyOf: (item: T) => string;
  itemWidth: number;
  gap?: number;
  /** Space left of the first item (and right of the last). */
  inset?: number;
  autoAdvanceMs?: number;
  dots?: 'below' | 'overlay' | 'none';
  style?: StyleProp<ViewStyle>;
  /** `active` is true for the item in view while Home is on screen and the app is open: what a video uses to know when to play. */
  renderItem: (item: T, index: number, active: boolean) => ReactElement;
}) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  const span = spanOf(itemWidth, gap);
  const list = useRef<FlatList<T>>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const pausedUntil = useRef(0);
  const reducedMotion = useReducedMotion();
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const activeRef = useRef(appActive);

  useEffect(() => { focusedRef.current = focused; }, [focused]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { activeRef.current = state === 'active'; setAppActive(state === 'active'); });
    return () => subscription.remove();
  }, []);

  const goTo = useCallback((next: number, animated: boolean) => {
    list.current?.scrollToOffset({ offset: offsetForIndex(next, span), animated });
    indexRef.current = next;
    setIndex(next);
  }, [span]);

  useEffect(() => {
    if (!autoAdvanceMs || data.length < 2) return undefined;
    const timer = setInterval(() => {
      const move = shouldAutoAdvance({ count: data.length, intervalMs: autoAdvanceMs, pausedUntil: pausedUntil.current, now: Date.now(), focused: focusedRef.current, appActive: activeRef.current });
      if (move) goTo(nextIndex(indexRef.current, data.length), reducedMotion !== true);
    }, autoAdvanceMs);
    return () => clearInterval(timer);
  }, [autoAdvanceMs, data.length, goTo, reducedMotion]);

  // The list can change while Home is open (new content arrives): never stay pointing past its end.
  useEffect(() => { if (indexRef.current >= data.length) goTo(0, false); }, [data.length, goTo]);

  const touched = () => { pausedUntil.current = Date.now() + PAUSE_AFTER_TOUCH_MS; };
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = indexFromOffset(event.nativeEvent.contentOffset.x, span, data.length);
    indexRef.current = next;
    setIndex(next);
  };

  if (data.length === 0) return null;

  return (
    <View style={style}>
      <FlatList
        ref={list}
        data={data}
        horizontal
        snapToInterval={span}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        keyExtractor={keyOf}
        contentContainerStyle={{ paddingHorizontal: inset }}
        ItemSeparatorComponent={gap > 0 ? () => <View style={{ width: gap }} /> : undefined}
        getItemLayout={(_data, i) => ({ length: span, offset: inset + span * i, index: i })}
        initialNumToRender={3}
        windowSize={5}
        onTouchStart={touched}
        onScrollBeginDrag={touched}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
        onScrollToIndexFailed={() => undefined}
        extraData={`${index}|${focused}|${appActive}`}
        renderItem={({ item, index: i }) => renderItem(item, i, isTileActive(i, index, focused, appActive))}
      />
      {dots !== 'none' && data.length > 1 ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.dots, dots === 'overlay' ? styles.dotsOverlay : styles.dotsBelow]}
        >
          {data.map((item, i) => (
            <View
              key={keyOf(item)}
              style={[styles.dot, i === index
                ? { backgroundColor: c.brandAccent, width: 18 }
                : { backgroundColor: dots === 'overlay' ? 'rgba(255,255,255,0.55)' : c.border, width: 6 }]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 },
  dotsBelow: { marginTop: 10 },
  dotsOverlay: { position: 'absolute', left: 0, right: 0, bottom: 10 },
  dot: { height: 6, borderRadius: 3 },
});
