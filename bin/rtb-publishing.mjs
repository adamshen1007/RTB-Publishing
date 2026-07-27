#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { DEFAULT_MANIFEST, SCHEMA_FILE, TEMPLATE_DIRECTORY, TEMPLATE_OUTPUTS } from "../scripts/generator/constants.mjs";
import { generateKit } from "../scripts/generator/generator.mjs";
import { createManifest, loadManifest, resolveOutputDirectory, serializeManifest } from "../scripts/generator/manifest.mjs";
import { assertRepositoryPath } from "../scripts/generator/paths.mjs";
import { runResearchCommand } from "../scripts/research/cli.mjs";
import { runAgentCommand } from "../scripts/agents/cli.mjs";
import { runPlatformCommand } from "../scripts/platform/cli.mjs";

const HELP = `RTB Publishing Engineering Kit Generator

Usage:
  rtb-publishing create <slug> [options]
  rtb-publishing validate [manifest]
  rtb-publishing generate [manifest] [--dry-run] [--check] [--force]
  rtb-publishing doctor
  rtb-publishing research <command> [options]
  rtb-publishing agent <list|doctor|run|status|review|apply|validate> [options]
  rtb-publishing platform <doctor|index|start|project|root|backup> [options]

Create options:
  --name <text>          Project name
  --description <text>   One-sentence project description
  --owner <text>         Project owner
  --audience <text>      Target audience
  --problem <text>       Problem being solved
  --stage <stage>        discovery, validation, build, launch, or growth
  --output <path>        Project directory (default: projects/<slug>)
  --dry-run              Show actions without writing files
  --force                Replace files after explicit review
  --non-interactive      Fail rather than prompting for missing values`;

function parseArguments(args) {
  const positionals = [];
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    const key = argument.slice(2);
    if (["dry-run", "check", "force", "non-interactive", "help", "json", "confirm"].includes(key)) options[key] = true;
    else {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Option --${key} requires a value.`);
      options[key] = value;
      index += 1;
    }
  }
  return { positionals, options };
}

async function promptForMissing(values, nonInteractive) {
  const questions = [
    ["name", "Project name"],
    ["description", "One-sentence description"],
    ["owner", "Project owner"],
    ["audience", "Target audience"],
    ["problem", "Problem being solved"]
  ];
  const missing = questions.filter(([key]) => !values[key]);
  if (missing.length === 0) return values;
  if (nonInteractive || !input.isTTY) throw new Error(`Missing required create options: ${missing.map(([key]) => `--${key}`).join(", ")}`);
  const prompts = createInterface({ input, output });
  try {
    for (const [key, label] of missing) values[key] = (await prompts.question(`${label}: `)).trim();
  } finally {
    prompts.close();
  }
  return values;
}

function printPlan(result, dryRun = false) {
  console.log(`${dryRun ? "Dry run for" : "Generated"}: ${result.outputDirectory}`);
  for (const file of result.files) console.log(`${file.action.padEnd(9)} ${file.path}`);
}

async function createCommand(slug, options) {
  if (!slug) throw new Error("create requires a lowercase project slug.");
  const values = await promptForMissing({
    slug,
    name: options.name,
    description: options.description,
    owner: options.owner,
    audience: options.audience,
    problem: options.problem,
    stage: options.stage ?? "discovery",
    output: "."
  }, options["non-interactive"]);
  const projectDirectory = resolve(options.output ?? resolve("projects", slug));
  const manifestFile = resolve(projectDirectory, DEFAULT_MANIFEST);
  assertRepositoryPath(projectDirectory, { label: "Create output" });
  if (existsSync(manifestFile) && !options.force) throw new Error(`Manifest already exists: ${manifestFile}`);
  const manifest = createManifest(values);
  if (options["dry-run"]) {
    console.log(`Would create manifest: ${manifestFile}`);
    for (const path of Object.values(TEMPLATE_OUTPUTS)) console.log(`create    ${path}`);
    return;
  }
  mkdirSync(dirname(manifestFile), { recursive: true });
  writeFileSync(manifestFile, serializeManifest(manifest));
  printPlan(generateKit(manifestFile, { force: options.force }));
}

function validateCommand(manifestFile) {
  const loaded = loadManifest(manifestFile);
  const outputDirectory = resolveOutputDirectory(loaded.manifest, loaded.manifestFile);
  console.log(`✓ Valid manifest: ${loaded.manifestFile}`);
  console.log(`✓ Safe output: ${outputDirectory}`);
}

function doctorCommand() {
  const checks = [["Schema", SCHEMA_FILE], ["Templates", TEMPLATE_DIRECTORY], ["Node 24", process.versions.node.startsWith("24.")]];
  let failed = false;
  for (const [label, target] of checks) {
    const valid = typeof target === "boolean" ? target : existsSync(target);
    console.log(`${valid ? "✓" : "✗"} ${label}${typeof target === "string" ? `: ${target}` : ""}`);
    failed ||= !valid;
  }
  if (failed) throw new Error("RTB Publishing doctor found setup problems.");
}

async function main() {
  const { positionals, options } = parseArguments(process.argv.slice(2));
  const [command, subject] = positionals;
  if (!command || command === "help" || options.help) return console.log(HELP);
  if (command === "research") return runResearchCommand(positionals.slice(1), options);
  if (command === "agent") return runAgentCommand(positionals.slice(1), options);
  if (command === "platform") return runPlatformCommand(positionals.slice(1), options);
  if (command === "create") return createCommand(subject, options);
  if (command === "validate") return validateCommand(subject ?? DEFAULT_MANIFEST);
  if (command === "generate") {
    const result = generateKit(subject ?? DEFAULT_MANIFEST, { dryRun: options["dry-run"], check: options.check, force: options.force });
    printPlan(result, options["dry-run"]);
    return;
  }
  if (command === "doctor") return doctorCommand();
  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

main().catch((error) => {
  console.error(`RTB Publishing error: ${error.message}`);
  process.exitCode = 1;
});
