import { spawn } from "node:child_process";
import type { CliAdapter, CliRunResult } from "./cliAdapter.js";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export const claudeAdapter: CliAdapter = {
  name: "claude",
  run(prompt: string, cwd: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CliRunResult> {
    return new Promise((resolve) => {
      const child = spawn(
        "claude",
        ["--print", prompt, "--add-dir", cwd, "--dangerously-skip-permissions"],
        { cwd },
      );

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code, stdout, stderr, timedOut });
      });
    });
  },
};
