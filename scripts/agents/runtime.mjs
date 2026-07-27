import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { parse } from "yaml";
import { ROOT } from "../lib.mjs";
import { loadResearch, serializeResearch, validateRecord } from "../research/model.mjs";
import { LOCAL_RUN_DIRECTORY } from "./constants.mjs";
import { loadAgentDefinition, validateAgentRecord } from "./model.mjs";
import { PROVIDERS } from "./providers.mjs";
import { assertAllowed, fileDescriptor, matchesAny, repositoryPath, scanPromptInjection, sha256 } from "./security.mjs";

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function filesBelow(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) return [".rtb-publishing", "outputs"].includes(entry.name) ? [] : filesBelow(file);
    return [".yaml", ".yml"].includes(extname(entry.name)) ? [file] : [];
  }).sort();
}

function collectInputs(subject, definition) {
  const subjectPath = assertAllowed(subject, definition.permissions.read, "Agent subject");
  loadResearch(subjectPath.absolute);
  const candidates = [
    ...filesBelow(dirname(subjectPath.absolute)),
    resolve(ROOT, "specs", "008-citation-spec.md"),
    resolve(ROOT, "governance", "policies", "citation-policy.md")
  ];
  const unique = [...new Set(candidates)];
  if (unique.length > definition.limits.maxFiles) throw new Error(`Agent input has ${unique.length} files; limit is ${definition.limits.maxFiles}.`);
  return unique.map((file) => fileDescriptor(file, definition.permissions.read));
}

function verifyProposal(proposal, definition, inputs, checkedAt, runId) {
  const checks = [];
  const add = (name, passed, detail) => checks.push({ name, passed, detail });
  try {
    validateAgentRecord("proposal", proposal, "agent proposal");
    add("schema", true, "Proposal matches the canonical schema.");
  } catch (error) {
    add("schema", false, error.message);
  }
  const identityMatches = proposal.runId === runId;
  add("identity", identityMatches && proposal.agentId === definition.id, identityMatches && proposal.agentId === definition.id ? "Agent identity is present and the agent matches." : "Agent identity does not match.");
  const inputHashes = new Map(inputs.map((input) => [input.path, input.sha256]));
  for (const change of proposal.changes ?? []) {
    let passed = false;
    let detail;
    try {
      const target = assertAllowed(change.path, definition.permissions.propose, "Proposed change");
      passed = inputHashes.get(target.path) === change.expectedHash;
      detail = passed ? `${target.path} is allowlisted and hash-bound.` : `${target.path} hash is not an exact input match.`;
    } catch (error) {
      detail = error.message;
    }
    add(`change:${change.path}`, passed, detail);
  }
  const injectionPaths = scanPromptInjection(inputs);
  add("prompt-injection", injectionPaths.length === 0, injectionPaths.length === 0 ? "No common prompt-injection markers detected." : `Potential untrusted instructions detected in: ${injectionPaths.join(", ")}`);
  return validateAgentRecord("verification", { schemaVersion: 1, runId: proposal.runId, proposalHash: sha256(json(proposal)), valid: checks.every((check) => check.passed), checkedAt, checks });
}

function resolveRunDirectory(runId, output) {
  return repositoryPath(output ?? resolve(LOCAL_RUN_DIRECTORY, runId), "Agent run output").absolute;
}

export async function runAgent(id, options = {}) {
  const { definition } = loadAgentDefinition(id);
  if (definition.status !== "enabled") throw new Error(`Agent ${id} is ${definition.status} and cannot run.`);
  if (!options.subject) throw new Error("agent run requires --subject <research.yaml>.");
  const runId = options.runId ?? `RUN-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const createdAt = options.createdAt ?? new Date().toISOString();
  const provider = options.provider ?? definition.model.provider;
  const model = options.model ?? definition.model.name;
  if (!PROVIDERS[provider]) throw new Error(`Unsupported provider: ${provider}`);
  const inputs = collectInputs(options.subject, definition);
  const estimatedInputTokens = Math.ceil(inputs.reduce((total, input) => total + input.content.length, 0) / 4);
  if (estimatedInputTokens > definition.limits.maxInputTokens) throw new Error(`Estimated input is ${estimatedInputTokens} tokens; limit is ${definition.limits.maxInputTokens}.`);
  const request = validateAgentRecord("run-request", {
    schemaVersion: 1, runId, agentId: id,
    subject: repositoryPath(options.subject).path,
    provider, model, createdAt,
    inputs: inputs.map(({ path, sha256: hash, bytes }) => ({ path, sha256: hash, bytes })),
    limits: definition.limits
  });
  const runDirectory = resolveRunDirectory(runId, options.output);
  if (existsSync(runDirectory) && !options.force) throw new Error(`Agent run already exists: ${relative(ROOT, runDirectory)}. Use --force to replace it.`);
  if (existsSync(runDirectory)) rmSync(runDirectory, { recursive: true });
  mkdirSync(runDirectory, { recursive: true });
  writeFileSync(resolve(runDirectory, "request.json"), json(request));
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), definition.limits.timeoutMs);
  let result;
  let providerError;
  try {
    result = await (options.providerImpl ?? PROVIDERS[provider])({
      definition, request,
      prompt: readFileSync(resolve(ROOT, definition.prompt), "utf8"),
      inputText: inputs.map((input) => `FILE ${input.path}\nSHA256 ${input.sha256}\n${input.content}`).join("\n\n"),
      outputSchema: JSON.parse(readFileSync(resolve(ROOT, definition.outputSchema), "utf8")),
      apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
      pricing: options.pricing,
      fetchImpl: options.fetchImpl,
      signal: controller.signal
    });
  } catch (error) {
    providerError = controller.signal.aborted ? new Error(`Agent run exceeded ${definition.limits.timeoutMs}ms timeout.`) : error;
  } finally {
    clearTimeout(timer);
  }
  if (providerError) {
    const failed = validateAgentRecord("summary", {
      schemaVersion: 1, runId, agentId: id, status: "failed", provider, model,
      startedAt: createdAt, completedAt: options.completedAt ?? new Date().toISOString(),
      durationMs: Date.now() - started,
      usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: null },
      artifacts: ["request.json"], error: providerError.message
    });
    writeFileSync(resolve(runDirectory, "summary.json"), json(failed));
    throw providerError;
  }
  const proposal = result.proposal;
  const verification = verifyProposal(proposal, definition, inputs, createdAt, runId);
  writeFileSync(resolve(runDirectory, "proposal.json"), json(proposal));
  writeFileSync(resolve(runDirectory, "verification.json"), json(verification));
  if (!verification.valid) {
    const failed = validateAgentRecord("summary", {
      schemaVersion: 1, runId, agentId: id, status: "failed", provider, model,
      startedAt: createdAt, completedAt: options.completedAt ?? new Date().toISOString(),
      durationMs: Date.now() - started, usage: result.usage,
      artifacts: ["request.json", "proposal.json", "verification.json"],
      error: "Agent proposal failed deterministic verification."
    });
    writeFileSync(resolve(runDirectory, "summary.json"), json(failed));
    throw new Error(`Agent proposal failed verification; inspect ${relative(ROOT, resolve(runDirectory, "verification.json"))}.`);
  }
  const summary = validateAgentRecord("summary", {
    schemaVersion: 1, runId, agentId: id, status: "proposed", provider, model,
    startedAt: createdAt, completedAt: options.completedAt ?? new Date().toISOString(),
    durationMs: Date.now() - started, usage: result.usage,
    artifacts: ["request.json", "proposal.json", "verification.json"]
  });
  writeFileSync(resolve(runDirectory, "summary.json"), json(summary));
  return { runDirectory, request, proposal, verification, summary };
}

export function inspectRun(runDirectory) {
  const directory = repositoryPath(runDirectory, "Agent run").absolute;
  const read = (name) => JSON.parse(readFileSync(resolve(directory, name), "utf8"));
  const optional = (name) => existsSync(resolve(directory, name)) ? read(name) : undefined;
  return { directory, request: read("request.json"), proposal: optional("proposal.json"), verification: optional("verification.json"), summary: read("summary.json") };
}

export function reviewRun(runDirectory, options = {}) {
  const run = inspectRun(runDirectory);
  if (!run.proposal || !run.verification) throw new Error("A failed run without a verified proposal cannot be reviewed.");
  validateAgentRecord("run-request", run.request);
  validateAgentRecord("proposal", run.proposal);
  validateAgentRecord("verification", run.verification);
  validateAgentRecord("summary", run.summary);
  if (!run.verification.valid) throw new Error("An invalid proposal cannot be reviewed.");
  if (!options.decision || !["approved", "rejected"].includes(options.decision)) throw new Error("agent review requires --decision approved|rejected.");
  if (!options.reviewer) throw new Error("agent review requires --reviewer <name>.");
  if (!options.reviewedAt) throw new Error("agent review requires --reviewed-at <ISO timestamp>.");
  const proposalContent = readFileSync(resolve(run.directory, "proposal.json"), "utf8");
  if (sha256(proposalContent) !== run.verification.proposalHash) throw new Error("Proposal changed after deterministic verification; rerun the agent.");
  const approval = validateAgentRecord("approval", {
    schemaVersion: 1, runId: run.request.runId, decision: options.decision,
    reviewer: options.reviewer, reviewedAt: options.reviewedAt,
    proposalHash: sha256(proposalContent),
    files: run.proposal.changes.map((change) => ({ path: change.path, sha256: change.expectedHash })),
    ...(options.note ? { note: options.note } : {})
  });
  writeFileSync(resolve(run.directory, "approval.json"), json(approval));
  if (options.decision === "rejected") {
    run.summary.status = "rejected";
    run.summary.artifacts = [...new Set([...run.summary.artifacts, "approval.json"])];
    writeFileSync(resolve(run.directory, "summary.json"), json(validateAgentRecord("summary", run.summary)));
  }
  return approval;
}

export function applyRun(runDirectory) {
  const run = inspectRun(runDirectory);
  if (!run.proposal || !run.verification) throw new Error("A failed run has no proposal to apply.");
  const approvalFile = resolve(run.directory, "approval.json");
  if (!existsSync(approvalFile)) throw new Error("No human approval exists for this run.");
  const approval = validateAgentRecord("approval", JSON.parse(readFileSync(approvalFile, "utf8")));
  if (approval.decision !== "approved") throw new Error(`Run is ${approval.decision}; only approved proposals can be applied.`);
  if (sha256(readFileSync(resolve(run.directory, "proposal.json"), "utf8")) !== approval.proposalHash) throw new Error("Approval is stale because the proposal changed.");
  const { definition } = loadAgentDefinition(run.request.agentId);
  const approved = new Map(approval.files.map((file) => [file.path, file.sha256]));
  const originals = new Map();
  for (const change of run.proposal.changes) {
    const target = assertAllowed(change.path, definition.permissions.propose, "Approved change");
    const content = readFileSync(target.absolute, "utf8");
    if (sha256(content) !== change.expectedHash || approved.get(change.path) !== change.expectedHash) throw new Error(`Approval is stale because ${change.path} changed.`);
    const record = parse(content);
    record[change.field] = change.value;
    validateRecord("claim", record, `proposed claim ${change.path}`);
    originals.set(target.absolute, content);
    writeFileSync(target.absolute, serializeResearch(record));
  }
  try {
    loadResearch(resolve(ROOT, run.request.subject));
  } catch (error) {
    for (const [file, content] of originals) writeFileSync(file, content);
    throw new Error(`Applied proposal failed M3 validation and was rolled back: ${error.message}`);
  }
  run.summary.status = "applied";
  run.summary.artifacts = [...new Set([...run.summary.artifacts, "approval.json"])];
  writeFileSync(resolve(run.directory, "summary.json"), json(validateAgentRecord("summary", run.summary)));
  return { changed: originals.size };
}

export function validateRunPackage(runDirectory) {
  const run = inspectRun(runDirectory);
  validateAgentRecord("run-request", run.request);
  validateAgentRecord("summary", run.summary);
  if (run.summary.status !== "failed" || run.proposal) validateAgentRecord("proposal", run.proposal);
  if (run.summary.status !== "failed" || run.verification) validateAgentRecord("verification", run.verification);
  if (run.proposal && run.verification && sha256(readFileSync(resolve(run.directory, "proposal.json"), "utf8")) !== run.verification.proposalHash) {
    throw new Error("Run package proposal does not match its verification hash.");
  }
  if (existsSync(resolve(run.directory, "approval.json"))) validateAgentRecord("approval", JSON.parse(readFileSync(resolve(run.directory, "approval.json"), "utf8")));
  return run;
}
