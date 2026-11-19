import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useIsFocused } from '@react-navigation/native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { initialScrollState, nextScrollState, type ScrollState } from '../layout/tab-bar-scroll';

// Hides the bottom tab bar when a list is scrolled down and brings it back when scrolled up. The bar is one shared piece (the provider owns its
// position); each tab screen reports its scrolling with `useTabBarScroll`, and the bar itself is `AnimatedTabBar`. The rules for when it hides
// are in layout/tab-bar-scroll.ts.

interface TabBarVisibility {
  translateY: Animated.Value;
  setVisible: (visible: boolean) => void;
}

const Context = createContext<TabBarVisibility | null>(null);

const DURATION_MS = 220;

/** Owns the bar's position. `hiddenDistance` is how far down it must slide to be fully off screen. */
export function TabBarVisibilityProvider({ hiddenDistance, children }: { hiddenDistance: number; children: ReactNode }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const visibleRef = useRef(true);
  const reducedMotion = useReducedMotion();
  // A screen reader user cannot find a tab bar that has slid away (and scrolling by swiping would hide it), so it then stays put.
  const [screenReader, setScreenReader] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled().then(value => { if (active) setScreenReader(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => { active = false; subscription.remove(); };
  }, []);

  const setVisible = useCallback((visible: boolean) => {
    const wanted = screenReader ? true : visible;
    if (visibleRef.current === wanted) return;
    visibleRef.current = wanted;
    Animated.timing(translateY, {
      toValue: wanted ? 0 : hiddenDistance,
      duration: reducedMotion === true ? 0 : DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [hiddenDistance, reducedMotion, screenReader, translateY]);

  // Turning a screen reader on while the bar is hidden brings it back.
  useEffect(() => { if (screenReader) setVisible(true); }, [screenReader, setVisible]);

  const value = useMemo(() => ({ translateY, setVisible }), [translateY, setVisible]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * Scroll props for a tab screen's list: `<FlatList {...useTabBarScroll()} />` (or a ScrollView). Reports each scroll to the bar. Outside the
 * provider it does nothing, so a screen can use it anywhere.
 */
export function useTabBarScroll() {
  const context = useContext(Context);
  const focused = useIsFocused();
  const state = useRef<ScrollState>(initialScrollState());

  // Coming back to a tab: its bar is shown (the tab bar itself resets on a tab change), and counting starts again.
  useEffect(() => { if (focused) state.current = { ...state.current, travelled: 0, visible: true }; }, [focused]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!context) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    state.current = nextScrollState(state.current, { offset: contentOffset.y, contentHeight: contentSize.height, viewHeight: layoutMeasurement.height });
    context.setVisible(state.current.visible);
  }, [context]);

  return { onScroll, scrollEventThrottle: 16 } as const;
}

/**
 * The tab bar, slid down and back by the provider. The wrapper fills the screen but lets touches through everywhere except on the bar itself,
 * so the screen underneath works as usual. The bar always returns when another tab is chosen.
 */
export function AnimatedTabBar(props: BottomTabBarProps) {
  const context = useContext(Context);
  const index = props.state.index;
  useEffect(() => { context?.setVisible(true); }, [index, context]);
  if (!context) return <BottomTabBar {...props} />;
  return (
    <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { transform: [{ translateY: context.translateY }] }]}>
      <BottomTabBar {...props} />
    </Animated.View>
  );
}
