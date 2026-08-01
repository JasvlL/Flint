import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { planSchema, type Plan } from "./schema.js";

export function loadPlan(path: string): Plan {
  const raw = readFileSync(path, "utf-8");
  const parsed = load(raw);
  const result = planSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid plan.yml at ${path}:\n${result.error.message}`);
  }
  return result.data;
}
