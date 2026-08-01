import { spawn } from "node:child_process";
import path from "node:path";
import type { CliAdapter, CliRunResult } from "./cliAdapter.js";
import { recordTokenUsage } from "../reporting/tokenReport.js";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export const qwenAdapter: CliAdapter = {
  name: "qwen",
  run(prompt: string, cwd: string, model?: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CliRunResult> {
    return new Promise((resolve) => {
      // --approval-mode=yolo is required for non-interactive runs to actually write files —
      // without it qwen silently denies write_file/run_shell_command ("Matching deny rule")
      // and just reports back what it *would* do, which verify.ts correctly rejects as no-op.
      const args = ["-p", prompt, "-o", "json", "--approval-mode", "yolo"];
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
        const { text, usage } = parseQwenOutput(stdout);
        if (usage) {
          recordTokenUsage({
            worker: "qwen",
            model,
            taskLabel: path.basename(cwd),
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
          });
        }
        resolve({ exitCode: code, stdout: text ?? stdout, stderr, timedOut });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ exitCode: null, stdout, stderr: stderr + err.message, timedOut });
      });
    });
  },
};

function parseQwenOutput(raw: string): { text?: string; usage?: { input_tokens?: number; output_tokens?: number } } {
  try {
    const events = JSON.parse(raw);
    const result = Array.isArray(events) ? events.find((e) => e.type === "result") : undefined;
    return { text: result?.result, usage: result?.usage };
  } catch {
    return {};
  }
}
