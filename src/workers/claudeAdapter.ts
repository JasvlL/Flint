import { spawn } from "node:child_process";
import { preparePrompt, type CliAdapter, type CliRunResult } from "./cliAdapter.js";

const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000;

export const claudeAdapter: CliAdapter = {
  name: "claude",
  run(prompt: string, cwd: string, model?: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CliRunResult> {
    return new Promise((resolve) => {
      const prepared = preparePrompt(prompt, cwd);
      const args = ["--print", prepared.arg, "--add-dir", cwd, "--dangerously-skip-permissions"];
      if (model) args.push("--model", model);
      const child = spawn("claude", args, { cwd });

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
        prepared.cleanup();
        resolve({ exitCode: code, stdout, stderr, timedOut });
      });

      // Without this, a missing binary (ENOENT) never fires "close" and the promise hangs
      // forever instead of failing so the router can try the next candidate.
      child.on("error", (err) => {
        clearTimeout(timer);
        prepared.cleanup();
        resolve({ exitCode: null, stdout, stderr: stderr + err.message, timedOut });
      });
    });
  },
};
