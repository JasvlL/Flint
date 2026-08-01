import { scoreDifficulty } from "../plan/difficulty.js";
import { runSimpleTask } from "../caveman/filter.js";
import { sliceContext } from "../context/slicer.js";
import { createWorktree, removeWorktree, mergeTaskBranch, deleteTaskBranch } from "../worktree/manager.js";
import { getAdapter } from "../workers/registry.js";
import { pickWorker, countCandidates } from "../workers/router.js";
import { verifyTask } from "../verify/verifier.js";
import { onTokenUsage } from "../reporting/tokenReport.js";
import type { TaskReport } from "../report.js";
import type { AiTask, Plan, Task } from "../plan/schema.js";
import type { FlintEventHandler } from "./events.js";

const MAX_PARALLEL_PER_PHASE = 3;

type Worker = "agy" | "claude" | "qwen" | "opencode";

// Per-run state. mergeQueue used to be a module-level global, which was fine for a one-shot CLI
// but would keep accumulating across runs in a long-lived interactive session.
interface RunContext {
  onEvent: FlintEventHandler;
  mergeQueue: Promise<void>;
}

export async function runPlan(plan: Plan, onEvent: FlintEventHandler): Promise<TaskReport[]> {
  const phases = groupByPhase(plan.tasks);
  const ctx: RunContext = { onEvent, mergeQueue: Promise.resolve() };
  const allReports: TaskReport[] = [];

  // Adapters record token usage deep inside themselves and have no reference to this run, so
  // relay it through tokenReport's listener hook rather than threading onEvent through every
  // adapter signature.
  const unsubscribe = onTokenUsage((entry) =>
    onEvent({
      type: "cost",
      worker: entry.worker,
      model: entry.model,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costUsd: entry.estimatedCostUsd,
    }),
  );

  try {
    onEvent({ type: "run:start", totalTasks: plan.tasks.length, phases: phases.length });

    for (const phaseTasks of phases) {
      onEvent({
        type: "phase:start",
        phase: phaseTasks[0]?.phase ?? "_default",
        taskIds: phaseTasks.map((t) => t.id),
      });
      const reports = await runWithConcurrencyLimit(phaseTasks, MAX_PARALLEL_PER_PHASE, (task) =>
        runTask(task, ctx),
      );
      allReports.push(...reports);
    }

    onEvent({ type: "run:end", reports: allReports });
    return allReports;
  } finally {
    unsubscribe();
  }
}

// Tasks without a phase all land in a single implicit phase, preserving plan order otherwise.
function groupByPhase(tasks: Task[]): Task[][] {
  const byPhase = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = task.phase ?? "_default";
    if (!byPhase.has(key)) byPhase.set(key, []);
    byPhase.get(key)!.push(task);
  }
  return [...byPhase.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, v]) => v);
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

async function runTask(task: Task, ctx: RunContext): Promise<TaskReport> {
  if (task.type === "simple") {
    const result = runSimpleTask(task);
    const report: TaskReport = { id: task.id, type: "simple", status: result.status, reason: result.reason };
    ctx.onEvent({ type: "task:end", taskId: task.id, report });
    return report;
  }
  const report = await runAiTaskWithRouting(task, ctx);
  ctx.onEvent({ type: "task:end", taskId: task.id, report });
  return report;
}

async function runAiTaskWithRouting(task: AiTask, ctx: RunContext): Promise<TaskReport> {
  // Explicit worker/model in the plan is an override — run once, no auto-retry across the routing table.
  if (task.worker) {
    return runAiAttempt(task, task.worker, task.model, ctx, 1, 1);
  }

  const difficulty = scoreDifficulty(task);
  const totalCandidates = countCandidates(difficulty);
  let lastReport: TaskReport | undefined;
  for (let attempt = 0; ; attempt++) {
    const candidate = pickWorker(difficulty, attempt);
    if (!candidate) break;
    lastReport = await runAiAttempt(task, candidate.worker, candidate.model, ctx, attempt + 1, totalCandidates);
    if (lastReport.status === "PASS") return lastReport;
  }
  return lastReport!;
}

async function runAiAttempt(
  task: AiTask,
  worker: Worker,
  model: string | undefined,
  ctx: RunContext,
  attempt: number,
  totalCandidates: number,
): Promise<TaskReport> {
  const worktree = await createWorktree(`${task.id}-${Date.now()}`);
  ctx.onEvent({
    type: "task:attempt",
    taskId: task.id,
    worker,
    model,
    attempt,
    totalCandidates,
    worktreeDir: worktree.dir,
  });

  let runResult;
  let verifyResult;
  try {
    runResult = await getAdapter(worker).run(buildPrompt(task, worktree.dir), worktree.dir, model);
    verifyResult = await verifyTask(worktree.dir, runResult, task.verify?.command);
  } catch (err: any) {
    return { id: task.id, type: "ai", status: "FAILED", reason: err.message, worktreeDir: worktree.dir };
  }

  ctx.onEvent({
    type: "task:verify",
    taskId: task.id,
    status: verifyResult.status,
    reason: verifyResult.reason,
  });

  // FAILED worktrees are kept on disk for manual inspection (per MVP scope); only PASS is cleaned up.
  // Merging touches the shared main branch, so it's serialized across concurrently running tasks.
  // A merge failure (e.g. two subtasks touching the same file) must not crash the whole run —
  // it downgrades this task to FAILED instead, with the worktree kept for inspection.
  if (verifyResult.status === "PASS") {
    let mergeError: Error | undefined;
    ctx.mergeQueue = ctx.mergeQueue.then(async () => {
      try {
        await mergeTaskBranch(worktree);
        await removeWorktree(worktree, true);
        await deleteTaskBranch(worktree);
      } catch (err: any) {
        mergeError = err;
      }
    });
    await ctx.mergeQueue;

    if (mergeError) {
      return {
        id: task.id,
        type: "ai",
        status: "FAILED",
        reason: `[${worker}/${model ?? "default"}] verify passed but merge failed: ${mergeError.message}`,
        worktreeDir: worktree.dir,
      };
    }
    ctx.onEvent({ type: "task:merged", taskId: task.id });
  }

  return {
    id: task.id,
    type: "ai",
    status: verifyResult.status,
    reason: verifyResult.status === "PASS" ? undefined : `[${worker}/${model ?? "default"}] ${verifyResult.reason}`,
    worktreeDir: verifyResult.status === "PASS" ? undefined : worktree.dir,
  };
}

function buildPrompt(task: AiTask, worktreeDir: string): string {
  const contextSlice = sliceContext(task.files);
  const fileBlocks = Object.entries(contextSlice.files).map(
    ([filePath, content]) => `File: ${filePath}\n${content}`,
  );
  const context = fileBlocks.length > 0 ? `${fileBlocks.join("\n\n")}\n\n` : "";

  // Free/cheap models most often fail by describing what they'd do instead of doing it —
  // this directive exists specifically to close that gap, not for tone.
  const directive =
    "IMPORTANT: Actually perform this task now using your file-editing tools. " +
    "Do not describe, plan, or ask for confirmation — write the real files/changes directly. " +
    "When done, briefly confirm which file(s) you created or modified.\n\n";

  // opencode in particular has been observed writing to a stale remembered project instead
  // of the actual cwd it was launched in (same category of bug --new-project fixed for agy,
  // but opencode has no equivalent flag) — spelling out the exact directory costs nothing
  // extra since these calls are free/cheap, and directly targets that failure mode.
  const workdirNotice =
    `IMPORTANT: Your current working directory is exactly: ${worktreeDir}\n` +
    "All file paths in this task are relative to THIS directory only. Do not use any " +
    "other project, workspace, or directory you may remember from a previous session.\n\n";

  return `${directive}${workdirNotice}${context}${task.prompt}`;
}
