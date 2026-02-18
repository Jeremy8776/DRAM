# DRAM Security-First TODO

This list is prioritized for mission-critical readiness: secure-by-default behavior, OpenClaw compatibility, and release hygiene.

## P0 - Security and Safety (Blockers)

- [ ] Enforce outbound payload caps before `chat.send`:
  - [ ] Hard cap single attachment bytes to engine limits.
  - [ ] Hard cap total websocket frame payload to avoid `1009 Max payload size exceeded`.
  - [ ] Reject send with actionable UI error before transport failure.
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

- [ ] LOC policy compliance (warn >500, fail >700):
  - [ ] Split `src/renderer/modules/canvas.js`
  - [ ] Split `src/main/engine/core.js`
  - [ ] Split `src/renderer/modules/socket.js`
  - [ ] Split `src/renderer/modules/wizard-logic.js`
  - [ ] Split `src/renderer/modules/usage-data.js`

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

