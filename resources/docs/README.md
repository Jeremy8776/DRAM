# DRAM Icon

**The D Monogram** - Industry-standard icon set for DRAM Desktop.

## Design

```
┌─────────────────────────┐
│                         │
│    ╭──────────╮         │
│    │          │         │  ← Bold D lettermark
│    │     ●    │         │     Purple on deep void
│    │          │         │     Neural core inside
│    ╰──────────╯         │
│                         │
└─────────────────────────┘
```

**Elements:**
1. **The D** - Bold stroke lettermark
2. **The Core** - Circular node (neural processing)
3. **Deep void background** - `#060607`
4. **Royal purple accent** - `#7c3aed`

## Folder Structure

```
resources/
├── src/                    # 🎨 Source SVGs
│   ├── icon.svg            # Main icon source
│   ├── tray-icon.svg       # Tray icon source
│   ├── icon-mono.svg       # Monochrome variant
│   └── icon-simple.svg     # Simplified variant
├── png/                    # 📦 PNG exports (all sizes)
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-256.png
│   └── ... (9 sizes)
├── platform/               # 🎯 Platform binaries
│   ├── windows/
│   │   ├── icon.ico        # Multi-size ICO
│   │   └── 16.png, 32.png, ...
│   ├── macos/
│   │   ├── icon.icns       # ICNS file
│   │   └── 16.png, 32.png, ...
│   ├── linux/
│   │   └── 16.png, 22.png, 24.png, ...
│   └── web/
│       ├── favicon.png     # 32px
│       └── tray-icon.png   # 16px
├── archive/                # 📚 Design exploration
│   ├── concepts/           # 20 explored concepts
│   └── final/              # Design variations
├── docs/                   # 📖 Documentation
│   ├── README.md           # This file
│   ├── CHOSEN_DESIGN.md    # Design rationale
│   └── SETUP.md            # Setup guide
└── build.mjs               # 🔧 Build script
```

## Quick Reference

| Platform | File Path |
|----------|-----------|
| **Windows** | `platform/windows/icon.ico` |
| **macOS** | `platform/macos/icon.icns` |
| **Linux** | `png/icon-256.png` |
| **Tray** | `platform/web/tray-icon.png` |
| **Favicon** | `platform/web/favicon.png` |

## Build

```bash
cd resources
node build.mjs
```

## Colors

| Element | Hex |
|---------|-----|
| Background | `#060607` |
| Accent | `#7c3aed` |
| Structure | `#1c1c1e` |
| Text | `#8e8e93` |

---

**Chosen: 03 D Monogram v1 - Balanced** ✓
