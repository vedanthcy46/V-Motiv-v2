// ============================================================
// components/KeyboardScrollView.tsx
// ScrollView that, when the keyboard opens, scrolls ONLY as far as needed to reveal the
// focused input. Everything else keeps its place and stays scrollable. Works on iOS and
// Android (edge-to-edge), so screens do not stack automaticallyAdjustKeyboardInsets on top
// of a keyboard-avoiding container.
// ============================================================

import React, { forwardRef, useCallback, useEffect, useRef } from 'react';
import {
  Keyboard,
  ScrollView,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import { scrollDeltaForInput } from '../layout/insets-math';

const REVEAL_MARGIN = 16;

type MeasurableView = {
  measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) => void;
};

export const KeyboardScrollView = forwardRef<ScrollView, ScrollViewProps>(function KeyboardScrollView(
  { onScroll, horizontal, ...props },
  forwardedRef,
) {
  const inner = useRef<ScrollView | null>(null);
  const offset = useRef(0);

  const setRef = useCallback(
    (node: ScrollView | null) => {
      inner.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<ScrollView | null>).current = node;
    },
    [forwardedRef],
  );

  useEffect(() => {
    if (horizontal) return;
    const sub = Keyboard.addListener('keyboardDidShow', (event) => {
      const input = TextInput.State.currentlyFocusedInput?.();
      const view = inner.current;
      if (!input || !view) return;
      const keyboardTop = event.endCoordinates?.screenY ?? Number.POSITIVE_INFINITY;
      // Wait one frame so a keyboard-avoiding container has finished resizing.
      requestAnimationFrame(() => {
        (view as unknown as MeasurableView).measureInWindow((vx, vy, vw, vh) => {
          input.measureInWindow((ix, iy, iw, ih) => {
            const inside = ix + iw > vx && ix < vx + vw && iy + ih > vy;
            if (!inside) return;
            const delta = scrollDeltaForInput({
              viewTop: vy,
              viewBottom: Math.min(vy + vh, keyboardTop),
              inputTop: iy,
              inputBottom: iy + ih,
              margin: REVEAL_MARGIN,
            });
            if (delta !== 0) view.scrollTo({ y: Math.max(0, offset.current + delta), animated: true });
          });
        });
      });
    });
    return () => sub.remove();
  }, [horizontal]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = e.nativeEvent.contentOffset.y;
      onScroll?.(e);
    },
    [onScroll],
  );

  return (
    <ScrollView
      scrollEventThrottle={16}
      {...props}
      horizontal={horizontal}
      ref={setRef}
      onScroll={handleScroll}
    />
  );
});
