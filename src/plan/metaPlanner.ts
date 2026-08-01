import { spawn, execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { planSchema, type Plan } from "./schema.js";
import { killProcessTree } from "../workers/cliAdapter.js";

// Turns a free-form goal into a structured plan; every task in the resulting plan is then
// routed by difficulty.ts + router.ts without further AI cost.
//
// This is a text-only reasoning call, NOT a task execution — it must NOT reuse the regular
// task adapters (agyAdapter/opencodeAdapter), which run with full file-editing tools enabled
// (--auto/--dangerously-skip-permissions) against the real repo. A real bug hit this exact gap:
// when the user's goal itself described a concrete one-off action ("create file X"), an agentic
// call with tools enabled just performed it immediately, writing into the main repo before any
// worktree isolation existed — then every subsequent real task attempt conflicted with that
// stray file on merge. Fixed by running in an isolated temp directory with NO auto-approve flag,
// so any accidental tool-use attempt is simply denied and the model falls back to answering in text.
const TIMEOUT_MS = 60 * 1000;

let resolvedOpencodeExe: string | undefined;
function resolveOpencodeExe(): string {
  if (resolvedOpencodeExe) return resolvedOpencodeExe;
  const globalRoot = execSync("npm root -g", { encoding: "utf-8" }).trim();
  resolvedOpencodeExe = path.join(globalRoot, "opencode-ai", "bin", "opencode.exe");
  return resolvedOpencodeExe;
}

function runIsolated(command: string, args: string[]): Promise<{ exitCode: number | null; stdout: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const scratchDir = mkdtempSync(path.join(os.tmpdir(), "flint-metaplan-"));
    const child = spawn(command, args, { cwd: scratchDir, stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) killProcessTree(child.pid);
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, timedOut });
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, timedOut });
    });
  });
}

const CANDIDATES = [
  {
    label: "opencode/deepseek-v4-flash-free",
    run: (prompt: string) => {
      const command = process.platform === "win32" ? resolveOpencodeExe() : "opencode";
      // Deliberately no --auto: any attempted tool use is denied by default, keeping this a
      // text-only reasoning call regardless of what the goal text describes.
      return runIsolated(command, ["run", prompt, "--format", "json", "--model", "opencode/deepseek-v4-flash-free"]);
    },
    extractText: (raw: string) => extractOpencodeText(raw),
  },
  {
    label: "agy/gemini-3.5-flash-low",
    run: (prompt: string) =>
      // No --dangerously-skip-permissions here — same reasoning as above, this call should
      // never be able to touch the filesystem even if the model tries.
      runIsolated("agy", ["--print", prompt, "--model", "gemini-3.5-flash-low", "--output-format", "json"]),
    extractText: (raw: string) => extractAgyText(raw),
  },
];

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

export async function generatePlanFromGoal(goal: string): Promise<Plan> {
  const metaPrompt = `Break the following goal into an ordered list of phases (1, 2, 3...) \
and, within each phase, small independent subtasks (ids like "1.1", "1.2"). Respond with \
ONLY a JSON object of the shape {"tasks":[{"id":"1.1","phase":"1","prompt":"...","files":["..."]}]}. \
"files" should list the file paths each subtask is expected to create or modify. This is a \
planning question only — do not attempt to create, edit, or run anything. No prose, no markdown fences.

Goal: ${goal}`;

  let lastError: Error | undefined;
  for (const candidate of CANDIDATES) {
    try {
      const result = await candidate.run(metaPrompt);
      if (result.exitCode !== 0 || result.timedOut) {
        lastError = new Error(`${candidate.label} exited ${result.exitCode} (timedOut=${result.timedOut})`);
        continue;
      }
      const text = candidate.extractText(result.stdout);
      const jsonText = extractJson(text);
      const parsed = rawPlanSchema.safeParse(JSON.parse(jsonText));
      if (!parsed.success) {
        lastError = new Error(`${candidate.label} returned invalid plan structure: ${parsed.error.message}`);
        continue;
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
        lastError = new Error(`generated plan failed schema validation: ${validated.error.message}`);
        continue;
      }
      return validated.data;
    } catch (err: any) {
      lastError = err;
    }
  }

  throw new Error(`meta-planner failed on all candidates: ${lastError?.message}`);
}

function extractOpencodeText(raw: string): string {
  let lastText = raw;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "text" && event.part?.text) lastText = event.part.text;
    } catch {
      // ignore non-JSON lines
    }
  }
  return lastText;
}

function extractAgyText(raw: string): string {
  try {
    return JSON.parse(raw).response ?? raw;
  } catch {
    return raw;
  }
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`no JSON object found in meta-planner output: ${text.slice(0, 300)}`);
  }
  return text.slice(start, end + 1);
}
