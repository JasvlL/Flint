import fs from "node:fs";
import path from "node:path";

export interface AggregateMetrics {
  runs: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface CostSummary {
  byWorker: { name: string; metrics: AggregateMetrics }[];
  byModel: { name: string; metrics: AggregateMetrics }[];
  totals: AggregateMetrics;
  // Set when there's nothing to show; carries the human-readable reason so callers that print
  // can say why, and callers that render a UI can just show an empty state.
  unavailableReason?: string;
}

const emptyMetrics = (): AggregateMetrics => ({ runs: 0, inputTokens: 0, outputTokens: 0, cost: 0 });

// Pure aggregation over the token-reports/*.jsonl files — no printing, so the interactive
// session can render the same numbers without parsing formatted text.
export function collectCostSummary(): CostSummary {
  const empty = (unavailableReason: string): CostSummary => ({
    byWorker: [],
    byModel: [],
    totals: emptyMetrics(),
    unavailableReason,
  });

  const reportDir = path.resolve("token-reports");
  if (!fs.existsSync(reportDir)) {
    return empty("No token usage reports found (directory 'token-reports' does not exist).");
  }

  let files: string[] = [];
  try {
    files = fs.readdirSync(reportDir).filter((f) => f.endsWith(".jsonl"));
  } catch (err: any) {
    return empty(`Failed to read token-reports directory: ${err.message}`);
  }

  if (files.length === 0) {
    return empty("No token usage reports found in 'token-reports'.");
  }

  const workerMap = new Map<string, AggregateMetrics>();
  const modelMap = new Map<string, AggregateMetrics>();
  const totals = emptyMetrics();
  let hasData = false;

  for (const file of files) {
    let content = "";
    try {
      content = fs.readFileSync(path.join(reportDir, file), "utf-8");
    } catch {
      continue;
    }

    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue; // skip invalid lines
      }

      const worker = entry.worker || "unknown";
      const model = entry.model || "default";
      const inputTokens = Number(entry.inputTokens) || 0;
      const outputTokens = Number(entry.outputTokens) || 0;
      const cost = Number(entry.estimatedCostUsd) || 0;

      hasData = true;
      totals.runs++;
      totals.inputTokens += inputTokens;
      totals.outputTokens += outputTokens;
      totals.cost += cost;

      for (const [map, key] of [[workerMap, worker], [modelMap, model]] as const) {
        if (!map.has(key)) map.set(key, emptyMetrics());
        const data = map.get(key)!;
        data.runs++;
        data.inputTokens += inputTokens;
        data.outputTokens += outputTokens;
        data.cost += cost;
      }
    }
  }

  if (!hasData) {
    return empty("No valid token usage entries found in reports.");
  }

  const toSortedList = (map: Map<string, AggregateMetrics>) =>
    [...map.entries()]
      .map(([name, metrics]) => ({ name, metrics }))
      .sort((a, b) => a.name.localeCompare(b.name));

  return { byWorker: toSortedList(workerMap), byModel: toSortedList(modelMap), totals };
}

export function printCostSummary(): void {
  const summary = collectCostSummary();

  if (summary.unavailableReason) {
    console.log("\n=== Cost Summary ===");
    console.log(summary.unavailableReason);
    return;
  }

  const formatNum = (num: number) => num.toLocaleString("en-US");
  const formatCost = (cost: number) => `$${cost.toFixed(6)}`;
  const toRow = ({ name, metrics }: { name: string; metrics: AggregateMetrics }) => [
    name,
    formatNum(metrics.runs),
    formatNum(metrics.inputTokens),
    formatNum(metrics.outputTokens),
    formatCost(metrics.cost),
  ];

  const align: ("left" | "right")[] = ["left", "right", "right", "right", "right"];

  printTable(
    "Token Cost Summary by Worker",
    ["Worker", "Runs", "Input Tokens", "Output Tokens", "Cost (USD)"],
    align,
    summary.byWorker.map(toRow),
  );
  printTable(
    "Token Cost Summary by Model",
    ["Model", "Runs", "Input Tokens", "Output Tokens", "Cost (USD)"],
    align,
    summary.byModel.map(toRow),
  );

  console.log("\n=== Overall Totals ===");
  console.log(`Total Runs:          ${formatNum(summary.totals.runs)}`);
  console.log(`Total Input Tokens:  ${formatNum(summary.totals.inputTokens)}`);
  console.log(`Total Output Tokens: ${formatNum(summary.totals.outputTokens)}`);
  console.log(`Total Cost (USD):    ${formatCost(summary.totals.cost)}`);
  console.log();
}

function printTable(title: string, headers: string[], align: ("left" | "right")[], rows: string[][]) {
  const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)));

  const formatRow = (row: string[]) =>
    "| " +
    row
      .map((val, i) => (align[i] === "right" ? val.padStart(colWidths[i]) : val.padEnd(colWidths[i])))
      .join(" | ") +
    " |";

  const separator = "+-" + colWidths.map((w) => "-".repeat(w)).join("-+-") + "-+";

  console.log(`\n=== ${title} ===`);
  console.log(separator);
  console.log(formatRow(headers));
  console.log(separator);
  for (const row of rows) {
    console.log(formatRow(row));
  }
  console.log(separator);
}
