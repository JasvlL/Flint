import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface ContextSlice {
  files: Record<string, string>;
}

function resolveImportToTsPath(importPath: string): string {
  if (importPath.endsWith(".js")) {
    return importPath.slice(0, -3) + ".ts";
  }
  if (!importPath.endsWith(".ts")) {
    return importPath + ".ts";
  }
  return importPath;
}

/**
 * Returns files explicitly listed in the task that exist, plus one-level-deep
 * expansion of direct relative imports ("./x" or "../x") without duplicates.
 */
export function sliceContext(files: string[]): ContextSlice {
  const result: Record<string, string> = {};
  const initialFiles: string[] = [];

  for (const file of files) {
    if (existsSync(file)) {
      result[file] = readFileSync(file, "utf-8");
      initialFiles.push(file);
    }
  }

  const importRegex = /import\s+.*?\s+from\s+['"](\.\.?\/[^'"]+)['"]/g;

  for (const file of initialFiles) {
    const content = result[file];
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const matches = line.matchAll(importRegex);
      for (const match of matches) {
        const relativeImport = match[1];
        const tsRelativeImport = resolveImportToTsPath(relativeImport);
        const resolvedFile = path
          .join(path.dirname(file), tsRelativeImport)
          .replace(/\\/g, "/");

        const alreadyIncluded =
          resolvedFile in result ||
          resolvedFile.replace(/\//g, "\\") in result;

        if (!alreadyIncluded && existsSync(resolvedFile)) {
          result[resolvedFile] = readFileSync(resolvedFile, "utf-8");
        }
      }
    }
  }

  return { files: result };
}

