import { useState, useCallback } from "react";
import { runPlan } from "../engine/orchestrator.js";
import type { FlintEvent } from "../engine/events.js";
import type { Plan } from "../plan/schema.js";

export interface FleetTask {
  id: string;
  status: "pending" | "running" | "pass" | "failed";
  worker?: string;
  model?: string;
  attempt?: number;
  totalCandidates?: number;
  startedAt?: number;
  reason?: string;
}

export function useFleet() {
  const [tasks, setTasks] = useState<FleetTask[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [totalCostUsd, setTotalCostUsd] = useState(0);

  const startRun = useCallback(async (plan: Plan) => {
    setIsRunning(true);
    try {
      await runPlan(plan, (event: FlintEvent) => {
        switch (event.type) {
          case "run:start": {
            setTasks([]);
            setTotalCostUsd(0);
            break;
          }
          case "phase:start": {
            setTasks((prev) => {
              const existingIds = new Set(prev.map((t) => t.id));
              const newTasks = event.taskIds
                .filter((id) => !existingIds.has(id))
                .map((id) => ({ id, status: "pending" as const }));
              return [...prev, ...newTasks];
            });
            break;
          }
          case "task:attempt": {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === event.taskId
                  ? {
                      ...t,
                      status: "running" as const,
                      worker: event.worker,
                      model: event.model,
                      attempt: event.attempt,
                      totalCandidates: event.totalCandidates,
                      startedAt: Date.now(),
                    }
                  : t
              )
            );
            break;
          }
          case "task:end": {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === event.taskId
                  ? {
                      ...t,
                      status: event.report.status === "PASS" ? "pass" : "failed",
                      reason: event.report.reason,
                    }
                  : t
              )
            );
            break;
          }
          case "cost": {
            setTotalCostUsd((prev) => prev + (event.costUsd ?? 0));
            break;
          }
          case "task:verify":
          case "task:merged":
          case "run:end": {
            break;
          }
        }
      });
    } finally {
      setIsRunning(false);
    }
  }, []);

  return { tasks, isRunning, totalCostUsd, startRun };
}