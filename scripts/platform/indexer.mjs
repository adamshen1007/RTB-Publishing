import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { ROOT, listFiles } from "../lib.mjs";
import { loadManifest } from "../generator/manifest.mjs";
import { loadWorkspace, validatePlatformRecord } from "./model.mjs";
import { safePlatformPath } from "./security.mjs";
import { loadResearch } from "../research/model.mjs";
import { WORKSPACE_FILE } from "./constants.mjs";
import { loadEffectiveWorkspace, loadLocalWorkspace } from "./local-state.mjs";
import { safeExternalPath } from "./security.mjs";

function count(directory, predicate) {
  return listFiles(directory, predicate).filter((file) => !relative(directory, file).split(sep).some((part) => part.startsWith("."))).length;
}

function externalFiles(directory, predicate = () => true) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if ([".git", ".env", "node_modules", "build", "dist"].includes(entry.name) || entry.name.startsWith(".env")) continue;
    const file = resolve(directory, entry.name);
    if (lstatSync(file).isSymbolicLink()) continue;
    if (entry.isDirectory()) files.push(...externalFiles(file, predicate));
    else if (predicate(file)) files.push(file);
  }
  return files.sort();
}

function roadmapState() {
  const roadmap = readFileSync(resolve(ROOT, "ROADMAP.md"), "utf8");
  const sections = roadmap.split(/(?=^## M\d+ —)/m);
  const records = sections.map((section) => ({ milestone: section.match(/^## (M\d+) —/m)?.[1], status: section.match(/^\*\*Status:\*\* (.+)$/m)?.[1] })).filter((record) => record.milestone);
  const complete = records.filter((record) => record.status?.startsWith("Complete")).map((record) => record.milestone);
  const nextRecord = records.find((record) => record.status?.startsWith("Next"));
  const m5aPilot = records.find((record) => record.milestone === "M5" && record.status?.includes("M5A"));
  const m5aLabel = m5aPilot?.status?.match(/M5A(?:\.\d+)?/)?.[0];
  const next = nextRecord?.milestone ?? (m5aLabel ? `${m5aLabel} pilot` : "Unscheduled");
  return { complete, next };
}

function repositorySummary(project, workspace) {
  const base = safePlatformPath(project.path, { allowRoot: true });
  const pkg = JSON.parse(readFileSync(resolve(base.absolute, "package.json"), "utf8"));
  const roadmap = roadmapState();
  return {
    schemaVersion: 1, id: project.id, name: "RTB Publishing", description: pkg.description, source: project.source,
    owner: workspace.workspace.owner, stage: "platform", path: base.relative, health: "attention",
    milestone: roadmap.next,
    signals: {
      researchTopics: count(resolve(base.absolute, "research", "topics"), (file) => file.endsWith("research.yaml")),
      agentRuns: count(resolve(base.absolute, "examples", "agent-runs"), (file) => file.endsWith("summary.json")),
      documents: count(resolve(base.absolute, "docs"), (file) => extname(file) === ".md")
    },
    workflows: ["quality-check", "research-validate", "agent-review-fake"],
    nextAction: roadmap.next.startsWith("M5A") ? "Record repeated internal workflows before proposing hosted M5B." : `${roadmap.next} is next; begin with its accepted RFC boundary.`
  };
}

function kitSummary(project) {
  const base = safePlatformPath(project.path);
  const manifestPath = safePlatformPath(resolve(base.absolute, project.manifest));
  const { manifest } = loadManifest(manifestPath.absolute);
  return {
    schemaVersion: 1, id: project.id, name: manifest.project.name, source: project.source,
    description: manifest.project.description, owner: manifest.project.owner,
    stage: manifest.product.stage, path: base.relative, milestone: "Generated kit", health: "healthy",
    signals: { researchTopics: 0, agentRuns: 0, documents: count(base.absolute, (file) => extname(file) === ".md") },
    workflows: ["kit-check"], nextAction: "Review the generated verification plan and choose the next milestone outcome."
  };
}

function externalRepositorySummary(project, workspace, allowedRoots) {
  const base = safeExternalPath(project.path, allowedRoots);
  const pkg = JSON.parse(readFileSync(resolve(base.absolute, "package.json"), "utf8"));
  return {
    schemaVersion: 1,
    id: project.id,
    name: pkg.name ?? project.id,
    description: pkg.description ?? "Allowlisted external repository",
    owner: workspace.workspace.owner,
    source: "local",
    stage: "onboarding",
    path: base.absolute,
    milestone: "Local pilot",
    health: "attention",
    signals: {
      researchTopics: externalFiles(resolve(base.absolute, "research"), (file) => file.endsWith("research.yaml")).length,
      agentRuns: externalFiles(resolve(base.absolute, ".rtb-publishing", "agent-runs"), (file) => file.endsWith("summary.json")).length,
      documents: externalFiles(base.absolute, (file) => extname(file) === ".md").length
    },
    workflows: [],
    nextAction: "Review repository evidence; executable workflows remain disabled for external projects."
  };
}

export function buildWorkspaceIndex(file, localFile) {
  const local = loadLocalWorkspace(localFile);
  const workspace = loadEffectiveWorkspace(file, localFile);
  const projects = workspace.projects.map((project) => validatePlatformRecord("project-summary", project.source === "local" ? externalRepositorySummary(project, workspace, local.allowedRoots) : project.kind === "repository" ? repositorySummary(project, workspace) : kitSummary(project), `project ${project.id}`));
  return { schemaVersion: 1, workspace: workspace.workspace, projects };
}

export class WorkspaceIndex {
  constructor({ file = WORKSPACE_FILE, localFile, now = () => new Date().toISOString() } = {}) { this.file = file; this.localFile = localFile; this.now = now; this.generation = 0; this.current = null; this.lastError = null; this.refresh(); if (!this.current) throw new Error(this.lastError); }
  refresh() {
    try {
      const next = buildWorkspaceIndex(this.file, this.localFile);
      const tracked = [resolve(ROOT, "ROADMAP.md"), resolve(ROOT, "package.json"), resolve(this.file), ...listFiles(resolve(ROOT, "research"), (file) => /\.(ya?ml|json|md)$/.test(file)), ...listFiles(resolve(ROOT, "examples"), (file) => /(rtb-publishing\.project\.yaml|\/(proposal|verification|approval|summary)\.json)$/.test(file))].filter(existsSync);
      const fingerprint = tracked.sort().map((file) => `${file}:${createHash("sha256").update(readFileSync(file)).digest("hex")}`).join("|");
      const hash = createHash("sha256").update(JSON.stringify(next)).update(fingerprint).digest("hex");
      if (hash !== this.hash) { this.current = next; this.hash = hash; this.generation += 1; }
      this.lastError = null;
    } catch (error) { this.lastError = error.message; }
    return { ...this.current, index: { generation: this.generation, indexedAt: this.now(), stale: Boolean(this.lastError), error: this.lastError } };
  }
}

export function researchDetail(projectId) {
  if (projectId !== "rtb-publishing-core") return { topics: [] };
  const topicFiles = listFiles(resolve(ROOT, "research", "topics"), (file) => file.endsWith("research.yaml"));
  return { topics: topicFiles.map((file) => {
    const data = loadResearch(file);
    return { id: data.topic.topic.id, title: data.topic.topic.title, status: data.topic.research.status, asOf: data.topic.research.asOf, sources: data.sources.length, evidence: data.evidence.length, claims: data.claims.length, staleSources: data.staleSources.length, proposedClaims: data.claims.filter((claim) => claim.status === "proposed").length, assumptions: data.claims.filter((claim) => claim.classification === "assumption").length };
  }) };
}

export function agentRunDetail(projectId) {
  if (projectId !== "rtb-publishing-core") return { runs: [] };
  const files = listFiles(resolve(ROOT, "examples", "agent-runs"), (file) => file.endsWith("summary.json"));
  return { runs: files.map((file) => {
    const directory = resolve(file, "..");
    const summary = JSON.parse(readFileSync(file, "utf8"));
    const proposal = JSON.parse(readFileSync(resolve(directory, "proposal.json"), "utf8"));
    const verification = JSON.parse(readFileSync(resolve(directory, "verification.json"), "utf8"));
    const approvalFile = resolve(directory, "approval.json");
    const approval = existsSync(approvalFile) ? JSON.parse(readFileSync(approvalFile, "utf8")) : null;
    return { ...summary, findings: proposal.findings, changes: proposal.changes.length, verified: verification.valid, decision: approval?.decision ?? "pending" };
  }) };
}
