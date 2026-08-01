import type { Difficulty } from "../plan/difficulty.js";

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
// FUTURE (not implemented yet): quota-plan-based providers (e.g. a paid Claude/ChatGPT plan
// billed by subscription, not per-token) should become toggleable on/off per-provider so users
// without an active plan don't get routed to something they can't actually use. For now there's
// no such toggle — claude is always a candidate regardless of whether the subscription is active.
const ROUTING_TABLE: Record<Difficulty, RouteCandidate[]> = {
  easy: [
    // opencode's Zen free roster shifts — these slugs verified working as of 2026-08-01 via
    // `opencode models --verbose --refresh`. If one 404s, re-run that command for current ids.
    { worker: "opencode", model: "opencode/deepseek-v4-flash-free" },
    { worker: "opencode", model: "opencode/north-mini-code-free" },
    { worker: "opencode", model: "opencode/laguna-s-2.1-free" },
    { worker: "opencode", model: "opencode/ling-3.0-flash-free" },
    { worker: "agy", model: "gemini-3.5-flash-low" },
    { worker: "agy", model: "gemini-3.6-flash-medium" },
  ],
  medium: [
    { worker: "opencode", model: "opencode/deepseek-v4-flash-free" },
    { worker: "opencode", model: "opencode/nemotron-3-ultra-free" },
    { worker: "opencode", model: "opencode/north-mini-code-free" },
    { worker: "agy", model: "gemini-3.6-flash-medium" },
    { worker: "agy", model: "gemini-3.1-pro-high" },
    { worker: "claude", model: "claude-haiku-4-5-20251001" },
  ],
  hard: [
    // nemotron-3-ultra-free has a 1M context window — best free option for large/hard tasks.
    { worker: "opencode", model: "opencode/nemotron-3-ultra-free" },
    { worker: "opencode", model: "opencode/big-pickle" },
    { worker: "agy", model: "gemini-3.1-pro-high" },
    { worker: "claude", model: "claude-haiku-4-5-20251001" },
    { worker: "claude", model: "claude-sonnet-5" },
  ],
};

// attempt is 0-indexed: 0 = first try, 1 = retry after a FAILED verify, etc.
export function pickWorker(difficulty: Difficulty, attempt: number): RouteCandidate | undefined {
  return ROUTING_TABLE[difficulty][attempt];
}
