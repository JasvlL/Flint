import fs from "node:fs";
import path from "node:path";

interface AggregateMetrics {
  runs: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export function printCostSummary(): void {
  const reportDir = path.resolve("token-reports");

  if (!fs.existsSync(reportDir)) {
    console.log("\n=== Cost Summary ===");
    console.log("No token usage reports found (directory 'token-reports' does not exist).");
    return;
  }

  let files: string[] = [];
  try {
    files = fs.readdirSync(reportDir).filter((f) => f.endsWith(".jsonl"));
  } catch (err: any) {
    console.log("\n=== Cost Summary ===");
    console.log(`Failed to read token-reports directory: ${err.message}`);
    return;
  }

  if (files.length === 0) {
    console.log("\n=== Cost Summary ===");
    console.log("No token usage reports found in 'token-reports'.");
    return;
  }

  const workerMap = new Map<string, AggregateMetrics>();
  const modelMap = new Map<string, AggregateMetrics>();

  let totalRuns = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  let hasData = false;

  for (const file of files) {
    const filePath = path.join(reportDir, file);
    let content = "";
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const worker = entry.worker || "unknown";
        const model = entry.model || "default";
        const inputTokens = Number(entry.inputTokens) || 0;
        const outputTokens = Number(entry.outputTokens) || 0;
        const cost = Number(entry.estimatedCostUsd) || 0;

        hasData = true;
        totalRuns++;
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        totalCost += cost;

        // Aggregate by worker
        if (!workerMap.has(worker)) {
          workerMap.set(worker, { runs: 0, inputTokens: 0, outputTokens: 0, cost: 0 });
        }
        const wData = workerMap.get(worker)!;
        wData.runs++;
        wData.inputTokens += inputTokens;
        wData.outputTokens += outputTokens;
        wData.cost += cost;

        // Aggregate by model
        if (!modelMap.has(model)) {
          modelMap.set(model, { runs: 0, inputTokens: 0, outputTokens: 0, cost: 0 });
        }
        const mData = modelMap.get(model)!;
        mData.runs++;
        mData.inputTokens += inputTokens;
        mData.outputTokens += outputTokens;
        mData.cost += cost;
      } catch {
        // Skip invalid lines
      }
    }
  }

  if (!hasData) {
    console.log("\n=== Cost Summary ===");
    console.log("No valid token usage entries found in reports.");
    return;
  }

  // Format and print tables
  const formatNum = (num: number) => num.toLocaleString("en-US");
  const formatCost = (cost: number) => `$${cost.toFixed(6)}`;

  // Worker table rows
  const workerRows: string[][] = [];
  for (const [worker, metrics] of workerMap.entries()) {
    workerRows.push([
      worker,
      formatNum(metrics.runs),
      formatNum(metrics.inputTokens),
      formatNum(metrics.outputTokens),
      formatCost(metrics.cost),
    ]);
  }
  // Sort rows alphabetically by worker name
  workerRows.sort((a, b) => a[0].localeCompare(b[0]));

  // Model table rows
  const modelRows: string[][] = [];
  for (const [model, metrics] of modelMap.entries()) {
    modelRows.push([
      model,
      formatNum(metrics.runs),
      formatNum(metrics.inputTokens),
      formatNum(metrics.outputTokens),
      formatCost(metrics.cost),
    ]);
  }
  // Sort rows alphabetically by model name
  modelRows.sort((a, b) => a[0].localeCompare(b[0]));

  const align: ("left" | "right")[] = ["left", "right", "right", "right", "right"];

  printTable("Token Cost Summary by Worker", ["Worker", "Runs", "Input Tokens", "Output Tokens", "Cost (USD)"], align, workerRows);
  printTable("Token Cost Summary by Model", ["Model", "Runs", "Input Tokens", "Output Tokens", "Cost (USD)"], align, modelRows);

  // Overall totals
  console.log("\n=== Overall Totals ===");
  console.log(`Total Runs:          ${formatNum(totalRuns)}`);
  console.log(`Total Input Tokens:  ${formatNum(totalInputTokens)}`);
  console.log(`Total Output Tokens: ${formatNum(totalOutputTokens)}`);
  console.log(`Total Cost (USD):    ${formatCost(totalCost)}`);
  console.log();
}

function printTable(title: string, headers: string[], align: ("left" | "right")[], rows: string[][]) {
  const colWidths = headers.map((h, i) => {
    return Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0));
  });

  const formatRow = (row: string[]) => {
    return "| " + row.map((val, i) => {
      const width = colWidths[i];
      if (align[i] === "right") {
        return val.padStart(width);
      } else {
        return val.padEnd(width);
      }
    }).join(" | ") + " |";
  };

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
