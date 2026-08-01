export interface CliRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface CliAdapter {
  name: string;
  run(prompt: string, cwd: string, timeoutMs?: number): Promise<CliRunResult>;
}
