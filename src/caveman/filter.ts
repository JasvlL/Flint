import { readFileSync, writeFileSync } from "node:fs";
import type { SimpleTask } from "../plan/schema.js";

export interface SimpleResult {
  status: "PASS" | "FAILED";
  reason?: string;
}

export function runSimpleTask(task: SimpleTask): SimpleResult {
  switch (task.action) {
    case "regex":
      return runRegex(task);
    case "rename":
      return runRegex(task); // rename is a find/replace of an identifier, same mechanics
    case "format":
      return { status: "FAILED", reason: "format action not implemented in MVP" };
    default:
      return { status: "FAILED", reason: `unknown action: ${task.action}` };
  }
}

function runRegex(task: SimpleTask): SimpleResult {
  if (!task.find || task.replace === undefined) {
    return { status: "FAILED", reason: "find/replace required for this action" };
  }

  const pattern = new RegExp(task.find, "g");

  for (const file of task.files) {
    const original = readFileSync(file, "utf-8");
    const updated = original.replace(pattern, task.replace);
    if (updated === original) {
      return { status: "FAILED", reason: `pattern "${task.find}" not found in ${file}` };
    }
    writeFileSync(file, updated, "utf-8");
  }

  return { status: "PASS" };
}
