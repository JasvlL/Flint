import type { Difficulty } from "../plan/difficulty.js";
import { isProviderEnabled } from "../config/providers.js";

export interface RouteCandidate {
  worker: "agy" | "claude" | "qwen" | "opencode";
  model: string;
}

// Cheapest first. `claude` CLI reserved for last resort (conserves that subscription's quota).
// "opencode" is a CLI engine whose "Zen" gateway offers a rotating set of genuinely free
// ("...-free") models, including real DeepSeek V4 Flash, with NO API key/account needed at all —
// this is the only $0-and-actually-usable option right now, so it's tried first, several times
// over, before falling back to agy/claude (the user's already-funded plans). Full catalog with
// costs/limits for every model investigated, including ones not wired in due to no funding
// (qwen/DashScope, qwen/OpenRouter, Kimi): see docs/model-catalog.md.
// Opus/Fable are never picked automatically — user must request them explicitly in the plan.
//
// Future direction: quota-plan-based providers (e.g. a paid Claude/ChatGPT plan billed by
// subscription, not per-token) could become toggleable per-provider so users without an active
// plan don't get routed to something they can't actually use. The per-provider enabled toggle
// itself (providers.json) is now wired in: pickWorker/countCandidates filter ROUTING_TABLE down
// to enabled providers before indexing/counting, so disabled providers are skipped entirely.
// All 7 of opencode's Zen free models — genuinely $0, so every one of them is tried (each run
// only takes ~10-15s now that the stdin hang is fixed) before ever spending real tokens/quota
// on agy/claude. Order = rough best-for-code guess; roster verified 2026-08-01, re-check with
// `opencode models --verbose --refresh` if one starts 404ing.
const ALL_FREE_OPENCODE: RouteCandidate[] = [
  { worker: "opencode", model: "opencode/deepseek-v4-flash-free" },
  { worker: "opencode", model: "opencode/north-mini-code-free" },
  { worker: "opencode", model: "opencode/laguna-s-2.1-free" },
  { worker: "opencode", model: "opencode/ling-3.0-flash-free" },
  { worker: "opencode", model: "opencode/mimo-v2.5-free" },
  { worker: "opencode", model: "opencode/big-pickle" },
  { worker: "opencode", model: "opencode/nemotron-3-ultra-free" },
];

// nemotron-3-ultra-free has a 1M context window — best free option for large/hard tasks, so it
// goes first when the task is hard specifically (still $0, just reordered).
const ALL_FREE_OPENCODE_HARD: RouteCandidate[] = [
  { worker: "opencode", model: "opencode/nemotron-3-ultra-free" },
  ...ALL_FREE_OPENCODE.filter((c) => c.model !== "opencode/nemotron-3-ultra-free"),
];

const ROUTING_TABLE: Record<Difficulty, RouteCandidate[]> = {
  easy: [
    ...ALL_FREE_OPENCODE,
    { worker: "agy", model: "gemini-3.5-flash-low" },
    { worker: "agy", model: "gemini-3.6-flash-medium" },
  ],
  medium: [
    ...ALL_FREE_OPENCODE,
    { worker: "agy", model: "gemini-3.6-flash-medium" },
    { worker: "agy", model: "gemini-3.1-pro-high" },
    { worker: "claude", model: "claude-haiku-4-5-20251001" },
  ],
  hard: [
    ...ALL_FREE_OPENCODE_HARD,
    { worker: "agy", model: "gemini-3.1-pro-high" },
    { worker: "claude", model: "claude-haiku-4-5-20251001" },
    { worker: "claude", model: "claude-sonnet-5" },
  ],
};

// Filter ROUTING_TABLE down to enabled providers first, then index by attempt — indexing the
// raw array and filtering afterwards would silently skip attempts when a provider is disabled.
// This implements the per-provider toggle (providers.json) previously noted as future work.
function enabledCandidates(difficulty: Difficulty): RouteCandidate[] {
  return ROUTING_TABLE[difficulty].filter((c) => isProviderEnabled(c.worker));
}

// attempt is 0-indexed: 0 = first try, 1 = retry after a FAILED verify, etc.
export function pickWorker(difficulty: Difficulty, attempt: number): RouteCandidate | undefined {
  return enabledCandidates(difficulty)[attempt];
}

// How many candidates a task can burn through before giving up — shown as "attempt 3/7" so
// progress is legible while a task is still cascading down the table.
export function countCandidates(difficulty: Difficulty): number {
  return enabledCandidates(difficulty).length;
}
