import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

// $ per 1M tokens (input/output). Only models actually routed through agy/qwen — claude
// is intentionally excluded from token reporting per product decision.
const PRICE_TABLE: Record<string, { input: number; output: number }> = {
  "gemini-3.5-flash-low": { input: 0.075, output: 0.3 },
  "gemini-3.6-flash-medium": { input: 0.15, output: 0.6 },
  "gemini-3.1-pro-high": { input: 1.25, output: 5.0 },
  "qwen3-coder-flash": { input: 0.1, output: 0.4 },
  "qwen3-coder-next": { input: 0.11, output: 0.8 },
  "qwen3-coder-plus": { input: 1.0, output: 5.0 },
  "deepseek/deepseek-chat": { input: 0.14, output: 0.28 },
  "deepseek/deepseek-r1": { input: 0.435, output: 0.87 },
};

export interface TokenUsageEntry {
  worker: string;
  model?: string;
  taskLabel: string;
  inputTokens: number;
  outputTokens: number;
  durationMs?: number;
  // If the CLI itself reports an authoritative cost (e.g. opencode's Zen gateway), pass it
  // through instead of estimating from PRICE_TABLE.
  reportedCostUsd?: number;
}

const REPORT_DIR = path.resolve("token-reports");

export function recordTokenUsage(entry: TokenUsageEntry): void {
  const price = entry.model ? PRICE_TABLE[entry.model] : undefined;
  const estimatedCostUsd = entry.reportedCostUsd ?? (price
    ? (entry.inputTokens / 1_000_000) * price.input + (entry.outputTokens / 1_000_000) * price.output
    : null);

  const { reportedCostUsd, ...rest } = entry;
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...rest,
    estimatedCostUsd,
  });

  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  appendFileSync(file, line + "\n", "utf-8");
}
