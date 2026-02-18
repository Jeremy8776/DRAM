# DRAM Icon - Chosen Design

**Selected: 03 D Monogram (v1 - Balanced)**

## The Design

```
    ╭──────────╮
    │          │
    │     ●    │     D = DRAM identity
    │          │     ● = Neural core / memory
    ╰──────────╯
```

## Why This Design

1. **Bold & Memorable** - Lettermarks are timeless and instantly recognizable
2. **Meaningful** - D for DRAM, the dot represents the processing/memory core
3. **Versatile** - Works at 16×16 (tray) and 256×256 (app icon)
4. **Unique** - Not a generic chip or brain icon
5. **Professional** - Suitable for a serious developer tool

## File Structure

```
resources/
├── icon.svg                    # Main 256×256 icon
├── icon-simple.svg             # Simplified variant
├── icon-mono.svg               # Monochrome (adaptive)
├── tray-icon.svg               # 32×32 system tray
├── favicon.svg                 # In src/renderer/
├── build-all.js                # 🚀 Complete build script
├── final/                      # Design variations
│   ├── icon-monogram-v1.svg    # ← Main choice (Balanced)
│   ├── icon-monogram-v2.svg    # Bold (20px stroke)
│   ├── icon-monogram-v3.svg    # Sleek (12px stroke)
│   ├── icon-monogram-v4.svg    # Framed (with border)
│   ├── icon-monogram-v5-tray.svg
│   ├── icon-monogram-v6-favicon.svg
│   ├── icon-monogram-windows.svg
│   ├── icon-monogram-macos.svg
│   ├── icon-monogram-linux.svg
│   ├── icon-monogram-square.svg
│   ├── icon-monogram-circle.svg
│   ├── preview.html            # Browser preview
│   ├── preview-png.svg         # Preview as SVG
│   └── preview.png             # (generated)
├── dist/                       # 🎯 Production assets (generated)
│   ├── icon.png
│   ├── icon.ico
│   ├── icon.iconset/
│   ├── preview.png
│   ├── windows-*.png
│   ├── macos-*.png
│   └── linux-*.png
└── concepts/                   # 20 explored concepts
    └── icon-01-cell through icon-20-crystal
```

## Quick Start

### Generate All Assets

```bash
cd resources
npm install sharp
node build-all.js
```

This creates:
- ✅ All PNG sizes (16px to 1024px)
- ✅ Windows ICO (placeholder, needs multi-size tool)
- ✅ macOS iconset (ready for iconutil)
- ✅ Linux variants
- ✅ Preview PNG (2400×2800)

### Platform-Specific Build

**Windows ICO (proper multi-size):**
```bash
# Option 1: png-to-ico (npm)
npx png-to-ico dist/icon-*.png > dist/icon.ico

# Option 2: ImageMagick
convert dist/icon-*.png -define icon:auto-resize=256,128,64,48,32,16 dist/icon.ico
```

**macOS ICNS:**
```bash
cd dist
iconutil -c icns icon.iconset -o icon.icns
```

**Linux:**
```bash
# Copy to system icons
sudo cp dist/linux-*.png /usr/share/icons/hicolor/
```

## Industry Standard Variants

### v1 - Balanced (Main)
- **Stroke:** 16px
- **Use:** Universal, all platforms
- **Characteristics:** Classic proportions, works at all sizes

### v2 - Bold
- **Stroke:** 20px
- **Use:** Small sizes, high visibility
- **Characteristics:** More substantial, stands out

### v3 - Sleek
- **Stroke:** 12px
- **Use:** Large sizes, minimal aesthetic
- **Characteristics:** Modern, elegant

### v4 - Framed
- **Stroke:** 16px + subtle border
- **Use:** App stores, marketing
- **Characteristics:** Premium feel, depth

### Platform Optimized

| Platform | Variant | Notes |
|----------|---------|-------|
| Windows | Thicker stroke (18px) | Better visibility on light taskbar |
| macOS | Gradient background | Big Sur style with subtle depth |
| Linux | Flat, rounded | Adapts to any theme |
| Square | No radius | Social media, app stores |
| Circle | Full radius | Profile pictures, badges |

## Usage

### App Window (Electron)
```javascript
// Already configured in window-manager.js
icon: path.join(__dirname, '../../resources/icon.png')
```

### System Tray
```javascript
// Already configured in tray.js
const iconPath = path.join(__dirname, '../../resources/tray-icon.png');
```

### HTML Favicon
```html
<!-- Already in src/renderer/index.html -->
<link rel="icon" type="image/svg+xml" href="favicon.svg">
```

## Preview

View all variations:
```bash
# Browser preview
open final/preview.html

# Generated preview PNG
open dist/preview.png
```

The preview shows:
- All 4 main variations
- Platform-optimized variants
- Size test (16px to 256px)
- Design rationale

## Color Specs

- **Background:** `#060607` (Deep Void)
- **D Stroke:** `#7c3aed` (Royal Purple)
- **Core Dot:** `#7c3aed` (same purple)
- **Corner Radius:** 56px (icon), 6px (tray)

## Industry Standard Sizes

| Platform | Sizes |
|----------|-------|
| **Windows** | 16, 20, 24, 32, 40, 48, 64, 96, 128, 192, 256 |
| **macOS** | 16, 32, 64, 128, 256, 512, 1024 |
| **Linux** | 16, 22, 24, 32, 48, 64, 96, 128, 192, 256 |
| **iOS** | 120, 152, 167, 180 |
| **Android** | 48, 72, 96, 144, 192, 512 |
| **Web** | 16, 32, 48, 64, 128, 256 |

All generated automatically by `build-all.js`.

## Alternatives Explored

See `resources/concepts/README.md` for the 20 concepts considered:
- 11 Owl (wisdom keeper)
- 12 Prism (multi-channel)
- 13 Vault (security)
- 15 Constellation (knowledge graph)
- 19 Roots (deep memory)

**Final choice: 03 D Monogram v1 - Balanced** ✓

## Assets Summary

After running `build-all.js`:

| Asset | Format | Sizes | Location |
|-------|--------|-------|----------|
| App Icon | PNG | 16-1024px | `dist/icon-*.png` |
| Windows | ICO | Multi | `dist/icon.ico` |
| macOS | ICNS | Multi | `dist/icon.icns` (after iconutil) |
| Tray | PNG | 16, 32px | `dist/tray-icon.png` |
| Favicon | PNG | 16, 32px | `dist/favicon.png` |
| Preview | PNG | 2400×2800 | `dist/preview.png` |
