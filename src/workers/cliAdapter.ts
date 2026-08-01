import { execSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";

export interface CliRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface CliAdapter {
  name: string;
  run(prompt: string, cwd: string, model?: string, timeoutMs?: number): Promise<CliRunResult>;
}

// Every prompt is passed as a single command-line argument, and Windows caps a whole command
// line at 32767 chars. sliceContext follows one level of imports, so a task touching a
// well-connected file (cli.ts pulls in the entire engine) can blow past that and fail with a
// bare `spawn ENAMETOOLONG` — which looks like a broken agent, not an oversized prompt.
// Above the threshold the prompt goes into a file the agent reads instead.
const MAX_INLINE_PROMPT_CHARS = 20000;
const PROMPT_FILENAME = ".flint-task-prompt.md";

export interface PreparedPrompt {
  /** What to actually pass on the command line. */
  arg: string;
  /** Must be called once the process exits, BEFORE verification runs. */
  cleanup: () => void;
}

export function preparePrompt(prompt: string, cwd: string): PreparedPrompt {
  if (prompt.length <= MAX_INLINE_PROMPT_CHARS) {
    return { arg: prompt, cleanup: () => {} };
  }

  const promptPath = path.join(cwd, PROMPT_FILENAME);
  writeFileSync(promptPath, prompt, "utf-8");

  return {
    arg:
      `Read the file ${PROMPT_FILENAME} in your current directory. It contains your full ` +
      `task instructions. Follow them exactly, then delete that file when you are done.`,
    // The file lives inside the worktree, where verify.ts checks `git status` for real changes.
    // Left behind, this untracked file would itself register as a change and let a no-op
    // attempt pass verification — exactly the hallucination the check exists to catch.
    cleanup: () => {
      try {
        rmSync(promptPath, { force: true });
      } catch {
        // best effort
      }
    },
  };
}

// child.kill() on a shell:true (Windows .cmd shim) process only kills the cmd.exe wrapper,
// not the actual CLI it launched — the real process (e.g. opencode.exe) is left running
// orphaned. taskkill /T kills the whole tree; plain kill() is fine on other platforms.
export function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
    } catch {
      // already exited — fine
    }
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already exited — fine
    }
  }
}
