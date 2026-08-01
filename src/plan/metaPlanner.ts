import { spawnSync } from "node:child_process";
import { z } from "zod";
import { planSchema, type Plan } from "./schema.js";

// One cheap AI call turns a free-form goal into a structured plan; every task in the
// resulting plan is then routed by difficulty.ts + router.ts without further AI cost.
const CHEAP_MODEL = "gemini-3.5-flash-low";

const rawPlanSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string().min(1),
      phase: z.string().min(1),
      prompt: z.string().min(1),
      files: z.array(z.string()).min(1),
    }),
  ),
});

export function generatePlanFromGoal(goal: string): Plan {
  const metaPrompt = `Break the following goal into an ordered list of phases (1, 2, 3...) \
and, within each phase, small independent subtasks (ids like "1.1", "1.2"). Respond with \
ONLY a JSON object of the shape {"tasks":[{"id":"1.1","phase":"1","prompt":"...","files":["..."]}]}. \
"files" should list the file paths each subtask is expected to create or modify. No prose, no markdown fences.

Goal: ${goal}`;

  const result = spawnSync(
    "agy",
    ["--print", metaPrompt, "--model", CHEAP_MODEL, "--dangerously-skip-permissions"],
    { encoding: "utf-8" },
  );

  if (result.status !== 0) {
    throw new Error(`meta-planner call failed: ${result.stderr || result.error?.message}`);
  }

  const jsonText = extractJson(result.stdout);
  const parsed = rawPlanSchema.safeParse(JSON.parse(jsonText));
  if (!parsed.success) {
    throw new Error(`meta-planner returned invalid plan structure: ${parsed.error.message}`);
  }

  const plan: Plan = {
    tasks: parsed.data.tasks.map((t) => ({
      type: "ai" as const,
      id: t.id,
      phase: t.phase,
      prompt: t.prompt,
      files: t.files,
    })),
  };

  const validated = planSchema.safeParse(plan);
  if (!validated.success) {
    throw new Error(`generated plan failed schema validation: ${validated.error.message}`);
  }
  return validated.data;
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`no JSON object found in meta-planner output: ${text.slice(0, 300)}`);
  }
  return text.slice(start, end + 1);
}
