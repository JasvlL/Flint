import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type ProviderName = "opencode" | "agy" | "claude" | "qwen";

export interface ProviderConfig {
  enabled: boolean;
  apiKey?: string;
}

export type ProvidersFile = Record<ProviderName, ProviderConfig>;

export const DEFAULT_PROVIDERS: ProvidersFile = {
  opencode: { enabled: true },
  agy: { enabled: true },
  claude: { enabled: true },
  qwen: { enabled: false },
};

const CONFIG_DIR = ".flint";
const CONFIG_FILE = "providers.json";

function getConfigPath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return join(__dirname, "..", "..", CONFIG_DIR, CONFIG_FILE);
}

export async function loadProviders(): Promise<ProvidersFile> {
  const configPath = getConfigPath();
  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content) as Partial<ProvidersFile>;
    const merged: ProvidersFile = { ...DEFAULT_PROVIDERS };
    for (const key of Object.keys(DEFAULT_PROVIDERS) as ProviderName[]) {
      if (parsed[key]) {
        merged[key] = { ...DEFAULT_PROVIDERS[key], ...parsed[key] };
      }
    }
    return merged;
  } catch {
    return DEFAULT_PROVIDERS;
  }
}

export async function saveProviders(config: ProvidersFile): Promise<void> {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);
  try {
    await mkdir(configDir, { recursive: true });
  } catch {
    // directory may already exist
  }
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export function isProviderEnabled(name: string): boolean {
  const providerName = name as ProviderName;
  return DEFAULT_PROVIDERS[providerName]?.enabled ?? false;
}

export function maskKey(apiKey?: string): string {
  if (!apiKey || apiKey.length === 0) {
    return "(not set)";
  }
  const lastFour = apiKey.slice(-4);
  return `...${lastFour}`;
}