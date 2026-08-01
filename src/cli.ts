#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import App from "./tui/App.js";
import { loadProviders, saveProviders, maskKey, type ProviderName } from "./config/providers.js";
import { loadPlan } from "./plan/loader.js";
import { generatePlanFromGoal } from "./plan/metaPlanner.js";
import { runPlan } from "./engine/orchestrator.js";
import { noopEventHandler } from "./engine/events.js";
import { printReport } from "./report.js";
import { printCostSummary } from "./reporting/summary.js";
import type { Plan } from "./plan/schema.js";

const VALID_PROVIDERS: ProviderName[] = ["opencode", "agy", "claude", "qwen"];

function isKnownProvider(name: string): name is ProviderName {
  return VALID_PROVIDERS.includes(name as ProviderName);
}

const program = new Command();

program
  .name("flint")
  .description("Fleet Manager — hybrid multi-CLI orchestrator");

program
  .command("run")
  .description("Run an existing plan.yml")
  .argument("<planFile>", "path to plan.yml")
  .action(async (planFile: string) => {
    await executeAndReport(loadPlan(planFile));
  });

program
  .command("goal")
  .description("Generate and run a plan from a free-form goal description")
  .argument("<description>", "what you want built, in plain language")
  .action(async (description: string) => {
    await executeAndReport(await generatePlanFromGoal(description));
  });

program
  .command("report")
  .description("Show cost/token usage summary from token-reports")
  .action(() => printCostSummary());

const providersCmd = program
  .command("providers")
  .description("Manage AI provider configuration")
  .action(async () => {
    const providers = await loadProviders();
    for (const [name, config] of Object.entries(providers)) {
      const status = config.enabled ? "enabled" : "disabled";
      const key = maskKey(config.apiKey);
      console.log(`${name}: ${status} ${key}`);
    }
  });

providersCmd
  .command("enable")
  .description("Enable a provider")
  .argument("<name>", "provider name")
  .action(async (name: string) => {
    if (!isKnownProvider(name)) {
      console.error(`Unknown provider: ${name}`);
      process.exit(1);
    }
    const providers = await loadProviders();
    providers[name] = { ...providers[name], enabled: true };
    await saveProviders(providers);
    console.log(`Provider ${name} enabled.`);
  });

providersCmd
  .command("disable")
  .description("Disable a provider")
  .argument("<name>", "provider name")
  .action(async (name: string) => {
    if (!isKnownProvider(name)) {
      console.error(`Unknown provider: ${name}`);
      process.exit(1);
    }
    const providers = await loadProviders();
    providers[name] = { ...providers[name], enabled: false };
    await saveProviders(providers);
    console.log(`Provider ${name} disabled.`);
  });

providersCmd
  .command("set-key")
  .description("Set API key for a provider")
  .argument("<name>", "provider name")
  .argument("<key>", "API key")
  .action(async (name: string, key: string) => {
    if (!isKnownProvider(name)) {
      console.error(`Unknown provider: ${name}`);
      process.exit(1);
    }
    const providers = await loadProviders();
    providers[name] = { ...providers[name], apiKey: key };
    await saveProviders(providers);
    console.log(`API key for ${name} set to ${maskKey(key)}.`);
  });

// Batch mode stays quiet while running and reports at the end, same as before — live progress
// is what the interactive session is for. process.exit lives here, not in the engine, so a
// long-lived session can run many plans without the first one killing the process.
async function executeAndReport(plan: Plan): Promise<void> {
  const reports = await runPlan(plan, noopEventHandler);
  printReport(reports);
  printCostSummary();
  process.exit(reports.some((r) => r.status === "FAILED") ? 1 : 0);
}

if (process.argv.length <= 2) {
  render(React.createElement(App));
} else {
  await program.parseAsync(process.argv);
}

