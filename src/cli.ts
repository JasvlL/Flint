#!/usr/bin/env node
import { Command } from "commander";
import { loadPlan } from "./plan/loader.js";
import { generatePlanFromGoal } from "./plan/metaPlanner.js";
import { runPlan } from "./engine/orchestrator.js";
import { noopEventHandler } from "./engine/events.js";
import { printReport } from "./report.js";
import { printCostSummary } from "./reporting/summary.js";
import type { Plan } from "./plan/schema.js";

const program = new Command();

program
  .name("flint")
  .description("Fleet Manager — hybrid multi-CLI orchestrator");

program
  .command("run")
  .description("Run an existing plan.yml")
  .argument("<planFile>", "path to plan.yml")
  .action(async (planFile: string) => {
    await executeAndReport(loadPlan(planFile));
  });

program
  .command("goal")
  .description("Generate and run a plan from a free-form goal description")
  .argument("<description>", "what you want built, in plain language")
  .action(async (description: string) => {
    await executeAndReport(await generatePlanFromGoal(description));
  });

program
  .command("report")
  .description("Show cost/token usage summary from token-reports")
  .action(() => printCostSummary());

// Batch mode stays quiet while running and reports at the end, same as before — live progress
// is what the interactive session is for. process.exit lives here, not in the engine, so a
// long-lived session can run many plans without the first one killing the process.
async function executeAndReport(plan: Plan): Promise<void> {
  const reports = await runPlan(plan, noopEventHandler);
  printReport(reports);
  printCostSummary();
  process.exit(reports.some((r) => r.status === "FAILED") ? 1 : 0);
}

program.parseAsync(process.argv);
