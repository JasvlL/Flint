#!/usr/bin/env node
import { Command } from "commander";
import { loadPlan } from "./plan/loader.js";
import { generatePlanFromGoal } from "./plan/metaPlanner.js";
import { scoreDifficulty } from "./plan/difficulty.js";
import { runSimpleTask } from "./caveman/filter.js";
import { sliceContext } from "./context/slicer.js";
import { createWorktree, removeWorktree, mergeTaskBranch, deleteTaskBranch } from "./worktree/manager.js";
import { getAdapter } from "./workers/registry.js";
import { pickWorker } from "./workers/router.js";
import { verifyTask } from "./verify/verifier.js";
import { printReport, type TaskReport } from "./report.js";
import { printCostSummary } from "./reporting/summary.js";
import type { AiTask, Plan, Task } from "./plan/schema.js";


const MAX_PARALLEL_PER_PHASE = 3;

const program = new Command();

// Serializes merges into main across concurrently running AI tasks (git can't merge in parallel).
let mergeQueue: Promise<void> = Promise.resolve();

program
  .name("flint")
  .description("Fleet Manager — hybrid multi-CLI orchestrator");

program
  .command("run")
  .description("Run an existing plan.yml")
  .argument("<planFile>", "path to plan.yml")
  .action(async (planFile: string) => {
    const plan = loadPlan(planFile);
    await executePlan(plan);
  });

program
  .command("goal")
  .description("Generate and run a plan from a free-form goal description")
  .argument("<description>", "what you want built, in plain language")
  .action(async (description: string) => {
    const plan = generatePlanFromGoal(description);
    await executePlan(plan);
  });

async function executePlan(plan: Plan): Promise<void> {
  const phases = groupByPhase(plan.tasks);
  const allReports: TaskReport[] = [];

  for (const phaseTasks of phases) {
    const reports = await runWithConcurrencyLimit(phaseTasks, MAX_PARALLEL_PER_PHASE, runTask);
    allReports.push(...reports);
  }

  printReport(allReports);
  printCostSummary();
  process.exit(allReports.some((r) => r.status === "FAILED") ? 1 : 0);
}

// Tasks without a phase all land in a single implicit phase, preserving plan order otherwise.
function groupByPhase(tasks: Task[]): Task[][] {
  const byPhase = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = task.phase ?? "_default";
    if (!byPhase.has(key)) byPhase.set(key, []);
    byPhase.get(key)!.push(task);
  }
  return [...byPhase.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([, v]) => v);
}

async function runWithConcurrencyLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function runTask(task: Task): Promise<TaskReport> {
  if (task.type === "simple") {
    const result = runSimpleTask(task);
    return { id: task.id, type: "simple", status: result.status, reason: result.reason };
  }
  return runAiTaskWithRouting(task);
}

async function runAiTaskWithRouting(task: AiTask): Promise<TaskReport> {
  // Explicit worker/model in the plan is an override — run once, no auto-retry across the routing table.
  if (task.worker) {
    return runAiAttempt(task, task.worker, task.model);
  }

  const difficulty = scoreDifficulty(task);
  let lastReport: TaskReport | undefined;
  for (let attempt = 0; ; attempt++) {
    const candidate = pickWorker(difficulty, attempt);
    if (!candidate) break;
    lastReport = await runAiAttempt(task, candidate.worker, candidate.model);
    if (lastReport.status === "PASS") return lastReport;
  }
  return lastReport!;
}

async function runAiAttempt(task: AiTask, worker: "agy" | "claude" | "qwen" | "opencode", model?: string): Promise<TaskReport> {
  const worktree = await createWorktree(`${task.id}-${Date.now()}`);

  let runResult;
  let verifyResult;
  try {
    sliceContext(task.files); // context reduction pass; adapter invocation uses task.prompt directly in MVP
    runResult = await getAdapter(worker).run(task.prompt, worktree.dir, model);
    verifyResult = await verifyTask(worktree.dir, runResult, task.verify?.command);
  } catch (err: any) {
    return { id: task.id, type: "ai", status: "FAILED", reason: err.message, worktreeDir: worktree.dir };
  }

  // FAILED worktrees are kept on disk for manual inspection (per MVP scope); only PASS is cleaned up.
  // Merging touches the shared main branch, so it's serialized across concurrently running tasks.
  if (verifyResult.status === "PASS") {
    mergeQueue = mergeQueue.then(async () => {
      await mergeTaskBranch(worktree);
      await removeWorktree(worktree, true);
      await deleteTaskBranch(worktree);
    });
    await mergeQueue;
  }

  return {
    id: task.id,
    type: "ai",
    status: verifyResult.status,
    reason: verifyResult.status === "PASS" ? undefined : `[${worker}/${model ?? "default"}] ${verifyResult.reason}`,
    worktreeDir: verifyResult.status === "PASS" ? undefined : worktree.dir,
  };
}

program.parseAsync(process.argv);
