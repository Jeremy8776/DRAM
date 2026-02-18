# TypeScript Sweep (OpenClaw Excluded)

Date: 2026-02-18

## Scope
- Included: all `src/**/*.js|cjs|mjs`
- Excluded: files/modules with `openclaw` in path/name

## Current Snapshot
- JS files in `src` (excluding OpenClaw): `122`
- Total JS lines in `src` (excluding OpenClaw): `18,547`
- Domain split:
  - `main`: `39 files / 5,741 lines`
  - `preload`: `1 file / 217 lines`
  - `renderer`: `82 files / 12,589 lines`

## Important Constraint
The app currently executes source JS directly (`electron .` with `src/main/index-wrapper.cjs` and renderer loading JS modules).

This means extension renames to `.ts` for runtime files require a transpile/runtime pipeline first.

## Migration Policy
- Convert first where type safety matters most:
  - IPC boundary, filesystem, shell execution, secure storage, state sync.
- Keep `openclaw` modules in JS for now (explicitly excluded).
- Move in phases with green checks after each phase:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run check:loc`

## Phase 1 (Security / IPC Core)
Highest-priority conversion targets:
- `src/preload/index.cjs`
- `src/main/ipc-bridge.js`
- `src/main/ipc-validation.js`
- `src/main/ipc/fs.js`
- `src/main/ipc/system.js`
- `src/main/ipc/app.js`
- `src/main/ipc/window.js`
- `src/main/state/config-sync.js`
- `src/main/secure-storage.js`
- `src/main/token-manager.js`

## Phase 2 (Main Process Infrastructure)
- `src/main/index.js`
- `src/main/ipc-handlers.js`
- `src/main/engine/context.js`
- `src/main/window-manager.js`
- `src/main/menu.js`
- `src/main/tray.js`
- `src/main/performance-monitor.js`
- `src/main/auto-updater.js`
- `src/main/redact.js`
- `src/main/ipc/{models,plugins,skills,util,storage,gateway,migration,canvas,channels,devices,tts,voice,path-guards,shell-fs-utils}.js`

## Phase 3 (Renderer Core Flows)
- `src/renderer/modules/chat-handler.js`
- `src/renderer/modules/model-capabilities.js`
- `src/renderer/modules/rate-limits.js`
- `src/renderer/modules/settings.js`
- `src/renderer/modules/renderer.js`
- `src/renderer/modules/ui-loader.js`
- `src/renderer/modules/wizard.js`
- `src/renderer/modules/listeners/{api-key-listeners,settings-listeners,util-listeners,chat-listeners,plugin-config}.js`
- `src/renderer/modules/voice-mode.js`
- `src/renderer/app.js`

## Phase 4 (Renderer Supporting Modules)
- `src/renderer/components/**/*`
- `src/renderer/modules/{utils,elements,state,state-bridge,tabs,ui-components,usage-chart,usage-data,connection-ui,errors,logger,info-tooltip,icons,tts-handler,voice-*}.js`
- `src/renderer/data/plugin-metadata.js` (optional; static data, lower risk)

## Phase 5 (Strictness Ramp)
- Enable stricter TS checks per domain:
  - main/preload first
  - renderer second
- Introduce domain `tsconfig` splits if needed.
- Enforce no-new-JS in migrated folders.

## Runtime Pipeline Work Needed Before Broad `.ts` Renames
1. Add transpile step for runtime modules (main + preload + renderer) to JS output.
2. Switch Electron entry/runtime to transpiled output.
3. Keep import specifiers stable (`.js` in ESM) for emitted runtime.

Without these, full extension migration in `src` would break runtime.

