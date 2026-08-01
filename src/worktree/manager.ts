import { simpleGit } from "simple-git";
import { existsSync } from "node:fs";
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

  return { taskId, dir, branch };
}

export async function removeWorktree(wt: Worktree, force = false): Promise<void> {
  const args = ["worktree", "remove", wt.dir];
  if (force) args.push("--force");
  await git.raw(args);
}
