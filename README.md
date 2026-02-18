# DRAM Desktop

**DRAM** - Desktop AI Assistant powered by OpenClaw.

DRAM Desktop is a secure, local-first, native Electron application that provides an enhanced UI/UX layer for OpenClaw. Instead of bundling its own AI engine, DRAM works symbiotically with your existing OpenClaw installation, enhancing it with a beautiful desktop interface, voice mode, canvas visualizations, and secure credential management.

## ⚠️ Alpha Release

This software is currently in an **Alpha** state of development. It is being released for testing and development purposes. Features may be incomplete, unstable, or subject to breaking changes. Use at your own risk.

## Key Features

### 🔒 Secure and Private
- **Local-First Architecture**: Your data stays on your machine.
- **OS Keychain Integration**: API keys and credentials are encrypted using your OS keychain, never stored in plain text.
- **Context Isolation**: Strict separation between app logic and renderer processes.

### 💬 Advanced Chat Interface
- **Multi-Model Support**: Seamlessly switch between Claude, GPT, Gemini, and local models via OpenClaw.
- **Tabs System**: Manage multiple chat sessions simultaneously with a browser-like tab interface.
- **Voice Mode**: Real-time voice interaction with waveform visualization.
- **File Attachments**: Drag-and-drop support for analyzing documents and images.

### 🧩 Symbiotic OpenClaw Integration
- **Auto-Discovery**: Automatically detects existing OpenClaw installations.
- **Settings Adoption**: Imports your existing OpenClaw configuration on first launch.
- **Bidirectional Sync**: Changes made in DRAM or via CLI stay synchronized.
- **Version Management**: Install, update, or rollback OpenClaw versions from within DRAM.

## Getting Started

### Prerequisites
- **Node.js**: v18 or later
- **npm** (v9+)
- **OpenClaw** (optional - DRAM can install it for you)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Jeremy8776/DRAM.git
   cd DRAM
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm run dev
   ```
   
   On first launch, DRAM will:
   - Detect if OpenClaw is already installed
   - If found: Show your existing settings for approval
   - If not found: Install OpenClaw automatically and guide you through setup

### Building for Production

```bash
npm run build
```

This creates platform-specific binaries in the `dist/` folder.

## How It Works

### Symbiotic Architecture

```
┌─────────────────────────────────────────┐
│         DRAM Desktop (Electron)          │
│  ┌─────────────────────────────────────┐ │
│  │  Enhanced UI │ Security │ Voice     │ │
│  │  Canvas │ File Handling │ Tray      │ │
│  └─────────────────────────────────────┘ │
│              WebSocket/API               │
└─────────────────────────────────────────┘
                    │
                    ▼ discovers & manages
┌─────────────────────────────────────────┐
│           OpenClaw (External)           │
│  ┌─────────────────────────────────────┐ │
│  │  Gateway │ Agents │ Plugins │ CLI  │ │
│  │  Config │ Models │ Skills           │ │
│  └─────────────────────────────────────┘ │
│         ~/.openclaw/openclaw.json        │
└─────────────────────────────────────────┘
```

### User Flows

**Existing OpenClaw User:**
1. Launch DRAM
2. "We found your OpenClaw installation!"
3. Preview detected settings (models, plugins, workspace)
4. Click "Import & Enhance" → DRAM adopts everything
5. Your CLI continues to work exactly as before

**New User:**
1. Launch DRAM  
2. "Let's set up your AI assistant"
3. DRAM installs OpenClaw automatically
4. Walk through API key setup
5. Ready to chat!

## Configuration

### Config Location
DRAM uses OpenClaw's native configuration format at:
- **macOS/Linux**: `~/.openclaw/openclaw.json`
- **Windows**: `%USERPROFILE%\.openclaw\openclaw.json`

### Synchronization
- DRAM watches the config file for changes (e.g., from CLI usage)
- Changes in DRAM are written in native OpenClaw format
- CLI and Desktop stay perfectly in sync

### Backup & Restore
- Create manual backups of your OpenClaw config from Settings → Gateway
- Restore from any previous backup if needed

## Development

### Project Structure
```
dram-desktop/
├── src/
│   ├── main/           # Electron main process
│   │   ├── ipc/        # IPC handlers (including OpenClaw management)
│   │   └── engine/     # OpenClaw integration
│   ├── preload/        # Secure Context Bridge
│   └── renderer/       # Frontend UI
├── packages/
│   └── dram-plugin/    # DRAM Plugin for OpenClaw
└── scripts/            # Build and maintenance scripts
```

### Key Commands
- `npm run dev`: Start the app in development mode
- `npm run build`: Build for production
- `npm run bundle-engine`: Bundle OpenClaw (optional fallback)
- `npm test`: Run tests

## Security

DRAM prioritizes security:
- **Context Isolation**: Enabled to prevent prototype pollution.
- **Sandboxing**: Renderer processes are sandboxed.
- **Content Security Policy**: Strict CSP to prevent XSS.
- **No Node Integration**: Node.js APIs are not exposed to the renderer.
- **Secure Storage**: All credentials stored in OS keychain.

## Troubleshooting

### OpenClaw Not Found
If DRAM can't find OpenClaw:
1. Make sure `openclaw` is in your PATH: `which openclaw` (macOS/Linux) or `where openclaw` (Windows)
2. Or install it manually: `npm install -g openclaw`
3. Restart DRAM

### Config Sync Issues
If changes from CLI aren't reflected in DRAM:
1. Settings → Gateway → Create Backup (to be safe)
2. Restart DRAM (file watcher restarts)

### Version Compatibility
DRAM works with OpenClaw v2.x and later. Use Settings → Gateway to check or change versions.

## Acknowledgements

This project is built upon the [OpenClaw](https://github.com/openclaw/openclaw) engine.
Special thanks to the OpenClaw team and community for establishing the foundation of this project.

## License

MIT - DRAM
