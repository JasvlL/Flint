import type { TaskReport } from "../report.js";

// Live progress events emitted by the orchestrator. The CLI subscribes and prints; the
// interactive TUI subscribes and re-renders. Nothing in the engine writes to stdout itself —
// that's what lets a full-screen terminal UI draw without the engine corrupting it.
export type FlintEvent =
  | { type: "run:start"; totalTasks: number; phases: number }
  | { type: "phase:start"; phase: string; taskIds: string[] }
  | {
      type: "task:attempt";
      taskId: string;
      worker: string;
      model?: string;
      // 1-based for display. A single task can burn through up to 7 routing candidates before
      // giving up, and until now none of that was visible while it was happening.
      attempt: number;
      totalCandidates: number;
      worktreeDir: string;
    }
  | { type: "task:verify"; taskId: string; status: "PASS" | "FAILED"; reason?: string }
  | { type: "task:merged"; taskId: string }
  | { type: "task:end"; taskId: string; report: TaskReport }
  | {
      type: "cost";
      worker: string;
      model?: string;
      inputTokens: number;
      outputTokens: number;
      costUsd: number | null;
    }
  | { type: "run:end"; reports: TaskReport[] };

export type FlintEventHandler = (event: FlintEvent) => void;

// Used where an event sink is optional (e.g. programmatic calls that don't care about progress).
export const noopEventHandler: FlintEventHandler = () => {};
