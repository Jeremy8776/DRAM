# DRAM Security-First TODO

This list is prioritized for mission-critical readiness: secure-by-default behavior, OpenClaw compatibility, and release hygiene.

## P0 - Security and Safety (Blockers)

- [ ] Enforce outbound payload caps before `chat.send`:
  - [x] Hard cap single attachment bytes to engine limits.
  - [x] Hard cap total websocket frame payload to avoid `1009 Max payload size exceeded`.
  - [x] Reject send with actionable UI error before transport failure.
- [ ] Centralize model-aware attachment policy:
  - [ ] Keep per-model limits in one module (size, count, modality).
  - [ ] Add explicit fallback defaults when model metadata is missing.
- [ ] Secret handling verification:
  - [ ] Audit logs for accidental key/token emission paths.
  - [ ] Add automated test asserting API keys never enter persisted config payloads.
  - [ ] Add redaction coverage for new IPC/model routes.
- [ ] Network exposure hardening:
  - [ ] Confirm gateway binds to loopback only (`127.0.0.1`/`::1`) by default.
  - [ ] Add user-facing warning/consent gate for any non-loopback bind mode.

## P0 - OpenClaw Compatibility (Blockers)

- [ ] Keep symbiotic mode non-breaking:
  - [ ] Never write unsupported OpenClaw config keys (e.g., `agents.defaults.thinkLevel`).
  - [ ] Run config schema sanity check before every config write.
  - [ ] Add compatibility test against latest OpenClaw expected config shape.

## P1 - Reliability and UX

- [ ] Attachment robustness:
  - [ ] Improve image optimization strategy for large PNGs (target bytes + transport budget).
  - [ ] Add clear user status: `optimized`, `skipped`, and exact reason.
- [ ] Reconnect behavior:
  - [ ] Preserve pending UI state cleanly after WS reconnect.
  - [ ] Avoid duplicate retries for one failed oversized send.

## P1 - Quality Gates

- [ ] Make CI green:
  - [ ] Fix failing `test/plugins-ipc.test.js` model payload shape expectation.
  - [ ] Keep `npm test` fully passing.
  - [ ] Reduce lint warnings to zero or explicitly codify allowed warnings.
- [ ] Add pre-release gate script:
  - [ ] `check:loc`
  - [ ] `lint`
  - [ ] `test`
  - [ ] build smoke

## P2 - Architecture / Refactor (next session)

- [x] LOC policy compliance (warn >500, fail >700):
  - [x] Refactor oversized modules to pass `npm run check:loc`.
  - [x] Keep all source files below warn threshold.

## P2 - TypeScript Migration Program

- [x] Execute migration plan in `docs/typescript-migration-plan.md`.
- [ ] Phase 0 (Foundation):
  - [x] Add root `tsconfig.base.json`.
  - [x] Add root `tsconfig.json`.
  - [x] Add `npm run typecheck`.
  - [x] Wire non-blocking CI typecheck job.
- [ ] Phase 1 (Contracts):
  - [x] Create `src/shared/types` for IPC/socket/canvas/engine contracts.
  - [ ] Add runtime guard coverage for boundary payloads.
- [ ] Phase 2 (Main + Preload):
  - [ ] Convert `src/main` and `src/preload` critical boundary files first.
  - [ ] Keep security tests green through conversion.
- [ ] Phase 3 (Renderer Core):
  - [ ] Convert `state`, `socket`, `chat-handler`, `canvas`, `wizard-logic`, `usage-data`.
  - [ ] Replace implicit any payload paths.
- [ ] Phase 4 (Renderer Surface):
  - [ ] Convert listeners/components/settings tabs.
  - [ ] Enforce TS for all new renderer modules.
- [ ] Phase 5 (Strictness + CI):
  - [ ] Enable strict compiler options in stages.
  - [ ] Make `typecheck` required in CI and release workflows.
  - [ ] Execute full file-by-file sweep from `docs/typescript-sweep.md` (OpenClaw excluded).

## P2 - Documentation

- [ ] Update `README.md`:
  - [ ] Add explicit security model section (key handling, local-only ports, redaction).
  - [ ] Add OpenClaw compatibility contract section.
  - [ ] Link this TODO as project roadmap.
- [ ] Add `RELEASE_CHECKLIST.md` for consistent private/public release flow.

## GitHub Prep Checklist (Current Branch)

- [ ] Confirm large staged deletions are intentional before release commit.
- [ ] Commit in focused slices (security, compatibility, UX, docs).
- [ ] Tag a pre-release after test/lint/build pass.
