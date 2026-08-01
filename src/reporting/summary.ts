import { promises as fs, existsSync, createReadStream } from "node:fs";
import path from "node:path";
import readline from "node:readline";

export interface TokenUsageRecord {
  timestamp: string;
  worker: string;
  model?: string;
  taskLabel: string;
  inputTokens: number;
  outputTokens: number;
  durationMs?: number;
  estimatedCostUsd: number | null;
}

const DEFAULT_REPORT_DIR = path.resolve("token-reports");

/**
 * Locates all `.jsonl` files in the token-reports directory.
 * If the directory does not exist, returns an empty array.
 * Files are returned in alphabetically (chronologically) sorted order of their absolute paths.
 *
 * @param dirPath Optional custom path to the token reports directory.
 */
export async function locateReportFiles(dirPath: string = DEFAULT_REPORT_DIR): Promise<string[]> {
  if (!existsSync(dirPath)) {
    return [];
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const jsonlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => path.join(dirPath, entry.name));

  return jsonlFiles.sort();
}

/**
 * Streams the token usage records from a single `.jsonl` file line-by-line.
 *
 * @param filePath The absolute or relative path to the `.jsonl` file.
 */
export async function* streamFileEntries(filePath: string): AsyncGenerator<TokenUsageRecord, void, unknown> {
  if (!existsSync(filePath)) {
    return;
  }

  const fileStream = createReadStream(filePath, "utf-8");
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const record = JSON.parse(trimmed) as TokenUsageRecord;
      yield record;
    } catch (error) {
      console.warn(`[Summary] Failed to parse line in ${filePath}:`, trimmed, error);
    }
  }
}

/**
 * Streams token usage records from multiple `.jsonl` files in sequence.
 * If filePaths is not specified, automatically locates all report files in the default directory.
 *
 * @param filePaths Optional list of paths to `.jsonl` files to stream.
 */
export async function* streamAllEntries(filePaths?: string[]): AsyncGenerator<TokenUsageRecord, void, unknown> {
  const paths = filePaths ?? (await locateReportFiles());
  for (const filePath of paths) {
    yield* streamFileEntries(filePath);
  }
}

/**
 * Reads all token usage records from the specified `.jsonl` files into an in-memory array.
 * If filePaths is not specified, automatically reads all report files in the default directory.
 *
 * @param filePaths Optional list of paths to `.jsonl` files to read.
 */
export async function readAllEntries(filePaths?: string[]): Promise<TokenUsageRecord[]> {
  const records: TokenUsageRecord[] = [];
  for await (const record of streamAllEntries(filePaths)) {
    records.push(record);
  }
  return records;
}
