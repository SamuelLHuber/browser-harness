# Changelog

## 0.1.2 — 2026-10-03

- Declare host-provided TypeBox as a wildcard peer, not a runtime dependency.
- Pin the development copy and add actual Pi resource-loader package-warning tests.
- Keep the private-data working copy out of release ancestry.

## 0.1.1 — 2026-10-03

- Check against the real Pi 1.0.0 extension API.
- Prefix commands with `browser-harness` to coexist with Playwright.
- Escalate subprocess termination after an ignored SIGTERM and remove cancellation listeners/timers after completion.
- Add five regression tests for real loader registration, process success/failure, timeout escalation, and cancellation.
- Release from an isolated workspace based on the public fork; exclude all private research data and unrelated local working-copy changes.
- Actual Chrome connection, authenticated browser mutation, and cloud-account actions are not covered by these fixture tests.
