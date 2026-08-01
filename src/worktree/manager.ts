import { simpleGit } from "simple-git";
import { existsSync, cpSync } from "node:fs";
import path from "node:path";

export interface Worktree {
  taskId: string;
  dir: string;
  branch: string;
}

const git = simpleGit();

export async function createWorktree(taskId: string): Promise<Worktree> {
  const branch = `flint/${taskId}`;
  const dir = path.resolve("..", `flint-wt-${taskId}`);

  if (existsSync(dir)) {
    throw new Error(`Worktree dir already exists: ${dir}`);
  }

  await git.raw(["worktree", "add", dir, "-b", branch]);

  // Verify commands (e.g. `npm run build`) need node_modules present in the worktree.
  // A symlink/junction to the main repo's node_modules is NOT safe (already learned that one
  // the hard way: `git worktree remove` recursively deletes the worktree and follows the
  // junction, wiping the real node_modules it points to). `npm install` per attempt was safe
  // but slow — a real, independent copy is just as safe (deleting it later only removes the
  // copy) and far faster than resolving/installing from scratch every attempt.
  const mainNodeModules = path.resolve("node_modules");
  if (existsSync(mainNodeModules)) {
    cpSync(mainNodeModules, path.join(dir, "node_modules"), { recursive: true });
  }

  return { taskId, dir, branch };
}

export async function removeWorktree(wt: Worktree, force = false): Promise<void> {
  const args = ["worktree", "remove", wt.dir];
  if (force) args.push("--force");
  await git.raw(args);
}

// Task changes live on wt.branch inside the worktree; a PASS result must be folded
// back into main (or the "done" work never actually lands anywhere).
export async function mergeTaskBranch(wt: Worktree): Promise<void> {
  const wtGit = simpleGit(wt.dir);
  await wtGit.add(["-A"]);
  const status = await wtGit.status();
  if (status.staged.length > 0 || status.files.length > 0) {
    await wtGit.commit(`flint: ${wt.taskId}`);
  }

  await git.raw(["merge", "--no-ff", wt.branch, "-m", `flint: merge ${wt.taskId}`]);

  // Two subtasks touching the same file (a real gap in the meta-planner's file-scoping) can
  // leave the merge conflicted instead of throwing — `git merge` alone doesn't guarantee a
  // clean result. Abort and fail loudly rather than leaving main in a half-merged state.
  const postMergeStatus = await git.status();
  if (postMergeStatus.conflicted.length > 0) {
    await git.raw(["merge", "--abort"]);
    throw new Error(
      `merge conflict on ${postMergeStatus.conflicted.join(", ")} — aborted, main left untouched`,
    );
  }
}

// Must run after removeWorktree — git refuses to delete a branch still checked out by a worktree.
// Force delete: mergeTaskBranch already confirmed a clean, non-conflicted merge, so the "not
// fully merged" advisory that -d can raise here is noise, not a real risk of losing work.
export async function deleteTaskBranch(wt: Worktree): Promise<void> {
  await git.raw(["branch", "-D", wt.branch]);
}
