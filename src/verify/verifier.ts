import { execSync } from "node:child_process";
import { simpleGit } from "simple-git";
import type { CliRunResult } from "../workers/cliAdapter.js";

export type VerifyStatus = "PASS" | "FAILED";

export interface VerifyResult {
  status: VerifyStatus;
  reason?: string;
}

const DEFAULT_VERIFY_COMMAND = "npm run build";

export async function verifyTask(
  cwd: string,
  runResult: CliRunResult,
  verifyCommand = DEFAULT_VERIFY_COMMAND,
): Promise<VerifyResult> {
  if (runResult.timedOut) {
    return { status: "FAILED", reason: "worker timed out" };
  }
  if (runResult.exitCode !== 0) {
    return { status: "FAILED", reason: `worker exited with code ${runResult.exitCode}` };
  }

  const git = simpleGit(cwd);
  const status = await git.status();
  const changed = [...status.modified, ...status.created, ...status.not_added, ...status.deleted];
  if (changed.length === 0) {
    return {
      status: "FAILED",
      reason: `no physical file changes detected. worker stdout: ${runResult.stdout.slice(-500)}`,
    };
  }

  try {
    execSync(verifyCommand, { cwd, stdio: "pipe" });
  } catch (err: any) {
    return {
      status: "FAILED",
      reason: `verify command "${verifyCommand}" failed: ${err.message}`,
    };
  }

  return { status: "PASS" };
}
