import { spawn } from "node:child_process";
import path from "node:path";
import type { CliAdapter, CliRunResult } from "./cliAdapter.js";
import { recordTokenUsage } from "../reporting/tokenReport.js";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export const opencodeAdapter: CliAdapter = {
  name: "opencode",
  run(prompt: string, cwd: string, model?: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CliRunResult> {
    return new Promise((resolve) => {
      const args = ["run", prompt, "--auto", "--format", "json"];
      if (model) args.push("--model", model);
      const child = spawn("opencode", args, { cwd });

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
