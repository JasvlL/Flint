import type { Difficulty } from "../plan/difficulty.js";

export interface RouteCandidate {
  worker: "agy" | "claude" | "qwen";
  model: string;
}

// Cheapest first, `claude` CLI reserved for last resort (conserves that subscription's quota).
// Prices are per 1M tokens (input/output): qwen3-coder-flash $0.10/$0.40, qwen3-coder-next
// $0.11/$0.80 (both far cheaper than agy/claude), qwen3-coder-plus $1-$6 (scales with context,
// no longer "cheap" — only worth it ahead of claude for hard tasks).
// Opus/Fable are never picked automatically — user must request them explicitly in the plan.
const ROUTING_TABLE: Record<Difficulty, RouteCandidate[]> = {
  easy: [
    { worker: "qwen", model: "qwen3-coder-flash" },
    { worker: "qwen", model: "qwen3-coder-next" },
    { worker: "agy", model: "gemini-3.5-flash-low" },
    { worker: "agy", model: "gemini-3.6-flash-medium" },
  ],
  medium: [
    { worker: "qwen", model: "qwen3-coder-next" },
    { worker: "agy", model: "gemini-3.6-flash-medium" },
    { worker: "agy", model: "gemini-3.1-pro-high" },
    { worker: "claude", model: "claude-haiku-4-5-20251001" },
  ],
  hard: [
    { worker: "agy", model: "gemini-3.1-pro-high" },
    { worker: "qwen", model: "qwen3-coder-plus" },
    { worker: "claude", model: "claude-haiku-4-5-20251001" },
    { worker: "claude", model: "claude-sonnet-5" },
  ],
};

// attempt is 0-indexed: 0 = first try, 1 = retry after a FAILED verify, etc.
export function pickWorker(difficulty: Difficulty, attempt: number): RouteCandidate | undefined {
  return ROUTING_TABLE[difficulty][attempt];
}
