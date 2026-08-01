import type { CliAdapter } from "./cliAdapter.js";
import { agyAdapter } from "./agyAdapter.js";
import { claudeAdapter } from "./claudeAdapter.js";
import { qwenAdapter } from "./qwenAdapter.js";
import { opencodeAdapter } from "./opencodeAdapter.js";

const adapters: Record<string, CliAdapter> = {
  agy: agyAdapter,
  claude: claudeAdapter,
  qwen: qwenAdapter,
  opencode: opencodeAdapter,
};

export function getAdapter(worker: string): CliAdapter {
  const adapter = adapters[worker];
  if (!adapter) {
    throw new Error(`no adapter registered for worker "${worker}"`);
  }
  return adapter;
}
