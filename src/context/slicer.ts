import { existsSync, readFileSync } from "node:fs";

export interface ContextSlice {
  files: Record<string, string>;
}

/**
 * MVP: returns only the files explicitly listed in the task that already exist.
 * Files the task is meant to create are silently skipped (not an error).
 * Import-graph expansion (deps of deps) is deferred to Fase 2.
 */
export function sliceContext(files: string[]): ContextSlice {
  const result: Record<string, string> = {};
  for (const file of files) {
    if (existsSync(file)) {
      result[file] = readFileSync(file, "utf-8");
    }
  }
  return { files: result };
}
