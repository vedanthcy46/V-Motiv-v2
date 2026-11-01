# V MOTIV V2 — Liquid Glass Implementation Guide
## Cross-Platform Adaptive Architecture & Optimization

### 1. Architectural Strategy

Liquid Glass blends specular reflection, translucent light diffusion, and structural depth. Achieving this on mobile requires strict platform adaptation to prevent performance degradation:

- **iOS Platform Behavior**:
  - Leverages native `expo-blur` (`BlurView`) with dynamic intensity (45 to 75).
  - Integrates `expo-linear-gradient` to produce the authentic top-edge specular highlight refraction rim.
  - Layered structure: Root container → `BlurView` backdrop → Specular gradient line → Foreground content.

- **Android Platform Behavior**:
  - Real-time Gaussian blur on low-end Android GPU pipelines causes dropped frames during fast scrolling.
  - Android leverages tinted translucent fills (`rgba(14, 35, 67, 0.76)` / `rgba(255, 255, 255, 0.78)`), high-resolution perimeter strokes, specular rim gradients, and hardware elevation shadows.
  - This guarantees consistent 60fps rendering across entry-level and flagship devices alike.

---

### 2. Component Implementation: `AdaptiveGlass`

Location: `apps/customer-mobile/src/components/AdaptiveGlass.tsx`

```tsx
<AdaptiveGlass
  variant="floatingNav" // 'surface' | 'elevated' | 'subtle' | 'floatingNav' | 'modal'
  intensity={65}
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
