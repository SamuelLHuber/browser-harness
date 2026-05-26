import { resolve } from "node:path";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatRunResult, pythonString, runCommand, runHarnessPython, type HarnessRunResult } from "./harness.js";

const DEFAULT_TIMEOUT_MS = 30_000;

function parseBooleanFlag(value: boolean | string | undefined, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

function parsePositiveInt(value: boolean | string | undefined, fallback: number): number {
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getCommand(pi: ExtensionAPI): string {
  const value = pi.getFlag("browser-harness-command");
  return typeof value === "string" && value.trim() ? value.trim() : "browser-harness";
}

function getTimeout(pi: ExtensionAPI, override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) return Math.min(override, 300_000);
  return parsePositiveInt(pi.getFlag("browser-harness-timeout"), DEFAULT_TIMEOUT_MS);
}

function getEnv(pi: ExtensionAPI, buName?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  const defaultBuName = pi.getFlag("browser-harness-bu-name");
  const outputDir = pi.getFlag("browser-harness-output-dir");
  if (typeof defaultBuName === "string" && defaultBuName.trim()) env.BU_NAME = defaultBuName.trim();
  if (buName?.trim()) env.BU_NAME = buName.trim();
  if (typeof outputDir === "string" && outputDir.trim()) env.BH_PI_OUTPUT_DIR = outputDir.trim();
  if (parseBooleanFlag(pi.getFlag("browser-harness-autospawn"), false)) env.BU_AUTOSPAWN = "1";
  if (parseBooleanFlag(pi.getFlag("browser-harness-debug-clicks"), false)) env.BH_DEBUG_CLICKS = "1";
  return env;
}

async function runPython(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  code: string,
  signal?: AbortSignal,
  options?: { timeoutMs?: number; buName?: string },
): Promise<HarnessRunResult> {
  try {
    return await runHarnessPython(code, {
      command: getCommand(pi),
      cwd: ctx.cwd,
      timeoutMs: getTimeout(pi, options?.timeoutMs),
      env: getEnv(pi, options?.buName),
      signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      return {
        stdout: "",
        stderr: `browser-harness not found on PATH. Install it with:\n  uv tool install -e /path/to/browser-harness\nOr set --browser-harness-command to its absolute path.`,
        code: 127,
        killed: false,
      };
    }
    throw error;
  }
}

function toolResult(result: HarnessRunResult, details: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text" as const, text: formatRunResult(result) }],
    details: { ...details, code: result.code, killed: result.killed },
    isError: result.code !== 0,
  };
}

async function updateStatus(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  const result = await runPython(
    pi,
    ctx,
    "import json\ntry:\n    print(json.dumps(page_info()))\nexcept Exception as e:\n    print(json.dumps({'error': str(e)}))\n",
    undefined,
    { timeoutMs: 8_000 },
  );
  if (result.code !== 0) {
    ctx.ui.setStatus("browser-harness", "Browser Harness: disconnected");
    return;
  }
  try {
    const info = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1) || "{}");
    if (info.error) ctx.ui.setStatus("browser-harness", "Browser Harness: error");
    else ctx.ui.setStatus("browser-harness", `Browser Harness: ${info.title || "(untitled)"} | ${info.url || ""}`);
  } catch {
    ctx.ui.setStatus("browser-harness", "Browser Harness: connected");
  }
}

export default function browserHarnessExtension(pi: ExtensionAPI) {
  pi.registerFlag("browser-harness-command", {
    description: "Path or command name for the browser-harness executable. Use an absolute path or .venv/bin/browser-harness when it is not on PATH.",
    type: "string",
    default: "browser-harness",
  });
  pi.registerFlag("browser-harness-timeout", {
    description: "Default timeout, in milliseconds, for browser-harness extension tool calls.",
    type: "string",
    default: String(DEFAULT_TIMEOUT_MS),
  });
  pi.registerFlag("browser-harness-output-dir", {
    description: "Directory for screenshots and other browser artifacts created by the pi extension.",
    type: "string",
    default: ".pi/browser",
  });
  pi.registerFlag("browser-harness-bu-name", {
    description: "Default BU_NAME namespace for browser-harness daemon, socket, and browser session state.",
    type: "string",
    default: "default",
  });
  pi.registerFlag("browser-harness-autospawn", {
    description: "Allow browser-harness to auto-spawn a Browser Use cloud browser when no local CDP endpoint exists and cloud credentials are configured.",
    type: "boolean",
    default: false,
  });
  pi.registerFlag("browser-harness-debug-clicks", {
    description: "Enable browser-harness click debug overlays that save marked screenshots for coordinate-click troubleshooting.",
    type: "boolean",
    default: false,
  });

  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus("browser-harness", "Browser Harness: idle");
  });

  pi.registerCommand("browser", {
    description: "Refresh and show browser-harness connection status for the current real-browser tab",
    handler: async (_args, ctx) => {
      await updateStatus(pi, ctx);
      ctx.ui.notify("Browser Harness status refreshed.", "info");
    },
  });

  pi.registerCommand("browser-doctor", {
    description: "Run browser-harness --doctor to diagnose install, daemon, Chrome remote-debugging, and cloud setup",
    handler: async (_args, ctx) => {
      const doctor = await runCommand(getCommand(pi), ["--doctor"], {
        cwd: ctx.cwd,
        timeoutMs: getTimeout(pi),
        env: getEnv(pi),
      });
      ctx.ui.notify(formatRunResult(doctor), doctor.code === 0 ? "info" : "warning");
    },
  });

  pi.registerCommand("browser-open", {
    description: "Open a URL in a new real-browser tab: /browser-open <url>",
    handler: async (args, ctx) => {
      const url = args.trim();
      if (!url) {
        ctx.ui.notify("Usage: /browser-open <url>", "warning");
        return;
      }
      const result = await runPython(pi, ctx, `new_tab(${pythonString(url)})\nwait_for_load()\nimport json\nprint(json.dumps(page_info()))\n`);
      await updateStatus(pi, ctx).catch(() => undefined);
      ctx.ui.notify(formatRunResult(result), result.code === 0 ? "info" : "warning");
    },
  });

  pi.registerCommand("browser-reload", {
    description: "Stop the browser-harness daemon so the next tool call reconnects with fresh code and browser state",
    handler: async (_args, ctx) => {
      const result = await runPython(pi, ctx, "restart_daemon()\nprint('daemon stopped — will restart fresh on next call')\n");
      ctx.ui.setStatus("browser-harness", "Browser Harness: idle");
      ctx.ui.notify(formatRunResult(result), result.code === 0 ? "info" : "warning");
    },
  });

  pi.registerTool({
    name: "browser_harness",
    label: "Browser Harness",
    description: "Run Python code in browser-harness. Helpers like new_tab, page_info, capture_screenshot, click_at_xy, type_text, press_key, js, cdp, wait_for_load, and wait_for_element are pre-imported.",
    promptSnippet: "Control the user's real Chrome through browser-harness Python/CDP helpers.",
    promptGuidelines: [
      "Use browser_harness for browser automation that benefits from direct CDP control of the user's real Chrome.",
      "Prefer new_tab(url) for first navigation so you do not clobber the user's active tab.",
      "Use capture_screenshot() and coordinate clicks with click_at_xy(x, y) for visible UI work.",
      "Use js(...) or cdp(...) when screenshots and coordinate actions are insufficient.",
    ],
    parameters: Type.Object({
      code: Type.String({ description: "Python code to run. browser-harness helpers are pre-imported." }),
      timeoutMs: Type.Optional(Type.Number({ description: "Timeout in milliseconds, max 300000.", minimum: 100, maximum: 300000 })),
      buName: Type.Optional(Type.String({ description: "Optional BU_NAME namespace for an isolated daemon/session." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await runPython(pi, ctx, params.code, signal, { timeoutMs: params.timeoutMs, buName: params.buName });
      await updateStatus(pi, ctx).catch(() => undefined);
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "browser_harness_doctor",
    label: "Browser Harness Doctor",
    description: "Run browser-harness --doctor to diagnose install, daemon, and browser connection state.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
      const result = await runCommand(getCommand(pi), ["--doctor"], {
        cwd: ctx.cwd,
        timeoutMs: getTimeout(pi),
        env: getEnv(pi),
        signal,
      });
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "browser_harness_page_info",
    label: "Browser Page Info",
    description: "Return current browser page URL, title, viewport, scroll, and page size from browser-harness page_info().",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
      const result = await runPython(pi, ctx, "import json\nprint(json.dumps(page_info()))\n", signal);
      await updateStatus(pi, ctx).catch(() => undefined);
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "browser_harness_new_tab",
    label: "Browser New Tab",
    description: "Open a URL in a new tab in the user's real browser and wait for load.",
    promptSnippet: "Open a URL in a new real-browser tab via browser-harness.",
    parameters: Type.Object({
      url: Type.String({ description: "URL to open." }),
      waitForLoad: Type.Optional(Type.Boolean({ description: "Wait for document.readyState complete. Defaults to true." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const code = `new_tab(${pythonString(params.url)})\n${params.waitForLoad === false ? "" : "wait_for_load()\n"}import json\nprint(json.dumps(page_info()))\n`;
      const result = await runPython(pi, ctx, code, signal);
      await updateStatus(pi, ctx).catch(() => undefined);
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "browser_harness_screenshot",
    label: "Browser Screenshot",
    description: "Capture a screenshot with browser-harness and return the saved PNG path.",
    promptSnippet: "Capture a screenshot of the real browser to inspect visible UI before coordinate clicks.",
    parameters: Type.Object({
      filename: Type.Optional(Type.String({ description: "Optional filename. Relative paths are resolved under --browser-harness-output-dir." })),
      full: Type.Optional(Type.Boolean({ description: "Capture beyond the viewport." })),
      maxDim: Type.Optional(Type.Number({ description: "Optional max image dimension for downscaling." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const outputDir = typeof pi.getFlag("browser-harness-output-dir") === "string" ? pi.getFlag("browser-harness-output-dir") as string : ".pi/browser";
      const filename = params.filename || `screenshot-${Date.now()}.png`;
      const path = resolve(ctx.cwd, outputDir, filename);
      const code = `from pathlib import Path\nPath(${pythonString(path)}).parent.mkdir(parents=True, exist_ok=True)\nprint(capture_screenshot(${pythonString(path)}, full=${params.full ? "True" : "False"}${params.maxDim ? `, max_dim=${Math.floor(params.maxDim)}` : ""}))\n`;
      const result = await runPython(pi, ctx, code, signal);
      return toolResult(result, { path });
    },
  });

  pi.registerTool({
    name: "browser_harness_click_xy",
    label: "Browser Click XY",
    description: "Click viewport coordinates in the current browser tab via browser-harness click_at_xy().",
    promptSnippet: "Click visible browser UI by viewport coordinates after inspecting a screenshot.",
    parameters: Type.Object({
      x: Type.Number({ description: "Viewport X coordinate in CSS pixels." }),
      y: Type.Number({ description: "Viewport Y coordinate in CSS pixels." }),
      button: Type.Optional(Type.String({ description: "Mouse button: left, right, or middle." })),
      clicks: Type.Optional(Type.Number({ description: "Click count. Defaults to 1." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const button = params.button === "right" || params.button === "middle" ? params.button : "left";
      const clicks = Math.max(1, Math.floor(params.clicks ?? 1));
      const code = `click_at_xy(${params.x}, ${params.y}, button=${pythonString(button)}, clicks=${clicks})\nwait(0.3)\nimport json\nprint(json.dumps(page_info()))\n`;
      const result = await runPython(pi, ctx, code, signal);
      await updateStatus(pi, ctx).catch(() => undefined);
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "browser_harness_type_text",
    label: "Browser Type Text",
    description: "Type text at the current focus in the browser via browser-harness type_text().",
    parameters: Type.Object({
      text: Type.String({ description: "Text to type." }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await runPython(pi, ctx, `type_text(${pythonString(params.text)})\n`, signal);
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "browser_harness_press_key",
    label: "Browser Press Key",
    description: "Press a key in the current browser tab via browser-harness press_key().",
    parameters: Type.Object({
      key: Type.String({ description: "Key to press, e.g. Enter, Tab, Escape, ArrowDown, Backspace." }),
      modifiers: Type.Optional(Type.Number({ description: "Modifier bitfield: 1=Alt, 2=Ctrl, 4=Meta/Cmd, 8=Shift." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await runPython(pi, ctx, `press_key(${pythonString(params.key)}, modifiers=${Math.floor(params.modifiers ?? 0)})\n`, signal);
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "browser_harness_js",
    label: "Browser JS",
    description: "Evaluate JavaScript in the current browser tab via browser-harness js().",
    parameters: Type.Object({
      expression: Type.String({ description: "JavaScript expression or statements. Top-level return is supported by browser-harness." }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const code = `import json\n_result = js(${pythonString(params.expression)})\nprint(json.dumps(_result, default=str))\n`;
      const result = await runPython(pi, ctx, code, signal);
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "browser_harness_wait_for_load",
    label: "Browser Wait For Load",
    description: "Wait for the current browser tab document.readyState to become complete.",
    parameters: Type.Object({
      timeout: Type.Optional(Type.Number({ description: "Timeout in seconds. Defaults to 15." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const timeout = typeof params.timeout === "number" && params.timeout > 0 ? params.timeout : 15;
      const result = await runPython(pi, ctx, `print(wait_for_load(timeout=${timeout}))\n`, signal, { timeoutMs: Math.ceil(timeout * 1000 + 2_000) });
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "browser_harness_wait_for_element",
    label: "Browser Wait For Element",
    description: "Wait for a CSS selector to exist or become visible via browser-harness wait_for_element().",
    parameters: Type.Object({
      selector: Type.String({ description: "CSS selector." }),
      timeout: Type.Optional(Type.Number({ description: "Timeout in seconds. Defaults to 10." })),
      visible: Type.Optional(Type.Boolean({ description: "Require the element to be visible." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const timeout = typeof params.timeout === "number" && params.timeout > 0 ? params.timeout : 10;
      const code = `print(wait_for_element(${pythonString(params.selector)}, timeout=${timeout}, visible=${params.visible ? "True" : "False"}))\n`;
      const result = await runPython(pi, ctx, code, signal, { timeoutMs: Math.ceil(timeout * 1000 + 2_000) });
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "browser_harness_tabs",
    label: "Browser Tabs",
    description: "List, switch, create, or close browser tabs via browser-harness.",
    parameters: Type.Object({
      action: Type.String({ description: "One of: list, new, switch, close." }),
      targetId: Type.Optional(Type.String({ description: "Target ID for switch or close." })),
      url: Type.Optional(Type.String({ description: "URL for action=new." })),
      includeChrome: Type.Optional(Type.Boolean({ description: "Include chrome:// and internal tabs when listing." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      let code: string;
      if (params.action === "list") {
        code = `import json\nprint(json.dumps(list_tabs(include_chrome=${params.includeChrome === false ? "False" : "True"})))\n`;
      } else if (params.action === "new") {
        code = `new_tab(${pythonString(params.url || "about:blank")})\nwait_for_load()\nimport json\nprint(json.dumps(page_info()))\n`;
      } else if (params.action === "switch") {
        if (!params.targetId) return { content: [{ type: "text", text: "targetId is required for action=switch" }], details: {}, isError: true };
        code = `switch_tab(${pythonString(params.targetId)})\nimport json\nprint(json.dumps(page_info()))\n`;
      } else if (params.action === "close") {
        code = params.targetId ? `close_tab(${pythonString(params.targetId)})\nprint('closed')\n` : "close_tab()\nprint('closed')\n";
      } else {
        return { content: [{ type: "text", text: "action must be one of: list, new, switch, close" }], details: {}, isError: true };
      }
      const result = await runPython(pi, ctx, code, signal);
      await updateStatus(pi, ctx).catch(() => undefined);
      return toolResult(result);
    },
  });
}
