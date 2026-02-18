# DRAM Icon Setup

## ✅ Completed

All icon assets generated and organized by platform.

## Production Assets

| Platform | File | Size |
|----------|------|------|
| Windows | `platform/windows/icon.ico` | Multi-size |
| macOS | `platform/macos/icon.icns` | Multi-size |
| Linux | `platform/linux/*.png` | 10 sizes |
| Web | `platform/web/favicon.png` | 32px |
| Tray | `platform/web/tray-icon.png` | 16px |

## Code References

### package.json
```json
"win": { "icon": "resources/platform/windows/icon.ico" }
"mac": { "icon": "resources/platform/macos/icon.icns" }
"linux": { "icon": "resources/png/icon-256.png" }
```

### Source Code
```javascript
// window-manager.js
icon: path.join(__dirname, '../../resources/png/icon-256.png')

// tray.js
const iconPath = path.join(__dirname, '../../resources/platform/web/tray-icon.png');
```

## Build Script

```bash
cd resources
node build.mjs
```

Generates all assets from `src/` to `png/` and `platform/`.

---

*All platforms ready for production.*
