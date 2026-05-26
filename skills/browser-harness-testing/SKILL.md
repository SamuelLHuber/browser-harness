---
name: browser-harness-testing
description: Test the browser-harness pi extension and diagnose browser-harness setup. Use when validating browser_harness tools, running browser_harness_doctor, or handling DevToolsActivePort / remote debugging failures.
---

# Browser Harness Testing

Use this skill when testing the browser-harness pi extension or debugging why the harness cannot attach to Chrome.

## Goal

Verify the pi extension can load, register tools, invoke the `browser-harness` executable, and either control a browser or produce a clear setup action for the user.

## Headless pi smoke tests

Run from the browser-harness repository root.

### 1. Extension loads and flags appear

```bash
pi -e . --help | grep -E "browser-harness|browser_harness" -A12 -B2
```

Expected: the help output includes these extension flags:

- `--browser-harness-command`
- `--browser-harness-timeout`
- `--browser-harness-output-dir`
- `--browser-harness-bu-name`
- `--browser-harness-autospawn`
- `--browser-harness-debug-clicks`

### 2. TypeScript check

```bash
npm install
npm run check
```

If this creates `node_modules/`, remove it before committing unless it is intentionally needed for local debugging:

```bash
rm -rf node_modules
```

### 3. Doctor tool through pi

If `browser-harness` is on PATH:

```bash
pi -e . --no-session --no-builtin-tools \
  --tools browser_harness_doctor \
  --mode text \
  -p 'Use browser_harness_doctor and report the result.'
```

If working from this repo without a global install, first create the local venv:

```bash
uv run browser-harness --version
```

Then run:

```bash
pi -e . --no-session --no-builtin-tools \
  --tools browser_harness_doctor \
  --browser-harness-command .venv/bin/browser-harness \
  --mode text \
  -p 'Use browser_harness_doctor and report the result.'
```

Expected: pi calls the tool. The doctor may exit non-zero if Chrome remote debugging is not enabled; that is a browser setup issue, not an extension loading issue.

### 4. Main tool through pi

```bash
pi -e . --no-session --no-builtin-tools \
  --tools browser_harness \
  --browser-harness-command .venv/bin/browser-harness \
  --mode text \
  -p 'Use browser_harness to run this exact Python: print("hello from harness"). Report the result.'
```

If browser-harness cannot connect to Chrome, handle it with the remote debugging section below.

## Remote debugging failure handling

Browser-harness controls Chrome through the Chrome DevTools Protocol (CDP). For a local real browser, Chrome must expose a DevTools endpoint. Without it, browser-harness cannot attach, inspect pages, click, type, or run JavaScript.

Common failure strings:

- `DevToolsActivePort not found`
- `enable chrome://inspect/#remote-debugging`
- `click Allow in Chrome if prompted`
- `fatal: DevToolsActivePort not found`
- doctor output has `[FAIL] daemon alive` and `[FAIL] active browser connections`

When this happens, **ask the user to enable remote debugging**. Do not keep retrying indefinitely.

Tell the user:

> Browser-harness needs Chrome remote debugging enabled so it can connect via the Chrome DevTools Protocol. This is how it reads the current page, takes screenshots, clicks, types, and runs JavaScript in your real browser. Please open `chrome://inspect/#remote-debugging` in Chrome, tick **Allow remote debugging for this browser instance**, then click **Allow** if Chrome shows a permission popup. After that I will retry the browser-harness test.

On macOS, you may open the settings page for them:

```bash
osascript -e 'tell application "Google Chrome" to activate' \
          -e 'tell application "Google Chrome" to open location "chrome://inspect/#remote-debugging"'
```

Then ask them to tick the checkbox and approve the popup. The checkbox is user-controlled and may require user action.

After the user confirms, retry:

```bash
pi -e . --no-session --no-builtin-tools \
  --tools browser_harness_doctor \
  --browser-harness-command .venv/bin/browser-harness \
  --mode text \
  -p 'Use browser_harness_doctor and report the result.'
```

Then retry a minimal browser action:

```bash
pi -e . --no-session --no-builtin-tools \
  --tools browser_harness \
  --browser-harness-command .venv/bin/browser-harness \
  --mode text \
  -p 'Use browser_harness to run: import json; print(json.dumps(page_info())). Report the result.'
```

## Expected interpretation

- Extension flags visible in `pi -e . --help`: extension discovery works.
- `browser_harness_doctor` tool gets called: tool registration and execution work.
- `spawn browser-harness ENOENT`: executable not on PATH; install with `uv tool install -e .` or pass `--browser-harness-command .venv/bin/browser-harness` after `uv run browser-harness --version`.
- `DevToolsActivePort not found`: ask user to enable Chrome remote debugging as above.
- `page_info()` returns JSON with URL/title/viewport: end-to-end local browser control works.
