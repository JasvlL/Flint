import { spawn } from "node:child_process";
import path from "node:path";
import { preparePrompt, type CliAdapter, type CliRunResult } from "./cliAdapter.js";
import { recordTokenUsage } from "../reporting/tokenReport.js";

const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000;

export const agyAdapter: CliAdapter = {
  name: "agy",
  run(prompt: string, cwd: string, model?: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CliRunResult> {
    return new Promise((resolve) => {
      // --new-project forces agy to root itself at cwd. Without it, agy can reuse a stale
      // "active project" from a previous session and write there instead (a real hallucination
      // risk this flag exists specifically to close off) — --add-dir alone only grants extra
      // access, it doesn't change where agy defaults to writing.
      const prepared = preparePrompt(prompt, cwd);
      const args = [
        "--print", prepared.arg, "--new-project", "--add-dir", cwd,
        "--dangerously-skip-permissions", "--output-format", "json",
      ];
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
        prepared.cleanup();
        const { text, usage } = parseAgyOutput(stdout);
        if (usage) {
          recordTokenUsage({
            worker: "agy",
            model,
            taskLabel: path.basename(cwd),
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
          });
        }
        resolve({ exitCode: code, stdout: text ?? stdout, stderr, timedOut });
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

function parseAgyOutput(raw: string): { text?: string; usage?: { input_tokens?: number; output_tokens?: number } } {
  try {
    const parsed = JSON.parse(raw);
    return { text: parsed.response, usage: parsed.usage };
  } catch {
    return {};
  }
}
