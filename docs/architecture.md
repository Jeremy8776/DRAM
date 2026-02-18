# Architecture

## Overview

DRAM is an Electron desktop layer that integrates with [OpenClaw](https://github.com/openclaw/openclaw) as an external runtime.

## Components

- `src/main`: lifecycle, IPC registration, engine orchestration
- `src/preload`: controlled renderer API bridge
- `src/renderer`: UI, chat, canvas, voice, settings
- `packages/dram-plugin`: DRAM plugin package
- `scripts`: project checks and maintenance utilities

## Runtime Model

1. DRAM starts the desktop shell.
2. Engine runtime discovers or connects to [OpenClaw](https://github.com/openclaw/openclaw).
3. Renderer uses IPC through preload-safe boundaries.
4. Chat, canvas, and management actions route through engine interfaces.

## Design Principles

- Keep [OpenClaw](https://github.com/openclaw/openclaw) external and unmodified.
- Keep IPC explicit and auditable.
- Keep UI behavior modular to reduce regressions.
