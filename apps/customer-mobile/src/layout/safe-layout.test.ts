import { describe, expect, it } from 'vitest';

import { tabBarBottomOffset, tabScreenBottomPadding, stackScreenBottomPadding, TAB_BAR_HEIGHT } from './insets-math';


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

  it('stack screens clear the system navigation area', () => {
    expect(stackScreenBottomPadding(34, 'ios')).toBe(50);
    expect(stackScreenBottomPadding(0, 'android')).toBe(64);
  });
});
