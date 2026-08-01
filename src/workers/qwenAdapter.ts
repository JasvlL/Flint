import { spawn, execSync } from "node:child_process";
import path from "node:path";
import { killProcessTree, type CliAdapter, type CliRunResult } from "./cliAdapter.js";
import { recordTokenUsage } from "../reporting/tokenReport.js";

const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000;

// qwen-code is pure JS (no real .exe like agy/claude/opencode) — its npm global install is a
// .cmd shim on Windows. shell:true "works" but Windows buffers the wrapped process's stdout
// through cmd.exe until it exits, and killing the shell can orphan the real process. Spawning
// node directly against the package's actual entry script avoids the shell entirely.
let resolvedQwenEntry: string | undefined;
function resolveQwenEntry(): string {
  if (resolvedQwenEntry) return resolvedQwenEntry;
  const globalRoot = execSync("npm root -g", { encoding: "utf-8" }).trim();
  resolvedQwenEntry = path.join(globalRoot, "@qwen-code", "qwen-code", "cli-entry.js");
  return resolvedQwenEntry;
}

export const qwenAdapter: CliAdapter = {
  name: "qwen",
  run(prompt: string, cwd: string, model?: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CliRunResult> {
    return new Promise((resolve) => {
      // --approval-mode=yolo is required for non-interactive runs to actually write files —
      // without it qwen silently denies write_file/run_shell_command ("Matching deny rule")
      // and just reports back what it *would* do, which verify.ts correctly rejects as no-op.
      const args = ["-p", prompt, "-o", "json", "--approval-mode", "yolo"];
      if (model) args.push("--model", model);
      // stdin MUST be "ignore" — leaving the spawn default (an open pipe) makes CLIs that check
      // for piped stdin input hang indefinitely waiting for it to close (confirmed with opencode;
      // applying the same fix here defensively since qwen-code likely has the same behavior).
      const stdio: ["ignore", "pipe", "pipe"] = ["ignore", "pipe", "pipe"];
      const child =
        process.platform === "win32"
          ? spawn(process.execPath, [resolveQwenEntry(), ...args], { cwd, stdio })
          : spawn("qwen", args, { cwd, stdio });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        if (child.pid) killProcessTree(child.pid);
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
