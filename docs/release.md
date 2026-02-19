# Release Process

## Branch and Tag Model

- `main`: integration branch
- `v*.*.*` tags: release trigger

## Workflows

- `ci.yml`: lint, tests, LOC policy
- `cd.yml`: multi-platform artifact build on `main`
- `release.yml`: multi-platform build and GitHub Release publish on version tags

## Build Targets

- Windows: `npm run build:win` (NSIS setup + portable)
- Linux: `npm run build:linux`
- macOS: `npm run build:mac`

Installer artifact verification is enforced in `cd.yml` and `release.yml` via:

- `npm run verify:installers -- --platform windows`
- `npm run verify:installers -- --platform linux`
- `npm run verify:installers -- --platform macos`

## Recommended Release Steps

1. Ensure CI passes on `main`.
2. Run local pre-tag checks in this order:
   - `npm run check:pretag` (runs: typecheck -> test -> build runtime smoke -> bundle smoke)
3. Bump version and changelog notes.
4. Create and push a tag like `v1.0.1`.
5. Do not pre-create the GitHub release manually; let `release.yml` create/upload assets from the tag workflow.
6. Verify release artifacts on GitHub Releases.
