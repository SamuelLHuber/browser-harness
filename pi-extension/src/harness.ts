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

export async function runCommand(command: string, args: string[], options: CommandRunOptions): Promise<HarnessRunResult> {
  return await new Promise<HarnessRunResult>((resolve) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const kill = () => {
      if (killed) return;
      killed = true;
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 5_000).unref();
    };

    const timer = setTimeout(kill, options.timeoutMs);
    timer.unref();

    if (options.signal) {
      if (options.signal.aborted) kill();
      else options.signal.addEventListener("abort", kill, { once: true });
    }

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("error", (error) => {
      clearTimeout(timer);
      resolve({ stdout: "", stderr: error.message, code: 127, killed });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, killed });
    });
  });
}

export async function runHarnessPython(code: string, options: HarnessRunOptions): Promise<HarnessRunResult> {
  return await new Promise<HarnessRunResult>((resolve, reject) => {
    const proc = spawn(options.command, [], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let killed = false;
    let settled = false;

    const finish = (result: HarnessRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const kill = () => {
      if (killed) return;
      killed = true;
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 5_000).unref();
    };

    const timer = setTimeout(kill, options.timeoutMs);
    timer.unref();

    if (options.signal) {
      if (options.signal.aborted) kill();
      else options.signal.addEventListener("abort", kill, { once: true });
    }

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    proc.on("close", (code) => {
      finish({ stdout, stderr, code, killed });
    });

    proc.stdin.end(code);
  });
}

export function formatRunResult(result: HarnessRunResult): string {
  const parts: string[] = [];
  if (result.stdout.trim()) parts.push(result.stdout.trimEnd());
  if (result.stderr.trim()) parts.push(`stderr:\n${result.stderr.trimEnd()}`);
  if (result.code !== 0) parts.push(`exit code: ${result.code}${result.killed ? " (killed)" : ""}`);
  if (parts.length === 0) return result.code === 0 ? "ok" : `exit code: ${result.code}`;
  return parts.join("\n\n");
}

export function pythonString(value: string): string {
  return JSON.stringify(value);
}
