import type { Difficulty } from "../plan/difficulty.js";

export interface RouteCandidate {
  worker: "agy" | "claude" | "qwen" | "opencode";
  model: string;
}

// Cheapest first. `claude` CLI reserved for last resort (conserves that subscription's quota).
// "qwen" is the CLI engine name (spawns the `qwen` binary), not the model — it's also used to
// reach any OpenAI-compatible endpoint configured in ~/.qwen/settings.json, including DeepSeek
// via OpenRouter (model ids like "deepseek/deepseek-chat"), without installing a separate CLI.
// "opencode" is a separate CLI engine whose "Zen" gateway offers a rotating set of genuinely
// free ("...-free") models, including real DeepSeek V4 Flash, with no API key/account needed —
// it self-reports exact cost per run, so token reporting trusts that over a price table.
// Prices per 1M tokens (input/output): qwen3-coder-flash $0.10/$0.40, qwen3-coder-next
// $0.11/$0.80, deepseek/deepseek-chat via OpenRouter ~$0.14/$0.28 (both far cheaper than
// agy/claude), qwen3-coder-plus $1-$6 (scales with context, no longer "cheap").
// Opus/Fable are never picked automatically — user must request them explicitly in the plan.
//
// FUTURE (not implemented yet): quota-plan-based providers (e.g. a paid Claude/ChatGPT plan
// billed by subscription, not per-token) should become toggleable on/off per-provider so users
// without an active plan don't get routed to something they can't actually use. For now there's
// no such toggle — claude is always a candidate regardless of whether the subscription is active.
const ROUTING_TABLE: Record<Difficulty, RouteCandidate[]> = {
  easy: [
    // Free-tier rosters (OpenRouter's "...:free", opencode's Zen "...-free") shift often —
    // these specific slugs are verified working as of 2026-08-01. If one 404s/changes, check
    // openrouter.ai/models or `opencode models` for current $0 options rather than assuming
    // these still exist.
    { worker: "opencode", model: "opencode/deepseek-v4-flash-free" },
    { worker: "qwen", model: "cohere/north-mini-code:free" },
    { worker: "qwen", model: "qwen3-coder-flash" },
    { worker: "qwen", model: "deepseek/deepseek-chat" },
    { worker: "qwen", model: "qwen3-coder-next" },
    { worker: "agy", model: "gemini-3.5-flash-low" },
    { worker: "agy", model: "gemini-3.6-flash-medium" },
  ],
  medium: [
    { worker: "opencode", model: "opencode/deepseek-v4-flash-free" },
    { worker: "qwen", model: "deepseek/deepseek-chat" },
    { worker: "qwen", model: "qwen3-coder-next" },
    { worker: "agy", model: "gemini-3.6-flash-medium" },
    { worker: "agy", model: "gemini-3.1-pro-high" },
    { worker: "claude", model: "claude-haiku-4-5-20251001" },
  ],
  hard: [
    { worker: "qwen", model: "deepseek/deepseek-r1" },
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
