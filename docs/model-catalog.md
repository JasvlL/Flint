# Model Catalog

Every model/provider found while building Flint's routing table, whether or not it's wired
into `router.ts` yet. Costs and free-tier rosters shift — treat dates below as "last verified",
not permanent.

## Implemented and active

| Provider (worker) | Model | Cost /1M tok (in/out) | Notes |
|---|---|---|---|
| opencode | `opencode/deepseek-v4-flash-free` | $0 / $0 | Real DeepSeek V4 Flash. No account/key needed. 200K context, 128K max output. **Primary free tier — this is what we actually use right now.** |
| opencode | `opencode/north-mini-code-free` | $0 / $0 | Coding-focused. 256K context, 64K max output. |
| opencode | `opencode/nemotron-3-ultra-free` | $0 / $0 | Huge 1M context, 128K max output — good for large-context hard tasks. |
| opencode | `opencode/big-pickle` | $0 / $0 | Stealth/unnamed-lab model. 200K context, 32K max output. |
| opencode | `opencode/laguna-s-2.1-free` | $0 / $0 | 256K context, 32K max output. |
| opencode | `opencode/ling-3.0-flash-free` | $0 / $0 | 262K context, 32K max output. |
| opencode | `opencode/mimo-v2.5-free` | $0 / $0 | Multimodal (image/audio input). 200K context, 32K max output. |
| agy | `gemini-3.5-flash-low` / `-medium` / `-high`, `gemini-3.6-flash-*`, `gemini-3.1-pro-*` | ~$0.075-$5 | Already-paid plan the user has. |
| claude CLI | Haiku 4.5, Sonnet 5 | (subscription, no per-token cost) | Last resort — conserves the user's paid Claude plan quota. |

**Verified 2026-08-01.** `opencode models --verbose --refresh` returns 0 credentials required —
Zen's free roster needs no signup at all, unlike OpenRouter/DashScope.

## Cataloged but not wired in / on hold (no funding right now)

| Provider (worker) | Model | Cost /1M tok (in/out) | Why on hold |
|---|---|---|---|
| qwen (DashScope) | `qwen3-coder-flash` | $0.10 / $0.40 | Needs Alibaba Cloud account + paid balance. |
| qwen (DashScope) | `qwen3-coder-next` | $0.11 / $0.80 | Same. |
| qwen (DashScope) | `qwen3-coder-plus` | $1.00-$6.00 (scales) | Same, and expensive relative to alternatives. |
| qwen (OpenRouter) | `deepseek/deepseek-chat` | $0.14 / $0.28 | OpenRouter account has no credits ("402 Insufficient credits"). |
| qwen (OpenRouter) | `deepseek/deepseek-r1` | $0.435 / $0.87 | Same. |
| qwen (OpenRouter) | `cohere/north-mini-code:free` | $0 / $0 | Works (verified), but OpenRouter's free roster shifts weekly and isn't the priority while opencode covers this need for $0 with zero setup. |
| — | Kimi K2.6 (Moonshot) | $0.95 / $4.00 | Ruled out — most expensive of the researched options, no cost advantage. |
| — | DeepSeek's own CLI ("DeepSeek-TUI") | n/a | Ruled out — no official first-party agent, only unverified community forks with duplicated repo names. Reached DeepSeek instead via OpenRouter/opencode. |

## Not yet researched

Anything else in OpenCode's non-Zen provider list (OpenAI, direct Anthropic, etc. via `opencode providers login`)
hasn't been investigated — those require their own paid API keys, same funding blocker as above.
