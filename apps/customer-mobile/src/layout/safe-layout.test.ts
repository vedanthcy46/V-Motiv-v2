import { describe, expect, it } from 'vitest';

import {
  effectiveBottomInset,
  safeBottomInset,
  stackScreenBottomPadding,
  tabBarBottomOffset,
  tabScreenBottomPadding,
  TAB_BAR_HEIGHT,
} from './insets-math';

describe('safe layout', () => {
  it('keeps the tab bar clear of gesture/home indicator and 3-button navigation', () => {
    expect(tabBarBottomOffset(34, 'ios')).toBe(42);
    expect(tabBarBottomOffset(0, 'ios')).toBe(12);
    expect(tabBarBottomOffset(0, 'android')).toBe(48);
    expect(tabBarBottomOffset(24, 'android')).toBe(48);
    expect(tabBarBottomOffset(60, 'android')).toBe(68);
  });

  it('content padding always clears the whole tab bar plus a gap', () => {
    for (const os of ['ios', 'android']) {
      for (const inset of [0, 20, 34, 48, 72]) {
        const bar = tabBarBottomOffset(inset, os) + TAB_BAR_HEIGHT;
        expect(tabScreenBottomPadding(inset, os)).toBeGreaterThan(bar);
      }
    }
  });

  it('falls back to the 3-button height only when Android reports a zero inset', () => {
    expect(effectiveBottomInset(0, 'android')).toBe(48);
    expect(effectiveBottomInset(24, 'android')).toBe(24);
    expect(effectiveBottomInset(0, 'ios')).toBe(0);
    expect(effectiveBottomInset(-3, 'ios')).toBe(0);
  });

  it('safeBottomInset honours a visual minimum and the Android fallback', () => {
    expect(safeBottomInset(0, 'ios', 16)).toBe(16);
    expect(safeBottomInset(34, 'ios', 16)).toBe(34);
    expect(safeBottomInset(0, 'android', 24)).toBe(48);
    expect(safeBottomInset(20, 'android', 24)).toBe(24);
  });

  it('stack screens clear the system navigation area', () => {
    expect(stackScreenBottomPadding(34, 'ios')).toBe(50);
    expect(stackScreenBottomPadding(0, 'android')).toBe(64);
    expect(stackScreenBottomPadding(0, 'ios')).toBe(16);
  });
});

import { sheetMaxHeight } from './insets-math';

describe('sheetMaxHeight', () => {
  it('shrinks with the keyboard and never collapses below a usable height', () => {
    expect(sheetMaxHeight(800, 44, 0)).toBe(744);
    expect(sheetMaxHeight(800, 44, 300)).toBe(444);
    expect(sheetMaxHeight(400, 44, 350)).toBe(200);
  });
});

import { keyboardOverlap } from './insets-math';

describe('keyboardOverlap', () => {
  it('lifts by the real overlap only, never double counting a resized window', () => {
    expect(keyboardOverlap(800, 500)).toBe(300);
    expect(keyboardOverlap(500, 500)).toBe(0);
    expect(keyboardOverlap(480, 500)).toBe(0);
  });
});
