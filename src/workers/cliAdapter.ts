import { execSync } from "node:child_process";

export interface CliRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface CliAdapter {
  name: string;
  run(prompt: string, cwd: string, model?: string, timeoutMs?: number): Promise<CliRunResult>;
}

// child.kill() on a shell:true (Windows .cmd shim) process only kills the cmd.exe wrapper,
// not the actual CLI it launched — the real process (e.g. opencode.exe) is left running
// orphaned. taskkill /T kills the whole tree; plain kill() is fine on other platforms.
export function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
    } catch {
      // already exited — fine
    }
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already exited — fine
    }
  }
}
