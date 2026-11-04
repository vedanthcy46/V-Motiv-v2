// ============================================================
// components/KeyboardAvoider.tsx
// The one keyboard-avoiding container used by every screen, form and modal.
//  - iOS: React Native KeyboardAvoidingView ('padding'), animated with the keyboard.
//  - Android (edge-to-edge): the window does not resize, so the container measures its
//    real overlap with the keyboard and pads by exactly that amount. If the window did
//    resize the overlap is 0, so the lift is never applied twice.
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { keyboardOverlap } from '../layout/insets-math';

export interface KeyboardAvoiderProps {
  style?: StyleProp<ViewStyle>;
  /** iOS only: distance from the top of the screen to this container when it is not at the top. */
  keyboardVerticalOffset?: number;
  children?: React.ReactNode;
}

function AndroidKeyboardAvoider({ style, children }: KeyboardAvoiderProps) {
  const ref = useRef<View>(null);
  const [lift, setLift] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const keyboardTop = e.endCoordinates?.screenY;
      if (typeof keyboardTop !== 'number') return;
      ref.current?.measureInWindow((_x, y, _w, height) => {
        setLift(keyboardOverlap(y + height, keyboardTop));
      });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setLift(0));
    return () => {
      show.remove();
      hide.remove();
    };
    // Our own padding does not change the container's outer bounds, so re-measuring is stable.
  }, []);

  const base = StyleSheet.flatten(style) ?? {};
  const basePadding = typeof base.paddingBottom === 'number' ? base.paddingBottom : 0;
  return (
    <View ref={ref} collapsable={false} style={[style, lift > 0 && { paddingBottom: basePadding + lift }]}>
      {children}
    </View>
  );
}

export function KeyboardAvoider({ style, keyboardVerticalOffset = 0, children }: KeyboardAvoiderProps) {
  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={keyboardVerticalOffset}
        style={style}
      >
        {children}
      </KeyboardAvoidingView>
    );
  }
  return <AndroidKeyboardAvoider style={style}>{children}</AndroidKeyboardAvoider>;
}
