# DRAM Desktop

DRAM is a desktop add-on for OpenClaw. It provides a secure local UI layer, chat tooling, voice, and canvas workflows without replacing OpenClaw itself.

## Alpha Notice

This project is in alpha. Expect breaking changes while core architecture and UX are still moving.

## Mission

- Keep OpenClaw external and intact.
- Add a production-grade desktop experience around it.
- Prioritize security, local-first behavior, and user control.

## What DRAM Is

- Electron desktop app (`src/main`, `src/preload`, `src/renderer`)
- DRAM plugin package (`packages/dram-plugin`)
- Symbiotic integration with an existing OpenClaw install
- Secure key handling through OS keychain and strict renderer boundaries

## What DRAM Is Not

- Not a fork or replacement of OpenClaw core
- Not a bundle of upstream OpenClaw source in this repo
- Not a cloud-first chat product

## Features

- Multi-model chat through OpenClaw
- Canvas workflow for generated code and previews
- Voice interaction mode
- File attachments and workspace-aware actions
- Config sync with `~/.openclaw/openclaw.json`

## Security Posture

- Context isolation enabled
- Renderer sandboxing enabled
- Strict CSP policy
- No Node integration in renderer
- Credentials kept in secure OS storage
- Local loopback gateway usage (no external port exposure by default)

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- OpenClaw (can be discovered/managed by DRAM)

### Install

```bash
git clone https://github.com/Jeremy8776/DRAM.git
cd DRAM
npm install
npm run dev
```

## Build

```bash
npm run build
```

Build output is written to `dist/`.

## Development Commands

- `npm run dev`
- `npm run lint`
- `npm run test`
- `npm run check:loc`
- `npm run build`

## Repository Layout

```text
src/                    Electron app (main, preload, renderer)
packages/dram-plugin/   DRAM plugin package
scripts/                Tooling and guards
test/                   Test suites
.github/workflows/      CI/CD/release automation
TODO.md                 Roadmap and hardening tasks
```

## CI/CD and Release

- `ci.yml`: lint, tests, LOC guard
- `cd.yml`: build artifacts on main and manual trigger
- `release.yml`: tag-driven GitHub release pipeline

## Roadmap

See `TODO.md` for the active checklist (security, modularity, release hardening, refactor plan).

## License

MIT
