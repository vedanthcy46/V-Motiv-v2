import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStack, Tabs } from './types';

export const navigationRef = createNavigationContainerRef<RootStack>();

export function navigate<RouteName extends keyof RootStack>(
  name: RouteName,
  params?: RootStack[RouteName],
) {
  if (navigationRef.isReady()) {
    (navigationRef as any).navigate(name, params);
  }
}

export function navigateToTab(tabName: keyof Tabs) {
  if (navigationRef.isReady()) {
    (navigationRef as any).navigate('Tabs', { screen: tabName });
  }
}
