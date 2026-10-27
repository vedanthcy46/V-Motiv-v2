# V MOTIV V2 — Customer Mobile App Theme Architecture

## 1. Overview & Principles
The V MOTIV V2 Customer Mobile App implements an accessibility-first, enterprise-grade unified design token architecture supporting three user appearance preferences:
- **System Default (`system`)**: Synchronizes automatically with the host OS appearance settings (iOS & Android) via React Native's `useColorScheme()` API.
- **Light Mode (`light`)**: Clean, high-contrast, premium aesthetic with `#061A38` (V MOTIV Navy) text, crisp `#FFFFFF` surfaces, `#F8FAFC` canvas backgrounds, and `#F7B503` primary accent.
- **Dark Mode (`dark`)**: Automotive dark mode with `#071426` canvas, `#112744` elevated cards, `#FFFFFF` primary text, and `#F7B503` vibrant accent.

Theme switching occurs instantly across the entire application without requiring an app reload, session reset, or navigation stack dismounting.

---

## 2. Design Token System

Design tokens are centralized in [`apps/customer-mobile/src/theme.ts`](file:///apps/customer-mobile/src/theme.ts).

### 2.1 Color Tokens Specification

| Token | Light Mode Value | Dark Mode Value | Usage / Semantic Role |
| :--- | :--- | :--- | :--- |
| `background` | `#F8FAFC` | `#071426` | Root screen background canvas |
| `surface` | `#FFFFFF` | `#112744` | Primary card surfaces, floating action bars, modals |
| `surfaceSecondary`| `#F1F5F9` | `#152D4A` | Secondary cards, pill chips, form input boxes |
| `surfaceRaised` | `#FFFFFF` | `#1E3557` | Elevated floating sheets, active popovers |
| `brandNavy` | `#061A38` | `#061A38` | Official V MOTIV brand navy identity |
| `brandAccent` | `#F7B503` | `#F7B503` | Official V MOTIV yellow accent (buttons, icons, badges) |
| `brandAccentPressed`| `#D99D00`| `#D99D00` | Pressed / active state for accent buttons |
| `brandAccentSubtle`| `rgba(247, 181, 3, 0.12)` | `rgba(247, 181, 3, 0.12)` | Chip badges, highlight banners, focus halos |
| `textPrimary` | `#061A38` | `#FFFFFF` | Main headlines, body copy, key specification values |
| `textSecondary` | `#334155` | `#D1D5DB` | Secondary descriptions, subheadings, metadata |
| `textMuted` | `#64748B` | `#8EA2BC` | Helper text, timestamps, placeholder text |
| `border` | `#E2E8F0` | `#29405F` | Card outlines, dividers, form field boundaries |
| `borderStrong` | `#CBD5E1` | `#375378` | Active input borders, prominent section dividers |
| `buttonPrimary` | `#F7B503` | `#F7B503` | Primary CTA background |
| `buttonPrimaryText`| `#061A38` | `#061A38` | High-contrast dark navy text on yellow buttons |
| `buttonSecondary` | `#F1F5F9` | `#112744` | Outline/secondary button background |
| `buttonSecondaryText`| `#061A38`| `#FFFFFF` | Secondary button label text |
| `buttonSecondaryBorder`| `#CBD5E1`| `#29405F` | Secondary button outline |
| `statusBar` | `'dark'` | `'light'` | Native system status bar content icon color |
| `overlay` | `rgba(2, 11, 24, 0.5)` | `rgba(2, 11, 24, 0.85)` | Modal backdrop dimming overlay |

### 2.2 Typography & Spacing Tokens
- **Spacing Scale (`space`)**:
  - `xs`: 4dp, `sm`: 8dp, `md`: 12dp, `lg`: 16dp, `xl`: 20dp, `xxl`: 24dp, `xxxl`: 32dp
- **Border Radii (`radius`)**:
  - `sm`: 8dp, `md`: 12dp, `lg`: 18dp, `card`: 20dp, `pill`: 999dp
- **Minimum Touch Target**: 48dp on all interactive buttons, pills, chips, tabs, and form controls.

---

## 3. Theme Provider & Reactive Hook Architecture

```
                 AsyncStorage ("vmotiv.v2.theme-preference")
                                    │
                                    ▼
                ┌───────────────────────────────────────┐
                │             ThemeProvider             │
                │  - Reads stored preference on boot    │
                │  - Listens to useColorScheme() (OS)   │
                │  - Computes active ThemeColors        │
                │  - Exposes setMode('system'|'light'|  │
                │                    'dark')            │
                └───────────────────┬───────────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           ▼                        ▼                        ▼
     Root Navigation          App Brand Logo          Screen Components
  (DefaultTheme / DarkTheme) (Adaptive Navy/White)  (Dynamic getStyles/useMemo)
```

### 3.1 Persistence & Reactivity
- **Key**: `vmotiv.v2.theme-preference`
- Changing the mode via `setMode(newMode)` updates the React state immediately and asynchronously persists the value in `AsyncStorage`.
- All screens listening via `useAppTheme()` or `useCustomerStyles()` trigger a light re-render and immediately adopt the active color palette.
