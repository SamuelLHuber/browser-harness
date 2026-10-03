import { spawn } from "node:child_process";

export interface HarnessRunOptions {
  command: string;
  cwd: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}
export interface HarnessRunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  killed: boolean;
}
export interface CommandRunOptions {
  cwd: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

/** Own timers/listeners until close; proc.killed means signal sent, not exited. */
async function runProcess(command: string, args: string[], options: CommandRunOptions, input?: string): Promise<HarnessRunResult> {
  return await new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let killed = false;
    let settled = false;
    let escalation: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      clearTimeout(timer);
      if (escalation !== undefined) clearTimeout(escalation);
      options.signal?.removeEventListener("abort", kill);
    };
    const kill = () => {
      if (killed || settled) return;
      killed = true;
      proc.kill("SIGTERM");
      escalation = setTimeout(() => { if (!settled) proc.kill("SIGKILL"); }, 5000);
      escalation.unref();
    };
    const timer = setTimeout(kill, options.timeoutMs);
    timer.unref();
    proc.stdout!.on("data", data => { stdout += data.toString(); });
    proc.stderr!.on("data", data => { stderr += data.toString(); });
    proc.on("error", error => {
      if (settled) return;
      settled = true;
      cleanup();
      if (input === undefined) resolve({ stdout: "", stderr: error.message, code: 127, killed });
      else reject(error);
    });
    proc.on("close", code => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ stdout, stderr, code, killed });
    });
    // An early child exit can close stdin before all source has been written.
    proc.stdin?.on("error", error => { if ((error as NodeJS.ErrnoException).code !== "EPIPE") stderr += error.message; });
    if (options.signal?.aborted) kill();
    else options.signal?.addEventListener("abort", kill, { once: true });
    if (input !== undefined) proc.stdin!.end(input);
  });
}

export async function runCommand(command: string, args: string[], options: CommandRunOptions): Promise<HarnessRunResult> {
  return await runProcess(command, args, options);
}
export async function runHarnessPython(code: string, options: HarnessRunOptions): Promise<HarnessRunResult> {
  return await runProcess(options.command, [], options, code);
}
export function formatRunResult(result: HarnessRunResult): string {
  const parts: string[] = [];
  if (result.stdout.trim()) parts.push(result.stdout.trimEnd());
  if (result.stderr.trim()) parts.push(`stderr:\n${result.stderr.trimEnd()}`);
  if (result.code !== 0) parts.push(`exit code: ${result.code}${result.killed ? " (killed)" : ""}`);
  if (parts.length === 0) return result.code === 0 ? "ok" : `exit code: ${result.code}`;
  return parts.join("\n\n");
}
export function pythonString(value: string): string { return JSON.stringify(value); }
