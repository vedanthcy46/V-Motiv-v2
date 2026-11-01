# V MOTIV V2 — Liquid Glass Implementation Guide
## Cross-Platform Adaptive Architecture & Optimization

### 1. Architectural Strategy & Native Resilience

Liquid Glass blends specular reflection, translucent light diffusion, and structural depth. In real-world Expo development workflows with custom dev clients or prebuilt APK binaries, adding native view libraries (such as `expo-linear-gradient` or `expo-blur`) causes the runtime error:
`Invariant Violation: Unable to get the view config for default view from module ExpoLinearGradient`
because the compiled native binary lacks the new native view manager class.

To ensure 100% crash-free resilience across all runtime clients (Expo Go, custom development client builds, Android emulators, and physical devices):
- **`AdaptiveGlass`** is built entirely on standard, universally linked React Native primitives (`View`, `StyleSheet`, hardware `elevation`, `shadow*`).
- **Specular Refraction Rim**: Rendered using a high-precision 1.5px semi-transparent specular line (`rgba(255, 255, 255, 0.9)` in light mode, `rgba(247, 181, 3, 0.28)` in dark mode) along the upper curved boundary.
- **Zero Native Rebuild Requirement**: Developers and users can update their JavaScript code immediately without needing to re-compile APK/AAB binaries with `eas build` or `npx expo run:android`.

---

### 2. Component Implementation: `AdaptiveGlass`

Location: `apps/customer-mobile/src/components/AdaptiveGlass.tsx`

```tsx
<AdaptiveGlass
  variant="floatingNav" // 'surface' | 'elevated' | 'subtle' | 'floatingNav' | 'modal'
  rim={true}
  containerStyle={styles.bottomBarContainer}
  style={styles.bottomBar}
>
  {children}
</AdaptiveGlass>
```

#### Core Capabilities:
1. **Reduce Transparency Accessibility Fallback**: Automatically listens to `AccessibilityInfo.isReduceTransparencyEnabled()`. When enabled, replaces translucent layers with high-contrast opaque solid colors (`#FFFFFF` in light mode, `#112744` in dark mode).
2. **Never Blur Over Pricing**: Pricing text, key vehicle mileage, and certification badges remain on high-contrast solid backgrounds with zero blur interference.
3. **FlatList Virtualization Safety**: Costly blur effects are kept out of repeating FlatList items. List items use solid card surfaces (`VehicleCard.tsx`) while floating navigation capsules and header bars use `AdaptiveGlass`.
