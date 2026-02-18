# Release Process

## Branch and Tag Model

- `main`: integration branch
- `v*.*.*` tags: release trigger

## Workflows

- `ci.yml`: lint, tests, LOC policy
- `cd.yml`: multi-platform artifact build on `main`
- `release.yml`: multi-platform build and GitHub Release publish on version tags

## Build Targets

- Windows: `npm run build:win`
- Linux: `npm run build:linux`
- macOS: `npm run build:mac`

## Recommended Release Steps

1. Ensure CI passes on `main`.
2. Bump version and changelog notes.
3. Create and push a tag like `v1.0.1`.
4. Verify release artifacts on GitHub Releases.
