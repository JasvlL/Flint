import type { AiTask } from "./schema.js";

export type Difficulty = "easy" | "medium" | "hard";

const HARD_KEYWORDS = [
  "refactor", "migration", "migrate", "security", "auth", "encryption",
  "concurren", "race condition", "architecture", "database schema",
];
const EASY_KEYWORDS = [
  "typo", "rename", "comment", "format", "readme", "log message",
];

export function scoreDifficulty(task: AiTask): Difficulty {
  const prompt = task.prompt.toLowerCase();
  const hasHardKeyword = HARD_KEYWORDS.some((kw) => prompt.includes(kw));
  const hasEasyKeyword = EASY_KEYWORDS.some((kw) => prompt.includes(kw));

  if (hasHardKeyword || task.files.length > 5 || task.prompt.length > 600) {
    return "hard";
  }
  if (hasEasyKeyword || (task.files.length === 1 && task.prompt.length < 150)) {
    return "easy";
  }
  return "medium";
}
