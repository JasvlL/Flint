import { spawn, execSync } from "node:child_process";
import path from "node:path";
import { killProcessTree, type CliAdapter, type CliRunResult } from "./cliAdapter.js";
import { recordTokenUsage } from "../reporting/tokenReport.js";

const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000;

// It's free — no cost tradeoff for using the highest reasoning effort each model supports.
// Not every free model has a variant (`opencode models --verbose` shows empty variants for
// big-pickle, mimo-v2.5-free, nemotron-3-ultra-free) — only set --variant where one exists.
const BEST_VARIANT: Record<string, string> = {
  "opencode/deepseek-v4-flash-free": "max",
  "opencode/laguna-s-2.1-free": "high",
  "opencode/ling-3.0-flash-free": "high",
  "opencode/north-mini-code-free": "high",
};

// opencode's npm global install is a .cmd shim on Windows, not a real .exe (unlike agy/claude).
// Resolving and spawning the real binary directly avoids needing shell:true (which routes
// through cmd.exe and can orphan the real process on kill).
let resolvedOpencodeExe: string | undefined;
function resolveOpencodeExe(): string {
  if (resolvedOpencodeExe) return resolvedOpencodeExe;
  const globalRoot = execSync("npm root -g", { encoding: "utf-8" }).trim();
  resolvedOpencodeExe = path.join(globalRoot, "opencode-ai", "bin", "opencode.exe");
  return resolvedOpencodeExe;
}

export const opencodeAdapter: CliAdapter = {
  name: "opencode",
  run(prompt: string, cwd: string, model?: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CliRunResult> {
    return new Promise((resolve) => {
      const args = ["run", prompt, "--auto", "--format", "json"];
      if (model) {
        args.push("--model", model);
        const variant = BEST_VARIANT[model];
        if (variant) args.push("--variant", variant);
      }
      const command = process.platform === "win32" ? resolveOpencodeExe() : "opencode";
      // stdin MUST be "ignore", not the spawn default of an open pipe — opencode.exe waits
      // indefinitely for stdin to close/produce data otherwise, hanging well past when it's
      // actually done (this was the real cause of multi-minute hangs, not the model/network).
      const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

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
        const { text, inputTokens, outputTokens, costUsd } = parseOpencodeOutput(stdout);
        if (inputTokens !== undefined) {
          recordTokenUsage({
            worker: "opencode",
            model,
            taskLabel: path.basename(cwd),
            inputTokens,
            outputTokens: outputTokens ?? 0,
            reportedCostUsd: costUsd,
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

// opencode --format json emits one JSON object per line (NDJSON), not a single blob/array.
function parseOpencodeOutput(
  raw: string,
): { text?: string; inputTokens?: number; outputTokens?: number; costUsd?: number } {
  let lastText: string | undefined;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let sawFinish = false;

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === "text" && event.part?.text) {
      lastText = event.part.text;
    }
    if (event.type === "step_finish" && event.part?.tokens) {
      sawFinish = true;
      inputTokens += event.part.tokens.input ?? 0;
      outputTokens += event.part.tokens.output ?? 0;
      costUsd += event.part.cost ?? 0;
    }
  }

  return sawFinish ? { text: lastText, inputTokens, outputTokens, costUsd } : { text: lastText };
}
