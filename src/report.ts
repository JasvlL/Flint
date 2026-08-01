export interface TaskReport {
  id: string;
  type: "simple" | "ai";
  status: "PASS" | "FAILED";
  reason?: string;
  worktreeDir?: string;
}

export function printReport(reports: TaskReport[]): void {
  console.log("\n=== Fleet Manager — Run Report ===");
  for (const r of reports) {
    const line = [
      r.status === "PASS" ? "✔" : "✘",
      r.id,
      `(${r.type})`,
      r.status,
      r.reason ? `— ${r.reason}` : "",
      r.worktreeDir ? `[${r.worktreeDir}]` : "",
    ]
      .filter(Boolean)
      .join(" ");
    console.log(line);
  }
  const passed = reports.filter((r) => r.status === "PASS").length;
  console.log(`\n${passed}/${reports.length} tasks passed.\n`);
}
