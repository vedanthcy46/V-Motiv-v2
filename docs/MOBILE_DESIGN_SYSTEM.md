# V MOTIV V2 — Mobile Design System Specification
## Adaptive Liquid Glass Architecture for iOS & Android

### 1. Brand Identity & Color Foundations

V MOTIV's mobile experience is rooted in three immutable brand pillars:
- **V MOTIV Navy**: `#061A38` (Dominant, authoritative dealership anchor)
- **V MOTIV Signature Yellow**: `#F7B503` (High-contrast energy accent & conversion driver)
- **Pure White**: `#FFFFFF` (Clarity, canvas contrast, and specular highlight refraction)

#### Semantic Token Hierarchy
| Semantic Token | Light Mode | Dark Mode | Usage |
| :--- | :--- | :--- | :--- |
| `canvas.background` | `#F6F8FC` | `#071426` | Root screen background |
| `surface.base` | `#FFFFFF` | `#112744` | Solid content cards |
| `surface.secondary` | `#EDF2F8` | `#182F4D` | Nested chip rows, secondary backgrounds |
| `surface.elevated` | `#FFFFFF` | `#1E3557` | Dropdowns, popovers, active sheets |
| `glass.background` | `rgba(255, 255, 255, 0.78)` | `rgba(14, 35, 67, 0.76)` | Translucent Liquid Glass body |
| `glass.backgroundElevated` | `rgba(255, 255, 255, 0.88)` | `rgba(20, 46, 84, 0.86)` | Floating nav, modals, top headers |
| `glass.border` | `rgba(226, 232, 240, 0.85)` | `rgba(255, 255, 255, 0.12)` | Subtle glass perimeter stroke |
| `glass.borderRim` | `rgba(255, 255, 255, 0.95)` | `rgba(247, 181, 3, 0.26)` | Top-edge specular refraction rim |
| `text.primary` | `#061A38` | `#FFFFFF` | Primary headings, titles, prices |
| `text.secondary` | `#627086` | `#BAC7D9` | Subtitles, supporting specifications |
| `text.muted` | `#8E9CAE` | `#6B7F99` | Captions, metadata, placeholders |
| `brand.accent` | `#F7B503` | `#F7B503` | Calls-to-action, badges, active tabs |
| `brand.accentPressed`| `#D99D00` | `#D99D00` | Active button press state |

---

### 2. Adaptive Elevation & Shadow System

```typescript
export const elevationTokens = {
  subtle: { elevation: 3, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
  card: { elevation: 6, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 },
  elevatedGlass: { elevation: 12, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 20 },
  floatingNav: { elevation: 16, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 24 }
};
```

---

### 3. Typography Scale

- **Display**: 32pt / Line height: 38pt / Weight: 800 / Tracking: -0.6
- **Title 1**: 26pt / Line height: 32pt / Weight: 700 / Tracking: -0.4
- **Title 2**: 20pt / Line height: 26pt / Weight: 700 / Tracking: -0.2
- **Title 3**: 18pt / Line height: 24pt / Weight: 600 / Tracking: -0.1
- **Body**: 15pt / Line height: 22pt / Weight: 400
- **Body Bold**: 15pt / Line height: 22pt / Weight: 700
- **Callout**: 14pt / Line height: 20pt / Weight: 500
- **Caption**: 12.5pt / Line height: 17pt / Weight: 500
- **Micro**: 10.5pt / Line height: 14pt / Weight: 700 / Tracking: +0.4 / Uppercase

---

### 4. Touch Targets & Safe Areas

- Minimum interactive touch target: **44pt × 44pt** across all buttons and tabs.
- Safe Area Insets: Dynamic calculations using `react-native-safe-area-context` `useSafeAreaInsets()`.
- Bottom navigation bar: Floats above safe area with `Math.max(insets.bottom, 12)` offset, ensuring it never overlaps Android 3-button or gesture pill navigation.
