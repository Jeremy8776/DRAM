# TypeScript Migration Plan

## Objective

Move DRAM from JavaScript-heavy implementation to TypeScript-first development without breaking runtime behavior, security controls, or OpenClaw integration.

Target state:
- Type-safe IPC contracts across main, preload, and renderer.
- Type-safe engine and canvas workflows.
- CI enforces type checks.
- New code lands in TypeScript by default.

Current footprint snapshot:
- ~116 JS/TS source files across `src` and `packages/dram-plugin/src`.
- No root `tsconfig.json`.
- Electron app is JS in main/preload/renderer.
- Plugin package already uses TypeScript build tooling.

## Migration Principles

1. No big-bang rewrite.
2. Keep app releasable every week.
3. Type high-risk boundaries first.
4. Security-sensitive code gets priority typing.
5. CI gates tighten gradually, never all at once.

## Program Structure

## Phase 0: Foundation (2-3 days)

Deliverables:
- Add root `tsconfig.base.json` and `tsconfig.json`.
- Add `npm` scripts:
  - `typecheck` (initially non-blocking in CI).
  - `typecheck:strict` (future gate).
- Add ambient declarations for Electron preload bridge.
- Enable `allowJs: true`, `checkJs: false`, `noEmit: true`.
- Add path aliases for shared types.

Exit criteria:
- `npm run typecheck` runs in CI and reports baseline errors.
- No runtime behavior changes.

## Phase 1: Contract Layer (1 week)

Scope:
- Define canonical types for:
  - IPC request/response envelopes.
  - Socket protocol messages.
  - Engine status/config payloads.
  - Canvas file/version objects.
  - Attachment payloads and upload policies.

Deliverables:
- New `src/shared/types/` package for cross-process contracts.
- Runtime guards (zod or custom guards) aligned to TS interfaces.
- Replace ad-hoc `any` payload handling at boundary points.

Priority files:
- `src/main/ipc-bridge.js`
- `src/main/ipc/*.js`
- `src/preload/index.cjs`
- `src/renderer/modules/socket.js`

Exit criteria:
- IPC and socket boundaries compile with shared types.
- Contract tests pass.

## Phase 2: Main + Preload Conversion (1-1.5 weeks)

Scope:
- Convert main process and preload files to `.ts`/`.cts` as needed.
- Keep CJS/ESM compatibility explicit.
- Type secure-storage, path guards, config sync, engine lifecycle.

Priority folders:
- `src/main/engine`
- `src/main/ipc`
- `src/main/state`
- `src/preload`

Exit criteria:
- Main/preload compile via TS.
- Existing desktop security tests and IPC tests still pass.
- No regression in startup and gateway reconnect flows.

## Phase 3: Renderer Core Conversion (1.5-2 weeks)

Scope:
- Convert renderer core modules first:
  - `state`, `elements`, `socket`, `chat-handler`, `canvas`, `wizard-logic`, `usage-data`.
- Introduce typed stores and event payloads.
- Remove implicit globals and untyped DOM access patterns.

Exit criteria:
- Core chat/canvas/wizard/voice flows operate without runtime type errors.
- DOM typing is explicit for critical elements.

## Phase 4: Renderer Surface + Components (1-2 weeks)

Scope:
- Convert components, listeners, and settings tabs.
- Type plugin/skills/device/settings models across tabs.
- Unify duplicated shape definitions.

Exit criteria:
- Renderer fully TypeScript except approved legacy files.
- New UI work requires TS.

## Phase 5: Strictness Ramp + Cleanup (4-6 days)

Scope:
- Raise compiler strictness in controlled steps:
  - `noImplicitAny`
  - `strictNullChecks`
  - `noUncheckedIndexedAccess` (optional last)
- Remove temporary compatibility shims.
- Lock CI to fail on type errors.

Exit criteria:
- `npm run typecheck` is required in CI and green.
- JS fallback paths are documented or removed.

## CI/CD Gate Plan

Step 1:
- Add non-blocking `typecheck` job in CI output.

Step 2:
- Make `typecheck` required for PR merge.

Step 3:
- Add `typecheck` to release workflow pre-build checks.

Step 4:
- Enforce changed-files TS policy:
  - New files must be `.ts`/`.tsx`.
  - Modified JS files in target folders require conversion in same PR unless explicitly exempted.

## Risk Register and Controls

Risk: Electron module format issues (`.js`/`.cjs`/`.mjs`).
Control: Convert preload and main with explicit module targets and file extensions.

Risk: Runtime protocol drift between TS interfaces and real payloads.
Control: Keep runtime validation at boundaries, test fixtures for IPC/socket payloads.

Risk: Migration stalls in renderer due to DOM typing friction.
Control: Convert high-value modules first and add reusable typed DOM helpers.

Risk: Security regression during refactor.
Control: Security tests run unchanged each phase; path guards and key handling are phase-gated.

Risk: Team velocity drop.
Control: Keep migration PRs small and vertical; avoid broad cross-cutting mega-PRs.

## Workstream Ownership

Workstream A: Tooling and CI
- tsconfig, scripts, lint/type integration, build wiring.

Workstream B: Contracts and Boundaries
- shared types, IPC/socket envelopes, runtime guards.

Workstream C: Main/Preload
- engine/runtime/state/security modules.

Workstream D: Renderer
- core modules first, then component/tab surfaces.

## Definition of Done

1. `src/main`, `src/preload`, and `src/renderer` are TypeScript-first.
2. Contract types are shared and imported, not duplicated.
3. CI fails on type errors.
4. Existing lint, tests, and LOC policy pass.
5. Security-critical paths have typed inputs/outputs.
6. Readme and contributor docs specify TS default and coding rules.

## First Sprint Backlog (Start Immediately)

1. Create root `tsconfig.base.json` and `tsconfig.json`.
2. Add `npm run typecheck`.
3. Add `src/shared/types/ipc.ts`, `socket.ts`, `canvas.ts`, `engine.ts`.
4. Type preload bridge surface in one place.
5. Convert:
   - `src/main/ipc-bridge.js`
   - `src/preload/index.cjs`
   - `src/renderer/modules/socket.js`
6. Add CI job for `typecheck` as non-blocking.
7. Add migration board checklist in `TODO.md`.

## Program Timeline (Aggressive, Realistic)

Week 1:
- Phase 0 complete.
- Phase 1 started with shared contracts and typed preload bridge.

Week 2:
- Phase 1 complete.
- Phase 2 main/preload conversion 50%+.

Week 3:
- Phase 2 complete.
- Phase 3 renderer core started.

Week 4:
- Phase 3 complete.
- Phase 4 renderer surface 40%+.

Week 5:
- Phase 4 complete.
- Phase 5 strictness ramp and cleanup.

Week 6:
- Stabilization week, hardening, release prep.

