<img src="https://raw.githubusercontent.com/browser-use/media/main/browser-harness/banner-ink.svg" alt="Browser Harness" width="100%" />

# Browser Harness ♞

Connect an LLM directly to your real browser with a thin, editable CDP harness. For browser tasks where you need **complete freedom**.

One websocket to Chrome, nothing between. The agent writes what's missing during execution. The harness improves itself every run.

```
  ● agent: wants to upload a file
  │
  ● agent-workspace/agent_helpers.py → helper missing
  │
  ● agent writes it                         agent_helpers.py
  │                                                       + custom helper
  ✓ file uploaded
```

**You will never use the browser again.**

## Setup prompt

Paste into Claude Code or Codex:

```text
Set up https://github.com/browser-use/browser-harness for me.

Read `install.md` and follow the steps to install browser-harness and connect it to my browser.
```

The agent will open `chrome://inspect/#remote-debugging`. Tick the checkbox so the agent can connect to your browser:

<img src="docs/setup-remote-debugging.png" alt="Remote debugging setup" width="520" style="border-radius: 12px;" />

Click Allow when the per-attach popup appears (Chrome 144+):

<img src="docs/allow-remote-debugging.png" alt="Allow remote debugging popup" width="520" style="border-radius: 12px;" />

See [agent-workspace/domain-skills/](agent-workspace/domain-skills/) for example tasks.

## Free Browser Use Cloud browsers

Stealth, sub-agents, or headless deployment.<br>
**Browser Use Cloud free tier: 3 concurrent browsers, proxies, captcha solving, and more. No card required.**

- Grab a key at [cloud.browser-use.com/new-api-key](https://cloud.browser-use.com/new-api-key)
- Or let the agent sign up itself via [docs.browser-use.com/llms.txt](https://docs.browser-use.com/llms.txt) (setup flow + challenge context included).

## Architecture (~1k lines across 4 core files)

- `install.md` — first-time install and browser bootstrap
- `SKILL.md` — day-to-day usage
- `src/browser_harness/` — protected core package
- `agent-workspace/agent_helpers.py` — helper code the agent edits
- `agent-workspace/domain-skills/` — reusable site-specific skills the agent edits

## Contributing

PRs and improvements welcome. The best way to help: **contribute a new domain skill** under [agent-workspace/domain-skills/](agent-workspace/domain-skills/) for a site or task you use often (LinkedIn outreach, ordering on Amazon, filing expenses, etc.). Each skill teaches the agent the selectors, flows, and edge cases it would otherwise have to rediscover.

- **Skills are written by the harness, not by you.** Just run your task with the agent — when it figures something non-obvious out, it files the skill itself (see [SKILL.md](SKILL.md)). Please don't hand-author skill files; agent-generated ones reflect what actually works in the browser.
- Open a PR with the generated `agent-workspace/domain-skills/<site>/` folder — small and focused is great.
- Bug fixes, docs tweaks, and helper improvements are equally welcome.
- Browse existing skills (`github/`, `linkedin/`, `amazon/`, ...) to see the shape.

If you're not sure where to start, open an issue and we'll point you somewhere useful.

## Pi extension

This repository is also a pi package. It exposes browser-harness as pi-native tools while keeping the harness itself as the thin Python/CDP runtime.

Local development:

```bash
npm install
npm run check
pi -e .
```

Install from a checkout or git source:

```bash
pi install /absolute/path/to/browser-harness
# or
pi install git:github.com/browser-use/browser-harness
```

The extension expects the `browser-harness` command to be on PATH. For editable local use:

```bash
uv tool install -e .
```

Main tools:

- `browser_harness` — run arbitrary browser-harness Python with helpers pre-imported
- `browser_harness_doctor` — run `browser-harness --doctor`
- `browser_harness_page_info`
- `browser_harness_new_tab`
- `browser_harness_screenshot`
- `browser_harness_click_xy`
- `browser_harness_type_text`
- `browser_harness_press_key`
- `browser_harness_js`
- `browser_harness_wait_for_load`
- `browser_harness_wait_for_element`
- `browser_harness_tabs`

Commands:

- `/browser-harness`
- `/browser-harness-doctor`
- `/browser-harness-open <url>`
- `/browser-harness-reload`

The commands use a package-specific prefix so this real-browser adapter can coexist with the headless Playwright extension.

Useful flags:

- `--browser-harness-command`
- `--browser-harness-timeout`
- `--browser-harness-output-dir`
- `--browser-harness-bu-name`
- `--browser-harness-autospawn`
- `--browser-harness-debug-clicks`

## Domain skills

Set `BH_DOMAIN_SKILLS=1` to enable [agent-workspace/domain-skills/](agent-workspace/domain-skills/) — community-contributed per-site playbooks `goto_url` surfaces by domain. Contribute via PR.

---

[The Bitter Lesson of Agent Harnesses](https://browser-use.com/posts/bitter-lesson-agent-harnesses) · [Web Agents That Actually Learn](https://browser-use.com/posts/web-agents-that-actually-learn)
