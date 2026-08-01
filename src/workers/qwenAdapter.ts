import { spawn } from "node:child_process";
import type { CliAdapter, CliRunResult } from "./cliAdapter.js";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export const qwenAdapter: CliAdapter = {
  name: "qwen",
  run(prompt: string, cwd: string, model?: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CliRunResult> {
    return new Promise((resolve) => {
      // NOTE: --yolo (auto-approve) is the Gemini-CLI-derived convention; not yet confirmed
      // against a real `qwen` install. Verify with a manual smoke test before relying on this
      // in production, same way --new-project was confirmed for agy after it initially failed.
      const args = ["-p", prompt, "--yolo"];
      if (model) args.push("--model", model);
      const child = spawn("qwen", args, { cwd });

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

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ exitCode: null, stdout, stderr: stderr + err.message, timedOut });
      });
    });
  },
};
