import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { assertRepositoryPath } from "../generator/paths.mjs";
import { buildResearch } from "./generator.mjs";
import { RECORD_DIRECTORIES, RESEARCH_MANIFEST, RESEARCH_ROOT } from "./constants.mjs";
import { createTopic, loadResearch, serializeResearch, sourceIdsForClaim, validateRecord } from "./model.mjs";

export const RESEARCH_HELP = `RTB Publishing Research Automation

Usage:
  rtb-publishing research create <topic> [options]
  rtb-publishing research add-source <manifest> [options]
  rtb-publishing research validate <manifest>
  rtb-publishing research build <manifest> [--dry-run] [--check] [--force]
  rtb-publishing research status <manifest>
  rtb-publishing research refresh <manifest> --as-of YYYY-MM-DD [--dry-run]`;

function required(options, names) {
  const missing = names.filter((name) => !options[name]);
  if (missing.length) throw new Error(`Missing required options: ${missing.map((name) => `--${name}`).join(", ")}`);
}

function topicPath(subject) {
  if (!subject) throw new Error("A research manifest path is required.");
  return resolve(subject);
}

function createResearch(subject, options) {
  if (!subject) throw new Error("research create requires a lowercase topic ID.");
  required(options, ["title", "question", "owner", "as-of"]);
  const directory = assertRepositoryPath(resolve(options.output ?? resolve(RESEARCH_ROOT, subject)), { label: "Research output" });
  const manifestFile = resolve(directory, RESEARCH_MANIFEST);
  if (existsSync(manifestFile) && !options.force) throw new Error(`Research manifest already exists: ${manifestFile}`);
  const topic = createTopic({
    id: subject,
    title: options.title,
    question: options.question,
    owner: options.owner,
    status: options.status,
    minimumSources: options["minimum-sources"],
    freshnessDays: options["freshness-days"],
    asOf: options["as-of"]
  });
  if (options["dry-run"]) {
    console.log(`Would create research topic: ${manifestFile}`);
    return;
  }
  mkdirSync(directory, { recursive: true });
  for (const name of Object.values(RECORD_DIRECTORIES)) mkdirSync(resolve(directory, name), { recursive: true });
  mkdirSync(resolve(directory, "outputs"), { recursive: true });
  writeFileSync(manifestFile, serializeResearch(topic));
  console.log(`✓ Created research topic: ${manifestFile}`);
}

function addSource(manifestFile, options) {
  required(options, ["id", "type", "source-class", "title", "author", "publisher", "url", "published", "accessed", "summary", "license-note"]);
  const directory = dirname(topicPath(manifestFile));
  assertRepositoryPath(resolve(directory, RESEARCH_MANIFEST), { label: "Research manifest" });
  if (!existsSync(resolve(directory, RESEARCH_MANIFEST))) throw new Error(`Research manifest not found: ${resolve(directory, RESEARCH_MANIFEST)}`);
  const source = validateRecord("source", {
    schemaVersion: 1,
    id: options.id,
    type: options.type,
    sourceClass: options["source-class"],
    title: options.title,
    author: options.author,
    publisher: options.publisher,
    url: options.url,
    published: options.published,
    accessed: options.accessed,
    summary: options.summary,
    licenseNote: options["license-note"]
  });
  const sourceFile = assertRepositoryPath(resolve(directory, RECORD_DIRECTORIES.source, `${source.id}.yaml`), { label: "Source file" });
  if (existsSync(sourceFile) && !options.force) throw new Error(`Source already exists: ${sourceFile}`);
  if (options["dry-run"]) return console.log(`Would write source: ${sourceFile}`);
  mkdirSync(dirname(sourceFile), { recursive: true });
  writeFileSync(sourceFile, serializeResearch(source));
  console.log(`✓ Wrote source: ${sourceFile}`);
}

function printStatus(data) {
  const accepted = data.claims.filter((claim) => claim.status === "accepted");
  const sourceCoverage = new Set(accepted.flatMap((claim) => sourceIdsForClaim(claim, data)));
  const conflicts = new Set(data.claims.flatMap((claim) => claim.contradicts.map((id) => [claim.id, id].sort().join("|"))));
  console.log(`Topic: ${data.topic.topic.title}`);
  console.log(`Status: ${data.topic.research.status}`);
  console.log(`As of: ${data.topic.research.asOf}`);
  console.log(`Sources: ${data.sources.length} (${data.staleSources.length} stale)`);
  console.log(`Evidence: ${data.evidence.length}`);
  console.log(`Claims: ${data.claims.length} (${accepted.length} accepted)`);
  console.log(`Accepted-claim source coverage: ${sourceCoverage.size}`);
  console.log(`Recorded conflicts: ${conflicts.size}`);
}

function refreshResearch(manifestFile, options) {
  required(options, ["as-of"]);
  const data = loadResearch(topicPath(manifestFile));
  const dateProbe = validateRecord("topic", {
    ...data.topic,
    research: { ...data.topic.research, asOf: options["as-of"] }
  });
  const sources = data.sources.map((source) => ({ ...source, accessed: options["as-of"] }));
  if (options["dry-run"]) {
    console.log(`Would refresh ${sources.length} sources and research.asOf to ${options["as-of"]}.`);
    return;
  }
  writeFileSync(data.manifestFile, serializeResearch(dateProbe));
  for (const source of sources) writeFileSync(resolve(data.directory, RECORD_DIRECTORIES.source, `${source.id}.yaml`), serializeResearch(source));
  console.log(`✓ Refreshed ${sources.length} sources and research.asOf to ${options["as-of"]}.`);
}

export function runResearchCommand(positionals, options) {
  const [command, subject] = positionals;
  if (!command || command === "help") return console.log(RESEARCH_HELP);
  if (command === "create") return createResearch(subject, options);
  if (command === "add-source") return addSource(subject, options);
  if (command === "validate") {
    const data = loadResearch(topicPath(subject));
    console.log(`✓ Valid research graph: ${data.sources.length} sources, ${data.evidence.length} evidence records, ${data.claims.length} claims.`);
    if (data.staleSources.length) console.log(`! ${data.staleSources.length} source(s) are stale as of ${data.topic.research.asOf}.`);
    return;
  }
  if (command === "build") {
    const plan = buildResearch(topicPath(subject), { dryRun: options["dry-run"], check: options.check, force: options.force });
    console.log(`${options["dry-run"] ? "Dry run" : options.check ? "Checked" : "Built"}: ${plan.action} ${plan.outputFile}`);
    return;
  }
  if (command === "status") return printStatus(loadResearch(topicPath(subject)));
  if (command === "refresh") return refreshResearch(subject, options);
  throw new Error(`Unknown research command: ${command}\n\n${RESEARCH_HELP}`);
}
