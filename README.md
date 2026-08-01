# Flint (Fleet Manager)

Hybrid multi-model / multi-CLI orchestrator for AI coding agents. Runs cheap deterministic
fixes without burning tokens, slices context down to what's strictly needed, isolates every
AI-driven task in its own `git worktree`, and never trusts an agent's word — every result is
verified against exit codes, physical file diffs, and a build/test command before it reaches
a human.

## Usage

```bash
npm install
npm run build
node dist/cli.js plan.yml
```

See `plan.example.yml` for the plan format. Two task types:

- `type: simple` — deterministic find/replace, runs with zero AI tokens.
- `type: ai` — delegated to a CLI worker (`agy` in this MVP) inside an isolated worktree,
  then verified before being reported as PASS.

## Architecture

- `src/plan/` — plan.yml schema + loader (zod-validated)
- `src/caveman/` — deterministic filter for simple tasks (Pilar 1)
- `src/context/` — context slicing, only sends what's needed (Pilar 2)
- `src/worktree/` — per-task git worktree isolation (Pilar 3)
- `src/workers/` — CLI adapter interface + `agy` implementation
- `src/verify/` — two-level verification: exit code, git status, build command (Pilar 4)
- `src/report.ts` — final run summary
