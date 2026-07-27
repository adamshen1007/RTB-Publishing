import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { parse, stringify } from "yaml";
import { ROOT } from "../scripts/lib.mjs";
import { buildWorkspaceIndex, WorkspaceIndex } from "../scripts/platform/indexer.mjs";
import { JobManager, workflowCommand } from "../scripts/platform/jobs.mjs";
import { loadWorkspace, validatePlatformRecord } from "../scripts/platform/model.mjs";
import { redactLog, safePlatformPath } from "../scripts/platform/security.mjs";
import { createPlatformServer, startPlatform } from "../scripts/platform/server.mjs";
import { addProject, inspectProject, removeProject } from "../scripts/platform/registry.mjs";
import { cleanJobs, diagnostics, pilotStatus, sanitizedJobs, validatePilotSessions } from "../scripts/platform/operations.mjs";
import { allowExternalRoot, importExternalProject, inspectExternalCandidate, loadEffectiveWorkspace, loadLocalWorkspace, removeExternalProject, removeExternalRoot, saveLocalWorkspace } from "../scripts/platform/local-state.mjs";
import { createWorkspaceBackup, restoreWorkspaceBackup } from "../scripts/platform/backups.mjs";

const temporaryRoot = resolve(ROOT, ".tmp");
mkdirSync(temporaryRoot, { recursive: true });
const isolatedLocalFile = resolve(temporaryRoot, "platform-test-local-missing.yaml");
const waitFor = async (predicate) => { for (let index = 0; index < 50; index += 1) { if (predicate()) return; await new Promise((resolvePromise) => setTimeout(resolvePromise, 10)); } throw new Error("Timed out waiting for test state."); };

test("two-project workspace produces deterministic schema-valid summaries", () => {
  const first = buildWorkspaceIndex(undefined, isolatedLocalFile);
  const second = buildWorkspaceIndex(undefined, isolatedLocalFile);
  assert.deepEqual(first, second);
  assert.deepEqual(first.projects.map((project) => project.id), ["rtb-publishing-core", "ai-launch-copilot"]);
  assert.equal(first.projects[0].milestone, "M5A.3 pilot");
  first.projects.forEach((project) => validatePlatformRecord("project-summary", project));
});

test("workspace rejects duplicate projects and missing kit manifests", () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "workspace-"));
  try {
    const base = loadWorkspace();
    base.projects[1].id = base.projects[0].id;
    const file = resolve(directory, "workspace.yaml");
    writeFileSync(file, stringify(base));
    assert.throws(() => loadWorkspace(file), /Duplicate workspace project ID/);
    delete base.projects[1].manifest;
    base.projects[1].id = "kit-two";
    writeFileSync(file, stringify(base));
    assert.throws(() => loadWorkspace(file), /must declare a manifest/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("registry add, inspect, dry-run, and remove never delete projects", () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "registry-"));
  const project = resolve(directory, "third-project");
  cpSync(resolve(ROOT, "examples", "ai-launch-copilot"), project, { recursive: true });
  const workspaceFile = resolve(directory, "workspace.yaml");
  writeFileSync(workspaceFile, stringify(loadWorkspace()));
  try {
    assert.equal(addProject(project, { id: "third-project", file: workspaceFile }).kind, "kit");
    assert.equal(inspectProject("third-project", workspaceFile).path.startsWith(".tmp/"), true);
    removeProject("third-project", { file: workspaceFile, dryRun: true });
    assert.ok(inspectProject("third-project", workspaceFile));
    removeProject("third-project", { file: workspaceFile, confirm: true });
    assert.throws(() => inspectProject("third-project", workspaceFile), /not registered/);
    assert.equal(existsSync(project), true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("external onboarding requires an explicit local allowlist and stays read-only", () => {
  const external = mkdtempSync("/private/tmp/rtb-publishing-external-");
  const localFile = resolve(temporaryRoot, `local-${Date.now()}.yaml`);
  writeFileSync(resolve(external, "package.json"), `${JSON.stringify({ name: "Pilot Project", description: "Local pilot repository" })}\n`);
  writeFileSync(resolve(external, "README.md"), "# Pilot Project\n");
  try {
    const candidate = inspectExternalCandidate(external, { localFile });
    assert.equal(candidate.id, "pilot-project");
    assert.equal(candidate.allowed, false);
    allowExternalRoot(external, { localFile, dryRun: true });
    assert.equal(existsSync(localFile), false);
    assert.throws(() => importExternalProject(external, { localFile }), /not allowlisted/);
    allowExternalRoot(external, { localFile, confirm: true });
    assert.equal(importExternalProject(external, { localFile, dryRun: true }).id, "pilot-project");
    assert.equal(loadLocalWorkspace(localFile).projects.length, 0);
    importExternalProject(external, { localFile });
    const effective = loadEffectiveWorkspace(undefined, localFile);
    assert.equal(effective.projects.length, 3);
    const index = buildWorkspaceIndex(undefined, localFile);
    assert.equal(index.projects.at(-1).source, "local");
    assert.deepEqual(index.projects.at(-1).workflows, []);
    assert.throws(() => removeExternalRoot(external, { localFile, confirm: true }), /Remove projects/);
    removeExternalProject("pilot-project", { localFile, confirm: true });
    removeExternalRoot(external, { localFile, confirm: true });
    assert.equal(existsSync(external), true);
  } finally {
    rmSync(localFile, { force: true });
    rmSync(external, { recursive: true, force: true });
  }
});

test("local workspace backup dry-runs and restores registry state only", () => {
  const external = mkdtempSync("/private/tmp/rtb-publishing-backup-project-");
  const directory = mkdtempSync(resolve(temporaryRoot, "backup-"));
  const localFile = resolve(directory, "local.yaml");
  const output = resolve(directory, "workspace-backup.json");
  writeFileSync(resolve(external, "package.json"), `${JSON.stringify({ name: "backup-project" })}\n`);
  try {
    allowExternalRoot(external, { localFile, confirm: true });
    importExternalProject(external, { localFile });
    const dry = createWorkspaceBackup({ output, localFile, dryRun: true, now: "2026-07-13T10:00:00Z" });
    assert.equal(dry.backup.scope, "local-registry-only");
    assert.equal(existsSync(output), false);
    createWorkspaceBackup({ output, localFile, now: "2026-07-13T10:00:00Z" });
    saveLocalWorkspace({ schemaVersion: 1, allowedRoots: [], projects: [] }, { file: localFile });
    restoreWorkspaceBackup(output, { localFile, dryRun: true });
    assert.equal(loadLocalWorkspace(localFile).projects.length, 0);
    restoreWorkspaceBackup(output, { localFile, confirm: true });
    assert.equal(loadLocalWorkspace(localFile).projects[0].id, "backup-project");
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  }
});

test("live index increments only when canonical state changes", () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "live-index-"));
  const file = resolve(directory, "workspace.yaml");
  const workspace = loadWorkspace();
  writeFileSync(file, stringify(workspace));
  try {
    const index = new WorkspaceIndex({ file, localFile: isolatedLocalFile, now: () => "2026-07-13T09:00:00Z" });
    assert.equal(index.refresh().index.generation, 1);
    workspace.workspace.name = "Changed Working Studio";
    writeFileSync(file, stringify(workspace));
    const refreshed = index.refresh();
    assert.equal(refreshed.index.generation, 2);
    assert.equal(refreshed.workspace.name, "Changed Working Studio");
    writeFileSync(file, "invalid: true\n");
    const stale = index.refresh();
    assert.equal(stale.index.stale, true);
    assert.equal(stale.workspace.name, "Changed Working Studio");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("live index ignores hidden temporary research fixtures", () => {
  const directory = resolve(ROOT, "research", "topics", ".tmp-platform-index-test");
  const fixture = resolve(directory, "research.yaml");
  const index = new WorkspaceIndex({ localFile: isolatedLocalFile, now: () => "2026-07-13T09:00:00Z" });
  try {
    assert.equal(index.refresh().index.generation, 1);
    mkdirSync(directory, { recursive: true });
    writeFileSync(fixture, "fixture: ignored\n");
    assert.equal(index.refresh().index.generation, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("pilot template validates without being claimed as a completed session", () => {
  const template = parse(readFileSync(resolve(ROOT, "pilots", "templates", "session.yaml"), "utf8"));
  assert.doesNotThrow(() => validatePlatformRecord("pilot-session", template));
  assert.equal(template.observations[0].startsWith("Replace this template"), true);
});

test("pilot status reports evidence progress without treating jobs as sessions", () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "pilot-status-"));
  try {
    const empty = pilotStatus(directory);
    assert.equal(empty.sessions.observed, 0);
    assert.equal(empty.decision, "collecting-evidence");
    const tasks = ["setup", "register-project", "inspect-status", "run-workflow", "recover-job"];
    for (let index = 0; index < 10; index += 1) {
      const number = String(index + 1).padStart(3, "0");
      const day = String(index === 9 ? 15 : index + 1).padStart(2, "0");
      writeFileSync(resolve(directory, `PILOT-${number}.yaml`), stringify({ schemaVersion: 1, id: `PILOT-${number}`, date: `2026-07-${day}`, projectId: `project-${index % 3}`, task: tasks[index % tasks.length], outcome: index === 8 ? "blocked" : "completed", durationMinutes: index + 1, observations: ["Sanitized observed fixture."], privacy: "sanitized-no-secrets" }));
    }
    assert.equal(validatePilotSessions(directory), 10);
    const ready = pilotStatus(directory);
    assert.equal(ready.sessions.observed, 10);
    assert.equal(ready.projects.represented, 3);
    assert.equal(ready.dateSpanDays.observed, 14);
    assert.deepEqual(ready.tasks.missing, []);
    assert.equal(ready.automatedCriteriaMet, true);
    assert.equal(ready.decision, "manual-review-required");
    assert.equal(ready.outcomes.blocked, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("platform paths deny escape, secrets, and symbolic links", () => {
  assert.throws(() => safePlatformPath("../outside"), /inside the repository/);
  assert.throws(() => safePlatformPath(".env"), /denied/);
  const target = mkdtempSync(resolve(temporaryRoot, "platform-target-"));
  const link = resolve(temporaryRoot, "platform-link");
  try { symlinkSync(target, link); assert.throws(() => safePlatformPath(link), /symbolic link/); }
  finally { rmSync(link, { force: true }); rmSync(target, { recursive: true, force: true }); }
});

test("workflow allowlist is fixed and logs redact secrets", () => {
  assert.match(workflowCommand("rtb-publishing-core", "research-validate", "JOB-TEST").join(" "), /research validate/);
  assert.throws(() => workflowCommand("rtb-publishing-core", "git-push", "JOB-TEST"), /not allowed/);
  assert.equal(redactLog("authorization=Bearer abc123 password=hunter2"), "authorization=[REDACTED] password=[REDACTED]");
});

test("job records persist terminal state and recover interrupted work", async () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "jobs-"));
  try {
    const manager = new JobManager({ directory, now: () => "2026-07-13T06:00:00Z", executor: async (_command, output) => { output("token=secret-value\ncompleted"); return { exitCode: 0, output: "" }; } });
    const job = manager.create("rtb-publishing-core", "research-validate");
    await waitFor(() => manager.get(job.id).status === "passed");
    assert.doesNotMatch(manager.get(job.id).log, /secret-value/);
    const stored = JSON.parse(readFileSync(resolve(directory, `${job.id}.json`), "utf8"));
    stored.status = "running";
    writeFileSync(resolve(directory, `${job.id}.json`), `${JSON.stringify(stored)}\n`);
    const recovered = new JobManager({ directory, now: () => "2026-07-13T06:05:00Z" });
    assert.equal(recovered.get(job.id).status, "failed");
    assert.match(recovered.get(job.id).log, /restart/);
    assert.equal(recovered.snapshot()[0].progress, "complete");
    assert.match(recovered.snapshot()[0].recoveryHint, /platform stopped/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("running jobs cancel explicitly and reruns retain lineage", async () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "job-cancel-"));
  let finish;
  const executor = async (_command, _output, registerCancel) => new Promise((resolvePromise) => { finish = resolvePromise; registerCancel(() => resolvePromise({ exitCode: 143, output: "terminated" })); });
  try {
    const manager = new JobManager({ directory, executor });
    const job = manager.create("rtb-publishing-core", "research-validate");
    await waitFor(() => manager.get(job.id).status === "running");
    assert.equal(manager.cancel(job.id).status, "cancelled");
    await waitFor(() => manager.active === false);
    const rerun = manager.rerun(job.id);
    assert.equal(rerun.parentJobId, job.id);
    assert.ok(["queued", "running"].includes(rerun.status));
    finish({ exitCode: 0, output: "" });
    await waitFor(() => manager.get(rerun.id).status === "passed");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("diagnostics and exports omit logs while retention supports dry-run", async () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "job-retention-"));
  try {
    const manager = new JobManager({ directory, now: () => "2025-01-01T00:00:00Z", executor: async () => ({ exitCode: 0, output: "password=private" }) });
    manager.create("rtb-publishing-core", "research-validate");
    await waitFor(() => manager.list()[0].status === "passed");
    assert.equal("log" in sanitizedJobs(directory)[0], false);
    assert.equal(diagnostics(directory).jobs.total, 1);
    assert.equal(cleanJobs({ days: 30, dryRun: true, directory, now: Date.parse("2026-01-01T00:00:00Z") }).length, 1);
    assert.equal(sanitizedJobs(directory).length, 1);
    cleanJobs({ days: 30, directory, now: Date.parse("2026-01-01T00:00:00Z") });
    assert.equal(sanitizedJobs(directory).length, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("local API serves state and requires CSRF plus confirmation for jobs", async () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "api-jobs-"));
  const jobs = new JobManager({ directory, executor: async () => ({ exitCode: 0, output: "ok" }) });
  const platform = createPlatformServer({ jobs, csrfToken: "test-csrf", localFile: isolatedLocalFile });
  await new Promise((resolvePromise) => platform.server.listen(0, "127.0.0.1", resolvePromise));
  const { port } = platform.server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    const workspace = await (await fetch(`${base}/api/workspace`)).json();
    assert.equal(workspace.projects.length, 2);
    assert.equal(workspace.onboarding.externalWorkflows, "disabled");
    assert.match(workspace.onboarding.nextCommand, /project onboard/);
    assert.equal(workspace.pilot.sessions.observed, 0);
    const denied = await fetch(`${base}/api/projects/rtb-publishing-core/workflows/research-validate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) });
    assert.equal(denied.status, 403);
    const unconfirmed = await fetch(`${base}/api/projects/rtb-publishing-core/workflows/research-validate`, { method: "POST", headers: { "content-type": "application/json", "x-rtb-publishing-csrf": "test-csrf" }, body: JSON.stringify({ confirm: false }) });
    assert.equal(unconfirmed.status, 400);
    const accepted = await fetch(`${base}/api/projects/rtb-publishing-core/workflows/research-validate`, { method: "POST", headers: { "content-type": "application/json", "x-rtb-publishing-csrf": "test-csrf" }, body: JSON.stringify({ confirm: true }) });
    assert.equal(accepted.status, 202);
    assert.match((await accepted.json()).id, /^JOB-/);
  } finally { await new Promise((resolvePromise) => platform.server.close(resolvePromise)); rmSync(directory, { recursive: true, force: true }); }
});

test("browser shell exposes onboarding and recovery affordances with security headers", async () => {
  const platform = createPlatformServer({ csrfToken: "browser-csrf", localFile: isolatedLocalFile });
  await new Promise((resolvePromise) => platform.server.listen(0, "127.0.0.1", resolvePromise));
  const { port } = platform.server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const html = await response.text();
    assert.match(html, /id="open-onboarding"/);
    assert.match(html, /id="notice"/);
    assert.match(html, /Guided local import/);
    assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
    const app = await (await fetch(`http://127.0.0.1:${port}/app.js`)).text();
    assert.match(app, /job-progress/);
    assert.match(app, /recoveryHint/);
  } finally { await new Promise((resolvePromise) => platform.server.close(resolvePromise)); }
});

test("platform refuses non-loopback hosts", async () => {
  await assert.rejects(() => startPlatform({ host: "0.0.0.0", port: 0 }), /local-only/);
});
