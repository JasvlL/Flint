import { spawn } from "node:child_process";
import type { CliAdapter, CliRunResult } from "./cliAdapter.js";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export const agyAdapter: CliAdapter = {
  name: "agy",
  run(prompt: string, cwd: string, model?: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CliRunResult> {
    return new Promise((resolve) => {
      // --new-project forces agy to root itself at cwd. Without it, agy can reuse a stale
      // "active project" from a previous session and write there instead (a real hallucination
      // risk this flag exists specifically to close off) — --add-dir alone only grants extra
      // access, it doesn't change where agy defaults to writing.
      const args = ["--print", prompt, "--new-project", "--add-dir", cwd, "--dangerously-skip-permissions"];
      if (model) args.push("--model", model);
      const child = spawn("agy", args, { cwd });

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
