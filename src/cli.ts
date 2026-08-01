#!/usr/bin/env node
import { Command } from "commander";
import { loadPlan } from "./plan/loader.js";
import { runSimpleTask } from "./caveman/filter.js";
import { sliceContext } from "./context/slicer.js";
import { createWorktree, removeWorktree } from "./worktree/manager.js";
import { agyAdapter } from "./workers/agyAdapter.js";
import { verifyTask } from "./verify/verifier.js";
import { printReport, type TaskReport } from "./report.js";
import type { Task } from "./plan/schema.js";

const program = new Command();

program
  .name("flint")
  .description("Fleet Manager — hybrid multi-CLI orchestrator")
  .argument("<planFile>", "path to plan.yml")
  .action(async (planFile: string) => {
    const plan = loadPlan(planFile);
    const reports = await Promise.all(plan.tasks.map(runTask));
    printReport(reports);
    process.exit(reports.some((r) => r.status === "FAILED") ? 1 : 0);
  });

async function runTask(task: Task): Promise<TaskReport> {
  if (task.type === "simple") {
    const result = runSimpleTask(task);
    return { id: task.id, type: "simple", status: result.status, reason: result.reason };
  }

  const worktree = await createWorktree(task.id);

  let runResult;
  let verifyResult;
  try {
    sliceContext(task.files); // context reduction pass; adapter invocation uses task.prompt directly in MVP
    runResult = await agyAdapter.run(task.prompt, worktree.dir);
    verifyResult = await verifyTask(worktree.dir, runResult, task.verify?.command);
  } catch (err: any) {
    return { id: task.id, type: "ai", status: "FAILED", reason: err.message, worktreeDir: worktree.dir };
  }

  // FAILED worktrees are kept on disk for manual inspection (per MVP scope); only PASS is cleaned up.
  // force=true: verify already confirmed the changes are good, so leftover untracked files shouldn't block cleanup.
  if (verifyResult.status === "PASS") {
    await removeWorktree(worktree, true);
  }

  return {
    id: task.id,
    type: "ai",
    status: verifyResult.status,
    reason: verifyResult.reason,
    worktreeDir: verifyResult.status === "PASS" ? undefined : worktree.dir,
  };
}

program.parseAsync(process.argv);
