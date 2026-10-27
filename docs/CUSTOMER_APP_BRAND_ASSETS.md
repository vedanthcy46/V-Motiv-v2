# V MOTIV V2 — Customer App Brand Assets & Logo Architecture

## 1. Overview
The V MOTIV logo is implemented as mathematically precise vector curves extracted directly from official SVG vector files located in [`apps/customer-mobile/src/components/brand/official-logo-paths.ts`](file:///apps/customer-mobile/src/components/brand/official-logo-paths.ts).

No low-resolution raster bitmaps (PNGs/JPEGs) or approximated geometry are used for brand emblems or wordmarks.

---

## 2. Brand Identity Assets

### 2.1 Logo Geometry & Path Constants
The vector definitions include:
- `LOGO_VIEWBOX`: `"0 0 1000 667.3"`
- `WORDMARK_VIEWBOX`: `"0 0 624 126.4"`
- `PATH_YELLOW_ARM`: The dynamic upper wing/arm with leading angle.
- `PATH_WHITE_BODY`: The sculpted lower body of the emblem.
- `PATH_CAR_ROOF`: The integrated automotive silhouette roofline.
- `PATH_HEADLIGHT_LEFT` & `PATH_HEADLIGHT_RIGHT`: Cutout detail headlamp apertures.
- `PATH_EXACT_WORDMARK`: The geometric custom typographic glyphs for "V MOTIV".

### 2.2 Color Rules per Theme

| Logo Component | Light Mode Hex | Dark Mode Hex | Semantic Significance |
| :--- | :--- | :--- | :--- |
| **Accent Arm** | `#F7B503` | `#F7B503` | Brand signature energy yellow |
| **Emblem Body**| `#061A38` | `#FFFFFF` | Contrasts with light canvas vs dark canvas |
| **Car Roof** | `#061A38` | `#FFFFFF` | Silhouette contour |
| **Wordmark** | `#061A38` | `#FFFFFF` | V MOTIV brand logotype |

---

## 3. BrandLogo Component API

Defined in [`apps/customer-mobile/src/components/BrandLogo.tsx`](file:///apps/customer-mobile/src/components/BrandLogo.tsx):

```tsx
interface BrandLogoProps {
  /** Size multiplier based on emblem height (default: 44) */
  size?: number;
  /** Layout presentation style */
  variant?: 'emblem' | 'horizontal' | 'vertical' | 'fullLockup';
  /** Optional body color override (defaults to theme-aware textPrimary) */
  bodyColor?: string;
  /** Optional accent color override (defaults to brandAccent #F7B503) */
  accentColor?: string;
  /** Whether to render the slogan */
  showTagline?: boolean;
  /** Custom tagline text (default: 'YOUR NEXT CHAPTER') */
  taglineText?: string;
}
```

### 3.1 Adaptive Behavior
When `bodyColor` is omitted:
- `BrandLogo` automatically calls `useAppTheme()`.
- Resolves `bodyColor = isDark ? '#FFFFFF' : '#061A38'`.
- Resolves tagline text color to `colors.textMuted`.

---

## 4. Real Automotive Brand Logos (`CarBrandLogo.tsx`)

Implemented in [`apps/customer-mobile/src/components/CarBrandLogo.tsx`](file:///apps/customer-mobile/src/components/CarBrandLogo.tsx) utilizing authentic PNG brand assets from the [`apps/customer-mobile/car-brand-logos`](file:///apps/customer-mobile/car-brand-logos) folder, supplemented with vector fallbacks for missing makes.

### 4.1 Supported Makes & Authentic Assets
Directly maps to the high-resolution transparent brand logos in `car-brand-logos`:
1. **Maruti Suzuki / Suzuki**: `suzuki.png`
2. **Hyundai**: `hyundai-logo.png`
3. **Tata**: `tata-logo.png`
4. **Mahindra**: `mahindra-logo.png`
5. **Toyota**: `toyota-logo-2005.png`
6. **Kia**: `kia-logo.png`
7. **Honda**: `honda.png`
8. **Volkswagen**: `volkswagen-logo.png`
9. **Skoda**: `skoda-logo.png`
10. **Renault**: `renault-logo.png`
11. **Ford**: `ford-logo.png`
12. **Jeep**: `jeep-logo.png`
13. **Nissan**: `nissan.png`
14. **Citroën**: `citroen-logo-2022.png`
15. **Datsun**: `datsun-logo.png`
16. **Audi**: `audi-logo.png`
17. **BMW**: `bmw-logo.png`
18. **Mercedes-Benz**: `mercedes-benz-logo.png`
19. **Jaguar**: `jaguar-logo.png`
20. **Land Rover**: `land-rover-logo.png`
21. **Porsche**: `porsche-logo.png`
22. **Rolls-Royce**: `rolls-royce-logo.png`
23. **Ferrari**: `ferrari-logo.png`
24. **Lamborghini**: `lamborghini-logo.png`
25. **Bugatti**: `bugatti-logo.png`
26. **MG (Morris Garages)**: `mg-logo-2021.png`
27. **Volvo**: `volvo-logo-2021.png`
28. **BYD**: `byd-logo.png`
29. **Custom User-Entered Brands**: Initial-letter automotive crest fallback

### 4.2 Light Mode & Dark Mode Contrast Safeguards
- All brand logos are rendered within an adaptive badge container with clean light backing.
- Dark brand marks (such as the black Audi rings, Nissan wordmark, and Jeep olive green) maintain 100% visibility and contrast in both Light Mode and Dark Mode.
- On active selected cards, the badge maintains clear separation and prominence over the `#F7B503` V MOTIV yellow highlight.

### 4.3 Brand Grid Theme & Scaling
- In the Sell a Car wizard ([`SellScreen.tsx`](file:///apps/customer-mobile/src/screens/SellScreen.tsx)), brand selection cards fully adapt to the active app theme:
  - **Light Mode**: Clean surface card (`#FFFFFF`) with subtle border.
  - **Dark Mode**: Rich dark surface card (`c.surface` `#112744`) with dark border `rgba(255, 255, 255, 0.12)`.
  - **Selected State**: Outlined with 2px V MOTIV Yellow (`#F7B503`) border, subtle warm highlight, and corner checkmark badge.
- **Refined Logo Sizing**: Decreased from oversized display down to a balanced `size={40}` (approx 46px x 29px), providing comfortable breathing room and refined proportions inside the card.
- **Dark Mode Monochrome Inversion**: Predominantly black logos (Audi rings, Nissan text, Citroën chevrons, Volvo, Jaguar, Jeep, Kia) automatically render with a crisp white tint on dark cards for 100% contrast. Multi-colored emblems (BMW, Ferrari, Porsche, Lamborghini, Ford) and chrome badges (Mercedes, Suzuki, Hyundai, Tata, Mahindra) retain their authentic colors.
