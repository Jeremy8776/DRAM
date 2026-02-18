# Security

Security is a core requirement for DRAM.

## Controls

- Context isolation and sandboxed renderer execution
- Explicit IPC surface between renderer and main process
- Local secure storage patterns for credentials
- Local-first defaults for data flow and runtime behavior

## Operational Guardrails

- Avoid exposing external network surfaces by default
- Keep sensitive values out of renderer scope
- Prefer scoped handlers and audited IPC routes

## Validation

- Run security-related test suites:
  - `npm run test`
  - `npm run check:ipc`

## Related

- [Roadmap](../TODO.md) for security hardening backlog
- [OpenClaw](https://github.com/openclaw/openclaw) runtime and gateway behavior
